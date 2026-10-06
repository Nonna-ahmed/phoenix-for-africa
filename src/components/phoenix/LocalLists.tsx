import type { Environment } from "@/data/types";
import { useAlerts, useFireReports, useFwi, useShelters } from "@/services/api/hooks";
import { ApiState, LiveBadge, Note } from "./ApiState";
import { AlertCard, Section } from "./ui";

type Scope = { countryCode?: string | undefined; regionId?: string | undefined; bbox?: [number, number, number, number] | undefined };
const na = (v: unknown) => (v === null || v === undefined || v === "" ? "Data unavailable" : String(v));

export function DetectionList(_: Scope) {
  return (
    <Section title="Satellite Fire Detections">
      <Note tone="muted">Satellite fire data not connected. NASA FIRMS (VIIRS / MODIS) integration is prepared but no feed or API key is configured yet.</Note>
      <p className="label-mono mt-2">When connected, every detection is shown as “Not a confirmed ground fire”</p>
    </Section>
  );
}

export function ShelterList({ countryCode, regionId }: Scope) {
  if (countryCode && countryCode !== "CD") return <Section title="Shelters & safe locations"><Note tone="muted">Shelter data not currently available for this region.</Note></Section>;
  const q = useShelters({ country: "CD", region: regionId });
  return (
    <Section title="Shelters & safe locations" right={<LiveBadge />}>
      <ApiState q={q}>{(list) => (
        <ul className="max-h-96 space-y-2 overflow-y-auto">{list.map((x) => (
          <li key={x.id} className="rounded-sm border-l-4 border-l-shelter bg-background/40 p-2 text-sm">
            <div className="font-medium">{na(x.name)}</div>
            <div className="text-muted-foreground">Capacity: {na(x.capacity)} · Status: {na(x.status)} · Contact: {na(x.contact)}</div>
            <div className="label-mono">{x.lat.toFixed(3)}, {x.lon.toFixed(3)}{x.region ? ` · ${x.region}` : ""}</div>
          </li>))}</ul>)}
      </ApiState>
    </Section>
  );
}

export function ReportList({ countryCode, regionId }: Scope) {
  const q = useFireReports({ country: countryCode, region: regionId });
  return (
    <Section title="Community fire reports" right={<LiveBadge />}>
      <ApiState q={q} empty="No reports for the selected area.">{(list) => (
        <ul className="space-y-2">{list.map((r) => (
          <li key={r.id} className="rounded-sm border-l-4 border-l-report bg-background/40 p-2 text-sm">{na(r.description)}
            <div className="label-mono">{r.lat.toFixed(3)}, {r.lon.toFixed(3)} · {na(r.reportedAt)}</div></li>))}</ul>)}
      </ApiState>
    </Section>
  );
}

export function AlertList({ countryCode, regionId }: Scope) {
  const q = useAlerts({ country: countryCode, region: regionId });
  return (
    <Section title="Alerts" right={<LiveBadge />}>
      <ApiState q={q} empty="No active alerts">{(list) => <div className="space-y-2">{list.map((a) => <AlertCard key={a.id} a={a} />)}</div>}</ApiState>
    </Section>
  );
}

export function FwiPanel({ countryCode, regionId, bbox }: Scope) {
  const q = useFwi(countryCode ? { country: countryCode, region: regionId, bbox } : null);
  return (
    <Section title="Fire Weather Index (FWI)" right={<LiveBadge />}>
      <ApiState q={q} empty="FWI data currently unavailable." isEmpty={(d) => d === null}>
        {(d) => <div><div className="font-display text-4xl">{d!.value}</div><div className="label-mono">{na(d!.date)}</div></div>}
      </ApiState>
      {q.isError && <p className="mt-1 text-xs text-muted-foreground">FWI data currently unavailable.</p>}
    </Section>
  );
}

export function EnvPanel({ env, date }: { env?: Environment | null | undefined; date?: string | null | undefined }) {
  if (!env) return <Section title="Environmental conditions"><Note tone="muted">Environmental data unavailable</Note></Section>;
  const f = (v: number | null, u: string) => (v === null ? <span className="text-unavailable">Missing</span> : `${v}${u}`);
  const rows: [string, string, React.ReactNode][] = [
    ["T2M_MAX", "Max temp", f(env.t2mMax, "°C")], ["T2M_MIN", "Min temp", f(env.t2mMin, "°C")], ["RH2M", "Humidity", f(env.rh2m, "%")],
    ["WS2M", "Wind", f(env.ws2m, " m/s")], ["PRECTOTCORR", "Precipitation", f(env.precip, " mm")],
  ];
  return (
    <Section title="Environmental conditions" right={<LiveBadge />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{rows.map(([k, l, v]) => (
        <div key={k} className="rounded-sm bg-background/40 p-2"><div className="label-mono">{k}</div><div className="text-xs text-muted-foreground">{l}</div><div className="font-display text-xl">{v}</div></div>))}</div>
      <p className="label-mono mt-2">NASA POWER · {date || env.date || "date unavailable"} · -999 values shown as Missing</p>
    </Section>
  );
}
