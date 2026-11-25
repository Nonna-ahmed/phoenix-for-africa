#!/usr/bin/env bash
# Free, no key. Run from the folder you want the data in (the scripts expect ./raw and ./data).
set -euo pipefail
mkdir -p raw data
for y in 2020 2021 2022 2023 2024 2025; do
  curl -fL -o raw/n20_$y.csv "https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/$y/viirs-jpss1_${y}_Democratic_Republic_of_the_Congo.csv"
done
