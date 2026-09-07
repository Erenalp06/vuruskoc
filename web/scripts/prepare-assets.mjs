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

// MLC model-lib for the on-device coach LLM (Faz 1). Fetched at build time so it
// is served same-origin, not from raw.githubusercontent.com at runtime. The
// v0_2_84 path tracks the pinned @mlc-ai/web-llm version; bump both together.
// Filename must match LLM_MODEL_LIB in src/coach/llm.ts.
const LLM_LIB_NAME = "Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm";
const LLM_LIB_DST = join(root, "public/webllm", LLM_LIB_NAME);
const LLM_LIB_URL =
  "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/" +
  LLM_LIB_NAME;

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

await mkdir(dirname(LLM_LIB_DST), { recursive: true });
if (await exists(LLM_LIB_DST)) {
  const { size } = await stat(LLM_LIB_DST);
  console.log(`llm-lib -> already present (${(size / 1e6).toFixed(1)} MB)`);
} else {
  console.log("llm-lib -> downloading MLC model-lib wasm …");
  const res = await fetch(LLM_LIB_URL);
  if (!res.ok) throw new Error(`llm-lib download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(LLM_LIB_DST));
  const { size } = await stat(LLM_LIB_DST);
  console.log(`llm-lib -> ${(size / 1e6).toFixed(1)} MB`);
}
