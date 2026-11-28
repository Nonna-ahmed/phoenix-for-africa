/**
 * Data source registry — which verified sources exist per country.
 * Adding a country = adding an entry here. Only sources that were actually
 * found and retrieved are listed; nothing is assumed.
 */
import type { LocationType, VerificationStatus } from "./locations";

export interface ArcgisLayer {
  id: string;
  source: string;
  sourceDataset: string;
  url: string;          // FeatureServer layer URL
  locationType: LocationType;
  nameField: string;
  typeField?: string;
  regionField?: string;
  districtField?: string;
  dateField?: string;
  coverageNote?: string;
  /** ArcGIS where clause (default 1=1). */
  where?: string;
  /** How this source should be labelled. Default: trusted geospatial source. */
  verification?: VerificationStatus;
  /** Builds the free-text note shown for each point. */
  note?: (a: Record<string, unknown>) => string | null;
}

export interface CountryDataAvailability {
  countryCode: string;
  environmentDataAvailable: boolean;   // NASA POWER — global coverage
  environmentSource: string;
  fireDetectionDataAvailable: boolean; // NASA FIRMS — global coverage
  fireDetectionSource: string;
  riskModelAvailable: boolean;
  riskModelSource: string | null;
  shelterDataAvailable: boolean;       // official / humanitarian emergency shelters only
  shelterSource: string | null;
  settlementDataAvailable: boolean;    // GRID3 etc. (NOT shelters)
  settlementSource: string | null;
  layers: ArcgisLayer[];
  lastDataUpdate: string | null;
  notes?: string;
}

const GRID3 = "https://services3.arcgis.com/BU6Aadhn6tbBEdyk/ArcGIS/rest/services";

const COD_LAYERS: ArcgisLayer[] = [
  { id: "cod-health", source: "GRID3", sourceDataset: "GRID3 COD Health Facilities v9.0", url: `${GRID3}/GRID3_COD_health_facilities_v9_0/FeatureServer/0`, locationType: "health_facility", nameField: "essnom1", typeField: "esstype", regionField: "province", districtField: "zonesante", dateField: "date" },
  { id: "cod-schools", source: "GRID3", sourceDataset: "GRID3 COD Schools v1.0", url: `${GRID3}/GRID3_COD_schools_v1_0/FeatureServer/0`, locationType: "school", nameField: "ecole", typeField: "ecoletype", regionField: "province", districtField: "zonesante", dateField: "date", coverageNote: "Covers 5 provinces only (incl. Haut-Katanga; not Lualaba or Tanganyika)" },
  { id: "cod-religious", source: "GRID3", sourceDataset: "GRID3 COD Religious Centers v1.0", url: `${GRID3}/GRID3_COD_religious_centers_v1_0/FeatureServer/0`, locationType: "religious_center", nameField: "centrerel", typeField: "reltype", regionField: "province", districtField: "zonesante", dateField: "date", coverageNote: "Covers 5 provinces only (incl. Haut-Katanga; not Lualaba or Tanganyika)" },
  { id: "cod-settlements", source: "GRID3", sourceDataset: "GRID3 COD Settlement Names v9.0", url: `${GRID3}/GRID3_COD_settlement_names_v9_0/FeatureServer/0`, locationType: "settlement", nameField: "localite", typeField: "localitetype", regionField: "province", districtField: "zonesante", dateField: "date" },
];

const OSM = "https://services-eu1.arcgis.com/zci5bUiJ8olAal7N/arcgis/rest/services";
const osm = (id: string, svc: string, where: string, locationType: LocationType, label: string): ArcgisLayer => ({
  id: `osm-${id}`, source: "OpenStreetMap contributors", sourceDataset: `OpenStreetMap ${label} (Esri Africa replica)`, url: `${OSM}/${svc}/FeatureServer/0`,
  locationType, nameField: "name", typeField: "amenity", where, verification: "community_mapped",
  coverageNote: "Community-mapped: coverage varies by place",
});
const OSM_HEALTH = osm("health", "OSM_AF_Medical", "amenity IN ('hospital','clinic')", "health_facility", "hospitals and clinics");
const OSM_SCHOOLS = osm("schools", "OSM_AF_Educational", "amenity IN ('school','college','university')", "school", "schools and colleges");
const OSM_WORSHIP = osm("worship", "OSM_AF_Amenities", "amenity = 'place_of_worship'", "religious_center", "places of worship");
const OSM_COMMUNITY = osm("community", "OSM_AF_Amenities", "amenity IN ('community_centre','townhall')", "potential_safe_location", "community centres and town halls");
const OSM_SHELTERS = osm("shelters", "OSM_AF_Amenities", "amenity IN ('shelter','social_facility')", "potential_safe_location", "mapped shelters");
const OSM_LAYERS: ArcgisLayer[] = [OSM_HEALTH, OSM_SCHOOLS, OSM_COMMUNITY, OSM_WORSHIP, OSM_SHELTERS];

const NGA_LAYERS: ArcgisLayer[] = [
  { id: "nga-health", source: "GRID3", sourceDataset: "GRID3 NGA Health Facilities v4.0", url: `${GRID3}/GRID3_NGA_Health_Facilities_v4_0/FeatureServer/0`, locationType: "health_facility", nameField: "facility_name", typeField: "facility_type", regionField: "state_standard", districtField: "lga_standard" },
  { id: "nga-schools", source: "GRID3", sourceDataset: "GRID3 NGA Schools (2020)", url: `${GRID3}/Schools_in_Nigeria/FeatureServer/0`, locationType: "school", nameField: "name", typeField: "category", regionField: "statename", districtField: "lganame", dateField: "timestamp" },
  { id: "nga-idp", source: "GRID3 / IOM DTM", sourceDataset: "GRID3 NGA IDP Sites (2018-2020 survey)", url: `${GRID3}/IDP_sites_in_Nigeria/FeatureServer/0`, locationType: "displacement_site", nameField: "site_name", typeField: "site_type", regionField: "statename", districtField: "lganame", dateField: "timestamp",
    coverageNote: "Displacement camps from a past survey; some may have closed", note: (a) => [a["site_type"], a["site_statu"], a["total_pop"] ? `about ${a["total_pop"]} people when surveyed` : null].filter((x) => x && String(x).trim()).join(" · ") || null },
  OSM_COMMUNITY, OSM_WORSHIP, OSM_SHELTERS,
];
const ZMB_LAYERS: ArcgisLayer[] = [
  { id: "zmb-health", source: "GRID3", sourceDataset: "GRID3 ZMB Health Facilities v01 beta", url: `${GRID3}/GRID3_ZMB_HealthFac_v01beta/FeatureServer/0`, locationType: "health_facility", nameField: "Name", typeField: "SubType", regionField: "Province", districtField: "District" },
  { id: "zmb-schools", source: "GRID3", sourceDataset: "GRID3 ZMB Schools v01 beta", url: `${GRID3}/GRID3_ZMB_School_v01beta/FeatureServer/0`, locationType: "school", nameField: "Name", typeField: "SubType", regionField: "Province", districtField: "District" },
  OSM_COMMUNITY, OSM_WORSHIP, OSM_SHELTERS,
];

const base = { environmentDataAvailable: true, environmentSource: "NASA POWER", fireDetectionDataAvailable: true, fireDetectionSource: "NASA FIRMS" };

export const DATA_AVAILABILITY: CountryDataAvailability[] = [
  {
    countryCode: "CD", ...base, riskModelAvailable: true, riskModelSource: "PHOENIX backend (DRC model)",
    shelterDataAvailable: false, shelterSource: null,
    settlementDataAvailable: true, settlementSource: "GRID3 (health facilities, schools, religious centers, settlements)",
    layers: [...COD_LAYERS, OSM_COMMUNITY, OSM_SHELTERS], lastDataUpdate: null,
    notes: "No official or humanitarian emergency-shelter point dataset found (HDX only has PDF reports). The PHOENIX backend shelter file (drc_katanga_shelters_final.csv) is shown separately with its provenance once the backend is online.",
  },
  {
    countryCode: "DZ", ...base, riskModelAvailable: true, riskModelSource: "Northern Algeria XGBoost v1",
    shelterDataAvailable: false, shelterSource: null, settlementDataAvailable: false, settlementSource: null,
    layers: OSM_LAYERS, lastDataUpdate: null, notes: "There is no GRID3 data for Algeria, so places come from OpenStreetMap.",
  },
  {
    countryCode: "NG", ...base, riskModelAvailable: true, riskModelSource: "PHOENIX Middle Belt model",
    shelterDataAvailable: false, shelterSource: null, settlementDataAvailable: true, settlementSource: "GRID3 (health facilities, schools, IDP sites)",
    layers: NGA_LAYERS, lastDataUpdate: null, notes: "GRID3 does map displacement (IDP) sites from past surveys.",
  },
  {
    countryCode: "ZM", ...base, riskModelAvailable: true, riskModelSource: "PHOENIX Zambia model",
    shelterDataAvailable: false, shelterSource: null, settlementDataAvailable: true, settlementSource: "GRID3 (health facilities, schools)",
    layers: ZMB_LAYERS, lastDataUpdate: null, notes: "Health facilities and schools come from GRID3.",
  },
];

export const defaultAvailability = (code: string): CountryDataAvailability => ({
  countryCode: code, ...base, riskModelAvailable: false, riskModelSource: null, shelterDataAvailable: false, shelterSource: null,
  settlementDataAvailable: false, settlementSource: "OpenStreetMap (community-mapped)", layers: OSM_LAYERS, lastDataUpdate: null,
  notes: "GRID3 has no facility layers here, so places come from OpenStreetMap.",
});
/** Countries without their own entry fall back to OpenStreetMap-based places. */
export const getAvailability = (code?: string) => (code ? (DATA_AVAILABILITY.find((d) => d.countryCode === code) ?? defaultAvailability(code)) : undefined);
