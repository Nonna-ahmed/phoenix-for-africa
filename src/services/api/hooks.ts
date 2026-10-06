import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl } from "./client";
import { getAlerts, getFireReports, getFwi, getRiskMap, getShelters, type AreaQuery } from "./endpoints";

const opts = { retry: 1, staleTime: 5 * 60_000, refetchOnWindowFocus: false } as const;

/** Only the countries with a real backend integration are queried. */
export const CONNECTED = ["DZ", "CD"];

export function useRiskMap(a: AreaQuery | null) {
  return useQuery({ ...opts, queryKey: ["risk-map", a], enabled: !!a && !!apiBaseUrl(), queryFn: ({ signal }) => getRiskMap(a!, signal) });
}
export function useShelters(a: AreaQuery | null) {
  return useQuery({ ...opts, queryKey: ["shelters", a], enabled: !!a && !!apiBaseUrl(), queryFn: ({ signal }) => getShelters(a!, signal) });
}
export function useAlerts(a: Partial<AreaQuery> = {}) {
  return useQuery({ ...opts, queryKey: ["alerts", a], enabled: !!apiBaseUrl(), queryFn: ({ signal }) => getAlerts(a, signal) });
}
export function useFwi(a: AreaQuery | null) {
  return useQuery({ ...opts, queryKey: ["fwi", a], enabled: !!a && !!apiBaseUrl(), queryFn: ({ signal }) => getFwi(a!, signal) });
}
export function useFireReports(a: Partial<AreaQuery> | null = {}) {
  return useQuery({ ...opts, queryKey: ["fire-reports", a], enabled: !!a && !!apiBaseUrl(), queryFn: ({ signal }) => getFireReports(a!, signal) });
}

/** Region summary derived only from backend risk-map points (no synthetic values). */
export function useRegionSummary(country: string, region: { id: string; bbox?: [number, number, number, number] | undefined } | undefined) {
  const q = useRiskMap(region ? { country, region: region.id, bbox: region.bbox } : null);
  const pts = q.data ?? [];
  const withP = pts.filter((p) => p.probability !== null);
  const top = withP.reduce<(typeof pts)[number] | null>((m, p) => (!m || p.probability! > m.probability! ? p : m), null);
  const dates = [...new Set(pts.map((p) => p.date).filter((d): d is string => !!d))].sort();
  const latest = dates.at(-1) ?? null;
  const envPt = pts.find((p) => p.environment && (!latest || p.date === latest)) ?? null;
  const trend = dates.length >= 2
    ? dates.slice(-7).map((d) => ({ date: d, p: Math.max(...withP.filter((x) => x.date === d).map((x) => x.probability!)) })).filter((x) => Number.isFinite(x.p))
    : [];
  return { q, points: pts, maxProbability: top?.probability ?? null, latestDate: latest, environment: envPt?.environment ?? null, trend };
}
