// Orchestrator — mirrors analyzer/run.py, but 100% on-device.
import type { Keypoints } from "./landmarks";
import type { Angles } from "./angles";
import { jointAngles } from "./angles";
import { extractFrames, type Frame } from "./frames";
import { initPose, extractKeypoints } from "./pose";
import {
  wristVelocity, wristAccel, detectPhases, findContactFrame, classifyStroke,
  bestLoadingAngles, followThroughComplete, type Phase, type Side, type Stroke, type LoadingAngles,
} from "./swing";
import {
  scoreSwing, topCorrections, generateReport, swingSummary, injuryWarnings, strokeName,
  type Scores, type Correction, type Lang,
} from "./coaching";

export type AnalyzeOptions = {
  hand?: Side;
  stroke?: Stroke | "auto";
  lang?: Lang;
  onProgress?: (stage: "frames" | "pose", p: number) => void;
};

export type AnalyzeResult = {
  ok: true;
  fps: number;
  frame_w: number;
  frame_h: number;
  n_frames: number;
  pose_detect_rate: number;
  stroke: Stroke;
  stroke_forced: boolean;
  contact_frame: number;
  contact_time_sec: number;
  follow_through_complete: boolean;
  angles: Record<string, number>;
  contact_angles: Record<string, number>;
  loading_angles: Record<string, number>;
  scores: Scores | null;
  swing_score: number | null;
  corrections: Correction[];
  summary: string;
  report: string;
  injury_warnings: string[];
  phase_counts: Record<string, number>;
  lang: Lang;
  hand: Side;
  // kept for the annotated / pro-overlay renderers (not persisted verbatim)
  _frames: Frame[];
  _keypoints: (Keypoints | null)[];
  _phases: Phase[];
  _velocities: number[];
};

const round1 = (o: Record<string, number> | null | undefined) =>
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Math.round(v * 10) / 10]));

export async function analyzeVideo(url: string, start: number, end: number, opts: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const hand: Side = opts.hand ?? "right";
  const strokeOpt = opts.stroke ?? "auto";
  const lang: Lang = opts.lang ?? "tr";

  const { frames, w, h, fps } = await extractFrames(url, start, end, {
    onProgress: (p) => opts.onProgress?.("frames", p),
  });

  await initPose();
  const kps: (Keypoints | null)[] = [];
  for (let i = 0; i < frames.length; i++) {
    kps.push(extractKeypoints(frames[i].canvas, w, h));
    opts.onProgress?.("pose", (i + 1) / frames.length);
  }

  const detectRate = kps.filter(Boolean).length / kps.length;
  const vel = wristVelocity(kps, fps);
  const acc = wristAccel(vel, fps);
  const phases = detectPhases(kps, vel, acc);

  const hint = strokeOpt === "auto" ? "auto" : strokeOpt;
  let contactIdx = findContactFrame(kps, vel, phases, hint, hand);
  if (contactIdx == null || !kps[contactIdx]) {
    contactIdx = vel.indexOf(Math.max(...vel));
  }

  const contactAngles: Angles | null = kps[contactIdx] ? jointAngles(kps[contactIdx], hand) : null;
  const loadingAngles: LoadingAngles | null = bestLoadingAngles(kps, phases, hand);

  const strokeType: Stroke =
    strokeOpt !== "auto"
      ? (strokeOpt as Stroke)
      : kps[contactIdx]
      ? classifyStroke(kps[contactIdx], kps, phases, hand)
      : "unknown";

  const follow = followThroughComplete(kps, phases);
  const scores = scoreSwing(contactAngles, strokeType, follow, loadingAngles);
  const report = generateReport(scores, contactAngles, strokeType, loadingAngles, lang);
  const corrections = topCorrections(scores, contactAngles, strokeType, loadingAngles, lang, 2);
  const summary = swingSummary(scores, contactAngles, strokeType, loadingAngles, lang);
  const merged = { ...(contactAngles ?? {}), ...(loadingAngles ?? {}) };
  const warnings = injuryWarnings(merged, strokeType, lang);

  const phaseCounts: Record<string, number> = {};
  for (const p of phases) phaseCounts[p] = (phaseCounts[p] ?? 0) + 1;

  return {
    ok: true,
    fps,
    frame_w: w,
    frame_h: h,
    n_frames: frames.length,
    pose_detect_rate: Math.round(detectRate * 1000) / 1000,
    stroke: strokeType,
    stroke_forced: strokeOpt !== "auto",
    contact_frame: contactIdx,
    contact_time_sec: Math.round((frames[contactIdx]?.t ?? 0) * 1000) / 1000,
    follow_through_complete: follow,
    angles: round1(merged as Record<string, number>),
    contact_angles: round1(contactAngles as unknown as Record<string, number>),
    loading_angles: round1(loadingAngles as unknown as Record<string, number>),
    scores,
    swing_score: scores ? Math.round(scores.overall * 10) / 10 : null,
    corrections,
    summary,
    report,
    injury_warnings: warnings,
    phase_counts: phaseCounts,
    lang,
    hand,
    _frames: frames,
    _keypoints: kps,
    _phases: phases,
    _velocities: vel,
  };
}

export { strokeName };
