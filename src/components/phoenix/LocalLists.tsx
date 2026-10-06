import type { PowerParam } from "@/lib/power.functions";
import { usePower, useAlerts, useFireReports, useFwi, useHotspots, useShelters } from "@/services/api/hooks";
import { scopeBbox } from "@/data/registry";
import { ApiState, LiveBadge, Note } from "./ApiState";
import { AlertCard, Section } from "./ui";

type Scope = { countryCode?: string | undefined; regionId?: string | undefined; bbox?: [number, number, number, number] | undefined };
const na = (v: unknown) => (v === null || v === undefined || v === "" ? "Data unavailable" : String(v));

export function DetectionList({ countryCode, regionId }: Scope) {
  const q = useHotspots(scopeBbox(countryCode, regionId), 1);
  const d = q.data;
  return (
    <Section title="Satellite Hotspots (NASA FIRMS)" right={d?.status === "ok" ? <LiveBadge /> : undefined}>
      <p className="mb-2 rounded-sm bg-fire/10 p-2 text-xs text-fire">Hotspots are satellite-detected thermal anomalies. They can come from wildfires, agricultural burning, gas flares or hot surfaces — <b>not a confirmed ground fire</b>.</p>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading satellite data…</p>
        : q.isError ? <Note tone="error">Unable to retrieve current data. Please try again.</Note>
        : !d || d.status === "not_configured" ? <Note tone="muted">Satellite fire data not connected.</Note>
        : d.status === "error" ? <Note tone="error">{d.message}</Note>
        : d.hotspots.length === 0 ? <Note tone="muted">No hotspots detected in the last 24 hours for this area.</Note>
        : (<>
          <div className="label-mono mb-2">{d.total.toLocaleString()} hotspots · last 24 h{d.truncated ? ` · showing strongest ${d.hotspots.length.toLocaleString()}` : ""}</div>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">{[...d.hotspots].sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0)).slice(0, 50).map((h, i) => (
            <li key={i} className="rounded-sm border-l-4 border-dashed border-l-fire bg-background/40 p-2 text-sm">
              <div className="font-mono text-xs text-fire">NASA FIRMS · {h.instrument}{h.satellite ? ` · ${h.satellite}` : ""} · unconfirmed</div>
              <div>{h.lat.toFixed(3)}, {h.lon.toFixed(3)} — {h.acqDate} {h.acqTime} UTC</div>
              <div className="text-muted-foreground">Confidence: {na(h.confidence)} · FRP: {h.frp !== null ? `${h.frp} MW` : "Data unavailable"}</div>
            </li>))}</ul>
        </>)}
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
          <li key={r.id} className={`rounded-sm border-l-4 bg-background/40 p-2 text-sm ${r.confirmed ? "border-l-destructive" : "border-l-report"}`}>
            <div className={`label-mono ${r.confirmed ? "text-destructive" : ""}`}>{r.confirmed ? "Confirmed ground fire" : "Unverified report"}</div>{na(r.description)}
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

export function EnvPanel({ point }: { point?: [number, number] | undefined }) {
  const q = usePower(point);
  const d = q.data;
  const f = (v: number | null | undefined, u: string) => (v === null || v === undefined ? <span className="text-unavailable">Missing</span> : `${v}${u}`);
  const rows: [PowerParam, string, string][] = [["T2M_MAX", "Max temp", "°C"], ["T2M_MIN", "Min temp", "°C"], ["T2M", "Mean temp", "°C"], ["RH2M", "Humidity", "%"], ["WS2M", "Wind", " m/s"], ["PRECTOTCORR", "Precipitation", " mm"], ["ALLSKY_SFC_SW_DWN", "Solar radiation", " kWh/m²"]];
  return (
    <Section title="Environmental conditions" right={d?.status === "ok" ? <LiveBadge /> : undefined}>
      {!point ? <Note tone="muted">Environmental data unavailable</Note>
        : q.isLoading ? <p className="text-sm text-muted-foreground">Loading NASA POWER data…</p>
        : q.isError || d?.status === "error" ? <Note tone="error">{d?.message ?? "Unable to retrieve current data. Please try again."}</Note>
        : !d?.latest ? <Note tone="muted">No data available for the selected area.</Note>
        : (<>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{rows.map(([k, l, u]) => (
            <div key={k} className="rounded-sm bg-background/40 p-2"><div className="label-mono">{k}</div><div className="text-xs text-muted-foreground">{l}</div><div className="font-display text-xl">{f(d.latest!.values[k], u)}</div></div>))}</div>
          <p className="label-mono mt-2">Source: NASA POWER · {d.dataset} · day {d.latest.date} · point {d.lat}, {d.lon} · retrieved {d.retrievedAt.slice(0, 16).replace("T", " ")} UTC</p>
          <p className="mt-1 text-xs text-muted-foreground">NASA POWER publishes with a few days' delay; more recent days are missing (-999) and shown as Missing. Weather inputs only — this is not a risk prediction.</p>
        </>)}
    </Section>
  );
}
