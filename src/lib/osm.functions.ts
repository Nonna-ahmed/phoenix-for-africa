import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * OpenStreetMap hospitals/clinics and main roads for an area, from Esri's live OSM replica
 * for Africa (updated from OSM continuously, ODbL). Hospitals are critical infrastructure —
 * never emergency shelters. Roads are not approved evacuation routes.
 */
const BASE = "https://services-eu1.arcgis.com/zci5bUiJ8olAal7N/arcgis/rest/services";
export const OSM_MEDICAL_URL = `${BASE}/OSM_AF_Medical/FeatureServer/0`;
export const OSM_ROADS_URL = `${BASE}/OSM_AF_Highways/FeatureServer/0`;

export interface OsmHospital { id: string; name: string | null; amenity: string; healthcare: string | null; operator: string | null; emergency: string | null; lat: number; lon: number }
export interface OsmRoad { id: string; highway: string; name: string | null; ref: string | null; surface: string | null; paths: [number, number][][] }
interface Base { status: "ok" | "limited" | "error"; message?: string | undefined; total: number; source: string; dataset: string; sourceUrl: string; retrievedAt: string; license: "ODbL" }
export interface HospitalsResult extends Base { hospitals: OsmHospital[] }
export interface RoadsResult extends Base { roads: OsmRoad[] }

const bboxIn = z.object({ bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) });
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 6 * 3600_000;
const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const area = ([w, so, e, n]: number[]) => (e! - w!) * (n! - so!);

async function query(url: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects", f: "json", ...params });
  const res = await fetch(`${url}/query?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { error?: { message?: string } } & Record<string, unknown>;
  if (j.error) throw new Error(j.error.message ?? "ArcGIS error");
  return j;
}

async function cached<T>(key: string, f: () => Promise<T & { status: string }>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const d = await f();
  if (d.status === "ok") cache.set(key, { at: Date.now(), data: d });
  return d;
}

const HOSP_WHERE = "amenity IN ('hospital','clinic')";
const HOSP_CAP = 1000;

export const getOsmHospitals = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => bboxIn.parse(d))
  .handler(async ({ data }): Promise<HospitalsResult> => {
    const meta = { source: "OpenStreetMap contributors (via Esri live OSM replica)", dataset: "OSM Medical Facilities for Africa — amenity=hospital|clinic", sourceUrl: OSM_MEDICAL_URL, retrievedAt: new Date().toISOString(), license: "ODbL" as const };
    if (area(data.bbox) > 600) return { ...meta, status: "limited", message: "Select a country or region to load hospitals.", total: 0, hospitals: [] };
    return cached(`h${data.bbox}`, async () => {
      try {
        const geometry = data.bbox.join(",");
        const [c, f] = await Promise.all([
          query(OSM_MEDICAL_URL, { where: HOSP_WHERE, geometry, returnCountOnly: "true" }),
          query(OSM_MEDICAL_URL, { where: HOSP_WHERE, geometry, outFields: "objectid,osm_id2,name,amenity,healthcare,operator,emergency", returnGeometry: "true", resultRecordCount: String(HOSP_CAP), orderByFields: "amenity DESC" }),
        ]);
        const feats = (f["features"] as { attributes: Record<string, unknown>; geometry?: { x: number; y: number } }[] | undefined) ?? [];
        const hospitals = feats.flatMap((x): OsmHospital[] => {
          const g = x.geometry; if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y)) return [];
          const a = x.attributes;
          return [{ id: `osm-${s(a["osm_id2"]) ?? s(a["objectid"])}`, name: s(a["name"]), amenity: s(a["amenity"]) ?? "hospital", healthcare: s(a["healthcare"]), operator: s(a["operator"]), emergency: s(a["emergency"]), lat: g.y, lon: g.x }];
        });
        return { ...meta, status: "ok" as const, total: Number(c["count"] ?? hospitals.length), hospitals };
      } catch (e) {
        console.error("osm hospitals", e);
        return { ...meta, status: "error" as const, message: "Data temporarily unavailable", total: 0, hospitals: [] };
      }
    });
  });

const ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary"];
const ROAD_CAP = 2000;

export const getOsmRoads = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => bboxIn.parse(d))
  .handler(async ({ data }): Promise<RoadsResult> => {
    const meta = { source: "OpenStreetMap contributors (via Esri live OSM replica)", dataset: "OSM Highways for Africa — motorway, trunk, primary, secondary", sourceUrl: OSM_ROADS_URL, retrievedAt: new Date().toISOString(), license: "ODbL" as const };
    const a = area(data.bbox);
    if (a > 150) return { ...meta, status: "limited", message: "Select a region to load roads (too many road segments for a whole country).", total: 0, roads: [] };
    return cached(`r${data.bbox}`, async () => {
      try {
        const geometry = data.bbox.join(",");
        const where = `highway IN (${ROAD_CLASSES.map((c) => `'${c}'`).join(",")})`;
        const [c, f] = await Promise.all([
          query(OSM_ROADS_URL, { where, geometry, returnCountOnly: "true" }),
          query(OSM_ROADS_URL, { where, geometry, outFields: "objectid,osm_id2,highway,name,ref,surface", returnGeometry: "true", resultRecordCount: String(ROAD_CAP), maxAllowableOffset: String(Math.max(0.0005, Math.sqrt(a) / 2000)), geometryPrecision: "5", orderByFields: "highway" }),
        ]);
        const feats = (f["features"] as { attributes: Record<string, unknown>; geometry?: { paths?: number[][][] } }[] | undefined) ?? [];
        const roads = feats.flatMap((x): OsmRoad[] => {
          const p = x.geometry?.paths; if (!p?.length) return [];
          const at = x.attributes;
          return [{ id: `osm-${s(at["osm_id2"]) ?? s(at["objectid"])}`, highway: s(at["highway"]) ?? "road", name: s(at["name"]), ref: s(at["ref"]), surface: s(at["surface"]), paths: p.map((path) => path.map(([lon, lat]) => [lat!, lon!] as [number, number])) }];
        });
        return { ...meta, status: "ok" as const, total: Number(c["count"] ?? roads.length), roads };
      } catch (e) {
        console.error("osm roads", e);
        return { ...meta, status: "error" as const, message: "Data temporarily unavailable", total: 0, roads: [] };
      }
    });
  });
