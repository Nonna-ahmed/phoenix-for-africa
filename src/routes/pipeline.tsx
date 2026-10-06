import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Section } from "@/components/phoenix/ui";
import status from "@/data/pipeline-status.json";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [
    { title: "Historical Data Pipeline — PHOENIX" },
    { name: "description", content: "Status of the PHOENIX historical training dataset: satellite fire occurrence, weather, soil moisture, NDVI, land cover and terrain on a 1 km daily grid." },
    { property: "og:title", content: "Historical Data Pipeline — PHOENIX" },
    { property: "og:description", content: "Coverage, class balance, leakage checks and blockers for the future PHOENIX risk model." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PipelinePage,
});

function PipelinePage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Model data" title="Historical Data Pipeline">Training data for the future PHOENIX model. Target: <b>satellite fire occurrence</b> (NASA FIRMS hotspots), not confirmed wildfires. No model has been trained on it yet. Grid: {status.grid}; {status.temporal}. Built {status.generatedAt}.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        {status.windows.map((w) => (
          <Section key={w.window_id} title={`${w.admin1}, ${w.country}`}>
            <ul className="space-y-1 text-sm">
              <li>Period: {w.date_range[0]} → {w.date_range[1]}</li>
              <li>Cells: {w.grid_cells.toLocaleString()} · daily rows: {w.daily_rows.toLocaleString()}</li>
              <li>Raw FIRMS detections: {w.raw_firms_detections.toLocaleString()}</li>
              <li>Fire cell-days (target = 1): {w.positive_targets.toLocaleString()} · no-detection cell-days: {w.valid_negative_targets.toLocaleString()}</li>
              <li>Positive rate {(w.positive_rate * 100).toFixed(2)}% · {w.imbalance_ratio_neg_per_pos}:1 imbalance (not corrected)</li>
              <li>Coverage: {Object.entries(w.coverage_pct).map(([k, v]) => `${k.replace("_", " ")} ${v}%`).join(" · ")}</li>
              <li>Leakage checks: {w.leakage_passed ? "passed" : "FAILED"} · duplicates: {w.duplicate_rows}</li>
              <li className="text-unavailable">Model-ready: No — see blockers</li>
            </ul>
          </Section>
        ))}
      </div>
      <Section title="Blockers before training">
        <ul className="list-disc space-y-1 pl-5 text-sm">{status.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground">Time-based split: train {status.split.default.train.join(" → ")}, validation {status.split.default.validation.join(" → ")}, test {status.split.default.test.join(" → ")}. No random split.</p>
      </Section>
    </div>
  );
}
