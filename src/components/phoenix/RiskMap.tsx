import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { MapProps } from "./RiskMapInner";
import { getCountry } from "@/data/registry";
import { useFireReports, useRiskMap, useShelters } from "@/services/api/hooks";
import { apiBaseUrl } from "@/services/api/client";

const Inner = lazy(() => import("./RiskMapInner"));

function Map(props: MapProps) {
  const fallback = <div style={{ height: props.height ?? 520 }} className="animate-pulse rounded-md border bg-muted" />;
  return <ClientOnly fallback={fallback}><Suspense fallback={fallback}><Inner {...props} /></Suspense></ClientOnly>;
}

/** Map wired to the backend for one connected country/region (or all connected). */
export function RiskMap(props: Omit<MapProps, "risk" | "shelters" | "reports">) {
  const dz = useArea("DZ", props), cd = useArea("CD", props);
  const all = [dz, cd];
  const risk = all.flatMap((a) => a.risk.data ?? []);
  const shelters = all.flatMap((a) => a.shelters.data ?? []);
  const reports = all.flatMap((a) => a.reports.data ?? []);
  const loading = all.some((a) => a.risk.isFetching || a.shelters.isFetching);
  const failed = all.filter((a) => a.enabled && (a.risk.isError || a.shelters.isError || a.reports.isError)).length;
  return (
    <div>
      <Map {...props} risk={risk} shelters={shelters} reports={reports} />
      <MapStatus configured={!!apiBaseUrl()} loading={loading} failed={failed} noRisk={!loading && risk.length === 0} />
    </div>
  );
}

function useArea(code: string, p: { countryCode?: string | undefined; regionId?: string | undefined; layers?: MapProps["layers"] }) {
  const enabled = !p.countryCode || p.countryCode === code;
  const c = getCountry(code);
  const region = c?.regions.find((r) => r.id === p.regionId);
  const area = enabled ? { country: code, region: region?.id, bbox: region?.bbox } : null;
  const L = p.layers ?? { risk: true, shelters: true, reports: true };
  return {
    enabled,
    risk: useRiskMap(L.risk ? area : null),
    shelters: useShelters(L.shelters && code === "CD" ? area : null), // Algeria: no shelter dataset
    reports: useFireReports(L.reports ? area : null),
  };
}

function MapStatus({ configured, loading, failed, noRisk }: { configured: boolean; loading: boolean; failed: number; noRisk: boolean }) {
  let msg = "";
  if (!configured) msg = "Backend not connected — set VITE_API_BASE_URL to load live risk, shelters and reports.";
  else if (loading) msg = "Loading live data…";
  else if (failed) msg = "Unable to retrieve current data for some layers. Please try again.";
  else if (noRisk) msg = "No data available for the selected area.";
  const fire = "Satellite fire data not connected (NASA FIRMS feed not configured).";
  return (
    <div className="mt-2 space-y-0.5 text-xs">
      {msg && <p className={failed ? "text-destructive" : "text-muted-foreground"}>{msg}</p>}
      <p className="text-muted-foreground">{fire}</p>
    </div>
  );
}

export function MapLegend() {
  const items: [string, string][] = [["bg-risk-high", "High risk ≥65%"], ["bg-risk-medium", "Medium 35–65%"], ["bg-risk-low", "Low <35%"], ["bg-fire", "Satellite Fire Detection"], ["bg-shelter", "Shelter"], ["bg-report", "Fire report"]];
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${c}`} />{l}</span>)}
    </div>
  );
}
