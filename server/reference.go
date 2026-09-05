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

var refMetrics = map[string]bool{
	"racket_lag": true, "shoulder_angle": true, "knee_angle": true,
	"elbow_angle": true, "hip_rotation": true,
}
var refStrokes = map[string]bool{"forehand": true, "backhand": true, "serve": true}

var refLocks sync.Map // key -> *sync.Mutex, so concurrent requests render once

func (a *API) reference(w http.ResponseWriter, r *http.Request) {
	stroke, metric := r.PathValue("stroke"), r.PathValue("metric")
	if !refStrokes[stroke] || !refMetrics[metric] {
		http.Error(w, "unknown reference", 404)
		return
	}
	// serve has no keypoint sequence — reuse the forehand illustration
	renderStroke := stroke
	if stroke == "serve" {
		renderStroke = "forehand"
	}
	path := filepath.Join(a.cfg.StorageDir, "reference", renderStroke+"_"+metric+".mp4")

	if _, err := os.Stat(path); err != nil {
		key := renderStroke + "_" + metric
		mu, _ := refLocks.LoadOrStore(key, &sync.Mutex{})
		m := mu.(*sync.Mutex)
		m.Lock()
		defer m.Unlock()
		if _, err := os.Stat(path); err != nil { // still missing after acquiring lock
			if err := renderReference(r.Context(), a.cfg, renderStroke, metric, path); err != nil {
				http.Error(w, "render failed: "+err.Error(), 500)
				return
			}
		}
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	serveFile(w, r, path)
}

func renderReference(ctx context.Context, cfg Config, stroke, metric, out string) error {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, cfg.PythonBin, "-m", "analyzer.reference", stroke, metric, out)
	cmd.Dir = cfg.RepoDir
	return cmd.Run()
}
