import { useEffect, useRef, useState } from "react";
import { coachReply, COACH_STARTER_CHIPS, type CoachCtx } from "./respond";
import { listEntries } from "../engine/history";
import type { HistoryEntry, StoredResult } from "../engine/history";
import type { AnalyzeResult } from "../engine/analyze";

type Msg = { role: "user" | "coach"; text: string };

const GREETING =
  "Merhaba! Analizin ve geçmiş kayıtlarına göre sana özel çalışma önerebilirim. " +
  "Bir şey sor ya da aşağıdakilerden birini seç.";

export function Coach({ result }: { result?: StoredResult | AnalyzeResult | null }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "coach", text: GREETING }]);
  const [chips, setChips] = useState<string[]>(COACH_STARTER_CHIPS);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { listEntries().then(setHistory).catch(() => {}); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const ctx: CoachCtx = { result: result ?? history[0]?.result ?? null, history };
    const ans = coachReply(t, ctx);
    setMsgs((m) => [...m, { role: "user", text: t }, { role: "coach", text: ans.text }]);
    setChips(ans.chips ?? COACH_STARTER_CHIPS);
    setInput("");
  };

  return (
    <div className="card coach">
      <h3>AI Koç <span className="coach-beta">beta · cihazında</span></h3>
      <div className="coach-log">
        {msgs.map((m, i) => (
          <div key={i} className={"cmsg " + m.role}>
            {m.text.split("\n").map((ln, j) =>
              ln.startsWith("• ") ? <div key={j} className="cbul">{ln.slice(2)}</div>
              : /^\s{2,}•\s/.test(ln) ? <div key={j} className="cbul cbul-sub">{ln.replace(/^\s+•\s/, "")}</div>
              : ln.trim() === "" ? <div key={j} className="cgap" />
              : <div key={j}>{ln}</div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="coach-chips">
        {chips.map((c) => <button key={c} className="chip" onClick={() => ask(c)}>{c}</button>)}
      </div>
      <form className="coach-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Bir şey sor…" />
        <button className="btn sm" type="submit" disabled={!input.trim()}>Sor</button>
      </form>
      <p className="coach-note">
        Kurallı motor — internet, hesap ve LLM gerektirmez. Yanıtlar genel tenis bilgisi + senin analiz verinden derlenir.
      </p>
    </div>
  );
}
