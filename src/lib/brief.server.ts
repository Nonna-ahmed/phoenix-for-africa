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
  clusters: z.array(z.object({ cellLat: z.number(), cellLon: z.number(), count: z.number(), maxFrp: nn })).max(8),
  soilMoisture: stat,
  spatialSample: z.object({
    method: z.string(), points: z.number(), pointsWithData: z.object({ landCover: z.number(), elevation: z.number(), density: z.number() }),
    landCoverShare: z.record(z.string(), z.number()),
    elevationM: z.object({ min: nn, max: nn, mean: nn }),
    densityPerKm2: z.object({ min: nn, max: nn, mean: nn, median: nn }),
    highDensityPoints: z.array(z.object({ lat: z.number(), lon: z.number(), densityPerKm2: z.number() })).max(5),
    slope: z.string(), retrievedAt: z.string(),
  }).nullable(),
  infrastructure: z.object({ hospitals: z.number().nullable(), roadSegments: z.number().nullable() }),
  aiRisk: z.string(),
  sources: z.array(z.object({ name: z.string(), provider: z.string(), status: z.string(), latestDate: z.string().nullable(), latency: z.string() })).max(12),
});
export type BriefInputT = z.infer<typeof BriefInput>;

const COMMON_RULES = `Rules:
- Use ONLY the data in the JSON. Never invent fire locations, fire counts, weather, population, terrain, land cover, shelters, hospitals, roads, evacuation routes, casualties or fire severity. If a field is null or a source status is not "ok", write "Data unavailable" for it and continue with the other sources.
- Cite the source for every important fact in parentheses, e.g. (NASA FIRMS), (NASA POWER), (WorldPop), (NASA SRTM), (Esri/Impact Observatory land cover), (OpenStreetMap).
- State the selected time range and, for each source, its latest data date. NASA POWER values are from the latest published day (a few days old) — never describe them as current or real-time conditions.
- NASA FIRMS hotspots are satellite thermal anomalies, NOT confirmed fires. Hotspot FRP is in MW; times are UTC. Soil moisture is 0 (dry) to 1 (saturated).
- Population values are modelled estimates (WorldPop), never exact counts. OpenStreetMap completeness varies; hospitals are not shelters; roads are not approved evacuation routes.
- This text is AI-generated decision support, NOT a wildfire-risk prediction. Never present a risk level unless a PHOENIX AI risk prediction is provided.
- Never state that a location is safe and never recommend an evacuation route. Use cautious language: "Consider reviewing…", "Potential priority area…", "Requires field verification…".
- Never produce percentages, probabilities or confidence scores (e.g. "90% safe", "85% chance of containment") that are not in the JSON.`;

const INSTRUCTIONS = `You write wildfire response briefs (decision support) for emergency coordinators in Africa (PHOENIX platform).
${COMMON_RULES}
- Population, elevation and land cover come from a regular grid of sample points across the region (spatialSample): describe ranges/shares across those points, never as exact totals; population is estimated density (people/km²), never a count. Slope is not aggregated.
- Do not infer fuel type or fire behaviour from land cover alone; do not call soil moisture a drought index; do not call an area dangerous because one layer is high; never issue evacuation orders.
Use Markdown with exactly these sections:
  ## 1. Situation summary (3-5 bullets; include the selected time range)
  ## 2. Observed satellite hotspots (count, trend by day, clusters, strongest detections; state they are thermal anomalies, not confirmed ground fires)
  ## 3. Environmental conditions (weather and soil moisture, ranges across cells, data date and latency)
  ## 4. Population exposure & terrain/land (density range, high-density sample points, elevation range, land-cover shares)
  ## 5. Infrastructure & recommended actions (hospitals/roads with caveats; then 5-8 numbered cautious actions: verification first, monitoring, access, coordination with authorities)
  ## 6. Data gaps & sources (missing sources, coverage limits, one line per source with date)
Keep it under 500 words.`;

const nn2 = z.number().nullable();
export const PlanInput = z.object({
  question: z.string().trim().min(3).max(600),
  area: z.object({ label: z.string(), bbox: z.array(z.number()).length(4), areaKm2: z.number() }),
  weather: z.array(stat).max(8),
  samples: z.object({
    points: z.number(), pointValues: z.array(z.object({ lat: z.number(), lon: z.number(), landCover: z.string().nullable(), elevationM: nn2, densityPerKm2: nn2 })).max(9), landCoverCounts: z.record(z.string(), z.number()),
    elevationM: z.object({ min: nn2, max: nn2 }), densityPerKm2: z.object({ min: nn2, max: nn2, mean: nn2 }),
    retrievedAt: z.string(),
  }).nullable(),
  sources: z.array(z.object({ name: z.string(), provider: z.string(), status: z.string(), latestDate: z.string().nullable(), latency: z.string() })).max(12),
});
export type PlanInputT = z.infer<typeof PlanInput>;

const PLAN_INSTRUCTIONS = `You help emergency planners in Africa prepare for wildfires (PHOENIX platform). Answer the planner's question about the selected map area using only the data provided.
${COMMON_RULES}
- Land cover, elevation and population density come from a 3x3 grid of sample points across the area — say so; they describe those points, not every location.
- There is no time range: weather/soil are the latest published NASA POWER day. You may name sample-point coordinates as potential priority areas.
- If the question cannot be answered from the data, say what is missing instead of guessing.
Use Markdown with these sections:
  ## Answer (2-4 sentences directly answering the question)
  ## What the data shows (bullets, each with source and date)
  ## Preparedness insights (4-7 numbered, cautious, actionable)
  ## Data limitations
  ## Data sources
Keep it under 450 words.`;

export async function handleBrief(request: Request): Promise<Response> {
  let input: BriefInputT;
  try { input = BriefInput.parse(await request.json()); }
  catch { return Response.json({ error: "Invalid brief request." }, { status: 400 }); }
  return streamAi(request, INSTRUCTIONS, `Write the response brief from this PHOENIX data (JSON):\n${JSON.stringify(input)}`);
}

export async function handlePlan(request: Request): Promise<Response> {
  let input: PlanInputT;
  try { input = PlanInput.parse(await request.json()); }
  catch { return Response.json({ error: "Invalid planning request. The question must be 3–600 characters." }, { status: 400 }); }
  const { question, ...data } = input;
  return streamAi(request, PLAN_INSTRUCTIONS, `Planner's question: ${question}\n\nPHOENIX data for the selected area (JSON):\n${JSON.stringify(data)}`);
}

async function streamAi(request: Request, instructions: string, prompt: string): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ error: "AI is not configured for this app." }, { status: 500 });

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY, apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses(MODEL),
    instructions,
    messages: [{ role: "user", content: prompt }],
    abortSignal: request.signal,
    providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } },
  });
  // Plain-text stream; a failure is appended as a single marker line the page turns into an error message.
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") c.enqueue(enc.encode(part.text));
          else if (part.type === "error") throw part.error;
        }
      } catch (err) {
        const e = err as { statusCode?: number; message?: string; name?: string };
        if (e?.name !== "AbortError") {
          const status = e?.statusCode ?? 500;
          console.error("brief AI error", status, e?.message);
          const msg = status === 402 ? "AI credits are used up. Add credits in Settings → Plans & credits, then try again."
            : status === 429 ? "The AI service is busy. Please wait a minute and try again."
            : status === 403 ? "AI access is blocked for this workspace (limit or policy). A workspace admin can review it."
            : "The AI answer could not be generated. Please try again later.";
          c.enqueue(enc.encode(`\n[[PHOENIX_ERROR:${msg}]]`));
        }
      } finally { c.close(); }
    },
  });
  return withLovableAiGatewayRunIdHeader(new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }), runIdFetch);
}
