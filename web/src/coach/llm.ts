// Faz 1 — optional on-device LLM (WebLLM, Qwen2.5 family, q4f16).
//
// Progressive enhancement over the rule-based coach (respond.ts): only ever
// loads when the device has WebGPU *and* the user explicitly opts in. Model
// shards are fetched once from the HuggingFace CDN and then live in the
// browser's Cache API — offline after the first load. If anything here fails,
// Coach.tsx silently falls back to the rule-based engine.
//
// The whole @mlc-ai/web-llm module (~6 MB / ~2 MB gzip) is behind the dynamic
// import below, split into its own `webllm` chunk that the PWA never precaches.
// The per-model WebGPU-kernel lib (.wasm) is served same-origin from
// /webllm/ (see scripts/prepare-assets.mjs) instead of raw.githubusercontent.com.
import type {
  MLCEngineInterface,
  InitProgressReport,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";

export type LLMModelKey = "fast" | "balanced" | "max";

export type LLMModelSpec = {
  key: LLMModelKey;
  id: string;         // web-llm prebuilt model_id
  label: string;      // UI tier name
  sub: string;        // model name
  downloadMB: number; // approx one-time download
  lib: string;        // filename under /webllm/ (matches prepare-assets.mjs)
  note: string;       // hardware hint
};

export const LLM_MODELS: Record<LLMModelKey, LLMModelSpec> = {
  fast: {
    key: "fast", id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Hızlı", sub: "Qwen2.5 1.5B", downloadMB: 950,
    lib: "Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm",
    note: "Çoğu telefon ve dizüstünde çalışır.",
  },
  balanced: {
    key: "balanced", id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "Dengeli", sub: "Qwen2.5 3B", downloadMB: 1900,
    lib: "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm",
    note: "Daha iyi Türkçe. ~3 GB boş GPU belleği ister.",
  },
  max: {
    key: "max", id: "Qwen2.5-7B-Instruct-q4f16_1-MLC",
    label: "Güçlü", sub: "Qwen2.5 7B", downloadMB: 4500,
    lib: "Qwen2-7B-Instruct-q4f16_1_cs1k-webgpu.wasm",
    note: "En iyi cevaplar. Güçlü masaüstü GPU / bol RAM'li Mac.",
  },
};
export const LLM_MODEL_KEYS: LLMModelKey[] = ["fast", "balanced", "max"];
export const DEFAULT_MODEL_KEY: LLMModelKey = "fast";

export const LLM_OPTIN_KEY = "vk-coach-llm";        // "1" once opted in
export const LLM_MODEL_STORE = "vk-coach-llm-model"; // LLMModelKey

export type LLMPhase = "idle" | "unsupported" | "loading" | "ready" | "error";

/** WebGPU is the hard requirement for WebLLM; there is no WASM fallback. */
export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function llmOptedIn(): boolean {
  try { return localStorage.getItem(LLM_OPTIN_KEY) === "1"; } catch { return false; }
}
export function setLlmOptIn(on: boolean) {
  try {
    if (on) localStorage.setItem(LLM_OPTIN_KEY, "1");
    else localStorage.removeItem(LLM_OPTIN_KEY);
  } catch { /* private mode — non-fatal */ }
}
export function savedModelKey(): LLMModelKey {
  try {
    const k = localStorage.getItem(LLM_MODEL_STORE);
    if (k === "fast" || k === "balanced" || k === "max") return k;
  } catch { /* ignore */ }
  return DEFAULT_MODEL_KEY;
}
export function setSavedModelKey(k: LLMModelKey) {
  try { localStorage.setItem(LLM_MODEL_STORE, k); } catch { /* ignore */ }
}

let enginePromise: Promise<MLCEngineInterface> | null = null;
let loadedKey: LLMModelKey | null = null;

/** Load (or return the already-loading) engine for `key`. */
export function loadCoachLLM(
  key: LLMModelKey,
  onProgress?: (p: InitProgressReport) => void,
): Promise<MLCEngineInterface> {
  if (enginePromise && loadedKey === key) return enginePromise;
  loadedKey = key;
  const spec = LLM_MODELS[key];
  enginePromise = import("@mlc-ai/web-llm").then((webllm) => {
    const base = webllm.prebuiltAppConfig;
    const appConfig: typeof base = {
      ...base,
      model_list: base.model_list.map((m) =>
        m.model_id === spec.id
          ? { ...m, model_lib: new URL(`/webllm/${spec.lib}`, location.origin).href }
          : m,
      ),
    };
    return webllm.CreateMLCEngine(spec.id, { appConfig, initProgressCallback: onProgress });
  });
  enginePromise.catch(() => { enginePromise = null; loadedKey = null; });
  return enginePromise;
}

export function coachLLMKey(): LLMModelKey | null {
  return enginePromise ? loadedKey : null;
}

/** Unload the current model and free its VRAM (before switching models). */
export async function resetCoachLLM(): Promise<void> {
  const p = enginePromise;
  enginePromise = null;
  loadedKey = null;
  try { (await p)?.unload?.(); } catch { /* ignore */ }
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
