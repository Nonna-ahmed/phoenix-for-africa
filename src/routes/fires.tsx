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
      <PageHeader eyebrow="NASA FIRMS · VIIRS / MODIS" title="Satellite Hotspots">“Where has satellite data detected a thermal anomaly?” Hotspots are not confirmed ground fires — confirmation comes only from verified ground reports.</PageHeader>
      <RiskMap show={["fires", "reports"]} initialLayers={{ reports: false }} height={460} />
      <DetectionList />
    </div>
  ),
});
