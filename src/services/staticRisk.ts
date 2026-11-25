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
