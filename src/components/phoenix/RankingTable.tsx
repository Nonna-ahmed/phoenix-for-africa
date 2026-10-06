import { COUNTRIES } from "@/data/registry";
import { useRegionSummary } from "@/services/api/hooks";
import { apiBaseUrl } from "@/services/api/client";
import { Note } from "./ApiState";
import { RegionLink, RiskPill } from "./ui";

const REGIONS = COUNTRIES.flatMap((c) => c.regions.filter((r) => r.modelId).map((r) => ({ country: c, region: r })));

export function RankingTable() {
  if (!apiBaseUrl()) return <Note tone="muted">Backend not connected — ranking appears once live predictions are available.</Note>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="label-mono text-left">{["Country", "Region", "Risk (max)", "Fire detections", "Last update"].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>{REGIONS.map(({ country, region }) => <Row key={region.id} country={country} region={region} />)}</tbody>
      </table>
      <p className="label-mono mt-2">Live API · regions with a backend model only</p>
    </div>
  );
}

function Row({ country, region }: (typeof REGIONS)[number]) {
  const s = useRegionSummary(country.code, region);
  return (
    <tr className="border-t">
      <td className="py-2 pr-3">{country.name}</td>
      <td className="pr-3 font-medium"><RegionLink code={country.code} id={region.id}>{region.name}</RegionLink></td>
      <td className="pr-3">{s.q.isLoading ? <span className="text-muted-foreground">Loading…</span> : s.q.isError ? <span className="text-destructive">Unavailable</span> : <RiskPill p={s.maxProbability} />}</td>
      <td className="pr-3 text-muted-foreground">Not connected</td>
      <td className="font-mono text-muted-foreground">{s.latestDate ?? "—"}</td>
    </tr>
  );
}
