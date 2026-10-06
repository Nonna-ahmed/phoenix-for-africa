import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAvailability } from "@/data/sources";
import { getCountry } from "@/data/registry";
import type { SafeLocation } from "@/data/locations";

export interface LayerResult { layerId: string; sourceDataset: string; status: "ok" | "error"; count: number; returned: number; message?: string; coverageNote?: string }
export interface LocationsResult { countryCode: string; locations: SafeLocation[]; layers: LayerResult[]; retrievedAt: string; noSource: boolean }

const PER_LAYER = 400;
const input = z.object({
  countryCode: z.string().min(2).max(3),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  types: z.array(z.string()).optional(),
});

const cache = new Map<string, { at: number; data: LocationsResult }>();
const TTL = 6 * 3600_000;

type Attrs = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const dateStr = (v: unknown) => (typeof v === "number" ? new Date(v).toISOString().slice(0, 10) : s(v));

export const getSafeLocations = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<LocationsResult> => {
    const avail = getAvailability(data.countryCode.toUpperCase());
    const country = getCountry(data.countryCode);
    const retrievedAt = new Date().toISOString();
    const layers = (avail?.layers ?? []).filter((l) => !data.types || data.types.includes(l.locationType));
    if (!country || layers.length === 0) return { countryCode: data.countryCode, locations: [], layers: [], retrievedAt, noSource: true };

    const key = JSON.stringify(data);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.data;

    const env = data.bbox.join(",");
    const results = await Promise.all(layers.map(async (l) => {
      const q = `geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects`;
      try {
        const [cRes, fRes] = await Promise.all([
          fetch(`${l.url}/query?where=1%3D1&${q}&returnCountOnly=true&f=json`),
          fetch(`${l.url}/query?where=1%3D1&${q}&outFields=*&returnGeometry=true&resultRecordCount=${PER_LAYER}&f=json`),
        ]);
        if (!cRes.ok || !fRes.ok) throw new Error(`HTTP ${cRes.status}/${fRes.status}`);
        const count = ((await cRes.json()) as { count?: number }).count ?? 0;
        const j = (await fRes.json()) as { features?: { attributes: Attrs; geometry?: { x: number; y: number } }[]; error?: { message?: string } };
        if (j.error) throw new Error(j.error.message ?? "ArcGIS error");
        const locs: SafeLocation[] = (j.features ?? []).flatMap((f, i) => {
          const a = f.attributes;
          const lat = f.geometry?.y ?? Number(a["lat"]), lon = f.geometry?.x ?? Number(a["lon"]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
          const sub = l.typeField ? s(a[l.typeField]) : null;
          return [{
            id: `${l.id}-${s(a["grid3id"]) ?? s(a["OBJECTID"]) ?? i}`,
            name: s(a[l.nameField]), country: country.name, countryCode: country.code,
            region: l.regionField ? s(a[l.regionField]) : null, district: l.districtField ? s(a[l.districtField]) : null,
            latitude: lat, longitude: lon, locationType: l.locationType,
            isEmergencyShelter: false, // GRID3 is not a shelter registry
            capacity: null, source: l.source, sourceDataset: l.sourceDataset, sourceUrl: l.url,
            sourceDate: l.dateField ? dateStr(a[l.dateField]) : null, lastVerified: null,
            verificationStatus: "trusted_geospatial_source", accessibility: null, contact: null,
            notes: sub ? `Subtype: ${sub}` : null,
          }];
        });
        return { layer: { layerId: l.id, sourceDataset: l.sourceDataset, status: "ok" as const, count, returned: locs.length, ...(l.coverageNote ? { coverageNote: l.coverageNote } : {}) }, locs };
      } catch (e) {
        console.error("GRID3 layer failed", l.id, e);
        return { layer: { layerId: l.id, sourceDataset: l.sourceDataset, status: "error" as const, count: 0, returned: 0, message: "Unable to retrieve this layer" }, locs: [] };
      }
    }));
    const result: LocationsResult = { countryCode: country.code, locations: results.flatMap((r) => r.locs), layers: results.map((r) => r.layer), retrievedAt, noSource: false };
    cache.set(key, { at: Date.now(), data: result });
    return result;
  });
