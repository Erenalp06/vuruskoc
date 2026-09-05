package main

import (
	"context"
	"encoding/json"
	"log"
	"os/exec"
	"path/filepath"
	"time"
)

type Worker struct {
	cfg   Config
	store *Store
	wake  chan struct{}
}

func newWorker(cfg Config, store *Store) *Worker {
	return &Worker{cfg: cfg, store: store, wake: make(chan struct{}, 1)}
}

func (w *Worker) notify() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *Worker) run(ctx context.Context) {
	_ = w.store.requeueStuck(ctx)
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	for {
		w.drain(ctx)
		select {
		case <-ctx.Done():
			return
		case <-w.wake:
		case <-tick.C:
		}
	}
}

func (w *Worker) drain(ctx context.Context) {
	for {
		job, err := w.store.claimNextJob(ctx)
		if err != nil { // no rows -> pgx returns ErrNoRows
			return
		}
		w.process(ctx, job)
	}
}

type analyzerOut struct {
	OK           bool     `json:"ok"`
	Error        string   `json:"error"`
	Stroke       string   `json:"stroke"`
	SwingScore   *float64 `json:"swing_score"`
	ContactFrame *int     `json:"contact_frame"`
}

func (w *Worker) process(ctx context.Context, job *Analysis) {
	log.Printf("job %s: start (video=%s %.2f-%.2fs)", job.ID, job.VideoID, job.StartSec, job.EndSec)
	fail := func(msg string) {
		log.Printf("job %s: error: %s", job.ID, msg)
		_ = w.store.failJob(context.Background(), job.ID, msg)
	}

	video, err := w.store.getVideo(ctx, job.VideoID)
	if err != nil {
		fail("video lookup: " + err.Error())
		return
	}

	clip := filepath.Join(w.cfg.StorageDir, "clips", job.ID+".mp4")
	annotated := filepath.Join(w.cfg.StorageDir, "annotated", job.ID+".mp4")
	kpts := clip + ".kpts.json"

	if err := trimClip(ctx, video.Path, clip, job.StartSec, job.EndSec); err != nil {
		fail(err.Error())
		return
	}

	cctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(cctx, w.cfg.PythonBin, "-m", "analyzer.run", clip,
		"--hand", job.Hand, "--stroke", job.Stroke, "--lang", job.Lang,
		"--out-video", annotated, "--out-kpts", kpts)
	cmd.Dir = w.cfg.RepoDir
	stdout, err := cmd.Output()
	if err != nil {
		msg := err.Error()
		if ee, ok := err.(*exec.ExitError); ok && len(ee.Stderr) > 0 {
			msg += ": " + lastLine(ee.Stderr)
		}
		// analyzer prints a JSON error to stdout on handled failures
		if len(stdout) > 0 {
			var eo analyzerOut
			if json.Unmarshal(stdout, &eo) == nil && eo.Error != "" {
				msg = eo.Error
			}
		}
		fail("analyzer: " + msg)
		return
	}

	var eo analyzerOut
	if err := json.Unmarshal(stdout, &eo); err != nil {
		fail("analyzer output parse: " + err.Error())
		return
	}
	if !eo.OK {
		fail("analyzer: " + eo.Error)
		return
	}

	if err := w.store.finishJob(context.Background(), job.ID, clip, annotated,
		json.RawMessage(stdout), eo.SwingScore, strPtr(eo.Stroke), eo.ContactFrame); err != nil {
		fail("save: " + err.Error())
		return
	}
	log.Printf("job %s: done (score=%v stroke=%s)", job.ID, deref(eo.SwingScore), eo.Stroke)
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
func deref(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}
func lastLine(b []byte) string {
	s := string(b)
	start := 0
	for i := len(s) - 2; i >= 0; i-- {
		if s[i] == '\n' {
			start = i + 1
			break
		}
	}
	return s[start:]
}
