export type Video = {
  id: string;
  original_name: string;
  duration_sec: number;
  width: number;
  height: number;
  fps: number;
  size_bytes: number;
  created_at: string;
};

export type Correction = {
  metric: string;
  name: string;
  headline: string;
  why: string;
  phase: "contact" | "loading";
  value: number;
  ideal: [number, number];
  target_dir: "up" | "down";
  score: number;
  direction: "low" | "high";
  drill: string;
};

export type AnalyzerResult = {
  ok: boolean;
  fps: number;
  n_frames: number;
  pose_detect_rate: number;
  stroke: string;
  stroke_forced: boolean;
  contact_frame: number;
  contact_time_sec: number;
  follow_through_complete: boolean;
  angles: Record<string, number>;
  contact_angles: Record<string, number>;
  loading_angles: Record<string, number>;
  scores: Record<string, number>;
  swing_score: number | null;
  corrections: Correction[];
  report: string;
  injury_warnings: string[];
  phase_counts: Record<string, number>;
  lang: string;
  hand: string;
};

export type Analysis = {
  id: string;
  video_id: string;
  start_sec: number;
  end_sec: number;
  hand: string;
  stroke: string;
  lang: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
  swing_score?: number;
  stroke_detected?: string;
  contact_frame?: number;
  result?: AnalyzerResult;
  original_name?: string;
  created_at: string;
  finished_at?: string;
};

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`${r.status}: ${body}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  uploadVideo(file: File, onProgress?: (pct: number) => void): Promise<Video> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/videos");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve(JSON.parse(xhr.responseText))
          : reject(new Error(`${xhr.status}: ${xhr.responseText}`));
      xhr.onerror = () => reject(new Error("upload failed"));
      xhr.send(fd);
    });
  },

  createAnalysis(body: {
    video_id: string;
    start_sec: number;
    end_sec: number;
    hand: string;
    stroke: string;
    lang: string;
  }): Promise<Analysis> {
    return fetch("/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<Analysis>);
  },

  getAnalysis: (id: string) => fetch(`/api/analyses/${id}`).then(j<Analysis>),
  listAnalyses: () =>
    fetch("/api/analyses?limit=100").then(j<{ analyses: Analysis[] }>).then((d) => d.analyses ?? []),
  deleteAnalysis: (id: string) =>
    fetch(`/api/analyses/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok && r.status !== 204) throw new Error(`${r.status}`);
    }),

  listPros: () =>
    fetch("/api/pros").then(j<{ pros: { key: string; label: string }[] }>).then((d) => d.pros ?? []),

  videoStreamURL: (id: string) => `/api/videos/${id}/stream`,
  annotatedURL: (id: string) => `/api/analyses/${id}/annotated`,
  referenceURL: (stroke: string, metric: string) => `/api/reference/${stroke}/${metric}`,
  overlayURL: (id: string, pro: string) => `/api/analyses/${id}/overlay/${pro}`,
};
