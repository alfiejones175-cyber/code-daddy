import { createStore } from "solid-js/store"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { applyDirectoryEvent } from "../src/context/global-sync/event-reducer"
import type { State } from "../src/context/global-sync/types"

const samples = 20
const events = 2_000

function session(id: string): Session {
  return {
    id,
    time: { created: 1, updated: 1 },
  } as Session
}

function state(): State {
  return {
    status: "complete",
    agent: [],
    command: [],
    project: "",
    provider: {},
    config: {},
    path: { directory: "/benchmark" },
    session: [],
    sessionTotal: 0,
    session_status: {},
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    mcp: {},
    lsp: [],
    limit: 200,
    message: {},
    session_message: {},
    part: {},
    part_text_accum_delta: {},
  } as State
}

const measurements = Array.from({ length: samples }, () => {
  const [store, setStore] = createStore(state())
  const started = performance.now()
  for (let index = 0; index < events; index++) {
    applyDirectoryEvent({
      event: { type: "session.created", properties: { info: session(`ses_${String(index).padStart(5, "0")}`) } },
      store,
      setStore,
      push() {},
      directory: "/benchmark",
      loadLsp() {},
    })
  }
  return performance.now() - started
}).sort((left, right) => left - right)

console.log(
  JSON.stringify({
    scenario: "directory-inventory-session-created",
    samples,
    events,
    milliseconds: {
      min: measurements[0],
      median: measurements[Math.floor(measurements.length / 2)],
      max: measurements.at(-1),
    },
  }),
)
