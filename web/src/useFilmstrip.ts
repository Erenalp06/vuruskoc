import { useEffect, useState } from "react";

/** Capture `count` evenly-spaced thumbnail frames from a video URL (client-side). */
export function useFilmstrip(src: string, duration: number, count = 10) {
  const [thumbs, setThumbs] = useState<string[]>([]);

  useEffect(() => {
    if (!src || !duration) return;
    let cancelled = false;
    const v = document.createElement("video");
    v.src = src;
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "auto";
    const canvas = document.createElement("canvas");
    const out: string[] = [];

    const grab = (i: number) => {
      if (cancelled || i >= count) {
        if (!cancelled && out.length) setThumbs([...out]);
        return;
      }
      const t = ((i + 0.5) / count) * duration;
      const onSeeked = () => {
        v.removeEventListener("seeked", onSeeked);
        if (cancelled) return;
        const w = 160;
        const h = Math.round((v.videoHeight / v.videoWidth) * w) || 90;
        canvas.width = w;
        canvas.height = h;
        try {
          canvas.getContext("2d")!.drawImage(v, 0, 0, w, h);
          out.push(canvas.toDataURL("image/jpeg", 0.55));
        } catch {
          /* tainted / not ready — skip */
        }
        if (out.length && out.length % 2 === 0) setThumbs([...out]);
        grab(i + 1);
      };
      v.addEventListener("seeked", onSeeked);
      v.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    };

    const start = () => grab(0);
    if (v.readyState >= 1) start();
    else v.addEventListener("loadedmetadata", start, { once: true });

    return () => {
      cancelled = true;
      v.src = "";
    };
  }, [src, duration, count]);

  return thumbs;
}
