import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Rectangle, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import { COUNTRIES } from "@/data/registry";
import { riskLevel } from "@/data/types";
import type { ApiReport, ApiShelter, RiskPoint } from "@/services/api/endpoints";
import type { Hotspot } from "@/lib/firms.functions";
import { isConfirmedShelter, TYPE_LABEL, VERIFY_LABEL, type SafeLocation } from "@/data/locations";
import type { SiteContext } from "@/lib/site.functions";
import type { PowerResult } from "@/lib/power.functions";
import type { LayerState } from "./layers";

export interface SitePoint { label: string; lat: number; lon: number; site?: SiteContext | undefined; power?: PowerResult | undefined }
export interface MapProps {
  countryCode?: string | undefined; regionId?: string | undefined; on: LayerState; riskFilter?: string | undefined; height?: number | undefined;
  risk?: RiskPoint[] | undefined; shelters?: ApiShelter[] | undefined; reports?: ApiReport[] | undefined; hotspots?: Hotspot[] | undefined; locations?: SafeLocation[] | undefined; sitePoints?: SitePoint[] | undefined;
}

const css = (v: string) => (typeof window === "undefined" ? "#f60" : getComputedStyle(document.documentElement).getPropertyValue(v).trim());
const fmt = (v: number | null | undefined, u: string) => (v === null || v === undefined ? "Missing" : `${v}${u}`);
const na = (v: unknown) => (v === null || v === undefined || v === "" ? "Data unavailable" : String(v));

function Fly({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom, { duration: 0.8 }); }, [center[0], center[1], zoom]);
  return null;
}

export default function RiskMapInner({ countryCode, regionId, on, riskFilter = "ALL", height = 520, risk = [], shelters = [], reports = [], hotspots = [], locations = [], sitePoints = [] }: MapProps) {
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
        {COUNTRIES.filter((c) => !countryCode || c.code === countryCode).map((c) => (
          <CircleMarker key={c.code} center={c.center} radius={4} pathOptions={{ color: css("--muted-foreground"), weight: 1, fillOpacity: 0.3 }}>
            <Popup><b>{c.name}</b><br />{c.coverage === "active" ? "Real data coverage" : "Coverage: Coming Soon"}</Popup>
          </CircleMarker>
        ))}
        {COUNTRIES.flatMap((c) => c.regions.filter((r) => r.bbox && (!countryCode || c.code === countryCode)).map((r) => (
          <Rectangle key={r.id} bounds={[[r.bbox![1], r.bbox![0]], [r.bbox![3], r.bbox![2]]]} pathOptions={{ color: css("--muted-foreground"), weight: 1, dashArray: "4", fillOpacity: 0 }} />
        )))}
        {on.risk && risk.map((p, i) => {
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
        {locations.map((l) => {
          const confirmed = isConfirmedShelter(l);
          if (confirmed ? !on.shelters_verified : false) return null;
          const c = confirmed ? css("--shelter") : css(l.locationType === "health_facility" ? "--loc-health" : l.locationType === "school" ? "--loc-school" : l.locationType === "religious_center" ? "--loc-religious" : "--loc-settlement");
          const r = confirmed ? 8 : l.locationType === "settlement" ? 2.5 : 4;
          return (
            <CircleMarker key={l.id} center={[l.latitude, l.longitude]} radius={r} pathOptions={{ color: confirmed ? css("--foreground") : c, weight: confirmed ? 3 : 1, fillColor: c, fillOpacity: 0.85 }}>
              <Popup>
                <b>{l.name ?? "Name unavailable"}</b><br />
                Type: {TYPE_LABEL[l.locationType]}{confirmed ? " (confirmed emergency shelter)" : " — not an emergency shelter"}<br />
                {l.country}{l.region ? ` · ${l.region}` : ""}{l.district ? ` · ${l.district}` : ""}<br />
                Source: {l.sourceDataset}<br />
                Verification: {VERIFY_LABEL[l.verificationStatus]}<br />
                Capacity: {na(l.capacity)} · Last verified: {na(l.lastVerified)}<br />
                {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}{l.notes ? <><br />{l.notes}</> : null}
              </Popup>
            </CircleMarker>
          );
        })}
        {on.safe_locations && shelters.map((s) => (
          <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={6} pathOptions={{ color: css("--layer-safe"), fillColor: css("--layer-safe"), fillOpacity: 0.8 }}>
            <Popup><b>{na(s.name)}</b><br />Potential safe location — not a verified shelter<br />Source: PHOENIX backend · drc_katanga_shelters_final.csv<br />{s.lat.toFixed(4)}, {s.lon.toFixed(4)}<br />Verification: Unverified — provenance not provided<br />Capacity: {na(s.capacity)}<br />Status: {na(s.status)}<br />Contact: {na(s.contact)}</Popup>
          </CircleMarker>
        ))}
        {on.fires && hotspots.map((h, i) => (
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
        {on.reports && reports.map((r) => r.confirmed ? (
          <Rectangle key={r.id} bounds={[[r.lat - 0.03, r.lon - 0.03], [r.lat + 0.03, r.lon + 0.03]]} pathOptions={{ color: css("--foreground"), weight: 2, fillColor: css("--destructive"), fillOpacity: 0.95 }}>
            <Popup><b>Confirmed ground fire</b><br />Verified report<br />{na(r.description)}<br />{na(r.reportedAt)}</Popup>
          </Rectangle>
        ) : (
          <CircleMarker key={r.id} center={[r.lat, r.lon]} radius={5} pathOptions={{ color: css("--report"), fillColor: css("--report"), fillOpacity: 0.8 }}>
            <Popup><b>Community fire report</b> (unverified)<br />{na(r.description)}<br />{na(r.reportedAt)}</Popup>
          </CircleMarker>
        ))}
        <SiteMarkers points={sitePoints} on={on} />
      </MapContainer>
    </div>
  );
}

const SITE_KEYS = [["weather", "--layer-weather"], ["soil", "--layer-soil"], ["landcover", "--layer-landcover"], ["terrain", "--layer-terrain"], ["population", "--layer-pop"]] as const;

/** One marker per enabled context layer per region point, slightly offset so layers never merge. */
function SiteMarkers({ points, on }: { points: SitePoint[]; on: LayerState }) {
  const active = SITE_KEYS.filter(([k]) => on[k]);
  return <>{points.flatMap((p) => active.map(([k, v], i) => {
    const off = (i - (active.length - 1) / 2) * 0.12;
    const body = siteBody(k, p);
    if (!body) return null;
    const c = css(v);
    return (
      <Rectangle key={`${k}-${p.lat}-${p.lon}`} bounds={[[p.lat - 0.05, p.lon + off - 0.05], [p.lat + 0.05, p.lon + off + 0.05]]} pathOptions={{ color: c, fillColor: c, fillOpacity: 0.9, weight: 3 }}>
        <Popup><b>{p.label}</b><br />{body}<br />{p.lat.toFixed(3)}, {p.lon.toFixed(3)} (region reference point)</Popup>
      </Rectangle>
    );
  }))}</>;
}

function siteBody(k: (typeof SITE_KEYS)[number][0], p: SitePoint) {
  const s = p.site;
  if (k === "weather") {
    const d = p.power; if (!d?.latest) return null; const v = d.latest.values;
    return <>NASA POWER weather · {d.latest.date}<br />Max {fmt(v.T2M_MAX, "°C")} · Min {fmt(v.T2M_MIN, "°C")} · RH {fmt(v.RH2M, "%")}<br />Wind {fmt(v.WS2M, " m/s")} · Rain {fmt(v.PRECTOTCORR, " mm")}<br />Source: {d.source} · {d.dataset}</>;
  }
  if (!s) return null;
  if (k === "soil") { const x = s.drought; if (x.status !== "ok") return null; return <>Soil moisture · {x.date}<br />Root zone {fmt(x.soilMoistureRoot, "")} · Surface {fmt(x.soilMoistureTop, "")} (0 dry – 1 saturated)<br />Source: {x.source} · {x.product}</>; }
  if (k === "landcover") { const x = s.landCover; if (x.status !== "ok") return null; return <>Land cover: {x.landCoverLabel} (code {x.landCoverCode})<br />Source: {x.source} · {x.product}</>; }
  if (k === "terrain") { const x = s.terrain; if (x.status !== "ok") return null; return <>Elevation {fmt(x.elevation, " m")} · Slope {fmt(x.slope, "°")} · Aspect {fmt(x.aspect, "°")}<br />Source: {x.source} · {x.product}</>; }
  const x = s.population; if (x.status !== "ok") return null;
  return <>Population ≈ {x.population?.toLocaleString() ?? "Missing"} within ~{x.areaKm2} km² (estimate, not an exact count)<br />Source: {x.source} · {x.product}</>;
}
