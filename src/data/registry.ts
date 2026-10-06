/**
 * Config-driven country registry. Holds only metadata (geography, data
 * coverage, model configuration). All live values — risk, environment,
 * shelters, alerts, reports — come from the PHOENIX backend via
 * src/services/api. No demo values are stored here.
 */
import type { Country, DataStatus, ModelInfo } from "./types";

const none: DataStatus = { aiModel: "unavailable", satellite: "available", environmental: "unavailable", shelters: "unavailable", alerts: "unavailable" };

const soon = (code: string, name: string, center: [number, number], bbox: [number, number, number, number], regionLabel = "Region"): Country => ({
  code, name, center, bbox, zoom: 5, coverage: "coming-soon", status: none, regions: [], regionLabel,
});

export const COUNTRIES: Country[] = [
  {
    code: "DZ", name: "Algeria", center: [36.6, 6.5], bbox: [-8.7, 19.0, 12.0, 37.2], zoom: 7, coverage: "active", regionLabel: "Wilaya",
    status: { aiModel: "available", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "limited" },
    regions: [{ id: "northern-algeria", name: "Northern Algeria", center: [36.6, 6.5], bbox: [4.5, 36.0, 8.5, 37.2], modelId: "dz-north-xgb-v1" }],
  },
  {
    code: "CD", name: "Democratic Republic of Congo", center: [-9.5, 26.5], bbox: [12.2, -13.5, 31.3, 5.4], zoom: 6, coverage: "active", regionLabel: "Province",
    status: { aiModel: "available", satellite: "available", environmental: "available", shelters: "available", alerts: "limited" },
    regions: [
      { id: "haut-katanga", name: "Haut-Katanga", center: [-10.9, 27.5], modelId: "cd-katanga-xgb-v1" },
      { id: "lualaba", name: "Lualaba", center: [-10.5, 24.5], modelId: "cd-katanga-xgb-v1" },
      { id: "tanganyika", name: "Tanganyika", center: [-6.5, 28.0], modelId: "cd-katanga-xgb-v1" },
    ],
  },
  soon("MA", "Morocco", [31.8, -7.1], [-13.2, 27.6, -1.0, 35.9]),
  soon("TN", "Tunisia", [34.0, 9.5], [7.5, 30.2, 11.6, 37.6], "Governorate"),
  soon("EG", "Egypt", [26.8, 30.8], [24.7, 22.0, 36.9, 31.7], "Governorate"),
  soon("ZA", "South Africa", [-29.0, 24.5], [16.4, -34.9, 32.9, -22.1], "Province"),
  soon("ZM", "Zambia", [-13.1, 27.8], [21.9, -18.1, 33.7, -8.2], "Province"),
  soon("AO", "Angola", [-11.2, 17.9], [11.6, -18.1, 24.1, -4.4], "Province"),
  soon("MZ", "Mozambique", [-18.7, 35.5], [30.2, -26.9, 40.9, -10.4], "Province"),
  soon("KE", "Kenya", [0.0, 37.9], [33.9, -4.7, 41.9, 5.0], "County"),
  soon("NG", "Nigeria", [9.1, 8.7], [2.7, 4.2, 14.7, 13.9], "State"),
];

export const MODELS: ModelInfo[] = [
  {
    id: "dz-north-xgb-v1", coverage: "Northern Algeria", type: "XGBoost", version: "v1", trainingPeriod: "2020–2024",
    features: ["LAT", "LON", "DOY", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR"],
    rocAuc: 0.933, prAuc: 0.548, bbox: [4.5, 36.0, 8.5, 37.2], status: "validated", lastUpdate: "Data unavailable",
  },
  {
    id: "cd-katanga-xgb-v1", coverage: "DRC / Katanga (Haut-Katanga, Lualaba, Tanganyika)", type: "PHOENIX DRC model (served by backend)", version: "—",
    trainingPeriod: "phoenix_climate_2020_2026.csv", features: ["LAT", "LON", "DOY", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR"],
    status: "validated", lastUpdate: "Data unavailable",
    notes: "Climate dataset: ~406,224 records, ~2,418 dates, 167 NASA POWER locations. Values of -999 are treated as missing. Shelters: drc_katanga_shelters_final.csv.",
  },
];

export const getCountry = (code: string) => COUNTRIES.find((c) => c.code.toLowerCase() === code.toLowerCase() || (code.toUpperCase() === "DRC" && c.code === "CD"));
export const getModel = (id?: string) => MODELS.find((m) => m.id === id);

export const AFRICA_BBOX: [number, number, number, number] = [-20, -36, 55, 38];
/** Satellite query area for a scope: region box, else country box, else Africa. */
export function scopeBbox(countryCode?: string, regionId?: string): [number, number, number, number] {
  const c = countryCode ? getCountry(countryCode) : undefined;
  const r = c?.regions.find((x) => x.id === regionId);
  if (r?.bbox) return r.bbox;
  if (r) return [r.center[1] - 1.5, r.center[0] - 1.5, r.center[1] + 1.5, r.center[0] + 1.5];
  return c?.bbox ?? AFRICA_BBOX;
}
