import { describe, expect, test } from "bun:test"
import { directoryPickerKind, directoryPickerStart } from "./directory-picker-policy"

const local = {
  type: "sidecar",
  variant: "base",
  http: { url: "http://localhost:4096" },
} as const
const remote = {
  type: "ssh",
  host: "example.test",
  http: { url: "http://localhost:4096" },
} as const

describe("directoryPickerKind", () => {
  test("uses the native picker only for local desktop projects", () => {
    expect(directoryPickerKind("desktop", local)).toBe("native")
    expect(directoryPickerKind("desktop", remote)).toBe("server")
    expect(directoryPickerKind("web", local)).toBe("server")
  })
})

describe("directoryPickerStart", () => {
  test("prefers an explicit start folder", () => {
    expect(directoryPickerStart("/explicit", "/configured")).toBe("/explicit")
  })

  test("uses the configured folder when no start is provided", () => {
    expect(directoryPickerStart(undefined, " /configured ")).toBe("/configured")
  })

  test("leaves the picker default unchanged when neither folder is set", () => {
    expect(directoryPickerStart(undefined, "")).toBeUndefined()
  })
})
