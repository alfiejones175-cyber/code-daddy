import { describe, expect, test } from "bun:test"
import { createFileTreeStore } from "./tree-store"
import type { FileNode } from "@opencode-ai/sdk/v2"

describe("createFileTreeStore", () => {
  test("keeps a new scope's in-flight request tracked after the previous scope completes", async () => {
    let scope = "a"
    const pending: Array<(nodes: FileNode[]) => void> = []
    const store = createFileTreeStore({
      scope: () => scope,
      normalizeDir: (input) => input,
      list: () =>
        new Promise<FileNode[]>((resolve) => {
          pending.push(resolve)
        }),
      onError: () => {},
    })

    const previous = store.listDir("src")
    store.reset()
    scope = "b"
    const current = store.listDir("src")

    pending[0]?.([])
    await previous

    expect(store.listDir("src")).toBe(current)
    expect(pending).toHaveLength(2)

    pending[1]?.([])
    await current
  })
})
