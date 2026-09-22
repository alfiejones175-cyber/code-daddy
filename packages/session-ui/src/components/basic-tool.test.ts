import { describe, expect, test } from "bun:test"
import { GENERIC_TOOL_DISCLOSURE_LIMIT, GENERIC_TOOL_PREVIEW_LIMIT, genericToolArgs, genericToolDetail } from "./basic-tool"

describe("generic tool details", () => {
  test("keeps maximum Jev evidence out of the collapsed argument preview", () => {
    const evidence = "e".repeat(24_000)
    const args = genericToolArgs({ evidence, attempt: 2 }, ({ key, count }) => `${key} · ${count} characters`)

    expect(args).toEqual(["evidence · 24000 characters", "attempt=2"])
    expect(args.join(" ")).not.toContain(evidence.slice(0, GENERIC_TOOL_PREVIEW_LIMIT + 1))
  })

  test("bounds ordinary scalar previews before they reach the DOM", () => {
    const value = "x".repeat(GENERIC_TOOL_PREVIEW_LIMIT + 1)
    expect(genericToolArgs({ value }, () => "payload")).toEqual([
      `value=${value.slice(0, GENERIC_TOOL_PREVIEW_LIMIT - "value=".length)}`,
    ])
  })

  test("bounds scalar keys and localized payload labels before they reach the DOM", () => {
    const key = "k".repeat(GENERIC_TOOL_PREVIEW_LIMIT + 1)
    expect(genericToolArgs({ [key]: true }, () => "payload")).toEqual([key.slice(0, GENERIC_TOOL_PREVIEW_LIMIT)])
    expect(genericToolArgs({ evidence: "e" }, () => "p".repeat(GENERIC_TOOL_PREVIEW_LIMIT + 1))).toEqual([
      "p".repeat(GENERIC_TOOL_PREVIEW_LIMIT),
    ])
  })

  test("formats JSON output and bounds intentionally disclosed details", () => {
    expect(genericToolDetail('{"status":"ok","category":"timing"}')).toEqual({
      text: '{\n  "status": "ok",\n  "category": "timing"\n}',
      truncated: false,
    })

    const detail = genericToolDetail("x".repeat(GENERIC_TOOL_DISCLOSURE_LIMIT + 1))
    expect(detail.text).toHaveLength(GENERIC_TOOL_DISCLOSURE_LIMIT)
    expect(detail.truncated).toBe(true)
  })

  test("uses a caller-supplied localized fallback for values that cannot be stringified", () => {
    expect(genericToolDetail({ count: 1n }, "Unavailable")).toEqual({ text: "Unavailable", truncated: false })
  })
})
