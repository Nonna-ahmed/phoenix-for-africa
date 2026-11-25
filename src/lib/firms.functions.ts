import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** NASA FIRMS hotspot = satellite thermal anomaly. NOT a confirmed ground fire. */
export interface Hotspot {
  lat: number; lon: number; acqDate: string; acqTime: string;
  satellite: string | null; instrument: string; source: string;
  confidence: string | null; frp: number | null; daynight: string | null;
}
export interface FirmsResult {
  status: "ok" | "not_configured" | "error";
  message?: string;
  hotspots: Hotspot[];
  total: number;
  truncated: boolean;
  fetchedAt: string;
}

const SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"] as const;
const MAX_POINTS = 2500;
const AFRICA: [number, number, number, number] = [-20, -36, 55, 38];

const input = z.object({
  bbox: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]).optional(),
  days: z.number().int().min(1).max(5).default(1),
  source: z.enum(SOURCES).default("VIIRS_NOAA20_NRT"),
});

// Per-isolate cache: FIRMS NRT updates roughly every few hours.
const cache = new Map<string, { at: number; data: FirmsResult }>();
const TTL = 15 * 60_000;

export function parseCsv(text: string, source: string): Hotspot[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  const idx = (n: string) => header.indexOf(n);
  const [iLat, iLon, iDate, iTime, iSat, iInst, iConf, iFrp, iDn] = ["latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument", "confidence", "frp", "daynight"].map(idx) as [number, number, number, number, number, number, number, number, number];
  if (iLat < 0 || iLon < 0) throw new Error(text.slice(0, 160) || "Unexpected FIRMS response");
  return lines.map((l) => {
    const c = l.split(",");
    const frp = iFrp >= 0 ? Number(c[iFrp]) : NaN;
    const t = iTime >= 0 ? (c[iTime] ?? "").padStart(4, "0") : "";
    return {
      lat: Number(c[iLat]), lon: Number(c[iLon]),
      acqDate: iDate >= 0 ? c[iDate] ?? "" : "", acqTime: t ? `${t.slice(0, 2)}:${t.slice(2)}` : "",
      satellite: iSat >= 0 ? c[iSat] || null : null, instrument: (iInst >= 0 && c[iInst]) || (source.startsWith("MODIS") ? "MODIS" : "VIIRS"),
      source, confidence: iConf >= 0 ? c[iConf] || null : null, frp: Number.isFinite(frp) ? frp : null,
      daynight: iDn >= 0 ? c[iDn] || null : null,
    };
  }).filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon));
}

/** Keyless public NASA regional 7-day CSVs (no MAP_KEY). Southern Africa only; NOAA-20 / NOAA-21 VIIRS. */
export const KEYLESS_URLS: Record<string, string> = {
  VIIRS_NOAA20_NRT: "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/Southern_Africa/J1_VIIRS_C2_Southern_Africa_7d.csv",
  VIIRS_NOAA21_NRT: "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/Southern_Africa/J2_VIIRS_C2_Southern_Africa_7d.csv",
};
const CONF_OK = new Set(["nominal", "high", "n", "h"]);
/** Filter parsed hotspots to a bbox (W,S,E,N), the last `days` UTC days ending at `now`, and nominal/high confidence. */
export function filterHotspots(all: Hotspot[], bbox: [number, number, number, number], days: number, now: Date = new Date()): Hotspot[] {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1))).toISOString().slice(0, 10);
  return all.filter((h) => h.lon >= bbox[0] && h.lon <= bbox[2] && h.lat >= bbox[1] && h.lat <= bbox[3] && h.acqDate >= cutoff && (h.confidence === null || CONF_OK.has(h.confidence.toLowerCase())));
}

export const getFirmsHotspots = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => input.parse(d ?? {}))
  .handler(async ({ data }): Promise<FirmsResult> => {
    const fetchedAt = new Date().toISOString();
    const key = process.env["FIRMS_MAP_KEY"];
    const url = process.env["ENABLE_KEYLESS_SERVER_CSV"] === "1" ? KEYLESS_URLS[data.source] : undefined;
    if (!key && (!url || !data.bbox)) return { status: "not_configured", message: "Satellite fire data not connected (no MAP_KEY; the keyless CSV path is off by default because of free-plan CPU limits)", hotspots: [], total: 0, truncated: false, fetchedAt };
    const bbox = data.bbox ?? AFRICA;
    const ck = `${data.source}|${bbox.join(",")}|${data.days}`;
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    try {
      const res = await fetch(key ? `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${data.source}/${bbox.join(",")}/${data.days}` : url!);
      const text = await res.text();
      if (!res.ok || /invalid map_key/i.test(text)) {
        console.error("FIRMS error", res.status, text.slice(0, 200));
        return { status: "error", message: /invalid/i.test(text) ? "NASA FIRMS rejected the MAP_KEY" : `NASA FIRMS error (${res.status})`, hotspots: [], total: 0, truncated: false, fetchedAt };
      }
      const all = key ? parseCsv(text, data.source) : filterHotspots(parseCsv(text, data.source), bbox, data.days);
      // Keep the strongest detections when the area is large (server-side cap).
      const sorted = all.length > MAX_POINTS ? [...all].sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0)).slice(0, MAX_POINTS) : all;
      const result: FirmsResult = { status: "ok", ...(key ? {} : { message: "Keyless public NASA regional file (Southern Africa, nominal/high confidence)" }), hotspots: sorted, total: all.length, truncated: all.length > MAX_POINTS, fetchedAt };
      cache.set(ck, { at: Date.now(), data: result });
      return result;
    } catch (e) {
      console.error("FIRMS fetch failed", e);
      return { status: "error", message: "Unable to reach NASA FIRMS. Please try again.", hotspots: [], total: 0, truncated: false, fetchedAt };
    }
  });
