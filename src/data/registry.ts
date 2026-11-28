/**
 * Config-driven country registry. Holds only metadata (geography, data coverage,
 * model configuration). All live values - risk, environment, shelters, alerts,
 * reports - come from the PHOENIX backend via src/services/api, or from the static
 * per-study-area risk files written daily by backend/predict.py.
 *
 * The study areas below are generated from backend/regions.json and
 * backend/results-<region>.json (the region test that chose each model). If you
 * retrain a region, regenerate this block from public/data/regions-manifest.json.
 */
import type { Country, DataStatus, ModelInfo } from "./types";

const none: DataStatus = { aiModel: "unavailable", satellite: "available", environmental: "unavailable", shelters: "unavailable", alerts: "unavailable" };

const soon = (code: string, name: string, center: [number, number], bbox: [number, number, number, number], regionLabel = "Region"): Country => ({
  code, name, center, bbox, zoom: 5, coverage: "coming-soon", status: none, regions: [], regionLabel,
});

export const COUNTRIES: Country[] = [
  {
    code: "DZ", name: "Algeria", center: [36.6, 6.5], bbox: [-8.7, 19.0, 12.0, 37.2], zoom: 7, coverage: "active", regionLabel: "Wilaya",
    status: { aiModel: "unavailable", satellite: "available", environmental: "unavailable", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "northern-algeria", name: "Northern Algeria", center: [36.6, 6.5], bbox: [4.5, 36.0, 8.5, 37.2], modelId: "dz-north-xgb-v1" }],
  },
  {
    code: "CD", name: "Democratic Republic of Congo", center: [-9.5, 26.5], bbox: [12.2, -13.5, 31.3, 5.4], zoom: 6, coverage: "active", regionLabel: "Province",
    status: { aiModel: "limited", satellite: "available", environmental: "limited", shelters: "unavailable", alerts: "unavailable" },
    regions: [
      { id: "haut-katanga", name: "Haut-Katanga", center: [-10.9, 27.5], bbox: [24.8, -13.0, 29.0, -8.2], modelId: "cd-katanga-lgbm-v1" },
      { id: "lualaba", name: "Lualaba", center: [-10.5, 24.5] },
      { id: "tanganyika", name: "Tanganyika", center: [-6.5, 28.0] },
    ],
  },
  {
    code: "AO", name: "Angola", center: [-10.25, 16.5], bbox: [14.5, -12.5, 18.5, -8], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "ao-moxico", name: "Moxico & Bie", center: [-10.25, 16.5], bbox: [14.5, -12.5, 18.5, -8], modelId: "ao-moxico-v1" }],
  },
  {
    code: "ZM", name: "Zambia", center: [-13.75, 25.5], bbox: [23.5, -16, 27.5, -11.5], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "zm-central", name: "Central & Lusaka", center: [-13.75, 25.5], bbox: [23.5, -16, 27.5, -11.5], modelId: "zm-central-v1" }],
  },
  {
    code: "MZ", name: "Mozambique", center: [-14.75, 38], bbox: [36, -17, 40, -12.5], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "mz-zambezia", name: "Zambezia & Nampula", center: [-14.75, 38], bbox: [36, -17, 40, -12.5], modelId: "mz-zambezia-v1" }],
  },
  {
    code: "TZ", name: "Tanzania", center: [-8.75, 35.5], bbox: [33.5, -11, 37.5, -6.5], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "tz-ruvuma", name: "Ruvuma & Mtwara", center: [-8.75, 35.5], bbox: [33.5, -11, 37.5, -6.5], modelId: "tz-ruvuma-v1" }],
  },
  {
    code: "NG", name: "Nigeria", center: [10.25, 5.5], bbox: [3.5, 8, 7.5, 12.5], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "ng-middle-belt", name: "Niger & Kwara", center: [10.25, 5.5], bbox: [3.5, 8, 7.5, 12.5], modelId: "ng-middle-belt-v1" }],
  },
  {
    code: "GH", name: "Ghana", center: [8.75, -1.5], bbox: [-3.5, 6.5, 0.5, 11], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "gh-north", name: "Northern Ghana", center: [8.75, -1.5], bbox: [-3.5, 6.5, 0.5, 11], modelId: "gh-north-v1" }],
  },
  {
    code: "SN", name: "Senegal", center: [14.25, -14.5], bbox: [-16.5, 12, -12.5, 16.5], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "sn-groundnut", name: "Groundnut Basin", center: [14.25, -14.5], bbox: [-16.5, 12, -12.5, 16.5], modelId: "sn-groundnut-v1" }],
  },
  {
    code: "CM", name: "Cameroon", center: [6.75, 12.5], bbox: [10.5, 4.5, 14.5, 9], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "cm-adamawa", name: "Adamawa", center: [6.75, 12.5], bbox: [10.5, 4.5, 14.5, 9], modelId: "cm-adamawa-v1" }],
  },
  {
    code: "MG", name: "Madagascar", center: [-17.75, 46], bbox: [44, -20, 48, -15.5], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "mg-west", name: "Western Madagascar", center: [-17.75, 46], bbox: [44, -20, 48, -15.5], modelId: "mg-west-v1" }],
  },
  {
    code: "ZA", name: "South Africa", center: [-25.75, 29], bbox: [27, -28, 31, -23.5], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "za-limpopo", name: "Limpopo", center: [-25.75, 29], bbox: [27, -28, 31, -23.5], modelId: "za-limpopo-v1" }],
  },
  {
    code: "ZW", name: "Zimbabwe", center: [-17.25, 31], bbox: [29, -19.5, 33, -15], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "zw-mashonaland", name: "Mashonaland", center: [-17.25, 31], bbox: [29, -19.5, 33, -15], modelId: "zw-mashonaland-v1" }],
  },
  {
    code: "ET", name: "Ethiopia", center: [8.75, 35], bbox: [33, 6.5, 37, 11], zoom: 6, coverage: "active", regionLabel: "Study area",
    status: { aiModel: "limited", satellite: "available", environmental: "available", shelters: "unavailable", alerts: "unavailable" },
    regions: [{ id: "et-south", name: "Southern Ethiopia", center: [8.75, 35], bbox: [33, 6.5, 37, 11], modelId: "et-south-v1" }],
  },
  soon("MA", "Morocco", [31.8, -7.1], [-13.2, 27.6, -1.0, 35.9]),
  soon("TN", "Tunisia", [34.0, 9.5], [7.5, 30.2, 11.6, 37.6], "Governorate"),
  soon("EG", "Egypt", [26.8, 30.8], [24.7, 22.0, 36.9, 31.7], "Governorate"),
  soon("KE", "Kenya", [0.0, 37.9], [33.9, -4.7, 41.9, 5.0], "County"),
  soon("NA", "Namibia", [-22.6, 17.1], [11.7, -28.9, 25.3, -16.9], "Region"),
  soon("BW", "Botswana", [-22.3, 24.7], [19.9, -26.9, 29.4, -17.8], "District"),
  soon("MW", "Malawi", [-13.3, 34.3], [32.6, -17.1, 35.9, -9.4], "District"),
  soon("SD", "Sudan", [15.6, 30.2], [21.8, 8.7, 38.6, 22.2], "State"),
  soon("TD", "Chad", [15.5, 18.7], [13.5, 7.4, 24.0, 23.4], "Province"),
];

export const MODELS: ModelInfo[] = [
  {
    id: "dz-north-xgb-v1", coverage: "Northern Algeria", type: "XGBoost", version: "v1", trainingPeriod: "2020-2024",
    features: ["LAT", "LON", "DOY", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR"],
    rocAuc: 0.933, prAuc: 0.548, bbox: [4.5, 36.0, 8.5, 37.2], status: "legacy", lastUpdate: "Data unavailable",
    notes: "Legacy: trained before the v4 satellite-observation labels existed. See docs/model-cards/dz-north-xgb-v1.md.",
  },
  {
    id: "cd-katanga-lgbm-v1", coverage: "DR Congo / Haut-Katanga pilot", type: "LightGBM", version: "v1",
    trainingPeriod: "2020-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "tmax", "tmin", "wind", "rh", "rain7", "rain30", "rain90", "tmax7", "rh7", "days_since_rain", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9725, prAuc: 0.9183, bbox: [24.8, -13.0, 29.0, -8.2], status: "in-development", lastUpdate: "2026-11-25",
    notes: "Pilot study area, held-out areas and held-out year. Needs NASA POWER weather, which publishes 4-6 days late: the file can lag by a few days.",
  },
  {
    id: "ao-moxico-v1", coverage: "Moxico & Bie study area (eastern Angola)", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9539, prAuc: 0.9525, bbox: [14.5, -12.5, 18.5, -8], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.9525, ROC-AUC 0.9539, Brier 0.0682. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "zm-central-v1", coverage: "Central & Lusaka study area (Zambia)", type: "LightGBM (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9728, prAuc: 0.9532, bbox: [23.5, -16, 27.5, -11.5], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.9532, ROC-AUC 0.9728, Brier 0.0616. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "mz-zambezia-v1", coverage: "Zambezia & Nampula study area (Mozambique)", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9586, prAuc: 0.9225, bbox: [36, -17, 40, -12.5], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.9225, ROC-AUC 0.9586, Brier 0.0701. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "tz-ruvuma-v1", coverage: "Ruvuma & Mtwara study area (southern Tanzania)", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9413, prAuc: 0.9011, bbox: [33.5, -11, 37.5, -6.5], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.9011, ROC-AUC 0.9413, Brier 0.0889. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "ng-middle-belt-v1", coverage: "Niger & Kwara study area (Middle Belt, Nigeria)", type: "LightGBM (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9498, prAuc: 0.9058, bbox: [3.5, 8, 7.5, 12.5], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.9058, ROC-AUC 0.9498, Brier 0.0809. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "gh-north-v1", coverage: "Northern Ghana study area", type: "LightGBM (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9404, prAuc: 0.8545, bbox: [-3.5, 6.5, 0.5, 11], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.8545, ROC-AUC 0.9404, Brier 0.0734. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "sn-groundnut-v1", coverage: "Groundnut Basin study area (Senegal)", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9184, prAuc: 0.7677, bbox: [-16.5, 12, -12.5, 16.5], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.7677, ROC-AUC 0.9184, Brier 0.0956. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "cm-adamawa-v1", coverage: "Adamawa study area (northern Cameroon)", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9614, prAuc: 0.9055, bbox: [10.5, 4.5, 14.5, 9], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.9055, ROC-AUC 0.9614, Brier 0.063. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "mg-west-v1", coverage: "Western Madagascar study area", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9325, prAuc: 0.9414, bbox: [44, -20, 48, -15.5], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.9414, ROC-AUC 0.9325, Brier 0.0989. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "za-limpopo-v1", coverage: "Limpopo study area (South Africa)", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.8531, prAuc: 0.7172, bbox: [27, -28, 31, -23.5], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.7172, ROC-AUC 0.8531, Brier 0.1304. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "zw-mashonaland-v1", coverage: "Mashonaland study area (Zimbabwe)", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.924, prAuc: 0.8269, bbox: [29, -19.5, 33, -15], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.8269, ROC-AUC 0.924, Brier 0.0938. Experimental satellite-detection risk, not a confirmed-fire forecast.",
  },
  {
    id: "et-south-v1", coverage: "Southern Ethiopia study area", type: "LogisticRegression (no weather)", version: "v1",
    trainingPeriod: "2021-2023 train / 2024 validation / 2025 test",
    features: ["doy_sin", "doy_cos", "fire1", "fire3", "fire7", "nb_fire7", "days_since_fire"],
    rocAuc: 0.9518, prAuc: 0.8685, bbox: [33, 6.5, 37, 11], status: "in-development", lastUpdate: "2026-11-28",
    notes: "Chosen by testing 5 model families plus 3 baselines: 2021-2023 train, 2024 validation, 2025 test, scored on 1-degree blocks never used for fitting. Held-out PR-AUC 0.8685, ROC-AUC 0.9518, Brier 0.0628. Experimental satellite-detection risk, not a confirmed-fire forecast.",
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
