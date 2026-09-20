import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import type { DictationError, DictationEvent } from "@opencode-ai/app/dictation"
import type { WebContents } from "electron"

const MAX_OUTPUT = 16 * 1024
const SESSION_TIMEOUT = 2 * 60 * 1000

type Active = {
  readonly id: string
  readonly sender: WebContents
  readonly child: ChildProcessWithoutNullStreams
  readonly timeout: ReturnType<typeof setTimeout>
  output: string
  ended: boolean
  readonly cleanup?: () => void
}

type Spawn = typeof spawn

export function createDictationBridge(options: {
  readonly helper: string
  readonly spawn?: Spawn
  readonly exists?: (path: string) => boolean
  readonly platform?: NodeJS.Platform
}) {
  const launcher = options.spawn ?? spawn
  const exists = options.exists ?? existsSync
  const platform = options.platform ?? process.platform
  let active: Active | undefined

  const send = (sender: WebContents, event: DictationEvent) => {
    if (!sender.isDestroyed()) sender.send("dictation-event", event)
  }

  const end = (current: Active, error?: DictationError) => {
    if (current.ended) return
    current.ended = true
    clearTimeout(current.timeout)
    if (active === current) active = undefined
    current.cleanup?.()
    if (error) send(current.sender, { id: current.id, type: "error", error })
    send(current.sender, { id: current.id, type: "end" })
  }

  const cancel = (current: Active, error?: DictationError) => {
    current.child.stdin.write("cancel\n")
    current.child.kill()
    end(current, error)
  }

  const receive = (current: Active, chunk: string) => {
    if (current.ended || active !== current) return
    current.output += chunk
    if (current.output.length > MAX_OUTPUT) {
      cancel(current, "failed")
      return
    }
    const lines = current.output.split("\n")
    current.output = lines.pop() ?? ""
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as DictationEvent
        if (!event || event.id !== current.id) continue
        if (event.type === "started" || event.type === "result" || event.type === "error") send(current.sender, event)
        if (event.type === "end") end(current)
        if (current.ended || active !== current) return
      } catch {
        cancel(current, "failed")
        return
      }
    }
  }

  return {
    start: async (sender: WebContents, id: string, locale: string, cleanup?: () => void) => {
      if (platform !== "darwin" || !exists(options.helper)) {
        send(sender, { id, type: "error", error: "unavailable" })
        send(sender, { id, type: "end" })
        cleanup?.()
        return
      }
      if (active) {
        send(sender, { id, type: "error", error: "busy" })
        send(sender, { id, type: "end" })
        cleanup?.()
        return
      }
      const child = launcher(options.helper, ["--id", id, "--locale", locale], { stdio: ["pipe", "pipe", "pipe"] })
      const current: Active = {
        id,
        sender,
        child,
        timeout: setTimeout(() => cancel(current, "failed"), SESSION_TIMEOUT),
        output: "",
        ended: false,
        cleanup,
      }
      active = current
      child.stdout.setEncoding("utf8")
      child.stdout.on("data", (chunk: string) => receive(current, chunk))
      child.stderr.resume()
      child.stdin.on("error", () => {
        if (current.ended) return
        current.child.kill()
        end(current, "failed")
      })
      child.once("error", () => end(current, "unavailable"))
      child.once("close", (code) => {
        if (current.ended) return
        end(current, code === 0 ? undefined : "failed")
      })
    },
    stop: async (sender: WebContents, id: string) => {
      if (!active || active.id !== id || active.sender !== sender) return
      active.child.stdin.write("stop\n")
    },
    cancel: async (sender: WebContents, id: string) => {
      if (!active || active.id !== id || active.sender !== sender) return
      cancel(active)
    },
    clear: () => {
      if (active) cancel(active)
    },
  }
}

export const helperPath = (paths: { readonly packaged: boolean; readonly app: string; readonly resources: string }) =>
  paths.packaged
    ? join(paths.resources, "../Helpers/OpenCodeDictation.app/Contents/MacOS/opencode-dictation")
    : join(paths.app, "native/swift-build/OpenCodeDictation.app/Contents/MacOS/opencode-dictation")
