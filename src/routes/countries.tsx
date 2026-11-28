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
  const act = COUNTRIES.filter((c) => c.coverage === "active");
  const soon = COUNTRIES.filter((c) => c.coverage !== "active");
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Country explorer" title="African countries">{act.length} countries have daily risk estimates. The others are coming soon and show no risk values.</PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {act.map((c) => (
          <Link key={c.code} to="/country/$countryCode" params={{ countryCode: c.code }} className="group rounded-xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary">
            <div className="flex items-start justify-between gap-2">
              <div><div className="label-mono">{c.code}</div><h2 className="text-xl font-semibold group-hover:text-primary">{c.name}</h2></div>
              <span className="label-mono rounded-full bg-risk-low/15 px-2.5 py-1 text-risk-low">Live</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{c.regions.map((r) => r.name).join(" · ")}</p>
            <div className="mt-4 border-t pt-3"><DataStatusGrid status={c.status} /></div>
          </Link>
        ))}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-muted-foreground">Coming soon</h2>
        <div className="flex flex-wrap gap-2">
          {soon.map((c) => <Link key={c.code} to="/country/$countryCode" params={{ countryCode: c.code }} className="rounded-full border px-3 py-1 text-sm text-muted-foreground hover:text-foreground">{c.name}</Link>)}
        </div>
      </section>
    </div>
  );
}
