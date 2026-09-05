package main

import (
	"os"
	"path/filepath"
)

type Config struct {
	Addr        string
	DatabaseURL string
	RepoDir     string // repo root, so we can run `python -m analyzer.run`
	StorageDir  string
	PythonBin   string
	WebDir      string // built SPA (web/dist); optional
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func loadConfig() Config {
	repo := envOr("SWINGFORGE_REPO", "..")
	abs, _ := filepath.Abs(repo)
	return Config{
		Addr:        envOr("SWINGFORGE_ADDR", ":8080"),
		DatabaseURL: envOr("DATABASE_URL", "postgres://swingforge:swingforge_dev@127.0.0.1:5432/swingforge"),
		RepoDir:     abs,
		StorageDir:  envOr("SWINGFORGE_STORAGE", filepath.Join(abs, "storage")),
		PythonBin:   envOr("SWINGFORGE_PYTHON", filepath.Join(abs, "venv", "bin", "python")),
		WebDir:      envOr("SWINGFORGE_WEBDIR", filepath.Join(abs, "web", "dist")),
	}
}
