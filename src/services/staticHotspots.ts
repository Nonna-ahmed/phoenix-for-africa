import { filterHotspots, type FirmsResult } from "@/lib/firms.functions";

export const STATIC_HOTSPOTS_URL = "/data/hotspots-southern-africa.json";
export const PILOT_BBOX: [number, number, number, number] = [24.8, -13.0, 29.0, -8.2];
export const HOTSPOTS_MAX_AGE_H = 36;

/** True when the requested bbox overlaps the file's coverage rectangle (W,S,E,N). */
export function bboxOverlaps(b: [number, number, number, number] | undefined, cov: number[] | undefined): boolean {
  return !!b && !!cov && cov.length === 4 && b[0] <= cov[2]! && b[2] >= cov[0]! && b[1] <= cov[3]! && b[3] >= cov[1]!;
}

const empty = (status: "not_configured" | "error", message: string): FirmsResult =>
  ({ status, message, hotspots: [], total: 0, truncated: false, fetchedAt: new Date().toISOString() });

/** Reads the small static hotspots file. Never falls back to a heavy server fetch. Missing/stale/bad file is an explicit unavailable state. */
export async function loadStaticHotspots(bbox: [number, number, number, number] | undefined, days: number, now = new Date()): Promise<FirmsResult> {
  if (!bbox) return empty("not_configured", "Hotspots need a map area");
  try {
    const r = await fetch(STATIC_HOTSPOTS_URL);
    if (!r.ok) return empty("error", `Hotspot file unavailable (${r.status})`);
    const j = await r.json();
    const age = now.getTime() - Date.parse(j?.fetchedAt);
    if (j?.status !== "ok" || !Array.isArray(j.hotspots) || !Number.isFinite(age)) return empty("error", "Hotspot file invalid");
    if (age > HOTSPOTS_MAX_AGE_H * 3600_000) return empty("error", "Hotspot file is stale (older than 36 h), not shown as current");
    if (!bboxOverlaps(bbox, j.coverage_WSEN)) return empty("not_configured", "This area is outside the free regional NASA file (Southern Africa)");
    const hotspots = filterHotspots(j.hotspots, bbox, days, now);
    const partial = bbox[3] > j.coverage_WSEN[3] || bbox[1] < j.coverage_WSEN[1] || bbox[0] < j.coverage_WSEN[0] || bbox[2] > j.coverage_WSEN[2];
    return { ...j, message: partial ? "Partial coverage: the free NASA regional file covers Southern Africa only; the northern part of this area is not covered. " + (j.message ?? "") : j.message, hotspots, total: hotspots.length, truncated: false };
  } catch { return empty("error", "Hotspot file could not be loaded"); }
}
