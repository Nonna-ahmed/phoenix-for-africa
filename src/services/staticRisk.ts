/**
 * EXPERIMENTAL pilot risk layer served as a static file (no backend server needed).
 * The file is written daily by backend/predict.py. It covers only the Haut-Katanga pilot footprint.
 * Used only when VITE_API_BASE_URL is not set; a real backend always wins.
 */
import type { AreaQuery, RiskPoint } from "./api/endpoints";

export const STATIC_RISK_URL = "/data/risk-haut-katanga.json";

/** True when the static pilot file is the right source for this query (DR Congo, whole country or Haut-Katanga). */
export function staticCovers(a: AreaQuery | null | undefined): boolean {
  return !!a && a.country === "CD" && (!a.region || a.region === "haut-katanga");
}

interface StaticCell { lat: number; lon: number; probability: number; risk_level: string; date: string }

export const MANIFEST_URL = "/data/regions-manifest.json";

/** Estimates are shown only if the build-time validation (backend/manifest.py) says so for this region. */
export async function assertEstimatesAvailable(signal?: AbortSignal, regionId = "haut-katanga"): Promise<void> {
  const r = await fetch(MANIFEST_URL, { signal: signal ?? null, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`No validation manifest (HTTP ${r.status}): estimates unavailable`);
  const m = (await r.json()) as { regions?: { id: string; estimates_available?: boolean; reasons?: string[] }[] };
  const e = m.regions?.find((x) => x.id === regionId);
  if (!e || e.estimates_available !== true) throw new Error(`Estimates not validated for ${regionId}: ${(e?.reasons ?? ["not in manifest"]).join("; ")}`);
}

export async function loadStaticRisk(signal?: AbortSignal, now: Date = new Date()): Promise<RiskPoint[]> {
  await assertEstimatesAvailable(signal);
  const res = await fetch(STATIC_RISK_URL, { signal: signal ?? null, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${STATIC_RISK_URL}`);
  const doc = (await res.json()) as { cells?: StaticCell[]; date?: string; generated_utc?: string };
  // Never show a file that targets another UTC day as current risk: unavailable is not "low".
  if (isStale({ date: doc.date, generated_utc: doc.generated_utc }, now)) throw new Error("Risk file is not for today (UTC): unavailable, not low risk");
  return (doc.cells ?? [])
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .map((c) => ({ lat: c.lat, lon: c.lon, probability: Number.isFinite(c.probability) ? c.probability : null, level: c.risk_level ?? null, date: c.date ?? null, environment: null }));
}

export interface StaticMeta { date?: string | undefined; generated_utc?: string | undefined }
export async function loadStaticMeta(signal?: AbortSignal): Promise<StaticMeta> {
  const res = await fetch(STATIC_RISK_URL, { signal: signal ?? null });
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
  return isStale(m, now) ? `${base} STALE: this is not today\'s (UTC) risk, do not use as current.` : base;
}
