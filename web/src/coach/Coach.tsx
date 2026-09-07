import { useEffect, useMemo, useRef, useState } from "react";
import {
  coachReply, buildCoachMessages, isOnTopic, OFFTOPIC_REPLY,
  COACH_STARTER_CHIPS, type CoachCtx, type ChatMsg,
} from "./respond";
import {
  webgpuAvailable, llmOptedIn, setLlmOptIn, loadCoachLLM, resetCoachLLM, streamCoachLLM,
  savedModelKey, setSavedModelKey, LLM_MODELS, LLM_MODEL_KEYS,
  type LLMPhase, type LLMModelKey,
} from "./llm";
import type { HistoryEntry } from "../engine/history";
import type { MLCEngineInterface } from "@mlc-ai/web-llm";

type Msg = { role: "user" | "coach"; text: string; ai?: boolean };

const GREETING =
  "Merhaba! Tenis tekniğin ve vuruş analizlerin hakkında sorularını yanıtlarım. " +
  "Yukarıdan hangi analizi konuşmak istediğini seçebilirsin. Tenis dışı konularda yardımcı olamam.";

const strokeTR = (s: string) => (s === "serve" ? "servis" : s === "backhand" ? "backhand" : "forehand");
function entryLabel(e: HistoryEntry): string {
  const d = new Date(e.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  const sc = e.result.swing_score != null ? `${Math.round(e.result.swing_score)}` : "–";
  return `${d} · ${strokeTR(e.result.stroke)} · ${sc}/100`;
}

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

export function Coach({ history, activeId }: { history: HistoryEntry[]; activeId?: string | null }) {
  const [selId, setSelId] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "coach", text: GREETING }]);
  const [chips, setChips] = useState<string[]>(COACH_STARTER_CHIPS);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<LLMPhase>("idle");
  const [modelKey, setModelKey] = useState<LLMModelKey>(() => savedModelKey());
  const [loadedKey, setLoadedKey] = useState<LLMModelKey>(() => savedModelKey());
  const [progress, setProgress] = useState<{ pct: number; text: string }>({ pct: 0, text: "" });
  const engineRef = useRef<MLCEngineInterface | null>(null);

  // keep the analysis picker in sync: jump to a newly-opened result, but don't
  // override a manual pick, and fall back if the selected entry disappears
  const lastActive = useRef<string | null>(null);
  useEffect(() => {
    if (activeId && activeId !== lastActive.current && history.some((e) => e.id === activeId)) {
      lastActive.current = activeId;
      setSelId(activeId);
      return;
    }
    lastActive.current = activeId ?? null;
    setSelId((cur) => (cur && history.some((e) => e.id === cur) ? cur : history[0]?.id ?? ""));
  }, [activeId, history]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  useEffect(() => {
    if (!webgpuAvailable()) { setPhase("unsupported"); return; }
    if (llmOptedIn()) void startLLM(savedModelKey());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selEntry = useMemo(() => history.find((e) => e.id === selId) ?? null, [history, selId]);
  const ctxFor = (): CoachCtx => ({ result: selEntry?.result ?? null, history });

  async function startLLM(key: LLMModelKey) {
    setModelKey(key);
    setSavedModelKey(key);
    setPhase("loading");
    setProgress({ pct: 0, text: "başlatılıyor…" });
    try {
      const engine = await loadCoachLLM(key, (p) => {
        setProgress({ pct: Math.round((p.progress ?? 0) * 100), text: p.text || "" });
      });
      engineRef.current = engine;
      setLoadedKey(key);
      setLlmOptIn(true);
      setPhase("ready");
    } catch (e) {
      console.error("[coach] LLM load failed", e);
      setPhase("error");
    }
  }

  async function changeModel() {
    engineRef.current = null;
    await resetCoachLLM();
    setPhase("idle"); // opt-in stays; the offer card lets them pick a tier
  }

  function disableLLM() {
    setLlmOptIn(false);
    engineRef.current = null;
    void resetCoachLLM();
    setPhase(webgpuAvailable() ? "idle" : "unsupported");
  }

  async function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const snapshot = msgs;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: t }]);
    const followUp = snapshot.length > 1;

    if (!isOnTopic(t, ctxFor(), followUp)) {
      setMsgs((m) => [...m, { role: "coach", text: OFFTOPIC_REPLY }]);
      setChips(COACH_STARTER_CHIPS);
      return;
    }

    if (phase === "ready" && engineRef.current) {
      setBusy(true);
      setMsgs((m) => [...m, { role: "coach", text: "", ai: true }]);
      try {
        const turns: ChatMsg[] = snapshot
          .slice(1)
          .filter((m) => m.text.trim())
          .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
        let acc = "";
        for await (const tok of streamCoachLLM(engineRef.current, buildCoachMessages(t, ctxFor(), turns) as any)) {
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
        const ans = coachReply(t, ctxFor(), { followUp });
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

    const ans = coachReply(t, ctxFor(), { followUp });
    setMsgs((m) => [...m, { role: "coach", text: ans.text }]);
    setChips(ans.chips ?? COACH_STARTER_CHIPS);
  }

  const modeLabel =
    phase === "ready" ? `${LLM_MODELS[loadedKey].sub} · cihazında`
    : phase === "loading" ? `${LLM_MODELS[modelKey].sub} iniyor…`
    : "kural tabanlı · cihazında";
  const offer = LLM_MODELS[modelKey];

  return (
    <div className="card coach">
      <h3>AI Koç <span className="coach-beta">beta · {modeLabel}</span></h3>

      <label className="coach-ctx">
        <span>Konuşulan analiz</span>
        <select value={selId} onChange={(e) => setSelId(e.target.value)}>
          <option value="">Genel (analiz seçili değil)</option>
          {history.map((e) => (
            <option key={e.id} value={e.id}>{entryLabel(e)}</option>
          ))}
        </select>
      </label>

      {phase === "idle" && (
        <div className="coach-llm-offer">
          <div className="cllo-body">
            <b>⚡ Gelişmiş yapay zekâ (deneysel)</b>
            <span>Model tamamen cihazında çalışır; indikten sonra internet gerekmez.</span>
            <div className="cllo-tiers" role="radiogroup" aria-label="Model">
              {LLM_MODEL_KEYS.map((k) => (
                <button
                  key={k}
                  className={"cllo-tier" + (modelKey === k ? " on" : "")}
                  aria-pressed={modelKey === k}
                  onClick={() => setModelKey(k)}
                >
                  <b>{LLM_MODELS[k].label}</b>
                  <i>{LLM_MODELS[k].sub}</i>
                  <em>~{(LLM_MODELS[k].downloadMB / 1000).toFixed(LLM_MODELS[k].downloadMB < 1000 ? 2 : 1)} GB</em>
                </button>
              ))}
            </div>
            <span className="cllo-note">{offer.note}</span>
          </div>
          <button className="btn sm" onClick={() => void startLLM(modelKey)}>
            İndir & etkinleştir
          </button>
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
          Model yüklenemedi (bellek yetmemiş olabilir — daha küçük bir model dene).{" "}
          <button className="linklike" onClick={() => void changeModel()}>model seç</button>
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
          placeholder={busy ? "koç yazıyor…" : "Tenisle ilgili bir şey sor…"} disabled={busy} />
        <button className="btn sm" type="submit" disabled={!input.trim() || busy}>Sor</button>
      </form>

      <p className="coach-note">
        {phase === "ready" ? (
          <>Yanıtları {LLM_MODELS[loadedKey].sub} modeli cihazında üretiyor; senin analiz verin + genel tenis bilgisiyle beslenir. Sunucuya hiçbir şey gitmez.{" "}
            <button className="linklike" onClick={() => void changeModel()}>modeli değiştir</button>
            {" · "}
            <button className="linklike" onClick={disableLLM}>kapat</button></>
        ) : phase === "unsupported" ? (
          <>Bu tarayıcı WebGPU desteklemediği için gelişmiş model kullanılamıyor. Kurallı motor — internet, hesap ve LLM gerektirmez.</>
        ) : (
          <>Kurallı motor — internet, hesap ve LLM gerektirmez. Yanıtlar genel tenis bilgisi + senin analiz verinden derlenir.</>
        )}
      </p>
    </div>
  );
}
