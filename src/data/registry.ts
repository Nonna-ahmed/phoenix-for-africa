/**
 * Config-driven country registry. Adding a country = adding an entry here
 * (plus data sources / model config). No country-specific UI logic.
 *
 * DEMO NOTICE: probabilities, detections, shelters, reports and alerts below
 * are illustrative demo values, labelled as such in the UI, until live APIs
 * (model service, NASA FIRMS, shelter registry) are connected.
 */
import type { Alert, Country, DataStatus, FireDetection, FireReport, ModelInfo, Shelter } from "./types";

const none: DataStatus = { aiModel: "unavailable", satellite: "unavailable", environmental: "unavailable", shelters: "unavailable", alerts: "unavailable" };

const soon = (code: string, name: string, center: [number, number], regionLabel = "Region"): Country => ({
  code, name, center, zoom: 5, coverage: "coming-soon", status: none, regions: [], regionLabel,
});

export const COUNTRIES: Country[] = [
  {
    code: "DZ", name: "Algeria", center: [36.6, 6.5], zoom: 7, coverage: "active", regionLabel: "Wilaya",
    status: { aiModel: "available", satellite: "limited", environmental: "available", shelters: "limited", alerts: "available" },
    regions: [
      {
        id: "northern-algeria", name: "Northern Algeria", center: [36.6, 6.5], bbox: [4.5, 36.0, 8.5, 37.2],
        modelId: "dz-north-xgb-v1", probability: 0.72, lastUpdate: "2026-10-06",
        environment: { t2mMax: 34.1, t2mMin: 21.4, rh2m: 28, ws2m: 4.6, precip: 0, date: "2026-10-05" },
        history: [0.41, 0.48, 0.52, 0.6, 0.66, 0.69, 0.72].map((p, i) => ({ date: `D-${6 - i}`, p })),
      },
    ],
  },
  {
    code: "CD", name: "Democratic Republic of Congo", center: [-9.5, 26.5], zoom: 6, coverage: "active", regionLabel: "Province",
    status: { aiModel: "available", satellite: "limited", environmental: "available", shelters: "limited", alerts: "available" },
    regions: [
      {
        id: "haut-katanga", name: "Haut-Katanga", center: [-10.9, 27.5], modelId: "cd-katanga-xgb-v1", probability: 0.69, lastUpdate: "2026-10-06",
        environment: { t2mMax: 31.2, t2mMin: 15.8, rh2m: 34, ws2m: 3.1, precip: 0, date: "2026-10-05" },
        history: [0.55, 0.58, 0.61, 0.6, 0.64, 0.67, 0.69].map((p, i) => ({ date: `D-${6 - i}`, p })),
      },
      {
        id: "lualaba", name: "Lualaba", center: [-10.5, 24.5], modelId: "cd-katanga-xgb-v1", probability: 0.58, lastUpdate: "2026-10-06",
        environment: { t2mMax: 30.4, t2mMin: 14.9, rh2m: null, ws2m: 2.7, precip: 0.2, date: "2026-10-05" },
        history: [0.44, 0.47, 0.5, 0.53, 0.55, 0.57, 0.58].map((p, i) => ({ date: `D-${6 - i}`, p })),
      },
      {
        id: "tanganyika", name: "Tanganyika", center: [-6.5, 28.0], modelId: "cd-katanga-xgb-v1", probability: 0.31, lastUpdate: "2026-10-06",
        environment: { t2mMax: 29.0, t2mMin: 18.2, rh2m: 52, ws2m: 2.2, precip: 3.4, date: "2026-10-05" },
        history: [0.38, 0.36, 0.35, 0.33, 0.32, 0.31, 0.31].map((p, i) => ({ date: `D-${6 - i}`, p })),
      },
    ],
  },
  soon("MA", "Morocco", [31.8, -7.1]),
  soon("TN", "Tunisia", [34.0, 9.5], "Governorate"),
  soon("EG", "Egypt", [26.8, 30.8], "Governorate"),
  soon("ZA", "South Africa", [-29.0, 24.5], "Province"),
  soon("ZM", "Zambia", [-13.1, 27.8], "Province"),
  soon("AO", "Angola", [-11.2, 17.9], "Province"),
  soon("MZ", "Mozambique", [-18.7, 35.5], "Province"),
  soon("KE", "Kenya", [0.0, 37.9], "County"),
  soon("NG", "Nigeria", [9.1, 8.7], "State"),
];

export const MODELS: ModelInfo[] = [
  {
    id: "dz-north-xgb-v1", coverage: "Northern Algeria", type: "XGBoost", version: "v1", trainingPeriod: "2020–2024",
    features: ["LAT", "LON", "DOY", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR"],
    rocAuc: 0.933, prAuc: 0.548, bbox: [4.5, 36.0, 8.5, 37.2], status: "validated", lastUpdate: "2026",
  },
  {
    id: "cd-katanga-xgb-v1", coverage: "DRC / Katanga (Haut-Katanga, Lualaba, Tanganyika)", type: "XGBoost", version: "v1",
    trainingPeriod: "Per available NASA POWER record (~2,418 dates)", features: ["LAT", "LON", "DOY", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR"],
    status: "validated", lastUpdate: "2026",
    notes: "Climate dataset: ~406,224 records, 167 NASA POWER locations. Values of -999 are treated as missing.",
  },
];

export const DETECTIONS: FireDetection[] = [
  { id: "f1", countryCode: "DZ", regionId: "northern-algeria", lat: 36.75, lon: 5.9, acqDate: "2026-10-06", acqTime: "01:42", satellite: "Suomi NPP", sensor: "VIIRS", confidence: "nominal", frp: 12.4 },
  { id: "f2", countryCode: "DZ", regionId: "northern-algeria", lat: 36.52, lon: 7.4, acqDate: "2026-10-06", acqTime: "01:42", satellite: "NOAA-20", sensor: "VIIRS", confidence: "high", frp: 28.1 },
  { id: "f3", countryCode: "CD", regionId: "haut-katanga", lat: -11.3, lon: 27.2, acqDate: "2026-10-05", acqTime: "12:10", satellite: "Aqua", sensor: "MODIS", confidence: "74", frp: 18.0 },
  { id: "f4", countryCode: "CD", regionId: "tanganyika", lat: -6.9, lon: 28.6, acqDate: "2026-10-05", acqTime: "11:55", satellite: "NOAA-20", sensor: "VIIRS", confidence: "nominal" },
];

export const SHELTERS: Shelter[] = [
  { id: "s1", countryCode: "DZ", regionId: "northern-algeria", name: "Demo shelter — Béjaïa sports hall", lat: 36.75, lon: 5.07, capacity: 400, status: "open" },
  { id: "s2", countryCode: "CD", regionId: "haut-katanga", name: "Demo shelter — Lubumbashi school", lat: -11.66, lon: 27.48, capacity: 250, status: "open" },
];

export const REPORTS: FireReport[] = [
  { id: "r1", countryCode: "CD", regionId: "lualaba", lat: -10.7, lon: 25.5, description: "Smoke seen near farmland (demo report)", reportedAt: "2026-10-06 08:20" },
];

export const ALERTS: Alert[] = [
  { id: "a1", kind: "risk", countryCode: "DZ", regionId: "northern-algeria", title: "HIGH WILDFIRE RISK", message: "Environmental conditions indicate elevated wildfire risk.", probability: 0.72, issuedAt: "2026-10-06 06:00" },
  { id: "a2", kind: "detection", countryCode: "CD", regionId: "haut-katanga", title: "ACTIVE FIRE DETECTION", message: "Satellite-derived thermal anomaly detected.", issuedAt: "2026-10-05 12:30" },
  { id: "a3", kind: "risk", countryCode: "CD", regionId: "haut-katanga", title: "HIGH WILDFIRE RISK", message: "Environmental conditions indicate elevated wildfire risk.", probability: 0.69, issuedAt: "2026-10-06 06:00" },
];

export const getCountry = (code: string) => COUNTRIES.find((c) => c.code.toLowerCase() === code.toLowerCase() || (code.toUpperCase() === "DRC" && c.code === "CD"));
export const getModel = (id?: string) => MODELS.find((m) => m.id === id);

export function rankedRegions() {
  return COUNTRIES.flatMap((c) => c.regions.filter((r) => r.modelId && typeof r.probability === "number").map((r) => ({ country: c, region: r })))
    .sort((a, b) => (b.region.probability ?? 0) - (a.region.probability ?? 0));
}
