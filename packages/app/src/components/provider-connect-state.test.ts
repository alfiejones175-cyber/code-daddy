import { describe, expect, test } from "bun:test"
import {
  providerConnectMethods,
  providerOAuthAutoCode,
  shouldAutoSelectProviderConnectMethod,
} from "./provider-connect-state"

const apiKey = { type: "key" as const, label: "API key" }
const oauth = { type: "oauth" as const, id: "browser", label: "Browser" }

describe("providerConnectMethods", () => {
  test("does not substitute an API key while method discovery has no result", () => {
    expect(providerConnectMethods({ legacy: true, methods: undefined, fallback: [apiKey] })).toEqual([])
  })

  test("keeps discovered OAuth methods", () => {
    expect(providerConnectMethods({ legacy: true, methods: [oauth], fallback: [apiKey] })).toEqual([oauth])
  })

  test("uses the API-key fallback only when a legacy provider declares no connect method", () => {
    expect(providerConnectMethods({ legacy: true, methods: [], fallback: [apiKey] })).toEqual([apiKey])
    expect(providerConnectMethods({ legacy: false, methods: [], fallback: [apiKey] })).toEqual([])
  })
})

describe("shouldAutoSelectProviderConnectMethod", () => {
  test("only auto-selects a single API-key method", () => {
    expect(shouldAutoSelectProviderConnectMethod([apiKey])).toBe(true)
    expect(shouldAutoSelectProviderConnectMethod([oauth])).toBe(false)
  })
})

describe("providerOAuthAutoCode", () => {
  test("extracts a headless device code", () => {
    expect(providerOAuthAutoCode("Enter code: ABCD-EFGH")).toBe("ABCD-EFGH")
  })

  test("does not present browser instructions as a confirmation code", () => {
    expect(providerOAuthAutoCode("Complete authorization in your browser. This window will close automatically.")).toBe(
      undefined,
    )
  })
})
