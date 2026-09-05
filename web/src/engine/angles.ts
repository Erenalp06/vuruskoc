// Joint-angle math, mirrored from core/pose_engine.py get_joint_angles().
import type { Keypoints } from "./landmarks";

export type Angles = {
  elbow_angle: number;
  shoulder_angle: number;
  hip_rotation: number;
  knee_angle: number;
  racket_lag: number;
  contact_height_ratio: number;
};

const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Angle at p2 formed by p1-p2-p3, in degrees. */
export function angleAt(
  p1: [number, number, ...number[]],
  p2: [number, number, ...number[]],
  p3: [number, number, ...number[]]
): number {
  const v1x = p1[0] - p2[0], v1y = p1[1] - p2[1];
  const v2x = p3[0] - p2[0], v2y = p3[1] - p2[1];
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
  const cos = clamp((v1x * v2x + v1y * v2y) / (n1 * n2 + 1e-8), -1, 1);
  return deg(Math.acos(cos));
}

export function jointAngles(kp: Keypoints | null, side: "right" | "left" = "right"): Angles | null {
  if (!kp) return null;
  const s = side;
  const g = (n: string) => kp[n];

  const elbow_angle = angleAt(g(`${s}_shoulder`), g(`${s}_elbow`), g(`${s}_wrist`));
  const shoulder_angle = angleAt(g(`${s}_elbow`), g(`${s}_shoulder`), g(`${s}_hip`));

  const shoulderW = Math.hypot(
    kp.right_shoulder[0] - kp.left_shoulder[0],
    kp.right_shoulder[1] - kp.left_shoulder[1]
  );
  const hipW = Math.hypot(
    kp.right_hip[0] - kp.left_hip[0],
    kp.right_hip[1] - kp.left_hip[1]
  );
  const widthRatio = shoulderW / (hipW + 1e-8);
  const zDiff = Math.abs(kp.right_shoulder[2] - kp.left_shoulder[2]);
  const rotFromWidth = Math.max(0, Math.min(180, (1 - widthRatio) * 150));
  const rotFromZ = Math.min(180, zDiff * 300);
  const hip_rotation = Math.max(rotFromWidth, rotFromZ);

  const knee_angle = angleAt(g(`${s}_hip`), g(`${s}_knee`), g(`${s}_ankle`));

  const ex = g(`${s}_elbow`)[0], ey = g(`${s}_elbow`)[1];
  const wx = g(`${s}_wrist`)[0], wy = g(`${s}_wrist`)[1];
  const fx = wx - ex, fy = wy - ey;
  const cosLag = clamp(fy / (Math.hypot(fx, fy) + 1e-8), -1, 1);
  const racket_lag = deg(Math.acos(cosLag));

  const hipY = g(`${s}_hip`)[1];
  const wristY = Math.max(g(`${s}_wrist`)[1], 1);
  const contact_height_ratio = clamp(hipY / wristY, 0, 6);

  return { elbow_angle, shoulder_angle, hip_rotation, knee_angle, racket_lag, contact_height_ratio };
}
