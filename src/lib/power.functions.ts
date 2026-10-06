import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** NASA POWER daily point data. Fill value -999 is normalized to null. */
export const POWER_PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"] as const;
export type PowerParam = (typeof POWER_PARAMS)[number];
export interface PowerDay { date: string; values: Record<PowerParam, number | null> }
export interface PowerResult {
  status: "ok" | "error";
  message?: string;
  source: "NASA POWER";
  dataset: string;
  sourceUrl: string;
  retrievedAt: string;
  lat: number; lon: number;
  days: PowerDay[];          // chronological
  latest: PowerDay | null;   // most recent day with at least one real value
}

const input = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  days: z.number().int().min(3).max(60).default(14),
});

const cache = new Map<string, { at: number; data: PowerResult }>();
const TTL = 3 * 3600_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export const getPowerDaily = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<PowerResult> => {
    const lat = Math.round(data.lat * 100) / 100, lon = Math.round(data.lon * 100) / 100;
    const end = new Date(), start = new Date(Date.now() - data.days * 86400_000);
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${POWER_PARAMS.join(",")}&community=AG&latitude=${lat}&longitude=${lon}&start=${ymd(start)}&end=${ymd(end)}&format=JSON`;
    const base = { source: "NASA POWER" as const, dataset: "POWER Daily (community AG)", sourceUrl: url, retrievedAt: new Date().toISOString(), lat, lon };
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error("POWER error", res.status, (await res.text()).slice(0, 200));
        return { ...base, status: "error", message: `NASA POWER error (${res.status})`, days: [], latest: null };
      }
      const j = (await res.json()) as { properties?: { parameter?: Record<string, Record<string, number>> } };
      const p = j.properties?.parameter ?? {};
      const dates = Object.keys(p["T2M"] ?? Object.values(p)[0] ?? {}).sort();
      const days: PowerDay[] = dates.map((d) => ({
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        values: Object.fromEntries(POWER_PARAMS.map((k) => {
          const v = p[k]?.[d];
          return [k, typeof v === "number" && v > -999 ? v : null];
        })) as Record<PowerParam, number | null>,
      }));
      const latest = [...days].reverse().find((d) => Object.values(d.values).some((v) => v !== null)) ?? null;
      const result: PowerResult = { ...base, status: "ok", days, latest };
      cache.set(url, { at: Date.now(), data: result });
      return result;
    } catch (e) {
      console.error("POWER fetch failed", e);
      return { ...base, status: "error", message: "Unable to reach NASA POWER. Please try again.", days: [], latest: null };
    }
  });
