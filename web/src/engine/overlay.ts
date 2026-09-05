// On-device video renderers: annotated skeleton clip + pro ghost overlay.
// Canvas -> webm via MediaRecorder. Returns null if recording isn't supported.
import { SKELETON, type Keypoints } from "./landmarks";
import type { Frame } from "./frames";
import type { Phase, Side } from "./swing";

function pickMime(): string | null {
  const cands = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  for (const m of cands) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  return null;
}

async function record(canvas: HTMLCanvasElement, fps: number, draw: (i: number) => boolean): Promise<Blob | null> {
  const mime = pickMime();
  if (!mime) return null;
  // captureStream(0): the recorder samples the canvas only when we call
  // requestFrame(), so every drawn frame lands exactly once — no dropped/
  // duplicated frames from setTimeout jitter -> smooth playback.
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: mime }))));
  rec.start();

  const frameMs = 1000 / fps;
  await new Promise<void>((res) => {
    let i = 0;
    let last = performance.now();
    const tick = () => {
      const more = draw(i++);
      track.requestFrame?.();
      if (!more) { setTimeout(() => rec.stop(), 200); res(); return; }
      // pace with rAF (smoother than setTimeout); advance ~one frame per frameMs
      const step = () => {
        if (performance.now() - last >= frameMs) { last += frameMs; tick(); }
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    tick();
  });
  return done;
}

function drawSkeleton(ctx: CanvasRenderingContext2D, kp: Keypoints, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  for (const [a, b] of SKELETON) {
    const pa = kp[a], pb = kp[b];
    if (!pa || !pb) continue;
    if ((pa[3] ?? 1) < 0.4 || (pb[3] ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
  }
  for (const p of Object.values(kp)) {
    if ((p[3] ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.arc(p[0], p[1], lw + 1.5, 0, 7);
    ctx.fill();
  }
}

/** Skeleton + phase label on the real frames. */
export async function renderAnnotated(
  frames: Frame[], keypoints: (Keypoints | null)[], phases: Phase[], contactIdx: number, velocities: number[]
): Promise<Blob | null> {
  if (!frames.length) return null;
  const sw = frames[0].canvas.width, sh = frames[0].canvas.height;
  // cap the encode/playback size — 640px keeps the skeleton clear but is ~2x
  // lighter to encode and decode than 720–1280.
  const scale = Math.min(1, 640 / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const kscale = w / sw;
  return record(c, 24, (i) => {
    if (i >= frames.length) return false;
    ctx.drawImage(frames[i].canvas, 0, 0, w, h);
    const kp = keypoints[i];
    if (kp) {
      const sk: Keypoints = {} as Keypoints;
      for (const [n, v] of Object.entries(kp)) sk[n] = [v[0] * kscale, v[1] * kscale, v[2], v[3]];
      drawSkeleton(ctx, sk, "#4ade78", Math.max(2, w / 320));
    }
    ctx.font = `${Math.round(w / 30)}px system-ui`;
    ctx.fillStyle = "#ffee00";
    ctx.fillText(`${phases[i] ?? "idle"}  v=${(velocities[i] ?? 0).toFixed(0)}`, 10, 24);
    if (i === contactIdx) { ctx.fillStyle = "#ff3b3b"; ctx.fillText("TEMAS", 10, 48); }
    return true;
  });
}

// ── pro ghost overlay (skeleton-on-dark, time-warped, mirrors modules/pro_overlay.py) ──

const PRO_JOINTS = ["nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip", "left_knee", "right_knee",
  "left_ankle", "right_ankle"];

export const GHOST_PROS: Record<string, string> = {
  djokovic_forehand: "Djokovic — Forehand",
  djokovic_backhand: "Djokovic — Backhand",
  sinner_forehand: "Sinner — Forehand",
};

async function loadPro(key: string) {
  const mod =
    key === "djokovic_backhand" ? await import("./pros/djokovic_backhand.json")
    : key === "sinner_forehand" ? await import("./pros/sinner_forehand.json")
    : await import("./pros/djokovic_forehand.json");
  const d: any = (mod as any).default ?? mod;
  const seq: (Record<string, [number, number]> | null)[] = (d.keypoint_sequence as any[]).map((fr) =>
    fr ? Object.fromEntries(Object.entries(fr).filter(([k]) => PRO_JOINTS.includes(k)).map(([k, v]: any) => [k, [v.x, v.y]])) : {}
  );
  return { name: d.player as string, hand: (d.hand as Side) || "right", fps: Number(d.fps) || 30, contact: Number(d.contact_frame) || Math.floor(seq.length / 2), seq };
}

function centerScale(kp: Record<string, [number, number]>) {
  const g = (n: string) => kp[n];
  if (!g("left_shoulder") || !g("right_shoulder") || !g("left_hip") || !g("right_hip")) return null;
  const shMid: [number, number] = [(g("left_shoulder")[0] + g("right_shoulder")[0]) / 2, (g("left_shoulder")[1] + g("right_shoulder")[1]) / 2];
  const hipMid: [number, number] = [(g("left_hip")[0] + g("right_hip")[0]) / 2, (g("left_hip")[1] + g("right_hip")[1]) / 2];
  const torso = Math.max(Math.hypot(shMid[0] - hipMid[0], shMid[1] - hipMid[1]), 1);
  return { hipMid, torso };
}

export async function renderProOverlay(
  userKp: (Keypoints | null)[], contactIdx: number, side: Side, proKey: string,
  w = 720, h = 480, bgFrames?: Frame[]
): Promise<Blob | null> {
  const pro = await loadPro(proKey);
  const uk = userKp[contactIdx];
  if (!uk) return null;
  const uc = centerScale(Object.fromEntries(Object.entries(uk).map(([k, v]) => [k, [v[0], v[1]]])) as any);
  const pcs = centerScale(pro.seq[pro.contact] || {});
  if (!uc || !pcs) return null;

  const scale = uc.torso / pcs.torso;
  const mirror = pro.hand !== side ? -1 : 1;
  const toUser = (pt: [number, number]): [number, number] => [
    (pt[0] - pcs.hipMid[0]) * scale * mirror + uc.hipMid[0],
    (pt[1] - pcs.hipMid[1]) * scale + uc.hipMid[1],
  ];

  const n = userKp.length;
  const lo = 0, hi = n - 1;
  const pN = pro.seq.length, pc = pro.contact;
  const pLo = Math.max(0, pc - Math.round(1.3 * pro.fps));
  const pHi = Math.min(pN - 1, pc + Math.round(1.1 * pro.fps));
  const ucw = Math.max(lo + 1, Math.min(hi - 1, contactIdx));
  const proIndex = (ui: number) => {
    let pi = ui <= ucw
      ? pLo + ((ui - lo) / Math.max(1, ucw - lo)) * (pc - pLo)
      : pc + ((ui - ucw) / Math.max(1, hi - ucw)) * (pHi - pc);
    pi = Math.round(pi);
    for (const d of [0, 1, -1, 2, -2, 3, -3]) {
      const j = pi + d;
      if (j >= 0 && j < pN && Object.keys(pro.seq[j] || {}).length >= 8) return j;
    }
    return Math.max(0, Math.min(pN - 1, pi));
  };

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;

  return record(c, 20, (k) => {
    const ui = lo + k;
    if (ui > hi) return false;
    const bg = bgFrames?.[ui]?.canvas;
    if (bg) {
      ctx.drawImage(bg, 0, 0, w, h);
      ctx.fillStyle = "rgba(6,8,13,0.64)";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "#0b1018";
      ctx.fillRect(0, 0, w, h);
    }

    const pi = proIndex(ui);
    const pf = pro.seq[pi];
    if (pf && Object.keys(pf).length) {
      const ghost: Keypoints = {} as any;
      for (const [name, pt] of Object.entries(pf)) {
        const [x, y] = toUser(pt);
        ghost[name] = [x, y, 0, 1];
      }
      drawSkeleton(ctx, ghost, "#00c8ff", 6);
    }
    const ukf = userKp[ui];
    if (ukf) drawSkeleton(ctx, ukf, "#4dff8c", 4);

    ctx.fillStyle = "#12100a";
    ctx.fillRect(0, 0, w, 30);
    ctx.font = "600 15px system-ui";
    ctx.fillStyle = "#7cff9a"; ctx.fillText("SEN", 12, 21);
    ctx.fillStyle = "#00c8ff";
    const t = pro.name.toUpperCase();
    ctx.fillText(t, w - ctx.measureText(t).width - 12, 21);
    if (Math.abs(ui - ucw) <= 1) { ctx.fillStyle = "#fff"; ctx.fillText("TEMAS", w / 2 - 26, 21); }
    return true;
  });
}

export const drillURL = (stroke: string, metric: string) =>
  `/drills/${stroke === "serve" ? "forehand" : stroke}_${metric}.mp4`;
