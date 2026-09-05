create table if not exists videos (
    id            uuid primary key default gen_random_uuid(),
    original_name text not null,
    path          text not null,
    duration_sec  double precision,
    width         int,
    height        int,
    fps           double precision,
    size_bytes    bigint,
    created_at    timestamptz not null default now()
);

create table if not exists analyses (
    id              uuid primary key default gen_random_uuid(),
    video_id        uuid not null references videos(id) on delete cascade,
    start_sec       double precision not null default 0,
    end_sec         double precision not null,
    hand            text not null default 'right',
    stroke          text not null default 'auto',
    lang            text not null default 'tr',
    status          text not null default 'pending',
    error           text,
    clip_path       text,
    annotated_path  text,
    swing_score     double precision,
    stroke_detected text,
    contact_frame   int,
    result          jsonb,
    created_at      timestamptz not null default now(),
    finished_at     timestamptz
);

create index if not exists analyses_created_idx on analyses (created_at desc);
create index if not exists analyses_status_idx  on analyses (status);
