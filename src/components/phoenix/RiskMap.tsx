import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { MapProps } from "./RiskMapInner";
import { getCountry, scopeBbox } from "@/data/registry";
import { getAvailability } from "@/data/sources";
import { DATASETS } from "@/data/datasets";
import { CONNECTED, useSafeLocations, useFireReports, useHotspots, useRiskMap, useShelters } from "@/services/api/hooks";
import { apiBaseUrl } from "@/services/api/client";
import { getPowerGrid, type GridParam, type GridResult } from "@/lib/grid.functions";
import { GRID_SCALE, LC_LEGEND, POP_BREAKS, SOIL_PARAMS, WEATHER_PARAMS, scaleColor, type RasterId } from "@/data/rasters";
import { LAYERS, defaultLayerState, type LayerDef, type LayerId, type LayerState, type LayerStatus } from "./layers";

const Inner = lazy(() => import("./RiskMapInner"));

function Map(props: MapProps) {
  const fallback = <div style={{ height: props.height ?? 520 }} className="animate-pulse rounded-md border bg-muted" />;
  return <ClientOnly fallback={fallback}><Suspense fallback={fallback}><Inner {...props} /></Suspense></ClientOnly>;
}

type Q = { isLoading: boolean; isFetching?: boolean; isError: boolean };
const st = (kind: LayerStatus["kind"], text: string): LayerStatus => ({ kind, text });

/**
 * Map with independent layer switches. Each layer fetches only while switched on and
 * reports its own availability; one failing source never hides another layer.
 */
export function RiskMap({ countryCode, regionId, initialLayers, riskFilter, height, days = 1, show }: {
  countryCode?: string | undefined; regionId?: string | undefined; initialLayers?: Partial<LayerState>;
  riskFilter?: string; height?: number; days?: number; show?: LayerId[];
}) {
  const [on, setOn] = useState<LayerState>(() => defaultLayerState(initialLayers));
  const [open, setOpen] = useState(false);
  const visible = show ? LAYERS.filter((l) => show.includes(l.id)) : LAYERS;
  const bbox = scopeBbox(countryCode, regionId);
  const avail = countryCode ? getAvailability(countryCode) : undefined;

  // Fire detections
  const fires = useHotspots(bbox, days, on.fires);

  // Backend layers (risk, backend shelter file, reports), per connected country in scope
  const codes = CONNECTED.filter((c) => !countryCode || c === countryCode);
  const dz = useArea("DZ", codes, regionId, on), cd = useArea("CD", codes, regionId, on);
  const areas = [dz, cd].filter((a) => a.inScope);

  // GRID3 — one independent query per type, only when switched on and a country is selected
  const g = (id: LayerId, t: string) => useSafeLocations(countryCode, bbox, on[id], [t]);
  const grid3 = {
    grid3_health: g("grid3_health", "health_facility"), grid3_school: g("grid3_school", "school"),
    grid3_religious: g("grid3_religious", "religious_center"), grid3_settlement: g("grid3_settlement", "settlement"),
  };

  // NASA POWER native grid (weather + soil moisture), one variable at a time, only while on
  const [wVar, setWVar] = useState<GridParam>("T2M_MAX");
  const [sVar, setSVar] = useState<GridParam>("GWETROOT");
  const weatherQ = useQuery({ queryKey: ["grid", bbox, wVar], enabled: on.weather, staleTime: 6 * 3600_000, retry: 1, queryFn: () => getPowerGrid({ data: { bbox, param: wVar } }) });
  const soilQ = useQuery({ queryKey: ["grid", bbox, sVar], enabled: on.soil, staleTime: 6 * 3600_000, retry: 1, queryFn: () => getPowerGrid({ data: { bbox, param: sVar } }) });

  // Raster image layers report whether the source actually delivered an image
  const [raster, setRaster] = useState<Partial<Record<RasterId | "terrain", boolean>>>({});
  const onRaster = (id: RasterId | "terrain", ok: boolean) => setRaster((r) => (r[id] === ok ? r : { ...r, [id]: ok }));

  // ---------- statuses ----------
  const backend = !!apiBaseUrl();
  const fromQuery = (q: Q, n: number | null, noun: string): LayerStatus =>
    q.isLoading ? st("loading", "Loading…") : q.isError ? st("error", "Data temporarily unavailable") : n === 0 ? st("empty", `No ${noun} in this area`) : st("ok", `${(n ?? 0).toLocaleString()} ${noun}`);
  const backendStatus = (key: "risk" | "shelters" | "reports", noun: string, needs?: (code: string) => boolean): LayerStatus => {
    const rel = areas.filter((a) => !needs || needs(a.code));
    if (rel.length === 0) return st("unavailable", "Unavailable for this country");
    if (!backend) return st("unavailable", "Data unavailable — PHOENIX backend not connected");
    const qs = rel.map((a) => a[key]);
    if (qs.some((q) => q.isLoading)) return st("loading", "Loading…");
    const n = qs.reduce((s, q) => s + (q.data?.length ?? 0), 0);
    if (qs.every((q) => q.isError)) return st("error", "Data temporarily unavailable");
    if (qs.some((q) => q.isError)) return st("partial", `${n.toLocaleString()} ${noun} · some areas unavailable`);
    return n === 0 ? st("empty", `No ${noun} in this area`) : st("ok", `${n.toLocaleString()} ${noun}`);
  };
  const gridStatus = (q: { isLoading: boolean; isError: boolean; data?: GridResult | undefined }): LayerStatus => {
    if (q.isLoading) return st("loading", "Loading grid…");
    const d = q.data;
    if (q.isError || !d || d.status === "error") return st("error", d?.message ?? "Data temporarily unavailable");
    if (d.status === "limited") return st("unavailable", d.message ?? "Limited spatial coverage");
    const real = d.cells.filter((c) => c.value !== null).length;
    return st(real < d.cells.length ? "partial" : "ok", `${real.toLocaleString()} of ${d.cells.length.toLocaleString()} grid cells with values · ${d.date} · 0.5° × 0.625°`);
  };
  const rasterStatus = (id: RasterId | "terrain", ok: string): LayerStatus => raster[id] === undefined ? st("loading", "Loading map image…") : raster[id] ? st("ok", ok) : st("error", "Data temporarily unavailable");
  const status = (l: LayerDef): LayerStatus => {
    if (!on[l.id]) return st("off", "Off");
    switch (l.id) {
      case "fires": {
        if (fires.isLoading) return st("loading", "Loading…");
        const d = fires.data;
        if (fires.isError || !d || d.status === "error") return st("error", "Data temporarily unavailable");
        if (d.status === "not_configured") return st("unavailable", "Data unavailable — NASA FIRMS key missing");
        if (d.total === 0) return st("empty", "No hotspots in this period");
        return st(d.truncated ? "partial" : "ok", d.truncated ? `${d.hotspots.length.toLocaleString()} strongest of ${d.total.toLocaleString()} shown` : `${d.total.toLocaleString()} hotspots`);
      }
      case "risk": return backendStatus("risk", "model points", (c) => !!getCountry(c)?.regions.some((r) => r.modelId));
      case "reports": return backendStatus("reports", "reports");
      case "safe_locations": return backendStatus("shelters", "locations", (c) => c === "CD");
      case "shelters_verified": {
        const any = countryCode ? !!avail?.shelterDataAvailable : false;
        return any ? st("ok", "Available") : st("unavailable", countryCode ? "No verified data available for this country" : "No verified data available");
      }
      case "weather": return gridStatus(weatherQ);
      case "soil": return gridStatus(soilQ);
      case "landcover": return rasterStatus("landcover", "Raster · 10 m source, shown at screen resolution · click for class");
      case "terrain": return rasterStatus("terrain", "Hillshade raster · click for elevation & slope (SRTM 30 m)");
      case "population": return rasterStatus("population", "Raster · 1 km density, 2020 · click for value");
      default: {
        if (!countryCode) return st("unavailable", "Select a country to load");
        if (!avail?.layers.some((x) => x.locationType === l.grid3Type)) return st("unavailable", "Unavailable for this country");
        const q = grid3[l.id as keyof typeof grid3];
        const d = q.data;
        if (!q.isLoading && d && d.layers.some((x) => x.status === "error")) return st("error", "Data temporarily unavailable");
        const r = fromQuery(q, d ? d.locations.length : null, "locations");
        const total = d?.layers.reduce((s, x) => s + x.count, 0) ?? 0;
        return r.kind === "ok" && d && total > d.locations.length ? st("partial", `${d.locations.length.toLocaleString()} of ${total.toLocaleString()} shown (per-request limit)`) : r;
      }
    }
  };

  const statuses = Object.fromEntries(visible.map((l) => [l.id, status(l)])) as Record<LayerId, LayerStatus>;
  const shownOn = (id: LayerId) => on[id] && visible.some((l) => l.id === id);
  const locations = (Object.keys(grid3) as (keyof typeof grid3)[]).filter(shownOn).flatMap((k) => grid3[k].data?.locations ?? []);
  const activeCount = visible.filter((l) => on[l.id]).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-sm border bg-card px-3 py-1.5 text-sm">
          ☰ Map layers <span className="text-muted-foreground">({activeCount} on)</span> {open ? "▲" : "▼"}
        </button>
        <span className="text-xs text-muted-foreground">Satellite detections and AI risk are separate layers.</span>
      </div>
      {open && <LayerPanel layers={visible} on={on} statuses={statuses} toggle={(id) => setOn((s) => ({ ...s, [id]: !s[id] }))} />}
      <Map countryCode={countryCode} regionId={regionId} riskFilter={riskFilter} height={height} on={{ ...on, ...Object.fromEntries(LAYERS.filter((l) => !visible.includes(l)).map((l) => [l.id, false])) } as LayerState}
        risk={areas.flatMap((a) => a.risk.data ?? [])} shelters={areas.flatMap((a) => a.shelters.data ?? [])} reports={areas.flatMap((a) => a.reports.data ?? [])}
        hotspots={fires.data?.hotspots} locations={locations} grids={{ weather: weatherQ.data, soil: soilQ.data }} onRaster={onRaster} />
      <Legend layers={visible.filter((l) => on[l.id])} statuses={statuses} vars={{ weather: [wVar, setWVar], soil: [sVar, setSVar] }} />
    </div>
  );
}

function useArea(code: string, codes: string[], regionId: string | undefined, on: LayerState) {
  const inScope = codes.includes(code);
  const region = getCountry(code)?.regions.find((r) => r.id === regionId);
  const area = inScope ? { country: code, region: region?.id, bbox: region?.bbox } : null;
  return {
    code, inScope,
    risk: useRiskMap(on.risk ? area : null),
    shelters: useShelters(on.safe_locations && code === "CD" ? area : null),
    reports: useFireReports(on.reports ? area : null),
  };
}

const tone: Record<LayerStatus["kind"], string> = { off: "text-muted-foreground", loading: "text-muted-foreground", ok: "text-risk-low", partial: "text-risk-medium", empty: "text-muted-foreground", unavailable: "text-unavailable", error: "text-risk-high" };
const sourceOf = (l: LayerDef) => l.datasetIds.map((id) => DATASETS.find((d) => d.id === id)).filter(Boolean).map((d) => `${d!.provider} — ${d!.datasetName}`).join("; ") || l.sourceText || "Source unavailable";

function LayerPanel({ layers, on, statuses, toggle }: { layers: LayerDef[]; on: LayerState; statuses: Record<LayerId, LayerStatus>; toggle: (id: LayerId) => void }) {
  return (
    <div className="mb-2 max-h-[55vh] overflow-y-auto rounded-md border bg-card p-2 sm:max-h-none">
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {layers.map((l) => (
          <li key={l.id}>
            <label className="flex cursor-pointer items-start gap-2 rounded-sm p-2 hover:bg-muted/40">
              <input type="checkbox" role="switch" checked={on[l.id]} onChange={() => toggle(l.id)} className="mt-1 accent-primary" aria-label={l.label} />
              <span className="min-w-0">
                <span className="block text-sm">{l.icon} {l.label}</span>
                <span className={`block text-xs ${tone[statuses[l.id].kind]}`}>{statuses[l.id].text}</span>
                <span className="block truncate text-[11px] text-muted-foreground" title={sourceOf(l)}>Source: {sourceOf(l)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Swatch({ color, shape }: { color: string; shape: string }) {
  const c = `var(${color})`;
  if (shape === "ring") return <span className="h-3 w-3 rounded-full border-2 border-dashed" style={{ borderColor: c }} />;
  if (shape === "square") return <span className="h-2.5 w-2.5" style={{ background: c }} />;
  if (shape === "diamond") return <span className="h-2.5 w-2.5 rotate-45 ring-2 ring-foreground" style={{ background: c }} />;
  return <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />;
}

type VarState = [GridParam, (p: GridParam) => void];
function Ramp({ p }: { p: GridParam }) {
  const sc = GRID_SCALE[p];
  return <span className="flex items-center gap-1 text-muted-foreground">{sc.min}<span className="h-2 w-20 rounded-sm" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => scaleColor(p, sc.min + t * (sc.max - sc.min))).join(",")})` }} />{sc.max} {sc.unit}</span>;
}
function VarPick({ v, opts }: { v: VarState; opts: GridParam[] }) {
  return <select aria-label="Variable" value={v[0]} onChange={(e) => v[1](e.target.value as GridParam)} className="rounded-sm border bg-card px-1 py-0.5">{opts.map((p) => <option key={p} value={p}>{GRID_SCALE[p].label}</option>)}</select>;
}
function Extra({ id, vars }: { id: LayerId; vars: { weather: VarState; soil: VarState } }) {
  if (id === "weather") return <><VarPick v={vars.weather} opts={WEATHER_PARAMS} /><Ramp p={vars.weather[0]} /><span className="text-muted-foreground">Real POWER grid-cell values, not interpolated</span></>;
  if (id === "soil") return <><VarPick v={vars.soil} opts={SOIL_PARAMS} /><Ramp p={vars.soil[0]} /><span className="text-muted-foreground">0 = dry, 1 = saturated</span></>;
  if (id === "landcover") return <>{LC_LEGEND.map(([c, l]) => <span key={l} className="flex items-center gap-1 text-muted-foreground"><span className="h-2.5 w-2.5" style={{ background: c }} />{l}</span>)}</>;
  if (id === "population") return <>{POP_BREAKS.map(([a, b, c]) => <span key={a} className="flex items-center gap-1 text-muted-foreground"><span className="h-2.5 w-2.5" style={{ background: `rgb(${c.join(",")})` }} />{b > 1e6 ? `${a.toLocaleString()}+` : `${a}–${b.toLocaleString()}`} /km²</span>)}<span className="text-muted-foreground">Estimated density, not exact counts</span></>;
  if (id === "terrain") return <span className="text-muted-foreground">Shaded relief (light/dark = terrain shape)</span>;
  return null;
}

function Legend({ layers, statuses, vars }: { layers: LayerDef[]; statuses: Record<LayerId, LayerStatus>; vars: { weather: VarState; soil: VarState } }) {
  if (layers.length === 0) return <p className="mt-2 text-xs text-muted-foreground">All layers are off.</p>;
  return (
    <div className="mt-2 space-y-1 text-xs">
      {layers.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{l.icon} {l.label}</span>
          {["weather", "soil", "landcover", "population", "terrain"].includes(l.id) ? <Extra id={l.id} vars={vars} /> : l.legend.map((e) => <span key={e.label} className="flex items-center gap-1.5 text-muted-foreground"><Swatch color={e.color} shape={e.shape} />{e.label}</span>)}
          <span className={tone[statuses[l.id].kind]}>· {statuses[l.id].text}</span>
        </div>
      ))}
    </div>
  );
}
