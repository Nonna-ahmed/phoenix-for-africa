import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Static/slow-changing site context for a point: land cover, terrain, population, soil moisture.
 * Each layer is fetched independently; a failing source returns status "unavailable" and never
 * blocks the others. No values are ever invented.
 */
type Status = "ok" | "unavailable";
interface Prov { status: Status; message?: string | undefined; source: string; product: string; sourceUrl: string; retrievedAt: string; resolution?: string }

export type LandCoverType = "tree_cover" | "shrub_grass_rangeland" | "cropland" | "built_up" | "bare_sparse" | "wetland" | "water" | "snow_ice" | "cloud" | "unknown";
export interface LandCover extends Prov { landCoverType: LandCoverType | null; landCoverCode: number | null; landCoverLabel: string | null; landCoverDate: string | null }
export interface Terrain extends Prov { elevation: number | null; slope: number | null; aspect: number | null }
export interface PopulationExposure extends Prov { population: number | null; populationDensity: number | null; areaKm2: number; year: number }
export interface DroughtObservation extends Prov { date: string | null; soilMoistureRoot: number | null; soilMoistureTop: number | null }
export interface SiteContext { lat: number; lon: number; landCover: LandCover; terrain: Terrain; population: PopulationExposure; drought: DroughtObservation }

// Esri / Impact Observatory Sentinel-2 10m Land Use/Land Cover class codes → PHOENIX classes
const IO_CLASSES: Record<number, [LandCoverType, string]> = {
  1: ["water", "Water"], 2: ["tree_cover", "Trees"], 4: ["wetland", "Flooded vegetation"], 5: ["cropland", "Crops"],
  7: ["built_up", "Built area"], 8: ["bare_sparse", "Bare ground"], 9: ["snow_ice", "Snow/ice"], 10: ["cloud", "Clouds (no observation)"],
  11: ["shrub_grass_rangeland", "Rangeland (grass/shrub)"],
};

const cache = new Map<string, { at: number; data: SiteContext }>();
const TTL = 12 * 3600_000;
const now = () => new Date().toISOString();
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

async function getJson(url: string, ms = 20000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const res = await fetch(url, { signal: ctl.signal }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return await res.json(); }
  finally { clearTimeout(t); }
}

async function landCover(lat: number, lon: number): Promise<LandCover> {
  const geom = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  const url = `https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/identify?geometry=${geom}&geometryType=esriGeometryPoint&returnCatalogItems=false&f=json`;
  const base = { source: "Esri / Impact Observatory", product: "Sentinel-2 10m Land Use/Land Cover (latest annual map in service)", sourceUrl: url, retrievedAt: now(), resolution: "10 m" };
  try {
    const j = await getJson(url);
    const code = Number(j?.value);
    if (!Number.isFinite(code) || !IO_CLASSES[code]) return { ...base, status: "unavailable", message: "No land-cover value at this point", landCoverType: null, landCoverCode: null, landCoverLabel: null, landCoverDate: null };
    const [t, label] = IO_CLASSES[code]!;
    return { ...base, status: "ok", landCoverType: t, landCoverCode: code, landCoverLabel: label, landCoverDate: null };
  } catch (e) {
    console.error("landcover", e);
    return { ...base, status: "unavailable", message: "Data temporarily unavailable", landCoverType: null, landCoverCode: null, landCoverLabel: null, landCoverDate: null };
  }
}

async function terrain(lat: number, lon: number): Promise<Terrain> {
  const d = 0.0005; // ~55 m
  const pts: [number, number][] = [];
  for (const dy of [d, 0, -d]) for (const dx of [-d, 0, d]) pts.push([r4(lat + dy), r4(lon + dx)]);
  const url = `https://api.opentopodata.org/v1/srtm30m?locations=${pts.map((p) => p.join(",")).join("|")}`;
  const base = { source: "NASA SRTM via OpenTopoData", product: "SRTM GL1 30 m DEM", sourceUrl: url, retrievedAt: now(), resolution: "30 m" };
  try {
    const j = await getJson(url);
    const z = (j?.results ?? []).map((r: { elevation: number | null }) => (typeof r.elevation === "number" ? r.elevation : null));
    if (z.length !== 9 || z.some((v: number | null) => v === null)) {
      const e = z[4] ?? null;
      return { ...base, status: e === null ? "unavailable" : "ok", message: e === null ? "No elevation at this point" : undefined, elevation: e, slope: null, aspect: null };
    }
    const [a, b, c, dd, e, f, g, h, i] = z as [number, number, number, number, number, number, number, number, number];
    const cell = d * 111320, cellX = cell * Math.cos((lat * Math.PI) / 180);
    const dzdx = ((c + 2 * f + i) - (a + 2 * dd + g)) / (8 * cellX);
    const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cell); // positive = rises to south
    const slope = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    // aspect: compass bearing the slope faces (downhill), 0 = north, 90 = east
    const aspect = ((Math.atan2(-dzdx, dzdy) * 180) / Math.PI + 360) % 360;
    return { ...base, status: "ok", elevation: e, slope: Math.round(slope * 10) / 10, aspect: slope < 0.5 ? null : Math.round(aspect) };
  } catch (err) {
    console.error("terrain", err);
    return { ...base, status: "unavailable", message: "Data temporarily unavailable", elevation: null, slope: null, aspect: null };
  }
}

async function population(lat: number, lon: number): Promise<PopulationExposure> {
  const h = 0.05, year = 2020;
  const ring = [[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]].map(([x, y]) => [r4(x!), r4(y!)]);
  const gj = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
  const url = `https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=${year}&runasync=false&geojson=${encodeURIComponent(JSON.stringify(gj))}`;
  const km = 2 * h * 110.574, areaKm2 = Math.round(km * (2 * h * 111.32 * Math.cos((lat * Math.PI) / 180)) * 10) / 10;
  const base = { source: "WorldPop", product: `Global population counts ${year} (wpgppop, unconstrained)`, sourceUrl: "https://www.worldpop.org/", retrievedAt: now(), resolution: "100 m", areaKm2, year };
  try {
    const j = await getJson(url, 30000);
    const p = Number(j?.data?.total_population);
    if (j?.error || !Number.isFinite(p) || p < 0) return { ...base, status: "unavailable", message: "No population estimate returned", population: null, populationDensity: null };
    return { ...base, status: "ok", population: Math.round(p), populationDensity: Math.round(p / areaKm2) };
  } catch (e) {
    console.error("worldpop", e);
    return { ...base, status: "unavailable", message: "Data temporarily unavailable", population: null, populationDensity: null };
  }
}

async function drought(lat: number, lon: number): Promise<DroughtObservation> {
  const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=GWETROOT,GWETTOP&community=AG&latitude=${lat}&longitude=${lon}&start=${ymd(Date.now() - 21 * 864e5)}&end=${ymd(Date.now())}&format=JSON`;
  const base = { source: "NASA POWER", product: "GWETROOT / GWETTOP soil wetness (GEOS-IT, 0–1)", sourceUrl: url, retrievedAt: now(), resolution: "0.5° × 0.625°" };
  try {
    const j = await getJson(url, 30000);
    const p = j?.properties?.parameter ?? {};
    const val = (k: string, d: string) => { const v = p[k]?.[d]; return typeof v === "number" && v > -999 ? v : null; };
    const dates = Object.keys(p.GWETROOT ?? {}).sort().reverse();
    const d = dates.find((x) => val("GWETROOT", x) !== null || val("GWETTOP", x) !== null);
    if (!d) return { ...base, status: "unavailable", message: "No recent soil-moisture values published", date: null, soilMoistureRoot: null, soilMoistureTop: null };
    return { ...base, status: "ok", date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, soilMoistureRoot: val("GWETROOT", d), soilMoistureTop: val("GWETTOP", d) };
  } catch (e) {
    console.error("power soil", e);
    return { ...base, status: "unavailable", message: "Data temporarily unavailable", date: null, soilMoistureRoot: null, soilMoistureTop: null };
  }
}

export const getSiteContext = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ lat: z.number().min(-40).max(40), lon: z.number().min(-25).max(60) }).parse(d))
  .handler(async ({ data }): Promise<SiteContext> => {
    const lat = Math.round(data.lat * 1e3) / 1e3, lon = Math.round(data.lon * 1e3) / 1e3;
    const key = `${lat},${lon}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    const [lc, t, p, dr] = await Promise.all([landCover(lat, lon), terrain(lat, lon), population(lat, lon), drought(lat, lon)]);
    const result = { lat, lon, landCover: lc, terrain: t, population: p, drought: dr };
    if ([lc, t, p, dr].every((x) => x.status === "ok")) cache.set(key, { at: Date.now(), data: result });
    return result;
  });

export interface ProbeResult { id: string; ok: boolean; checkedAt: string; message?: string | undefined }

/** Live health check: a source is "Available" only if PHOENIX retrieves usable data right now. */
export const probeSources = createServerFn({ method: "GET" }).handler(async (): Promise<ProbeResult[]> => {
  const lat = -11.66, lon = 27.48; // Lubumbashi reference point
  const at = now();
  const wrap = async (id: string, f: () => Promise<boolean>): Promise<ProbeResult> => {
    try { return { id, ok: await f(), checkedAt: at }; } catch (e) { console.error("probe", id, e); return { id, ok: false, checkedAt: at, message: "Data temporarily unavailable" }; }
  };
  const [lc, t, p, dr] = await Promise.all([landCover(lat, lon), terrain(lat, lon), population(lat, lon), drought(lat, lon)]);
  const rest = await Promise.all([
    wrap("firms", async () => {
      const key = process.env["FIRMS_MAP_KEY"]; if (!key) return false;
      const j = await getJson(`https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${key}`);
      return typeof j?.current_transactions === "number" || typeof j?.transaction_limit === "number";
    }),
    wrap("power", async () => {
      const j = await getJson(`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=AG&latitude=${lat}&longitude=${lon}&start=20250101&end=20250102&format=JSON`);
      return Object.values(j?.properties?.parameter?.T2M ?? {}).some((v) => typeof v === "number" && v > -999);
    }),
    wrap("osm", async () => {
      const j = await getJson("https://services-eu1.arcgis.com/zci5bUiJ8olAal7N/arcgis/rest/services/OSM_AF_Medical/FeatureServer/0/query?where=amenity%3D%27hospital%27&geometry=27.3,-11.8,27.6,-11.5&geometryType=esriGeometryEnvelope&inSR=4326&returnCountOnly=true&f=json");
      return Number(j?.count) > 0;
    }),
    wrap("osm-roads", async () => {
      const j = await getJson("https://services-eu1.arcgis.com/zci5bUiJ8olAal7N/arcgis/rest/services/OSM_AF_Highways/FeatureServer/0/query?where=highway%3D%27primary%27&geometry=27,-12,28,-11&geometryType=esriGeometryEnvelope&inSR=4326&returnCountOnly=true&f=json");
      return Number(j?.count) > 0;
    }),
    wrap("grid3", async () => {
      const j = await getJson("https://services3.arcgis.com/BU6Aadhn6tbBEdyk/ArcGIS/rest/services/GRID3_COD_health_facilities_v9_0/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json");
      return Number(j?.count) > 0;
    }),
  ]);
  return [
    ...rest,
    { id: "landcover", ok: lc.status === "ok", checkedAt: at, message: lc.message },
    { id: "terrain", ok: t.status === "ok", checkedAt: at, message: t.message },
    { id: "population", ok: p.status === "ok", checkedAt: at, message: p.message },
    { id: "soil", ok: dr.status === "ok", checkedAt: at, message: dr.message },
  ];
});

export const WORLDPOP_DENSITY_URL = "https://worldpop.arcgis.com/arcgis/rest/services/WorldPop_Population_Density_1km/ImageServer";
export interface PixelInfo { lat: number; lon: number; landCover?: LandCover; terrain?: Terrain; density?: { status: Status; value: number | null; year: number; source: string; product: string } }

/** Values of the raster layers at one clicked map location (real pixel values, nothing interpolated). */
export const getPixelInfo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ lat: z.number().min(-40).max(40), lon: z.number().min(-25).max(60), layers: z.array(z.enum(["landcover", "terrain", "population"])) }).parse(d))
  .handler(async ({ data }): Promise<PixelInfo> => {
    const { lat, lon, layers } = data;
    const out: PixelInfo = { lat, lon };
    await Promise.all([
      layers.includes("landcover") && landCover(lat, lon).then((x) => { out.landCover = x; }),
      layers.includes("terrain") && terrain(lat, lon).then((x) => { out.terrain = x; }),
      layers.includes("population") && (async () => {
        const meta = { year: 2020, source: "WorldPop", product: "Population density 1 km (2020)" };
        try {
          const geom = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
          const j = await getJson(`${WORLDPOP_DENSITY_URL}/identify?geometry=${geom}&geometryType=esriGeometryPoint&time=1577836800000&returnCatalogItems=false&f=json`);
          const v = Number(j?.value);
          out.density = Number.isFinite(v) && v >= 0 ? { ...meta, status: "ok", value: Math.round(v) } : { ...meta, status: "unavailable", value: null };
        } catch (e) { console.error("worldpop identify", e); out.density = { ...meta, status: "unavailable", value: null }; }
      })(),
    ]);
    return out;
  });

export interface AreaSamplePoint { lat: number; lon: number; landCover: string | null; elevationM: number | null; densityPerKm2: number | null }
export interface AreaSample {
  bbox: [number, number, number, number]; points: AreaSamplePoint[]; retrievedAt: string;
  landCoverCounts: Record<string, number>; elevation: { min: number | null; max: number | null; mean: number | null }; density: { min: number | null; max: number | null; mean: number | null; median: number | null };
  sources: { landCover: string; terrain: string; population: string };
}

/** Real values at a 3×3 grid of sample points across an area (no interpolation between points). */
export const getAreaSample = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ bbox: z.tuple([z.number().min(-25), z.number().min(-40), z.number().max(60), z.number().max(40)]), n: z.number().int().min(3).max(6).optional() }).parse(d))
  .handler(async ({ data }): Promise<AreaSample> => {
    const [w, s, e, n] = data.bbox;
    const pts: [number, number][] = [];
    const gn = data.n ?? 3; const fr = Array.from({ length: gn }, (_, i) => (i + 0.5) / gn);
    for (const fy of fr) for (const fx of fr) pts.push([r4(s + (n - s) * fy), r4(w + (e - w) * fx)]);
    const ident = async (url: string, lat: number, lon: number, extra = "") => {
      try {
        const geom = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
        const j = await getJson(`${url}/identify?geometry=${geom}&geometryType=esriGeometryPoint&returnCatalogItems=false${extra}&f=json`);
        const v = Number(j?.value); return Number.isFinite(v) ? v : null;
      } catch { return null; }
    };
    let elev: (number | null)[] = pts.map(() => null);
    const elevP = getJson(`https://api.opentopodata.org/v1/srtm30m?locations=${pts.map((p) => p.join(",")).join("|")}`)
      .then((j) => { elev = (j?.results ?? []).map((r: { elevation: number | null }) => (typeof r.elevation === "number" ? r.elevation : null)); })
      .catch((err) => console.error("sample terrain", err));
    const LC = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer";
    const [lcs, dens] = await Promise.all([
      Promise.all(pts.map(([la, lo]) => ident(LC, la, lo))),
      Promise.all(pts.map(([la, lo]) => ident(WORLDPOP_DENSITY_URL, la, lo, "&time=1577836800000"))),
      elevP,
    ]);
    const points = pts.map(([lat, lon], i) => {
      const code = lcs[i]; const d = dens[i];
      return { lat, lon, landCover: code !== null && code !== undefined && IO_CLASSES[code] ? IO_CLASSES[code]![1] : null, elevationM: elev[i] ?? null, densityPerKm2: d !== null && d !== undefined && d >= 0 ? Math.round(d) : null };
    });
    const nums = (k: "elevationM" | "densityPerKm2") => points.map((p) => p[k]).filter((v): v is number => v !== null);
    const el = nums("elevationM"), de = nums("densityPerKm2");
    const landCoverCounts: Record<string, number> = {};
    for (const p of points) { const k = p.landCover ?? "Unavailable"; landCoverCounts[k] = (landCoverCounts[k] ?? 0) + 1; }
    return {
      bbox: data.bbox, points, retrievedAt: now(), landCoverCounts,
      elevation: { min: el.length ? Math.min(...el) : null, max: el.length ? Math.max(...el) : null, mean: el.length ? Math.round(el.reduce((a, b) => a + b, 0) / el.length) : null },
      density: { min: de.length ? Math.min(...de) : null, max: de.length ? Math.max(...de) : null, mean: de.length ? Math.round(de.reduce((a, b) => a + b, 0) / de.length) : null, median: de.length ? [...de].sort((a, b) => a - b)[Math.floor(de.length / 2)]! : null },
      sources: { landCover: "Esri / Impact Observatory Sentinel-2 10 m land cover", terrain: "NASA SRTM 30 m via OpenTopoData", population: "WorldPop population density 1 km (2020)" },
    };
  });
