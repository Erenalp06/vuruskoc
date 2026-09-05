// On-device pose extraction via MediaPipe Tasks for Web (model + wasm bundled in /public).
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { L, type Keypoints } from "./landmarks";

let lm: PoseLandmarker | null = null;
let initP: Promise<PoseLandmarker> | null = null;

async function create(delegate: "GPU" | "CPU"): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate },
    runningMode: "IMAGE",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
  });
}

export function initPose(): Promise<PoseLandmarker> {
  if (lm) return Promise.resolve(lm);
  if (!initP) {
    initP = create("GPU")
      .catch(() => create("CPU"))
      .then((x) => (lm = x));
  }
  return initP;
}

export function extractKeypoints(
  source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap,
  w: number,
  h: number
): Keypoints | null {
  if (!lm) throw new Error("pose not initialized");
  const res = lm.detect(source);
  const set = res.landmarks?.[0];
  if (!set) return null;
  const kp = {} as Keypoints;
  for (const [name, idx] of Object.entries(L)) {
    const p = set[idx];
    kp[name] = [p.x * w, p.y * h, p.z, (p as { visibility?: number }).visibility ?? 1];
  }
  return kp;
}
