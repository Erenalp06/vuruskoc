// Scoring + coaching text — mirrored from core/coaching.py (THETIS-calibrated).
import type { Angles } from "./angles";
import type { LoadingAngles, Stroke } from "./swing";

export type Lang = "tr" | "en";
export type Metric = "elbow_angle" | "hip_rotation" | "shoulder_angle" | "knee_angle" | "racket_lag";

export const IDEAL_RANGES: Record<string, Record<string, [number, number]>> = {
  forehand: { elbow_angle: [85, 142], hip_rotation: [33, 120], shoulder_angle: [35, 80], knee_angle: [132, 172], racket_lag: [83, 164], contact_height_ratio: [1.1, 1.4] },
  backhand: { elbow_angle: [96, 159], hip_rotation: [99, 114], shoulder_angle: [33, 71], knee_angle: [124, 153], racket_lag: [91, 151], contact_height_ratio: [1.0, 1.5] },
  serve: { elbow_angle: [159, 174], hip_rotation: [96, 125], shoulder_angle: [79, 162], knee_angle: [135, 165], racket_lag: [107, 171], contact_height_ratio: [1.6, 4.5] },
};

export const WEIGHTS: Record<string, number> = {
  elbow_angle: 0.18, hip_rotation: 0.23, shoulder_angle: 0.07,
  knee_angle: 0.05, racket_lag: 0.31, follow_through: 0.16,
};

const METRIC_PHASE: Record<Metric, "contact" | "loading"> = {
  elbow_angle: "contact", hip_rotation: "contact",
  shoulder_angle: "loading", knee_angle: "loading", racket_lag: "loading",
};

const STROKE_NAMES: Record<Lang, Record<string, string>> = {
  en: { forehand: "Forehand", backhand: "Backhand", serve: "Serve", volley: "Volley", unknown: "Unknown" },
  tr: { forehand: "Forehand", backhand: "Backhand", serve: "Servis", volley: "Vole", unknown: "Bilinmiyor" },
};

type Plain = { headline: string; why: string };
type I18N = {
  no_pose: string;
  verdict: [number, string][];
  correction_line: (i: number, name: string, value: number, lo: number, hi: number, score: number) => string;
  drill_prefix: string;
  follow_incomplete: string;
  follow_drill: string;
  injury_header: string;
  metric_names: Record<Metric, string>;
  drills: Record<Metric, { too_low: string; too_high: string }> & { default: string };
  plain: Record<Metric, { low: Plain; high: Plain }>;
  injury: { shoulder: string; lumbar: string; knee: string };
};

export const I18N: Record<Lang, I18N> = {
  en: {
    no_pose: "Could not analyze swing — no pose detected at contact point.",
    verdict: [
      [85, "Excellent swing mechanics! Minor refinements below."],
      [70, "Solid foundation — focus on these corrections to level up."],
      [50, "Good effort — several key areas need work."],
      [0, "Let's rebuild from the ground up. Focus on the top 2 corrections."],
    ],
    correction_line: (i, name, value, lo, hi, score) =>
      `${i}. ${name}: ${value.toFixed(1)}° (ideal: ${lo}-${hi}°, score: ${score.toFixed(0)}/100)`,
    drill_prefix: "   Drill: ",
    follow_incomplete: "Follow-through: Incomplete — your arm should cross your body after contact.",
    follow_drill: "   Drill: Shadow 20 swings finishing with your racket over your opposite shoulder.",
    injury_header: "INJURY WARNINGS:",
    metric_names: { elbow_angle: "Elbow Angle", hip_rotation: "Hip Rotation", shoulder_angle: "Shoulder Angle", knee_angle: "Knee Angle", racket_lag: "Racket Lag" },
    drills: {
      elbow_angle: { too_low: "Shadow 20 forehands focusing on extending your elbow through contact. Think 'reach and push'.", too_high: "Your arm is too straight — add slight bend at contact. Relaxed, whip-like motion." },
      hip_rotation: { too_low: "Stand sideways, coil your hips back, then drive forward. 20 reps, no racket.", too_high: "You're over-rotating. Plant your front foot and let the hips stop at 90° to the net." },
      shoulder_angle: { too_low: "Full unit turn — get your non-dominant shoulder pointing at the ball. 15 slow shadow swings.", too_high: "You're opening up too early. Keep the shoulder coiled until the hip drives forward." },
      knee_angle: { too_low: "You're sitting too deep. Stand taller and stay athletic, not in a squat.", too_high: "Legs too straight — bend the knees. Drop into a mini-squat before every swing." },
      racket_lag: { too_low: "Let the racket lag behind your elbow longer. Practice the 'waiter's tray' position.", too_high: "Your racket is too far behind — you're losing control. Compact the backswing." },
      default: "Shadow 20 swings focusing on this movement pattern.",
    },
    plain: {
      elbow_angle: { low: { headline: "Reach through the ball", why: "Your arm stays too bent at contact — you lose power and reach." }, high: { headline: "Don't lock your arm", why: "Your arm is fully straight — you lose the whip and control." } },
      hip_rotation: { low: { headline: "Turn your hips more", why: "Your body barely rotates — the power isn't coming from the ground up." }, high: { headline: "Don't over-rotate", why: "You spin too far — balance and timing suffer." } },
      shoulder_angle: { low: { headline: "Coil your shoulders fully", why: "You don't turn back enough in the load — the swing has no windup." }, high: { headline: "Stay coiled a beat longer", why: "Your shoulders open too early and leak power." } },
      knee_angle: { low: { headline: "Stand a little taller", why: "You're squatting too deep — you can't push off cleanly." }, high: { headline: "Bend your knees", why: "Your legs stay straight — no drive from the ground." } },
      racket_lag: { low: { headline: "Let the racket lag more", why: "The racket head is ahead of your hand — you're pushing, not whipping." }, high: { headline: "Shorten the backswing", why: "The racket drops way behind you — hard to time and control." } },
    },
    injury: {
      shoulder: "Shoulder impingement risk: your serving shoulder angle is too closed. Open up your trophy position to reduce rotator cuff strain.",
      lumbar: "Lumbar hyperextension risk: excessive hip tilt during serve. Strengthen your core to keep a neutral spine through the motion.",
      knee: "Knee stress warning: deep knee bend beyond 90° at contact increases patellar tendon load. Keep a more athletic stance.",
    },
  },
  tr: {
    no_pose: "Vuruş analiz edilemedi — temas anında poz tespit edilemedi.",
    verdict: [
      [85, "Mükemmel vuruş mekaniği! Aşağıda ufak rötuşlar var."],
      [70, "Sağlam temel — seviye atlamak için şu düzeltmelere odaklan."],
      [50, "İyi çaba — birkaç önemli nokta çalışma istiyor."],
      [0, "Baştan inşa edelim. İlk 2 düzeltmeye odaklan."],
    ],
    correction_line: (i, name, value, lo, hi, score) =>
      `${i}. ${name}: ${value.toFixed(1)}° (ideal: ${lo}-${hi}°, puan: ${score.toFixed(0)}/100)`,
    drill_prefix: "   Alıştırma: ",
    follow_incomplete: "Takip (follow-through): Eksik — vuruştan sonra kolun gövdeni çaprazlamalı.",
    follow_drill: "   Alıştırma: 20 gölge vuruş, raketi karşı omzunun üzerinde bitir.",
    injury_header: "SAKATLIK UYARILARI:",
    metric_names: { elbow_angle: "Dirsek Açısı", hip_rotation: "Kalça Rotasyonu", shoulder_angle: "Omuz Dönüşü", knee_angle: "Diz Bükümü", racket_lag: "Raket Gecikmesi" },
    drills: {
      elbow_angle: { too_low: "20 gölge forehand, vuruş boyunca dirseğini uzatmaya odaklan. 'Uzan ve it' diye düşün.", too_high: "Kolun fazla düz — vuruş anında hafif bükük tut. Gevşek, kamçı gibi bir hareket çalış." },
      hip_rotation: { too_low: "Yana dön, kalçanı geriye sar, sonra öne sür. Raketsiz 20 tekrar — sadece kalça rotasyonu.", too_high: "Fazla dönüyorsun. Ön ayağını sabitle, kalçalar file'ye 90°'de dursun." },
      shoulder_angle: { too_low: "Tam gövde dönüşü — dominant olmayan omzun topa baksın. 15 yavaş çekim gölge vuruş.", too_high: "Çok erken açılıyorsun. Kalça öne sürene kadar omzu sarılı tut." },
      knee_angle: { too_low: "Fazla çömelmişsin. Biraz daha dik dur — atletik kal, squat'a inme.", too_high: "Dizlerin çok düz. Her vuruştan önce mini squat'a in. 20 split-step→vuruş." },
      racket_lag: { too_low: "Raketi dirseğinin arkasında daha uzun beklet. Backswing sonunda 'garson tepsisi' pozisyonunu çalış.", too_high: "Raket çok geride — kontrolü kaybediyorsun. Backswing'i toparla." },
      default: "Bu hareket kalıbına odaklanarak 20 gölge vuruş yap.",
    },
    plain: {
      elbow_angle: { low: { headline: "Kolunu vuruşta uzat", why: "Kolun temas anında fazla bükük — güç ve uzanım kaybediyorsun." }, high: { headline: "Kolunu kilitleme", why: "Kol tamamen düz — kamçı etkisi ve kontrol azalıyor." } },
      hip_rotation: { low: { headline: "Kalçanı daha çok çevir", why: "Gövden neredeyse hiç dönmüyor — güç yerden gelmiyor." }, high: { headline: "Fazla dönme", why: "Çok fazla dönüyorsun — denge ve zamanlama bozuluyor." } },
      shoulder_angle: { low: { headline: "Gövdeni tam sar", why: "Hazırlıkta yeterince geriye dönmüyorsun — yükleme yok." }, high: { headline: "Omzu bir an daha sarılı tut", why: "Omuzların çok erken açılıyor, güç kaçıyor." } },
      knee_angle: { low: { headline: "Biraz daha dik dur", why: "Fazla çömelmişsin — yerden temiz itiş yapamıyorsun." }, high: { headline: "Dizlerini bük", why: "Bacakların düz kalıyor — yerden itiş gücü yok." } },
      racket_lag: { low: { headline: "Raketi arkada daha çok beklet", why: "Raket kafası elinin önünde — itiyorsun, kamçılamıyorsun." }, high: { headline: "Backswing'i kısalt", why: "Raket çok geriye düşüyor — zamanlaması ve kontrolü zor." } },
    },
    injury: {
      shoulder: "Omuz sıkışması riski: servis omuz açın çok kapalı. Rotator cuff yükünü azaltmak için trophy pozisyonunu aç.",
      lumbar: "Bel aşırı ekstansiyon riski: serviste aşırı kalça eğimi. Hareket boyunca nötr omurga için karın kaslarını güçlendir.",
      knee: "Diz yükü uyarısı: temas anında 90°'yi aşan derin diz bükümü patellar tendon yükünü artırır. Daha atletik bir duruş koru.",
    },
  },
};

export const strokeName = (lang: Lang, s: string) => STROKE_NAMES[lang][s] ?? s;

export function scoreMetric(value: number, [lo, hi]: [number, number]): number {
  if (Number.isNaN(value)) return 50;
  if (lo <= value && value <= hi) {
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2;
    return 85 + 15 * (1 - Math.abs(value - mid) / (half + 1e-8));
  }
  const dist = value < lo ? lo - value : value - hi;
  return Math.max(0, 100 - Math.min(dist * 3.3, 100));
}

export type Scores = Record<string, number> & { overall: number };

export function scoreSwing(
  contact: Angles | null, stroke: Stroke, followComplete: boolean, loading: LoadingAngles | null
): Scores | null {
  if (!contact) return null;
  const ideals = IDEAL_RANGES[stroke] ?? IDEAL_RANGES.forehand;
  const scores: Record<string, number> = {};

  for (const m of ["elbow_angle", "hip_rotation"] as const) {
    scores[m] = ideals[m] ? scoreMetric((contact as any)[m], ideals[m]) : 50;
  }
  const loadSrc: any = loading ?? contact;
  for (const m of ["shoulder_angle", "knee_angle", "racket_lag"] as const) {
    scores[m] = ideals[m] && loadSrc[m] != null ? scoreMetric(loadSrc[m], ideals[m]) : 50;
  }
  scores.follow_through = followComplete ? 100 : 30;

  let overall = 0;
  for (const m of Object.keys(WEIGHTS)) if (m in scores) overall += scores[m] * WEIGHTS[m];
  return { ...scores, overall: Math.round(overall * 10) / 10 } as Scores;
}

export type Correction = {
  metric: Metric; name: string; headline: string; why: string;
  phase: "contact" | "loading"; value: number; ideal: [number, number];
  target_dir: "up" | "down"; score: number; direction: "low" | "high"; drill: string;
};

export function topCorrections(
  scores: Scores | null, contact: Angles | null, stroke: Stroke,
  loading: LoadingAngles | null, lang: Lang, top = 2
): Correction[] {
  if (!scores || !contact) return [];
  const L = I18N[lang];
  const merged: any = { ...contact };
  for (const m of ["shoulder_angle", "knee_angle", "racket_lag"] as const) {
    if (loading && (loading as any)[m] != null) merged[m] = (loading as any)[m];
  }
  const ideals = IDEAL_RANGES[stroke] ?? IDEAL_RANGES.forehand;

  const ranked = (["elbow_angle", "hip_rotation", "shoulder_angle", "knee_angle", "racket_lag"] as Metric[])
    .flatMap((m) => {
      const sc = scores[m];
      if (sc == null || merged[m] == null || !ideals[m]) return [];
      const [lo, hi] = ideals[m];
      const val = merged[m];
      if ((lo <= val && val <= hi) || sc >= 82) return [];
      const direction: "low" | "high" = val < lo ? "low" : "high";
      const pl = L.plain[m][direction];
      const dir = direction === "low" ? "too_low" : "too_high";
      return [{
        metric: m, name: L.metric_names[m], headline: pl.headline, why: pl.why,
        phase: METRIC_PHASE[m], value: Math.round(val * 10) / 10, ideal: [lo, hi] as [number, number],
        target_dir: (direction === "low" ? "up" : "down") as "up" | "down",
        score: Math.round(sc * 10) / 10, direction,
        drill: L.drills[m]?.[dir] ?? L.drills.default,
        impact: (WEIGHTS[m] ?? 0.1) * (100 - sc),
      }];
    })
    .sort((a, b) => b.impact - a.impact)
    .slice(0, top);

  return ranked.map(({ impact, ...c }) => c);
}

export function generateReport(
  scores: Scores | null, contact: Angles | null, stroke: Stroke,
  loading: LoadingAngles | null, lang: Lang
): string {
  const L = I18N[lang];
  if (!scores || !contact) return L.no_pose;

  const merged: any = { ...contact };
  for (const m of ["shoulder_angle", "knee_angle", "racket_lag"] as const) {
    if (loading && (loading as any)[m] != null) merged[m] = (loading as any)[m];
  }
  const lines: string[] = [`SwingScore: ${scores.overall}/100`, ""];
  for (const [th, txt] of L.verdict) if (scores.overall >= th) { lines.push(txt); break; }
  lines.push("");

  const ideals = IDEAL_RANGES[stroke] ?? IDEAL_RANGES.forehand;
  const corr = (["elbow_angle", "hip_rotation", "shoulder_angle", "knee_angle", "racket_lag"] as Metric[])
    .flatMap((m) => {
      const sc = scores[m];
      if (sc == null || sc >= 90) return [];
      return [{ m, sc, impact: (WEIGHTS[m] ?? 0.1) * (100 - sc), value: merged[m] ?? 0 }];
    })
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 2);

  corr.forEach((c, i) => {
    const [lo, hi] = ideals[c.m] ?? [0, 0];
    const name = L.metric_names[c.m];
    lines.push(L.correction_line(i + 1, name, c.value, lo, hi, c.sc));
    const dir = c.value < lo ? "too_low" : "too_high";
    lines.push(L.drill_prefix + (L.drills[c.m]?.[dir] ?? L.drills.default));
    lines.push("");
  });

  if ((scores.follow_through ?? 100) < 50) {
    lines.push(L.follow_incomplete);
    lines.push(L.follow_drill);
  }
  return lines.join("\n");
}

export function injuryWarnings(angles: any, stroke: Stroke, lang: Lang): string[] {
  const inj = I18N[lang].injury;
  const w: string[] = [];
  if (!angles) return w;
  if (stroke === "serve" && (angles.shoulder_angle ?? 999) < 140) w.push(inj.shoulder);
  if (stroke === "serve" && (angles.hip_rotation ?? 0) > 100) w.push(inj.lumbar);
  if ((angles.knee_angle ?? 999) < 90) w.push(inj.knee);
  return w;
}
