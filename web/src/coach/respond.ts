// Rule-based tennis coach (Faz 0, no LLM). Detects intent, composes an answer
// from the user's real analysis + history + the curated KB.
import type { AnalyzeResult } from "../engine/analyze";
import type { HistoryEntry, StoredResult } from "../engine/history";
import { topCorrections, swingSummary, IDEAL_RANGES, type Metric, type Lang } from "../engine/coaching";
import { recommendDrills, DRILLS, type Drill } from "../engine/drills";
import { KB, type KBChunk } from "./kb";

type Result = StoredResult | AnalyzeResult;
export type CoachCtx = { result?: Result | null; history: HistoryEntry[]; lang?: Lang };
export type CoachAnswer = { text: string; chips?: string[] };

const METRIC_TR: Record<string, string> = {
  elbow_angle: "dirsek açısı", hip_rotation: "kalça rotasyonu", shoulder_angle: "omuz dönüşü",
  knee_angle: "diz bükümü", racket_lag: "raket gecikmesi",
};

const TR_MAP: Record<string, string> = { "ı": "i", "ş": "s", "ğ": "g", "ü": "u", "ö": "o", "ç": "c" };
function norm(s: string): string {
  return s.toLowerCase().replace(/[ışğüöç]/g, (ch) => TR_MAP[ch] ?? ch);
}

// ── KB retrieval (keyword / tag overlap — no embeddings) ──
function kbSearch(q: string, n = 2): KBChunk[] {
  const words = norm(q).split(/[^a-z0-9]+/).filter((w: string) => w.length >= 3);
  const scored = KB.map((c) => {
    const hay = norm(c.title + " " + c.tags.join(" ") + " " + c.body);
    let s = 0;
    for (const w of words) if (hay.includes(w)) s += 1;
    for (const t of c.tags) if (norm(q).includes(norm(t))) s += 2;
    return { c, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map((x) => x.c);
}
function kbById(id: string) { return KB.find((c) => c.id === id); }

// ── history helpers ──
function scoreSeries(h: HistoryEntry[]): number[] {
  return h.map((e) => e.result.swing_score).filter((s): s is number => s != null).slice(0, 8).reverse();
}
function trendLine(h: HistoryEntry[]): string | null {
  const s = scoreSeries(h);
  if (s.length < 2) return null;
  const d = s[s.length - 1] - s[0];
  const avg = Math.round(s.reduce((a, b) => a + b, 0) / s.length);
  const arrow = d > 3 ? "yükseliyor ↑" : d < -3 ? "düşüyor ↓" : "sabit →";
  return `Son ${s.length} analiz: ortalama ${avg}/100, trend ${arrow} (ilk→son ${d >= 0 ? "+" : ""}${Math.round(d)}).`;
}
function metricTrend(h: HistoryEntry[]): { metric: string; delta: number }[] {
  const per: Record<string, number[]> = {};
  for (const e of [...h].reverse()) {
    for (const m of Object.keys(METRIC_TR)) {
      const v = e.result.scores?.[m];
      if (v != null) (per[m] ??= []).push(v);
    }
  }
  return Object.entries(per)
    .filter(([, arr]) => arr.length >= 2)
    .map(([m, arr]) => ({ metric: m, delta: Math.round(arr[arr.length - 1] - arr[0]) }))
    .sort((a, b) => a.delta - b.delta);
}

// ── correction / drill helpers from a result ──
function corrections(r: Result) {
  return topCorrections(r.scores ?? null, (r.contact_angles as any) ?? null, r.stroke as any,
    (r.loading_angles as any) ?? null, "tr", 2);
}
function allInRange(r: Result): boolean {
  const ideals = IDEAL_RANGES[r.stroke] ?? IDEAL_RANGES.forehand;
  return (Object.keys(METRIC_TR) as Metric[]).every((m) => {
    const v = (r.angles as any)[m]; if (v == null || !ideals[m]) return true;
    const [lo, hi] = ideals[m]; return v >= lo && v <= hi;
  });
}
const drillLine = (d: Drill) => `• ${d.name}${d.equipment !== "yok" ? ` (${d.equipment})` : ""} — ${d.why}`;
const scoreTxt = (r: Result) => (r.swing_score != null ? `${r.swing_score}/100` : "puan yok");

// ── plan builder ──
function buildPlan(minutes: number, r: Result | null | undefined, h: HistoryEntry[]): string {
  const mins = Math.max(10, Math.min(60, minutes || 20));
  const drills = r
    ? recommendDrills(corrections(r), r.stroke as any, allInRange(r), mins >= 30 ? 3 : mins >= 18 ? 2 : 1)
    : DRILLS.filter((d) => d.targets.includes("consistency")).slice(0, 2);

  const warm = Math.max(3, Math.round(mins * 0.2));
  const cool = Math.max(3, Math.round(mins * 0.15));
  const core = mins - warm - cool;
  const each = Math.max(4, Math.floor(core / drills.length));

  const lines = [`${mins} dakikalık antrenman planı${r ? ` (son analizin: ${r.stroke}, ${scoreTxt(r)})` : ""}:`, ""];
  lines.push(`1) Isınma — ${warm} dk`);
  lines.push(`   • hafif ip/koşu + dinamik esneme, sonra 3×15 gölge vuruş (unit turn + karşı omuzda bitiş)`);
  drills.forEach((d, i) => {
    lines.push(`${i + 2}) ${d.name} — ${each} dk`);
    d.steps.slice(0, 2).forEach((s) => lines.push(`   • ${s}`));
    lines.push(`   • hedef: ${d.reps}`);
  });
  lines.push(`${drills.length + 2}) Bitiş — ${cool} dk`);
  lines.push(`   • duvarda ya da partnerle kontrollü ral, forma odaklan (hız değil)`);
  if (mins >= 30) lines.push(`   • kalan sürede birkaç sayı oyna, öğrendiğini maçta dene`);
  const t = trendLine(h);
  if (t) lines.push("", t);
  return lines.join("\n");
}

// ── intent handlers ──
function whatToWork(ctx: CoachCtx): string {
  const r = ctx.result;
  if (!r) {
    return [
      "Henüz analiz yok — bir forehand/backhand/servis videosu yükleyip analiz et, sana özel söyleyeyim.",
      "",
      "Genel öncelik sırası (amatör): tutarlılık → derinlik → yön → spin → güç.",
      "Başlangıç için: tek parça gövde dönüşü (unit turn) + follow-through'u karşı omuzda bitirmek.",
    ].join("\n");
  }
  const corr = corrections(r);
  const out: string[] = [swingSummary(r.scores ?? null, (r.contact_angles as any) ?? null, r.stroke as any, (r.loading_angles as any) ?? null, "tr")];
  if (corr.length) {
    const c = corr[0];
    out.push("", `Öncelik: ${c.headline} — ${c.why}`, `Alıştırma: ${c.drill}`);
    const drills = recommendDrills(corr, r.stroke as any, false, 2);
    if (drills.length) out.push("", "Drill önerisi:", ...drills.map(drillLine));
  } else {
    out.push("", "Belirgin bir mekanik hata yok. Şimdi güç + tutarlılık: duvarda 30'luk seriler, İspanyol X, medicine ball rotasyon.");
  }
  const t = trendLine(ctx.history);
  if (t) out.push("", t);
  return out.join("\n");
}

function whyStroke(stroke: "forehand" | "backhand" | "serve", ctx: CoachCtx): string {
  const label = stroke === "serve" ? "servis" : stroke;
  const r = ctx.result;
  const fund = kbById(stroke === "forehand" ? "fh-common-errors" : stroke === "backhand" ? "bh-common-errors" : "serve-common-errors");
  const out: string[] = [];
  if (r && r.stroke === stroke) {
    out.push(`Son ${label} analizin: ${scoreTxt(r)}.`);
    const corr = corrections(r);
    if (corr.length) {
      out.push("Sende öne çıkan(lar):");
      corr.forEach((c) => out.push(`• ${c.headline} — ${c.why}`));
      out.push("", `İlk adım: ${corr[0].drill}`);
    } else {
      out.push("Ölçülen açıların ideal aralıkta — mekanik olarak iyi. Fark yaratacak şey artık güç, tutarlılık ve maç kararları.");
    }
  } else {
    out.push(`Henüz bir ${label} analizin yok — çekip yüklersen sana özel bakarım.`);
  }
  if (fund) out.push("", `${fund.title}: ${fund.body}`);
  return out.join("\n");
}

function homeDrills(ctx: CoachCtx): string {
  const r = ctx.result;
  const corr = r ? corrections(r) : [];
  const wanted = new Set<string>();
  for (const c of corr) { wanted.add(`${c.clipMetric ?? c.metric}:${c.direction}`); wanted.add((c.clipMetric ?? c.metric) as string); }
  const pool = DRILLS.filter((d) => (d.equipment === "yok" || d.equipment === "duvar") && d.level <= 2);
  const picked = [
    ...pool.filter((d) => d.targets.some((t) => wanted.has(t))),
    ...pool.filter((d) => d.targets.includes("consistency") || d.targets.includes("footwork")),
  ];
  const uniq = [...new Map(picked.map((d) => [d.id, d])).values()].slice(0, 4);
  const kb = kbById("home-no-racket");
  return [
    r ? `Zayıf alanına (${corr.map((c) => METRIC_TR[c.clipMetric ?? c.metric] ?? c.name).join(", ") || "genel"}) göre evde:` : "Evde / kortsuz çalışılabilecekler:",
    "",
    ...uniq.map((d) => `• ${d.name} — ${d.why} (${d.reps})`),
    "",
    kb ? kb.body : "",
  ].join("\n");
}

function progress(ctx: CoachCtx): string {
  const h = ctx.history;
  if (h.length < 2) return "Trend için en az 2 analiz gerekli. Aynı vuruşu birkaç gün üst üste çek, gelişimi buradan takip ederim.";
  const s = scoreSeries(h);
  const best = Math.max(...s), worst = Math.min(...s);
  const out = [
    `${h.length} analiz kayıtlı. SwingScore: en iyi ${best}, en düşük ${worst}, son ${s[s.length - 1]}.`,
    trendLine(h) ?? "",
  ];
  const mt = metricTrend(h);
  if (mt.length) {
    const down = mt[0], up = mt[mt.length - 1];
    if (down.delta < -4) out.push("", `Geriye giden: ${METRIC_TR[down.metric]} (${down.delta}). Bir sonraki seansta buna öncelik ver.`);
    if (up.delta > 4) out.push(`İlerleyen: ${METRIC_TR[up.metric]} (+${up.delta}). Aynen devam.`);
  }
  return out.filter(Boolean).join("\n");
}

function explain(input: string): string | null {
  const hits = kbSearch(input, 2);
  if (!hits.length) return null;
  return hits.map((c) => `${c.title}\n${c.body}`).join("\n\n");
}

// ── main ──
const CHIPS_DEFAULT = ["Neye çalışmalıyım?", "20 dakikalık antrenman hazırla", "Evde raketsiz ne yapabilirim?", "Forehand'im neden kötü?", "İlerlemem nasıl?"];

export function coachReply(input: string, ctx: CoachCtx): CoachAnswer {
  const q = norm(input);

  const dm = q.match(/(\d{1,3})\s*(dk|dakika|dakikalik|dklik|min)/);
  if (dm || /\b(plan|antrenman hazirla|program hazirla|antrenman plani|bugun ne)\b/.test(q)) {
    return { text: buildPlan(dm ? parseInt(dm[1], 10) : 20, ctx.result, ctx.history), chips: CHIPS_DEFAULT };
  }
  if (/(neye calis|en cok neyi|onceligim|ne yapmali|nereye odak|neyi duzelt|zayif yan)/.test(q)) {
    return { text: whatToWork(ctx), chips: ["20 dakikalık antrenman hazırla", "Evde ne yapabilirim?", "İlerlemem nasıl?"] };
  }
  if (/(ilerlem|gelisiyor mu|gidisat|trend|son analiz|kayit)/.test(q)) {
    return { text: progress(ctx), chips: CHIPS_DEFAULT };
  }
  if (/(evde|raketsiz|kortsuz|sahasiz|ev egzersiz|disarda calis)/.test(q)) {
    return { text: homeDrills(ctx), chips: ["20 dakikalık antrenman hazırla", "Neye çalışmalıyım?"] };
  }
  if (/forehand|forhand|fh\b/.test(q)) return { text: whyStroke("forehand", ctx), chips: CHIPS_DEFAULT };
  if (/backhand|bekhand|bh\b/.test(q)) return { text: whyStroke("backhand", ctx), chips: CHIPS_DEFAULT };
  if (/servis|serve|first serve|ikinci servis/.test(q)) return { text: whyStroke("serve", ctx), chips: CHIPS_DEFAULT };
  if (/(gec temas|gec kali|top arkamda|erken hazirlik)/.test(q)) {
    const c = kbById("fh-late-contact")!;
    return { text: `${c.title}\n${c.body}`, chips: ["20 dakikalık antrenman hazırla", "Neye çalışmalıyım?"] };
  }

  const g = explain(input);
  if (g) return { text: g, chips: CHIPS_DEFAULT };

  return {
    text: [
      "Bunu tam çözemedim. Şunları sorabilirsin:",
      "• “Neye çalışmalıyım?” — son analizine göre öncelik + drill",
      "• “20 dakikalık antrenman hazırla” — zamana göre plan",
      "• “Forehand / backhand / servis neden kötü?”",
      "• “Evde raketsiz ne yapabilirim?”",
      "• “Raket gecikmesi / unit turn nedir?” — terim açıklaması",
      "• “İlerlemem nasıl?” — geçmiş analizlerin trendi",
    ].join("\n"),
    chips: CHIPS_DEFAULT,
  };
}

export const COACH_STARTER_CHIPS = CHIPS_DEFAULT;

// ── Faz 1: shared context for the optional on-device LLM ──────────────
// The rule-based handlers above stay the fallback. When the on-device model
// is active (coach/llm.ts), Coach.tsx feeds it these messages instead — same
// retrieval, same real analysis numbers, only the wording is model-generated.

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

function contextFacts(ctx: CoachCtx): string[] {
  const r = ctx.result;
  const f: string[] = [];
  if (r) {
    f.push(`Vuruş tipi: ${r.stroke}. SwingScore: ${scoreTxt(r)}.`);
    const sum = swingSummary(r.scores ?? null, (r.contact_angles as any) ?? null,
      r.stroke as any, (r.loading_angles as any) ?? null, "tr");
    if (sum) f.push(`Motor özeti: ${sum}`);
    const corr = corrections(r);
    if (corr.length) {
      for (const c of corr) f.push(`Öncelikli düzeltme — ${c.headline}: ${c.why} Önerilen alıştırma: ${c.drill}`);
    } else {
      f.push("Ölçülen açıların tümü ideal aralıkta; belirgin bir mekanik hata yok.");
    }
    const drills = recommendDrills(corr, r.stroke as any, allInRange(r), 3);
    if (drills.length) f.push(`Katalogdan uygun drill'ler: ${drills.map((d) => `${d.name} (${d.equipment})`).join("; ")}.`);
  } else {
    f.push("Kullanıcının henüz bir vuruş analizi yok.");
  }
  const t = trendLine(ctx.history);
  if (t) f.push(t);
  const mt = metricTrend(ctx.history);
  if (mt.length) {
    const lo = mt[0], hi = mt[mt.length - 1];
    if (lo.delta < -4) f.push(`Zamanla geriye giden metrik: ${METRIC_TR[lo.metric]} (${lo.delta}).`);
    if (hi.delta > 4) f.push(`Zamanla ilerleyen metrik: ${METRIC_TR[hi.metric]} (+${hi.delta}).`);
  }
  return f;
}

function contextKB(input: string, ctx: CoachCtx): KBChunk[] {
  const q = norm(input);
  const seeds: string[] = [];
  const add = (...ids: string[]) => seeds.push(...ids);
  if (/forehand|forhand|fh\b/.test(q)) add("fh-common-errors", "fh-basic");
  if (/backhand|bekhand|bh\b/.test(q)) add("bh-common-errors", "bh-basic");
  if (/servis|serve/.test(q)) add("serve-common-errors", "serve-basic");
  if (/(gec temas|gec kali|top arkamda|erken hazirlik)/.test(q)) add("fh-late-contact", "contact-point");
  if (/(plan|antrenman|program)/.test(q) || /\d\s*(dk|dakika)/.test(q)) add("weekly-structure", "warmup", "consistency-first");
  if (/(evde|raketsiz|kortsuz|sahasiz)/.test(q)) add("home-no-racket", "home-wall");
  const r = ctx.result;
  if (r) {
    for (const c of corrections(r)) {
      const m = (c.clipMetric ?? c.metric) as string;
      const hit = KB.find((k) => (k.targets ?? []).includes(`${m}:${c.direction}`) || (k.targets ?? []).includes(m));
      if (hit) add(hit.id);
    }
  }
  const bySeed = seeds.map(kbById).filter((c): c is KBChunk => !!c);
  const byText = kbSearch(input, 3);
  return [...new Map([...bySeed, ...byText].map((c) => [c.id, c])).values()].slice(0, 4);
}

const SYSTEM_PROMPT = [
  "Sen VuruşKoç uygulamasının tenis antrenörüsün. Sıcak, net ve pratik konuşursun. Sadece Türkçe yaz.",
  "Kurallar:",
  "1) Yalnızca sana verilen ANALİZ ve BİLGİ NOTLARI'na dayan. Bunlarda olmayan bir sayı ya da olgu uydurma; bilmiyorsan bilmediğini söyle.",
  "2) Sayısal yorumları kullanıcının kendi ölçümlerinden yap.",
  "3) Kısa tut: en fazla 8 cümle ya da 4-6 maddelik bir liste. Somut, uygulanabilir tavsiye ver.",
  "4) Ağrı/sakatlık işareti varsa bir sağlık uzmanına danışmasını söyle.",
  "5) Bu bir kamera-tabanlı tahmindir, kesin ölçüm değil — sonuçları buna göre yorumla.",
].join("\n");

export function buildCoachMessages(input: string, ctx: CoachCtx): ChatMsg[] {
  const user = [
    "ANALİZ:",
    ...contextFacts(ctx).map((l) => `- ${l}`),
    "",
    "BİLGİ NOTLARI:",
    ...(() => { const k = contextKB(input, ctx); return k.length ? k.map((c) => `- ${c.title}: ${c.body}`) : ["- (ilgili not yok)"]; })(),
    "",
    `SORU: ${input.trim()}`,
  ].join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}
