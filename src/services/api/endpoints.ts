import { apiGet, apiPost } from "./client";
import { env, LAT, LON, num, rows, str } from "./normalize";
import type { Environment } from "@/data/types";

export interface RiskPoint { lat: number; lon: number; probability: number | null; level: string | null; date: string | null; environment: Environment | null }
export interface ApiShelter { id: string; name: string | null; lat: number; lon: number; capacity: number | null; status: string | null; contact: string | null; region: string | null }
export interface ApiAlert { id: string; kind: "risk" | "detection"; title: string; message: string | null; region: string | null; country: string | null; probability: number | null; issuedAt: string | null }
export interface ApiReport { id: string; lat: number; lon: number; description: string | null; reportedAt: string | null; confirmed: boolean }
export interface FwiValue { value: number | null; date: string | null; raw: Record<string, unknown> }

export interface AreaQuery { country?: string | undefined; region?: string | undefined; bbox?: [number, number, number, number] | undefined }
const q = (a: AreaQuery) => ({ country: a.country, region: a.region, bbox: a.bbox?.join(",") });

const hasCoords = <T extends { lat: number; lon: number }>(x: T | null): x is T => !!x && Number.isFinite(x.lat) && Number.isFinite(x.lon);

export async function getRiskMap(a: AreaQuery, signal?: AbortSignal): Promise<RiskPoint[]> {
  const data = await apiGet("/risk-map", q(a), signal);
  return rows(data, ["grid", "cells"]).map((r) => {
    const lat = num(r, LAT), lon = num(r, LON);
    if (lat === null || lon === null) return null;
    return {
      lat, lon,
      probability: num(r, ["probability", "prob", "risk_probability", "risk", "fire_probability"]),
      level: str(r, ["risk_level", "level", "category"]),
      date: str(r, ["date", "DATE", "timestamp"]),
      environment: env(r),
    };
  }).filter(hasCoords);
}

export async function getShelters(a: AreaQuery, signal?: AbortSignal): Promise<ApiShelter[]> {
  const data = await apiGet("/shelters", q(a), signal);
  return rows(data, ["shelters"]).map((r, i) => {
    const lat = num(r, LAT), lon = num(r, LON);
    if (lat === null || lon === null) return null;
    return {
      id: str(r, ["id", "shelter_id"]) ?? `s${i}`, name: str(r, ["name", "shelter_name", "site_name"]), lat, lon,
      capacity: num(r, ["capacity"]), status: str(r, ["status"]), contact: str(r, ["contact", "phone"]),
      region: str(r, ["region", "province"]),
    };
  }).filter(hasCoords);
}

export async function getAlerts(a: Partial<AreaQuery>, signal?: AbortSignal): Promise<ApiAlert[]> {
  const data = await apiGet("/alerts", { country: a.country, region: a.region }, signal);
  return rows(data, ["alerts"]).map((r, i) => {
    const type = (str(r, ["type", "kind", "category"]) ?? "").toLowerCase();
    const kind = /fire|detect|satellite|firms/.test(type) ? "detection" : "risk";
    return {
      id: str(r, ["id"]) ?? `a${i}`, kind,
      title: str(r, ["title", "headline"]) ?? (kind === "detection" ? "ACTIVE FIRE DETECTION" : "HIGH WILDFIRE RISK"),
      message: str(r, ["message", "description", "text"]), region: str(r, ["region", "province", "location"]),
      country: str(r, ["country"]), probability: num(r, ["probability", "risk_probability"]),
      issuedAt: str(r, ["issued_at", "created_at", "date", "timestamp"]),
    };
  });
}

export async function getFwi(a: AreaQuery, signal?: AbortSignal): Promise<FwiValue | null> {
  const data = await apiGet("/fwi", q(a), signal);
  const r = (rows(data)[0] ?? (typeof data === "object" && data ? data : {})) as Record<string, unknown>;
  const value = num(r, ["fwi", "FWI", "value"]);
  if (value === null) return null;
  return { value, date: str(r, ["date", "timestamp"]), raw: r };
}

export async function getFireReports(a: Partial<AreaQuery>, signal?: AbortSignal): Promise<ApiReport[]> {
  const data = await apiGet("/fire-reports", { country: a.country, region: a.region }, signal);
  return rows(data, ["reports"]).map((r, i) => {
    const lat = num(r, LAT), lon = num(r, LON);
    if (lat === null || lon === null) return null;
    return { id: str(r, ["id"]) ?? `r${i}`, lat, lon, description: str(r, ["description", "message"]), reportedAt: str(r, ["reported_at", "created_at", "datetime", "date"]),
      // Only an explicit backend verification marks a ground fire as confirmed.
      confirmed: /^(confirmed|verified|true)$/i.test(str(r, ["status", "verification_status", "verified", "confirmed"]) ?? "") };
  }).filter(hasCoords);
}

export interface FireReportInput { latitude: number; longitude: number; datetime: string; description: string; country?: string | undefined }
export const postFireReport = (b: FireReportInput) => apiPost("/fire-reports", b);

export interface AssistanceInput { latitude?: number | undefined; longitude?: number | undefined; description: string; country?: string | undefined; people?: number | undefined }
export const postAssistance = (b: AssistanceInput) => apiPost("/assistance-requests", b);
