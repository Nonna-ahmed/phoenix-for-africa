import { createFileRoute, Link } from "@tanstack/react-router";
import { ALERTS, COUNTRIES, DETECTIONS, SHELTERS } from "@/data/registry";
import { PageHeader, RiskPill } from "@/components/phoenix/ui";

export const Route = createFileRoute("/countries")({
  head: () => ({ meta: [
    { title: "Countries — PHOENIX" }, { name: "description", content: "Explore wildfire monitoring coverage across African countries." },
    { property: "og:title", content: "Countries — PHOENIX" }, { property: "og:description", content: "Wildfire monitoring coverage across Africa." },
  ] }),
  component: Countries,
});

function Countries() {
  return (
    <div>
      <PageHeader eyebrow="Country explorer" title="African countries">Coverage differs by country. Countries without integrated data show “Coming Soon” — no risk values are generated for them.</PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COUNTRIES.map((c) => {
          const active = c.coverage === "active";
          const maxP = Math.max(...c.regions.map((r) => r.probability ?? -1));
          return (
            <Link key={c.code} to="/country/$countryCode" params={{ countryCode: c.code }}
              className={`rounded-md border bg-card p-4 transition hover:border-primary ${active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between"><div><div className="label-mono">{c.code}</div><h2 className="text-xl font-semibold">{c.name}</h2></div>
                {active ? <RiskPill p={maxP >= 0 ? maxP : null} /> : <span className="label-mono rounded-sm bg-muted px-2 py-1">Coming Soon</span>}</div>
              {active ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="label-mono">Fire detections</dt><dd className="font-mono">{DETECTIONS.filter((d) => d.countryCode === c.code).length}</dd></div>
                  <div><dt className="label-mono">Alerts</dt><dd className="font-mono">{ALERTS.filter((a) => a.countryCode === c.code).length}</dd></div>
                  <div><dt className="label-mono">Regions</dt><dd className="font-mono">{c.regions.length}</dd></div>
                  <div><dt className="label-mono">Shelters</dt><dd className="font-mono">{SHELTERS.filter((s) => s.countryCode === c.code).length}</dd></div>
                </dl>
              ) : <p className="mt-3 text-sm text-muted-foreground">AI Prediction: Not Available</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
