import { DETECTIONS, rankedRegions } from "@/data/registry";
import { RegionLink, RiskPill } from "./ui";

export function RankingTable({ limit }: { limit?: number }) {
  const rows = rankedRegions().slice(0, limit);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="label-mono text-left">{["#", "Country", "Region", "Risk", "Fire detections", "Last update"].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(({ country, region }, i) => (
            <tr key={region.id} className="border-t">
              <td className="py-2 pr-3 font-mono text-muted-foreground">{i + 1}</td>
              <td className="pr-3">{country.name}</td>
              <td className="pr-3 font-medium"><RegionLink code={country.code} id={region.id}>{region.name}</RegionLink></td>
              <td className="pr-3"><RiskPill p={region.probability} /></td>
              <td className="pr-3 font-mono">{DETECTIONS.filter((d) => d.regionId === region.id).length}</td>
              <td className="font-mono text-muted-foreground">{region.lastUpdate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="label-mono mt-2">Only regions with a validated model are ranked · demo values</p>
    </div>
  );
}
