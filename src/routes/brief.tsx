import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COUNTRIES, scopeBbox } from "@/data/registry";
import { PageHeader, Section } from "@/components/phoenix/ui";
import { Note } from "@/components/phoenix/ApiState";
import { useHotspots } from "@/services/api/hooks";
import { getAreaSample } from "@/lib/site.functions";
import { getVegetation } from "@/lib/vegetation.functions";
import { getPowerGrid, type GridParam, type GridResult } from "@/lib/grid.functions";
import { getOsmHospitals, getOsmRoads } from "@/lib/osm.functions";
import { GRID_SCALE } from "@/data/rasters";
import type { BriefInputT } from "@/lib/brief.server";

export const Route = createFileRoute("/brief")({
  head: () => ({ meta: [
    { title: "AI Response Brief — PHOENIX" },
    { name: "description", content: "Generate an AI-powered wildfire response brief for a region from satellite hotspots, weather, population and terrain data." },
    { property: "og:title", content: "AI Response Brief — PHOENIX" },
    { property: "og:description", content: "Actionable wildfire response briefs for emergency coordinators." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: BriefPage,
});

const sel = "rounded-sm border bg-card px-2 py-1.5 text-sm";
const WVARS: GridParam[] = ["T2M_MAX", "RH2M", "WS2M", "PRECTOTCORR"];
const RANGES = [[1, "Last 24 hours"], [2, "Last 48 hours"], [5, "Last 5 days (max)"]] as const;
const regionsOf = (code: string) => COUNTRIES.find((c) => c.code === code)?.regions ?? [];

function gridStat(g: GridResult | undefined) {
  if (!g || g.status !== "ok") return null;
  const v = g.cells.map((c) => c.value).filter((x): x is number => x !== null);
  const sc = GRID_SCALE[g.param];
  const r = (n: number) => Math.round(n * 100) / 100;
  return { label: sc.label, unit: sc.unit, min: v.length ? r(Math.min(...v)) : null, mean: v.length ? r(v.reduce((a, b) => a + b, 0) / v.length) : null, max: v.length ? r(Math.max(...v)) : null, cells: g.cells.length, cellsWithValues: v.length, date: g.date };
}

function BriefPage() {
  const withRegions = COUNTRIES.filter((c) => c.regions.length > 0);
  const [country, setCountry] = useState(withRegions[0]?.code ?? "");
  const [region, setRegion] = useState(regionsOf(withRegions[0]?.code ?? "")[0]?.id ?? "");
  const [days, setDays] = useState<number>(1);
  const c = COUNTRIES.find((x) => x.code === country);
  const r = c?.regions.find((x) => x.id === region);
  const bbox = scopeBbox(country, region || undefined);

  const fires = useHotspots(bbox, days);
  const grids = WVARS.map((p) => useQuery({ queryKey: ["grid", bbox, p], staleTime: 6 * 3600_000, retry: 1, queryFn: () => getPowerGrid({ data: { bbox, param: p } }) }));
  const soilQ = useQuery({ queryKey: ["grid", bbox, "GWETROOT"], staleTime: 6 * 3600_000, retry: 1, queryFn: () => getPowerGrid({ data: { bbox, param: "GWETROOT" } }) });
  const veg = useQuery({ queryKey: ["ndvi", bbox], staleTime: 24 * 3600_000, retry: 1, queryFn: () => getVegetation({ data: { bbox: [...bbox] as [number, number, number, number] } }) });
  const site = useQuery({ queryKey: ["area-sample", bbox, 5], staleTime: 6 * 3600_000, retry: 1, queryFn: () => getAreaSample({ data: { bbox: [...bbox] as [number, number, number, number], n: 5 } }) });
  const hosp = useQuery({ queryKey: ["osm-h", bbox], staleTime: 6 * 3600_000, retry: 1, queryFn: () => getOsmHospitals({ data: { bbox } }) });
  const roads = useQuery({ queryKey: ["osm-r", bbox], staleTime: 6 * 3600_000, retry: 1, queryFn: () => getOsmRoads({ data: { bbox } }) });
  const loading = fires.isLoading || grids.some((g) => g.isLoading) || site.isLoading || soilQ.isLoading || veg.isLoading || hosp.isLoading || roads.isLoading;

  const [text, setText] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const build = (): BriefInputT => {
    const f = fires.data; const hs = f?.status === "ok" ? f.hotspots : [];
    const count = (k: (h: (typeof hs)[number]) => string) => hs.reduce<Record<string, number>>((m, h) => ((m[k(h)] = (m[k(h)] ?? 0) + 1), m), {});
    const s = site.data;
        return {
      area: { country: c?.name ?? country, region: r?.name ?? null, bbox: [...bbox] },
      timeRange: { days, label: RANGES.find(([d]) => d === days)?.[1] ?? `${days} days` },
      hotspots: {
        status: f?.status ?? "unavailable", total: f?.total ?? 0, shown: hs.length,
        byConfidence: count((h) => h.confidence ?? "unknown"), byDay: count((h) => h.acqDate),
        strongest: [...hs].sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0)).slice(0, 12).map((h) => ({ lat: h.lat, lon: h.lon, frp: h.frp, date: `${h.acqDate} ${h.acqTime}`, confidence: h.confidence, instrument: h.instrument })),
      },
      weather: grids.map((g) => gridStat(g.data)),
      clusters: Object.values(hs.reduce<Record<string, { cellLat: number; cellLon: number; count: number; maxFrp: number | null }>>((m, h) => {
        const la = Math.floor(h.lat * 4) / 4 + 0.125, lo = Math.floor(h.lon * 4) / 4 + 0.125, k = `${la},${lo}`;
        const c = (m[k] ??= { cellLat: la, cellLon: lo, count: 0, maxFrp: null }); c.count++; if (h.frp !== null && (c.maxFrp === null || h.frp > c.maxFrp)) c.maxFrp = h.frp; return m;
      }, {})).sort((a, b) => b.count - a.count).slice(0, 6),
      soilMoisture: gridStat(soilQ.data),
      vegetation: veg.data?.status === "ok" && veg.data.summary.valid > 0 ? { source: veg.data.source, compositeStart: veg.data.compositeDate, compositeDays: 16, resolutionM: 250, method: veg.data.method, validPixels: veg.data.summary.valid, excludedPixels: veg.data.summary.invalid, coveragePct: veg.data.summary.coveragePct, qaCounts: veg.data.summary.qaCounts, min: veg.data.summary.min, max: veg.data.summary.max, mean: veg.data.summary.mean, median: veg.data.summary.median } : null,
      spatialSample: s ? {
        method: `Regular ${Math.round(Math.sqrt(s.points.length))}×${Math.round(Math.sqrt(s.points.length))} grid of sample points across the region bounding box (no interpolation)`,
        points: s.points.length,
        pointsWithData: { landCover: s.points.filter((p) => p.landCover).length, elevation: s.points.filter((p) => p.elevationM !== null).length, density: s.points.filter((p) => p.densityPerKm2 !== null).length },
        landCoverShare: Object.fromEntries(Object.entries(s.landCoverCounts).map(([k, v]) => [k, Math.round((v / s.points.length) * 100)])),
        elevationM: s.elevation, densityPerKm2: s.density,
        highDensityPoints: s.points.filter((p): p is typeof p & { densityPerKm2: number } => p.densityPerKm2 !== null).sort((a, b) => b.densityPerKm2 - a.densityPerKm2).slice(0, 5).map((p) => ({ lat: p.lat, lon: p.lon, densityPerKm2: p.densityPerKm2 })),
        slope: "Data unavailable (slope is not aggregated across the region)", retrievedAt: s.retrievedAt,
      } : null,
      infrastructure: { hospitals: hosp.data?.status === "ok" ? hosp.data.total : null, roadSegments: roads.data?.status === "ok" ? roads.data.total : null },
      aiRisk: "PHOENIX AI risk prediction not available (backend not connected).",
      sources: [
        { name: "Satellite fire detections", provider: "NASA FIRMS", status: f?.status ?? "unavailable", latestDate: hs.length ? hs.map((h) => h.acqDate).sort().at(-1)! : null, latency: "near real-time (~3 h)" },
        ...grids.map((g, i) => ({ name: `Weather: ${GRID_SCALE[WVARS[i]!].label}`, provider: "NASA POWER", status: g.data?.status ?? "unavailable", latestDate: g.data?.status === "ok" ? g.data.date : null, latency: "published a few days late; not real-time" })),
        { name: "Population density (sampled grid)", provider: "WorldPop 1 km", status: s?.density.mean != null ? "ok" : "unavailable", latestDate: "2020", latency: "yearly model estimate" },
        { name: "Elevation (sampled grid)", provider: "NASA SRTM 30 m", status: s?.elevation.min != null ? "ok" : "unavailable", latestDate: "2000", latency: "static" },
        { name: "Land cover (sampled grid)", provider: "Esri / Impact Observatory 10 m", status: s && s.points.some((p) => p.landCover) ? "ok" : "unavailable", latestDate: null, latency: "yearly" },
        { name: "Vegetation NDVI (sampled 250 m pixels)", provider: "NASA MODIS/Terra MOD13Q1.061", status: veg.data?.status === "ok" && veg.data.summary.valid > 0 ? "ok" : "unavailable", latestDate: veg.data?.compositeDate ?? null, latency: "16-day composite, published weeks later" },
        { name: "Soil moisture (root zone)", provider: "NASA POWER", status: soilQ.data?.status ?? "unavailable", latestDate: soilQ.data?.status === "ok" ? soilQ.data.date : null, latency: "published a few days late; not a drought index" },
        { name: "Hospitals & clinics", provider: "OpenStreetMap (Esri replica)", status: hosp.data?.status ?? "unavailable", latestDate: null, latency: "community-updated" },
        { name: "Main roads", provider: "OpenStreetMap (Esri replica)", status: roads.data?.status ?? "unavailable", latestDate: null, latency: "community-updated" },
        { name: "Verified emergency shelters", provider: "Official/humanitarian", status: "unavailable", latestDate: null, latency: "no source connected" },
      ],
    };
  };

  const generate = async () => {
    abort.current?.abort(); const ac = new AbortController(); abort.current = ac;
    setText(""); setErr(null); setBusy(true);
    try {
      const res = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(build()), signal: ac.signal });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? "The AI brief could not be generated."); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        acc += dec.decode(value, { stream: true });
        const m = acc.match(/\[\[PHOENIX_ERROR:(.*)\]\]/);
        if (m) { setErr(m[1] ?? "Error"); acc = acc.replace(m[0], ""); }
        setText(acc);
      }
      if (!acc.trim()) setErr((e) => e ?? "The AI returned an empty brief. Please try again.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const row = (label: string, q: { isLoading: boolean; isError: boolean }, okText: string | null) => (
    <li key={label} className="flex justify-between gap-3"><span>{label}</span><span className={q.isLoading ? "text-muted-foreground" : okText ? "text-risk-low" : "text-unavailable"}>{q.isLoading ? "Loading…" : okText ?? "Unavailable"}</span></li>
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Coordination" title="AI Response Brief">Pick a region and time range. PHOENIX gathers the live data below and Lovable AI turns it into a short decision-support brief. This is not a wildfire-risk prediction. Always verify on the ground — hotspots are not confirmed fires.</PageHeader>
      <div className="flex flex-wrap items-end gap-3">
        <label className="label-mono flex flex-col gap-1">Country
          <select className={sel} value={country} onChange={(e) => { setCountry(e.target.value); setRegion(regionsOf(e.target.value)[0]?.id ?? ""); setText(""); }}>
            {withRegions.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select></label>
        <label className="label-mono flex flex-col gap-1">Region
          <select className={sel} value={region} onChange={(e) => { setRegion(e.target.value); setText(""); }}>
            {regionsOf(country).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>
        <label className="label-mono flex flex-col gap-1">Time range
          <select className={sel} value={days} onChange={(e) => { setDays(Number(e.target.value)); setText(""); }}>
            {RANGES.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
          </select></label>
        <button onClick={generate} disabled={loading || busy} className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Writing brief…" : loading ? "Gathering data…" : "Generate brief"}
        </button>
        {busy && <button onClick={() => abort.current?.abort()} className="rounded-sm border px-3 py-2 text-sm">Stop</button>}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Data going into the brief">
          <ul className="space-y-1.5 text-sm">
            {row("NASA FIRMS hotspots", fires, fires.data?.status === "ok" ? `${fires.data.total.toLocaleString()} detections` : null)}
            {grids.map((g, i) => row(`NASA POWER ${GRID_SCALE[WVARS[i]!].label}`, g, g.data?.status === "ok" ? `${g.data.cells.length} cells · ${g.data.date}` : null))}
            {row("NASA POWER Soil moisture", soilQ, soilQ.data?.status === "ok" ? `${soilQ.data.cells.length} cells · ${soilQ.data.date}` : null)}
            {row("NASA MODIS NDVI (sampled)", veg, veg.data?.status === "ok" && veg.data.summary.valid > 0 ? `${veg.data.summary.valid}/${veg.data.summary.total} px · ${veg.data.compositeDate}` : null)}
            {row("WorldPop density (sampled)", site, site.data?.density.mean != null ? `${site.data.points.filter((p) => p.densityPerKm2 !== null).length}/${site.data.points.length} points` : null)}
            {row("SRTM elevation (sampled)", site, site.data?.elevation.min != null ? `${site.data.points.filter((p) => p.elevationM !== null).length}/${site.data.points.length} points` : null)}
            {row("Land cover (sampled)", site, site.data?.points.some((p) => p.landCover) ? `${site.data.points.filter((p) => p.landCover).length}/${site.data.points.length} points` : null)}
            {row("OSM hospitals & clinics", hosp, hosp.data?.status === "ok" ? hosp.data.total.toLocaleString() : null)}
            {row("OSM main roads", roads, roads.data?.status === "ok" ? `${roads.data.total.toLocaleString()} segments` : null)}
            <li className="flex justify-between gap-3"><span>PHOENIX AI risk</span><span className="text-unavailable">Backend not connected</span></li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Only these values are sent to the AI. Anything unavailable is marked as such, never filled in.</p>
        </Section>
        <div className="lg:col-span-2">
          <Section title={r ? `Brief — ${r.name}, ${c?.name}` : "Brief"}>
            {err && <Note tone="error">{err}</Note>}
            {!text && !err && <p className="text-sm text-muted-foreground">{busy ? "Writing brief…" : "No brief yet. Press “Generate brief”."}</p>}
            {text && <article className="prose prose-sm prose-invert max-w-none [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_table]:w-full [&_td]:border-t [&_td]:py-1 [&_td]:pr-3 [&_th]:text-left [&_th]:pr-3"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></article>}
            {text && !busy && <p className="mt-4 border-t pt-2 text-xs text-muted-foreground">AI-generated from live PHOENIX data on {new Date().toUTCString()}. Satellite hotspots are thermal anomalies, not confirmed fires; population values are estimates. Verify before acting.</p>}
          </Section>
        </div>
      </div>
    </div>
  );
}
