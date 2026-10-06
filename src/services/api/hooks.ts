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
export function useFireReports(a: Partial<AreaQuery> = {}) {
  return useQuery({ ...opts, queryKey: ["fire-reports", a], enabled: !!apiBaseUrl(), queryFn: ({ signal }) => getFireReports(a, signal) });
}
