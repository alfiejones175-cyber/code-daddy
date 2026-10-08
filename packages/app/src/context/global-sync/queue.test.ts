import { describe, expect, test } from "bun:test"
import { createRefreshQueue } from "./queue"
import { directoryKey } from "./utils"

const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

describe("createRefreshQueue", () => {
  test("resumes pending directory refresh after a config save unpauses", async () => {
    const calls: string[] = []
    const state = { paused: true }
    const queue = createRefreshQueue({
      paused: () => state.paused,
      bootstrap: async () => {
        calls.push("global")
      },
      bootstrapInstance: (directory) => {
        calls.push(directory)
      },
    })
    queue.push("/repo")
    await tick()
    expect(calls).toEqual([])
    state.paused = false
    queue.refresh()
    await tick()
    await tick()
    expect(calls).toEqual(["global", "/repo"])
    queue.dispose()
  })

  test("clears queued directories by normalized key", async () => {
    const calls: string[] = []
    const queue = createRefreshQueue({
      paused: () => false,
      key: directoryKey,
      bootstrap: async () => {},
      bootstrapInstance: (directory) => {
        calls.push(directory)
      },
    })

    queue.push("C:\\tmp\\demo")
    queue.clear("C:/tmp/demo")

    await tick()

    expect(calls).toEqual([])
    queue.dispose()
  })

  test("passes the original directory to bootstrapInstance", async () => {
    const calls: string[] = []
    const queue = createRefreshQueue({
      paused: () => false,
      key: directoryKey,
      bootstrap: async () => {},
      bootstrapInstance: (directory) => {
        calls.push(directory)
      },
    })

    queue.push("C:\\tmp\\demo")

    await tick()

    expect(calls).toEqual(["C:\\tmp\\demo"])
    queue.dispose()
  })
})
