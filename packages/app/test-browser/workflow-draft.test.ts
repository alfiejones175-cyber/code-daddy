import { expect, test } from "bun:test"
import { createStore, unwrap } from "solid-js/store"
import type { Workflow } from "@opencode-ai/schema/workflow"
import { cloneWorkflowDefinition } from "@/components/workflows/draft"

test("selecting a saved Solid workflow creates an isolated editable draft", () => {
  const definition: Workflow.Definition = {
    version: 1,
    id: "workflow_one",
    name: "Saved workflow",
    description: "",
    directory: "/project",
    updatedAt: 1,
    nodes: [
      { id: "start", kind: "start", name: "Start", x: 0, y: 0 },
      {
        id: "tool",
        kind: "mcp",
        name: "Read",
        x: 240,
        y: 0,
        server: "files",
        tool: "read",
        arguments: { path: "README.md" },
      },
    ],
    edges: [{ id: "edge", from: "start", to: "tool" }],
  }
  const [saved] = createStore({ definitions: [definition] })
  // This test must use Solid's browser implementation to exercise the failure.
  expect(() => structuredClone(saved.definitions[0])).toThrow()
  const draft = cloneWorkflowDefinition(saved.definitions[0])
  expect(draft).toEqual(unwrap(saved.definitions[0]))
  expect(draft.nodes[1]).not.toBe(unwrap(saved.definitions[0].nodes[1]))
  Object.assign(draft, { name: "Edited draft" })
  Object.assign(draft.nodes[1], { name: "Edited tool" })
  const tool = draft.nodes.find((node) => node.kind === "mcp")
  if (!tool || tool.kind !== "mcp") throw new Error("Missing tool node")
  Object.assign(tool.arguments, { path: "CHANGELOG.md" })
  expect(saved.definitions[0].name).toBe("Saved workflow")
  expect(saved.definitions[0].nodes[1].name).toBe("Read")
  const original = saved.definitions[0].nodes.find((node) => node.kind === "mcp")
  expect(original?.kind === "mcp" && original.arguments.path).toBe("README.md")
})
