import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { COUNTRIES } from "@/data/registry";
import { ReportList } from "@/components/phoenix/LocalLists";
import { PageHeader, Section } from "@/components/phoenix/ui";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [
    { title: "Fire Reports — PHOENIX" }, { name: "description", content: "Community-submitted wildfire reports across Africa." },
    { property: "og:title", content: "Fire Reports — PHOENIX" }, { property: "og:description", content: "Report a fire to PHOENIX." },
  ] }),
  component: Reports,
});

const field = "w-full rounded-sm border bg-background px-3 py-2 text-sm";

function Reports() {
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Community" title="Fire Reports">Reports are unverified until reviewed.</PageHeader>
      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Report a fire">
          {sent ? <p className="text-sm">Thank you. Report submission is a preview — storage is not connected yet.</p> : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
              <select className={field} required defaultValue=""><option value="" disabled>Country</option>{COUNTRIES.map((c) => <option key={c.code}>{c.name}</option>)}</select>
              <input className={field} placeholder="Location / nearest town" required />
              <textarea className={field} rows={3} placeholder="What do you see?" required />
              <button className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Submit report</button>
            </form>)}
        </Section>
        <ReportList />
      </div>
    </div>
  );
}
