import { render } from "solid-js/web"
import { GenericTool } from "../../session-ui/src/components/basic-tool"
import rankOutput from "../../../plans/validation/jev-after-rank.json?raw"
import "../src/index.css"

const evidence = "e".repeat(24_000)
const passages = [
  {
    id: "models",
    text: "Model availability and capacity vary by provider configuration.",
    url: "https://docs.typesafe.ai/models",
  },
  {
    id: "conflicting-claim",
    text: "A conflicting source says the reported capability is not available.",
  },
  {
    id: "unrelated",
    text: "This passage describes a different feature.",
  },
]

render(
  () => (
    <main class="w-full min-w-0 p-3 flex flex-col gap-2" data-component="generic-tool-preview">
      <GenericTool
        tool="plugin_jev_rank_evidence_14s5b"
        input={{ query: "Which supplied passage best supports the claim?", passages }}
        output={rankOutput}
      />
      <GenericTool
        tool="jev_triage_failure"
        input={{ evidence: "Expected the session to become idle, but it remained busy after the retry completed." }}
        output={JSON.stringify({ status: "ok", advisory: true, category: "timing", confidence: 0.82 })}
      />
      <GenericTool
        tool="plugin_jev_triage_failure_14s5b"
        input={{ evidence }}
        output={JSON.stringify({ status: "unavailable", reason: "missing_key", message: "No Jev key is configured." })}
      />
      <GenericTool
        tool="jev_rank_evidence"
        input={{ query: "Why did the regression fail?", passages }}
        output={JSON.stringify({ status: "invalid_input", reason: "invalid_input", message: "Input did not match the expected schema." })}
      />
    </main>
  ),
  document.getElementById("root")!,
)
