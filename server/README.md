# SwingForge backend + web

Upload a video → trim one swing in the browser → queued analysis → stored history.

```
web/ (Vite React SPA)  ──/api──▶  server/ (Go)  ──trim──▶  analyzer/run.py (reuses core/)
                                     │                          │
                                     └──── Postgres ◀───────────┘   (scores, report, angle JSON)
```

## Run (dev)

```bash
# 1. Postgres role + db (once)
sudo -u postgres psql -c "create role swingforge login password 'swingforge_dev'"
sudo -u postgres psql -c "create database swingforge owner swingforge"

# 2. Python deps (once) — same venv the pipeline uses
python -m venv venv && ./venv/bin/pip install -r requirements.txt

# 3. build the SPA
npm --prefix web install && npm --prefix web run build

# 4. run the API (serves web/dist, runs the worker)
cd server && go run .
# -> http://<host>:8899
```

Frontend hacking with hot reload: `npm --prefix web run dev` (proxies /api to :8899).

## Config (env)

| var | default |
|-----|---------|
| `SWINGFORGE_ADDR` | `:8080` |
| `DATABASE_URL` | `postgres://swingforge:swingforge_dev@127.0.0.1:5432/swingforge` |
| `SWINGFORGE_REPO` | `..` (repo root — needs `venv/` and `analyzer/`) |
| `SWINGFORGE_STORAGE` | `<repo>/storage` |
| `SWINGFORGE_PYTHON` | `<repo>/venv/bin/python` |
| `SWINGFORGE_WEBDIR` | `<repo>/web/dist` |

## API

| method | path | body / notes |
|--------|------|--------------|
| POST | `/api/videos` | multipart `file` → `{id,duration_sec,width,height,fps,…}` |
| GET | `/api/videos/{id}/stream` | range-enabled original (trim preview) |
| POST | `/api/analyses` | `{video_id,start_sec,end_sec,hand,stroke,lang}` → `{id,status:"pending"}` |
| GET | `/api/analyses` | `?limit=` — history, newest first |
| GET | `/api/analyses/{id}` | detail; `result` filled once `status:"done"` |
| GET | `/api/analyses/{id}/annotated` | range-enabled annotated mp4 |

`hand ∈ {right,left}`, `stroke ∈ {auto,forehand,backhand,serve}`, `lang ∈ {tr,en}`.
Clip length is clamped to 0.3–30 s.

## Worker

A goroutine drains `analyses` rows in `pending`: `ffmpeg` trims + downscales to 1280/30fps,
then `python -m analyzer.run clip.mp4 --out-video …` produces the JSON + annotated video.
`running` rows are re-queued on startup. `for update skip locked` makes it safe to run
more than one server against the same DB.
