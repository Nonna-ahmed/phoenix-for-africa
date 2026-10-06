import { createFileRoute } from "@tanstack/react-router";
import { RiskMap } from "@/components/phoenix/RiskMap";
import { DetectionList } from "@/components/phoenix/LocalLists";
import { PageHeader } from "@/components/phoenix/ui";

export const Route = createFileRoute("/fires")({
  head: () => ({ meta: [
    { title: "Active Fire Detections — PHOENIX" }, { name: "description", content: "Satellite-derived thermal anomalies (NASA FIRMS VIIRS/MODIS) across Africa." },
    { property: "og:title", content: "Active Fire Detections — PHOENIX" }, { property: "og:description", content: "Satellite fire detections across Africa." },
  ] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader eyebrow="NASA FIRMS · VIIRS / MODIS" title="Satellite Fire Detections">“Where has satellite data detected a thermal anomaly?” Detections can have multiple causes and are not confirmed fires.</PageHeader>
      <RiskMap layers={{ risk: false, fires: true, shelters: false, reports: false, boundaries: true }} height={460} />
      <DetectionList />
    </div>
  ),
});
