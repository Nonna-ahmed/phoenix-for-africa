import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Rectangle, Popup, ImageOverlay, Polyline, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { COUNTRIES } from "@/data/registry";
import { riskLevel } from "@/data/types";
import type { ApiReport, ApiShelter, RiskPoint } from "@/services/api/endpoints";
import type { Hotspot } from "@/lib/firms.functions";
import { isConfirmedShelter, TYPE_LABEL, VERIFY_LABEL, type SafeLocation } from "@/data/locations";
import { getPixelInfo, type PixelInfo } from "@/lib/site.functions";
import type { GridResult } from "@/lib/grid.functions";
import type { OsmHospital, OsmRoad } from "@/lib/osm.functions";
import { GRID_SCALE, HILLSHADE_TILES, rasterUrl, scaleColor, type RasterId } from "@/data/rasters";
import type { LayerState } from "./layers";

export type RasterStatus = (id: RasterId | "terrain", ok: boolean) => void;
export interface MapProps {
  countryCode?: string | undefined; regionId?: string | undefined; on: LayerState; riskFilter?: string | undefined; height?: number | undefined;
  risk?: RiskPoint[] | undefined; shelters?: ApiShelter[] | undefined; reports?: ApiReport[] | undefined; hotspots?: Hotspot[] | undefined; locations?: SafeLocation[] | undefined;
  grids?: { weather?: GridResult | undefined; soil?: GridResult | undefined }; onRaster?: RasterStatus; hospitals?: OsmHospital[] | undefined; roads?: OsmRoad[] | undefined;
}

const css = (v: string) => (typeof window === "undefined" ? "#f60" : getComputedStyle(document.documentElement).getPropertyValue(v).trim());
const fmt = (v: number | null | undefined, u: string) => (v === null || v === undefined ? "Missing" : `${v}${u}`);
const na = (v: unknown) => (v === null || v === undefined || v === "" ? "Data unavailable" : String(v));

function Fly({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom, { duration: 0.8 }); }, [center[0], center[1], zoom]);
  return null;
}

export default function RiskMapInner({ countryCode, regionId, on, riskFilter = "ALL", height = 520, risk = [], shelters = [], reports = [], hotspots = [], locations = [], grids = {}, onRaster, hospitals = [], roads = [] }: MapProps) {
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
        {on.terrain && <TileLayer url={HILLSHADE_TILES} opacity={0.55} attribution="Hillshade: Esri, USGS, NASA SRTM and others" eventHandlers={{ tileload: () => onRaster?.("terrain", true), tileerror: () => onRaster?.("terrain", false) }} />}
        {on.landcover && <ViewRaster id="landcover" opacity={0.6} onRaster={onRaster} />}
        {on.population && <ViewRaster id="population" opacity={0.65} onRaster={onRaster} />}
        {on.weather && grids.weather && <GridCells g={grids.weather} />}
        {on.soil && grids.soil && <GridCells g={grids.soil} />}
        {on.osm_roads && roads.map((r) => (
          <Polyline key={r.id} positions={r.paths} pathOptions={{ color: css("--layer-road"), weight: r.highway === "motorway" || r.highway === "trunk" ? 3 : r.highway === "primary" ? 2.2 : 1.4, opacity: 0.85 }}>
            <Popup><b>{r.name ?? r.ref ?? "Unnamed road"}</b>{r.ref && r.name ? ` (${r.ref})` : ""}<br />Class: {r.highway} · Surface: {na(r.surface)}<br />Not an approved evacuation route<br />Source: OpenStreetMap contributors (ODbL) · {r.id}</Popup>
          </Polyline>
        ))}
        {on.osm_hospitals && hospitals.map((h) => {
          const hosp = h.amenity === "hospital"; const c = css(hosp ? "--layer-hospital" : "--layer-clinic");
          return hosp ? (
            <Rectangle key={h.id} bounds={[[h.lat - 0.006, h.lon - 0.006], [h.lat + 0.006, h.lon + 0.006]]} pathOptions={{ color: css("--foreground"), weight: 1, fillColor: c, fillOpacity: 0.95 }}>
              <Popup>{hospPopup(h)}</Popup>
            </Rectangle>
          ) : (
            <CircleMarker key={h.id} center={[h.lat, h.lon]} radius={4} pathOptions={{ color: c, fillColor: c, fillOpacity: 0.9, weight: 1 }}><Popup>{hospPopup(h)}</Popup></CircleMarker>
          );
        })}
        {(on.landcover || on.terrain || on.population) && <PixelClick on={on} />}
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
      </MapContainer>
    </div>
  );
}


/** Source-rendered raster image for the visible extent; re-requested on pan/zoom so detail follows zoom. */
function ViewRaster({ id, opacity, onRaster }: { id: RasterId; opacity: number; onRaster?: RasterStatus | undefined }) {
  const map = useMap();
  const read = () => {
    const b = map.getBounds(), sz = map.getSize();
    const w = Math.max(-180, b.getWest()), e = Math.min(180, b.getEast()), s = Math.max(-85, b.getSouth()), n = Math.min(85, b.getNorth());
    return { bounds: [[s, w], [n, e]] as [[number, number], [number, number]], url: rasterUrl(id, { w, s, e, n }, [Math.min(2048, sz.x), Math.min(2048, sz.y)]) };
  };
  const [v, setV] = useState(read);
  useMapEvents({ moveend: () => setV(read()) });
  return <ImageOverlay key={v.url} url={v.url} bounds={v.bounds} opacity={opacity} eventHandlers={{ load: () => onRaster?.(id, true), error: () => onRaster?.(id, false) }} />;
}

/** NASA POWER native grid cells — each rectangle is one real POWER cell; empty cells stay grey. */
function GridCells({ g }: { g: GridResult }) {
  const sc = GRID_SCALE[g.param];
  return <>{g.cells.map((c) => (
    <Rectangle key={`${g.param}${c.lat},${c.lon}`} bounds={[[c.lat - g.cellLat / 2, c.lon - g.cellLon / 2], [c.lat + g.cellLat / 2, c.lon + g.cellLon / 2]]}
      pathOptions={{ stroke: false, fillColor: c.value === null ? css("--unavailable") : scaleColor(g.param, c.value), fillOpacity: c.value === null ? 0.15 : 0.45 }}>
      <Popup><b>{sc.label}</b>: {c.value === null ? "Missing" : `${c.value} ${sc.unit}`}<br />Date: {g.date ?? "Data unavailable"}<br />Cell centre {c.lat}, {c.lon} (0.5° × 0.625° grid cell)<br />Source: {g.source} · {g.dataset} · {g.param}<br />Retrieved {g.retrievedAt.slice(0, 16).replace("T", " ")} UTC</Popup>
    </Rectangle>
  ))}</>;
}

/** Click anywhere: show the real raster pixel values for the enabled raster layers. */
function PixelClick({ on }: { on: LayerState }) {
  const fetchInfo = useServerFn(getPixelInfo);
  const [hit, setHit] = useState<{ lat: number; lon: number; info?: PixelInfo; err?: boolean } | null>(null);
  useMapEvents({
    click: async (e) => {
      const lat = Math.round(e.latlng.lat * 1e4) / 1e4, lon = Math.round(e.latlng.lng * 1e4) / 1e4;
      const layers = (["landcover", "terrain", "population"] as const).filter((k) => on[k]);
      setHit({ lat, lon });
      try { setHit({ lat, lon, info: await fetchInfo({ data: { lat, lon, layers: [...layers] } }) }); } catch { setHit({ lat, lon, err: true }); }
    },
  });
  if (!hit) return null;
  const i = hit.info;
  return (
    <Popup position={[hit.lat, hit.lon]} eventHandlers={{ remove: () => setHit(null) }}>
      <b>Location {hit.lat}, {hit.lon}</b><br />
      {hit.err ? "Data temporarily unavailable" : !i ? "Loading values…" : <>
        {i.landCover && <>Land cover: {i.landCover.status === "ok" ? `${i.landCover.landCoverLabel} (code ${i.landCover.landCoverCode})` : "Data unavailable"}<br /><small>{i.landCover.source} · {i.landCover.product}</small><br /></>}
        {i.terrain && <>Elevation {fmt(i.terrain.elevation, " m")} · Slope {fmt(i.terrain.slope, "°")} · Aspect {fmt(i.terrain.aspect, "°")}<br /><small>{i.terrain.source} · {i.terrain.product}</small><br /></>}
        {i.density && <>Population density: {i.density.value === null ? "Data unavailable" : `≈ ${i.density.value.toLocaleString()} people/km²`} (estimate)<br /><small>{i.density.source} · {i.density.product}</small></>}
      </>}
    </Popup>
  );
}

function hospPopup(h: OsmHospital) {
  return <><b>{h.name ?? "Name unavailable"}</b><br />Type: {h.amenity}{h.healthcare && h.healthcare !== h.amenity ? ` · ${h.healthcare}` : ""} — critical infrastructure, not an emergency shelter<br />Operator: {na(h.operator)} · Emergency dept: {na(h.emergency)}<br />{h.lat.toFixed(4)}, {h.lon.toFixed(4)}<br />Source: OpenStreetMap contributors (ODbL) · {h.id}<br />Verification: community-mapped, unverified</>;
}
