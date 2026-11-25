import { describe, expect, it } from "vitest";
import { parseCsv, filterHotspots } from "./firms.functions";

const csv = "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight\n" +
  "-10.5,27.5,2026-11-25,0130,N20,VIIRS,nominal,3.1,N\n" +
  "-10.5,27.5,2026-11-25,0130,N20,VIIRS,low,3.1,N\n" +
  "-10.5,27.5,2026-11-10,0130,N20,VIIRS,high,3.1,D\n" +
  "-1.0,10.0,2026-11-25,0130,N20,VIIRS,high,3.1,D\n";
describe("keyless hotspots", () => {
  it("keeps nominal/high, in bbox, within days", () => {
    const r = filterHotspots(parseCsv(csv, "VIIRS_NOAA20_NRT"), [24.8, -13, 29, -8.2], 2, new Date("2026-11-25T10:00:00Z"));
    expect(r).toHaveLength(1);
    expect(r[0]!.confidence).toBe("nominal");
  });
});
