import { Workflow } from "@opencode-ai/schema/workflow"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { A } from "@solidjs/router"
import { Option, Schema } from "effect"
import { createEffect, createMemo, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { sessionHref } from "@/utils/session-route"
import { WorkflowRequestError, type WorkflowApi } from "@/utils/workflow-api"
import { canAcceptHarnessTrial, harnessExecutionModels, lowestHarnessExecutionModel } from "./harness-state"

const outputsSchema = Schema.UnknownFromJsonString.pipe(
  Schema.decodeTo(Schema.Record(Workflow.ID, Schema.String.check(Schema.isMaxLength(100_000)))),
)

export function WorkflowHarnessLab(props: {
  workflow: Workflow.Definition
  node: Extract<Workflow.Node, { kind: "task" | "computer" }>
  catalog: Workflow.Catalog
  initialInput: string
  api: (signal: AbortSignal) => WorkflowApi
  onAccepted: (definition: Workflow.Definition) => void
  onClose: () => void
}) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const dialog = useDialog()
  const controller = new AbortController()
  let heading: HTMLHeadingElement | undefined
  const client = props.api(controller.signal)
  const [state, setState] = createStore({
    loading: true,
    busy: "",
    error: "",
    notice: "",
    nodeFingerprint: "",
    draft: undefined as Workflow.HarnessDraft | undefined,
    trials: [] as Workflow.Run[],
    run: undefined as Workflow.Run | undefined,
    dirty: false,
    reviewed: false,
    designer: "",
    execution: "",
    goal: "",
    feedback: "",
    instructions: "",
    modelReason: "",
    allowedTools: [] as string[],
    timeoutSeconds: 120,
    maxOutputChars: 12000,
    outputFormat: "text" as "text" | "json",
    jsonKeys: "",
    checklist: "",
    input: props.initialInput,
    outputs: "{}",
  })
  onCleanup(() => controller.abort())
  const models = createMemo(() =>
    harnessExecutionModels(
      props.catalog,
      props.node.kind,
      state.allowedTools.length > 0 || props.node.kind === "computer",
    ),
  )
  const tools = createMemo(() => [
    ...(props.catalog.builtinTools ?? []).map((key) => ({ key, name: key })),
    ...props.catalog.tools.flatMap((tool) =>
      tool.key && props.node.mcpServers.includes(tool.server)
        ? [{ key: tool.key, name: `${tool.server} / ${tool.name}` }]
        : [],
    ),
  ])
  const priorNodes = createMemo(() => {
    const ids = new Set<string>()
    const visit = (id: string) =>
      props.workflow.edges
        .filter((edge) => edge.to === id)
        .forEach((edge) => {
          if (ids.has(edge.from)) return
          ids.add(edge.from)
          visit(edge.from)
        })
    visit(props.node.id)
    return props.workflow.nodes.filter((node) => ids.has(node.id))
  })
  const modelLabel = (model: Workflow.Catalog["models"][number]) =>
    model.cost && model.cost.input + model.cost.output > 0
      ? language.t("workflow.harness.price", {
          name: `${model.providerID} / ${model.name}`,
          input: model.cost.input,
          output: model.cost.output,
        })
      : language.t("workflow.harness.unknownPrice", { name: `${model.providerID} / ${model.name}` })
  const applySpec = (spec: Workflow.HarnessSpec) =>
    setState({
      execution: `${spec.model.providerID}/${spec.model.modelID}`,
      instructions: spec.instructions,
      modelReason: spec.modelReason,
      allowedTools: [...spec.allowedTools],
      timeoutSeconds: spec.timeoutSeconds,
      maxOutputChars: spec.maxOutputChars,
      outputFormat: spec.outputFormat,
      jsonKeys: spec.requiredJsonKeys.join("\n"),
      checklist: spec.checklist.join("\n"),
    })
  const applyDraft = (draft: Workflow.HarnessDraft) => {
    applySpec(draft.spec)
    setState({ draft, goal: draft.goal, feedback: draft.feedback, dirty: false, reviewed: false })
  }
  const load = async () => {
    setState({ loading: true, error: "" })
    await client
      .harness(props.workflow.id, props.node.id)
      .then((lab) => {
        if (controller.signal.aborted) return
        setState({
          nodeFingerprint: lab.nodeFingerprint,
          trials: [...lab.trials],
          run: lab.trials[0],
          designer: `${props.node.model.providerID}/${props.node.model.modelID}`,
        })
        if (lab.draft) applyDraft(lab.draft)
        if (!lab.draft) {
          applySpec(
            props.node.harness?.spec ?? {
              model: props.node.model,
              instructions: props.node.prompt,
              modelReason: "",
              allowedTools: [],
              timeoutSeconds: 120,
              maxOutputChars: 12000,
              outputFormat: "text",
              requiredJsonKeys: [],
              checklist: [],
            },
          )
          setState({ goal: props.node.prompt.slice(0, 4000), dirty: false, reviewed: false })
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState(
            "error",
            error instanceof WorkflowRequestError ? error.message : language.t("workflow.harness.failed"),
          )
      })
    if (!controller.signal.aborted) setState("loading", false)
  }
  onMount(() => {
    heading?.scrollIntoView({ block: "start" })
    heading?.focus({ preventScroll: true })
    void load()
  })
  const perform = async (action: string, work: () => Promise<unknown>) => {
    if (state.busy || controller.signal.aborted) return
    setState({ busy: action, error: "", notice: "" })
    await work().catch((error: unknown) => {
      if (!controller.signal.aborted)
        setState("error", error instanceof WorkflowRequestError ? error.message : language.t("workflow.harness.failed"))
    })
    if (!controller.signal.aborted) setState("busy", "")
  }
  const currentSpec = () => {
    const model = models().find((model) => `${model.providerID}/${model.modelID}` === state.execution)
    if (!model) return
    const spec = {
      model: { providerID: model.providerID, modelID: model.modelID },
      instructions: state.instructions,
      modelReason: state.modelReason,
      allowedTools: state.allowedTools,
      timeoutSeconds: state.timeoutSeconds,
      maxOutputChars: state.maxOutputChars,
      outputFormat: state.outputFormat,
      requiredJsonKeys:
        state.outputFormat === "json"
          ? state.jsonKeys
              .split("\n")
              .map((key) => key.trim())
              .filter(Boolean)
          : [],
      checklist: state.checklist
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    }
    return Schema.is(Workflow.HarnessSpec)(spec) ? spec : undefined
  }
  const saveDraft = async () => {
    const spec = currentSpec()
    if (!spec) {
      setState("error", language.t("workflow.harness.invalidDraft"))
      return
    }
    const draft = await client.saveHarness(props.workflow.id, props.node.id, {
      spec,
      goal: state.goal,
      feedback: state.feedback,
      expectedRevision: state.draft?.revision ?? null,
      nodeFingerprint: state.nodeFingerprint,
    })
    if (controller.signal.aborted) return
    applyDraft(draft)
    return draft
  }
  const design = async () => {
    const designer = props.catalog.models.find((model) => `${model.providerID}/${model.modelID}` === state.designer)
    const execution = models().find((model) => `${model.providerID}/${model.modelID}` === state.execution)
    if (!designer || !execution || !state.goal.trim()) {
      setState("error", language.t("workflow.harness.invalidDesign"))
      return
    }
    if (state.draft && state.dirty && !(await saveDraft())) return
    if (controller.signal.aborted) return
    const draft = await client.designHarness(props.workflow.id, props.node.id, {
      designerModel: { providerID: designer.providerID, modelID: designer.modelID },
      executionModel: { providerID: execution.providerID, modelID: execution.modelID },
      goal: state.goal,
      feedback: state.feedback,
      expectedRevision: state.draft?.revision ?? null,
      nodeFingerprint: state.nodeFingerprint,
    })
    if (!controller.signal.aborted) applyDraft(draft)
  }
  const addRun = (run: Workflow.Run) => {
    if (controller.signal.aborted) return
    if (state.run?.id === run.id && state.run.updatedAt > run.updatedAt) return
    setState({ run, trials: [run, ...state.trials.filter((trial) => trial.id !== run.id)] })
  }
  const test = async () => {
    const outputs = Schema.decodeUnknownOption(outputsSchema)(state.outputs)
    if (Option.isNone(outputs)) {
      setState("error", language.t("workflow.harness.invalidOutputs"))
      return
    }
    const draft =
      state.dirty || !state.draft || state.draft.nodeFingerprint !== state.nodeFingerprint
        ? await saveDraft()
        : state.draft
    if (!draft || controller.signal.aborted) return
    setState("reviewed", false)
    addRun(
      await client.testHarness(props.workflow.id, props.node.id, {
        revision: draft.revision,
        input: state.input,
        outputs: outputs.value,
      }),
    )
  }
  const refresh = async () => {
    const ids = [
      ...new Set([
        ...(state.run ? [state.run.id] : []),
        ...state.trials.filter((run) => run.status === "running" || run.status === "waiting").map((run) => run.id),
      ]),
    ]
    await Promise.all(
      ids.map(async (id) => {
        const run = await client.run(id)
        if (
          controller.signal.aborted ||
          (state.trials.find((trial) => trial.id === id)?.updatedAt ?? 0) > run.updatedAt
        )
          return
        setState(
          "trials",
          state.trials.map((trial) => (trial.id === id ? run : trial)),
        )
        if (state.run?.id === id) setState("run", run)
      }),
    )
  }
  const activeTrial = createMemo(() => state.trials.some((run) => run.status === "running" || run.status === "waiting"))
  createEffect(() => {
    if (!activeTrial()) return
    const timer = setInterval(
      () =>
        void refresh().catch(() => {
          if (!controller.signal.aborted) setState("error", language.t("workflow.harness.failed"))
        }),
      2000,
    )
    onCleanup(() => clearInterval(timer))
  })
  const ready = createMemo(
    () =>
      props.node.harness?.testRunID !== state.run?.id &&
      canAcceptHarnessTrial({
        nodeID: props.node.id,
        nodeFingerprint: state.nodeFingerprint,
        draft: state.draft,
        run: state.run,
        dirty: state.dirty,
        reviewed: state.reviewed,
      }),
  )
  const step = createMemo(() => state.run?.steps.find((step) => step.nodeID === props.node.id))
  return (
    <section class="workflow-harness" aria-label={language.t("workflow.harness.title", { name: props.node.name })}>
      <header class="workflow-section-heading">
        <div>
          <h3 ref={heading} tabIndex={-1}>
            {language.t("workflow.harness.title", { name: props.node.name })}
          </h3>
          <p class="workflow-hint">{language.t("workflow.harness.description")}</p>
        </div>
        <ButtonV2
          variant="neutral"
          disabled={!!state.busy}
          onClick={() => {
            if (state.dirty && !window.confirm(language.t("workflow.harness.discard"))) return
            props.onClose()
          }}
        >
          {language.t("workflow.harness.close")}
        </ButtonV2>
      </header>
      <Show when={state.error}>
        <p role="alert" class="workflow-error">
          {state.error}
        </p>
        <ButtonV2
          variant="neutral"
          disabled={!!state.busy}
          onClick={() => {
            if (state.dirty && !window.confirm(language.t("workflow.harness.discard"))) return
            void load()
          }}
        >
          {language.t("workflow.refresh")}
        </ButtonV2>
      </Show>
      <Show when={state.notice}>
        <p role="status" class="workflow-hint">
          {state.notice}
        </p>
      </Show>
      <Show when={state.loading}>
        <p role="status" class="workflow-hint">
          {language.t("workflow.harness.loading")}
        </p>
      </Show>
      <Show when={!state.loading && state.nodeFingerprint}>
        <div class="workflow-harness-accepted">
          <Show
            when={props.node.harness}
            fallback={<p class="workflow-hint">{language.t("workflow.harness.noneAccepted")}</p>}
          >
            {(accepted) => (
              <details>
                <summary>
                  {language.t("workflow.harness.accepted", { time: new Date(accepted().acceptedAt).toLocaleString() })}
                </summary>
                <p class="workflow-hint">{`${accepted().spec.model.providerID} / ${accepted().spec.model.modelID}`}</p>
                <pre>{accepted().spec.instructions}</pre>
                <details>
                  <summary>{language.t("workflow.harness.acceptedDetails")}</summary>
                  <pre class="workflow-code">{JSON.stringify(accepted().spec, null, 2)}</pre>
                </details>
              </details>
            )}
          </Show>
        </div>
        <fieldset class="workflow-harness-form" disabled={!!state.busy}>
          <div class="workflow-harness-models">
            <label class="workflow-field">
              {language.t("workflow.harness.designer")}
              <select value={state.designer} onChange={(event) => setState("designer", event.currentTarget.value)}>
                <option value="">{language.t("workflow.selectModel")}</option>
                <For each={props.catalog.models}>
                  {(model) => <option value={`${model.providerID}/${model.modelID}`}>{modelLabel(model)}</option>}
                </For>
              </select>
            </label>
            <label class="workflow-field">
              {language.t("workflow.harness.execution")}
              <select
                value={state.execution}
                onChange={(event) => setState({ execution: event.currentTarget.value, dirty: true, reviewed: false })}
              >
                <option value="">{language.t("workflow.selectModel")}</option>
                <Show
                  when={
                    state.execution &&
                    !models().some((model) => `${model.providerID}/${model.modelID}` === state.execution)
                  }
                >
                  <option disabled value={state.execution}>
                    {language.t("workflow.harness.modelUnavailable", { model: state.execution })}
                  </option>
                </Show>
                <For each={models()}>
                  {(model) => <option value={`${model.providerID}/${model.modelID}`}>{modelLabel(model)}</option>}
                </For>
              </select>
            </label>
          </div>
          <div class="workflow-actions">
            <ButtonV2
              variant="neutral"
              onClick={() => {
                const model = lowestHarnessExecutionModel(
                  props.catalog,
                  props.node.kind,
                  state.allowedTools.length > 0 || props.node.kind === "computer",
                )
                if (!model) {
                  setState("notice", language.t("workflow.harness.noPrices"))
                  return
                }
                setState({
                  execution: `${model.providerID}/${model.modelID}`,
                  dirty: true,
                  reviewed: false,
                  notice: "",
                })
              }}
            >
              {language.t("workflow.harness.lowest")}
            </ButtonV2>
            <span class="workflow-hint">{language.t("workflow.harness.priceHint")}</span>
          </div>
          <label class="workflow-field">
            {language.t("workflow.harness.goal")}
            <textarea
              rows={2}
              maxLength={4000}
              value={state.goal}
              onInput={(event) => setState({ goal: event.currentTarget.value, dirty: true, reviewed: false })}
            />
          </label>
          <label class="workflow-field">
            {language.t("workflow.harness.feedback")}
            <textarea
              rows={2}
              maxLength={4000}
              value={state.feedback}
              onInput={(event) => setState({ feedback: event.currentTarget.value, dirty: true, reviewed: false })}
            />
          </label>
          <div class="workflow-actions">
            <ButtonV2
              disabled={!state.designer || !state.execution || !state.goal.trim() || activeTrial()}
              onClick={() => void perform("design", design)}
            >
              {language.t(state.draft ? "workflow.harness.refine" : "workflow.harness.design")}
            </ButtonV2>
            <span class="workflow-hint">{language.t("workflow.harness.draftHint")}</span>
          </div>
          <p class="workflow-hint workflow-span">{language.t("workflow.harness.designHint")}</p>
          <section class="workflow-harness-draft">
            <div class="workflow-section-heading">
              <h4>{language.t("workflow.harness.draft")}</h4>
              <span role="status" class="workflow-hint">
                {language.t(
                  state.dirty
                    ? "workflow.harness.unsaved"
                    : state.draft
                      ? "workflow.harness.saved"
                      : "workflow.harness.notSaved",
                )}
              </span>
            </div>
            <Show when={state.draft && state.draft.nodeFingerprint !== state.nodeFingerprint}>
              <p class="workflow-hint workflow-warning">{language.t("workflow.harness.stale")}</p>
            </Show>
            <label class="workflow-field">
              {language.t("workflow.harness.instructions")}
              <textarea
                rows={8}
                maxLength={12000}
                value={state.instructions}
                onInput={(event) => setState({ instructions: event.currentTarget.value, dirty: true, reviewed: false })}
              />
            </label>
            <details class="workflow-harness-advanced">
              <summary>{language.t("workflow.harness.advanced")}</summary>
              <div>
                <label class="workflow-field">
                  {language.t("workflow.harness.modelReason")}
                  <textarea
                    rows={2}
                    maxLength={4000}
                    value={state.modelReason}
                    onInput={(event) =>
                      setState({ modelReason: event.currentTarget.value, dirty: true, reviewed: false })
                    }
                  />
                </label>
                <fieldset class="workflow-checklist">
                  <legend>{language.t("workflow.harness.allowedTools")}</legend>
                  <For each={tools()}>
                    {(tool) => (
                      <label>
                        <input
                          type="checkbox"
                          checked={state.allowedTools.includes(tool.key)}
                          onChange={(event) =>
                            setState({
                              allowedTools: event.currentTarget.checked
                                ? [...state.allowedTools, tool.key]
                                : state.allowedTools.filter((key) => key !== tool.key),
                              dirty: true,
                              reviewed: false,
                            })
                          }
                        />
                        <span>{tool.name}</span>
                      </label>
                    )}
                  </For>
                  <For each={state.allowedTools.filter((key) => !tools().some((tool) => tool.key === key))}>
                    {(key) => (
                      <label>
                        <input
                          type="checkbox"
                          checked
                          onChange={() =>
                            setState({
                              allowedTools: state.allowedTools.filter((name) => name !== key),
                              dirty: true,
                              reviewed: false,
                            })
                          }
                        />
                        <span>{language.t("workflow.harness.unavailableTool", { name: key })}</span>
                      </label>
                    )}
                  </For>
                  <Show when={!state.allowedTools.length}>
                    <p class="workflow-hint">{language.t("workflow.harness.noTools")}</p>
                  </Show>
                </fieldset>
                <div class="workflow-harness-models">
                  <label class="workflow-field">
                    {language.t("workflow.harness.timeout")}
                    <input
                      type="number"
                      min={5}
                      max={300}
                      step={1}
                      value={state.timeoutSeconds}
                      onInput={(event) =>
                        setState({ timeoutSeconds: event.currentTarget.valueAsNumber, dirty: true, reviewed: false })
                      }
                    />
                  </label>
                  <label class="workflow-field">
                    {language.t("workflow.harness.maxOutput")}
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      value={state.maxOutputChars}
                      onInput={(event) =>
                        setState({ maxOutputChars: event.currentTarget.valueAsNumber, dirty: true, reviewed: false })
                      }
                    />
                  </label>
                </div>
                <label class="workflow-field">
                  {language.t("workflow.harness.outputFormat")}
                  <select
                    value={state.outputFormat}
                    onChange={(event) =>
                      setState({
                        outputFormat: event.currentTarget.value === "json" ? "json" : "text",
                        dirty: true,
                        reviewed: false,
                      })
                    }
                  >
                    <option value="text">{language.t("workflow.harness.textFormat")}</option>
                    <option value="json">{language.t("workflow.harness.jsonFormat")}</option>
                  </select>
                </label>
                <Show when={state.outputFormat === "json"}>
                  <label class="workflow-field">
                    {language.t("workflow.harness.jsonKeys")}
                    <textarea
                      rows={3}
                      value={state.jsonKeys}
                      onInput={(event) =>
                        setState({ jsonKeys: event.currentTarget.value, dirty: true, reviewed: false })
                      }
                    />
                  </label>
                </Show>
              </div>
            </details>
            <label class="workflow-field">
              {language.t("workflow.harness.checklist")}
              <textarea
                rows={3}
                value={state.checklist}
                onInput={(event) => setState({ checklist: event.currentTarget.value, dirty: true, reviewed: false })}
              />
              <span class="workflow-hint">{language.t("workflow.harness.checklistHint")}</span>
            </label>
            <ButtonV2 variant="neutral" disabled={activeTrial()} onClick={() => void perform("save", saveDraft)}>
              {language.t("workflow.harness.saveDraft")}
            </ButtonV2>
          </section>
          <section class="workflow-harness-trial">
            <h4>{language.t("workflow.harness.trialTitle")}</h4>
            <p class="workflow-hint workflow-warning">{language.t("workflow.harness.trialHint")}</p>
            <label class="workflow-field">
              {language.t("workflow.harness.trialInput")}
              <textarea
                rows={3}
                maxLength={100000}
                value={state.input}
                onInput={(event) => setState("input", event.currentTarget.value)}
              />
            </label>
            <label class="workflow-field">
              {language.t("workflow.harness.priorOutputs")}
              <textarea
                class="workflow-code"
                rows={3}
                value={state.outputs}
                onInput={(event) => setState("outputs", event.currentTarget.value)}
              />
              <span class="workflow-hint">{language.t("workflow.harness.priorOutputsHint")}</span>
            </label>
            <Show when={priorNodes().length}>
              <details class="workflow-harness-step-ids">
                <summary>{language.t("workflow.harness.priorStepIDs")}</summary>
                <For each={priorNodes()}>
                  {(node) => (
                    <label class="workflow-field">
                      {node.name}
                      <input readOnly class="workflow-code" value={node.id} />
                    </label>
                  )}
                </For>
              </details>
            </Show>
            <ButtonV2 disabled={activeTrial()} onClick={() => void perform("test", test)}>
              {language.t("workflow.harness.test")}
            </ButtonV2>
          </section>
        </fieldset>
        <section class="workflow-harness-results">
          <div class="workflow-section-heading">
            <h4>{language.t("workflow.history")}</h4>
            <Show when={state.run}>
              <ButtonV2 variant="neutral" disabled={!!state.busy} onClick={() => void perform("refresh", refresh)}>
                {language.t("workflow.refresh")}
              </ButtonV2>
            </Show>
          </div>
          <Show when={!state.trials.length}>
            <p class="workflow-hint">{language.t("workflow.harness.noTrials")}</p>
          </Show>
          <div class="workflow-run-list">
            <For each={state.trials}>
              {(run) => (
                <button
                  type="button"
                  class="workflow-run-item"
                  aria-pressed={state.run?.id === run.id}
                  disabled={!!state.busy}
                  onClick={() => setState({ run, reviewed: false })}
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
                  <Show when={run().status === "running" || run().status === "waiting"}>
                    <ButtonV2
                      variant="neutral"
                      disabled={!!state.busy}
                      onClick={() =>
                        void perform("cancel", async () => {
                          await client.cancel(run().id)
                          await refresh()
                        })
                      }
                    >
                      {language.t("workflow.harness.cancelTrial")}
                    </ButtonV2>
                  </Show>
                  <Show when={step()?.sessionID}>
                    {(id) => (
                      <A
                        class="workflow-session-link"
                        href={sessionHref(ServerConnection.key(sdk().server), id())}
                        onClick={(event) => {
                          if (state.dirty && !window.confirm(language.t("workflow.harness.discard"))) {
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
                </div>
                <p class="workflow-hint">
                  {language.t("workflow.harness.trialRevision", { revision: run().trial?.revision ?? run().id })}
                </p>
                <Show when={run().trial?.revision !== state.draft?.revision}>
                  <p class="workflow-hint">{language.t("workflow.harness.previousTrial")}</p>
                </Show>
                <Show when={step()?.validation}>
                  {(validation) => (
                    <div class="workflow-harness-validation">
                      <strong class="workflow-status" data-status={validation().passed ? "completed" : "failed"}>
                        {language.t(
                          validation().passed
                            ? "workflow.harness.validationPassed"
                            : "workflow.harness.validationFailed",
                        )}
                      </strong>
                      <For each={validation().errors}>{(error) => <p class="workflow-error">{error}</p>}</For>
                    </div>
                  )}
                </Show>
                <Show when={step()?.output}>
                  <pre>{step()?.output}</pre>
                </Show>
                <Show when={step()?.error || run().error}>
                  <p role="alert" class="workflow-error">
                    {step()?.error ?? run().error}
                  </p>
                </Show>
              </div>
            )}
          </Show>
          <Show when={state.draft?.spec.checklist.length}>
            <div class="workflow-harness-review">
              <h4>{language.t("workflow.harness.checklist")}</h4>
              <ul>
                <For each={state.draft?.spec.checklist}>{(item) => <li>{item}</li>}</For>
              </ul>
              <p class="workflow-hint">{language.t("workflow.harness.checklistHint")}</p>
            </div>
          </Show>
          <label class="workflow-harness-review-check">
            <input
              type="checkbox"
              checked={state.reviewed}
              disabled={!!state.busy || state.run?.status !== "completed"}
              onChange={(event) => setState("reviewed", event.currentTarget.checked)}
            />
            <span>{language.t("workflow.harness.reviewed")}</span>
          </label>
          <p class="workflow-hint">{language.t("workflow.harness.acceptHint")}</p>
          <ButtonV2
            disabled={!!state.busy || !ready()}
            onClick={() =>
              void perform("accept", async () => {
                if (!state.draft || !state.run || !ready()) return
                const definition = await client.acceptHarness(props.workflow.id, props.node.id, {
                  revision: state.draft.revision,
                  testRunID: state.run.id,
                })
                if (controller.signal.aborted) return
                props.onAccepted(definition)
                setState("notice", language.t("workflow.harness.acceptedSaved"))
              })
            }
          >
            {language.t("workflow.harness.accept")}
          </ButtonV2>
        </section>
      </Show>
    </section>
  )
}
