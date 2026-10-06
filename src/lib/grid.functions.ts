import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * NASA POWER native-grid values for an area (regional endpoint). Each cell is the real
 * POWER value for its 0.5° × 0.625° grid cell — no interpolation, -999 → null.
 * POWER limits regional requests to 1 parameter and 2°–10° per side, so larger areas are
 * split into tiles (max 9); beyond that the result is marked "limited".
 */
export const GRID_PARAMS = ["T2M_MAX", "T2M_MIN", "T2M", "RH2M", "WS2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "GWETROOT", "GWETTOP"] as const;
export type GridParam = (typeof GRID_PARAMS)[number];
export interface GridCell { lat: number; lon: number; value: number | null }
export interface GridResult {
  status: "ok" | "limited" | "error"; message?: string | undefined;
  param: GridParam; date: string | null; cells: GridCell[];
  cellLat: 0.5; cellLon: 0.625;
  source: "NASA POWER"; dataset: string; retrievedAt: string; tiles: number;
}

const input = z.object({ bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]), param: z.enum(GRID_PARAMS) });
const cache = new Map<string, { at: number; data: GridResult }>();
const TTL = 6 * 3600_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");

function tiles([w, s, e, n]: [number, number, number, number]) {
  // POWER requires each side between 2° and 10°
  const pad = (a: number, b: number) => (b - a < 2 ? [(a + b) / 2 - 1, (a + b) / 2 + 1] : [a, b]) as [number, number];
  const [x0, x1] = pad(w, e), [y0, y1] = pad(s, n);
  const nx = Math.ceil((x1 - x0) / 10), ny = Math.ceil((y1 - y0) / 10);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = x0 + ((x1 - x0) * i) / nx, b = x0 + ((x1 - x0) * (i + 1)) / nx;
    const c = y0 + ((y1 - y0) * j) / ny, d = y0 + ((y1 - y0) * (j + 1)) / ny;
    out.push([a, c, Math.max(b, a + 2), Math.max(d, c + 2)].map((v) => Math.round(v * 100) / 100) as [number, number, number, number]);
  }
  return out;
}

export const getPowerGrid = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<GridResult> => {
    const base = { param: data.param, cellLat: 0.5 as const, cellLon: 0.625 as const, source: "NASA POWER" as const, dataset: "POWER Daily regional (community AG, native grid)", retrievedAt: new Date().toISOString() };
    const t = tiles(data.bbox);
    if (t.length > 9) return { ...base, status: "limited", message: "Limited spatial coverage — NASA POWER area queries are limited to about 10° × 10°. Select a country or region to load the grid.", date: null, cells: [], tiles: 0 };
    const key = JSON.stringify(data);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    const start = ymd(Date.now() - 12 * 864e5), end = ymd(Date.now());
    try {
      const results = await Promise.all(t.map(async ([w, s, e, n]) => {
        const url = `https://power.larc.nasa.gov/api/temporal/daily/regional?parameters=${data.param}&community=AG&latitude-min=${s}&latitude-max=${n}&longitude-min=${w}&longitude-max=${e}&start=${start}&end=${end}&format=JSON`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`POWER ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const j = (await res.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: { parameter: Record<string, Record<string, number>> } }[] };
        return j.features ?? [];
      }));
      const feats = results.flat();
      // dedupe cells shared by neighbouring tiles
      const byCell = new Map<string, Record<string, number>>();
      for (const f of feats) byCell.set(`${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}`, f.properties.parameter[data.param] ?? {});
      const valid = (v: unknown) => typeof v === "number" && v > -999;
      const dates = [...new Set([...byCell.values()].flatMap((m) => Object.keys(m)))].sort().reverse();
      // latest date where at least half the cells have a real value
      const date = dates.find((d) => [...byCell.values()].filter((m) => valid(m[d])).length >= byCell.size / 2) ?? null;
      const cells: GridCell[] = [...byCell.entries()].map(([k, m]) => {
        const [lat, lon] = k.split(",").map(Number) as [number, number];
        const v = date ? m[date] : undefined;
        return { lat, lon, value: valid(v) ? (v as number) : null };
      });
      const result: GridResult = { ...base, status: date ? "ok" : "error", message: date ? undefined : "No recent values published", date: date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : null, cells, tiles: t.length };
      if (date) cache.set(key, { at: Date.now(), data: result });
      return result;
    } catch (e) {
      console.error("POWER grid", e);
      return { ...base, status: "error", message: "Data temporarily unavailable", date: null, cells: [], tiles: t.length };
    }
  });

export interface PixelInfo {
  lat: number; lon: number;
  landCover?: { status: "ok" | "unavailable"; label: string | null; code: number | null; source: string; product: string };
  population?: { status: "ok" | "unavailable"; density: number | null; year: number; source: string; product: string };
  terrain?: { status: "ok" | "unavailable"; elevation: number | null; slope: number | null; aspect: number | null; source: string; product: string };
}
