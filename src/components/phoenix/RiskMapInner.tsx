import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Rectangle, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import { COUNTRIES } from "@/data/registry";
import { riskLevel } from "@/data/types";
import type { ApiReport, ApiShelter, RiskPoint } from "@/services/api/endpoints";
import type { Hotspot } from "@/lib/firms.functions";

export type Layers = { risk: boolean; fires: boolean; shelters: boolean; reports: boolean; boundaries: boolean };
export interface MapProps {
  countryCode?: string | undefined; regionId?: string | undefined; layers?: Layers; riskFilter?: string; height?: number;
  risk?: RiskPoint[] | undefined; shelters?: ApiShelter[] | undefined; reports?: ApiReport[] | undefined; hotspots?: Hotspot[] | undefined;
}

const css = (v: string) => (typeof window === "undefined" ? "#f60" : getComputedStyle(document.documentElement).getPropertyValue(v).trim());
const fmt = (v: number | null | undefined, u: string) => (v === null || v === undefined ? "Missing" : `${v}${u}`);
const na = (v: unknown) => (v === null || v === undefined || v === "" ? "Data unavailable" : String(v));

function Fly({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom, { duration: 0.8 }); }, [center[0], center[1], zoom]);
  return null;
}

export default function RiskMapInner({ countryCode, regionId, layers = { risk: true, fires: true, shelters: true, reports: true, boundaries: true }, riskFilter = "ALL", height = 520, risk = [], shelters = [], reports = [], hotspots = [] }: MapProps) {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  const region = country?.regions.find((r) => r.id === regionId);
  const center: [number, number] = region?.center ?? country?.center ?? [2, 20];
  const zoom = region ? 8 : country?.zoom ?? 3;
  const color = { HIGH: css("--risk-high"), MEDIUM: css("--risk-medium"), LOW: css("--risk-low") };

  return (
    <div style={{ height }} className="overflow-hidden rounded-md border">
      <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" className="phoenix-tiles" />
        <Fly center={center} zoom={zoom} />
        {layers.boundaries && COUNTRIES.filter((c) => !countryCode || c.code === countryCode).map((c) => (
          <CircleMarker key={c.code} center={c.center} radius={4} pathOptions={{ color: css("--muted-foreground"), weight: 1, fillOpacity: 0.3 }}>
            <Popup><b>{c.name}</b><br />{c.coverage === "active" ? "Real data coverage" : "Coverage: Coming Soon"}</Popup>
          </CircleMarker>
        ))}
        {layers.boundaries && COUNTRIES.flatMap((c) => c.regions.filter((r) => r.bbox && (!countryCode || c.code === countryCode)).map((r) => (
          <Rectangle key={r.id} bounds={[[r.bbox![1], r.bbox![0]], [r.bbox![3], r.bbox![2]]]} pathOptions={{ color: css("--muted-foreground"), weight: 1, dashArray: "4", fillOpacity: 0 }} />
        )))}
        {layers.risk && risk.map((p, i) => {
          const lvl = p.probability !== null ? riskLevel(p.probability) : null;
          if (riskFilter !== "ALL" && riskFilter !== lvl) return null;
          const c = lvl ? color[lvl] : css("--unavailable");
          return (
            <CircleMarker key={`${p.lat},${p.lon},${i}`} center={[p.lat, p.lon]} radius={7} pathOptions={{ color: c, fillColor: c, fillOpacity: 0.55, weight: 1 }}>
              <Popup>
                <b>Predicted Wildfire Risk</b><br />
                {p.lat.toFixed(3)}, {p.lon.toFixed(3)}<br />
                Probability: {p.probability !== null ? `${(p.probability * 100).toFixed(1)}%` : "Data unavailable"}<br />
                Risk level: {lvl ?? "Data unavailable"}<br />
                Date: {na(p.date)}<br />
                {p.environment ? <>T2M_MAX {fmt(p.environment.t2mMax, "°C")} · T2M_MIN {fmt(p.environment.t2mMin, "°C")}<br />RH2M {fmt(p.environment.rh2m, "%")} · WS2M {fmt(p.environment.ws2m, " m/s")} · PRECTOTCORR {fmt(p.environment.precip, " mm")}</> : "Environmental data unavailable"}
              </Popup>
            </CircleMarker>
          );
        })}
        {layers.shelters && shelters.map((s) => (
          <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={6} pathOptions={{ color: css("--shelter"), fillColor: css("--shelter"), fillOpacity: 0.8 }}>
            <Popup><b>{na(s.name)}</b><br />Capacity: {na(s.capacity)}<br />Status: {na(s.status)}<br />Contact: {na(s.contact)}</Popup>
          </CircleMarker>
        ))}
        {layers.fires && hotspots.map((h, i) => (
          <CircleMarker key={`h${i}`} center={[h.lat, h.lon]} radius={h.frp && h.frp > 50 ? 7 : 5}
            pathOptions={{ color: css("--fire"), weight: 1.5, dashArray: "2 2", fillColor: css("--fire"), fillOpacity: 0.35 }}>
            <Popup>
              <b>Satellite hotspot</b> <i>(thermal anomaly)</i><br />
              <b style={{ color: css("--fire") }}>Not a confirmed ground fire</b><br />
              Source: NASA FIRMS · {h.instrument}{h.satellite ? ` · ${h.satellite}` : ""}<br />
              {h.acqDate} {h.acqTime} UTC{h.daynight ? ` (${h.daynight === "D" ? "day" : "night"})` : ""}<br />
              Confidence: {na(h.confidence)} · FRP: {h.frp !== null ? `${h.frp} MW` : "Data unavailable"}<br />
              {h.lat.toFixed(4)}, {h.lon.toFixed(4)}
            </Popup>
          </CircleMarker>
        ))}
        {layers.reports && reports.map((r) => r.confirmed ? (
          <Rectangle key={r.id} bounds={[[r.lat - 0.03, r.lon - 0.03], [r.lat + 0.03, r.lon + 0.03]]} pathOptions={{ color: css("--foreground"), weight: 2, fillColor: css("--destructive"), fillOpacity: 0.95 }}>
            <Popup><b>Confirmed ground fire</b><br />Verified report<br />{na(r.description)}<br />{na(r.reportedAt)}</Popup>
          </Rectangle>
        ) : (
          <CircleMarker key={r.id} center={[r.lat, r.lon]} radius={5} pathOptions={{ color: css("--report"), fillColor: css("--report"), fillOpacity: 0.8 }}>
            <Popup><b>Community fire report</b> (unverified)<br />{na(r.description)}<br />{na(r.reportedAt)}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
