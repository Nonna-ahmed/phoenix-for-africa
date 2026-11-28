import { useEffect, useState } from "react";

export interface CountryShape { iso: string; name: string; type: "Polygon" | "MultiPolygon"; coords: number[][][][] }
type Fc = { features: { properties: { iso: string; name: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } }[] };

let cache: Promise<CountryShape[]> | null = null;
/** Natural Earth 1:50m country borders (public domain), Africa only, shipped as /data/africa-countries.json. */
export function loadAfrica(): Promise<CountryShape[]> {
  cache ??= fetch("/data/africa-countries.json").then((r) => r.json() as Promise<Fc>).then((fc) => fc.features.map((f) => ({
    iso: f.properties.iso, name: f.properties.name, type: f.geometry.type,
    coords: (f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : f.geometry.coordinates as number[][][][]),
  }))).catch(() => { cache = null; return []; });
  return cache;
}
export function useAfrica(): CountryShape[] | null {
  const [v, setV] = useState<CountryShape[] | null>(null);
  useEffect(() => { let live = true; void loadAfrica().then((x) => { if (live) setV(x); }); return () => { live = false; }; }, []);
  return v;
}

function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]! as [number, number], [xj, yj] = ring[j]! as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inCountry(lon: number, lat: number, c: CountryShape): boolean {
  return c.coords.some((poly) => inRing(lon, lat, poly[0]!) && !poly.slice(1).some((h) => inRing(lon, lat, h)));
}
export const inAnyCountry = (lon: number, lat: number, cs: CountryShape[]) => cs.some((c) => inCountry(lon, lat, c));
