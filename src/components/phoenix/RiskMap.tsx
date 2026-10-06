import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { MapProps } from "./RiskMapInner";
import { getCountry } from "@/data/registry";
import { useSafeLocations, useFireReports, useHotspots, useRiskMap, useShelters } from "@/services/api/hooks";
import { scopeBbox } from "@/data/registry";
import { apiBaseUrl } from "@/services/api/client";

const Inner = lazy(() => import("./RiskMapInner"));

function Map(props: MapProps) {
  const fallback = <div style={{ height: props.height ?? 520 }} className="animate-pulse rounded-md border bg-muted" />;
  return <ClientOnly fallback={fallback}><Suspense fallback={fallback}><Inner {...props} /></Suspense></ClientOnly>;
}

/** Map wired to the backend for one connected country/region (or all connected). */
export function RiskMap(props: Omit<MapProps, "risk" | "shelters" | "reports" | "hotspots"> & { days?: number }) {
  const locs = useSafeLocations(props.countryCode, props.countryCode ? scopeBbox(props.countryCode, props.regionId) : undefined, props.layers?.shelters ?? true);
  const fires = useHotspots(scopeBbox(props.countryCode, props.regionId), props.days ?? 1, props.layers?.fires ?? true);
  const dz = useArea("DZ", props), cd = useArea("CD", props);
  const all = [dz, cd];
  const risk = all.flatMap((a) => a.risk.data ?? []);
  const shelters = all.flatMap((a) => a.shelters.data ?? []);
  const reports = all.flatMap((a) => a.reports.data ?? []);
  const loading = all.some((a) => a.risk.isFetching || a.shelters.isFetching);
  const failed = all.filter((a) => a.enabled && (a.risk.isError || a.shelters.isError || a.reports.isError)).length;
  return (
    <div>
      <Map {...props} risk={risk} shelters={shelters} reports={reports} hotspots={fires.data?.hotspots} locations={locs.data?.locations} />
      <MapStatus configured={!!apiBaseUrl()} loading={loading} failed={failed} noRisk={!loading && risk.length === 0} fire={fireMsg(fires, props.layers?.fires ?? true)} />
      {(props.layers?.shelters ?? true) && <p className="text-xs text-muted-foreground">{!props.countryCode ? "Select a country to load shelters & safe locations." : locs.isLoading ? "Loading safe-location data…" : locs.data?.noSource ? "No verified shelter data available for this country." : locs.data ? `GRID3 locations: ${locs.data.locations.length.toLocaleString()} shown (${locs.data.layers.map((l) => `${l.sourceDataset}: ${l.status === "ok" ? l.count.toLocaleString() : "unavailable"}`).join("; ")}). These are not emergency shelters.` : ""}</p>}
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

function fireMsg(q: ReturnType<typeof useHotspots>, on: boolean) {
  if (!on) return "";
  if (q.isLoading) return "Loading NASA FIRMS hotspots…";
  if (q.isError) return "Unable to retrieve satellite data. Please try again.";
  const d = q.data;
  if (!d || d.status === "not_configured") return "Satellite fire data not connected (NASA FIRMS key not configured).";
  if (d.status === "error") return d.message ?? "Satellite data unavailable.";
  const shown = d.truncated ? `${d.hotspots.length.toLocaleString()} strongest of ${d.total.toLocaleString()}` : d.total.toLocaleString();
  return `NASA FIRMS: ${shown} satellite hotspots — thermal anomalies, not confirmed ground fires.`;
}

function MapStatus({ configured, loading, failed, noRisk, fire }: { configured: boolean; loading: boolean; failed: number; noRisk: boolean; fire: string }) {
  let msg = "";
  if (!configured) msg = "Backend not connected — set VITE_API_BASE_URL to load live risk, shelters and reports.";
  else if (loading) msg = "Loading live data…";
  else if (failed) msg = "Unable to retrieve current data for some layers. Please try again.";
  else if (noRisk) msg = "No data available for the selected area.";
  return (
    <div className="mt-2 space-y-0.5 text-xs">
      {msg && <p className={failed ? "text-destructive" : "text-muted-foreground"}>{msg}</p>}
      {fire && <p className="text-fire">{fire}</p>}
    </div>
  );
}

export function MapLegend() {
  const items: [string, string][] = [["bg-risk-high", "High risk ≥65%"], ["bg-risk-medium", "Medium 35–65%"], ["bg-risk-low", "Low <35%"], ["bg-shelter", "Confirmed emergency shelter"], ["bg-loc-health", "Health facility"], ["bg-loc-school", "School"], ["bg-loc-religious", "Religious center"], ["bg-loc-settlement", "Settlement"], ["bg-report", "Community report (unverified)"]];
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${c}`} />{l}</span>)}
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-dashed border-fire" />Satellite hotspot — not confirmed</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rotate-45 bg-destructive ring-2 ring-foreground" />Confirmed ground fire</span>
    </div>
  );
}
