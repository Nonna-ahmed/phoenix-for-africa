import { createFileRoute, Link } from "@tanstack/react-router";
import { COUNTRIES } from "@/data/registry";
import { RiskMap } from "@/components/phoenix/RiskMap";
import { TopAreas, useAreaRanking } from "@/components/phoenix/TopAreas";
import { Section, Stat } from "@/components/phoenix/ui";

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
  const rows = useAreaRanking();
  const highAreas = rows ? rows.filter((r) => r.high > 0).length : null;
  return (
    <div className="space-y-8">
      <header className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <div className="label-mono text-primary">Africa · updated daily</div>
          <h1 className="mt-2 text-4xl font-semibold leading-tight sm:text-5xl">Where is wildfire risk highest today?</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">Daily satellite-based estimates for 13 study areas across Africa. Pick an area to see the risk map, nearby safe places and weather.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/map" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open risk map</Link>
            <Link to="/countries" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Browse countries</Link>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Countries" value={real} />
          <Stat label="Study areas" value={13} />
          <Stat label="With high-risk zones" value={highAreas ?? "…"} tone="text-risk-high" />
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Risk map" right={<Link to="/map" className="text-sm text-primary">Full map →</Link>}>
            <RiskMap height={520} />
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Highest risk today" right={<span className="label-mono">% of area, high</span>}>
            <TopAreas rows={rows} />
          </Section>
          <Section title="How to read this">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li><span className="text-risk-high">●</span> High: more likely to see satellite-detected fire</li>
              <li><span className="text-risk-medium">●</span> Medium: some chance</li>
              <li><span className="text-risk-low">●</span> Low: lower chance, not a guarantee of safety</li>
              <li><span className="text-fire">●</span> Orange dots: satellite hotspots, not confirmed fires</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
