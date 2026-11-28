import { useEffect, useState } from "react";
import { COUNTRIES } from "@/data/registry";
import { loadStaticRisk, STATIC_REGION_IDS } from "@/services/staticRisk";
import { RegionLink } from "./ui";

interface Row { id: string; name: string; country: string; code: string; cells: number; high: number; medium: number; peak: number }

const AREAS = COUNTRIES.flatMap((c) => c.regions.filter((r) => STATIC_REGION_IDS.includes(r.id)).map((r) => ({ c, r })));

export function useAreaRanking() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(AREAS.map(async ({ c, r }): Promise<Row | null> => {
      try {
        const pts = await loadStaticRisk(undefined, new Date(), r.id);
        const p = pts.map((x) => x.probability ?? 0);
        if (!p.length) return null;
        return { id: r.id, name: r.name, country: c.name, code: c.code, cells: p.length, high: p.filter((x) => x >= 0.65).length, medium: p.filter((x) => x >= 0.35 && x < 0.65).length, peak: Math.max(...p) };
      } catch { return null; }
    })).then((x) => { if (live) setRows(x.filter((y): y is Row => !!y).sort((a, b) => b.high / b.cells - a.high / a.cells || b.peak - a.peak)); });
    return () => { live = false; };
  }, []);
  return rows;
}

export function TopAreas({ rows, limit = 6 }: { rows: Row[] | null; limit?: number }) {
  if (!rows) return <p className="text-sm text-muted-foreground">Loading today's estimates…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">Today's estimates are not available yet. Nothing is shown as low risk when data is missing.</p>;
  return (
    <ol className="space-y-2">
      {rows.slice(0, limit).map((r, i) => {
        const hi = (r.high / r.cells) * 100, me = (r.medium / r.cells) * 100;
        return (
          <li key={r.id} className="rounded-lg border bg-card/60 p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <RegionLink code={r.code} id={r.id}><span className="font-semibold">{r.name}</span></RegionLink>
                <span className="ml-2 text-xs text-muted-foreground">{r.country}</span>
              </div>
              <span className="font-mono text-sm font-semibold text-risk-high">{hi.toFixed(0)}% <span className="text-xs font-normal text-muted-foreground">high</span></span>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
              <div className="bg-risk-high" style={{ width: `${hi}%` }} />
              <div className="bg-risk-medium" style={{ width: `${me}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
