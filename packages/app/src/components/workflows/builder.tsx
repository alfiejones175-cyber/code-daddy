import { Workflow } from "@opencode-ai/schema/workflow"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { A } from "@solidjs/router"
import { Schema } from "effect"
import { createEffect, createMemo, For, onCleanup, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { createWorkflowApi, WorkflowRequestError } from "@/utils/workflow-api"
import { sessionHref } from "@/utils/session-route"
import { WorkflowInspector } from "./inspector"
import { cloneWorkflowDefinition } from "./draft"
import { WorkflowTeach } from "./teach"
import { WorkflowHarnessLab } from "./harness"
import { WorkflowMcp } from "@/components/workflow-mcp"
import "./workflows.css"

const emptyCatalog: Workflow.Catalog = { models: [], servers: [], tools: [], skills: [], clefConfigured: false }
const kinds = ["task", "computer", "mcp", "decision", "approval"] as const

export function WorkflowBuilder(props: { directory?: string }) {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = usePlatform()
  const server = useServer()
  const sdk = useServerSDK()
  const protocol = useServerProtocol()
  const [state, setState] = createStore({
    directory: props.directory ?? "",
    projectDraft: props.directory ?? "",
    definitions: [] as Workflow.Definition[],
    catalog: emptyCatalog,
    definition: undefined as Workflow.Definition | undefined,
    selected: "",
    dirty: false,
    invalid: false,
    loading: false,
    busy: "",
    error: "",
    input: "",
    history: [] as Workflow.Run[],
    run: undefined as Workflow.Run | undefined,
    teach: false,
    reload: 0,
    harnessNode: "",
    notice: "",
  })
  let controller: AbortController | undefined
  let importInput: HTMLInputElement | undefined
  let drag: { id: string; x: number; y: number; left: number; top: number } | undefined
  const scope = createMemo(() =>
    protocol() === "v1" && state.directory.trim() ? `${sdk().scope}\0${state.directory}` : "",
  )
  const api = (signal = controller?.signal) =>
    createWorkflowApi({ server: sdk().server.http, directory: state.directory, fetch: platform.fetch, signal })
  const discard = () => !state.dirty || window.confirm(language.t("workflow.discard"))
  createEffect(() => {
    const directory = props.directory
    if (!directory) return
    untrack(() => {
      if (state.directory === directory || !discard()) return
      setState({ directory, projectDraft: directory })
    })
  })
  createEffect(() => {
    const key = scope()
    state.reload
    const abort = new AbortController()
    controller = abort
    setState({
      loading: !!key,
      definitions: [],
      catalog: emptyCatalog,
      definition: undefined,
      selected: "",
      dirty: false,
      invalid: false,
      history: [],
      run: undefined,
      teach: false,
      busy: "",
      error: "",
      harnessNode: "",
      notice: "",
    })
    if (key) {
      const client = untrack(() => api(abort.signal))
      void Promise.all([client.list(), client.catalog()])
        .then(([definitions, catalog]) => {
          if (abort.signal.aborted) return
          setState({ definitions: [...definitions], catalog, loading: false })
        })
        .catch(() => {
          if (abort.signal.aborted) return
          setState({ loading: false, error: language.t("workflow.loadFailed") })
        })
    }
    onCleanup(() => abort.abort())
  })
  const update = (definition: Workflow.Definition) => setState({ definition, dirty: true, error: "" })
  const selected = createMemo(() => state.definition?.nodes.find((node) => node.id === state.selected))
  const harnessNode = createMemo(() =>
    state.definition?.nodes.find(
      (node): node is Extract<Workflow.Node, { kind: "task" | "computer" }> =>
        node.id === state.harnessNode && (node.kind === "task" || node.kind === "computer"),
    ),
  )
  const select = (definition: Workflow.Definition) => {
    if (!discard()) return
    setState({
      definition: cloneWorkflowDefinition(definition),
      selected: definition.nodes[0]?.id ?? "",
      dirty: false,
      invalid: false,
      run: undefined,
      error: "",
      input: "",
      harnessNode: "",
      notice: "",
    })
  }
  const openProject = (directory = state.projectDraft.trim()) => {
    if (!directory || !discard()) return
    setState({ directory, projectDraft: directory })
  }
  const browse = async () => {
    if (platform.platform !== "desktop") return
    const result = await platform.openDirectoryPickerDialog({ multiple: false })
    const directory = Array.isArray(result) ? result[0] : result
    if (directory) openProject(directory)
  }
  const create = () => {
    if (!discard()) return
    const id = crypto.randomUUID()
    const start: Workflow.Node = {
      id: crypto.randomUUID(),
      kind: "start",
      name: language.t("workflow.kind.start"),
      x: 64,
      y: 100,
    }
    const task: Workflow.Node = {
      id: crypto.randomUUID(),
      kind: "task",
      name: language.t("workflow.kind.task"),
      x: 360,
      y: 100,
      prompt: "",
      model: state.catalog.models[0] ?? { providerID: "", modelID: "" },
      skills: [],
      mcpServers: [],
    }
    setState({
      definition: {
        version: 1,
        id,
        name: language.t("workflow.defaultName"),
        directory: state.directory,
        description: "",
        nodes: [start, task],
        edges: [{ id: crypto.randomUUID(), from: start.id, to: task.id }],
        updatedAt: Date.now(),
      },
      selected: task.id,
      dirty: true,
      invalid: false,
      history: [],
      run: undefined,
      error: "",
      input: "",
    })
  }
  const importWorkflow = async (file: File) => {
    if (!discard()) return
    const key = scope()
    await file
      .text()
      .then((text) =>
        Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Workflow.Definition)))(text),
      )
      .then((definition) => {
        if (key !== scope()) return
        setState({
          definition: {
            ...definition,
            id: crypto.randomUUID(),
            directory: state.directory,
            updatedAt: Date.now(),
            nodes: definition.nodes.map((node) =>
              node.kind === "task" || node.kind === "computer" ? { ...node, harness: undefined } : node,
            ),
          },
          selected: definition.nodes[0]?.id ?? "",
          dirty: true,
          invalid: false,
          run: undefined,
          history: [],
          input: "",
          error: "",
          notice: definition.nodes.some((node) => (node.kind === "task" || node.kind === "computer") && node.harness)
            ? language.t("workflow.harness.imported")
            : "",
        })
      })
      .catch(() => {
        if (key === scope()) setState("error", language.t("workflow.importFailed"))
      })
  }
  const exportWorkflow = () => {
    if (!state.definition) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.definition, null, 2)], { type: "application/json" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${state.definition.id}.workflow.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  createEffect(() => {
    const key = scope()
    const workflowID = state.definition?.id
    setState("history", [])
    if (!key || !workflowID) return
    const abort = new AbortController()
    const client = untrack(() => api(abort.signal))
    void client
      .history(workflowID)
      .then((runs) => {
        if (!abort.signal.aborted)
          setState(
            "history",
            runs.filter((run) => !run.trial),
          )
      })
      .catch(() => {
        if (!abort.signal.aborted) setState("error", language.t("workflow.actionFailed"))
      })
    onCleanup(() => abort.abort())
  })
  const refreshRun = async () => {
    const id = state.run?.id
    const key = scope()
    const signal = controller?.signal
    if (!id || !key) return
    await api()
      .run(id)
      .then((run) => {
        if (signal?.aborted || scope() !== key || state.run?.id !== id || run.updatedAt < state.run.updatedAt) return
        setState("run", run)
        setState("history", [run, ...state.history.filter((item) => item.id !== run.id)])
      })
      .catch(() => {
        if (!signal?.aborted && state.run?.id === id) setState("error", language.t("workflow.actionFailed"))
      })
  }
  createEffect(() => {
    const id = state.run?.id
    const status = state.run?.status
    if (!id || (status !== "running" && status !== "waiting")) return
    const timer = setInterval(() => void refreshRun(), 2000)
    onCleanup(() => clearInterval(timer))
  })
  const perform = async (action: string, work: () => Promise<unknown>) => {
    if (state.busy) return
    const key = scope()
    const signal = controller?.signal
    setState({ busy: action, error: "" })
    await work().catch((error: unknown) => {
      if (!signal?.aborted && scope() === key)
        setState("error", error instanceof WorkflowRequestError ? error.message : language.t("workflow.actionFailed"))
    })
    if (!signal?.aborted && scope() === key) setState("busy", "")
  }
  const save = async () => {
    const definition = state.definition
    if (!definition || state.invalid) return
    const key = scope()
    const signal = controller?.signal
    const saved = await api().save({ ...definition, updatedAt: Date.now() })
    if (signal?.aborted || scope() !== key) return
    setState("definitions", [saved, ...state.definitions.filter((item) => item.id !== saved.id)])
    if (state.definition?.id === saved.id) setState({ definition: saved, dirty: false })
    return saved
  }
  const openHarness = () => {
    const node = selected()
    if (!node || (node.kind !== "task" && node.kind !== "computer") || state.invalid) return
    void perform("harness", async () => {
      const definition = state.dirty ? await save() : state.definition
      if (!definition || controller?.signal.aborted || state.definition?.id !== definition.id) return
      setState({ harnessNode: node.id, teach: false })
    })
  }
  const start = async () => {
    const key = scope()
    const signal = controller?.signal
    const definition = await save()
    if (!definition || signal?.aborted || scope() !== key) return
    const run = await api().start(definition.id, { input: state.input })
    if (signal?.aborted || scope() !== key || state.definition?.id !== definition.id) return
    setState({ run, history: [run, ...state.history.filter((item) => item.id !== run.id)] })
  }
  const remove = () => {
    const definition = state.definition
    if (!definition || !window.confirm(language.t("workflow.deleteConfirm", { name: definition.name }))) return
    void perform("delete", async () => {
      const key = scope()
      const signal = controller?.signal
      await api().remove(definition.id)
      if (signal?.aborted || scope() !== key) return
      setState(
        "definitions",
        state.definitions.filter((item) => item.id !== definition.id),
      )
      if (state.definition?.id === definition.id)
        setState({ definition: undefined, selected: "", dirty: false, run: undefined, history: [] })
    })
  }
  const changeNode = (node: Workflow.Node) => {
    if (!state.definition) return
    update({ ...state.definition, nodes: state.definition.nodes.map((item) => (item.id === node.id ? node : item)) })
  }
  const removeStep = (id: string) => {
    if (!state.definition || state.definition.nodes.find((node) => node.id === id)?.kind === "start") return
    update({
      ...state.definition,
      nodes: state.definition.nodes.filter((node) => node.id !== id),
      edges: state.definition.edges.filter((edge) => edge.from !== id && edge.to !== id),
    })
    setState({ selected: "", invalid: false })
  }
  const addStep = (kind: (typeof kinds)[number]) => {
    const definition = state.definition
    if (!definition || definition.nodes.length >= 100) return
    const base = {
      id: crypto.randomUUID(),
      name: language.t(`workflow.kind.${kind}`),
      x: 100 + (definition.nodes.length % 4) * 260,
      y: 100 + Math.floor(definition.nodes.length / 4) * 170,
    }
    const node: Workflow.Node =
      kind === "mcp"
        ? { ...base, kind, server: "", tool: "", arguments: {} }
        : kind === "decision"
          ? { ...base, kind, model: "clef", question: "", threshold: 0.8 }
          : kind === "approval"
            ? { ...base, kind, instructions: "" }
            : {
                ...base,
                kind,
                prompt: "",
                model: (kind === "computer"
                  ? state.catalog.models.find((model) => model.vision)
                  : state.catalog.models[0]) ?? { providerID: "", modelID: "" },
                skills: [],
                mcpServers: [],
              }
    update({ ...definition, nodes: [...definition.nodes, node] })
    setState({ selected: node.id, invalid: false })
  }
  const connect = (to: string, outcome?: "yes" | "no") => {
    const definition = state.definition
    if (
      !definition ||
      definition.edges.some((edge) => edge.from === state.selected && edge.to === to && edge.outcome === outcome)
    )
      return
    update({
      ...definition,
      edges: [
        ...definition.edges,
        { id: crypto.randomUUID(), from: state.selected, to, ...(outcome ? { outcome } : {}) },
      ],
    })
  }
  const canvasSize = createMemo(() => ({
    width: Math.max(1000, ...(state.definition?.nodes.map((node) => node.x + 280) ?? [])),
    height: Math.max(480, ...(state.definition?.nodes.map((node) => node.y + 160) ?? [])),
  }))
  const valid = createMemo(
    () => !!state.definition && Schema.is(Workflow.Definition)(state.definition) && !state.invalid,
  )
  return (
    <div class="workflow-builder">
      <header class="workflow-header">
        <div>
          <h2>{language.t("workflow.title")}</h2>
          <p>{language.t("workflow.description")}</p>
        </div>
        <ButtonV2
          variant="neutral"
          disabled={!!state.harnessNode || !scope() || state.loading || (!!state.error && !state.catalog.models.length)}
          onClick={() => setState("teach", !state.teach)}
        >
          {language.t("workflow.teach")}
        </ButtonV2>
      </header>
      <Show when={protocol() === "v1"} fallback={<p class="workflow-empty">{language.t("workflow.unsupported")}</p>}>
        <form
          class="workflow-project"
          onSubmit={(event) => {
            event.preventDefault()
            openProject()
          }}
        >
          <label class="workflow-field">
            {language.t("workflow.project")}
            <input
              list="workflow-projects"
              disabled={!!state.harnessNode}
              value={state.projectDraft}
              onInput={(event) => setState("projectDraft", event.currentTarget.value)}
            />
          </label>
          <datalist id="workflow-projects">
            <For each={server.projects.list()}>{(project) => <option value={project.worktree} />}</For>
          </datalist>
          <Show when={platform.platform === "desktop"}>
            <ButtonV2 type="button" variant="neutral" disabled={!!state.harnessNode} onClick={() => void browse()}>
              {language.t("workflow.browse")}
            </ButtonV2>
          </Show>
          <ButtonV2 type="submit" variant="neutral" disabled={!!state.harnessNode || !state.projectDraft.trim()}>
            {language.t("workflow.open")}
          </ButtonV2>
        </form>
        <Show when={state.notice}>
          <p role="status" class="workflow-hint">
            {state.notice}
          </p>
        </Show>
        <Show when={state.error}>
          <div class="workflow-error-row" role="alert">
            <span>{state.error}</span>
            <ButtonV2
              variant="neutral"
              onClick={() => {
                if (!discard()) return
                setState("reload", state.reload + 1)
              }}
            >
              {language.t("workflow.retry")}
            </ButtonV2>
          </div>
        </Show>
        <Show when={state.loading}>
          <p role="status" class="workflow-empty">
            {language.t("workflow.loading")}
          </p>
        </Show>
        <Show
          when={scope() && !state.loading}
          fallback={!scope() ? <p class="workflow-empty">{language.t("workflow.chooseProject")}</p> : undefined}
        >
          <Show when={state.teach && scope()} keyed>
            {(_key) => (
              <WorkflowTeach
                catalog={state.catalog}
                api={(signal) => api(signal)}
                onClose={() => setState("teach", false)}
                onSaved={() => {
                  const key = scope()
                  const signal = controller?.signal
                  void api()
                    .catalog()
                    .then((catalog) => {
                      if (!signal?.aborted && key === scope()) setState("catalog", catalog)
                    })
                    .catch(() => {
                      if (!signal?.aborted) setState("error", language.t("workflow.actionFailed"))
                    })
                }}
              />
            )}
          </Show>
          <div class="workflow-workbench">
            <aside class="workflow-library" aria-label={language.t("workflow.title")} inert={!!state.harnessNode}>
              <ButtonV2 variant="neutral" disabled={!!state.busy} onClick={create}>
                {language.t("workflow.new")}
              </ButtonV2>
              <ButtonV2 variant="neutral" disabled={!!state.busy} onClick={() => importInput?.click()}>
                {language.t("workflow.import")}
              </ButtonV2>
              <input
                ref={importInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ""
                  if (file) void importWorkflow(file)
                }}
              />
              <Show when={!state.definitions.length}>
                <p class="workflow-hint">{language.t("workflow.empty")}</p>
              </Show>
              <For each={state.definitions}>
                {(definition) => (
                  <button
                    type="button"
                    class="workflow-library-item"
                    aria-current={state.definition?.id === definition.id ? "true" : undefined}
                    disabled={!!state.busy}
                    onClick={() => select(definition)}
                  >
                    <strong>{definition.name}</strong>
                    <span>{definition.description}</span>
                  </button>
                )}
              </For>
              <WorkflowMcp
                directory={state.directory}
                onConnected={() => {
                  const key = scope()
                  const signal = controller?.signal
                  void api()
                    .catalog()
                    .then((catalog) => {
                      if (!signal?.aborted && key === scope()) setState("catalog", catalog)
                    })
                    .catch(() => {
                      if (!signal?.aborted) setState("error", language.t("workflow.actionFailed"))
                    })
                }}
              />
            </aside>
            <Show
              when={state.definition}
              fallback={<div class="workflow-empty workflow-start-empty">{language.t("workflow.select")}</div>}
            >
              {(definition) => (
                <div class="workflow-editor-container">
                  <Show when={state.harnessNode} keyed>
                    {(_id) => (
                      <Show when={harnessNode()}>
                        {(node) => (
                          <WorkflowHarnessLab
                            workflow={definition()}
                            node={node()}
                            catalog={state.catalog}
                            initialInput={state.input}
                            api={(signal) => api(signal)}
                            onClose={() => setState("harnessNode", "")}
                            onAccepted={(saved) =>
                              setState({
                                definition: cloneWorkflowDefinition(saved),
                                definitions: [saved, ...state.definitions.filter((item) => item.id !== saved.id)],
                                dirty: false,
                              })
                            }
                          />
                        )}
                      </Show>
                    )}
                  </Show>
                  <Show when={state.harnessNode}>
                    <p role="status" class="workflow-hint workflow-warning">
                      {language.t("workflow.harness.locked")}
                    </p>
                  </Show>
                  <fieldset class="workflow-editor" disabled={!!state.busy || !!state.harnessNode}>
                    <div class="workflow-definition-fields">
                      <label class="workflow-field">
                        {language.t("workflow.name")}
                        <input
                          maxLength={200}
                          value={definition().name}
                          onInput={(event) => update({ ...definition(), name: event.currentTarget.value })}
                        />
                      </label>
                      <label class="workflow-field">
                        {language.t("workflow.summary")}
                        <input
                          maxLength={100000}
                          value={definition().description}
                          onInput={(event) => update({ ...definition(), description: event.currentTarget.value })}
                        />
                      </label>
                      <div class="workflow-actions">
                        <span class="workflow-save-state" role="status">
                          {language.t(state.dirty ? "workflow.unsaved" : "workflow.saved")}
                        </span>
                        <ButtonV2
                          variant="neutral"
                          disabled={!!state.busy || !valid()}
                          onClick={() => void perform("save", save)}
                        >
                          {language.t("workflow.save")}
                        </ButtonV2>
                        <ButtonV2 variant="neutral" onClick={exportWorkflow}>
                          {language.t("workflow.export")}
                        </ButtonV2>
                        <ButtonV2 variant="neutral" disabled={!!state.busy} onClick={remove}>
                          {language.t("workflow.delete")}
                        </ButtonV2>
                      </div>
                    </div>
                    <div class="workflow-step-toolbar" aria-label={language.t("workflow.addStep")}>
                      <span>{language.t("workflow.addStep")}</span>
                      <For each={kinds}>
                        {(kind) => (
                          <ButtonV2
                            variant="neutral"
                            disabled={definition().nodes.length >= 100}
                            onClick={() => addStep(kind)}
                          >
                            {language.t(`workflow.kind.${kind}`)}
                          </ButtonV2>
                        )}
                      </For>
                    </div>
                    <div class="workflow-canvas-inspector">
                      <div class="workflow-canvas-wrap">
                        <p class="workflow-canvas-hint">{language.t("workflow.canvasHint")}</p>
                        <div class="workflow-canvas-scroll" aria-label={language.t("workflow.canvas")}>
                          <div
                            class="workflow-canvas"
                            style={{ width: `${canvasSize().width}px`, height: `${canvasSize().height}px` }}
                          >
                            <svg
                              class="workflow-edges"
                              width={canvasSize().width}
                              height={canvasSize().height}
                              aria-hidden="true"
                            >
                              <defs>
                                <marker
                                  id="workflow-arrow"
                                  viewBox="0 0 10 10"
                                  refX="8"
                                  refY="5"
                                  markerWidth="6"
                                  markerHeight="6"
                                  orient="auto-start-reverse"
                                >
                                  <path d="M 0 0 L 10 5 L 0 10 z" />
                                </marker>
                              </defs>
                              <For each={definition().edges}>
                                {(edge) => {
                                  const from = () => definition().nodes.find((node) => node.id === edge.from)
                                  const to = () => definition().nodes.find((node) => node.id === edge.to)
                                  return (
                                    <Show when={from() && to()}>
                                      <g data-outcome={edge.outcome}>
                                        <path
                                          d={`M ${from()!.x + 200} ${from()!.y + 43} C ${from()!.x + 270} ${from()!.y + 43}, ${to()!.x - 70} ${to()!.y + 43}, ${to()!.x} ${to()!.y + 43}`}
                                          marker-end="url(#workflow-arrow)"
                                        />
                                        <Show when={edge.outcome}>
                                          <text x={(from()!.x + 200 + to()!.x) / 2} y={(from()!.y + to()!.y) / 2 + 33}>
                                            {language.t(edge.outcome === "yes" ? "workflow.yes" : "workflow.no")}
                                          </text>
                                        </Show>
                                      </g>
                                    </Show>
                                  )
                                }}
                              </For>
                            </svg>
                            <For each={definition().nodes.map((node) => node.id)}>
                              {(id) => {
                                const node = createMemo(() => definition().nodes.find((node) => node.id === id)!)
                                return (
                                  <button
                                    type="button"
                                    class="workflow-node"
                                    data-kind={node().kind}
                                    aria-pressed={state.selected === id}
                                    style={{ left: `${node().x}px`, top: `${node().y}px` }}
                                    onClick={() => setState({ selected: id, invalid: false })}
                                    onPointerDown={(event) => {
                                      if (event.button !== 0) return
                                      event.currentTarget.setPointerCapture(event.pointerId)
                                      drag = { id, x: event.clientX, y: event.clientY, left: node().x, top: node().y }
                                      setState({ selected: id, invalid: false })
                                    }}
                                    onPointerMove={(event) => {
                                      if (!drag || drag.id !== id) return
                                      changeNode({
                                        ...node(),
                                        x: Math.max(0, Math.min(3000, drag.left + event.clientX - drag.x)),
                                        y: Math.max(0, Math.min(3000, drag.top + event.clientY - drag.y)),
                                      })
                                    }}
                                    onPointerUp={() => {
                                      drag = undefined
                                    }}
                                    onPointerCancel={() => {
                                      drag = undefined
                                    }}
                                    onKeyDown={(event) => {
                                      const amount = event.shiftKey ? 5 : 20
                                      const delta =
                                        event.key === "ArrowLeft"
                                          ? [-amount, 0]
                                          : event.key === "ArrowRight"
                                            ? [amount, 0]
                                            : event.key === "ArrowUp"
                                              ? [0, -amount]
                                              : event.key === "ArrowDown"
                                                ? [0, amount]
                                                : undefined
                                      if (delta) {
                                        event.preventDefault()
                                        changeNode({
                                          ...node(),
                                          x: Math.max(0, node().x + delta[0]!),
                                          y: Math.max(0, node().y + delta[1]!),
                                        })
                                      }
                                      if (event.key === "Delete" || event.key === "Backspace") {
                                        event.preventDefault()
                                        removeStep(id)
                                      }
                                    }}
                                  >
                                    <span class="workflow-kind">{language.t(`workflow.kind.${node().kind}`)}</span>
                                    <strong>{node().name}</strong>
                                    <span class="workflow-node-detail">
                                      {(() => {
                                        const item = node()
                                        return item.kind === "task" || item.kind === "computer"
                                          ? (item.harness?.spec.model.modelID ?? item.model.modelID)
                                          : item.kind === "mcp"
                                            ? item.tool
                                            : item.kind === "decision"
                                              ? item.model
                                              : ""
                                      })()}
                                    </span>
                                  </button>
                                )
                              }}
                            </For>
                          </div>
                        </div>
                      </div>
                      <Show
                        when={selected()}
                        fallback={
                          <p class="workflow-empty workflow-inspector-empty">{language.t("workflow.noStep")}</p>
                        }
                      >
                        {(node) => (
                          <WorkflowInspector
                            node={node()}
                            nodes={definition().nodes}
                            edges={definition().edges}
                            catalog={state.catalog}
                            onChange={changeNode}
                            onRemove={() => removeStep(node().id)}
                            onConnect={connect}
                            onInvalid={(invalid) => setState("invalid", invalid)}
                            onHarness={openHarness}
                            harnessNeedsSave={state.dirty}
                            onDisconnect={(id) =>
                              update({ ...definition(), edges: definition().edges.filter((edge) => edge.id !== id) })
                            }
                          />
                        )}
                      </Show>
                    </div>
                    <section class="workflow-run-input">
                      <label class="workflow-field">
                        {language.t("workflow.runInput")}
                        <textarea
                          rows={2}
                          maxLength={100000}
                          placeholder={language.t("workflow.runInputPlaceholder")}
                          value={state.input}
                          onInput={(event) => setState("input", event.currentTarget.value)}
                        />
                      </label>
                      <ButtonV2 disabled={!!state.busy || !valid()} onClick={() => void perform("run", start)}>
                        {language.t(state.busy === "run" ? "workflow.running" : "workflow.run")}
                      </ButtonV2>
                    </section>
                    <section class="workflow-history" aria-label={language.t("workflow.history")}>
                      <div class="workflow-section-heading">
                        <h3>{language.t("workflow.history")}</h3>
                        <Show when={state.run}>
                          <ButtonV2
                            variant="neutral"
                            disabled={!!state.busy}
                            onClick={() => void perform("refresh", refreshRun)}
                          >
                            {language.t("workflow.refresh")}
                          </ButtonV2>
                        </Show>
                      </div>
                      <Show when={!state.history.length}>
                        <p class="workflow-hint">{language.t("workflow.noRuns")}</p>
                      </Show>
                      <div class="workflow-run-list">
                        <For each={state.history}>
                          {(run) => (
                            <button
                              type="button"
                              class="workflow-run-item"
                              aria-pressed={state.run?.id === run.id}
                              onClick={() => setState("run", run)}
                            >
                              <span class="workflow-status" data-status={run.status}>
                                {language.t(`workflow.status.${run.status}`)}
                              </span>
                              <span>{new Date(run.createdAt).toLocaleString()}</span>
                            </button>
                          )}
                        </For>
                      </div>
                      <Show when={state.run}>
                        {(run) => (
                          <div class="workflow-run-detail">
                            <div class="workflow-actions">
                              <strong class="workflow-status" data-status={run().status}>
                                {language.t(`workflow.status.${run().status}`)}
                              </strong>
                              <Show when={run().status === "waiting"}>
                                <ButtonV2
                                  disabled={!!state.busy || !run().steps.some((step) => step.status === "waiting")}
                                  onClick={() => {
                                    const id = run().id
                                    const nodeID = run().steps.find((step) => step.status === "waiting")?.nodeID
                                    if (nodeID)
                                      void perform("approve", async () => {
                                        await api().approve(id, nodeID)
                                        await refreshRun()
                                      })
                                  }}
                                >
                                  {language.t("workflow.approve")}
                                </ButtonV2>
                              </Show>
                              <Show when={run().status === "waiting" || run().status === "running"}>
                                <ButtonV2
                                  variant="neutral"
                                  disabled={!!state.busy}
                                  onClick={() =>
                                    void perform("cancel", async () => {
                                      await api().cancel(run().id)
                                      await refreshRun()
                                    })
                                  }
                                >
                                  {language.t("workflow.cancel")}
                                </ButtonV2>
                              </Show>
                            </div>
                            <Show when={run().error}>
                              <p class="workflow-error" role="alert">
                                {run().error}
                              </p>
                            </Show>
                            <For each={run().steps.map((step) => step.nodeID)}>
                              {(nodeID) => {
                                const step = createMemo(() => run().steps.find((step) => step.nodeID === nodeID)!)
                                return (
                                  <details
                                    class="workflow-step-output"
                                    open={step().status === "waiting" || step().status === "failed"}
                                  >
                                    <summary>
                                      <span>
                                        {run().definition.nodes.find((node) => node.id === step().nodeID)?.name ??
                                          step().nodeID}
                                      </span>
                                      <span class="workflow-status" data-status={step().status}>
                                        {language.t(`workflow.status.${step().status}`)}
                                      </span>
                                    </summary>
                                    <Show when={step().sessionID}>
                                      {(id) => (
                                        <A
                                          class="workflow-session-link"
                                          href={sessionHref(ServerConnection.key(sdk().server), id())}
                                          onClick={(event) => {
                                            if (!discard()) {
                                              event.preventDefault()
                                              return
                                            }
                                            dialog.close()
                                          }}
                                        >
                                          {language.t("workflow.openSession")}
                                        </A>
                                      )}
                                    </Show>
                                    <Show when={step().output}>
                                      <pre>{step().output}</pre>
                                    </Show>
                                    <Show when={step().error}>
                                      <p class="workflow-error">{step().error}</p>
                                    </Show>
                                    <Show when={step().status === "waiting"}>
                                      <p>
                                        {
                                          run().definition.nodes.flatMap((node) =>
                                            node.id === step().nodeID && node.kind === "approval"
                                              ? [node.instructions]
                                              : [],
                                          )[0]
                                        }
                                      </p>
                                    </Show>
                                  </details>
                                )
                              }}
                            </For>
                          </div>
                        )}
                      </Show>
                    </section>
                  </fieldset>
                </div>
              )}
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  )
}
