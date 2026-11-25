# Run PHOENIX on your own computer (VS Code), free

Everything here is free. You do not need Lovable to run, edit or build the project.

## 1. Install once
- [VS Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/downloads)
- [Bun](https://bun.sh) (use Bun, not npm: `npm install` currently fails on this project)
- [Python 3.10+](https://www.python.org/downloads/) (only for the prediction backend)

## 2. Get the project
```sh
git clone https://github.com/Nonna-ahmed/phoenix-for-africa.git
cd phoenix-for-africa
code .
```

## 3. Run the website
In the VS Code terminal:
```sh
bun install
bun run dev
```
Open the address it prints (usually http://localhost:8080 or 8081).
The experimental risk map reads `public/data/risk-haut-katanga.json`. No backend server and no keys are needed for that layer.

Other commands: `bun run test`, `bun run build`, `npx tsc --noEmit` (type check).

## 4. Update the risk file yourself (optional)
```sh
pip install -r backend/requirements.txt
python backend/predict.py
```
It downloads free NASA data and rewrites `public/data/risk-haut-katanga.json`. Re-training steps are in `backend/README.md`.

## 5. Optional settings (copy `.env.example` to `.env`)
- `FIRMS_MAP_KEY`: free key from NASA FIRMS. Only needed for the live "Active Fires" page on your computer.
- `VITE_API_BASE_URL`: only if you later run your own prediction server. Leave empty to use the static file.
- AI Brief and AI Planner depend on the Lovable AI gateway and stay off outside Lovable. Nothing is sent anywhere unless you add your own provider later.

## 6. Free hosting
The site builds for Cloudflare Workers (free plan). The daily GitHub Action in `.github/workflows/daily-risk.yml` refreshes the risk file for free on a public repository.
