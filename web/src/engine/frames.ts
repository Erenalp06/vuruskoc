// Decode a [start,end] slice of a video into downscaled canvas frames — no upload,
// no ffmpeg. Seeks the <video> element frame by frame and draws to a canvas.

export type Frame = { canvas: HTMLCanvasElement; t: number };

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const done = () => { v.removeEventListener("seeked", done); res(); };
    v.addEventListener("seeked", done);
    v.currentTime = Math.min(Math.max(t, 0), (v.duration || t) - 0.001);
  });
}

export async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const v = document.createElement("video");
  v.src = url;
  v.muted = true;
  v.crossOrigin = "anonymous";
  v.preload = "auto";
  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () =>
      rej(new Error(
        "Bu video tarayıcıda açılamadı. Desteklenen formatlar: MP4 / MOV / WebM (H.264 en uyumlu). " +
        "AVI, MKV, WMV gibi formatlar tarayıcıda oynatılamaz — telefonla çekilen video genelde sorunsuz çalışır."
      ));
  });
  return v;
}

export async function extractFrames(
  url: string,
  start: number,
  end: number,
  opts: { fps?: number; longSide?: number; maxFrames?: number; onProgress?: (p: number) => void } = {}
): Promise<{ frames: Frame[]; w: number; h: number; fps: number }> {
  const { fps = 30, longSide = 720, maxFrames = 320, onProgress } = opts;
  const v = await loadVideo(url);
  const vw = v.videoWidth || 640;
  const vh = v.videoHeight || 480;
  const scale = Math.min(1, longSide / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);

  const span = Math.max(0.2, end - start);
  const n = Math.min(maxFrames, Math.max(4, Math.round(span * fps)));
  const step = span / n;

  const frames: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const t = start + i * step;
    await seek(v, t);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, w, h);
    frames.push({ canvas: c, t });
    onProgress?.((i + 1) / n);
  }
  v.src = "";
  return { frames, w, h, fps };
}
