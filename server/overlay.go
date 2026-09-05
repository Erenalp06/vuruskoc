package main

import (
	"context"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// pros with a usable keypoint_sequence (mirrors modules/pro_overlay.GHOSTABLE_PROS)
var ghostPros = map[string]string{
	"djokovic_forehand": "Djokovic — Forehand",
	"djokovic_backhand": "Djokovic — Backhand",
	"sinner_forehand":   "Sinner — Forehand",
	"pro_forehand_1":    "Referans Forehand",
}

var overlayLocks sync.Map

func (a *API) listPros(w http.ResponseWriter, r *http.Request) {
	out := make([]map[string]string, 0, len(ghostPros))
	for k, label := range ghostPros {
		out = append(out, map[string]string{"key": k, "label": label})
	}
	writeJSON(w, 200, map[string]any{"pros": out})
}

func (a *API) overlay(w http.ResponseWriter, r *http.Request) {
	id, pro := r.PathValue("id"), r.PathValue("pro")
	if _, ok := ghostPros[pro]; !ok {
		http.Error(w, "unknown pro", 404)
		return
	}
	an, err := a.store.getAnalysis(r.Context(), id)
	if err != nil || an.ClipPath == nil {
		http.Error(w, "analysis not ready", 404)
		return
	}
	out := filepath.Join(a.cfg.StorageDir, "overlay", id+"_"+pro+".mp4")

	if _, err := os.Stat(out); err != nil {
		key := id + "_" + pro
		mu, _ := overlayLocks.LoadOrStore(key, &sync.Mutex{})
		m := mu.(*sync.Mutex)
		m.Lock()
		defer m.Unlock()
		if _, err := os.Stat(out); err != nil {
			if err := a.renderOverlay(r.Context(), *an.ClipPath, pro, out); err != nil {
				http.Error(w, "overlay render failed: "+err.Error(), 500)
				return
			}
		}
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	serveFile(w, r, out)
}

func (a *API) renderOverlay(ctx context.Context, clip, pro, out string) error {
	ctx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	args := []string{"-m", "analyzer.compare", clip, pro, out}
	if kp := clip + ".kpts.json"; fileExists(kp) {
		args = append(args, "--kpts", kp)
	}
	cmd := exec.CommandContext(ctx, a.cfg.PythonBin, args...)
	cmd.Dir = a.cfg.RepoDir
	return cmd.Run()
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
