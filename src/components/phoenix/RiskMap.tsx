import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import type { MapProps, SitePoint } from "./RiskMapInner";
import { getCountry, COUNTRIES, scopeBbox } from "@/data/registry";
import { getAvailability } from "@/data/sources";
import { DATASETS } from "@/data/datasets";
import { CONNECTED, useSafeLocations, useFireReports, useHotspots, useRiskMap, useShelters } from "@/services/api/hooks";
import { apiBaseUrl } from "@/services/api/client";
import { getSiteContext } from "@/lib/site.functions";
import { getPowerDaily } from "@/lib/power.functions";
import { LAYERS, defaultLayerState, type LayerDef, type LayerId, type LayerState, type LayerStatus } from "./layers";

const Inner = lazy(() => import("./RiskMapInner"));

function Map(props: MapProps) {
  const fallback = <div style={{ height: props.height ?? 520 }} className="animate-pulse rounded-md border bg-muted" />;
  return <ClientOnly fallback={fallback}><Suspense fallback={fallback}><Inner {...props} /></Suspense></ClientOnly>;
}

type Q = { isLoading: boolean; isFetching?: boolean; isError: boolean };
const st = (kind: LayerStatus["kind"], text: string): LayerStatus => ({ kind, text });
const SITE_LAYERS: LayerId[] = ["soil", "landcover", "terrain", "population"];

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

  // Point-sampled context layers at region reference points in scope
  const pts = COUNTRIES.filter((c) => !countryCode || c.code === countryCode)
    .flatMap((c) => c.regions.filter((r) => !regionId || r.id === regionId).map((r) => ({ label: `${r.name}, ${c.name}`, lat: r.center[0], lon: r.center[1] })));
  const siteOn = SITE_LAYERS.some((id) => on[id]);
  const siteQ = useQueries({ queries: pts.map((p) => ({ queryKey: ["site", [p.lat, p.lon]], enabled: siteOn, staleTime: 12 * 3600_000, retry: 1, queryFn: () => getSiteContext({ data: { lat: p.lat, lon: p.lon } }) })) });
  const powQ = useQueries({ queries: pts.map((p) => ({ queryKey: ["power", [p.lat, p.lon], 14], enabled: on.weather, staleTime: 3 * 3600_000, retry: 1, queryFn: () => getPowerDaily({ data: { lat: p.lat, lon: p.lon, days: 14 } }) })) });
  const sitePoints: SitePoint[] = pts.map((p, i) => ({ ...p, site: siteQ[i]?.data, power: powQ[i]?.data }));

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
  const pointStatus = (qs: Q[], ok: (i: number) => boolean, noun: string): LayerStatus => {
    if (pts.length === 0) return st("unavailable", "No reference points for this area");
    if (qs.some((q) => q.isLoading)) return st("loading", "Loading…");
    const good = pts.filter((_, i) => ok(i)).length;
    if (good === 0) return st("error", "Data temporarily unavailable");
    return good < pts.length ? st("partial", `${good} of ${pts.length} ${noun}`) : st("ok", `${good} ${noun}`);
  };
  const siteOk = (k: "landCover" | "terrain" | "population" | "drought") => (i: number) => siteQ[i]?.data?.[k].status === "ok";
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
      case "weather": return pointStatus(powQ, (i) => !!powQ[i]?.data?.latest, "region points");
      case "soil": return pointStatus(siteQ, siteOk("drought"), "region points");
      case "landcover": return pointStatus(siteQ, siteOk("landCover"), "region points");
      case "terrain": return pointStatus(siteQ, siteOk("terrain"), "region points");
      case "population": return pointStatus(siteQ, siteOk("population"), "region points");
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
        hotspots={fires.data?.hotspots} locations={locations} sitePoints={sitePoints} />
      <Legend layers={visible.filter((l) => on[l.id])} statuses={statuses} />
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

function Legend({ layers, statuses }: { layers: LayerDef[]; statuses: Record<LayerId, LayerStatus> }) {
  if (layers.length === 0) return <p className="mt-2 text-xs text-muted-foreground">All layers are off.</p>;
  return (
    <div className="mt-2 space-y-1 text-xs">
      {layers.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{l.icon} {l.label}</span>
          {l.legend.map((e) => <span key={e.label} className="flex items-center gap-1.5 text-muted-foreground"><Swatch color={e.color} shape={e.shape} />{e.label}</span>)}
          <span className={tone[statuses[l.id].kind]}>· {statuses[l.id].text}</span>
        </div>
      ))}
    </div>
  );
}
