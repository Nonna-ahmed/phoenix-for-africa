/**
 * EXPERIMENTAL risk layer served as static files (no backend server needed).
 * One file per study area: /data/risk-<region>.json, written daily by backend/predict.py.
 * /data/regions-manifest.json (written by backend/manifest.py) decides whether an estimate may be
 * shown for a region: it only says yes when that region's own model test passed.
 */
import type { AreaQuery, RiskPoint } from "./api/endpoints";
import { getCountry } from "@/data/registry";

export const MANIFEST_URL = "/data/regions-manifest.json";
/** Kept for compatibility with older links; the pilot study area. */
export const STATIC_RISK_URL = "/data/risk-haut-katanga.json";

export const riskUrl = (regionId: string) => `/data/risk-${regionId}.json`;

/** Study areas that actually ship a static risk file (generated from backend/regions.json). */
export const STATIC_REGION_IDS = ["haut-katanga", "ao-moxico", "zm-central", "mz-zambezia", "tz-ruvuma", "ng-middle-belt", "gh-north", "sn-groundnut", "cm-adamawa", "mg-west", "za-limpopo", "zw-mashonaland", "et-south"];

/** True when this query is served by static files: a region (or country) that has a tested model. */
export function staticCovers(a: AreaQuery | null | undefined): boolean {
  if (!a) return false;
  const c = getCountry(a.country);
  if (!c) return false;
  if (!a.region) return c.regions.some((r) => STATIC_REGION_IDS.includes(r.id));
  return c.regions.some((r) => r.id === a.region && STATIC_REGION_IDS.includes(r.id));
}

/** Region ids to load for a query: the one region, or every study area in the country. */
export function staticRegionIds(a: AreaQuery): string[] {
  const c = getCountry(a.country);
  if (!c) return [];
  const withModel = c.regions.filter((r) => STATIC_REGION_IDS.includes(r.id));
  if (a.region) return withModel.filter((r) => r.id === a.region).map((r) => r.id);
  return withModel.map((r) => r.id);
}

interface StaticCell { lat: number; lon: number; probability: number; risk_level: string; date: string }

/** Estimates are shown only if the build-time validation (backend/manifest.py) says so for this region. */
export async function assertEstimatesAvailable(signal?: AbortSignal, regionId = "haut-katanga"): Promise<void> {
  const r = await fetch(MANIFEST_URL, { signal: signal ?? null, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`No validation manifest (HTTP ${r.status}): estimates unavailable`);
  const m = (await r.json()) as { regions?: { id: string; estimates_available?: boolean; reasons?: string[] }[] };
  const e = m.regions?.find((x) => x.id === regionId);
  if (!e || e.estimates_available !== true) throw new Error(`Estimates not validated for ${regionId}: ${(e?.reasons ?? ["not in manifest"]).join("; ")}`);
}

export async function loadStaticRisk(signal?: AbortSignal, now: Date = new Date(), regionId = "haut-katanga"): Promise<RiskPoint[]> {
  await assertEstimatesAvailable(signal, regionId);
  const url = riskUrl(regionId);
  const res = await fetch(url, { signal: signal ?? null, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  const doc = (await res.json()) as { cells?: StaticCell[]; date?: string; generated_utc?: string };
  // Never show a file that targets another UTC day as current risk: unavailable is not "low".
  if (isStale({ date: doc.date, generated_utc: doc.generated_utc }, now)) throw new Error("Risk file is not for today (UTC): unavailable, not low risk");
  return (doc.cells ?? [])
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .map((c) => ({ lat: c.lat, lon: c.lon, probability: Number.isFinite(c.probability) ? c.probability : null, level: c.risk_level ?? null, date: c.date ?? null, environment: null }));
}

/** Load every study area in scope (one region, or all of a country's tested regions). */
export async function loadStaticRiskForArea(a: AreaQuery, signal?: AbortSignal, now: Date = new Date()): Promise<RiskPoint[]> {
  const ids = staticRegionIds(a);
  if (ids.length === 0) throw new Error("No tested study area in this scope");
  const out: RiskPoint[] = [];
  const errors: string[] = [];
  for (const id of ids) {
    try { out.push(...(await loadStaticRisk(signal, now, id))); }
    catch (e) { errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (out.length === 0) throw new Error(errors.join("; ") || "No risk file available");
  return out;
}

export interface StaticMeta { date?: string | undefined; generated_utc?: string | undefined }
export async function loadStaticMeta(signal?: AbortSignal, regionId = "haut-katanga"): Promise<StaticMeta> {
  const res = await fetch(riskUrl(regionId), { signal: signal ?? null });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as StaticMeta;
  return { date: d.date, generated_utc: d.generated_utc };
}
/** Hours since generation; Infinity when unknown. */
export function ageHours(m: StaticMeta, now: Date = new Date()): number {
  const t = m.generated_utc ? Date.parse(m.generated_utc) : NaN;
  return Number.isFinite(t) ? (now.getTime() - t) / 3.6e6 : Infinity;
}
/** Stale unless the file targets the current UTC day AND was issued within 36 h. */
export function isStale(m: StaticMeta, now: Date = new Date()): boolean {
  return m.date !== now.toISOString().slice(0, 10) || ageHours(m, now) > 36;
}
export function describeFreshness(m: StaticMeta, now: Date = new Date()): string {
  const h = ageHours(m, now);
  if (!Number.isFinite(h)) return "Risk file: issue time unknown, treat as stale.";
  const base = `Risk for UTC day ${m.date ?? "?"}, issued ${m.generated_utc}.`;
  return isStale(m, now) ? `${base} STALE: this is not today's (UTC) risk, do not use as current.` : base;
}
