import { apiBaseUrl } from "@/services/api/client";
import { loadStaticRisk } from "@/services/staticRisk";
import { useQuery } from "@tanstack/react-query";
import { useRegionSummary } from "@/services/api/hooks";
import type { Region } from "@/data/types";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { getCountry } from "@/data/registry";
import { RiskMap } from "@/components/phoenix/RiskMap";
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
      <PageHeader eyebrow={`Africa / ${c.code}`} title={c.name}>{c.coverage === "active" ? (c.code === "CD" ? "Experimental pilot: risk is shown for a rectangular study area (24.8E to 29.0E, 13.0S to 8.2S) around Haut-Katanga. It is not a province boundary and extends into neighbouring areas such as Zambia." : "Prediction backend not connected.") : "Coverage: Coming Soon"}</PageHeader>
      <Section title="Data availability"><DataStatusGrid status={c.status} /></Section>
      <Section title="Country map"><RiskMap countryCode={c.code} height={420} /></Section>
      {c.code === "CD" && !apiBaseUrl() && <StudyAreaSummary />}
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
    </div>
  );
}

function RegionRisk({ code, region }: { code: string; region: Region }) {
  const s = useRegionSummary(code, region);
  if (!region.modelId) return <RiskPill p={null} />;
  // No backend: the static pilot covers a cross-border rectangle, so no per-province probability is shown.
  if (!apiBaseUrl()) return <span className="label-mono rounded-sm bg-muted px-2 py-1">No province estimate (see study area)</span>;
  if (s.q.isLoading) return <span className="text-sm text-muted-foreground">Loading…</span>;
  if (s.q.isError) return <span className="text-sm text-destructive">Unavailable</span>;
  return <RiskPill p={s.maxProbability} />;
}

function StudyAreaSummary() {
  const q = useQuery({ queryKey: ["static-risk-summary"], queryFn: () => loadStaticRisk(), staleTime: 15 * 60_000, retry: 1 });
  return (
    <Section title="Pilot study area (experimental)">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : q.isError || !q.data ? <p className="text-sm text-destructive">Risk output unavailable (missing, failed or not for today, UTC). This is not low risk and says nothing about safety.</p>
        : (() => {
          const pts = q.data.filter((x) => x.probability !== null);
          const peak = pts.reduce((m, x) => Math.max(m, x.probability ?? 0), 0);
          return <p className="text-sm">{pts.length} cells, peak single-cell probability {Math.round(peak * 100)}%. Rectangle 24.8E to 29.0E, 13.0S to 8.2S; it spans several provinces and part of Zambia. Low means a lower chance of a satellite detection in the cell, not safety.</p>;
        })()}
    </Section>
  );
}
