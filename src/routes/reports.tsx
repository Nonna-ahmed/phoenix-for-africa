import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { COUNTRIES } from "@/data/registry";
import { ReportList } from "@/components/phoenix/LocalLists";
import { PageHeader, Section } from "@/components/phoenix/ui";
import { field, useSubmit } from "@/components/phoenix/SubmitForm";
import { postFireReport } from "@/services/api/endpoints";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [
    { title: "Fire Reports — PHOENIX" }, { name: "description", content: "Community-submitted wildfire reports across Africa." },
    { property: "og:title", content: "Fire Reports — PHOENIX" }, { property: "og:description", content: "Report a fire to PHOENIX." },
  ] }),
  component: Reports,
});

const schema = z.object({
  country: z.string().min(1),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  datetime: z.string().min(1),
  description: z.string().trim().min(5, "Describe what you see (5+ characters)").max(1000),
});

function Reports() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ country: "", latitude: "", longitude: "", datetime: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const sub = useSubmit(async () => {
    const d = schema.parse(form);
    await postFireReport({ ...d, datetime: new Date(d.datetime).toISOString() });
    await qc.invalidateQueries({ queryKey: ["fire-reports"] });
  }, "Fire report submission is not currently connected to the backend.");

  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setForm((f) => ({ ...f, latitude: p.coords.latitude.toFixed(5), longitude: p.coords.longitude.toFixed(5) })));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Community" title="Fire Reports">Reports are unverified until reviewed. No personal information is collected.</PageHeader>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Report a fire">
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            const r = schema.safeParse(form);
            if (!r.success) return setError(r.error.issues[0]?.message ?? "Check the form");
            setError(null); void sub.run();
          }}>
            <select className={field} value={form.country} onChange={set("country")} required><option value="" disabled>Country</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
            <div className="grid grid-cols-2 gap-2">
              <input className={field} inputMode="decimal" placeholder="Latitude" value={form.latitude} onChange={set("latitude")} required />
              <input className={field} inputMode="decimal" placeholder="Longitude" value={form.longitude} onChange={set("longitude")} required />
            </div>
            <button type="button" onClick={locate} className="text-sm text-primary underline">Use my location</button>
            <input className={field} type="datetime-local" value={form.datetime} onChange={set("datetime")} required />
            <textarea className={field} rows={3} placeholder="What do you see?" value={form.description} onChange={set("description")} required />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button disabled={sub.sending} className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{sub.sending ? "Submitting…" : "Submit report"}</button>
            {sub.status}
          </form>
        </Section>
        <ReportList />
      </div>
    </div>
  );
}
