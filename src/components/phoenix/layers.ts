/**
 * Map layer catalogue. Each layer is independent: its own switch, legend, source and status.
 * `datasetId` links to the shared dataset registry (src/data/datasets.ts) — no second status system.
 */
import type { LocationType } from "@/data/locations";

export type LayerId =
  | "fires" | "risk" | "weather" | "soil" | "landcover" | "terrain" | "population"
  | "grid3_health" | "grid3_school" | "grid3_religious" | "grid3_settlement"
  | "osm_hospitals" | "osm_roads"
  | "shelters_verified" | "safe_locations" | "reports";

export type LegendShape = "dot" | "ring" | "square" | "diamond";
export interface LayerDef {
  id: LayerId; icon: string; label: string; datasetIds: string[]; sourceText?: string; defaultOn: boolean;
  legend: { color: string; label: string; shape: LegendShape }[];
  grid3Type?: LocationType;
}

export const LAYERS: LayerDef[] = [
  { id: "fires", icon: "🔥", label: "NASA FIRMS Fire Detections", datasetIds: ["firms"], defaultOn: true,
    legend: [{ color: "--fire", label: "Satellite hotspot — not a confirmed fire", shape: "ring" }] },
  { id: "risk", icon: "🧠", label: "PHOENIX AI Wildfire Risk", datasetIds: ["phoenix-models"], defaultOn: true,
    legend: [{ color: "--risk-high", label: "AI risk HIGH ≥ 0.65", shape: "dot" }, { color: "--risk-medium", label: "AI risk MEDIUM 0.35–0.65", shape: "dot" }, { color: "--risk-low", label: "AI risk LOW < 0.35", shape: "dot" }] },
  { id: "weather", icon: "🌦️", label: "NASA POWER Weather", datasetIds: ["power"], defaultOn: false,
    legend: [{ color: "--layer-weather", label: "Weather reading (region point)", shape: "square" }] },
  { id: "soil", icon: "🌱", label: "Soil Moisture / Dryness", datasetIds: ["power-soil"], defaultOn: false,
    legend: [{ color: "--layer-soil", label: "Soil moisture (region point)", shape: "square" }] },
  { id: "landcover", icon: "🌳", label: "Land Cover", datasetIds: ["io-lulc"], defaultOn: false,
    legend: [{ color: "--layer-landcover", label: "Land-cover class (region point)", shape: "square" }] },
  { id: "terrain", icon: "🏔️", label: "Terrain", datasetIds: ["srtm"], defaultOn: false,
    legend: [{ color: "--layer-terrain", label: "Elevation / slope (region point)", shape: "square" }] },
  { id: "population", icon: "👥", label: "Population", datasetIds: ["worldpop"], defaultOn: false,
    legend: [{ color: "--layer-pop", label: "Population estimate (region point)", shape: "square" }] },
  { id: "grid3_health", icon: "🏥", label: "GRID3 Health Facilities", datasetIds: ["grid3-cod"], defaultOn: false, grid3Type: "health_facility",
    legend: [{ color: "--loc-health", label: "Health facility (not a shelter)", shape: "dot" }] },
  { id: "grid3_school", icon: "🏫", label: "GRID3 Schools", datasetIds: ["grid3-cod"], defaultOn: false, grid3Type: "school",
    legend: [{ color: "--loc-school", label: "School (not a shelter)", shape: "dot" }] },
  { id: "grid3_religious", icon: "🕌", label: "GRID3 Religious Centers", datasetIds: ["grid3-cod"], defaultOn: false, grid3Type: "religious_center",
    legend: [{ color: "--loc-religious", label: "Religious center (not a shelter)", shape: "dot" }] },
  { id: "grid3_settlement", icon: "📍", label: "GRID3 Settlements", datasetIds: ["grid3-cod"], defaultOn: false, grid3Type: "settlement",
    legend: [{ color: "--loc-settlement", label: "Settlement", shape: "dot" }] },
  { id: "osm_hospitals", icon: "🏥", label: "OSM Hospitals & Clinics", datasetIds: ["osm-infra"], defaultOn: false,
    legend: [{ color: "--layer-hospital", label: "Hospital (critical infrastructure, not a shelter)", shape: "square" }, { color: "--layer-clinic", label: "Clinic", shape: "dot" }] },
  { id: "osm_roads", icon: "🛣️", label: "OSM Main Roads", datasetIds: ["osm-roads"], defaultOn: false,
    legend: [{ color: "--layer-road", label: "Motorway / trunk / primary / secondary — not approved evacuation routes", shape: "square" }] },
  { id: "shelters_verified", icon: "🚨", label: "Verified Emergency Shelters", datasetIds: ["shelters-official"], defaultOn: true,
    legend: [{ color: "--shelter", label: "Verified emergency shelter", shape: "diamond" }] },
  { id: "safe_locations", icon: "📍", label: "Potential Safe Locations", datasetIds: [], sourceText: "PHOENIX backend — drc_katanga_shelters_final.csv (unverified)", defaultOn: true,
    legend: [{ color: "--layer-safe", label: "Potential safe location (unverified)", shape: "dot" }] },
  { id: "reports", icon: "📣", label: "Fire Reports", datasetIds: [], sourceText: "PHOENIX backend — community fire reports", defaultOn: true,
    legend: [{ color: "--report", label: "Community report (unverified)", shape: "dot" }, { color: "--destructive", label: "Confirmed ground fire", shape: "square" }] },
];

export type LayerState = Record<LayerId, boolean>;
export const defaultLayerState = (overrides?: Partial<LayerState>): LayerState =>
  ({ ...Object.fromEntries(LAYERS.map((l) => [l.id, l.defaultOn])), ...overrides }) as LayerState;

export type LayerStatusKind = "off" | "loading" | "ok" | "partial" | "empty" | "unavailable" | "error";
export interface LayerStatus { kind: LayerStatusKind; text: string }
