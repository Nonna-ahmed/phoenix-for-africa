export type Availability = "available" | "limited" | "unavailable";
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export interface DataStatus {
  aiModel: Availability;
  satellite: Availability;
  environmental: Availability;
  shelters: Availability;
  alerts: Availability;
}

/** Environmental values; null = missing (e.g. NASA POWER -999). */
export interface Environment {
  t2mMax: number | null;
  t2mMin: number | null;
  rh2m: number | null;
  ws2m: number | null;
  precip: number | null;
  date: string;
}

export interface Region {
  id: string;
  name: string;
  center: [number, number];
  bbox?: [number, number, number, number]; // W,S,E,N
  modelId?: string; // undefined -> no validated model
  probability?: number | null; // only when modelId present
  environment?: Environment;
  history?: { date: string; p: number }[];
  lastUpdate?: string;
}

export interface Country {
  code: string;
  name: string;
  center: [number, number];
  zoom: number;
  coverage: "active" | "coming-soon";
  status: DataStatus;
  regions: Region[];
  regionLabel: string;
}

export interface FireDetection {
  id: string;
  countryCode: string;
  regionId?: string;
  lat: number;
  lon: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
  sensor: "VIIRS" | "MODIS";
  confidence?: string;
  frp?: number;
}

export interface Shelter {
  id: string;
  countryCode: string;
  regionId?: string;
  name: string;
  lat: number;
  lon: number;
  capacity?: number;
  status: "open" | "full" | "closed";
}

export interface FireReport {
  id: string;
  countryCode: string;
  regionId?: string;
  lat: number;
  lon: number;
  description: string;
  reportedAt: string;
}

export interface Alert {
  id: string;
  kind: "risk" | "detection";
  countryCode: string;
  regionId?: string;
  title: string;
  message: string;
  probability?: number;
  issuedAt: string;
}

export interface ModelInfo {
  id: string;
  coverage: string;
  type: string;
  version: string;
  trainingPeriod: string;
  features: string[];
  rocAuc?: number;
  prAuc?: number;
  bbox?: [number, number, number, number];
  status: "validated" | "in-development";
  lastUpdate: string;
  notes?: string;
}

export function riskLevel(p: number): RiskLevel {
  if (p >= 0.65) return "HIGH";
  if (p >= 0.35) return "MEDIUM";
  return "LOW";
}

/** Normalize NASA POWER fill values (-999) to null. */
export function clean(v: number | null | undefined): number | null {
  if (v === null || v === undefined || v <= -999) return null;
  return v;
}
