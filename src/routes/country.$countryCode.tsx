import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { getCountry } from "@/data/registry";
import { RiskMap, MapLegend } from "@/components/phoenix/RiskMap";
import { DataStatusGrid, Empty, PageHeader, RegionLink, RiskPill, Section } from "@/components/phoenix/ui";
import { AlertList, DetectionList, ReportList, ShelterList } from "@/components/phoenix/LocalLists";

export const Route = createFileRoute("/country/$countryCode")({
  head: ({ params }) => {
    const n = getCountry(params.countryCode)?.name ?? "Country";
    return { meta: [
      { title: `${n} — PHOENIX` }, { name: "description", content: `Wildfire risk, detections, alerts and shelters for ${n}.` },
      { property: "og:title", content: `${n} — PHOENIX` }, { property: "og:description", content: `Wildfire monitoring for ${n}.` },
    ] };
  },
  component: CountryPage,
});

function CountryPage() {
  const { countryCode } = Route.useParams();
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/country/$countryCode/region/$regionId", fuzzy: true })) return <Outlet />;
  const c = getCountry(countryCode);
  if (!c) return <Empty>Country not supported.</Empty>;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Africa / ${c.code}`} title={c.name}>{c.coverage === "active" ? "Initial PHOENIX implementation." : "Coverage: Coming Soon"}</PageHeader>
      <Section title="Data availability"><DataStatusGrid status={c.status} /></Section>
      <Section title="Country map"><RiskMap countryCode={c.code} height={420} /><MapLegend /></Section>
      <Section title={`${c.regionLabel}s`}>
        {c.regions.length === 0 ? <Empty>AI model not available for this country.</Empty> : (
          <ul className="divide-y">{c.regions.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2"><RegionLink code={c.code} id={r.id}><span className="font-medium">{r.name} →</span></RegionLink>
              <RiskPill p={r.modelId ? r.probability : null} /></li>))}</ul>)}
      </Section>
      <div className="grid gap-6 md:grid-cols-2">
        <AlertList countryCode={c.code} /><DetectionList countryCode={c.code} />
        <ShelterList countryCode={c.code} /><ReportList countryCode={c.code} />
      </div>
    </div>
  );
}
