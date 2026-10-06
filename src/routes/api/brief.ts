import { createFileRoute } from "@tanstack/react-router";
import { handleBrief } from "@/lib/brief.server";

export const Route = createFileRoute("/api/brief")({
  server: { handlers: { POST: ({ request }) => handleBrief(request) } },
});
