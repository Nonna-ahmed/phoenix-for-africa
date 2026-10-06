import type { ReactNode } from "react";
import { ApiHttpError, ApiNotConfiguredError, apiBaseUrl } from "@/services/api/client";

interface Q<T> { data?: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }

/** Loading / success / empty / error / not-configured states for API data. */
export function ApiState<T>({ q, empty = "No data available for the selected area.", isEmpty, children }: {
  q: Q<T>; empty?: ReactNode; isEmpty?: (d: T) => boolean; children: (d: T) => ReactNode;
}) {
  if (!apiBaseUrl()) return <Note tone="muted">Backend not connected — set VITE_API_BASE_URL to load live PHOENIX data.</Note>;
  if (q.isLoading) return <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading live data…</div>;
  if (q.isError) {
    const e = q.error;
    const detail = e instanceof ApiHttpError ? `${e.status === 404 ? "Endpoint not available" : `HTTP ${e.status}`} (${e.path})` : e instanceof ApiNotConfiguredError ? "Backend URL missing" : "Network error";
    return (
      <Note tone="error">
        Unable to retrieve current data. Please try again. <span className="label-mono">{detail}</span>
        <button onClick={() => q.refetch()} className="ml-2 underline">Retry</button>
      </Note>
    );
  }
  if (q.data === undefined || q.data === null || (isEmpty ? isEmpty(q.data) : Array.isArray(q.data) && q.data.length === 0)) return <Note tone="muted">{empty}</Note>;
  return <>{children(q.data)}</>;
}

export function Note({ tone, children }: { tone: "muted" | "error"; children: ReactNode }) {
  return <p className={`rounded-sm border border-dashed p-3 text-sm ${tone === "error" ? "border-destructive/60 text-destructive" : "text-muted-foreground"}`}>{children}</p>;
}

export function LiveBadge() {
  return <span className="label-mono rounded-sm border border-risk-low/40 px-1.5 py-0.5 text-risk-low">Live API</span>;
}
