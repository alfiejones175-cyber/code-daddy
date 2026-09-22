import { expect, test } from "bun:test"
import { SourcePolicy } from "../../src/provider/source-policy"

test("preserves an authenticated provider source when custom options extend it", () => {
  expect(SourcePolicy.patch({ source: "custom", existing: true })).toEqual({})
})

test("records source changes for authentication and configuration", () => {
  expect(SourcePolicy.patch({ source: "env", existing: true })).toEqual({ source: "env" })
  expect(SourcePolicy.patch({ source: "api", existing: true })).toEqual({ source: "api" })
  expect(SourcePolicy.patch({ source: "config", existing: true })).toEqual({ source: "config" })
})

test("marks a custom provider when it is its first source", () => {
  expect(SourcePolicy.patch({ source: "custom", existing: false })).toEqual({ source: "custom" })
})
