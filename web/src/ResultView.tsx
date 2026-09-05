import { useEffect, useState } from "react";
import {
  GHOST_PROS, renderProOverlay, drillURL,
  type AnalyzeResult, type Correction, type Keypoints, type StoredResult,
} from "./engine";

const IDEAL: Record<string, Record<string, [number, number]>> = {
  forehand: { elbow_angle: [85, 142], hip_rotation: [33, 120], shoulder_angle: [35, 80], knee_angle: [132, 172], racket_lag: [83, 164] },
  backhand: { elbow_angle: [96, 159], hip_rotation: [99, 114], shoulder_angle: [33, 71], knee_angle: [124, 153], racket_lag: [91, 151] },
  serve: { elbow_angle: [159, 174], hip_rotation: [96, 125], shoulder_angle: [79, 162], knee_angle: [135, 165], racket_lag: [107, 171] },
};
const LABELS: Record<string, string> = {
  elbow_angle: "Dirsek Açısı", hip_rotation: "Kalça Rotasyonu", shoulder_angle: "Omuz Dönüşü",
  knee_angle: "Diz Bükümü", racket_lag: "Raket Gecikmesi",
};
const ORDER = ["elbow_angle", "hip_rotation", "shoulder_angle", "knee_angle", "racket_lag"];
const col = (s: number) => (s >= 80 ? "var(--good)" : s >= 50 ? "var(--warn)" : "var(--bad)");
const verdict = (s: number) =>
  s >= 85 ? "Mükemmel vuruş mekaniği" : s >= 70 ? "Sağlam temel — birkaç düzeltme" : s >= 50 ? "İyi çaba — çalışılacak noktalar var" : "Baştan inşa: ilk 2 düzeltmeye odaklan";
const verdictNote = (s: number) =>
  s >= 85 ? "Tekniğin çok tutarlı ve etkili. Küçük detaylarla daha da ileri seviyeye çıkabilirsin."
  : s >= 70 ? "Temel sağlam. Aşağıdaki düzeltmelere odaklanırsan skorun hızla yükselir."
  : s >= 50 ? "Doğru yoldasın. Birkaç önemli noktayı toparlaman gerekiyor."
  : "Mekaniğin baştan kurulması gerekiyor — ilk iki düzeltme en çok fark yaratır.";
const perfPill = (s: number) => (s >= 85 ? "Harika performans!" : s >= 70 ? "İyi gidiyor" : s >= 50 ? "Gelişmeye açık" : "Çalışma zamanı");

function FixCard({ stroke, c, n }: { stroke: string; c: Correction; n: number }) {
  const color = col(c.score);
  const [lo, hi] = c.ideal;
  const pos = (v: number) => `${(Math.max(0, Math.min(180, v)) / 180) * 100}%`;
  return (
    <div className="fix" style={{ borderTopColor: color }}>
      <video className="ref-clip" src={drillURL(stroke, c.metric)} autoPlay loop muted playsInline />
      <div className="fix-body">
        <span className="fix-num">DÜZELTME {n} · {c.phase === "loading" ? "hazırlık" : "vuruş anı"}</span>
        <div className="fix-headline">{c.headline || c.name}</div>
        <div className="fix-why">{c.why}</div>
        <div className="fix-bar">
          <div className="fix-bar-track">
            <span className="good-band" style={{ left: pos(lo), width: `${((hi - lo) / 180) * 100}%` }} />
            <span className="me" style={{ left: pos(c.value) }}><i /><b>sen {c.value.toFixed(0)}°</b></span>
          </div>
          <div className="fix-legend">hedef <b>{lo}–{hi}°</b> — {c.target_dir === "up" ? "değeri artır" : "değeri azalt"}</div>
        </div>
        <div className="fix-drill"><span>Alıştırma · </span>{c.drill}</div>
      </div>
    </div>
  );
}

/** Small positive / fine-tune cards, shown when there are no priority fixes. */
function TuneRow({ r, ranges }: { r: StoredResult | AnalyzeResult; ranges: Record<string, [number, number]> }) {
  const near = ORDER
    .filter((m) => m in r.angles)
    .map((m) => {
      const v = r.angles[m], [lo, hi] = ranges[m] ?? [0, 180];
      const mid = (lo + hi) / 2;
      return { m, v, edge: Math.abs(v - mid) / ((hi - lo) / 2 || 1) };
    })
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 2);

  return (
    <div className="tune-row">
      <div className="tune">
        <span className="ti">✓</span>
        <div><b>Belirgin bir hata yok</b><span>Ölçülen açıların hepsi ideal aralıkta.</span></div>
      </div>
      {near.map(({ m, edge }) => (
        <div className={"tune" + (edge > 0.8 ? " warn" : "")} key={m}>
          <span className="ti">{edge > 0.8 ? "◎" : "↗"}</span>
          <div>
            <b>{LABELS[m]}</b>
            <span>{edge > 0.8 ? "Aralığın kenarında — biraz daha ortala." : "İyi ama biraz daha iyileşebilir."}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProCompare({ result, keypoints }: { result: StoredResult | AnalyzeResult; keypoints: (Keypoints | null)[] }) {
  const keys = Object.entries(GHOST_PROS);
  const [pro, setPro] = useState(keys.find(([k]) => k.includes(result.stroke))?.[0] ?? keys[0][0]);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const fresh = result as AnalyzeResult;
      const blob = await renderProOverlay(
        keypoints, result.contact_frame, result.hand as "right" | "left", pro,
        fresh.frame_w || 720, fresh.frame_h || 480, fresh._frames
      );
      if (!blob) { setErr("Bu tarayıcı video kaydını desteklemiyor."); return; }
      setUrl(URL.createObjectURL(blob));
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h3>Pro ile karşılaştır — hayalet overlay</h3>
      <p className="muted" style={{ fontSize: 11.5, marginTop: -6, marginBottom: 10 }}>
        Yeşil = sen, mavi = pro. Kalçadan hizalanır, gövde boyuna ölçeklenir, temas anında senkronlanır.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select value={pro} onChange={(e) => { setPro(e.target.value); setUrl(null); }}
          style={{ background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
          {keys.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button className="btn sm" onClick={run} disabled={busy}>{busy ? "hazırlanıyor…" : "Karşılaştır"}</button>
      </div>
      {err && <p className="err" style={{ fontSize: 12, marginTop: 8 }}>{err}</p>}
      {url && <video key={url} src={url} controls autoPlay loop muted playsInline style={{ marginTop: 12 }} />}
    </div>
  );
}

export function ResultView({ result, keypoints, annotatedUrl, onBack }: {
  result: StoredResult | AnalyzeResult;
  keypoints: (Keypoints | null)[];
  annotatedUrl: string | null;
  onBack: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const r = result;
  const score = r.swing_score ?? 0;
  const ranges = IDEAL[r.stroke] ?? IDEAL.forehand;
  const pct = (x: number) => (Math.max(0, Math.min(180, x)) / 180) * 100;
  const allIn = ORDER.filter((m) => m in r.angles).every((m) => {
    const v = r.angles[m], [lo, hi] = ranges[m] ?? [0, 180];
    return v >= lo && v <= hi;
  });
  const reportLines = r.report.trim().split("\n").filter((l) => /^\d+\./.test(l.trim()));

  return (
    <div className="result-stack">
      <button className="btn ghost sm" onClick={onBack}>← Geri</button>

      <div className="card active" style={{ marginTop: 12 }}>
        <div className="result-hero">
          <div className="ring" style={{ background: `conic-gradient(${col(score)} ${score * 3.6}deg, #ffffff12 0)` }}>
            <div><b>{score.toFixed(0)}</b><span>/100</span></div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>SwingScore</div>
            <div className="verdict">{verdict(score)}</div>
            <div className="meta-line">
              vuruş: {r.stroke}{r.stroke_forced ? " (seçildi)" : " (otomatik)"} · el: {r.hand}
              <br />temas karesi {r.contact_frame} ({r.contact_time_sec.toFixed(2)} sn) · poz {Math.round(r.pose_detect_rate * 100)}%
            </div>
          </div>
          <div className="hero-right">
            <span className="hero-pill">▹ {perfPill(score)}</span>
            <p className="hero-note">{verdictNote(score)}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Öncelikli düzeltmeler {r.corrections?.length ? "— proyu izle" : ""}</h3>
        {r.corrections?.length > 0
          ? r.corrections.map((c, i) => <FixCard key={c.metric} stroke={r.stroke} c={c} n={i + 1} />)
          : <TuneRow r={r} ranges={ranges} />}
      </div>

      <div className="card">
        <h3>Bütün açılar
          {allIn && <span className="range-chip">✓ tümü ideal aralıkta</span>}
        </h3>
        <div className="mrow head">
          <span>Metrik</span><span style={{ textAlign: "right" }}>senin</span>
          <span style={{ textAlign: "right" }}>ideal</span>
          <span className="maxis">{[0, 45, 90, 135, 180].map((t) => (
            <span key={t} style={{ left: `${(t / 180) * 100}%` }}>{t}°</span>
          ))}</span>
        </div>
        {ORDER.filter((m) => m in r.angles).map((m) => {
          const v = r.angles[m];
          const [lo, hi] = ranges[m] ?? [0, 180];
          const out = v < lo ? lo - v : v > hi ? v - hi : 0;
          const dc = out === 0 ? "var(--good)" : out <= 12 ? "var(--warn)" : "var(--bad)";
          return (
            <div className="mrow" key={m}>
              <span className="lbl">{LABELS[m]}{out > 0 && <i className="mrow-flag" style={{ background: dc }} />}</span>
              <span className="you">{v.toFixed(0)}°{out > 0 && <em style={{ color: dc }}> {v < lo ? "−" : "+"}{out.toFixed(0)}</em>}</span>
              <span className="pro">{lo}–{hi}</span>
              <span className="mtrack">
                <span className="zone" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
                <span className="dot" style={{
                  left: `${pct(v)}%`, background: dc,
                  boxShadow: out === 0 ? `0 0 0 3px ${dc}33` : `0 0 0 2px #0b1018, 0 0 0 4px ${dc}`,
                }} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="res-2col">
        {annotatedUrl && (
          <div className="card">
            <h3>İşaretli video</h3>
            <video src={annotatedUrl} controls loop muted playsInline />
          </div>
        )}
        <ProCompare result={result} keypoints={keypoints} />
      </div>

      {r.injury_warnings.length > 0 && (
        <div className="warnbox">{r.injury_warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div>
      )}

      {reportLines.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Detaylı rapor</h3>
            <button className="btn ghost sm" onClick={() => setShowRaw((s) => !s)}>
              {showRaw ? "gizle" : "aç"}
            </button>
          </div>
          {showRaw && (
            <div className="rep-grid">
              {reportLines.map((l, i) => (
                <div className="rep-item" key={i}>
                  <span className="rep-n">{i + 1}</span>
                  <span className="rep-t">{l.replace(/^\d+\.\s*/, "")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
