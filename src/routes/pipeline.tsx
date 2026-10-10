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
      <Section title="v4 satellite observation — confirmed fire vs confirmed no-fire (six pilot areas)">
        <p className="mb-3 text-sm text-muted-foreground">A day without a hotspot only counts as "no fire" when NASA's daily VIIRS fire mask (VNP14A1) shows the whole 1 km square clearly observed. No model trained. {status.v4.readiness_rule}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th className="py-1">Country / region</th><th className="text-right">Fire</th><th className="text-right">Confirmed no-fire</th><th className="text-right">Not enough view</th><th className="text-right">Missing</th><th>Checks</th><th>Readiness</th></tr></thead>
          <tbody>{status.v4.countries.map((c) => (
            <tr key={c.country} className="border-t border-border/50">
              <td className="py-1">{c.country}<div className="text-xs text-muted-foreground">{c.admin1} · {c.seasonal_bias_flag}</div></td>
              <td className="text-right font-mono">{c.FIRE_DETECTED.toLocaleString()}</td><td className="text-right font-mono">{c.NO_FIRE_CONFIRMED.toLocaleString()} ({c.pct_no_fire_confirmed}%)</td>
              <td className="text-right font-mono">{c.INSUFFICIENT_OBSERVATION.toLocaleString()}</td><td className="text-right font-mono">{c.MISSING.toLocaleString()}</td>
              <td>{c.leakage_ok && c.consistency_ok ? "PASS" : "FAIL"}</td><td>{c.readiness}</td>
            </tr>))}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-muted-foreground">Combined: {status.v4.combined.rows.toLocaleString()} square-days · fire {status.v4.combined.FIRE_DETECTED.toLocaleString()} · confirmed no-fire {status.v4.combined.NO_FIRE_CONFIRMED.toLocaleString()} · fire rate among observed {(status.v4.combined.positive_rate_among_observable * 100).toFixed(3)}%. Confirmed no-fire days come mostly from the dry season.</p>
      </Section>
      <Section title="v3 Africa expansion — country assessment (pilot areas, 30 × 30 km each)">
        <p className="mb-3 text-sm text-muted-foreground">Historical training data availability only. "Live app" shows whether PHOENIX's live map modules cover the country — a separate question. No country has confirmed "no fire" days yet. {status.v3.density_rule}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th className="py-1">Country / region</th><th>Zone</th><th className="text-right">Raw hotspots</th><th className="text-right">Fire square-days</th><th className="text-right">Fire dates</th><th className="text-right">Fire cells</th><th className="text-right">NDVI</th><th className="text-right">Districts</th><th>Leakage</th><th>Density</th><th>Live app</th></tr></thead>
          <tbody>{status.v3.countries.map((c) => (
            <tr key={c.country} className="border-t border-border/50">
              <td className="py-1">{c.country}<div className="text-xs text-muted-foreground">{c.admin1} · {c.setting}</div></td><td className="text-xs">{c.zone}</td>
              <td className="text-right font-mono">{c.firms_raw_detections.toLocaleString()}</td><td className="text-right font-mono">{c.positive_square_days.toLocaleString()}</td>
              <td className="text-right font-mono">{c.distinct_fire_dates}</td><td className="text-right font-mono">{c.grid_cells_ever_detected}</td>
              <td className="text-right font-mono">{c.ndvi_pct}%</td><td className="text-right font-mono">{c.admin2_pct}%</td>
              <td>{c.leakage_ok ? "PASS" : "FAIL"}</td><td className={c.event_density === "Sufficient" ? "" : "text-unavailable"}>{c.event_density}</td>
              <td className="text-xs">{c.live_app_modules.startsWith("connected") ? "Connected" : "Not connected"}</td>
            </tr>))}</tbody>
        </table></div>
        <p className="mt-3 text-sm"><b>Suggested for the first combined dataset:</b> {status.v3.recommended.join(", ")}. <b>Use with caution:</b> {status.v3.caution.join(", ")}.</p>
        <p className="mt-1 text-xs text-muted-foreground">Overall readiness for every country: NOT MODEL-READY — {status.v3.limitation}</p>
      </Section>
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
