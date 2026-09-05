export * from "./landmarks";
export * from "./angles";
export * from "./swing";
export * from "./coaching";
export * from "./pose";
export * from "./frames";
export * from "./analyze";
export * from "./overlay";
export * from "./history";

import { loadVideo } from "./frames";

export async function probeVideo(url: string): Promise<{ duration: number; width: number; height: number }> {
  const v = await loadVideo(url);
  const out = { duration: v.duration || 0, width: v.videoWidth || 0, height: v.videoHeight || 0 };
  v.src = "";
  return out;
}
