// Tiny, dependency-free Markdown renderer for coach replies. Builds React nodes
// directly (no dangerouslySetInnerHTML) so model output can't inject markup.
// Supports: #/##/### headings, **bold**, *italic*/_italic_, `code`, - / * / 1.
// lists (one nesting level), > quotes, --- rules, blank-line paragraphs.
import { type ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // order matters: code first so ** inside `..` is literal
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|(?<![A-Za-z0-9])_[^_\n]+_(?![A-Za-z0-9]))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**") || tok.startsWith("__")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; lines: string[] }
  | { t: "quote"; lines: string[] }
  | { t: "hr" }
  | { t: "list"; ordered: boolean; items: { text: string; sub: boolean }[] };

function parse(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") { i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { blocks.push({ t: "hr" }); i++; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) { blocks.push({ t: "h", level: h[1].length, text: h[2] }); i++; continue; }

    if (/^>\s?/.test(trimmed)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      blocks.push({ t: "quote", lines: q });
      continue;
    }

    const isItem = (s: string) => /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(s);
    if (isItem(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: { text: string; sub: boolean }[] = [];
      while (i < lines.length) {
        const mm = isItem(lines[i]);
        if (!mm) break;
        items.push({ text: mm[3], sub: mm[1].length >= 2 });
        i++;
      }
      blocks.push({ t: "list", ordered, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isItem(lines[i]) && !/^(#{1,6}\s|>\s?|-{3,}$|\*{3,}$)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ t: "p", lines: para });
  }
  return blocks;
}

export function Markdown({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="md">
      {blocks.map((b, bi) => {
        if (b.t === "hr") return <hr key={bi} />;
        if (b.t === "h") {
          const lvl = Math.min(b.level, 3);
          const Tag = (["h4", "h4", "h5"] as const)[lvl - 1] ?? "h5";
          return <Tag key={bi} className={`md-h md-h${lvl}`}>{inline(b.text, `h${bi}`)}</Tag>;
        }
        if (b.t === "quote") {
          return (
            <blockquote key={bi} className="md-quote">
              {b.lines.map((l, li) => <div key={li}>{inline(l, `q${bi}-${li}`)}</div>)}
            </blockquote>
          );
        }
        if (b.t === "list") {
          const List = b.ordered ? "ol" : "ul";
          // fold sub-items into a nested list attached to the previous top item
          const nodes: ReactNode[] = [];
          let idx = 0;
          while (idx < b.items.length) {
            const it = b.items[idx];
            if (it.sub) {
              const subs: typeof b.items = [];
              while (idx < b.items.length && b.items[idx].sub) { subs.push(b.items[idx]); idx++; }
              nodes.push(
                <ul key={`s${idx}`} className="md-sub">
                  {subs.map((s, si) => <li key={si}>{inline(s.text, `li${bi}-s${idx}-${si}`)}</li>)}
                </ul>
              );
            } else {
              nodes.push(<li key={`i${idx}`}>{inline(it.text, `li${bi}-${idx}`)}</li>);
              idx++;
            }
          }
          return <List key={bi} className="md-list">{nodes}</List>;
        }
        return (
          <p key={bi} className="md-p">
            {b.lines.map((l, li) => (
              <span key={li}>{inline(l, `p${bi}-${li}`)}{li < b.lines.length - 1 ? <br /> : null}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
