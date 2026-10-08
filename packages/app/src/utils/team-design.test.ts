import { expect, test } from "bun:test"
import { generateTeamDraft, TeamDraftError } from "./team-design"

const draft = {
  name: "invoice-team",
  team: {
    lead: "build",
    model: "openai/gpt-6-astra",
    roles: { review: { agent: "general", model: "openrouter/example/fast", skills: ["testing"] } },
  },
}

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol} drafting preserves provider scope, chosen design model and editable member models`, async () => {
    const calls: { url: URL; init?: RequestInit }[] = []
    const result = await generateTeamDraft({
      goal: "Design invoice matching",
      model: { providerID: "openai", modelID: "gpt-6-astra" },
      providers: ["openrouter"],
      directory: "/global config",
      serverSDK: {
        protocol: Promise.resolve(protocol),
        server: { type: "http", http: { url: "http://localhost:4096", password: "fixture" } },
      },
      fetch: async (input, init) => {
        calls.push({ url: new URL(String(input)), init })
        return Response.json(draft)
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].url.pathname).toBe(protocol === "v1" ? "/team/draft" : "/api/team/draft")
    expect(calls[0].url.searchParams.get(protocol === "v1" ? "directory" : "location[directory]")).toBe(
      "/global config",
    )
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      goal: "Design invoice matching",
      model: { providerID: "openai", modelID: "gpt-6-astra" },
      providers: ["openrouter"],
    })
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe(`Basic ${btoa("opencode:fixture")}`)
    expect(result.team.roles.review.model).toBe("openrouter/example/fast")
    expect(result.team.roles.review.skills).toEqual(["testing"])
  })
}

test("draft failures preserve safe categories without displaying arbitrary provider response content", async () => {
  for (const reason of ["invalid", "unavailable", "timeout", "generation"] as const) {
    const result = generateTeamDraft({
      goal: "Design invoice matching",
      model: { providerID: "openai", modelID: "gpt-6-astra" },
      directory: "/global",
      serverSDK: { protocol: Promise.resolve("v1"), server: { type: "http", http: { url: "http://localhost:4096" } } },
      fetch: async () =>
        Response.json({ service: `team_draft_${reason}`, message: "private provider detail" }, { status: 503 }),
    })
    await expect(result).rejects.toBeInstanceOf(TeamDraftError)
    await expect(result).rejects.toMatchObject({ reason, message: reason })
  }
})
