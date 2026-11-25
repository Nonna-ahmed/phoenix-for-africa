import { describe, expect, it, vi } from "vitest";
import { loadStaticHotspots, bboxOverlaps } from "./staticHotspots";
const PILOT_BBOX: [number, number, number, number] = [24.8, -13.0, 29.0, -8.2];
const now = new Date("2026-11-25T12:00:00Z");
const h = (o: object) => ({ lat: -10.5, lon: 27.5, acqDate: "2026-11-25", acqTime: "01:30", satellite: "N20", instrument: "VIIRS", source: "VIIRS_NOAA20_NRT", confidence: "nominal", frp: 3, daynight: "N", ...o });
const file = (fetchedAt: string, hotspots: object[]) => vi.stubGlobal("fetch", vi.fn(async (u: string) => ({ ok: true, status: 200, json: async () => ({ status: "ok", coverage_WSEN: String(u).includes("northern") ? [-25, -10, 52, 37.5] : [10, -35, 58, -4], hotspots: String(u).includes("northern") ? [] : hotspots, total: hotspots.length, fetchedAt }) })));
describe("static hotspots", () => {
  it("filters by day window, bbox, confidence", async () => {
    file("2026-11-25T06:00:00Z", [h({}), h({ acqDate: "2026-11-20" }), h({ lon: 40 }), h({ confidence: "low" })]);
    const r = await loadStaticHotspots(PILOT_BBOX, 1, now);
    expect(r.status).toBe("ok"); expect(r.hotspots).toHaveLength(1);
  });
  it("stale file is an error state, not data", async () => {
    file("2026-11-23T06:00:00Z", [h({})]);
    const r = await loadStaticHotspots(PILOT_BBOX, 1, now);
    expect(r.status).toBe("error"); expect(r.hotspots).toHaveLength(0);
  });
  it("404 and invalid JSON are errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    expect((await loadStaticHotspots(PILOT_BBOX, 1, now)).status).toBe("error");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("x"); }));
    expect((await loadStaticHotspots(PILOT_BBOX, 1, now)).status).toBe("error");
  });
  it("area outside all files is unavailable; straddling is partial with a percentage; whole DRC is fully covered by the two files", async () => {
    file("2026-11-25T06:00:00Z", [h({})]);
    expect((await loadStaticHotspots([-80, 0, -70, 10], 1, now)).status).toBe("not_configured");
    const part = await loadStaticHotspots([-40, -13.5, 31, 5], 1, now);
    expect(part.status).toBe("ok"); expect(part.caveats?.join(" ")).toMatch(/Spatial coverage: only about \d+%/);
    const drc = await loadStaticHotspots([12.2, -13.5, 31.3, 5.4], 1, now);
    expect(drc.areaCoveragePct).toBe(100); expect(drc.caveats).toEqual([]);
  });
  it("one failed file is reported as missing coverage, not as zero hotspots", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => String(u).includes("northern") ? ({ ok: false, status: 404 }) : ({ ok: true, status: 200, json: async () => ({ status: "ok", coverage_WSEN: [10, -35, 58, -4], hotspots: [h({})], total: 1, fetchedAt: "2026-11-25T06:00:00Z" }) })));
    const r = await loadStaticHotspots(PILOT_BBOX, 1, now);
    expect(r.status).toBe("ok"); expect(r.caveats?.join(" ")).toMatch(/could not be used/);
    const n = await loadStaticHotspots([20, 10, 30, 20], 1, now);
    expect(n.status).toBe("error"); expect(n.hotspots).toHaveLength(0);
  });
  it("more days than the file holds adds a time caveat", async () => {
    file("2026-11-25T06:00:00Z", [h({})]);
    const r = await loadStaticHotspots(PILOT_BBOX, 5, now);
    expect(r.caveats?.join(" ")).toMatch(/last 2 UTC days, but 5 were requested/); expect(r.daysCovered).toBe(2);
    expect((await loadStaticHotspots(PILOT_BBOX, 1, now)).caveats).toEqual([]);
  });
  it("unsupported bbox makes no fetch and no heavy fallback", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await loadStaticHotspots(undefined, 1, now);
    expect(r.status).toBe("not_configured"); expect(f).not.toHaveBeenCalled();
    expect(bboxOverlaps(undefined, [1,2,3,4])).toBe(false);
  });
});
