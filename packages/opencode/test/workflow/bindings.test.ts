import { expect, test } from "bun:test"
import type { Json } from "effect/Schema"
import { WorkflowBindings } from "../../src/workflow/bindings"

const context = { input: "Find open issues", outputs: { research: "Two issues", "review-2": "Accepted", empty: "" } }

test("binds exact and embedded input and completed step outputs recursively", () => {
  const input = {
    exact: "{{input}}",
    combined: "Request: {{ input }}; results: {{steps.research}} / {{steps.review-2}}",
    nested: [{ output: "{{steps.empty}}" }, null, true, 42],
    literal: "Keep {{unknown}} unchanged",
  }
  expect(WorkflowBindings.bind(input, context)).toEqual({
    exact: "Find open issues",
    combined: "Request: Find open issues; results: Two issues / Accepted",
    nested: [{ output: "" }, null, true, 42],
    literal: "Keep {{unknown}} unchanged",
  })
  expect(input.exact).toBe("{{input}}")
})

test("missing and inherited output references fail instead of interpolating empty text", () => {
  for (const name of ["missing", "constructor", "__proto__"])
    expect(() => WorkflowBindings.bind({ value: `{{steps.${name}}}` }, context)).toThrow(WorkflowBindings.BindingError)
})

test("replacements are not recursively interpreted or evaluated", () => {
  expect(
    WorkflowBindings.bind(
      { text: "{{input}} / {{steps.research}}" },
      { input: "{{steps.missing}}", outputs: { research: "${process.env.SECRET}; {{input}}" } },
    ),
  ).toEqual({ text: "{{steps.missing}} / ${process.env.SECRET}; {{input}}" })
})

test("object keys remain literal and special keys do not alter object prototypes", () => {
  const arguments_ = Object.fromEntries([
    ["{{input}}", "{{steps.research}}"],
    ["__proto__", { polluted: true }],
    ["constructor", "unchanged"],
  ])
  const bound = WorkflowBindings.bind(arguments_, context)
  expect(Object.keys(bound)).toEqual(["{{input}}", "__proto__", "constructor"])
  expect(Object.getPrototypeOf(bound)).toBe(Object.prototype)
  expect(Object.hasOwn(bound, "__proto__")).toBe(true)
  expect(Object.hasOwn({}, "polluted")).toBe(false)
  expect(bound["{{input}}"]).toBe("Two issues")
})

test("binding rejects excessive nesting and expansion before producing oversized arguments", () => {
  const nested: { value: Json } = { value: "end" }
  Array.from({ length: 65 }).forEach(() => {
    nested.value = [nested.value]
  })
  expect(() => WorkflowBindings.bind(nested, context)).toThrow("nested")
  expect(() =>
    WorkflowBindings.bind({ text: "{{input}}".repeat(11) }, { input: "x".repeat(100_000), outputs: {} }),
  ).toThrow("1 MB")
})
