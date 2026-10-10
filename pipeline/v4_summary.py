"""Writes phoenix_pipeline/v4_satellite_observation/v4_summary.md from v4_final_report.json (no new computation)."""
import json, os
D = os.path.join(os.environ.get("PHX_BASE", "./data/phoenix_pipeline"), "v4_satellite_observation")
r = json.load(open(f"{D}/v4_final_report.json")); C = r["countries"]; A, O = r["combined_all_rows"], r["combined_observable_rows_only"]
f = lambda n: f"{n:,}"
L = ["# PHOENIX v4 — satellite observation validity (data only, no model trained)", "",
     "## 1. Data sources",
     f"- Target fires: NASA FIRMS VIIRS S-NPP (v3 definition, nominal/high confidence). Standard processing to 2026-06-30, near-real-time after (flagged per row in `firms_product_status`).",
     f"- Observation validity: {r['product']['long_name']} (DOI {r['product']['doi']}), {r['product']['resolution_m']} m sinusoidal grid, NASA LP DAAC, Earthdata token. Granule list, production IDs and download status: `granule_manifest_*.csv`, `download_log_*.json`, `source_manifest.json`. Raw window cut-outs of the FireMask: `raw_vnp14a1_*.npz`.",
     "- Predictors: carried unchanged from v3 (v2 for DR Congo) — weather/soil D-3, NDVI by publication date, year-matched land cover, terrain, districts.", "",
     "## 2. Product interpretation",
     "- VNP14IMG (375 m swath) has the per-pixel fire mask, but no per-pixel latitude/longitude. Placing it on the ground needs VNP03IMG (~200 MB per 6-minute granule, ~30,000 granules for this scope).",
     f"- {r['why_vnp14a1_not_vnp14img_swath']}",
     "- FireMask classes: " + "; ".join(f"{k} {v}" for k, v in r["fire_mask_classes"].items()) + ".",
     "- Observed surface = 3, 5, 7, 8, 9. Cloud = 4. Invalid = 0, 1, 2, 6. The daily value combines all S-NPP overpasses that day.", "",
     "## 3. Observation-validity method",
     "- Each 1 km cell is sampled with 10 × 10 sub-points; each sub-point falls in one VNP14A1 pixel → area fraction per class (about 4 pixels intersect a cell).",
     "- Kept per cell/day: observation_coverage_fraction, cloud_obscured_fraction, invalid_fraction, VNP14A1 fire fractions, pixel counts, observation_quality.",
     f"- {r['observation_rule']} No tuned threshold: any cloudy or invalid part of a cell could hide a fire.", "",
     "## 4. Target labels",
     "- FIRE_DETECTED: qualifying FIRMS detection in the cell that day (unchanged).",
     "- NO_FIRE_CONFIRMED: no FIRMS detection, the whole cell observed, and no VNP14A1 fire pixel of any confidence touching it.",
     "- INSUFFICIENT_OBSERVATION: any other no-detection day with data (clouds, partial view, or a fire pixel on the edge without a FIRMS point inside).",
     "- MISSING: no VNP14A1 granule for that tile and date.",
     "- satellite_fire_occurrence = 1 / 0 / empty accordingly. VNP14A1 fields are never predictors.", "",
     "## 5. Country statistics", "",
     "| Country | Region | Fire | Confirmed no-fire | Insufficient | Missing | % confirmed | Fire rate (observable) | Fire dates | Cells burned | Readiness |",
     "|---|---|---|---|---|---|---|---|---|---|---|"]
for c in C:
    L.append(f"| {c['country']} | {c['admin1']} | {f(c['FIRE_DETECTED'])} | {f(c['NO_FIRE_CONFIRMED'])} | {f(c['INSUFFICIENT_OBSERVATION'])} | {f(c['MISSING'])} | {c['pct_no_fire_confirmed']}% | {c['positive_rate_among_observable']*100:.3f}% | {c['fire_dates']} | {c['cells_ever_burned']} | {c['readiness']} |")
L += ["", f"Each area: 900 cells × 2,465 days = 2,218,500 cell-days. {r['readiness_rule']}", "",
      "## 6. Combined candidate dataset (`v4_combined_candidate_dataset.parquet`, not rebalanced)",
      f"- All rows: {f(A['rows'])} — fire {f(A['FIRE_DETECTED'])}, confirmed no-fire {f(A['NO_FIRE_CONFIRMED'])}, insufficient {f(A['INSUFFICIENT_OBSERVATION'])}, missing {f(A['MISSING'])}.",
      f"- Observable rows only: {f(O['rows'])}; fire rate {O['positive_rate_among_observable']*100:.3f}%.",
      f"- Country share of observable rows: " + ", ".join(f"{k} {v}%" for k, v in O["country_contribution_pct"].items()),
      f"- Season share of observable rows: " + ", ".join(f"{k} {v}%" for k, v in O["season_contribution_pct"].items()), "",
      "## 7. Seasonal observation bias"]
for c in C:
    L.append(f"- {c['country']}: {c['seasonal_bias_flag']}. Days with no valid cell: {c['days_with_no_valid_cell']}.")
L += ["- Rainy-season months are clearly under-represented among confirmed no-fire labels; the model data must keep month/season and should be checked for this bias.", "",
      "## 8. Missingness",
      "- MISSING (no VNP14A1 granule that day) is about 2.2–2.5% per area. v3 predictor missingness is unchanged (see the v3 report).", "",
      "## 9. Leakage audit (600 random rows per area)"]
for c in C:
    l = c["leakage"]; L.append(f"- {c['country']}: {'PASS' if l['passed'] else 'FAIL'} — mismatches {sum(l['mismatches'].values())}, predictor values changed vs v3: {l['predictor_values_changed_vs_v3']}.")
L += ["", "## 10. FIRMS consistency"]
for c in C:
    k = c["consistency"]; L.append(f"- {c['country']}: {'PASS' if k['passed'] else 'FAIL'} — confirmed no-fire with a FIRMS fire: {k['no_fire_confirmed_with_firms_fire']}; fire without a FIRMS record: {k['fire_detected_without_firms_record']}; FIRMS fires where VNP14A1 also shows a fire pixel: {k['diagnostic_fire_detected_vnp14a1_fire_class_present_pct']}%.")
L += ["", "## 11. Readiness", *[f"- {c['country']}: {c['readiness']}" for c in C], "",
      "## 12. Remaining limitations", *[f"- {x}" for x in r["limitations"]],
      "- FIRMS fires and VNP14A1 fire pixels agree only partly (see 10), because they are different processing levels with different geolocation. The fire target stays FIRMS-based as specified.",
      "- Confirmed no-fire labels come mainly from the dry season.", "",
      "## 13. Recommended next step",
      "- Review the seasonal bias, then decide the training design: time-based split, keep month/season, and evaluate per season and per country. No model has been trained."]
open(f"{D}/v4_summary.md", "w").write("\n".join(L)); print("written", len(L))
