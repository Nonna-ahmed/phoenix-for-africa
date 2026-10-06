import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { MapProps } from "./RiskMap.client";

const Inner = lazy(() => import("./RiskMap.client"));

export function RiskMap(props: MapProps) {
  const fallback = <div style={{ height: props.height ?? 520 }} className="animate-pulse rounded-md border bg-muted" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}><Inner {...props} /></Suspense>
    </ClientOnly>
  );
}

export function MapLegend() {
  const items: [string, string][] = [["bg-risk-high", "High risk ≥65%"], ["bg-risk-medium", "Medium 35–65%"], ["bg-risk-low", "Low <35%"], ["bg-fire", "Satellite Fire Detection"], ["bg-shelter", "Shelter"], ["bg-report", "Fire report"]];
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${c}`} />{l}</span>)}
    </div>
  );
}
