/**
 * Tolerant normalizers for PHOENIX backend responses.
 * Response shapes have NOT yet been verified against the live backend;
 * each reader accepts the likely field spellings and returns null when a
 * field is absent — it never invents a value.
 */
import type { Environment } from "@/data/types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Unwrap arrays from {data|results|items|points|features|...} or GeoJSON. */
export function rows(payload: unknown, keys: string[] = []): Obj[] {
  if (Array.isArray(payload)) return payload.filter(isObj).map(flatFeature);
  if (!isObj(payload)) return [];
  for (const k of [...keys, "data", "results", "items", "points", "features", "records"]) {
    if (Array.isArray(payload[k])) return (payload[k] as unknown[]).filter(isObj).map(flatFeature);
  }
  return [];
}

function flatFeature(o: Obj): Obj {
  if (o["type"] === "Feature" && isObj(o["properties"])) {
    const g = o["geometry"] as Obj | undefined;
    const c = Array.isArray(g?.["coordinates"]) ? (g!["coordinates"] as number[]) : [];
    return { ...(o["properties"] as Obj), __lon: c[0], __lat: c[1] };
  }
  return o;
}

export function pick(o: Obj, names: string[]): unknown {
  for (const n of names) {
    if (n in o && o[n] !== null && o[n] !== undefined && o[n] !== "") return o[n];
    const hit = Object.keys(o).find((k) => k.toLowerCase() === n.toLowerCase());
    if (hit && o[hit] !== null && o[hit] !== undefined && o[hit] !== "") return o[hit];
  }
  return undefined;
}

/** Number or null. NASA POWER -999 fill values become null (missing). */
export function num(o: Obj, names: string[]): number | null {
  const v = pick(o, names);
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= -999) return null;
  return n;
}

export function str(o: Obj, names: string[]): string | null {
  const v = pick(o, names);
  return v === undefined ? null : String(v);
}

export const LAT = ["lat", "LAT", "latitude", "__lat"];
export const LON = ["lon", "LON", "lng", "longitude", "__lon"];

export function env(o: Obj): Environment | null {
  const e: Environment = {
    t2mMax: num(o, ["T2M_MAX", "t2m_max"]), t2mMin: num(o, ["T2M_MIN", "t2m_min"]),
    rh2m: num(o, ["RH2M", "rh2m", "humidity"]), ws2m: num(o, ["WS2M", "ws2m", "wind"]),
    precip: num(o, ["PRECTOTCORR", "prectotcorr", "precip", "precipitation"]),
    date: str(o, ["date", "DATE", "time", "timestamp"]) ?? "",
  };
  const has = ["T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR"].some((k) => pick(o, [k]) !== undefined);
  return has ? e : null;
}
