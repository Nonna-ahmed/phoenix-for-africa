import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Section } from "@/components/phoenix/ui";

export const Route = createFileRoute("/assistance")({
  head: () => ({ meta: [
    { title: "Assistance — PHOENIX" }, { name: "description", content: "Request help and find emergency communication options during wildfires." },
    { property: "og:title", content: "Assistance — PHOENIX" }, { property: "og:description", content: "Wildfire emergency assistance." },
  ] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader eyebrow="What can people do?" title="Assistance">If you are in immediate danger, call your national emergency number first.</PageHeader>
      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Request help"><p className="text-sm text-muted-foreground">Assistance requests will be routed to regional responders once a response partner is connected for your country.</p></Section>
        <Section title="Emergency contacts"><p className="text-sm text-muted-foreground">Country-specific emergency numbers: data unavailable. Contact local civil protection services.</p></Section>
        <Section title="Stay safe"><ul className="list-disc pl-5 text-sm text-muted-foreground"><li>Move away from smoke, upwind if possible</li><li>Go to a known shelter or open cleared ground</li><li>Keep phone charged; follow official alerts</li></ul></Section>
      </div>
    </div>
  ),
});
