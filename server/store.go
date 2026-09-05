package main

import (
	"context"
	"embed"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

type Store struct{ pool *pgxpool.Pool }

func openStore(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) migrate(ctx context.Context) error {
	b, err := migrationFS.ReadFile("migrations/001_init.sql")
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, string(b))
	return err
}

type Video struct {
	ID           string    `json:"id"`
	OriginalName string    `json:"original_name"`
	Path         string    `json:"-"`
	DurationSec  float64   `json:"duration_sec"`
	Width        int       `json:"width"`
	Height       int       `json:"height"`
	FPS          float64   `json:"fps"`
	SizeBytes    int64     `json:"size_bytes"`
	CreatedAt    time.Time `json:"created_at"`
}

func (s *Store) createVideo(ctx context.Context, v *Video) error {
	return s.pool.QueryRow(ctx, `
		insert into videos (original_name, path, duration_sec, width, height, fps, size_bytes)
		values ($1,$2,$3,$4,$5,$6,$7) returning id, created_at`,
		v.OriginalName, v.Path, v.DurationSec, v.Width, v.Height, v.FPS, v.SizeBytes,
	).Scan(&v.ID, &v.CreatedAt)
}

func (s *Store) getVideo(ctx context.Context, id string) (*Video, error) {
	v := &Video{}
	err := s.pool.QueryRow(ctx, `
		select id, original_name, path, coalesce(duration_sec,0), coalesce(width,0),
		       coalesce(height,0), coalesce(fps,0), coalesce(size_bytes,0), created_at
		from videos where id=$1`, id,
	).Scan(&v.ID, &v.OriginalName, &v.Path, &v.DurationSec, &v.Width, &v.Height,
		&v.FPS, &v.SizeBytes, &v.CreatedAt)
	if err != nil {
		return nil, err
	}
	return v, nil
}

type Analysis struct {
	ID             string          `json:"id"`
	VideoID        string          `json:"video_id"`
	StartSec       float64         `json:"start_sec"`
	EndSec         float64         `json:"end_sec"`
	Hand           string          `json:"hand"`
	Stroke         string          `json:"stroke"`
	Lang           string          `json:"lang"`
	Status         string          `json:"status"`
	Error          *string         `json:"error,omitempty"`
	ClipPath       *string         `json:"-"`
	AnnotatedPath  *string         `json:"-"`
	SwingScore     *float64        `json:"swing_score,omitempty"`
	StrokeDetected *string         `json:"stroke_detected,omitempty"`
	ContactFrame   *int            `json:"contact_frame,omitempty"`
	Result         json.RawMessage `json:"result,omitempty"`
	OriginalName   string          `json:"original_name,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	FinishedAt     *time.Time      `json:"finished_at,omitempty"`
}

func (s *Store) createAnalysis(ctx context.Context, a *Analysis) error {
	return s.pool.QueryRow(ctx, `
		insert into analyses (video_id, start_sec, end_sec, hand, stroke, lang)
		values ($1,$2,$3,$4,$5,$6) returning id, status, created_at`,
		a.VideoID, a.StartSec, a.EndSec, a.Hand, a.Stroke, a.Lang,
	).Scan(&a.ID, &a.Status, &a.CreatedAt)
}

const analysisCols = `a.id, a.video_id, a.start_sec, a.end_sec, a.hand, a.stroke, a.lang,
	a.status, a.error, a.clip_path, a.annotated_path, a.swing_score, a.stroke_detected,
	a.contact_frame, a.result, a.created_at, a.finished_at, coalesce(v.original_name,'')`

func scanAnalysis(row interface {
	Scan(dest ...any) error
}) (*Analysis, error) {
	a := &Analysis{}
	err := row.Scan(&a.ID, &a.VideoID, &a.StartSec, &a.EndSec, &a.Hand, &a.Stroke, &a.Lang,
		&a.Status, &a.Error, &a.ClipPath, &a.AnnotatedPath, &a.SwingScore, &a.StrokeDetected,
		&a.ContactFrame, &a.Result, &a.CreatedAt, &a.FinishedAt, &a.OriginalName)
	if err != nil {
		return nil, err
	}
	return a, nil
}

func (s *Store) getAnalysis(ctx context.Context, id string) (*Analysis, error) {
	return scanAnalysis(s.pool.QueryRow(ctx,
		`select `+analysisCols+` from analyses a join videos v on v.id=a.video_id where a.id=$1`, id))
}

func (s *Store) listAnalyses(ctx context.Context, limit int) ([]*Analysis, error) {
	rows, err := s.pool.Query(ctx,
		`select `+analysisCols+` from analyses a join videos v on v.id=a.video_id
		 order by a.created_at desc limit $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Analysis
	for rows.Next() {
		a, err := scanAnalysis(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) claimNextJob(ctx context.Context) (*Analysis, error) {
	// atomically grab one pending row
	return scanAnalysis(s.pool.QueryRow(ctx, `
		with j as (
			select id from analyses where status='pending'
			order by created_at limit 1 for update skip locked
		)
		update analyses set status='running' where id in (select id from j)
		returning `+analysisColsBare))
}

// same as analysisCols but without the join alias / original_name tail
const analysisColsBare = `id, video_id, start_sec, end_sec, hand, stroke, lang, status, error,
	clip_path, annotated_path, swing_score, stroke_detected, contact_frame, result,
	created_at, finished_at, ''::text`

func (s *Store) finishJob(ctx context.Context, id string, clip, annotated string,
	res json.RawMessage, score *float64, stroke *string, contact *int) error {
	_, err := s.pool.Exec(ctx, `
		update analyses set status='done', clip_path=$2, annotated_path=$3, result=$4,
			swing_score=$5, stroke_detected=$6, contact_frame=$7, finished_at=now(), error=null
		where id=$1`, id, clip, annotated, res, score, stroke, contact)
	return err
}

func (s *Store) failJob(ctx context.Context, id, msg string) error {
	_, err := s.pool.Exec(ctx,
		`update analyses set status='error', error=$2, finished_at=now() where id=$1`, id, msg)
	return err
}

func (s *Store) requeueStuck(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `update analyses set status='pending' where status='running'`)
	return err
}
