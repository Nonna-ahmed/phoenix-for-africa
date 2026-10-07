import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Section } from "@/components/phoenix/ui";
import status from "@/data/pipeline-status.json";

export const Route = createFileRoute("/pipeline")({
  head: () => ({ meta: [
    { title: "Historical Data Pipeline — PHOENIX" },
    { name: "description", content: "Status of the PHOENIX historical training dataset: observation validity, weather latency, land cover, districts and leakage audit for the pilot areas." },
    { property: "og:title", content: "Historical Data Pipeline — PHOENIX" },
    { property: "og:description", content: "Pilot-area data readiness for the future PHOENIX risk model. No model trained." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PipelinePage,
});

const LABELS: Record<string, string> = {
  pipeline_execution: "Pipeline execution", observation_validity: "Observation validity", weather_availability: "Weather availability handling",
  land_cover_temporal: "Land-cover temporal consistency", admin2: "Admin2 (district)", spatial_coverage: "Spatial coverage", leakage_audit: "Leakage audit",
};
const OBS: Record<string, string> = { positive: "Positive", valid_negative_candidate: "Valid-negative candidates", insufficient_observation: "Insufficient observation", missing_observation: "Missing observation" };
const good = (v: string) => ["PASS", "READY", "AVAILABLE"].includes(v);

function PipelinePage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Model data · v2" title="Historical Data Pipeline">Training data for the future PHOENIX model. Target: <b>satellite fire occurrence</b> (NASA FIRMS hotspots), not confirmed wildfires. <b>No model has been trained.</b> Grid: {status.grid}; {status.temporal}. Built {status.generatedAt}.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        {status.windows.map((w) => (
          <Section key={w.window_id} title={`${w.admin1}, ${w.country} — pilot`}>
            <table className="w-full text-sm"><tbody>
              {Object.entries(w.status).map(([k, v]) => (
                <tr key={k} className="border-b border-border/50"><td className="py-1">{LABELS[k] ?? k}</td><td className={`py-1 text-right font-mono ${good(v) ? "" : "text-unavailable"}`}>{v}</td></tr>
              ))}
              <tr className="border-b border-border/50"><td className="py-1">Fire sample (positive square-days)</td><td className="py-1 text-right font-mono">{w.positive_samples.positive_square_days.toLocaleString()}</td></tr>
              <tr><td className="py-1 font-semibold">Overall model readiness</td><td className="py-1 text-right font-mono font-semibold text-unavailable">{w.readiness.toUpperCase()}</td></tr>
            </tbody></table>
            <h4 className="mt-4 text-xs font-semibold uppercase text-muted-foreground">Observation validity</h4>
            <ul className="text-sm">{Object.entries(w.observation_validity).map(([k, v]) => <li key={k}>{OBS[k]}: {v.square_days.toLocaleString()} ({v.pct}%)</li>)}</ul>
            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Fire sample</h4>
            <p className="text-sm">Raw detections {w.positive_samples.raw_detections.toLocaleString()} · qualifying {w.positive_samples.qualifying_detections_in_window.toLocaleString()} · fire dates {w.positive_samples.positive_dates} · fire cells {w.positive_samples.positive_grid_cells}</p>
            <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Missing values</h4>
            <p className="text-sm">{Object.entries(w.missingness_pct).map(([k, v]) => `${k} ${v}%`).join(" · ")}</p>
            <p className="mt-2 text-sm">Districts: {w.admin2_units.join(", ")} · Leakage audit: {w.leakage.rows_checked} rows, {w.leakage.mismatches} mismatches</p>
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{w.warnings.map((x) => <li key={x}>{x}</li>)}</ul>
          </Section>
        ))}
      </div>
      <Section title="Rules used">
        <ul className="list-disc space-y-1 pl-5 text-sm">{Object.values(status.rules).map((r) => <li key={r}>{r}</li>)}</ul>
      </Section>
      <Section title="Still blocking training">
        <ul className="list-disc space-y-1 pl-5 text-sm">{status.remaining.map((b) => <li key={b}>{b}</li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground">Time-based split: train {status.split.default.train.join(" → ")}, validation {status.split.default.validation.join(" → ")}, test {status.split.default.test.join(" → ")}. No random split.</p>
      </Section>
    </div>
  );
}
