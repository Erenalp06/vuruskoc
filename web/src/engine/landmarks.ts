// MediaPipe Pose landmark indices + skeleton, mirrored from core/pose_engine.py.

export const L = {
  nose: 0,
  left_shoulder: 11, right_shoulder: 12,
  left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16,
  left_hip: 23, right_hip: 24,
  left_knee: 25, right_knee: 26,
  left_ankle: 27, right_ankle: 28,
  left_pinky: 17, right_pinky: 18,
  left_index: 19, right_index: 20,
} as const;

export type JointName = keyof typeof L;

export const SKELETON: [JointName, JointName][] = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];

/** One detected pose: joint name -> pixel x, y, normalized z, visibility. */
export type Keypoints = Record<string, [number, number, number, number]>;
