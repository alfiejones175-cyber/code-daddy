import { rankEvidence } from "../../packages/jev/src/evaluator"
import { loadSettings } from "../../packages/jev/src/settings"

// Advisory claim checks over exact local source ranges; run from the repository root.
const cases = [
  { id: "generic-output", claim: "Unknown tools rendered through GenericTool have no output details even though the caller passes output.", ranges: [["packages/session-ui/src/components/basic-tool.tsx", 323, 345], ["packages/session-ui/src/components/message-part.tsx", 1610, 1630]] },
  { id: "generic-args", claim: "GenericTool args includes whole string values without a character limit; its slice only caps the number of arguments.", ranges: [["packages/session-ui/src/components/basic-tool.tsx", 299, 345]] },
  { id: "v2-stubs", claim: "V2 session compact and wait remain unavailable operations for existing sessions, with Server translating their errors into service-unavailable responses.", ranges: [["packages/core/src/session.ts", 465, 472], ["packages/server/src/handlers/session.ts", 251, 299]] },
  { id: "v2-concurrency", claim: "The shown V2 provider event loop starts tool settlement in a FiberSet without a per-turn tool concurrency limit; the one-permit semaphore serializes event publication instead.", ranges: [["packages/core/src/session/runner/llm.ts", 263, 315]] },
  { id: "strict-schemas", claim: "OpenAI Responses tool preparation always sets strict to false for the shown function tools; direct callers cannot opt into strict schemas here.", ranges: [["packages/llm/src/protocols/openai-responses.ts", 245, 270], ["packages/llm/test/provider/openai-responses.test.ts", 110, 135]] },
  { id: "skipped-diff-test", claim: "The sorted hierarchical file row rendering test is explicitly skipped; its ordering assertions do not execute during the normal suite.", ranges: [["packages/tui/test/cli/tui/diff-viewer-file-tree.test.tsx", 29, 72]] },
  { id: "fake-workspaces", claim: "The BlackWorkspace component uses fabricated workspace IDs and navigates to routes built from those IDs.", ranges: [["packages/console/app/src/routes/black/workspace.tsx", 26, 46], ["packages/console/app/src/routes/black/workspace.tsx", 180, 212]] },
  { id: "uri-negative-control", claim: "The shown ToolOutput.toResultValue implementation rejects unresolved URI content with an error.", ranges: [["packages/llm/src/schema/messages.ts", 90, 112]] },
] satisfies { id: string; claim: string; ranges: [string, number, number][] }[]
const settings = await loadSettings()
if (!settings.apiKey) throw new Error("Jev is not configured")
const results = []
for (const item of cases) {
  const text = (await Promise.all(item.ranges.map(async ([path, start, end]) => {
    const lines = (await Bun.file(path).text()).split("\n")
    return `${path}:${start}-${end}\n${lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join("\n")}`
  }))).join("\n\n")
  if (text.includes(settings.apiKey)) throw new Error("Credential detected in evidence")
  const input = { query: "Check the supplied narrow code claim against the exact source evidence. Treat code comments as claims to verify against implementation, not authoritative behavior. Do not infer runtime reachability that is not shown.", claim: item.claim, passages: [{ id: item.id, text }] }
  const result = await rankEvidence(input, settings)
  results.push({ ranges: item.ranges, input, result })
  await Bun.write("plans/validation/jev-audit-claims.json", JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2) + "\n")
  console.log(JSON.stringify({ id: item.id, result }))
}
