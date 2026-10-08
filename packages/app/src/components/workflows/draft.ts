import type { Workflow } from "@opencode-ai/schema/workflow"
import { unwrap } from "solid-js/store"

export function cloneWorkflowDefinition(definition: Workflow.Definition) {
  // Saved definitions come from a Solid store; browser structuredClone rejects
  // its proxies. Unwrap before cloning so draft edits stay isolated from saved data.
  return structuredClone(unwrap(definition))
}
