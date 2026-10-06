import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "./ai/run-id.server";

const MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const nn = z.number().nullable();
const stat = z.object({ label: z.string(), unit: z.string(), min: nn, mean: nn, max: nn, cells: z.number(), cellsWithValues: z.number(), date: z.string().nullable() }).nullable();
export const BriefInput = z.object({
  area: z.object({ country: z.string(), region: z.string().nullable(), bbox: z.array(z.number()).length(4) }),
  timeRange: z.object({ days: z.number().int().min(1).max(5), label: z.string() }),
  hotspots: z.object({
    status: z.string(), total: z.number(), shown: z.number(),
    byConfidence: z.record(z.string(), z.number()),
    byDay: z.record(z.string(), z.number()),
    strongest: z.array(z.object({ lat: z.number(), lon: z.number(), frp: nn, date: z.string(), confidence: z.string().nullable(), instrument: z.string() })).max(15),
  }),
  weather: z.array(stat).max(8),
  site: z.object({
    point: z.array(z.number()).length(2),
    landCover: z.string().nullable(), elevationM: nn, slopeDeg: nn,
    population: nn, populationAreaKm2: nn, populationDensity: nn, soilMoistureRoot: nn, soilMoistureDate: z.string().nullable(),
  }).nullable(),
  infrastructure: z.object({ hospitals: z.number().nullable(), roadSegments: z.number().nullable() }),
  aiRisk: z.string(),
});
export type BriefInputT = z.infer<typeof BriefInput>;

const INSTRUCTIONS = `You write wildfire response briefs for emergency coordinators in Africa (PHOENIX platform).
Rules:
- Use ONLY the data in the JSON. Never invent numbers, places, shelters, roads or facilities. If a field is null or unavailable, say "data unavailable".
- NASA FIRMS hotspots are satellite thermal anomalies, NOT confirmed fires (can be agricultural burning, gas flares). Say so.
- Population figures are modelled estimates (WorldPop), never exact counts. Weather values are NASA POWER grid-cell values with a few days' delay.
- Hospitals/roads come from OpenStreetMap (completeness varies). Hospitals are not shelters. Roads are not approved evacuation routes.
- Do not present any AI risk prediction unless provided.
- Be concise and actionable. Use Markdown with these sections:
  ## Situation summary (3-5 bullets)
  ## Hotspot activity (counts, trend by day, strongest detections with coordinates)
  ## Conditions (weather and dryness: what they mean for fire spread)
  ## Exposure (people, terrain, land cover, hospitals, roads)
  ## Recommended actions (5-8 numbered, prioritized, concrete; include ground-verification of strongest hotspots)
  ## Data gaps & caveats
Keep it under 450 words.`;

export async function handleBrief(request: Request): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ error: "AI is not configured for this app." }, { status: 500 });
  let input: BriefInputT;
  try { input = BriefInput.parse(await request.json()); }
  catch { return Response.json({ error: "Invalid brief request." }, { status: 400 }); }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY, apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  let failure: { status: number; message: string } | null = null;
  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: `Write the response brief from this PHOENIX data (JSON):\n${JSON.stringify(input)}` }],
    abortSignal: request.signal,
    providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } },
    onError: ({ error }) => {
      const e = error as { statusCode?: number; message?: string };
      failure = { status: e.statusCode ?? 500, message: e.message ?? "AI request failed" };
      console.error("brief AI error", e.statusCode, e.message);
    },
  });
  void failure;
  return withLovableAiGatewayRunIdHeader(result.toTextStreamResponse({ headers: { "Cache-Control": "no-store" } }), runIdFetch);
}
