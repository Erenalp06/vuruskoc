import { useEffect, useRef, useState } from "react";
import { coachReply, buildCoachMessages, COACH_STARTER_CHIPS, type CoachCtx } from "./respond";
import {
  webgpuAvailable, llmOptedIn, setLlmOptIn, loadCoachLLM, streamCoachLLM,
  LLM_DOWNLOAD_MB, LLM_MODEL_LABEL, type LLMPhase,
} from "./llm";
import { listEntries } from "../engine/history";
import type { HistoryEntry, StoredResult } from "../engine/history";
import type { AnalyzeResult } from "../engine/analyze";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";

type Msg = { role: "user" | "coach"; text: string; ai?: boolean };

const GREETING =
  "Merhaba! Analizin ve geçmiş kayıtlarına göre sana özel çalışma önerebilirim. " +
  "Bir şey sor ya da aşağıdakilerden birini seç.";

function Bubble({ m }: { m: Msg }) {
  return (
    <div className={"cmsg " + m.role}>
      {m.text === "" ? (
        <span className="ctyping"><i /><i /><i /></span>
      ) : (
        m.text.split("\n").map((ln, j) =>
          ln.startsWith("• ") ? <div key={j} className="cbul">{ln.slice(2)}</div>
          : /^\s{2,}•\s/.test(ln) ? <div key={j} className="cbul cbul-sub">{ln.replace(/^\s+•\s/, "")}</div>
          : ln.trim() === "" ? <div key={j} className="cgap" />
          : <div key={j}>{ln}</div>
        )
      )}
    </div>
  );
}

export function Coach({ result }: { result?: StoredResult | AnalyzeResult | null }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "coach", text: GREETING }]);
  const [chips, setChips] = useState<string[]>(COACH_STARTER_CHIPS);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // ── optional on-device LLM ──
  const [phase, setPhase] = useState<LLMPhase>("idle");
  const [progress, setProgress] = useState<{ pct: number; text: string }>({ pct: 0, text: "" });
  const engineRef = useRef<MLCEngineInterface | null>(null);

  useEffect(() => { listEntries().then(setHistory).catch(() => {}); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  useEffect(() => {
    if (!webgpuAvailable()) { setPhase("unsupported"); return; }
    if (llmOptedIn()) void startLLM(); // resume — shards are already cached, fast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startLLM() {
    setPhase("loading");
    setProgress({ pct: 0, text: "başlatılıyor…" });
    try {
      const engine = await loadCoachLLM((p) => {
        setProgress({ pct: Math.round((p.progress ?? 0) * 100), text: p.text || "" });
      });
      engineRef.current = engine;
      setLlmOptIn(true);
      setPhase("ready");
    } catch (e) {
      console.error("[coach] LLM load failed", e);
      setPhase("error");
    }
  }

  function disableLLM() {
    setLlmOptIn(false);
    engineRef.current = null;
    setPhase(webgpuAvailable() ? "idle" : "unsupported");
  }

  const ctxFor = (): CoachCtx => ({ result: result ?? history[0]?.result ?? null, history });

  async function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: t }]);

    if (phase === "ready" && engineRef.current) {
      setBusy(true);
      setMsgs((m) => [...m, { role: "coach", text: "", ai: true }]);
      try {
        let acc = "";
        for await (const tok of streamCoachLLM(engineRef.current, buildCoachMessages(t, ctxFor()) as any)) {
          acc += tok;
          setMsgs((m) => {
            const n = m.slice();
            n[n.length - 1] = { role: "coach", text: acc, ai: true };
            return n;
          });
        }
        if (!acc.trim()) throw new Error("empty");
      } catch (e) {
        console.error("[coach] generation failed, falling back", e);
        const ans = coachReply(t, ctxFor());
        setMsgs((m) => {
          const n = m.slice();
          n[n.length - 1] = { role: "coach", text: ans.text };
          return n;
        });
        setChips(ans.chips ?? COACH_STARTER_CHIPS);
      } finally {
        setBusy(false);
      }
      return;
    }

    const ans = coachReply(t, ctxFor());
    setMsgs((m) => [...m, { role: "coach", text: ans.text }]);
    setChips(ans.chips ?? COACH_STARTER_CHIPS);
  }

  const modeLabel =
    phase === "ready" ? `${LLM_MODEL_LABEL} · cihazında`
    : phase === "loading" ? "model iniyor…"
    : "kural tabanlı · cihazında";

  return (
    <div className="card coach">
      <h3>AI Koç <span className="coach-beta">beta · {modeLabel}</span></h3>

      {phase === "idle" && (
        <div className="coach-llm-offer">
          <div className="cllo-body">
            <b>⚡ Gelişmiş yapay zekâ (deneysel)</b>
            <span>
              ~{LLM_DOWNLOAD_MB} MB tek seferlik indirme. Model tamamen cihazında çalışır;
              indikten sonra internet gerekmez. Cevaplar daha akıcı ve serbest olur.
            </span>
          </div>
          <button className="btn sm" onClick={() => void startLLM()}>Etkinleştir</button>
        </div>
      )}
      {phase === "loading" && (
        <div className="coach-llm-load">
          <div className="cll-bar"><span style={{ width: `${progress.pct}%` }} /></div>
          <span className="cll-txt">{progress.pct}% · {progress.text || "hazırlanıyor…"}</span>
        </div>
      )}
      {phase === "error" && (
        <div className="coach-llm-load err">
          Model yüklenemedi — kural tabanlı koç aktif.{" "}
          <button className="linklike" onClick={() => void startLLM()}>tekrar dene</button>
        </div>
      )}

      <div className="coach-log">
        {msgs.map((m, i) => <Bubble key={i} m={m} />)}
        <div ref={endRef} />
      </div>

      <div className="coach-chips">
        {chips.map((c) => (
          <button key={c} className="chip" onClick={() => void ask(c)} disabled={busy}>{c}</button>
        ))}
      </div>

      <form className="coach-input" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "koç yazıyor…" : "Bir şey sor…"} disabled={busy} />
        <button className="btn sm" type="submit" disabled={!input.trim() || busy}>Sor</button>
      </form>

      <p className="coach-note">
        {phase === "ready" ? (
          <>Yanıtları {LLM_MODEL_LABEL} modeli cihazında üretiyor; senin analiz verin + genel tenis bilgisiyle beslenir. Sunucuya hiçbir şey gitmez.{" "}
            <button className="linklike" onClick={disableLLM}>gelişmiş modu kapat</button></>
        ) : phase === "unsupported" ? (
          <>Bu tarayıcı WebGPU desteklemediği için gelişmiş model kullanılamıyor. Kurallı motor — internet, hesap ve LLM gerektirmez.</>
        ) : (
          <>Kurallı motor — internet, hesap ve LLM gerektirmez. Yanıtlar genel tenis bilgisi + senin analiz verinden derlenir.</>
        )}
      </p>
    </div>
  );
}
