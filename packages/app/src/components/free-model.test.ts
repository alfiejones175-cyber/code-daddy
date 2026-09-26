import { describe, expect, test } from "bun:test"
import { isFreeModel } from "./free-model"

const zero = { input: 0, output: 0, cache: { read: 0, write: 0 } }

describe("isFreeModel", () => {
  test("only labels an OpenCode model free when every known price is zero", () => {
    expect(isFreeModel({ provider: { id: "opencode" }, cost: zero })).toBe(true)
    expect(isFreeModel({ provider: { id: "other" }, cost: zero })).toBe(false)
    expect(isFreeModel({ provider: { id: "opencode" } })).toBe(false)
  })

  test("checks output, cache, context tiers, and extended-context prices", () => {
    expect(isFreeModel({ provider: { id: "opencode" }, cost: { ...zero, output: 1 } })).toBe(false)
    expect(isFreeModel({ provider: { id: "opencode" }, cost: { ...zero, cache: { ...zero.cache, write: 1 } } })).toBe(false)
    expect(isFreeModel({ provider: { id: "opencode" }, cost: { ...zero, tiers: [{ ...zero, input: 1 }] } })).toBe(false)
    expect(
      isFreeModel({ provider: { id: "opencode" }, cost: { ...zero, experimentalOver200K: { ...zero, output: 1 } } }),
    ).toBe(false)
  })
})
