import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COUNTRIES } from "@/data/registry";
import { PageHeader, Section } from "@/components/phoenix/ui";
import { Note } from "@/components/phoenix/ApiState";
import { RiskMap } from "@/components/phoenix/RiskMap";
import { getPowerGrid, type GridParam, type GridResult } from "@/lib/grid.functions";
import { getAreaSample } from "@/lib/site.functions";
import { GRID_SCALE } from "@/data/rasters";
import type { PlanInputT } from "@/lib/brief.server";

export const Route = createFileRoute("/plan")({
  head: () => ({ meta: [
    { title: "AI Preparedness Planner — PHOENIX" },
    { name: "description", content: "Select a map area, ask a wildfire preparedness question and get AI insights grounded in weather, soil moisture, population, land cover and terrain data." },
    { property: "og:title", content: "AI Preparedness Planner — PHOENIX" },
    { property: "og:description", content: "Source-grounded wildfire preparedness insights for emergency planners in Africa." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PlanPage,
});

type BBox = [number, number, number, number];
const VARS: GridParam[] = ["T2M_MAX", "RH2M", "WS2M", "PRECTOTCORR", "GWETROOT"];
const EXAMPLES = ["Where should we pre-position firefighting resources this week?", "Which parts of this area combine dry conditions with many people?", "What should we check before the dry season peaks here?"];
const sel = "rounded-sm border bg-card px-2 py-1.5 text-sm";

function gridStat(g: GridResult | undefined) {
  if (!g || g.status !== "ok") return null;
  const v = g.cells.map((c) => c.value).filter((x): x is number => x !== null);
  const sc = GRID_SCALE[g.param]; const r = (n: number) => Math.round(n * 100) / 100;
  return { label: sc.label, unit: sc.unit, min: v.length ? r(Math.min(...v)) : null, mean: v.length ? r(v.reduce((a, b) => a + b, 0) / v.length) : null, max: v.length ? r(Math.max(...v)) : null, cells: g.cells.length, cellsWithValues: v.length, date: g.date };
}
const km2 = ([w, s, e, n]: BBox) => Math.round(Math.abs(e - w) * 111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180) * Math.abs(n - s) * 110.57);

function PlanPage() {
  const withRegions = COUNTRIES.filter((c) => c.regions.length > 0);
  const [country, setCountry] = useState(withRegions[0]?.code ?? "");
  const [region, setRegion] = useState(withRegions[0]?.regions[0]?.id ?? "");
  const [view, setView] = useState<BBox | null>(null);
  const [area, setArea] = useState<BBox | null>(null);
  const [question, setQuestion] = useState("");

  const grids = VARS.map((p) => useQuery({ enabled: !!area, queryKey: ["grid", area, p], staleTime: 6 * 3600_000, retry: 1, queryFn: () => getPowerGrid({ data: { bbox: area!, param: p } }) }));
  const sample = useQuery({ enabled: !!area, queryKey: ["area-sample", area], staleTime: 6 * 3600_000, retry: 1, queryFn: () => getAreaSample({ data: { bbox: area! } }) });
  const loading = !!area && (grids.some((g) => g.isLoading) || sample.isLoading);

  const [text, setText] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const build = (): PlanInputT => {
    const s = sample.data;
    const c = COUNTRIES.find((x) => x.code === country); const r = c?.regions.find((x) => x.id === region);
    return {
      question: question.trim(),
      area: { label: `Planner-selected map area (near ${r?.name ?? "?"}, ${c?.name ?? country})`, bbox: [...area!], areaKm2: km2(area!) },
      weather: grids.map((g) => gridStat(g.data)),
      samples: s ? { points: s.points.length, pointValues: s.points, landCoverCounts: s.landCoverCounts, elevationM: s.elevation, densityPerKm2: s.density, retrievedAt: s.retrievedAt } : null,
      sources: [
        ...grids.map((g, i) => ({ name: GRID_SCALE[VARS[i]!].label, provider: "NASA POWER", status: g.data?.status ?? "unavailable", latestDate: g.data?.status === "ok" ? g.data.date : null, latency: "published a few days late; not real-time" })),
        { name: "Land cover (9 sample points)", provider: s?.sources.landCover ?? "Esri / Impact Observatory", status: s && Object.keys(s.landCoverCounts).some((k) => k !== "Unavailable") ? "ok" : "unavailable", latestDate: null, latency: "yearly" },
        { name: "Elevation (9 sample points)", provider: s?.sources.terrain ?? "NASA SRTM", status: s?.elevation.min != null ? "ok" : "unavailable", latestDate: "2000", latency: "static" },
        { name: "Population density (9 sample points)", provider: s?.sources.population ?? "WorldPop", status: s?.density.mean != null ? "ok" : "unavailable", latestDate: "2020", latency: "yearly model estimate" },
        { name: "PHOENIX AI wildfire risk", provider: "PHOENIX backend", status: "unavailable", latestDate: null, latency: "backend not connected" },
      ],
    };
  };

  const ask = async () => {
    abort.current?.abort(); const ac = new AbortController(); abort.current = ac;
    setText(""); setErr(null); setBusy(true);
    try {
      const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(build()), signal: ac.signal });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? "The AI answer could not be generated."); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        acc += dec.decode(value, { stream: true });
        const m = acc.match(/\[\[PHOENIX_ERROR:(.*)\]\]/);
        if (m) { setErr(m[1] ?? "Error"); acc = acc.replace(m[0], ""); }
        setText(acc);
      }
      if (!acc.trim()) setErr((e) => e ?? "The AI returned an empty answer. Please try again.");
    } catch (e) { if ((e as Error).name !== "AbortError") setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const tooBig = view ? km2(view) > 400_000 : false;
  const status = (label: string, q: { isLoading: boolean }, okText: string | null) => (
    <li key={label} className="flex justify-between gap-3"><span>{label}</span><span className={q.isLoading ? "text-muted-foreground" : okText ? "text-risk-low" : "text-unavailable"}>{q.isLoading ? "Loading…" : okText ?? "Unavailable"}</span></li>
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Preparedness" title="AI Preparedness Planner">Move the map to the area you're planning for, press “Use this map area”, then ask a question. Lovable AI answers using only the weather, soil moisture, population, land-cover and terrain data PHOENIX retrieves for that area. This is decision support, not a wildfire-risk prediction.</PageHeader>
      <div className="flex flex-wrap items-end gap-3">
        <label className="label-mono flex flex-col gap-1">Jump to country
          <select className={sel} value={country} onChange={(e) => { setCountry(e.target.value); setRegion(COUNTRIES.find((c) => c.code === e.target.value)?.regions[0]?.id ?? ""); }}>
            {withRegions.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select></label>
        <label className="label-mono flex flex-col gap-1">Region
          <select className={sel} value={region} onChange={(e) => setRegion(e.target.value)}>
            {(COUNTRIES.find((c) => c.code === country)?.regions ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>
        <button onClick={() => { if (view) { setArea(view); setText(""); setErr(null); } }} disabled={!view || tooBig} className="rounded-sm border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">Use this map area</button>
        {tooBig && <span className="text-xs text-unavailable">Zoom in — area too large (max ≈400,000 km²).</span>}
      </div>
      <RiskMap countryCode={country} regionId={region} height={380} show={["weather", "soil", "landcover", "terrain", "population"]} initialLayers={{ fires: false, risk: false }} onBounds={setView} />
      {area && <p className="label-mono text-xs text-muted-foreground">Selected area: W {area[0]}°, S {area[1]}°, E {area[2]}°, N {area[3]}° · ≈{km2(area).toLocaleString()} km²</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Data for this area">
          {!area ? <p className="text-sm text-muted-foreground">No area selected yet.</p> : (
            <ul className="space-y-1.5 text-sm">
              {grids.map((g, i) => status(`NASA POWER ${GRID_SCALE[VARS[i]!].label}`, g, g.data?.status === "ok" ? `${g.data.cells.length} cells · ${g.data.date}` : g.data?.status === "limited" ? null : null))}
              {status("Land cover, elevation, population", sample, sample.data ? `${sample.data.points.length} sample points` : null)}
              <li className="flex justify-between gap-3"><span>PHOENIX AI risk</span><span className="text-unavailable">Backend not connected</span></li>
            </ul>)}
          <p className="mt-3 text-xs text-muted-foreground">Weather and soil moisture cover the area in NASA grid cells (most recent published day, a few days old). Land cover, elevation and population are read at 9 evenly spaced points. Nothing is filled in between.</p>
        </Section>
        <div className="space-y-4 lg:col-span-2">
          <Section title="Your planning question">
            <textarea value={question} onChange={(e) => setQuestion(e.target.value.slice(0, 600))} rows={3} placeholder="e.g. Where should we pre-position resources?" className="w-full rounded-sm border bg-card p-2 text-sm" />
            <div className="mt-2 flex flex-wrap gap-2">{EXAMPLES.map((q) => <button key={q} onClick={() => setQuestion(q)} className="rounded-sm border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">{q}</button>)}</div>
            <div className="mt-3 flex gap-2">
              <button onClick={ask} disabled={!area || loading || busy || question.trim().length < 3} className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? "Thinking…" : loading ? "Gathering data…" : !area ? "Select an area first" : "Get insights"}
              </button>
              {busy && <button onClick={() => abort.current?.abort()} className="rounded-sm border px-3 py-2 text-sm">Stop</button>}
            </div>
          </Section>
          <Section title="Preparedness insights">
            {err && <Note tone="error">{err}</Note>}
            {!text && !err && <p className="text-sm text-muted-foreground">{busy ? "Thinking…" : "No answer yet."}</p>}
            {text && <article className="prose prose-sm prose-invert max-w-none [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></article>}
            {text && !busy && <p className="mt-4 border-t pt-2 text-xs text-muted-foreground">AI-generated decision support from PHOENIX data, {new Date().toUTCString()}. Not a wildfire-risk prediction; population values are estimates. Requires field verification.</p>}
          </Section>
        </div>
      </div>
    </div>
  );
}
