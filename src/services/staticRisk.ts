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

export async function loadStaticRisk(signal?: AbortSignal): Promise<RiskPoint[]> {
  const res = await fetch(STATIC_RISK_URL, { signal: signal ?? null, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${STATIC_RISK_URL}`);
  const doc = (await res.json()) as { cells?: StaticCell[] };
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
export function isStale(m: StaticMeta, now: Date = new Date()): boolean { return ageHours(m, now) > 36; }
export function describeFreshness(m: StaticMeta, now: Date = new Date()): string {
  const h = ageHours(m, now);
  if (!Number.isFinite(h)) return "Risk file: issue time unknown, treat as stale.";
  const base = `Risk for UTC day ${m.date ?? "?"}, issued ${m.generated_utc}.`;
  return isStale(m, now) ? `${base} STALE: older than 36 h, do not use as current.` : base;
}
