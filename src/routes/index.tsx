import { createFileRoute, Link } from "@tanstack/react-router";
import { ALERTS, COUNTRIES, DETECTIONS, SHELTERS, rankedRegions } from "@/data/registry";
import { RiskMap, MapLegend } from "@/components/phoenix/RiskMap";
import { RankingTable } from "@/components/phoenix/RankingTable";
import { AlertCard, DemoBadge, Section, Stat } from "@/components/phoenix/ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PHOENIX — Africa Wildfire Risk Overview" },
      { name: "description", content: "Africa-wide predicted wildfire risk, satellite fire detections, alerts and shelters." },
      { property: "og:title", content: "PHOENIX — Africa Wildfire Risk Overview" },
      { property: "og:description", content: "Africa-wide predicted wildfire risk, satellite fire detections, alerts and shelters." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const monitored = COUNTRIES.filter((c) => c.coverage === "active").length;
  const high = rankedRegions().filter((r) => (r.region.probability ?? 0) >= 0.65).length;
  return (
    <div className="space-y-6">
      <header>
        <div className="label-mono text-primary">Africa</div>
        <h1 className="text-4xl font-semibold sm:text-5xl">Wildfire Risk Overview</h1>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Countries monitored" value={`${monitored}/${COUNTRIES.length}`} />
        <Stat label="High-risk areas" value={high} tone="text-risk-high" />
        <Stat label="Fire detections" value={DETECTIONS.length} tone="text-fire" />
        <Stat label="Active alerts" value={ALERTS.length} />
        <Stat label="Shelters" value={SHELTERS.length} tone="text-shelter" />
      </div>
      <Section title="Africa Wildfire Risk Map" right={<Link to="/map" className="text-sm text-primary">Open full map →</Link>}>
        <RiskMap height={480} />
        <MapLegend />
      </Section>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Section title="Highest-Risk Regions in Africa" right={<DemoBadge />}><RankingTable /></Section></div>
        <Section title="Latest alerts"><div className="space-y-2">{ALERTS.map((a) => <AlertCard key={a.id} a={a} />)}</div></Section>
      </div>
    </div>
  );
}
