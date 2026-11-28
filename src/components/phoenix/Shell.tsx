import { useEffect } from "react";
import { loadManifestRegions, describeRegionsFreshness } from "@/services/staticRisk";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

const MAIN = [["/", "Dashboard"], ["/map", "Risk map"], ["/countries", "Countries"], ["/alerts", "Alerts"], ["/shelters", "Shelters"]] as const;
const MORE = [["/fires", "Active fires"], ["/reports", "Fire reports"], ["/assistance", "Assistance"], ["/brief", "AI brief"], ["/plan", "AI planner"], ["/pipeline", "Model data"], ["/models", "Models & data"], ["/data-sources", "Data sources"], ["/about", "About"]] as const;
const NAV = [
  ["/", "Dashboard"], ["/map", "Africa Risk Map"], ["/countries", "Countries"], ["/alerts", "Alerts"], ["/fires", "Active Fires"],
  ["/shelters", "Shelters"], ["/reports", "Fire Reports"], ["/assistance", "Assistance"], ["/brief", "AI Brief"], ["/plan", "AI Planner"], ["/pipeline", "Model Data"], ["/models", "Models & Data"], ["/data-sources", "Data Sources"], ["/about", "About"],
] as const;

function RiskFreshness() {
  const [info, setInfo] = useState<string>("Risk file: loading…");
  const [stale, setStale] = useState(false);
  useEffect(() => {
    loadManifestRegions()
      .then((regions) => { const f = describeRegionsFreshness(regions); setInfo(f.text); setStale(f.stale); })
      .catch(() => { setInfo("Risk files: unavailable"); setStale(true); });
  }, []);
  return <strong className={stale ? "text-destructive" : ""}> {info}</strong>;
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[1000] border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-risk-high font-display text-lg font-bold text-primary-foreground">P</span>
            <span className="leading-tight"><span className="block font-display text-lg font-semibold tracking-tight">Phoenix</span><span className="label-mono hidden sm:block">Wildfire early warning</span></span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {MAIN.map(([to, label]) => (
              <Link key={to} to={to} activeOptions={{ exact: to === "/" }} className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "bg-primary/15 text-primary font-medium" }}>{label}</Link>
            ))}
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-full px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground">More ▾</summary>
              <div className="absolute right-0 mt-2 w-48 rounded-lg border bg-popover p-1 shadow-xl">
                {MORE.map(([to, label]) => <Link key={to} to={to} className="block rounded-md px-3 py-1.5 text-sm hover:bg-accent">{label}</Link>)}
              </div>
            </details>
          </nav>
          <button className="label-mono ml-auto rounded-md border px-3 py-1.5 lg:hidden" onClick={() => setOpen(!open)}>Menu</button>
        </div>
        <nav className={`${open ? "flex" : "hidden"} mx-auto max-w-7xl flex-col gap-1 px-4 pb-3 lg:hidden`}>
          {NAV.map(([to, label]) => <Link key={to} to={to} onClick={() => setOpen(false)} className="rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent" activeProps={{ className: "bg-accent text-foreground" }}>{label}</Link>)}
        </nav>
      </header>
      <div className="border-b bg-primary/10 px-4 py-1.5 text-center text-xs text-primary">
        Experimental: daily satellite-detection risk for 13 study areas across Africa, each with its own tested model, drawn inside country borders. They are not administrative boundaries. Hotspots are satellite detections, not confirmed ground fires. <RiskFreshness />
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        PHOENIX — satellite detections are thermal anomalies, not confirmed ground fires. In an emergency, contact local authorities.
      </footer>
    </div>
  );
}
