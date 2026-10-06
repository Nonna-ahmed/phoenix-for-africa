import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { COUNTRIES } from "@/data/registry";
import { RiskMap } from "@/components/phoenix/RiskMap";
import { ShelterList } from "@/components/phoenix/LocalLists";
import { PageHeader } from "@/components/phoenix/ui";

export const Route = createFileRoute("/shelters")({
  head: () => ({ meta: [
    { title: "Shelters & Safe Locations — PHOENIX" }, { name: "description", content: "Verified emergency shelters and potential safe locations, with their data sources." },
    { property: "og:title", content: "Shelters & Safe Locations — PHOENIX" }, { property: "og:description", content: "Find shelters and safe locations in Africa." },
  ] }),
  component: Shelters,
});

const sel = "rounded-sm border bg-card px-2 py-1.5 text-sm";

function Shelters() {
  const [country, setCountry] = useState("CD");
  const [region, setRegion] = useState("haut-katanga");
  const c = COUNTRIES.find((x) => x.code === country);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Safe locations" title="Shelters & safe locations">Confirmed emergency shelters are kept separate from schools, health facilities and settlements. Always confirm with local authorities.</PageHeader>
      <div className="flex flex-wrap gap-3">
        <label className="label-mono flex flex-col gap-1">Country
          <select className={sel} value={country} onChange={(e) => { setCountry(e.target.value); setRegion(""); }}>
            {COUNTRIES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select></label>
        <label className="label-mono flex flex-col gap-1">{c?.regionLabel ?? "Region"}
          <select className={sel} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Whole country</option>
            {c?.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></label>
      </div>
      <RiskMap countryCode={country} regionId={region || undefined} layers={{ risk: false, fires: false, shelters: true, reports: false, boundaries: true }} height={460} />
      <ShelterList countryCode={country} regionId={region || undefined} />
    </div>
  );
}
