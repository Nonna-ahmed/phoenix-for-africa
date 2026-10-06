import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Rectangle, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import { COUNTRIES, DETECTIONS, REPORTS, SHELTERS } from "@/data/registry";
import { riskLevel } from "@/data/types";

export type Layers = { risk: boolean; fires: boolean; shelters: boolean; reports: boolean; boundaries: boolean };
export interface MapProps { countryCode?: string; regionId?: string; layers?: Layers; riskFilter?: string; height?: number }

const css = (v: string) => (typeof window === "undefined" ? "#f60" : getComputedStyle(document.documentElement).getPropertyValue(v).trim());

function Fly({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom, { duration: 0.8 }); }, [center[0], center[1], zoom]);
  return null;
}

export default function RiskMap({ countryCode, regionId, layers = { risk: true, fires: true, shelters: true, reports: true, boundaries: true }, riskFilter = "ALL", height = 520 }: MapProps) {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  const region = country?.regions.find((r) => r.id === regionId);
  const center: [number, number] = region?.center ?? country?.center ?? [2, 20];
  const zoom = region ? 8 : country?.zoom ?? 3;
  const inScope = (cc: string, rid?: string) => (!countryCode || cc === countryCode) && (!regionId || rid === regionId);
  const color = { HIGH: css("--risk-high"), MEDIUM: css("--risk-medium"), LOW: css("--risk-low") };

  return (
    <div style={{ height }} className="overflow-hidden rounded-md border">
      <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; OpenStreetMap &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <Fly center={center} zoom={zoom} />
        {layers.boundaries && COUNTRIES.filter((c) => !countryCode || c.code === countryCode).map((c) => (
          <CircleMarker key={c.code} center={c.center} radius={4} pathOptions={{ color: css("--muted-foreground"), weight: 1, fillOpacity: 0.3 }}>
            <Popup><b>{c.name}</b><br />{c.coverage === "active" ? "Coverage active" : "Coverage: Coming Soon"}</Popup>
          </CircleMarker>
        ))}
        {layers.risk && COUNTRIES.flatMap((c) => c.regions.filter((r) => inScope(c.code, r.id) && typeof r.probability === "number").map((r) => {
          const lvl = riskLevel(r.probability!);
          if (riskFilter !== "ALL" && riskFilter !== lvl) return null;
          const opts = { color: color[lvl], weight: 1.5, fillOpacity: 0.25 };
          const popup = <Popup><b>{r.name}</b><br />Predicted Risk: {Math.round(r.probability! * 100)}% ({lvl})<br /><i>Demo value</i></Popup>;
          return r.bbox
            ? <Rectangle key={r.id} bounds={[[r.bbox[1], r.bbox[0]], [r.bbox[3], r.bbox[2]]]} pathOptions={opts}>{popup}</Rectangle>
            : <CircleMarker key={r.id} center={r.center} radius={28} pathOptions={opts}>{popup}</CircleMarker>;
        }))}
        {layers.fires && DETECTIONS.filter((d) => inScope(d.countryCode, d.regionId)).map((d) => (
          <CircleMarker key={d.id} center={[d.lat, d.lon]} radius={6} pathOptions={{ color: css("--fire"), fillColor: css("--fire"), fillOpacity: 0.9, weight: 2 }}>
            <Popup><b>Satellite Fire Detection</b><br />Source: NASA FIRMS · {d.sensor}<br />{d.acqDate} {d.acqTime} UTC<br />Confidence: {d.confidence ?? "n/a"}<br /><i>Demo — not a confirmed fire</i></Popup>
          </CircleMarker>
        ))}
        {layers.shelters && SHELTERS.filter((s) => inScope(s.countryCode, s.regionId)).map((s) => (
          <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={6} pathOptions={{ color: css("--shelter"), fillColor: css("--shelter"), fillOpacity: 0.8 }}>
            <Popup><b>{s.name}</b><br />Capacity: {s.capacity ?? "n/a"} · {s.status}</Popup>
          </CircleMarker>
        ))}
        {layers.reports && REPORTS.filter((r) => inScope(r.countryCode, r.regionId)).map((r) => (
          <CircleMarker key={r.id} center={[r.lat, r.lon]} radius={5} pathOptions={{ color: css("--report"), fillColor: css("--report"), fillOpacity: 0.8 }}>
            <Popup><b>Community fire report</b><br />{r.description}<br />{r.reportedAt}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
