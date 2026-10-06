import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { riskLevel, type Availability, type DataStatus } from "@/data/types";
import type { ApiAlert } from "@/services/api/endpoints";
import { cn } from "@/lib/utils";

export function DemoBadge() {
  return <span className="label-mono rounded-sm border border-primary/40 px-1.5 py-0.5 text-primary">Demo data</span>;
}

export function RiskPill({ p }: { p?: number | null | undefined }) {
  if (p === undefined || p === null) return <span className="label-mono rounded-sm bg-muted px-2 py-1">AI prediction n/a</span>;
  const lvl = riskLevel(p);
  const c = lvl === "HIGH" ? "bg-risk-high/20 text-risk-high" : lvl === "MEDIUM" ? "bg-risk-medium/20 text-risk-medium" : "bg-risk-low/20 text-risk-low";
  return <span className={cn("rounded-sm px-2 py-1 font-mono text-xs font-semibold", c)}>{lvl} · {Math.round(p * 100)}%</span>;
}

const availStyle: Record<Availability, string> = { available: "text-risk-low", limited: "text-risk-medium", unavailable: "text-unavailable" };
export function DataStatusGrid({ status }: { status: DataStatus }) {
  const rows: [string, Availability][] = [["AI Model", status.aiModel], ["Satellite", status.satellite], ["Environmental", status.environmental], ["Shelters", status.shelters], ["Alerts", status.alerts]];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
      {rows.map(([k, v]) => (
        <div key={k}><div className="label-mono">{k}</div><div className={cn("text-sm capitalize", availStyle[v])}>● {v}</div></div>
      ))}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="label-mono">{label}</div>
      <div className={cn("mt-1 font-display text-3xl font-semibold", tone)}>{value}</div>
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border bg-card/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

export function Empty({ children = "Data unavailable" }: { children?: ReactNode }) {
  return <p className="rounded-sm border border-dashed p-3 text-sm text-muted-foreground">{children}</p>;
}

export function AlertCard({ a }: { a: ApiAlert }) {
  const det = a.kind === "detection";
  return (
    <div className={cn("rounded-md border-l-4 bg-card p-3", det ? "border-l-fire" : "border-l-risk-high")}>
      <span className={cn("font-mono text-xs font-bold tracking-wider", det ? "text-fire" : "text-risk-high")}>{det ? "◉ " : "▲ "}{a.title}</span>
      <div className="mt-1 font-semibold">{[a.region, a.country].filter(Boolean).join(", ") || "Location unavailable"}</div>
      {a.probability !== null && <div className="text-sm">Risk Probability: {Math.round(a.probability * 100)}%</div>}
      {a.message && <p className="text-sm text-muted-foreground">{a.message}</p>}
      <div className="label-mono mt-1">{a.issuedAt ?? "Time unavailable"}</div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <div className="label-mono text-primary">{eyebrow}</div>
      <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-muted-foreground">{children}</div>}
    </header>
  );
}

export function RegionLink({ code, id, children }: { code: string; id: string; children: ReactNode }) {
  return <Link to="/country/$countryCode/region/$regionId" params={{ countryCode: code, regionId: id }} className="hover:text-primary">{children}</Link>;
}
