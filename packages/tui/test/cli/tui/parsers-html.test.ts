import { expect, test } from "bun:test"
import { TreeSitterClient } from "@opentui/core"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import config from "../../../src/parsers-config"

test("HTML highlights JavaScript and CSS bodies using their injection languages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "opencode-html-parser-"))
  const client = new TreeSitterClient({ dataPath: directory, initTimeout: 10_000 })
  try {
    await client.initialize()
    const html = config.parsers.find((parser) => parser.filetype === "html")!
    const css = config.parsers.find((parser) => parser.filetype === "css")!
    const fixture = fileURLToPath(new URL("../../fixture/parsers/", import.meta.url))
    client.addFiletypeParser({
      ...html,
      wasm: join(fixture, "html/tree-sitter-html.wasm"),
      queries: {
        highlights: [join(fixture, "html/highlights.scm")],
        injections: html.queries.injections?.map(() => join(fixture, "html/injections.scm")),
      },
    })
    client.addFiletypeParser({
      ...css,
      wasm: join(fixture, "css/tree-sitter-css.wasm"),
      queries: { highlights: [join(fixture, "css/highlights.scm")] },
    })
    const source = '<div>Hello</div><script>const answer = "ready";</script><style>.card { color: red; }</style>'
    const result = await client.highlightOnce(source, "html")
    expect(result.error).toBeUndefined()
    expect(result.warning).toBeUndefined()
    const tokens = (result.highlights ?? []).map(([start, end, group]) => ({ text: source.slice(start, end), group }))
    expect(tokens).toContainEqual({ text: "const", group: "keyword" })
    expect(tokens.some((token) => token.text === '"ready"' && token.group.startsWith("string"))).toBe(true)
    expect(tokens.some((token) => token.text === "color" && token.group === "property")).toBe(true)
    expect(tokens.some((token) => token.text === "div" && token.group === "tag")).toBe(true)
    // Injection parsing must exclude the surrounding tags, and not parse CSS as JavaScript.
    expect(tokens.some((token) => token.text.includes("<script>") || token.text.includes("<style>"))).toBe(false)
  } finally {
    await client.destroy()
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
