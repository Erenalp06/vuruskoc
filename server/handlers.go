package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type API struct {
	cfg    Config
	store  *Store
	worker *Worker
}

func (a *API) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/videos", a.uploadVideo)
	mux.HandleFunc("GET /api/videos/{id}", a.getVideo)
	mux.HandleFunc("GET /api/videos/{id}/stream", a.streamOriginal)
	mux.HandleFunc("POST /api/analyses", a.createAnalysis)
	mux.HandleFunc("GET /api/analyses", a.listAnalyses)
	mux.HandleFunc("GET /api/analyses/{id}", a.getAnalysis)
	mux.HandleFunc("DELETE /api/analyses/{id}", a.deleteAnalysis)
	mux.HandleFunc("GET /api/analyses/{id}/annotated", a.streamAnnotated)
	mux.HandleFunc("GET /api/reference/{stroke}/{metric}", a.reference)
	mux.HandleFunc("GET /api/pros", a.listPros)
	mux.HandleFunc("GET /api/analyses/{id}/overlay/{pro}", a.overlay)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	a.mountSPA(mux)
	return withCORS(mux)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func badRequest(w http.ResponseWriter, msg string) { writeJSON(w, 400, map[string]string{"error": msg}) }

const maxUpload = 1 << 30 // 1 GiB

func (a *API) uploadVideo(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		badRequest(w, "parse multipart: "+err.Error())
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		badRequest(w, "missing 'file'")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(hdr.Filename))
	if ext == "" {
		ext = ".mp4"
	}
	v := &Video{OriginalName: hdr.Filename, SizeBytes: hdr.Size}
	if err := a.store.createVideo(r.Context(), v); err != nil {
		writeJSON(w, 500, map[string]string{"error": "db: " + err.Error()})
		return
	}
	dst := filepath.Join(a.cfg.StorageDir, "originals", v.ID+ext)
	out, err := os.Create(dst)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "store: " + err.Error()})
		return
	}
	if _, err := io.Copy(out, file); err != nil {
		out.Close()
		writeJSON(w, 500, map[string]string{"error": "write: " + err.Error()})
		return
	}
	out.Close()

	pi, err := ffprobe(r.Context(), dst)
	if err != nil {
		log.Printf("ffprobe %s: %v", v.ID, err)
	}
	v.Path, v.DurationSec, v.Width, v.Height, v.FPS = dst, pi.DurationSec, pi.Width, pi.Height, pi.FPS
	if _, err := a.store.pool.Exec(r.Context(),
		`update videos set path=$2, duration_sec=$3, width=$4, height=$5, fps=$6 where id=$1`,
		v.ID, v.Path, v.DurationSec, v.Width, v.Height, v.FPS); err != nil {
		writeJSON(w, 500, map[string]string{"error": "db: " + err.Error()})
		return
	}
	writeJSON(w, 201, v)
}

func (a *API) getVideo(w http.ResponseWriter, r *http.Request) {
	v, err := a.store.getVideo(r.Context(), r.PathValue("id"))
	if err != nil {
		http.Error(w, "not found", 404)
		return
	}
	writeJSON(w, 200, v)
}

func (a *API) streamOriginal(w http.ResponseWriter, r *http.Request) {
	v, err := a.store.getVideo(r.Context(), r.PathValue("id"))
	if err != nil {
		http.Error(w, "not found", 404)
		return
	}
	serveFile(w, r, v.Path)
}

type createAnalysisReq struct {
	VideoID  string   `json:"video_id"`
	StartSec float64  `json:"start_sec"`
	EndSec   float64  `json:"end_sec"`
	Hand     string   `json:"hand"`
	Stroke   string   `json:"stroke"`
	Lang     string   `json:"lang"`
}

func oneOf(v, def string, allowed ...string) string {
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return def
}

func (a *API) createAnalysis(w http.ResponseWriter, r *http.Request) {
	var req createAnalysisReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "bad json")
		return
	}
	v, err := a.store.getVideo(r.Context(), req.VideoID)
	if err != nil {
		badRequest(w, "unknown video_id")
		return
	}
	if req.EndSec <= 0 || req.EndSec > v.DurationSec+0.5 {
		req.EndSec = v.DurationSec
	}
	if req.StartSec < 0 {
		req.StartSec = 0
	}
	if req.EndSec-req.StartSec < 0.3 {
		badRequest(w, "clip too short (min 0.3s)")
		return
	}
	if req.EndSec-req.StartSec > 30 {
		badRequest(w, "clip too long (max 30s) — tighten the trim")
		return
	}
	an := &Analysis{
		VideoID:  req.VideoID,
		StartSec: req.StartSec,
		EndSec:   req.EndSec,
		Hand:     oneOf(req.Hand, "right", "right", "left"),
		Stroke:   oneOf(req.Stroke, "auto", "auto", "forehand", "backhand", "serve"),
		Lang:     oneOf(req.Lang, "tr", "tr", "en"),
	}
	if err := a.store.createAnalysis(r.Context(), an); err != nil {
		writeJSON(w, 500, map[string]string{"error": "db: " + err.Error()})
		return
	}
	a.worker.notify()
	writeJSON(w, 201, an)
}

func (a *API) listAnalyses(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 200 {
		limit = n
	}
	rows, err := a.store.listAnalyses(r.Context(), limit)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"analyses": rows})
}

func (a *API) getAnalysis(w http.ResponseWriter, r *http.Request) {
	an, err := a.store.getAnalysis(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "not found", 404)
			return
		}
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, an)
}

func (a *API) deleteAnalysis(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	an, err := a.store.getAnalysis(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", 404)
		return
	}
	if _, err := a.store.pool.Exec(r.Context(), `delete from analyses where id=$1`, id); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	for _, p := range []string{
		filepath.Join(a.cfg.StorageDir, "clips", id+".mp4"),
		filepath.Join(a.cfg.StorageDir, "clips", id+".mp4.kpts.json"),
		filepath.Join(a.cfg.StorageDir, "annotated", id+".mp4"),
	} {
		_ = os.Remove(p)
	}
	if an.ClipPath != nil {
		matches, _ := filepath.Glob(filepath.Join(a.cfg.StorageDir, "overlay", id+"_*.mp4"))
		for _, m := range matches {
			_ = os.Remove(m)
		}
	}
	w.WriteHeader(204)
}

func (a *API) streamAnnotated(w http.ResponseWriter, r *http.Request) {
	an, err := a.store.getAnalysis(r.Context(), r.PathValue("id"))
	if err != nil || an.AnnotatedPath == nil {
		http.Error(w, "not ready", 404)
		return
	}
	serveFile(w, r, *an.AnnotatedPath)
}

func serveFile(w http.ResponseWriter, r *http.Request, path string) {
	f, err := os.Open(path)
	if err != nil {
		http.Error(w, "not found", 404)
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		http.Error(w, "stat", 500)
		return
	}
	http.ServeContent(w, r, filepath.Base(path), fi.ModTime(), f)
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func (a *API) mountSPA(mux *http.ServeMux) {
	dir := a.cfg.WebDir
	if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
		mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, 200, map[string]string{
				"service": "swingforge", "note": "SPA not built yet — run `npm --prefix web run build`",
			})
		})
		return
	}
	fs := http.FileServer(http.Dir(dir))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			if _, err := os.Stat(filepath.Join(dir, filepath.Clean(r.URL.Path))); err == nil {
				fs.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, filepath.Join(dir, "index.html")) // SPA fallback
	})
	_ = time.Now
}
