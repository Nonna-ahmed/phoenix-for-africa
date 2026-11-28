/** Normalized shelter / safe-location schema (browser-safe, shared by server + UI). */
export type LocationType =
  | "emergency_shelter" | "evacuation_center" | "safe_location" | "school" | "health_facility"
  | "religious_center" | "settlement" | "critical_infrastructure" | "potential_safe_location" | "displacement_site";

export type VerificationStatus = "official" | "humanitarian_verified" | "trusted_geospatial_source" | "community_mapped" | "unverified";

export interface SafeLocation {
  id: string;
  name: string | null;
  country: string;
  countryCode: string;
  region: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  locationType: LocationType;
  /** True only when the source explicitly identifies a shelter/evacuation site AND it is official/humanitarian-verified. */
  isEmergencyShelter: boolean;
  capacity: number | null;
  source: string;
  sourceDataset: string;
  sourceUrl: string;
  sourceDate: string | null;
  lastVerified: string | null;
  verificationStatus: VerificationStatus;
  accessibility: string | null;
  contact: string | null;
  notes: string | null;
}

export const isConfirmedShelter = (l: SafeLocation) =>
  l.isEmergencyShelter && (l.verificationStatus === "official" || l.verificationStatus === "humanitarian_verified");

export const TYPE_LABEL: Record<LocationType, string> = {
  emergency_shelter: "Emergency shelter", evacuation_center: "Evacuation center", safe_location: "Safe location",
  school: "School", health_facility: "Health facility", religious_center: "Religious center",
  settlement: "Settlement", critical_infrastructure: "Critical infrastructure", potential_safe_location: "Possible safe place (community centre, shelter)", displacement_site: "Displacement (IDP) site",
};

export const VERIFY_LABEL: Record<VerificationStatus, string> = {
  official: "Official", humanitarian_verified: "Humanitarian-verified",
  trusted_geospatial_source: "Trusted geospatial source (not a shelter registry)", community_mapped: "Community-mapped (OpenStreetMap), not verified", unverified: "Unverified",
};
