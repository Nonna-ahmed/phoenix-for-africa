import { createFileRoute, Link } from "@tanstack/react-router";
import { getCountry, getModel } from "@/data/registry";
import { riskLevel } from "@/data/types";
import { RiskMap, MapLegend } from "@/components/phoenix/RiskMap";
import { DemoBadge, Empty, PageHeader, Section } from "@/components/phoenix/ui";
import { AlertList, DetectionList, EnvPanel, ReportList, ShelterList } from "@/components/phoenix/LocalLists";

export const Route = createFileRoute("/country/$countryCode/region/$regionId")({
  head: ({ params }) => {
    const r = getCountry(params.countryCode)?.regions.find((x) => x.id === params.regionId);
    const n = r?.name ?? "Region";
    return { meta: [
      { title: `${n} wildfire risk — PHOENIX` }, { name: "description", content: `Predicted wildfire risk and conditions for ${n}.` },
      { property: "og:title", content: `${n} — PHOENIX` }, { property: "og:description", content: `Regional wildfire intelligence for ${n}.` },
    ] };
  },
  component: RegionPage,
});

function RegionPage() {
  const { countryCode, regionId } = Route.useParams();
  const c = getCountry(countryCode);
  const r = c?.regions.find((x) => x.id === regionId);
  if (!c || !r) return <Empty>Region not found.</Empty>;
  const model = getModel(r.modelId);
  const p = model ? r.probability : null;
  const lvl = typeof p === "number" ? riskLevel(p) : null;
  const tone = lvl === "HIGH" ? "text-risk-high" : lvl === "MEDIUM" ? "text-risk-medium" : "text-risk-low";
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Africa / ${c.name} / ${c.regionLabel}`} title={r.name}>
        <Link to="/country/$countryCode" params={{ countryCode: c.code }} className="text-primary">← {c.name}</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Predicted Wildfire Risk" right={<DemoBadge />}>
          {typeof p === "number" && model ? (<>
            <div className={`font-display text-6xl font-bold ${tone}`}>{Math.round(p * 100)}%</div>
            <div className={`font-mono text-sm font-bold ${tone}`}>Risk Level: {lvl}</div>
            <p className="mt-2 text-sm text-muted-foreground">“Where is a wildfire more likely to occur?” — model {model.type} {model.version}. Updated {r.lastUpdate}.</p>
            {r.history && <div className="mt-4"><div className="label-mono mb-1">7-day trend</div>
              <div className="flex h-16 items-end gap-1">{r.history.map((h) => <div key={h.date} title={`${h.date}: ${Math.round(h.p * 100)}%`} className="flex-1 rounded-t-sm bg-primary/70" style={{ height: `${h.p * 100}%` }} />)}</div></div>}
          </>) : <Empty>AI prediction not currently available for this region.</Empty>}
        </Section>
        <div className="lg:col-span-2"><Section title="Region map"><RiskMap countryCode={c.code} regionId={r.id} height={340} /><MapLegend /></Section></div>
      </div>
      <EnvPanel env={r.environment} />
      <div className="grid gap-6 md:grid-cols-2">
        <DetectionList countryCode={c.code} regionId={r.id} /><AlertList countryCode={c.code} regionId={r.id} />
        <ShelterList countryCode={c.code} regionId={r.id} /><ReportList countryCode={c.code} regionId={r.id} />
      </div>
    </div>
  );
}
