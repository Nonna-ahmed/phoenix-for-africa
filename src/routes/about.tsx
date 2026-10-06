import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Section } from "@/components/phoenix/ui";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [
    { title: "About — PHOENIX" }, { name: "description", content: "PHOENIX is an AI-powered Africa-wide wildfire early warning and disaster resilience platform." },
    { property: "og:title", content: "About PHOENIX" }, { property: "og:description", content: "Africa-wide wildfire early warning platform." },
  ] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader eyebrow="About" title="PHOENIX">An AI-powered Africa-wide wildfire early warning and disaster resilience platform.</PageHeader>
      <div className="grid gap-4 md:grid-cols-2">
        {([["Where is risk high?", "Regional AI models predict wildfire likelihood from environmental conditions."],
          ["Where are fires detected?", "Satellite thermal anomalies from NASA FIRMS (VIIRS, MODIS)."],
          ["What drives the risk?", "Temperature, humidity, wind and precipitation from NASA POWER."],
          ["What can people do?", "Alerts, shelters, fire reports and assistance."]] as const).map(([t, d]) => <Section key={t} title={t}><p className="text-sm text-muted-foreground">{d}</p></Section>)}
      </div>
      <Section title="Credibility first"><p className="text-sm text-muted-foreground">Algeria and the DRC are initial implementations. Where data or a validated model doesn’t exist, PHOENIX says so rather than filling the map.</p></Section>
    </div>
  ),
});
