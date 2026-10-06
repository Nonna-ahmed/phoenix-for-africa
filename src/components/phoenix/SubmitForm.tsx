import { useState, type ReactNode } from "react";
import { ApiHttpError, apiBaseUrl } from "@/services/api/client";
import { Note } from "./ApiState";

export const field = "w-full rounded-sm border bg-background px-3 py-2 text-sm";

/** Shared submit flow: only reports success when the backend actually accepted it. */
export function useSubmit(submit: () => Promise<unknown>, notConnected: string) {
  const [state, setState] = useState<{ s: "idle" | "sending" | "ok" | "err"; msg?: ReactNode }>({ s: "idle" });
  const run = async () => {
    if (!apiBaseUrl()) return setState({ s: "err", msg: notConnected });
    setState({ s: "sending" });
    try { await submit(); setState({ s: "ok" }); }
    catch (e) {
      if (e instanceof ApiHttpError && (e.status === 404 || e.status === 405)) setState({ s: "err", msg: notConnected });
      else if (e instanceof ApiHttpError && e.status === 422) setState({ s: "err", msg: `The backend rejected the submission: ${e.detail ?? "invalid fields"}` });
      else setState({ s: "err", msg: "Unable to submit right now. Please try again." });
    }
  };
  const status = state.s === "ok" ? <Note tone="muted">Submitted and saved by the PHOENIX backend.</Note>
    : state.s === "err" ? <Note tone="error">{state.msg}</Note> : null;
  return { run, sending: state.s === "sending", status, reset: () => setState({ s: "idle" }) };
}
