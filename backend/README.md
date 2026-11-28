# PHOENIX backend: 13 study areas, each with its own tested model

Free, key-free. No server: a daily job writes `public/data/risk-<region>.json` per study area and
`public/data/regions-manifest.json`, and the site reads those files. Read `MODEL_CARD.md` for the
Haut-Katanga pilot (what it predicts, honest results and limits).

## Study areas

`backend/regions.json` holds one entry per study area: bounding box, cell size, FIRMS country archive,
train/validation/test years, POWER grid, output paths. The pilot is `haut-katanga` (0.25 degree cells,
2020-2023 train); the other twelve use 0.5 degree cells and 2021-2023 train:

| Region id | Study area | Country |
|---|---|---|
| `ao-moxico` | Moxico & Bie | Angola |
| `zm-central` | Central & Lusaka | Zambia |
| `mz-zambezia` | Zambezia & Nampula | Mozambique |
| `tz-ruvuma` | Ruvuma & Mtwara | Tanzania |
| `ng-middle-belt` | Niger & Kwara | Nigeria |
| `gh-north` | Northern Ghana | Ghana |
| `sn-groundnut` | Groundnut Basin | Senegal |
| `cm-adamawa` | Adamawa | Cameroon |
| `mg-west` | Western Madagascar | Madagascar |
| `za-limpopo` | Limpopo | South Africa |
| `zw-mashonaland` | Mashonaland | Zimbabwe |
| `et-south` | Southern Ethiopia | Ethiopia |

A study area is a rectangle, not an administrative boundary, and can include neighbouring areas.

## Reproduce (from the repository root)

```sh
pip install -r backend/requirements.txt
python backend/download_data.py                  # FIRMS country archives 2021-2025, shared per country
REGION=gh-north python backend/fetch_power.py     # POWER daily weather on the region's grid (resumable)
REGION=gh-north python backend/build_dataset.py   # fire + weather arrays -> data/arrays-gh-north.npz
REGION=gh-north python backend/train.py           # tests every candidate, keeps one, writes results-gh-north.json
REGION=gh-north python backend/predict.py         # writes public/data/risk-gh-north.json
python backend/manifest.py                        # writes public/data/regions-manifest.json
python backend/refresh.py                         # what the daily job runs: all regions + hotspots + publish check
```

## How the model for a region is chosen

`train.py` fits five families on the same rows: LightGBM, LightGBM without weather, HistGradientBoosting,
RandomForest and LogisticRegression, plus three baselines (fire in the last 7 days, fire yesterday,
day-of-year climatology). Training is 2021-2023, validation 2024, test 2025, and 1-degree blocks are held
out of fitting entirely, so every score is on areas the model never saw.

Selection: highest PR-AUC on held-out areas, but a model only replaces a cheaper one when it wins by more
than 0.003 (differences under that are noise here). Only models that need no weather data can ship: NASA
POWER publishes 4-6 days late, so a model that needs weather cannot always produce today's risk. The
weather models are still fitted and reported in the results file and on `/models`.

Every region's kept model is required to beat all three baselines; if it does not, the manifest withholds
that region and the site shows no estimate for it rather than a number.

## Timing contract (same in training, evaluation and serving)

For target UTC day D: fire inputs use detections up to D-1; weather inputs, when used, use days up to D-3;
day of year is D. Nothing from D or later is used. `backend/tests/test_features.py` flips all fire data from
D onward and replaces all weather newer than D-3, and checks the features do not change. If a model needs
weather and POWER has not published day D-3, `predict.py` stops and keeps the previous file.
