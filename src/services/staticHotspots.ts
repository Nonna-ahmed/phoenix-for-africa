import { filterHotspots, type FirmsResult, type Hotspot } from "@/lib/firms.functions";

/** One static file per NASA FIRMS region, written by backend/hotspots.py. Coverage rectangles come from the files themselves. */
export const STATIC_HOTSPOT_FILES = ["/data/hotspots-southern-africa.json", "/data/hotspots-northern-central-africa.json"];
export const HOTSPOTS_MAX_AGE_H = 36;
type BBox = [number, number, number, number];

/** True when the requested bbox overlaps a coverage rectangle (W,S,E,N). */
export function bboxOverlaps(b: BBox | undefined, cov: number[] | undefined): boolean {
  return !!b && !!cov && cov.length === 4 && b[0] <= cov[2]! && b[2] >= cov[0]! && b[1] <= cov[3]! && b[3] >= cov[1]!;
}

/** Share (0-100) of the bbox area inside the union of coverage rectangles (sampled on a 40x40 grid). */
export function coveragePct(b: BBox, covs: number[][]): number {
  const n = 40; let hit = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = b[0] + ((i + 0.5) / n) * (b[2] - b[0]), y = b[1] + ((j + 0.5) / n) * (b[3] - b[1]);
    if (covs.some((c) => x >= c[0]! && x <= c[2]! && y >= c[1]! && y <= c[3]!)) hit++;
  }
  return Math.round((100 * hit) / (n * n));
}

const empty = (status: "not_configured" | "error", message: string): FirmsResult =>
  ({ status, message, hotspots: [], total: 0, truncated: false, fetchedAt: new Date().toISOString() });

async function loadOne(url: string, now: Date): Promise<{ ok: true; j: any } | { ok: false; why: string }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, why: `Hotspot file unavailable (${r.status})` };
    const j = await r.json();
    const age = now.getTime() - Date.parse(j?.fetchedAt);
    if (j?.status !== "ok" || !Array.isArray(j.hotspots) || !Number.isFinite(age) || !Array.isArray(j.coverage_WSEN)) return { ok: false, why: "Hotspot file invalid" };
    if (age > HOTSPOTS_MAX_AGE_H * 3600_000) return { ok: false, why: "Hotspot file is stale (older than 36 h), not shown as current" };
    return { ok: true, j };
  } catch { return { ok: false, why: "Hotspot file could not be loaded" }; }
}

/** Reads the small static hotspot files that overlap the map area. Never falls back to a heavy server fetch.
 * A missing/stale/bad file, or an area not covered, is an explicit unavailable state, never "no hotspots". */
export async function loadStaticHotspots(bbox: BBox | undefined, days: number, now = new Date(), files: string[] = STATIC_HOTSPOT_FILES): Promise<FirmsResult> {
  if (!bbox) return empty("not_configured", "Hotspots need a map area");
  const loaded = await Promise.all(files.map((u) => loadOne(u, now)));
  const good = loaded.flatMap((l) => (l.ok ? [l.j] : []));
  const covering = good.filter((j) => bboxOverlaps(bbox, j.coverage_WSEN));
  const failed = loaded.filter((l): l is { ok: false; why: string } => !l.ok);
  if (!covering.length) {
    // Unknown whether a failed file would have covered this area: report the failure, otherwise "outside coverage".
    if (failed.length) return empty("error", failed[0]!.why);
    return empty("not_configured", "This area is outside the free regional NASA files (Africa)");
  }
  const seen = new Set<string>(); const all: Hotspot[] = [];
  for (const j of covering) for (const h of j.hotspots as Hotspot[]) {
    const k = `${h.lat}|${h.lon}|${h.acqDate}|${h.acqTime}|${h.source}`;
    if (!seen.has(k)) { seen.add(k); all.push(h); }
  }
  const hotspots = filterHotspots(all, bbox, days, now);
  const areaPct = coveragePct(bbox, good.map((j) => j.coverage_WSEN));
  const fileDays = Math.min(...covering.map((j) => (typeof j.days_covered === "number" ? j.days_covered : 2)));
  const caveats: string[] = [];
  if (areaPct < 99) caveats.push(`Spatial coverage: only about ${areaPct}% of this area is inside the free regional NASA files. Hotspots outside them are not included; that does not mean there were none.`);
  if (failed.length) caveats.push(`${failed.length} regional file(s) could not be used (${failed[0]!.why}); that part of the map is missing, not empty.`);
  if (days > fileDays) caveats.push(`Time coverage: these files hold only the last ${fileDays} UTC days, but ${days} were requested. Older detections are not included; that does not mean there were none.`);
  const fetchedAt = covering.map((j) => j.fetchedAt as string).sort()[0]!;
  return { status: "ok", message: covering[0].message, hotspots, total: hotspots.length, truncated: false, fetchedAt, caveats, areaCoveragePct: areaPct, daysCovered: Math.min(days, fileDays) };
}
