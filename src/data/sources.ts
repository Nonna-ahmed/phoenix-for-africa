/**
 * Data source registry — which verified sources exist per country.
 * Adding a country = adding an entry here. Only sources that were actually
 * found and retrieved are listed; nothing is assumed.
 */
import type { LocationType } from "./locations";

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

const base = { environmentDataAvailable: true, environmentSource: "NASA POWER", fireDetectionDataAvailable: true, fireDetectionSource: "NASA FIRMS" };

export const DATA_AVAILABILITY: CountryDataAvailability[] = [
  {
    countryCode: "CD", ...base, riskModelAvailable: true, riskModelSource: "PHOENIX backend (DRC model)",
    shelterDataAvailable: false, shelterSource: null,
    settlementDataAvailable: true, settlementSource: "GRID3 (health facilities, schools, religious centers, settlements)",
    layers: COD_LAYERS, lastDataUpdate: null,
    notes: "No official or humanitarian emergency-shelter point dataset found (HDX only has PDF reports). The PHOENIX backend shelter file (drc_katanga_shelters_final.csv) is shown separately with its provenance once the backend is online.",
  },
  {
    countryCode: "DZ", ...base, riskModelAvailable: true, riskModelSource: "Northern Algeria XGBoost v1",
    shelterDataAvailable: false, shelterSource: null, settlementDataAvailable: false, settlementSource: null,
    layers: [], lastDataUpdate: null, notes: "No GRID3 data and no official/humanitarian shelter dataset found for Algeria.",
  },
];

export const getAvailability = (code?: string) => DATA_AVAILABILITY.find((d) => d.countryCode === code);
export const defaultAvailability = (code: string): CountryDataAvailability => ({
  countryCode: code, ...base, riskModelAvailable: false, riskModelSource: null, shelterDataAvailable: false, shelterSource: null,
  settlementDataAvailable: false, settlementSource: null, layers: [], lastDataUpdate: null, notes: "Not yet researched.",
});
