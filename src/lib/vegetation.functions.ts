/**
 * Vegetation / NDVI data service. Provider: NASA MODIS/Terra MOD13Q1.061 (250 m, 16-day composite),
 * retrieved server-side via the NASA ORNL DAAC MODIS Web Service (official subsets of the LP DAAC product).
 * Real pixels only: QA (pixel reliability) 0 = good, 1 = marginal are kept; 2 snow/ice, 3 cloudy, -1 fill are excluded.
 * No interpolation. NDVI is a vegetation indicator — never a fire probability or drought index.
 * The provider sits behind `VegetationResult` so another vegetation dataset can replace it without UI changes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type NdviQa = "good" | "marginal" | "snow_ice" | "cloudy" | "fill" | "unknown";
export interface NdviPixel { lat: number; lon: number; ndvi: number | null; qa: NdviQa }
export interface NdviWindow { lat: number; lon: number; status: "ok" | "error"; pixels: NdviPixel[] }
export interface VegetationResult {
  status: "ok" | "error" | "limited";
  message?: string;
  product: string; productVersion: string; source: string; sourceUrl: string; variable: "NDVI";
  resolutionM: number; compositeDays: number; compositeDate: string | null; modisDate: string | null;
  bbox: [number, number, number, number]; method: string; pixelSizeDeg: number;
  windows: NdviWindow[];
  summary: { valid: number; invalid: number; total: number; coveragePct: number | null; min: number | null; max: number | null; mean: number | null; median: number | null; qaCounts: Record<NdviQa, number> };
  retrievedAt: string;
}

const BASE = "https://modis.ornl.gov/rst/api/v1/MOD13Q1";
const R = 6371007.181; // MODIS sinusoidal sphere radius
const cache = new Map<string, { at: number; v: VegetationResult }>();
const TTL = 24 * 3600_000;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const QA: Record<string, NdviQa> = { "0": "good", "1": "marginal", "2": "snow_ice", "3": "cloudy", "-1": "fill" };

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`MODIS service ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function latestDate(lat: number, lon: number): Promise<{ modis: string; cal: string } | null> {
  const j = await getJson(`${BASE}/dates?latitude=${lat}&longitude=${lon}`);
  const d = (j?.dates ?? []).at(-1);
  return d ? { modis: d.modis_date, cal: d.calendar_date } : null;
}

async function windowAt(lat: number, lon: number, date: string): Promise<NdviWindow> {
  try {
    const q = (band: string) => getJson(`${BASE}/subset?latitude=${lat}&longitude=${lon}&band=${band}&startDate=${date}&endDate=${date}&kmAboveBelow=1&kmLeftRight=1`);
    const [nd, qa] = await Promise.all([q("250m_16_days_NDVI"), q("250m_16_days_pixel_reliability")]);
    const vals: number[] = nd?.subset?.[0]?.data ?? []; const qas: number[] = qa?.subset?.[0]?.data ?? [];
    const nrows = Number(nd.nrows), ncols = Number(nd.ncols), cs = Number(nd.cellsize), xll = Number(nd.xllcorner), yll = Number(nd.yllcorner), scale = Number(nd.scale) || 0.0001;
    const pixels: NdviPixel[] = [];
    for (let r = 0; r < nrows; r++) for (let c = 0; c < ncols; c++) {
      const i = r * ncols + c; const x = xll + (c + 0.5) * cs, y = yll + (nrows - r - 0.5) * cs;
      const plat = (y / R) * (180 / Math.PI), plon = (x / (R * Math.cos(y / R))) * (180 / Math.PI);
      const qk = QA[String(qas[i])] ?? "unknown"; const raw = vals[i];
      const usable = (qk === "good" || qk === "marginal") && typeof raw === "number" && raw >= -2000 && raw <= 10000;
      pixels.push({ lat: r4(plat), lon: r4(plon), ndvi: usable ? Math.round(raw * scale * 1000) / 1000 : null, qa: qk });
    }
    return { lat, lon, status: "ok", pixels };
  } catch (e) { console.error("ndvi window", lat, lon, e); return { lat, lon, status: "error", pixels: [] }; }
}

export const getVegetation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]), n: z.number().int().min(2).max(5).optional() }).parse(d))
  .handler(async ({ data }): Promise<VegetationResult> => {
    const [w, s, e, nn] = data.bbox; const n = data.n ?? 4;
    const key = `${data.bbox.map((v) => v.toFixed(2)).join(",")}:${n}`;
    const hit = cache.get(key); if (hit && Date.now() - hit.at < TTL) return hit.v;
    const base = {
      product: "MOD13Q1", productVersion: "061", source: "NASA MODIS/Terra MOD13Q1.061 (LP DAAC) via ORNL DAAC MODIS Web Service",
      sourceUrl: "https://lpdaac.usgs.gov/products/mod13q1v061/", variable: "NDVI" as const, resolutionM: 250, compositeDays: 16,
      bbox: data.bbox, pixelSizeDeg: 231.656 / 111_320,
      method: `${n}×${n} grid of ~2 km × 2 km windows (9×9 native 250 m pixels each) across the area — real pixels only, no interpolation`,
      retrievedAt: new Date().toISOString(),
    };
    const empty = { valid: 0, invalid: 0, total: 0, coveragePct: null, min: null, max: null, mean: null, median: null, qaCounts: { good: 0, marginal: 0, snow_ice: 0, cloudy: 0, fill: 0, unknown: 0 } };
    if ((e - w) * (nn - s) > 400) return { ...base, status: "limited", message: "Area too large — select a country region", compositeDate: null, modisDate: null, windows: [], summary: empty };
    try {
      const d = await latestDate(r4((s + nn) / 2), r4((w + e) / 2));
      if (!d) return { ...base, status: "error", message: "No MOD13Q1 composites returned", compositeDate: null, modisDate: null, windows: [], summary: empty };
      const fr = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
      const pts = fr.flatMap((fy) => fr.map((fx) => [r4(s + (nn - s) * fy), r4(w + (e - w) * fx)] as const));
      const windows: NdviWindow[] = [];
      for (let i = 0; i < pts.length; i += 4) windows.push(...(await Promise.all(pts.slice(i, i + 4).map(([la, lo]) => windowAt(la, lo, d.modis)))));
      const all = windows.flatMap((x) => x.pixels); const v = all.map((p) => p.ndvi).filter((x): x is number => x !== null).sort((a, b) => a - b);
      const qaCounts = { ...empty.qaCounts }; for (const p of all) qaCounts[p.qa]++;
      const summary = {
        valid: v.length, invalid: all.length - v.length, total: all.length, coveragePct: all.length ? Math.round((v.length / all.length) * 100) : null,
        min: v[0] ?? null, max: v.at(-1) ?? null, mean: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null,
        median: v.length ? v[Math.floor(v.length / 2)]! : null, qaCounts,
      };
      const ok = windows.some((x) => x.status === "ok");
      const out: VegetationResult = { ...base, status: ok ? "ok" : "error", message: ok ? undefined : "NASA MODIS service unavailable", compositeDate: d.cal, modisDate: d.modis, windows, summary };
      if (ok) cache.set(key, { at: Date.now(), v: out });
      return out;
    } catch (err) {
      console.error("ndvi", err);
      return { ...base, status: "error", message: "NASA MODIS service unavailable", compositeDate: null, modisDate: null, windows: [], summary: empty };
    }
  });
