import { createFileRoute } from "@tanstack/react-router";
import { AlertCard, PageHeader } from "@/components/phoenix/ui";
import { ApiState } from "@/components/phoenix/ApiState";
import { useAlerts } from "@/services/api/hooks";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [
    { title: "Alerts — PHOENIX" }, { name: "description", content: "Wildfire risk alerts and satellite fire detection alerts across Africa." },
    { property: "og:title", content: "Alerts — PHOENIX" }, { property: "og:description", content: "Wildfire alerts across Africa." },
  ] }),
  component: Alerts,
});

function Alerts() {
  const q = useAlerts();
  return (
    <div>
      <PageHeader eyebrow="Africa → Country → Region" title="Alerts">Risk alerts (model-based) and detection alerts (satellite) are kept separate.</PageHeader>
      <ApiState q={q} empty="No active alerts">{(all) => (
        <div className="grid gap-6 md:grid-cols-2">
          <div><h2 className="mb-2 font-mono text-sm text-risk-high">▲ Predicted risk alerts</h2><div className="space-y-2">{all.filter((a) => a.kind === "risk").map((a) => <AlertCard key={a.id} a={a} />)}</div></div>
          <div><h2 className="mb-2 font-mono text-sm text-fire">◉ Satellite detection alerts</h2><div className="space-y-2">{all.filter((a) => a.kind === "detection").map((a) => <AlertCard key={a.id} a={a} />)}</div></div>
        </div>)}
      </ApiState>
    </div>
  );
}
