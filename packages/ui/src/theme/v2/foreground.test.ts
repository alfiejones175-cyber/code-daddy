import { describe, expect, test } from "bun:test"
import { contrastRatio } from "../color"
import { DEFAULT_THEMES } from "../default-themes"
import type { HexColor } from "../types"
import { mapV2Foreground } from "./foreground"
import { mapV2Semantics } from "./mapping"
import { generateV2Primitives } from "./resolve"

describe("v2 foreground", () => {
  test("keeps faint text above the normal-text contrast floor", () => {
    Object.values(DEFAULT_THEMES).forEach((theme) => {
      ;([theme.light, theme.dark] as const).forEach((variant, index) => {
        const dark = index === 1
        const primitives = generateV2Primitives(variant, dark)
        const semantics = mapV2Semantics(dark)
        const foreground = mapV2Foreground(variant.palette?.ink ?? variant.seeds!.neutral, dark, primitives)
        const resolve = (value: string) => {
          const key = value.match(/^var\(--(.+)\)$/)?.[1]
          return (key ? primitives[key] : value) as HexColor
        }

        expect(
          contrastRatio(resolve(foreground["v2-text-text-faint"]!), resolve(semantics["v2-background-bg-base"]!)),
        ).toBeGreaterThanOrEqual(4.5)
      })
    })
  })
})
