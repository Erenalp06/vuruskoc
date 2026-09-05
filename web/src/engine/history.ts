// Local, on-device history — IndexedDB via idb-keyval. Nothing leaves the device.
import { get, set, del, keys } from "idb-keyval";
import type { Keypoints } from "./landmarks";
import type { AnalyzeResult } from "./analyze";

const PREFIX = "vk:analysis:";

export type StoredResult = Omit<AnalyzeResult, "_frames" | "_keypoints" | "_phases" | "_velocities">;

export type HistoryEntry = {
  id: string;
  created_at: string;
  name: string;
  result: StoredResult;
  keypoints: (Keypoints | null)[]; // kept so Pro-overlay works from history, offline
  phases: string[];
  annotated?: Blob;
};

export function stripResult(r: AnalyzeResult): StoredResult {
  const { _frames, _keypoints, _phases, _velocities, ...rest } = r;
  return rest;
}

export async function saveEntry(e: HistoryEntry): Promise<void> {
  await set(PREFIX + e.id, e);
}
export async function getEntry(id: string): Promise<HistoryEntry | undefined> {
  return get<HistoryEntry>(PREFIX + id);
}
export async function deleteEntry(id: string): Promise<void> {
  await del(PREFIX + id);
}
export async function listEntries(): Promise<HistoryEntry[]> {
  const ks = (await keys()).filter((k) => typeof k === "string" && (k as string).startsWith(PREFIX)) as string[];
  const all = await Promise.all(ks.map((k) => get<HistoryEntry>(k)));
  return (all.filter(Boolean) as HistoryEntry[]).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
