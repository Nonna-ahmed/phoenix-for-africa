import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DATASETS } from "@/data/datasets";
import { probeSources } from "@/lib/site.functions";
import { PageHeader, Section } from "@/components/phoenix/ui";

export const Route = createFileRoute("/data-sources")({
  head: () => ({ meta: [
    { title: "Data Sources — PHOENIX" },
    { name: "description", content: "Every dataset behind PHOENIX wildfire early warning across Africa, with live availability status." },
    { property: "og:title", content: "Data Sources — PHOENIX" },
    { property: "og:description", content: "Fire, weather, land cover, terrain, population and shelter sources with live status." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: DataSources,
});

function DataSources() {
  const q = useQuery({ queryKey: ["probe"], queryFn: () => probeSources(), staleTime: 10 * 60_000, retry: false });
  const probe = new Map((q.data ?? []).map((p) => [p.id, p]));
  const status = (d: (typeof DATASETS)[number]) => {
    if (d.state === "planned") return <span className="text-muted-foreground">Not connected</span>;
    if (d.state === "backend") return <span className="text-muted-foreground">Waiting for backend</span>;
    if (q.isLoading) return <span className="text-muted-foreground">Checking…</span>;
    const p = d.probe ? probe.get(d.probe) : undefined;
    if (!p) return <span className="text-unavailable">Unavailable</span>;
    return p.ok
      ? <span className="text-risk-low">Available · {new Date(p.checkedAt).toLocaleTimeString()}</span>
      : <span className="text-risk-high">{p.message ?? "Data temporarily unavailable"}</span>;
  };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Transparency" title="Data Sources">
        A source is shown as Available only after PHOENIX has just retrieved usable data from it. Satellite fire detections, burned area and AI risk predictions are separate products and are never mixed.
      </PageHeader>
      {[1, 2, 3].map((ph) => (
        <Section key={ph} title={`Phase ${ph}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="label-mono text-left">{["Category", "Dataset", "Provider", "Coverage", "Resolution", "Updates", "License", "Status"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
              <tbody>{DATASETS.filter((d) => d.phase === ph).map((d) => (
                <tr key={d.id} className="border-t align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{d.category}</td>
                  <td className="py-2 pr-3">{d.sourceUrl ? <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="text-primary">{d.datasetName}</a> : d.datasetName}{d.note && <div className="text-xs text-muted-foreground">{d.note}</div>}</td>
                  <td className="py-2 pr-3">{d.provider}</td><td className="py-2 pr-3">{d.coverage}</td>
                  <td className="py-2 pr-3">{d.spatialResolution} · {d.temporalResolution}</td><td className="py-2 pr-3">{d.updateFrequency}</td>
                  <td className="py-2 pr-3">{d.license}</td><td className="py-2 pr-3 whitespace-nowrap">{status(d)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Section>
      ))}
    </div>
  );
}
