import { describe, expect, it, vi } from "vitest";
import { loadStaticRisk, staticCovers, isStale, describeFreshness } from "./staticRisk";

describe("staticRisk", () => {
  it("covers only DR Congo / Haut-Katanga queries", () => {
    expect(staticCovers({ country: "CD" } as never)).toBe(true);
    expect(staticCovers({ country: "CD", region: "haut-katanga" } as never)).toBe(true);
    expect(staticCovers({ country: "CD", region: "lualaba" } as never)).toBe(false);
    expect(staticCovers({ country: "DZ" } as never)).toBe(false);
    expect(staticCovers(null)).toBe(false);
  });
  it("maps cells and drops invalid coordinates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ cells: [
      { lat: -10, lon: 27, probability: 0.4, risk_level: "medium", date: "2026-11-25" },
      { lat: NaN, lon: 27, probability: 0.4, risk_level: "low", date: "x" },
    ] }) })));
    const r = await loadStaticRisk();
    expect(r).toHaveLength(1);
    expect(r[0]!.probability).toBe(0.4);
  });
  it("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(loadStaticRisk()).rejects.toThrow(/404/);
  });
  it("flags stale and unknown issue times", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(isStale({ generated_utc: "2026-11-25T05:00:00Z" }, now)).toBe(false);
    expect(isStale({ generated_utc: "2026-11-23T05:00:00Z" }, now)).toBe(true);
    expect(isStale({}, now)).toBe(true);
    expect(describeFreshness({ date: "2026-11-23", generated_utc: "2026-11-23T05:00:00Z" }, now)).toMatch(/STALE/);
  });
});
