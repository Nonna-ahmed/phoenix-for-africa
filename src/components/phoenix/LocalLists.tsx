import { ALERTS, DETECTIONS, REPORTS, SHELTERS } from "@/data/registry";
import type { Environment } from "@/data/types";
import { clean } from "@/data/types";
import { AlertCard, DemoBadge, Empty, Section } from "./ui";

type Scope = { countryCode?: string; regionId?: string };
const match = (s: Scope) => (x: { countryCode: string; regionId?: string }) => (!s.countryCode || x.countryCode === s.countryCode) && (!s.regionId || x.regionId === s.regionId);

export function DetectionList(s: Scope) {
  const list = DETECTIONS.filter(match(s));
  return (
    <Section title="Satellite Fire Detections" right={<DemoBadge />}>
      {list.length === 0 ? <Empty /> : <ul className="space-y-2">{list.map((d) => (
        <li key={d.id} className="rounded-sm border-l-4 border-l-fire bg-background/40 p-2 text-sm">
          <div className="font-mono text-xs text-fire">Source: NASA FIRMS · Sensor: {d.sensor} · {d.satellite}</div>
          <div>{d.lat.toFixed(2)}, {d.lon.toFixed(2)} — {d.acqDate} {d.acqTime} UTC</div>
          <div className="text-muted-foreground">Confidence: {d.confidence ?? "not provided"} · FRP: {d.frp ? `${d.frp} MW` : "not provided"}</div>
        </li>))}</ul>}
      <p className="label-mono mt-2">Thermal anomaly — not a confirmed ground fire</p>
    </Section>
  );
}

export function ShelterList(s: Scope) {
  const list = SHELTERS.filter(match(s));
  return (
    <Section title="Shelters & safe locations" right={<DemoBadge />}>
      {list.length === 0 ? <Empty>Shelter data unavailable</Empty> : <ul className="space-y-2">{list.map((x) => (
        <li key={x.id} className="rounded-sm border-l-4 border-l-shelter bg-background/40 p-2 text-sm"><div className="font-medium">{x.name}</div>
          <div className="text-muted-foreground">Capacity {x.capacity ?? "n/a"} · <span className="capitalize">{x.status}</span></div></li>))}</ul>}
    </Section>
  );
}

export function ReportList(s: Scope) {
  const list = REPORTS.filter(match(s));
  return (
    <Section title="Community fire reports" right={<DemoBadge />}>
      {list.length === 0 ? <Empty>No reports</Empty> : <ul className="space-y-2">{list.map((r) => (
        <li key={r.id} className="rounded-sm border-l-4 border-l-report bg-background/40 p-2 text-sm">{r.description}<div className="label-mono">{r.reportedAt}</div></li>))}</ul>}
    </Section>
  );
}

export function AlertList(s: Scope) {
  const list = ALERTS.filter(match(s));
  return <Section title="Alerts">{list.length === 0 ? <Empty>No active alerts</Empty> : <div className="space-y-2">{list.map((a) => <AlertCard key={a.id} a={a} />)}</div>}</Section>;
}

export function EnvPanel({ env }: { env?: Environment }) {
  if (!env) return <Section title="Environmental conditions"><Empty>Environmental data unavailable</Empty></Section>;
  const f = (v: number | null, u: string) => { const c = clean(v); return c === null ? <span className="text-unavailable">Missing</span> : `${c}${u}`; };
  const rows: [string, string, React.ReactNode][] = [
    ["T2M_MAX", "Max temp", f(env.t2mMax, "°C")], ["T2M_MIN", "Min temp", f(env.t2mMin, "°C")], ["RH2M", "Humidity", f(env.rh2m, "%")],
    ["WS2M", "Wind", f(env.ws2m, " m/s")], ["PRECTOTCORR", "Precipitation", f(env.precip, " mm")],
  ];
  return (
    <Section title="Environmental conditions" right={<DemoBadge />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{rows.map(([k, l, v]) => (
        <div key={k} className="rounded-sm bg-background/40 p-2"><div className="label-mono">{k}</div><div className="text-xs text-muted-foreground">{l}</div><div className="font-display text-xl">{v}</div></div>))}</div>
      <p className="label-mono mt-2">NASA POWER · {env.date} · -999 fill values shown as missing</p>
    </Section>
  );
}
