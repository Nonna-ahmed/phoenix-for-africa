import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

const NAV = [
  ["/", "Dashboard"], ["/map", "Africa Risk Map"], ["/countries", "Countries"], ["/alerts", "Alerts"], ["/fires", "Active Fires"],
  ["/shelters", "Shelters"], ["/reports", "Fire Reports"], ["/assistance", "Assistance"], ["/models", "Models & Data"], ["/about", "About"],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[1000] border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-sm bg-primary font-display font-bold text-primary-foreground">P</span>
            <span className="font-display text-lg font-semibold tracking-tight">PHOENIX</span>
            <span className="label-mono hidden sm:inline">Africa Wildfire Early Warning</span>
          </Link>
          <button className="label-mono rounded-sm border px-2 py-1 lg:hidden" onClick={() => setOpen(!open)}>Menu</button>
        </div>
        <nav className={`${open ? "flex" : "hidden"} mx-auto max-w-7xl flex-col gap-1 px-4 pb-3 lg:flex lg:flex-row lg:flex-wrap lg:pb-2`}>
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} activeOptions={{ exact: to === "/" }}
              className="rounded-sm px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground" }}>{label}</Link>
          ))}
        </nav>
      </header>
      <div className="border-b bg-primary/10 px-4 py-1.5 text-center text-xs text-primary">
        Real data coverage: Algeria & DRC via the PHOENIX backend. Satellite hotspots: NASA FIRMS live (not confirmed ground fires).
      </div>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">
        PHOENIX — satellite detections are thermal anomalies, not confirmed ground fires. In an emergency, contact local authorities.
      </footer>
    </div>
  );
}
