import { expect, test } from "bun:test"
import { openRouterPrice } from "./openrouter-price"

test("shows both OpenRouter rates in USD per million tokens", () => {
  expect(openRouterPrice({ id: "example/model", provider: { id: "openrouter" }, cost: { input: 0.15, output: 0.6 } })).toEqual({
    kind: "rate",
    input: "$0.15",
    output: "$0.6",
  })
  expect(openRouterPrice({ id: "example/model:free", provider: { id: "openrouter" }, cost: { input: 0, output: 0 } })).toEqual({
    kind: "rate",
    input: "$0",
    output: "$0",
  })
  expect(openRouterPrice({ id: "example/model", provider: { id: "openrouter" }, cost: { input: 0.0000001, output: 1 } })).toEqual({
    kind: "rate",
    input: "$0.0000001",
    output: "$1",
  })
})

test("does not label other providers or invalid catalog rates", () => {
  expect(openRouterPrice({ id: "example/model", provider: { id: "openai" }, cost: { input: 1, output: 2 } })).toBeUndefined()
  expect(openRouterPrice({ id: "openrouter/auto", provider: { id: "openrouter" } })).toEqual({ kind: "unavailable" })
  expect(openRouterPrice({ id: "openrouter/auto", provider: { id: "openrouter" }, cost: { input: 0, output: 0 } })).toEqual({ kind: "unavailable" })
  expect(openRouterPrice({ id: "example/model", provider: { id: "openrouter" }, cost: { input: -1, output: 2 } })).toEqual({ kind: "unavailable" })
  expect(openRouterPrice({ id: "example/model", provider: { id: "openrouter" }, cost: { input: 1, output: Infinity } })).toEqual({ kind: "unavailable" })
})
