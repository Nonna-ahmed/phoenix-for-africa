import { describe, expect, it } from "vitest";
import { toApiAlerts, type StaticAlertsDoc } from "./staticAlerts";

const now = new Date("2026-11-28T12:00:00Z");
const doc: StaticAlertsDoc = {
  status: "ok",
  generated_utc: "2026-11-28T06:00:00+00:00",
  alerts: [
    { id: "risk-gh-north-2026-11-28", type: "risk", severity: "high", title: "HIGH SATELLITE-DETECTION RISK", message: "3 of 72 cells at high", region_id: "gh-north", region: "Northern Ghana", country: "Ghana", country_code: "GH", probability: 0.71, date: "2026-11-28", issued_at: "2026-11-28T06:00:00", stale: false },
    { id: "det-haut-katanga-2026-11-28", type: "detection", severity: "info", title: "SATELLITE DETECTIONS", message: "5 hotspots", region_id: "haut-katanga", region: "Haut-Katanga", country: "Democratic Republic of Congo", country_code: "CD", probability: null, date: "2026-11-28", issued_at: "2026-11-28T06:00:00", stale: false },
  ],
};

describe("toApiAlerts", () => {
  it("maps static alerts to ApiAlert and filters by country and region", () => {
    const all = toApiAlerts(doc, {}, now);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ kind: "risk", probability: 0.71, country: "Ghana", region: "Northern Ghana" });
    expect(all[1]).toMatchObject({ kind: "detection", probability: null });
    expect(toApiAlerts(doc, { country: "GH" }, now)).toHaveLength(1);
    expect(toApiAlerts(doc, { country: "CD", region: "haut-katanga" }, now)[0]?.id).toBe("det-haut-katanga-2026-11-28");
    expect(toApiAlerts(doc, { country: "CD", region: "gh-north" }, now)).toHaveLength(0);
  });
  it("rejects stale or invalid files instead of showing nothing as all-clear", () => {
    expect(() => toApiAlerts({ status: "ok", generated_utc: "2026-11-25T00:00:00Z", alerts: [] }, {}, now)).toThrow(/stale/);
    expect(() => toApiAlerts({ status: "error", alerts: [] }, {}, now)).toThrow(/invalid/i);
    expect(() => toApiAlerts({ status: "ok", alerts: [] }, {}, now)).toThrow(/stale/);
  });
});
