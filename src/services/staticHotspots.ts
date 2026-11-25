import { filterHotspots, type FirmsResult } from "@/lib/firms.functions";

export const STATIC_HOTSPOTS_URL = "/data/hotspots-haut-katanga.json";
export const PILOT_BBOX: [number, number, number, number] = [24.8, -13.0, 29.0, -8.2];
export const HOTSPOTS_MAX_AGE_H = 36;

/** True when the requested bbox lies inside the pilot rectangle (the only area the static file covers). */
export function bboxInPilot(b?: [number, number, number, number]): boolean {
  return !!b && b[0] >= PILOT_BBOX[0] && b[1] >= PILOT_BBOX[1] && b[2] <= PILOT_BBOX[2] + 1e-9 && b[3] <= PILOT_BBOX[3] + 1e-9;
}

const empty = (status: "not_configured" | "error", message: string): FirmsResult =>
  ({ status, message, hotspots: [], total: 0, truncated: false, fetchedAt: new Date().toISOString() });

/** Reads the small static hotspots file. Never falls back to a heavy server fetch. Missing/stale/bad file is an explicit unavailable state. */
export async function loadStaticHotspots(bbox: [number, number, number, number] | undefined, days: number, now = new Date()): Promise<FirmsResult> {
  if (!bboxInPilot(bbox)) return empty("not_configured", "Hotspots are only available for the pilot study area without a NASA MAP_KEY backend");
  try {
    const r = await fetch(STATIC_HOTSPOTS_URL);
    if (!r.ok) return empty("error", `Hotspot file unavailable (${r.status})`);
    const j = await r.json();
    const age = now.getTime() - Date.parse(j?.fetchedAt);
    if (j?.status !== "ok" || !Array.isArray(j.hotspots) || !Number.isFinite(age)) return empty("error", "Hotspot file invalid");
    if (age > HOTSPOTS_MAX_AGE_H * 3600_000) return empty("error", "Hotspot file is stale (older than 36 h), not shown as current");
    const hotspots = filterHotspots(j.hotspots, bbox!, days, now);
    return { ...j, hotspots, total: hotspots.length, truncated: false };
  } catch { return empty("error", "Hotspot file could not be loaded"); }
}
