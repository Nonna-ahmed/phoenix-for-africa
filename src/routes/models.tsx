import { createFileRoute } from "@tanstack/react-router";
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

function Models() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Transparency" title="Models & Data">Model performance varies by geographic region. A model validated for one region should not automatically be interpreted as validated for another region.</PageHeader>
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
