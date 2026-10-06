/**
 * Raster map-image sources (rendered by the source service itself, never by PHOENIX).
 * Images are requested for the visible map extent, so detail follows the zoom level.
 */
import type { GridParam } from "@/lib/grid.functions";

const LC = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer";
const POP = "https://worldpop.arcgis.com/arcgis/rest/services/WorldPop_Population_Density_1km/ImageServer";

export const HILLSHADE_TILES = "https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";

/** People/km² class breaks and colours used for the WorldPop density image. */
export const POP_BREAKS: [number, number, [number, number, number]][] = [
  [1, 10, [255, 237, 160]], [10, 50, [254, 178, 76]], [50, 200, [253, 141, 60]], [200, 1000, [240, 59, 32]], [1000, 10_000_000, [189, 0, 38]],
];
const popRule = JSON.stringify({
  rasterFunction: "Colormap",
  rasterFunctionArguments: {
    Colormap: POP_BREAKS.map(([, , c], i) => [i + 1, ...c]),
    Raster: { rasterFunction: "Remap", rasterFunctionArguments: { InputRanges: POP_BREAKS.flatMap(([a, b]) => [a, b]), OutputValues: POP_BREAKS.map((_, i) => i + 1), NoDataRanges: [0, 1] } },
  },
  outputPixelType: "U8",
});

export type RasterId = "landcover" | "population";
export function rasterUrl(id: RasterId, b: { w: number; s: number; e: number; n: number }, px: [number, number]) {
  const common = `bbox=${b.w},${b.s},${b.e},${b.n}&bboxSR=4326&imageSR=3857&size=${px[0]},${px[1]}&format=png32&transparent=true&f=image`;
  return id === "landcover" ? `${LC}/exportImage?${common}` : `${POP}/exportImage?${common}&time=1577836800000&renderingRule=${encodeURIComponent(popRule)}`;
}

/** Esri / Impact Observatory class colours (as rendered by the service). */
export const LC_LEGEND: [string, string][] = [
  ["rgb(53,130,33)", "Trees"], ["rgb(237,207,166)", "Rangeland (grass/shrub)"], ["rgb(255,219,92)", "Crops"], ["rgb(237,2,42)", "Built area"],
  ["rgb(165,155,143)", "Bare ground"], ["rgb(135,209,158)", "Flooded vegetation"], ["rgb(26,91,171)", "Water"],
];

/** Colour scales for NASA POWER grid cells. Values outside the range are clamped for colour only. */
export const GRID_SCALE: Record<GridParam, { label: string; unit: string; min: number; max: number; from: number; to: number }> = {
  T2M_MAX: { label: "Max temperature", unit: "°C", min: 10, max: 45, from: 220, to: 0 },
  T2M_MIN: { label: "Min temperature", unit: "°C", min: -5, max: 30, from: 220, to: 0 },
  T2M: { label: "Mean temperature", unit: "°C", min: 5, max: 38, from: 220, to: 0 },
  RH2M: { label: "Relative humidity", unit: "%", min: 5, max: 100, from: 30, to: 210 },
  WS2M: { label: "Wind speed", unit: "m/s", min: 0, max: 10, from: 180, to: 300 },
  PRECTOTCORR: { label: "Precipitation", unit: "mm/day", min: 0, max: 30, from: 45, to: 220 },
  ALLSKY_SFC_SW_DWN: { label: "Solar radiation", unit: "kWh/m²/day", min: 2, max: 8, from: 60, to: 0 },
  GWETROOT: { label: "Root-zone soil wetness", unit: "0–1", min: 0, max: 1, from: 30, to: 210 },
  GWETTOP: { label: "Surface soil wetness", unit: "0–1", min: 0, max: 1, from: 30, to: 210 },
};
export const scaleColor = (p: GridParam, v: number) => {
  const s = GRID_SCALE[p]; const t = Math.min(1, Math.max(0, (v - s.min) / (s.max - s.min)));
  return `hsl(${s.from + (s.to - s.from) * t} 75% 50%)`;
};
export const WEATHER_PARAMS: GridParam[] = ["T2M_MAX", "T2M_MIN", "T2M", "RH2M", "WS2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"];
export const SOIL_PARAMS: GridParam[] = ["GWETROOT", "GWETTOP"];
