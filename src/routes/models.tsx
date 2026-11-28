import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { COUNTRIES, MODELS } from "@/data/registry";
import { defaultAvailability, getAvailability } from "@/data/sources";
import { DataStatusGrid, PageHeader, Section } from "@/components/phoenix/ui";

export const Route = createFileRoute("/models")({
  head: () => ({ meta: [
    { title: "Models & Data — PHOENIX" }, { name: "description", content: "PHOENIX model registry, performance metrics and data coverage by country." },
    { property: "og:title", content: "Models & Data — PHOENIX" }, { property: "og:description", content: "Model transparency and data coverage." },
  ] }),
  component: Models,
});


interface RegionModel {
  selected: string; type: string; uses_weather: boolean; test_year: number; trained_utc?: string | null;
  held_out: { pr_auc?: number; roc_auc?: number; brier?: number; recall_top10pct?: number; pos_rate?: number };
  reason?: string;
  table?: { model: string; kind: string; family?: string; uses_weather?: boolean; pr_auc?: number; roc_auc?: number; brier?: number; recall_top10pct?: number }[];
}
interface ManifestRegion {
  id: string; name: string; country: string; estimates_available: boolean; risk_date?: string | null; reasons?: string[];
  model?: RegionModel | null;
}

/** The per-study-area model test, read from the manifest the build writes (backend/manifest.py). */
function ModelComparison() {
  const q = useQuery({
    queryKey: ["regions-manifest"], staleTime: 10 * 60_000, retry: 1,
    queryFn: async () => {
      const r = await fetch("/data/regions-manifest.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { regions: ManifestRegion[] };
    },
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading the region tests…</p>;
  if (q.isError || !q.data) return <p className="text-sm text-destructive">Region comparison unavailable (no manifest). This is not a sign that risk is low.</p>;
  const rows = q.data.regions;
  const cell = "py-2 pr-3";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Each study area was trained and scored on its own. Five model families and three baselines were fitted on the same 2021-2023 data and scored on 2025, on 1-degree blocks never used for fitting. The model kept is the best one that needs no weather data, because NASA POWER publishes 4-6 days late and a model that needs it cannot always produce today&apos;s risk.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="label-mono text-left">{["Study area", "Country", "Model kept", "Held-out PR-AUC", "ROC-AUC", "Recall top 10%", "Weather", "Risk file"].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => {
          const m = r.model; const h = m?.held_out ?? {};
          return (<tr key={r.id} className="border-t align-top">
            <td className={`${cell} font-medium`}>{r.name}</td>
            <td className={cell}>{r.country}</td>
            <td className={cell}>{m?.type ?? <span className="text-unavailable">No tested model</span>}</td>
            <td className={`${cell} font-mono`}>{h.pr_auc ?? "—"}</td>
            <td className={`${cell} font-mono`}>{h.roc_auc ?? "—"}</td>
            <td className={`${cell} font-mono`}>{h.recall_top10pct ?? "—"}</td>
            <td className={cell}>{m ? (m.uses_weather ? "needed" : "not needed") : "—"}</td>
            <td className={cell}>{r.estimates_available ? (r.risk_date ?? "today") : <span className="text-unavailable">withheld</span>}</td>
          </tr>);
        })}</tbody>
      </table></div>
      <div className="space-y-2">{rows.filter((r) => r.model).map((r) => (
        <details key={r.id} className="rounded-sm border bg-background/40 p-3">
          <summary className="cursor-pointer text-sm font-medium">{r.name}: every model tested</summary>
          <p className="mt-2 text-xs text-muted-foreground">{r.model!.reason}</p>
          <table className="mt-2 w-full text-xs">
            <thead><tr className="label-mono text-left">{["Model", "Kind", "PR-AUC", "ROC-AUC", "Brier"].map((h) => <th key={h} className="py-1 pr-3 font-normal">{h}</th>)}</tr></thead>
            <tbody>{(r.model!.table ?? []).map((t) => (
              <tr key={t.model} className="border-t"><td className="py-1 pr-3">{t.model}{t.model === r.model!.selected ? " (kept)" : ""}</td><td className="pr-3">{t.kind}</td><td className="pr-3 font-mono">{t.pr_auc}</td><td className="pr-3 font-mono">{t.roc_auc}</td><td className="pr-3 font-mono">{t.brier}</td></tr>
            ))}</tbody>
          </table>
        </details>))}</div>
    </div>
  );
}

function Models() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Transparency" title="Models & Data">Model performance varies by geographic region. A model validated for one region should not automatically be interpreted as validated for another region.</PageHeader>
      <Section title="Model comparison by study area">
        <ModelComparison />
      </Section>
      <Section title="Model registry">
        <div className="space-y-4">{MODELS.map((m) => (
          <div key={m.id} className="rounded-sm border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">{m.coverage}</h3><span className={`label-mono ${m.status === "legacy" ? "text-risk-medium" : "text-risk-low"}`}>{m.status === "legacy" ? "legacy — retraining planned" : m.status}</span></div>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="label-mono">Model</dt><dd>{m.type} {m.version}</dd></div>
              <div><dt className="label-mono">Training period</dt><dd>{m.trainingPeriod}</dd></div>
              <div><dt className="label-mono">ROC-AUC</dt><dd className="font-mono">{m.rocAuc ?? "Data unavailable"}</dd></div>
              <div><dt className="label-mono">PR-AUC</dt><dd className="font-mono">{m.prAuc ?? "Data unavailable"}</dd></div>
              <div className="col-span-2"><dt className="label-mono">Input variables</dt><dd className="font-mono text-xs">{m.features.join(", ")}</dd></div>
              <div><dt className="label-mono">Extent (W,S,E,N)</dt><dd className="font-mono text-xs">{m.bbox?.join(", ") ?? "Province set"}</dd></div>
              <div><dt className="label-mono">Last update</dt><dd>{m.lastUpdate}</dd></div>
            </dl>
            {m.notes && <p className="mt-2 text-sm text-muted-foreground">{m.notes}</p>}
            <p className="label-mono mt-2">Test / evaluation metrics — not live prediction confidence</p>
          </div>))}</div>
      </Section>
      <Section title="Data sources by country">
        <p className="mb-3 text-sm text-muted-foreground">Four separate concepts: NASA FIRMS satellite hotspots, PHOENIX AI risk predictions, confirmed wildfires (verified ground reports) and emergency shelters. Only sources actually found and retrieved are listed.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="label-mono text-left">{["Country", "Environment", "Fire detection", "Risk model", "Emergency shelters", "Settlements / facilities"].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>{COUNTRIES.map((c) => { const a = getAvailability(c.code) ?? defaultAvailability(c.code); return (
            <tr key={c.code} className="border-t align-top">
              <td className="py-2 pr-3 font-medium">{c.name}</td>
              <td className="pr-3">{a.environmentSource}</td>
              <td className="pr-3">{a.fireDetectionSource}</td>
              <td className="pr-3">{a.riskModelSource ?? <span className="text-unavailable">Not available</span>}</td>
              <td className="pr-3">{a.shelterSource ?? <span className="text-unavailable">No verified shelter data</span>}</td>
              <td className="pr-3">{a.layers.length ? <ul>{a.layers.map((l) => <li key={l.id}><a href={l.url} target="_blank" rel="noreferrer" className="hover:text-primary">{l.sourceDataset}</a>{l.coverageNote ? <span className="text-xs text-muted-foreground"> — {l.coverageNote}</span> : null}</li>)}</ul> : <span className="text-unavailable">{a.settlementSource ?? "Not available"}</span>}</td>
            </tr>); })}</tbody>
        </table></div>
      </Section>
      <Section title="Data availability by country">
        <div className="divide-y">{COUNTRIES.map((c) => (
          <div key={c.code} className="py-3"><div className="mb-1 font-medium">{c.name}</div><DataStatusGrid status={c.status} /></div>))}</div>
      </Section>
    </div>
  );
}
