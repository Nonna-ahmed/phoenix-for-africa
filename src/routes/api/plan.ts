import { createFileRoute } from "@tanstack/react-router";
import { handlePlan } from "@/lib/brief.server";

export const Route = createFileRoute("/api/plan")({
  server: { handlers: { POST: ({ request }) => handlePlan(request) } },
});
