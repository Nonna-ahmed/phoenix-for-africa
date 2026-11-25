import { describe, expect, it, vi } from "vitest";
import { loadStaticHotspots, bboxInPilot, PILOT_BBOX } from "./staticHotspots";
const now = new Date("2026-11-25T12:00:00Z");
const h = (o: object) => ({ lat: -10.5, lon: 27.5, acqDate: "2026-11-25", acqTime: "01:30", satellite: "N20", instrument: "VIIRS", source: "VIIRS_NOAA20_NRT", confidence: "nominal", frp: 3, daynight: "N", ...o });
const file = (fetchedAt: string, hotspots: object[]) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "ok", hotspots, total: hotspots.length, fetchedAt }) })));
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
  it("unsupported bbox makes no fetch and no heavy fallback", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await loadStaticHotspots([-20, -36, 55, 38], 1, now);
    expect(r.status).toBe("not_configured"); expect(f).not.toHaveBeenCalled();
    expect(bboxInPilot(undefined)).toBe(false);
  });
});
