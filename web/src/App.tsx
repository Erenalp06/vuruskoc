import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trimmer } from "./Trimmer";
import { BgDecor } from "./BgDecor";
import { ResultView } from "./ResultView";
import {
  analyzeVideo, renderAnnotated, probeVideo, stripResult,
  saveEntry, listEntries, getEntry, deleteEntry,
  type AnalyzeResult, type HistoryEntry, type Side, type Stroke, type Lang,
} from "./engine";

const uuid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));

const scoreColor = (s?: number | null) =>
  s == null ? "var(--dim)" : s >= 80 ? "var(--good)" : s >= 50 ? "var(--warn)" : "var(--bad)";

function Seg<T extends string>({ value, onChange, options, dimUnselected = false }: {
  value: T; onChange: (v: T) => void; options: [T, string][]; dimUnselected?: boolean;
}) {
  return (
    <div className="seg wide">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? "on" : dimUnselected ? "dim" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const IC = {
  hand: "M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  racket: "M12 2a7 7 0 0 1 7 7c0 4-3 7-7 7s-7-3-7-7a7 7 0 0 1 7-7zM11 16l-4 6M10.5 8.5l3 3M9 11l4-4",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c2.5 3 4 6.5 4 10s-1.5 7-4 10c-2.5-3-4-6.5-4-10s1.5-7 4-10z",
};

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items: [number, string][] = [[1, "Yükle"], [2, "Kes"], [3, "Analiz"]];
  return (
    <div className="steps">
      {items.map(([n, label], i) => (
        <div key={n} className="step-wrap">
          <div className={"step " + (step === n ? "on" : step > n ? "done" : "")}>
            <span className="num">{step > n ? "✓" : n}</span>{label}
          </div>
          {i < 2 && <span className="bar" />}
        </div>
      ))}
    </div>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}

function MiniRing({ score }: { score: number | null }) {
  const s = score ?? 0;
  const c = scoreColor(score);
  return (
    <span className="mini-ring" style={{ background: `conic-gradient(${c} ${s * 3.6}deg, #ffffff12 0)` }}>
      <span style={{ color: c }}>{score != null ? s.toFixed(0) : "…"}</span>
    </span>
  );
}

function TIPS() {
  return [
    "Aynı vuruşu 5 kez çek, ortalamaya bak — tek klip gürültülü.",
    "Kamerayı yan koy, tüm vücudun kadraja girsin.",
    "Vuruştan sonra raketi karşı omzunun üstünde bitir.",
    "Yüklenmede dizini bük, gücü yerden al.",
    "Raketi dirseğinin arkasında biraz daha beklet.",
  ];
}

function ProgressCard({ items }: { items: HistoryEntry[] }) {
  const scores = useMemo(
    () => items.map((h) => h.result.swing_score).filter((s): s is number => s != null).slice(0, 8).reverse(),
    [items]
  );
  if (scores.length < 2) return null;
  const min = Math.min(...scores), max = Math.max(...scores);
  const rng = Math.max(1, max - min);
  const W = 150, H = 40;
  const pts = scores
    .map((s, i) => `${(i / (scores.length - 1)) * W},${H - ((s - min) / rng) * (H - 6) - 3}`)
    .join(" ");
  const delta = scores[scores.length - 1] - scores[0];

  return (
    <div className="card progress-card">
      <h4>🏆 İlerleme</h4>
      <p>Son {scores.length} analizde skor değişimi.</p>
      <div className="spark-row">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
          <polyline points={pts} fill="none" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {scores.map((s, i) => (
            <circle key={i} cx={(i / (scores.length - 1)) * W} cy={H - ((s - min) / rng) * (H - 6) - 3} r="2.5" fill="var(--good)" />
          ))}
        </svg>
        <span className="spark-delta">{delta >= 0 ? "+" : ""}{delta.toFixed(0)}<small>ilk→son</small></span>
      </div>
    </div>
  );
}

function History({ items, onOpen, onDelete }: {
  items: HistoryEntry[]; onOpen: (e: HistoryEntry) => void; onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [tip] = useState(() => TIPS()[Math.floor(Math.random() * TIPS().length)]);
  const groups = useMemo(() => {
    const m = new Map<string, HistoryEntry[]>();
    for (const h of items) {
      const k = h.created_at.slice(0, 10);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(h);
    }
    return [...m.entries()].map(([k, list]) => ({
      key: k, label: dayLabel(list[0].created_at),
      best: Math.max(0, ...list.map((x) => x.result.swing_score ?? 0)), list,
    }));
  }, [items]);

  return (
    <div>
      <div className="card hist" onClick={() => setMenu(null)}>
        <div className="hist-head"><div className="side-title">⟳ Geçmiş</div></div>
        {items.length === 0 && <p className="muted" style={{ fontSize: 12 }}>henüz analiz yok</p>}
        {groups.map((g) => (
          <div key={g.key} className="hist-group">
            <div className="hist-day">
              <span>{g.label}</span>
              {g.best > 0 && <span className="hist-best">en iyi {g.best.toFixed(0)}</span>}
            </div>
            {g.list.map((h) => (
              <div className="hist-item" key={h.id} onClick={() => onOpen(h)}>
                <MiniRing score={h.result.swing_score} />
                <span className="hist-meta">
                  <b>{h.name}</b>
                  <span>{new Date(h.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                </span>
                <span className="pill">{h.result.stroke}</span>
                <button className="hist-kebab" onClick={(e) => { e.stopPropagation(); setMenu(menu === h.id ? null : h.id); }}>⋮</button>
                {menu === h.id && (
                  <div className="hist-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { onDelete(h.id); setMenu(null); }}>Sil</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <ProgressCard items={items} />

      <div className="card tip-card">
        <div className="q">“{tip}”</div>
        <div className="by">— VuruşKoç ipucu</div>
      </div>
    </div>
  );
}

function AnalyzingOverlay({ stage, p }: { stage: string; p: number }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Analiz ediliyor">
      <div className="overlay-card">
        <div className="overlay-mark">
          <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
            <path d="M14 46 L30 22 L30 38 L50 14" stroke="#12200a" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h4>Vuruşun analiz ediliyor</h4>
        <div className="stage">{stage} — %{Math.round(p * 100)}</div>
        <div className="overlay-bar"><div style={{ width: `${Math.max(4, p * 100)}%` }} /></div>
        <div className="overlay-pct">{Math.round(p * 100)}%</div>
        <div className="overlay-hint">Video cihazından çıkmıyor — her şey tarayıcıda hesaplanıyor.</div>
      </div>
    </div>
  );
}

type View =
  | { kind: "fresh"; result: AnalyzeResult; annotatedUrl: string | null }
  | { kind: "history"; entry: HistoryEntry; annotatedUrl: string | null };

export function App() {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [hand, setHand] = useState<Side>("right");
  const [stroke, setStroke] = useState<Stroke | "auto">("auto");
  const [lang, setLang] = useState<Lang>("tr");
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [busy, setBusy] = useState<{ stage: string; p: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const urlsToRevoke = useRef<string[]>([]);

  const refreshHistory = useCallback(() => { listEntries().then(setHistory).catch(() => {}); }, []);
  useEffect(refreshHistory, [refreshHistory]);

  const reset = () => {
    setView(null); setErr(null); setBusy(null);
    setSrcUrl(null); setMeta(null); setFileName("");
  };

  const pickFile = async (file: File) => {
    setErr(null); setView(null);
    const url = URL.createObjectURL(file);
    urlsToRevoke.current.push(url);
    try {
      const m = await probeVideo(url);
      setSrcUrl(url); setFileName(file.name); setMeta(m);
      setRange({ start: 0, end: Math.min(m.duration, 8) });
    } catch (e) {
      setErr(String(e));
    }
  };

  const run = async () => {
    if (!srcUrl) return;
    setErr(null);
    setBusy({ stage: "başlıyor", p: 0 });
    try {
      const result = await analyzeVideo(srcUrl, range.start, range.end, {
        hand, stroke, lang,
        onProgress: (stage, p) =>
          setBusy({ stage: stage === "frames" ? "kareler çıkarılıyor" : "poz + skor", p }),
      });
      setBusy({ stage: "işaretli video", p: 1 });
      const blob = await renderAnnotated(result._frames, result._keypoints, result._phases, result.contact_frame, result._velocities);
      const annotatedUrl = blob ? URL.createObjectURL(blob) : null;
      if (annotatedUrl) urlsToRevoke.current.push(annotatedUrl);

      const id = uuid();
      await saveEntry({
        id, created_at: new Date().toISOString(), name: fileName,
        result: stripResult(result), keypoints: result._keypoints, phases: result._phases,
        annotated: blob ?? undefined,
      });
      refreshHistory();
      setView({ kind: "fresh", result, annotatedUrl });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  };

  const openHistory = async (h: HistoryEntry) => {
    setSrcUrl(null); setMeta(null);
    const full = (await getEntry(h.id)) ?? h;
    const annotatedUrl = full.annotated ? URL.createObjectURL(full.annotated) : null;
    if (annotatedUrl) urlsToRevoke.current.push(annotatedUrl);
    setView({ kind: "history", entry: full, annotatedUrl });
  };

  const removeEntry = async (id: string) => {
    setHistory((h) => h.filter((x) => x.id !== id));
    if (view?.kind === "history" && view.entry.id === id) reset();
    await deleteEntry(id).catch(() => refreshHistory());
  };

  useEffect(() => () => { urlsToRevoke.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const step: 1 | 2 | 3 = view ? 3 : srcUrl ? 2 : 1;

  const resultProps =
    view?.kind === "fresh"
      ? { result: view.result, keypoints: view.result._keypoints, annotatedUrl: view.annotatedUrl }
      : view?.kind === "history"
      ? { result: view.entry.result, keypoints: view.entry.keypoints, annotatedUrl: view.annotatedUrl }
      : null;

  return (
    <div className="app">
      <BgDecor />
      <div className="top">
        <div className="brand">
          <span className="mark" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 64 64" fill="none">
              <path d="M14 46 L30 22 L30 38 L50 14" stroke="#12200a" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand-text">Vuruş<span>Koç</span></span>
          <span className="tag">cihazında çalışır · video yüklenmez</span>
        </div>
        {(srcUrl || view) && <button className="btn sm" style={{ marginLeft: "auto" }} onClick={reset}>+ yeni analiz</button>}
      </div>

      <div className="layout">
        <div>
          <Stepper step={step} />
          {err && <div className="card"><p className="err">{err}</p></div>}

          {step === 1 && (
            <div className="card active">
              <h3>Video yükle</h3>
              <label
                className={"drop" + (over ? " over" : "")}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
              >
                <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
                <span className="ic">🎾</span>
                <span className="big">Videoyu buraya bırak ya da <b>seç</b></span>
                <div style={{ fontSize: 12, marginTop: 6 }}>video cihazından çıkmaz — analiz tarayıcıda yapılır</div>
              </label>
            </div>
          )}

          {step === 2 && srcUrl && meta && (
            <>
              <div className="card active">
                <h3>Vuruşu kes</h3>
                <p className="card-sub">Analiz edilmesini istediğin vuruşu zaman çizelgesinde seç.</p>
                <Trimmer src={srcUrl} duration={meta.duration} value={range} onChange={setRange} />
                <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
                  {meta.width}×{meta.height} · {meta.duration.toFixed(1)} sn — tek bir vuruşu hazırlıktan bitişe kadar seç (5–10 sn ideal).
                </p>
              </div>

              <div className="card">
                <h3>⚙ Analiz ayarları</h3>
                <div className="setrow">
                  <span className="setlbl"><Icon d={IC.hand} /> Kullandığın el</span>
                  <Seg value={hand} onChange={setHand} options={[["right", "Sağ"], ["left", "Sol"]]} />
                </div>
                <div className="setrow">
                  <span className="setlbl"><Icon d={IC.racket} /> Vuruş tipi</span>
                  <Seg value={stroke} onChange={setStroke} dimUnselected={stroke === "auto"}
                    options={[["auto", "Otomatik"], ["forehand", "Forehand"], ["backhand", "Backhand"], ["serve", "Servis"]]} />
                </div>
                <div className="setrow">
                  <span className="setlbl"><Icon d={IC.globe} /> Rapor dili</span>
                  <Seg value={lang} onChange={setLang} options={[["tr", "Türkçe"], ["en", "English"]]} />
                </div>
                <button className="btn block" onClick={run} disabled={!!busy || range.end - range.start < 0.3}>
                  Analiz et →
                </button>
              </div>
            </>
          )}

          {resultProps && <ResultView {...resultProps} onBack={reset} />}
        </div>

        <History items={history} onOpen={openHistory} onDelete={removeEntry} />
      </div>

      {busy && <AnalyzingOverlay stage={busy.stage} p={busy.p} />}
    </div>
  );
}
