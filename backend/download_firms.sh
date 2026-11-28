#!/usr/bin/env bash
# Free, no key. Run from the folder you want the data in (the scripts expect ./raw and ./data).
# Region comes from backend/regions.json: REGION=haut-katanga ./backend/download_firms.sh
set -euo pipefail
REGION="${REGION:-haut-katanga}"
HERE="$(cd "$(dirname "$0")" && pwd)"
read -r COUNTRY SAT Y0 Y1 <<<"$(python3 - "$HERE" "$REGION" <<'PY'
import sys, json
d = json.load(open(sys.argv[1] + '/regions.json')); r = d[sys.argv[2]]
ys = r['train_years'] + [r['val_year'], r['test_year']]
print(r['firms_country_archive'], r['firms_archive_sat'], min(ys), max(ys))
PY
)"
mkdir -p raw data
for y in $(seq "$Y0" "$Y1"); do
  curl -fL -o "raw/n20_$y.csv" "https://firms.modaps.eosdis.nasa.gov/data/country/${SAT}/${y}/${SAT}_${y}_${COUNTRY}.csv"
done
