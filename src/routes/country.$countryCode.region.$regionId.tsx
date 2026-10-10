import { createFileRoute, Link } from "@tanstack/react-router";
import { getCountry, getModel } from "@/data/registry";
import { riskLevel } from "@/data/types";
import { RiskMap } from "@/components/phoenix/RiskMap";
import { Empty, PageHeader, Section } from "@/components/phoenix/ui";
import { ApiState, LiveBadge } from "@/components/phoenix/ApiState";
import { AlertList, DetectionList, EnvPanel, FwiPanel, ReportList, ShelterList } from "@/components/phoenix/LocalLists";
import { SitePanel } from "@/components/phoenix/SitePanel";
import { useRegionSummary } from "@/services/api/hooks";

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
  const s = useRegionSummary(c?.code ?? "", r);
  if (!c || !r) return <Empty>Region not found.</Empty>;
  const model = getModel(r.modelId);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Africa / ${c.name} / ${c.regionLabel}`} title={r.name}>
        <Link to="/country/$countryCode" params={{ countryCode: c.code }} className="text-primary">← {c.name}</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Predicted Wildfire Risk" right={<LiveBadge />}>
          {!model ? <Empty>AI prediction not currently available for this region.</Empty> : (
            <ApiState q={s.q} isEmpty={() => s.maxProbability === null}>{() => {
              const p = s.maxProbability!; const lvl = riskLevel(p);
              const tone = lvl === "HIGH" ? "text-risk-high" : lvl === "MEDIUM" ? "text-risk-medium" : "text-risk-low";
              return (<>
                <div className={`font-display text-6xl font-bold ${tone}`}>{Math.round(p * 100)}%</div>
                <div className={`font-mono text-sm font-bold ${tone}`}>Highest point risk: {lvl}</div>
                <p className="mt-2 text-sm text-muted-foreground">{s.points.length} model points · {model.type} · {s.latestDate ?? "date unavailable"}. Click a point on the map for details.</p>
                {model.status === "legacy" && <p className="mt-2 text-xs text-muted-foreground">Legacy model (trained before v4 labels): indicative only. Retraining is planned.</p>}
                <div className="mt-4"><div className="label-mono mb-1">7-day trend</div>
                  {s.trend.length >= 2 ? (
                    <div className="flex h-16 items-end gap-1">{s.trend.map((h) => <div key={h.date} title={`${h.date}: ${Math.round(h.p * 100)}%`} className="flex-1 rounded-t-sm bg-primary/70" style={{ height: `${h.p * 100}%` }} />)}</div>
                  ) : <p className="text-sm text-muted-foreground">Historical trend unavailable for this region.</p>}
                </div>
              </>);
            }}</ApiState>)}
        </Section>
        <div className="lg:col-span-2"><Section title="Region map"><RiskMap countryCode={c.code} regionId={r.id} height={360} /></Section></div>
      </div>
      <EnvPanel point={r.center} />
      <SitePanel point={r.center} />
      <div className="grid gap-6 md:grid-cols-2">
        <FwiPanel countryCode={c.code} regionId={r.id} bbox={r.bbox} /><DetectionList countryCode={c.code} regionId={r.id} />
        <AlertList countryCode={c.code} regionId={r.id} /><ShelterList countryCode={c.code} regionId={r.id} />
        <ReportList countryCode={c.code} regionId={r.id} />
      </div>
    </div>
  );
}
