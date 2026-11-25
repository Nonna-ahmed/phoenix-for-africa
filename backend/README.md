# PHOENIX backend pilot (experimental): Haut-Katanga daily satellite-detection risk

Free, key-free. No server: a daily job writes `public/data/risk-haut-katanga.json`, the site reads it.
Read `MODEL_CARD.md` first (what it predicts, footprint, honest results and limits).

## Reproduce (from this folder's parent)
```sh
pip install -r backend/requirements.txt pytest
bash backend/download_firms.sh        # about 900 MB of NOAA-20 VIIRS yearly files, no key
python backend/fetch_power.py          # NASA POWER weather, 90 points, resumable (rerun if it prints "budget")
python backend/build_dataset.py        # fire + weather arrays
python backend/train.py                # trains, evaluates (2025 test, held-out areas), writes data/results.json and backend/model.txt
python -m pytest backend/tests -q      # leakage and alignment tests
python backend/predict.py              # daily job: writes public/data/risk-haut-katanga.json
```

## Timing contract (same in training, evaluation and serving)
For target UTC day D: fire inputs use detections up to D-1; weather inputs use days up to D-3 (NASA POWER publication lag); day of year is D. Nothing from D or later is used.
`backend/tests/test_features.py` flips all fire data from D onward and replaces all weather newer than D-3, and checks the features do not change.
If NASA POWER has not yet published day D-3, `predict.py` stops and keeps the previous file.
