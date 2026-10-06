/**
 * Central PHOENIX FastAPI client. The base URL comes only from
 * VITE_API_BASE_URL — never hard-code it.
 */
export class ApiNotConfiguredError extends Error {
  constructor() { super("VITE_API_BASE_URL is not set"); this.name = "ApiNotConfiguredError"; }
}
export class ApiHttpError extends Error {
  constructor(public status: number, public path: string, public detail?: string) {
    super(`HTTP ${status} on ${path}`); this.name = "ApiHttpError";
  }
}

export function apiBaseUrl(): string | null {
  const v = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.trim();
  return v ? v.replace(/\/+$/, "") : null;
}

type Query = Record<string, string | number | undefined>;

function url(path: string, q?: Query) {
  const base = apiBaseUrl();
  if (!base) throw new ApiNotConfiguredError();
  const u = new URL(base + path);
  Object.entries(q ?? {}).forEach(([k, v]) => v !== undefined && u.searchParams.set(k, String(v)));
  return u.toString();
}

async function handle(res: Response, path: string) {
  if (!res.ok) {
    let detail: string | undefined;
    try { const j = await res.json(); detail = typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail ?? j); } catch { /* ignore */ }
    throw new ApiHttpError(res.status, path, detail);
  }
  return res.json() as Promise<unknown>;
}

export async function apiGet(path: string, q?: Query, signal?: AbortSignal) {
  return handle(await fetch(url(path, q), { signal: signal ?? null, headers: { Accept: "application/json" } }), path);
}

export async function apiPost(path: string, body: unknown) {
  return handle(await fetch(url(path), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }), path);
}
