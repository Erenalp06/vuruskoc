// Faz 1 — optional on-device LLM (WebLLM + Qwen2.5-1.5B-Instruct, q4f16).
//
// Progressive enhancement over the rule-based coach (respond.ts): only ever
// loads when the device has WebGPU *and* the user explicitly opts in. Model
// shards are fetched once from the HuggingFace CDN and then live in the
// browser's Cache API — offline after the first load. If anything here fails,
// Coach.tsx silently falls back to the rule-based engine.
//
// The whole @mlc-ai/web-llm module (~6 MB / ~2 MB gzip) is behind the dynamic
// import below, split into its own `webllm` chunk that the PWA never precaches.
import type {
  MLCEngineInterface,
  InitProgressReport,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";

export const LLM_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const LLM_MODEL_LABEL = "Qwen2.5 1.5B";
export const LLM_DOWNLOAD_MB = 950; // ~ total shard size, for the opt-in copy
export const LLM_OPTIN_KEY = "vk-coach-llm"; // localStorage: "1" once opted in

export type LLMPhase = "idle" | "unsupported" | "loading" | "ready" | "error";

/** WebGPU is the hard requirement for WebLLM; there is no WASM fallback. */
export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function llmOptedIn(): boolean {
  try {
    return localStorage.getItem(LLM_OPTIN_KEY) === "1";
  } catch {
    return false;
  }
}
export function setLlmOptIn(on: boolean) {
  try {
    if (on) localStorage.setItem(LLM_OPTIN_KEY, "1");
    else localStorage.removeItem(LLM_OPTIN_KEY);
  } catch {
    /* private mode — non-fatal */
  }
}

let enginePromise: Promise<MLCEngineInterface> | null = null;

/** Load (or return the already-loading) engine. Safe to call repeatedly. */
export function loadCoachLLM(
  onProgress?: (p: InitProgressReport) => void,
): Promise<MLCEngineInterface> {
  if (enginePromise) return enginePromise;
  enginePromise = import("@mlc-ai/web-llm").then((webllm) =>
    webllm.CreateMLCEngine(LLM_MODEL_ID, { initProgressCallback: onProgress }),
  );
  enginePromise.catch(() => {
    enginePromise = null; // allow a retry after a failed load
  });
  return enginePromise;
}

export function coachLLMLoaded(): boolean {
  return enginePromise != null;
}

/** Stream the assistant reply token-by-token. */
export async function* streamCoachLLM(
  engine: MLCEngineInterface,
  messages: ChatCompletionMessageParam[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.5,
    top_p: 0.9,
    max_tokens: 640,
  });
  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const piece = chunk.choices[0]?.delta?.content;
    if (piece) yield piece;
  }
}
