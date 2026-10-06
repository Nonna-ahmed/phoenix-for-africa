import type { ReactNode } from "react";
import { Section } from "./ui";
import { LiveBadge, Note } from "./ApiState";
import { useSiteContext } from "@/services/api/hooks";

const Miss = () => <span className="text-unavailable">Unavailable</span>;
const v = (x: number | null | undefined, u = "") => (x === null || x === undefined ? <Miss /> : `${x.toLocaleString()}${u}`);
const compass = (a: number | null) => (a === null ? null : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(a / 45) % 8]);

function Card({ title, status, message, source, product, date, children }: { title: string; status: string; message?: string | undefined; source: string; product: string; date?: string | null | undefined; children: ReactNode }) {
  return (
    <div className="rounded-sm border bg-background/40 p-3">
      <div className="label-mono mb-2">{title}</div>
      {status === "ok" ? children : <Note tone="muted">{message ?? "Data temporarily unavailable"}</Note>}
      <p className="mt-2 text-[11px] text-muted-foreground">Source: {source} · {product}{date ? ` · ${date}` : ""}</p>
    </div>
  );
}

/** Fuel, terrain, exposure and dryness context at a point. Inputs only — not a risk prediction. */
export function SitePanel({ point }: { point?: [number, number] | undefined }) {
  const q = useSiteContext(point);
  const d = q.data;
  return (
    <Section title="Land, terrain, people & dryness" right={d ? <LiveBadge /> : undefined}>
      {!point ? <Note tone="muted">Site data unavailable</Note>
        : q.isLoading ? <p className="text-sm text-muted-foreground">Loading land cover, terrain, population and soil moisture…</p>
        : q.isError || !d ? <Note tone="error">Data temporarily unavailable. Please try again.</Note>
        : (<>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card title="Land cover" {...d.landCover} date={d.landCover.landCoverDate}>
              <div className="text-xl font-semibold">{d.landCover.landCoverLabel}</div>
              <div className="text-xs text-muted-foreground">Class code {d.landCover.landCoverCode}</div>
            </Card>
            <Card title="Terrain" {...d.terrain}>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><div className="text-xs text-muted-foreground">Elevation</div>{v(d.terrain.elevation, " m")}</div>
                <div><div className="text-xs text-muted-foreground">Slope</div>{v(d.terrain.slope, "°")}</div>
                <div><div className="text-xs text-muted-foreground">Faces</div>{d.terrain.aspect === null ? (d.terrain.slope !== null ? "Flat" : <Miss />) : `${compass(d.terrain.aspect)} (${d.terrain.aspect}°)`}</div>
              </div>
            </Card>
            <Card title="Population nearby (estimate)" {...d.population} date={String(d.population.year)}>
              <div className="text-xl font-semibold">{d.population.population === null ? <Miss /> : `≈ ${d.population.population.toLocaleString()}`}</div>
              <div className="text-xs text-muted-foreground">Within ~{d.population.areaKm2} km² around the point · ≈ {v(d.population.populationDensity)} people/km². Modelled estimate, not an exact count.</div>
            </Card>
            <Card title="Soil moisture (dryness)" {...d.drought} date={d.drought.date}>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><div className="text-xs text-muted-foreground">Root zone</div>{v(d.drought.soilMoistureRoot)}</div>
                <div><div className="text-xs text-muted-foreground">Surface</div>{v(d.drought.soilMoistureTop)}</div>
              </div>
              <div className="text-xs text-muted-foreground">0 = completely dry, 1 = saturated.</div>
            </Card>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Values at the region's reference point ({d.lat}, {d.lon}). These are model inputs and context only — not a wildfire risk prediction. Vegetation index (NDVI) and burned-area data are not yet connected.</p>
        </>)}
    </Section>
  );
}
