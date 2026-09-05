// Copy the MediaPipe wasm out of node_modules and fetch the pose model into
// web/public/ so `vite build` can bundle them. Run automatically by `prebuild`.
// These are large binaries, kept out of git.
import { cp, mkdir, access, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WASM_SRC = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const WASM_DST = join(root, "public/mediapipe/wasm");
const MODEL_DST = join(root, "public/models/pose_landmarker_lite.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

const exists = (p) => access(p).then(() => true, () => false);

await mkdir(WASM_DST, { recursive: true });
await cp(WASM_SRC, WASM_DST, { recursive: true });
console.log("wasm  -> public/mediapipe/wasm");

await mkdir(dirname(MODEL_DST), { recursive: true });
if (await exists(MODEL_DST)) {
  const { size } = await stat(MODEL_DST);
  console.log(`model -> already present (${(size / 1e6).toFixed(1)} MB)`);
} else {
  console.log("model -> downloading pose_landmarker_lite.task …");
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(MODEL_DST));
  const { size } = await stat(MODEL_DST);
  console.log(`model -> ${(size / 1e6).toFixed(1)} MB`);
}
