package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("swingforge ")
	cfg := loadConfig()

	for _, d := range []string{"originals", "clips", "annotated", "reference", "overlay"} {
		if err := os.MkdirAll(filepath.Join(cfg.StorageDir, d), 0o755); err != nil {
			log.Fatalf("mkdir storage: %v", err)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store, err := openStore(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	if err := store.migrate(ctx); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	worker := newWorker(cfg, store)
	go worker.run(ctx)

	api := &API{cfg: cfg, store: store, worker: worker}
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("listening on %s  (repo=%s python=%s)", cfg.Addr, cfg.RepoDir, cfg.PythonBin)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("serve: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(sctx)
	store.pool.Close()
}
