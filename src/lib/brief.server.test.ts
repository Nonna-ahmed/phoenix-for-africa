import { describe, expect, it, vi } from "vitest";
import { handleBrief, handlePlan, AI_DISABLED_MESSAGE } from "./brief.server";

describe("AI is off", () => {
  it("never calls out, even with a leftover Lovable or OpenAI key", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "leftover"); vi.stubEnv("OPENAI_API_KEY", "leftover");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const plan = await handlePlan(new Request("http://x/api/plan", { method: "POST", body: JSON.stringify({ question: "where?" }) }));
    expect([400, 501]).toContain(plan.status);
    const brief = await handleBrief(new Request("http://x/api/brief", { method: "POST", body: "{}" }));
    expect([400, 501]).toContain(brief.status);
    expect(f).not.toHaveBeenCalled();
  });
  it("valid-shaped requests get 501", async () => {
    const { streamAi } = await import("./brief.server");
    const r = await streamAi(new Request("http://x"), "", "");
    expect(r.status).toBe(501);
    expect((await r.json()).error).toBe(AI_DISABLED_MESSAGE);
  });
});
