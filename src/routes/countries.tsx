import { createFileRoute, Link } from "@tanstack/react-router";
import { COUNTRIES } from "@/data/registry";
import { DataStatusGrid, PageHeader } from "@/components/phoenix/ui";

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
      <PageHeader eyebrow="Country explorer" title="African countries">Real data coverage: Algeria and DRC. Other countries show “Coming Soon” — no risk values are generated for them.</PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COUNTRIES.map((c) => {
          const active = c.coverage === "active";
          return (
            <Link key={c.code} to="/country/$countryCode" params={{ countryCode: c.code }}
              className={`rounded-md border bg-card p-4 transition hover:border-primary ${active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between"><div><div className="label-mono">{c.code}</div><h2 className="text-xl font-semibold">{c.name}</h2></div>
                <span className={`label-mono rounded-sm px-2 py-1 ${active ? "bg-risk-low/15 text-risk-low" : "bg-muted"}`}>{active ? "Real data" : "Coming Soon"}</span></div>
              {active ? <div className="mt-3 space-y-2"><p className="text-sm text-muted-foreground">{c.regions.map((r) => r.name).join(" · ")}</p><DataStatusGrid status={c.status} /></div>
                : <p className="mt-3 text-sm text-muted-foreground">AI Prediction: Not Available</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
