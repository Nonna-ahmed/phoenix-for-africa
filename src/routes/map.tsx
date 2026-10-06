import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { COUNTRIES } from "@/data/registry";
import { RiskMap, MapLegend } from "@/components/phoenix/RiskMap";
import { PageHeader } from "@/components/phoenix/ui";
import type { Layers } from "@/components/phoenix/RiskMapInner";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [
    { title: "Africa Risk Map — PHOENIX" }, { name: "description", content: "Interactive map of predicted wildfire risk, satellite fire detections, shelters and reports across Africa." },
    { property: "og:title", content: "Africa Risk Map — PHOENIX" }, { property: "og:description", content: "Interactive Africa wildfire risk map." },
  ] }),
  component: MapPage,
});

const sel = "rounded-sm border bg-card px-2 py-1.5 text-sm";

function MapPage() {
  const [country, setCountry] = useState("");
  const [risk, setRisk] = useState("ALL");
  const [time, setTime] = useState("current");
  const [layers, setLayers] = useState<Layers>({ risk: true, fires: true, shelters: true, reports: true, boundaries: true });
  const toggle = (k: keyof Layers) => setLayers({ ...layers, [k]: !layers[k] });
  return (
    <div>
      <PageHeader eyebrow="Geospatial" title="Africa Risk Map">Predicted risk and satellite detections are separate layers — never merged into one metric.</PageHeader>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="label-mono flex flex-col gap-1">Country
          <select className={sel} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All Africa</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}{c.coverage !== "active" ? " (coming soon)" : ""}</option>)}
          </select></label>
        <label className="label-mono flex flex-col gap-1">Risk
          <select className={sel} value={risk} onChange={(e) => setRisk(e.target.value)}>{["ALL", "HIGH", "MEDIUM", "LOW"].map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="label-mono flex flex-col gap-1">Time
          <select className={sel} value={time} onChange={(e) => setTime(e.target.value)}>
            <option value="current">Last 24 hours</option><option value="48h">48 hours</option><option value="7d">5 days (max)</option>
          </select></label>
        <div className="flex flex-wrap gap-2">
          {([["risk", "Predicted Risk"], ["fires", "Satellite Hotspots"], ["shelters", "Shelters"], ["reports", "Fire Reports"], ["boundaries", "Boundaries"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => toggle(k)} className={`rounded-sm border px-2.5 py-1.5 text-sm ${layers[k] ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Time window applies to satellite hotspots (NASA FIRMS near-real-time). Predicted risk shows the latest model run.</p>
      <RiskMap countryCode={country || undefined} layers={layers} riskFilter={risk} height={620} days={time === "7d" ? 5 : time === "48h" ? 2 : 1} />
      <MapLegend />
    </div>
  );
}
