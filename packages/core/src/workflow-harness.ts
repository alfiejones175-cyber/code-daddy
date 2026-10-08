export * as WorkflowHarness from "./workflow-harness"

import { createHash } from "node:crypto"
import { Workflow } from "@opencode-ai/schema/workflow"

export type Task = Extract<Workflow.Node, { kind: "task" | "computer" }>

// Placement and display labels do not alter a task's execution contract.
export function nodeFingerprint(node: Task) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        node.id,
        node.kind,
        node.prompt,
        node.model.providerID,
        node.model.modelID,
        node.skills,
        node.mcpServers,
      ]),
    )
    .digest("hex")
}

export function fingerprint(node: Task, spec: Workflow.HarnessSpec) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        nodeFingerprint(node),
        spec.model.providerID,
        spec.model.modelID,
        spec.instructions,
        spec.modelReason,
        [...spec.allowedTools].sort(),
        spec.timeoutSeconds,
        spec.maxOutputChars,
        spec.outputFormat,
        [...spec.requiredJsonKeys].sort(),
        spec.checklist,
      ]),
    )
    .digest("hex")
}

export function valid(spec: Workflow.HarnessSpec) {
  return (
    !!spec.instructions.trim() &&
    !!spec.model.providerID.trim() &&
    !!spec.model.modelID.trim() &&
    spec.checklist.every((item) => !!item.trim()) &&
    spec.allowedTools.every((item) => !!item.trim()) &&
    spec.requiredJsonKeys.every((item) => !!item.trim()) &&
    new Set(spec.allowedTools).size === spec.allowedTools.length &&
    new Set(spec.requiredJsonKeys).size === spec.requiredJsonKeys.length &&
    (spec.outputFormat === "json" || !spec.requiredJsonKeys.length)
  )
}
