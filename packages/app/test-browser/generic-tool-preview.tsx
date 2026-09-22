import { render } from "solid-js/web"
import { GenericTool } from "../../session-ui/src/components/basic-tool"
import rankOutput from "../../../plans/validation/jev-after-rank.json?raw"
import "../src/index.css"

const evidence = "e".repeat(24_000)

render(
  () => (
    <main class="w-full min-w-0 p-3 flex flex-col gap-2" data-component="generic-tool-preview">
      <GenericTool
        tool="plugin_jev_rank_evidence_14s5b"
        input={{ question: "Which supplied passage best supports the claim?", passages: "Three supplied passages" }}
        output={rankOutput}
      />
      <GenericTool
        tool="plugin_jev_triage_failure_14s5b"
        input={{ evidence }}
        output={JSON.stringify({ status: "unavailable", reason: "missing_key", message: "No Jev key is configured." })}
      />
      <GenericTool
        tool="jev_triage_failure"
        input={{ evidence: "missing expected failure details" }}
        output={JSON.stringify({ status: "invalid_input", reason: "invalid_input", message: "Input did not match the expected schema." })}
      />
    </main>
  ),
  document.getElementById("root")!,
)
