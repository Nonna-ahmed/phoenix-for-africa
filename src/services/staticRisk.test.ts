import { describe, expect, it, vi } from "vitest";
import { loadStaticRisk, loadStaticRiskForArea, MANIFEST_URL, riskUrl, staticCovers, isStale, describeFreshness } from "./staticRisk";

const okManifest = { regions: [{ id: "haut-katanga", estimates_available: true }, { id: "gh-north", estimates_available: true }] };
const calls: string[] = [];
function stub(risk: unknown, manifest: unknown = okManifest, manifestOk = true) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    calls.push(u);
    return u === MANIFEST_URL
      ? { ok: manifestOk, status: manifestOk ? 200 : 404, json: async () => manifest }
      : { ok: true, json: async () => risk };
  }));
}

describe("staticRisk", () => {
  it("covers only study areas that ship a static risk file", () => {
    expect(staticCovers({ country: "CD" } as never)).toBe(true);
    expect(staticCovers({ country: "CD", region: "haut-katanga" } as never)).toBe(true);
    expect(staticCovers({ country: "CD", region: "lualaba" } as never)).toBe(false);
    expect(staticCovers({ country: "GH", region: "gh-north" } as never)).toBe(true);
    expect(staticCovers({ country: "DZ" } as never)).toBe(false);
    expect(staticCovers(null)).toBe(false);
  });
  it("maps cells and drops invalid coordinates", async () => {
    stub({ date: "2026-11-25", generated_utc: "2026-11-25T05:00:00Z", cells: [
      { lat: -10, lon: 27, probability: 0.4, risk_level: "medium", date: "2026-11-25" },
      { lat: NaN, lon: 27, probability: 0.4, risk_level: "low", date: "x" },
    ] });
    const r = await loadStaticRisk(undefined, new Date("2026-11-25T10:00:00Z"));
    expect(r).toHaveLength(1);
    expect(r[0]!.probability).toBe(0.4);
  });
  it("reads the file of the region it was asked for", async () => {
    stub({ date: "2026-11-25", generated_utc: "2026-11-25T05:00:00Z", cells: [{ lat: 9, lon: -1, probability: 0.5, risk_level: "medium", date: "2026-11-25" }] });
    const r = await loadStaticRisk(undefined, new Date("2026-11-25T10:00:00Z"), "gh-north");
    expect(calls).toContain(riskUrl("gh-north"));
    expect(r).toHaveLength(1);
  });
  it("merges every study area in a country", async () => {
    stub({ date: "2026-11-25", generated_utc: "2026-11-25T05:00:00Z", cells: [{ lat: -10, lon: 27, probability: 0.4, risk_level: "medium", date: "2026-11-25" }] });
    const r = await loadStaticRiskForArea({ country: "CD" } as never, undefined, new Date("2026-11-25T10:00:00Z"));
    expect(r).toHaveLength(1);
  });
  it("refuses a file for another UTC day", async () => {
    stub({ date: "2026-11-24", generated_utc: "2026-11-25T01:00:00Z", cells: [] });
    await expect(loadStaticRisk(undefined, new Date("2026-11-25T10:00:00Z"))).rejects.toThrow(/unavailable/);
  });
  it("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(loadStaticRisk()).rejects.toThrow(/404/);
  });
  it("refuses when the manifest is missing or says estimates are not validated", async () => {
    const risk = { date: "2026-11-25", generated_utc: "2026-11-25T05:00:00Z", cells: [{ lat: -10, lon: 27, probability: 0.4, risk_level: "medium", date: "2026-11-25" }] };
    stub(risk, {}, false);
    await expect(loadStaticRisk(undefined, new Date("2026-11-25T06:00:00Z"))).rejects.toThrow(/manifest/);
    stub(risk, { regions: [{ id: "haut-katanga", estimates_available: false, reasons: ["model does not beat all baselines on held-out areas"] }] });
    await expect(loadStaticRisk(undefined, new Date("2026-11-25T06:00:00Z"))).rejects.toThrow(/not validated/);
  });
  it("flags stale metadata", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    expect(isStale({ date: "2026-11-25", generated_utc: "2026-11-25T05:00:00Z" }, now)).toBe(false);
    expect(isStale({ date: "2026-11-24", generated_utc: "2026-11-25T05:00:00Z" }, now)).toBe(true);
    expect(describeFreshness({ date: "2026-11-24", generated_utc: "2026-11-25T05:00:00Z" }, now)).toMatch(/STALE/);
  });
});
