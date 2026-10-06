import { createFileRoute, Link } from "@tanstack/react-router";
import { COUNTRIES } from "@/data/registry";
import { RiskMap } from "@/components/phoenix/RiskMap";
import { RankingTable } from "@/components/phoenix/RankingTable";
import { AlertCard, Section, Stat } from "@/components/phoenix/ui";
import { ApiState, LiveBadge } from "@/components/phoenix/ApiState";
import { useAlerts, useShelters } from "@/services/api/hooks";
import { apiBaseUrl } from "@/services/api/client";

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
  const real = COUNTRIES.filter((c) => c.coverage === "active").length;
  const alerts = useAlerts();
  const shelters = useShelters({ country: "CD" });
  const live = !!apiBaseUrl();
  const count = (q: { data?: unknown[] | undefined; isLoading: boolean; isError: boolean }) => (!live ? "—" : q.isLoading ? "…" : q.isError ? "n/a" : q.data?.length ?? 0);
  return (
    <div className="space-y-6">
      <header>
        <div className="label-mono text-primary">Africa</div>
        <h1 className="text-4xl font-semibold sm:text-5xl">Wildfire Risk Overview</h1>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Real data coverage" value={`${real} countries`} />
        <Stat label="Additional countries" value={<span className="text-xl">{COUNTRIES.length - real} Coming Soon</span>} />
        <Stat label="Active alerts" value={count(alerts)} />
        <Stat label="Shelters (DRC)" value={count(shelters)} tone="text-shelter" />
      </div>
      <Section title="Africa Wildfire Risk Map" right={<Link to="/map" className="text-sm text-primary">Open full map →</Link>}>
        <RiskMap height={480} />
        
      </Section>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Section title="Highest-Risk Regions in Africa" right={<LiveBadge />}><RankingTable /></Section></div>
        <Section title="Latest alerts" right={<LiveBadge />}>
          <ApiState q={alerts} empty="No active alerts">{(l) => <div className="space-y-2">{l.slice(0, 5).map((a) => <AlertCard key={a.id} a={a} />)}</div>}</ApiState>
        </Section>
      </div>
    </div>
  );
}
