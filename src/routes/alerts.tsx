import { createFileRoute } from "@tanstack/react-router";
import { ALERTS } from "@/data/registry";
import { AlertCard, PageHeader } from "@/components/phoenix/ui";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [
    { title: "Alerts — PHOENIX" }, { name: "description", content: "Wildfire risk alerts and satellite fire detection alerts across Africa." },
    { property: "og:title", content: "Alerts — PHOENIX" }, { property: "og:description", content: "Wildfire alerts across Africa." },
  ] }),
  component: () => {
    const risk = ALERTS.filter((a) => a.kind === "risk");
    const det = ALERTS.filter((a) => a.kind === "detection");
    return (
      <div>
        <PageHeader eyebrow="Africa → Country → Region" title="Alerts">Risk alerts (model-based) and detection alerts (satellite) are kept separate.</PageHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <div><h2 className="mb-2 font-mono text-sm text-risk-high">▲ Predicted risk alerts</h2><div className="space-y-2">{risk.map((a) => <AlertCard key={a.id} a={a} />)}</div></div>
          <div><h2 className="mb-2 font-mono text-sm text-fire">◉ Satellite detection alerts</h2><div className="space-y-2">{det.map((a) => <AlertCard key={a.id} a={a} />)}</div></div>
        </div>
      </div>
    );
  },
});
