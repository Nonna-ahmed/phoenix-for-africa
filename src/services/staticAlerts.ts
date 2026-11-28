/**
 * Alert feed served as a static file (no backend server needed): /data/alerts.json,
 * written daily by backend/alerts.py from the validated risk files and the NASA hotspot files.
 * Same honesty rules as the other static layers: a file older than ALERTS_MAX_AGE_H is
 * "unavailable", never "no alerts".
 */
import type { ApiAlert } from "./api/endpoints";

export const ALERTS_URL = "/data/alerts.json";
export const ALERTS_MAX_AGE_H = 36;

export interface StaticAlert {
  id: string; type: "risk" | "detection"; severity: string; title: string; message: string;
  region_id: string; region: string | null; country: string | null; country_code: string | null;
  probability: number | null; date: string; issued_at: string; stale: boolean;
}
export interface StaticAlertsDoc { status?: string; generated_utc?: string; coverage_note?: string; alerts?: StaticAlert[] }

/** Pure mapping + filtering; unit-tested. Throws when the file cannot be trusted as current. */
export function toApiAlerts(doc: StaticAlertsDoc, scope: { country?: string | undefined; region?: string | undefined }, now: Date = new Date()): ApiAlert[] {
  if (doc.status !== "ok" || !Array.isArray(doc.alerts)) throw new Error("Alerts file invalid");
  const age = now.getTime() - Date.parse(doc.generated_utc ?? "");
  if (!Number.isFinite(age) || age > ALERTS_MAX_AGE_H * 3600_000) throw new Error("Alerts file is stale (older than 36 h): unavailable, not all-clear");
  return doc.alerts
    .filter((a) => (!scope.country || a.country_code === scope.country) && (!scope.region || a.region_id === scope.region))
    .map((a) => ({
      id: a.id, kind: a.type === "detection" ? ("detection" as const) : ("risk" as const),
      title: a.title, message: a.message, region: a.region ?? null, country: a.country ?? null,
      probability: typeof a.probability === "number" ? a.probability : null, issuedAt: a.issued_at ?? null,
    }));
}

export async function loadStaticAlerts(scope: { country?: string | undefined; region?: string | undefined }, signal?: AbortSignal, now: Date = new Date()): Promise<ApiAlert[]> {
  const res = await fetch(ALERTS_URL, { signal: signal ?? null, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${ALERTS_URL}`);
  return toApiAlerts((await res.json()) as StaticAlertsDoc, scope, now);
}
