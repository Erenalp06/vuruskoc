// Swing phase / contact / stroke detection — mirrored from core/swing_classifier.py.
import type { Keypoints } from "./landmarks";
import { jointAngles } from "./angles";

export type Phase = "idle" | "preparation" | "loading" | "contact" | "follow_through";
export type Side = "right" | "left";
export type Stroke = "forehand" | "backhand" | "serve" | "unknown";

const ACCEL_THRESHOLD = 800;
const argmax = (a: number[]) => a.reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0);

export function wristVelocity(seq: (Keypoints | null)[], fps = 30): number[] {
  const out = [0];
  for (let i = 1; i < seq.length; i++) {
    const c = seq[i], p = seq[i - 1];
    if (!c || !p) { out.push(0); continue; }
    const d = Math.hypot(c.right_wrist[0] - p.right_wrist[0], c.right_wrist[1] - p.right_wrist[1]);
    out.push(d * fps);
  }
  return out;
}

export function wristAccel(vel: number[], fps = 30): number[] {
  const out = [0];
  for (let i = 1; i < vel.length; i++) out.push((vel[i] - vel[i - 1]) * fps);
  return out;
}

function torsoLen(kp: Keypoints): number {
  const shY = (kp.left_shoulder[1] + kp.right_shoulder[1]) / 2;
  const hipY = (kp.left_hip[1] + kp.right_hip[1]) / 2;
  return Math.abs(hipY - shY) + 1e-6;
}
function wristAboveRatio(kp: Keypoints, side: Side): number {
  return (kp[`${side}_shoulder`][1] - kp[`${side}_wrist`][1]) / torsoLen(kp);
}

export function detectPhases(seq: (Keypoints | null)[], vel: number[], acc: number[]): Phase[] {
  const n = seq.length;
  const phases: Phase[] = new Array(n).fill("idle");
  if (n < 5) return phases;

  const peak = argmax(vel);
  if (vel[peak] < 50) return phases;

  let loadingStart = peak;
  for (let i = peak - 1; i >= 0; i--) {
    if (Math.abs(acc[i]) < ACCEL_THRESHOLD * 0.3) { loadingStart = i; break; }
  }
  let prepStart = loadingStart;
  for (let i = loadingStart - 1; i >= 0; i--) {
    if (vel[i] < vel[loadingStart] * 0.1) { prepStart = i; break; }
  }
  let followEnd = n - 1;
  const peakVel = vel[peak];
  for (let i = peak + 1; i < n; i++) {
    if (vel[i] < peakVel * 0.2) { followEnd = i; break; }
  }

  for (let i = 0; i < n; i++) {
    if (i < prepStart) phases[i] = "idle";
    else if (i < loadingStart) phases[i] = "preparation";
    else if (i < peak) phases[i] = "loading";
    else if (i === peak) phases[i] = "contact";
    else if (i <= followEnd) phases[i] = "follow_through";
    else phases[i] = "idle";
  }
  return phases;
}

export function findContactFrame(
  seq: (Keypoints | null)[], vel: number[], phases: Phase[],
  strokeHint: Stroke | "auto" = "auto", side: Side = "right"
): number {
  const n = seq.length;
  if (n === 0) return 0;
  const peak = vel.length ? argmax(vel) : 0;

  let window = phases.map((p, i) => (["loading", "contact", "follow_through"].includes(p) ? i : -1)).filter((i) => i >= 0);
  if (!window.length) {
    const lo = Math.max(0, peak - 8), hi = Math.min(n, peak + 9);
    window = Array.from({ length: hi - lo }, (_, k) => lo + k);
  }
  const valid = window.filter((i) => seq[i]);
  if (!valid.length) return peak;

  const vmax = Math.max(...vel) || 1;

  if (strokeHint === "serve") {
    return valid.reduce((best, i) => {
      const s = 0.7 * wristAboveRatio(seq[i]!, side) + 0.3 * vel[i] / vmax;
      const bs = 0.7 * wristAboveRatio(seq[best]!, side) + 0.3 * vel[best] / vmax;
      return s > bs ? i : best;
    }, valid[0]);
  }

  const score = (i: number) => {
    const kp = seq[i]!;
    const cx = (kp.left_shoulder[0] + kp.right_shoulder[0]) / 2;
    const shW = Math.abs(kp.right_shoulder[0] - kp.left_shoulder[0]) + 1e-6;
    const ext = Math.min(Math.abs(kp[`${side}_wrist`][0] - cx) / shW, 2) / 2;
    const above = wristAboveRatio(kp, side);
    let s = 0.4 * (vel[i] / vmax) + 0.6 * ext;
    if (above > 0.15) s -= 2 * (above - 0.15);
    return s;
  };
  return valid.reduce((best, i) => (score(i) > score(best) ? i : best), valid[0]);
}

export function classifyStroke(
  kp: Keypoints | null, seq: (Keypoints | null)[], phases: Phase[], side: Side = "right"
): Stroke {
  if (!kp) return "unknown";
  const s = side;

  const swing = phases
    .map((p, i) => (["loading", "contact", "follow_through"].includes(p) ? seq[i] : null))
    .filter((k): k is Keypoints => !!k);
  if (swing.length >= 4) {
    const elevated = swing.filter((k) => wristAboveRatio(k, s) > 0.15).length;
    if (elevated / swing.length > 0.6) return "serve";
  } else if (wristAboveRatio(kp, s) > 0.35) {
    return "serve";
  }

  const rShX = kp.right_shoulder[0], lShX = kp.left_shoulder[0], rWrX = kp.right_wrist[0];
  const center = (rShX + lShX) / 2;
  const facingRight = rShX > lShX;
  if (facingRight) return rWrX > center ? "forehand" : "backhand";
  return rWrX < center ? "forehand" : "backhand";
}

export type LoadingAngles = { shoulder_angle: number; knee_angle: number; racket_lag: number };

export function bestLoadingAngles(
  seq: (Keypoints | null)[], phases: Phase[], side: Side = "right"
): LoadingAngles | null {
  let idx = phases.map((p, i) => (p === "loading" ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) {
    const prep = phases.map((p, i) => (p === "preparation" ? i : -1)).filter((i) => i >= 0);
    if (prep.length) idx = prep.slice(Math.floor(prep.length * 0.7));
  }
  if (!idx.length) return null;

  const best = { shoulder_angle: 0, knee_angle: 180, racket_lag: 0 };
  let found = false;
  for (const fi of idx) {
    if (!seq[fi]) continue;
    const a = jointAngles(seq[fi], side);
    if (!a) continue;
    found = true;
    best.shoulder_angle = Math.max(best.shoulder_angle, a.shoulder_angle);
    best.knee_angle = Math.min(best.knee_angle, a.knee_angle);
    best.racket_lag = Math.max(best.racket_lag, a.racket_lag);
  }
  return found ? best : null;
}

export function followThroughComplete(seq: (Keypoints | null)[], phases: Phase[]): boolean {
  const fr = phases.map((p, i) => (p === "follow_through" ? i : -1)).filter((i) => i >= 0);
  if (!fr.length || !seq[fr[fr.length - 1]]) return false;
  const k = seq[fr[fr.length - 1]]!;
  const rWrX = k.right_wrist[0];
  const center = (k.left_shoulder[0] + k.right_shoulder[0]) / 2;
  const facingRight = k.right_shoulder[0] > k.left_shoulder[0];
  return facingRight ? rWrX < center : rWrX > center;
}
