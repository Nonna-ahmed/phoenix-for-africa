import { apiBaseUrl } from "@/services/api/client";
import { loadStaticRiskForArea } from "@/services/staticRisk";
import { useQuery } from "@tanstack/react-query";
import { useRegionSummary } from "@/services/api/hooks";
import type { Region } from "@/data/types";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { getCountry } from "@/data/registry";
import { RiskMap } from "@/components/phoenix/RiskMap";
import { DataStatusGrid, Empty, PageHeader, RegionLink, RiskPill, Section } from "@/components/phoenix/ui";
import { SitePanel } from "@/components/phoenix/SitePanel";
import { AlertList, DetectionList, EnvPanel, ReportList, SafePlacesPanel, ShelterList } from "@/components/phoenix/LocalLists";

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
      <PageHeader eyebrow={`Africa / ${c.code}`} title={c.name}>{c.coverage === "active" ? (c.regions.some((r) => !!r.modelId) ? "Experimental: risk is shown only where a study area with its own tested model overlaps this country, drawn inside the country border. It is not an administrative boundary. Each estimate is a satellite-detection probability, not a confirmed fire." : "Prediction backend not connected.") : "Coverage: Coming Soon"}</PageHeader>
      <Section title="Data availability"><DataStatusGrid status={c.status} /></Section>
      <Section title="Country map"><RiskMap countryCode={c.code} height={420} /></Section>
      {!apiBaseUrl() && c.regions.some((r) => !!r.modelId) && <StudyAreaSummary code={c.code} />}
      <Section title={`${c.regionLabel}s`}>
        {c.regions.length === 0 ? <Empty>AI model not available for this country.</Empty> : (
          <ul className="divide-y">{c.regions.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2"><RegionLink code={c.code} id={r.id}><span className="font-medium">{r.name} →</span></RegionLink>
              <RegionRisk code={c.code} region={r} /></li>))}</ul>)}
      </Section>
      {c.coverage === "active" && <div className="grid gap-6 md:grid-cols-2">
        <AlertList countryCode={c.code} /><DetectionList countryCode={c.code} />
        <ShelterList countryCode={c.code} /><ReportList countryCode={c.code} />
      </div>}
      {c.coverage === "active" && <>
        <SafePlacesPanel countryCode={c.code} />
        <EnvPanel point={c.center} />
        <SitePanel point={c.center} />
      </>}
    </div>
  );
}

function RegionRisk({ code, region }: { code: string; region: Region }) {
  const s = useRegionSummary(code, region);
  if (!region.modelId) return <RiskPill p={null} />;
  if (s.q.isLoading) return <span className="text-sm text-muted-foreground">Loading…</span>;
  if (s.q.isError) return <span className="label-mono rounded-sm bg-muted px-2 py-1">No estimate</span>;
  return <RiskPill p={s.maxProbability} />;
}

function StudyAreaSummary({ code }: { code: string }) {
  const q = useQuery({ queryKey: ["static-risk-summary", code], queryFn: () => loadStaticRiskForArea({ country: code }), staleTime: 15 * 60_000, retry: 1 });
  return (
    <Section title="Study area (experimental)">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : q.isError || !q.data ? <p className="text-sm text-destructive">Risk output unavailable (missing, failed or not for today, UTC). This is not low risk and says nothing about safety.</p>
        : (() => {
          const pts = q.data.filter((x) => x.probability !== null);
          const peak = pts.reduce((m, x) => Math.max(m, x.probability ?? 0), 0);
          return <p className="text-sm">{pts.length} cells, peak single-cell probability {Math.round(peak * 100)}%. Cells are shown inside the country border only. Low means a lower chance of a satellite detection in the cell, not safety.</p>;
        })()}
    </Section>
  );
}
