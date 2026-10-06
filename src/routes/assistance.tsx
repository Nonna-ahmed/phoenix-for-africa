import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { COUNTRIES } from "@/data/registry";
import { PageHeader, Section } from "@/components/phoenix/ui";
import { field, useSubmit } from "@/components/phoenix/SubmitForm";
import { postAssistance } from "@/services/api/endpoints";

export const Route = createFileRoute("/assistance")({
  head: () => ({ meta: [
    { title: "Assistance — PHOENIX" }, { name: "description", content: "Request help and find emergency communication options during wildfires." },
    { property: "og:title", content: "Assistance — PHOENIX" }, { property: "og:description", content: "Wildfire emergency assistance." },
  ] }),
  component: Assistance,
});

function Assistance() {
  const [f, setF] = useState({ country: "", description: "", latitude: "", longitude: "" });
  const sub = useSubmit(() => postAssistance({
    country: f.country || undefined, description: f.description.trim(),
    latitude: f.latitude ? Number(f.latitude) : undefined, longitude: f.longitude ? Number(f.longitude) : undefined,
  }), "Assistance requests are not currently connected to the backend. Data unavailable.");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="What can people do?" title="Assistance">If you are in immediate danger, call your national emergency number first.</PageHeader>
      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Request help">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (f.description.trim().length >= 5) void sub.run(); }}>
            <select className={field} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}><option value="">Country</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
            <div className="grid grid-cols-2 gap-2">
              <input className={field} placeholder="Latitude" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} />
              <input className={field} placeholder="Longitude" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} />
            </div>
            <textarea className={field} rows={3} required minLength={5} maxLength={1000} placeholder="What help do you need?" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <button disabled={sub.sending} className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{sub.sending ? "Sending…" : "Send request"}</button>
            {sub.status}
          </form>
        </Section>
        <Section title="Emergency contacts"><p className="text-sm text-muted-foreground">Data unavailable. USSD and voice channels exist in the backend (/ussd, /voice) and are used from phones, not this website.</p></Section>
        <Section title="Stay safe"><ul className="list-disc pl-5 text-sm text-muted-foreground"><li>Move away from smoke, upwind if possible</li><li>Go to a known shelter or open cleared ground</li><li>Keep phone charged; follow official alerts</li></ul></Section>
      </div>
    </div>
  );
}
