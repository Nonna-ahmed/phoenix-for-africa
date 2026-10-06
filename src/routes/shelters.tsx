import { createFileRoute } from "@tanstack/react-router";
import { RiskMap } from "@/components/phoenix/RiskMap";
import { ShelterList } from "@/components/phoenix/LocalLists";
import { PageHeader } from "@/components/phoenix/ui";

export const Route = createFileRoute("/shelters")({
  head: () => ({ meta: [
    { title: "Shelters — PHOENIX" }, { name: "description", content: "Shelters and safe gathering points during wildfire emergencies." },
    { property: "og:title", content: "Shelters — PHOENIX" }, { property: "og:description", content: "Find wildfire shelters in Africa." },
  ] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader eyebrow="Safe locations" title="Shelters">Shelter coverage is limited to supported countries. Always confirm with local authorities.</PageHeader>
      <RiskMap layers={{ risk: false, fires: false, shelters: true, reports: false, boundaries: true }} height={420} />
      <ShelterList />
    </div>
  ),
});
