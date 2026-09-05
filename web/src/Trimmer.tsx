import { useCallback, useEffect, useRef, useState } from "react";
import { useFilmstrip } from "./useFilmstrip";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.max(0, s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${r}`;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type Props = {
  src: string;
  duration: number;
  value: { start: number; end: number };
  onChange: (v: { start: number; end: number }) => void;
};

export function Trimmer({ src, duration, value, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playhead, setPlayhead] = useState(value.start);
  const [playing, setPlaying] = useState(false);
  const drag = useRef<null | "start" | "end" | "scrub">(null);
  const loopRef = useRef(false);
  const thumbs = useFilmstrip(src, duration, 12);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setPlayhead(v.currentTime);
      if (loopRef.current && v.currentTime >= value.end) v.currentTime = value.start;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [value.start, value.end]);

  const timeAt = useCallback(
    (clientX: number) => {
      const r = trackRef.current!.getBoundingClientRect();
      return clamp((clientX - r.left) / r.width, 0, 1) * duration;
    },
    [duration]
  );

  const seek = (t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = clamp(t, 0, duration);
    setPlayhead(clamp(t, 0, duration));
  };

  const onPointerDown = (which: "start" | "end" | "scrub") => (e: React.PointerEvent) => {
    if (which !== "scrub") e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = which;
    if (which === "scrub") seek(timeAt(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const t = timeAt(e.clientX);
    if (drag.current === "start") onChange({ start: Math.min(t, value.end - 0.3), end: value.end });
    else if (drag.current === "end") onChange({ start: value.start, end: Math.max(t, value.start + 0.3) });
    else seek(t);
  };
  const endDrag = (e: React.PointerEvent) => {
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const nudge = (which: "start" | "end", d: number) => {
    if (which === "start") onChange({ start: clamp(value.start + d, 0, value.end - 0.3), end: value.end });
    else onChange({ start: value.start, end: clamp(value.end + d, value.start + 0.3, duration) });
  };
  const setHere = (which: "start" | "end") => {
    if (which === "start") onChange({ start: clamp(playhead, 0, value.end - 0.3), end: value.end });
    else onChange({ start: value.start, end: clamp(playhead, value.start + 0.3, duration) });
  };

  const previewClip = () => {
    const v = videoRef.current;
    if (!v) return;
    loopRef.current = true;
    v.currentTime = value.start;
    v.play();
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    loopRef.current = false;
    v.paused ? v.play() : v.pause();
  };

  const sp = (value.start / duration) * 100;
  const ep = (value.end / duration) * 100;
  const pp = (playhead / duration) * 100;

  return (
    <div>
      <video ref={videoRef} src={src} playsInline controls preload="metadata" />

      <div className="tl">
        <div className="tl-scale">
          <span>0:00.0</span>
          <span>{fmt(duration)}</span>
        </div>
        <div
          ref={trackRef}
          className="tl-track"
          onPointerDown={onPointerDown("scrub")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="tl-film">
            {thumbs.map((t, i) => (
              <img key={i} src={t} alt="" draggable={false} />
            ))}
          </div>
          <div className="tl-dim" style={{ left: 0, width: `${sp}%` }} />
          <div className="tl-dim" style={{ right: 0, width: `${100 - ep}%` }} />
          <div className="tl-range" style={{ left: `${sp}%`, width: `${ep - sp}%` }} />
          <div className="tl-playhead" style={{ left: `${pp}%` }} />
          <div
            className="tl-handle"
            style={{ left: `${sp}%` }}
            onPointerDown={onPointerDown("start")}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <i />
          </div>
          <div
            className="tl-handle"
            style={{ left: `${ep}%` }}
            onPointerDown={onPointerDown("end")}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <i />
          </div>
        </div>

        <div className="tl-set">
          <button className="tl-setbtn" onClick={() => setHere("start")}>
            <span className="k">{"{ }"}</span>
            <span className="l">Başlangıcı belirle</span>
            <b>{fmt(value.start)}</b>
          </button>
          <div className="tl-mid">
            <span>Seçili aralık</span>
            <b>{(value.end - value.start).toFixed(1)} sn</b>
            <span className="rng">{fmt(value.start)} – {fmt(value.end)}</span>
          </div>
          <button className="tl-setbtn" onClick={() => setHere("end")}>
            <span className="k">{"{ }"}</span>
            <span className="l">Bitişi belirle</span>
            <b>{fmt(value.end)}</b>
          </button>
        </div>

        <div className="tl-fine">
          <span>ince ayar</span>
          <button className="btn ghost sm" onClick={() => nudge("start", -0.1)}>başl −</button>
          <button className="btn ghost sm" onClick={() => nudge("start", 0.1)}>başl +</button>
          <button className="btn ghost sm" onClick={() => nudge("end", -0.1)}>bitiş −</button>
          <button className="btn ghost sm" onClick={() => nudge("end", 0.1)}>bitiş +</button>
        </div>

        <div className="tl-controls">
          <button className="btn ghost" onClick={togglePlay}>{playing ? "⏸ duraklat" : "▶ oynat"}</button>
          <button className="btn ghost" onClick={previewClip}>↻ seçili aralığı oynat</button>
        </div>
      </div>
    </div>
  );
}
