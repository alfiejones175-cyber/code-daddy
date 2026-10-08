import { Workflow } from "@opencode-ai/schema/workflow"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Option, Schema } from "effect"
import { createEffect, createMemo, For, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"

const argumentsSchema = Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Record(Schema.String, Schema.Json)))

export function WorkflowInspector(props: {
  node: Workflow.Node
  nodes: readonly Workflow.Node[]
  edges: readonly Workflow.Edge[]
  catalog: Workflow.Catalog
  onChange: (node: Workflow.Node) => void
  onRemove: () => void
  onConnect: (to: string, outcome?: "yes" | "no") => void
  onDisconnect: (id: string) => void
  onInvalid: (invalid: boolean) => void
  onHarness: () => void
  harnessNeedsSave: boolean
}) {
  const language = useLanguage()
  const [state, setState] = createStore({ to: "", outcome: "yes" as "yes" | "no", arguments: "{}", invalid: false })
  createEffect(() => {
    const id = props.node.id
    untrack(() => {
      setState({
        to: "",
        arguments: props.node.kind === "mcp" ? JSON.stringify(props.node.arguments, null, 2) : "{}",
        invalid: false,
      })
      props.onInvalid(false)
    })
    return id
  })
  const connections = createMemo(() => props.edges.filter((edge) => edge.from === props.node.id))
  const candidates = createMemo(() => props.nodes.filter((node) => node.id !== props.node.id && node.kind !== "start"))
  return (
    <section class="workflow-inspector" aria-label={language.t("workflow.inspector")}>
      <div class="workflow-section-heading">
        <h3>{language.t("workflow.inspector")}</h3>
        <span class="workflow-kind">{language.t(`workflow.kind.${props.node.kind}`)}</span>
      </div>
      <label class="workflow-field">
        {language.t("workflow.stepName")}
        <input
          maxLength={200}
          value={props.node.name}
          onInput={(event) => props.onChange({ ...props.node, name: event.currentTarget.value })}
        />
      </label>
      <label class="workflow-field">
        {language.t("workflow.outputReference")}
        <input readOnly class="workflow-code" value={`{{steps.${props.node.id}}}`} />
      </label>
      <Show when={props.node.kind === "task" || props.node.kind === "computer" ? props.node : undefined}>
        {(node) => (
          <>
            <div class="workflow-inspector-harness">
              <ButtonV2 variant="neutral" onClick={props.onHarness}>
                {language.t(props.harnessNeedsSave ? "workflow.harness.saveOpen" : "workflow.harness.open")}
              </ButtonV2>
              <p class="workflow-hint">
                {language.t(node().harness ? "workflow.harness.acceptedDetails" : "workflow.harness.noneAccepted")}
              </p>
              <Show when={node().harness}>
                {(accepted) => (
                  <p class="workflow-hint">
                    {language.t("workflow.harness.executionAccepted", {
                      model: `${accepted().spec.model.providerID} / ${accepted().spec.model.modelID}`,
                    })}
                  </p>
                )}
              </Show>
            </div>
            <label class="workflow-field">
              {language.t("workflow.model")}
              <select
                value={`${node().model.providerID}/${node().model.modelID}`}
                onChange={(event) => {
                  const model = props.catalog.models.find(
                    (item) => `${item.providerID}/${item.modelID}` === event.currentTarget.value,
                  )
                  if (model)
                    props.onChange({ ...node(), model: { providerID: model.providerID, modelID: model.modelID } })
                }}
              >
                <option value="/">{language.t("workflow.selectModel")}</option>
                <Show
                  when={
                    node().model.modelID &&
                    !props.catalog.models.some(
                      (model) => model.modelID === node().model.modelID && model.providerID === node().model.providerID,
                    )
                  }
                >
                  <option
                    value={`${node().model.providerID}/${node().model.modelID}`}
                  >{`${node().model.providerID}/${node().model.modelID}`}</option>
                </Show>
                <For each={props.catalog.models}>
                  {(model) => (
                    <option value={`${model.providerID}/${model.modelID}`}>
                      {model.vision ? language.t("workflow.visionModel", { name: model.name }) : model.name}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <Show when={!props.catalog.models.length}>
              <p class="workflow-hint">{language.t("workflow.noModels")}</p>
            </Show>
            <Show when={node().kind === "computer"}>
              <p class="workflow-hint">{language.t("workflow.computerHint")}</p>
            </Show>
            <label class="workflow-field">
              {language.t("workflow.prompt")}
              <textarea
                rows={6}
                maxLength={100000}
                value={node().prompt}
                onInput={(event) => props.onChange({ ...node(), prompt: event.currentTarget.value })}
              />
            </label>
            <fieldset class="workflow-checklist">
              <legend>{language.t("workflow.skills")}</legend>
              <Show when={!props.catalog.skills.length}>
                <p class="workflow-hint">{language.t("workflow.noSkills")}</p>
              </Show>
              <For each={props.catalog.skills}>
                {(skill) => (
                  <label title={skill.description}>
                    <input
                      type="checkbox"
                      checked={node().skills.includes(skill.name)}
                      onChange={(event) =>
                        props.onChange({
                          ...node(),
                          skills: event.currentTarget.checked
                            ? [...node().skills, skill.name]
                            : node().skills.filter((name) => name !== skill.name),
                        })
                      }
                    />
                    <span>{skill.name}</span>
                  </label>
                )}
              </For>
            </fieldset>
            <fieldset class="workflow-checklist">
              <legend>{language.t("workflow.mcpServers")}</legend>
              <Show when={!props.catalog.servers.length}>
                <p class="workflow-hint">{language.t("workflow.noServers")}</p>
              </Show>
              <For each={props.catalog.servers}>
                {(server) => (
                  <label>
                    <input
                      type="checkbox"
                      checked={node().mcpServers.includes(server.name)}
                      onChange={(event) =>
                        props.onChange({
                          ...node(),
                          mcpServers: event.currentTarget.checked
                            ? [...node().mcpServers, server.name]
                            : node().mcpServers.filter((name) => name !== server.name),
                        })
                      }
                    />
                    <span>{server.name}</span>
                    <span class="workflow-hint">{server.status}</span>
                  </label>
                )}
              </For>
            </fieldset>
          </>
        )}
      </Show>
      <Show when={props.node.kind === "mcp" ? props.node : undefined}>
        {(node) => (
          <>
            <label class="workflow-field">
              {language.t("workflow.server")}
              <select
                value={node().server}
                onChange={(event) => {
                  setState({ arguments: "{}", invalid: false })
                  props.onInvalid(false)
                  props.onChange({ ...node(), server: event.currentTarget.value, tool: "", arguments: {} })
                }}
              >
                <option value="">{language.t("workflow.selectServer")}</option>
                <For each={props.catalog.servers}>{(server) => <option value={server.name}>{server.name}</option>}</For>
              </select>
            </label>
            <label class="workflow-field">
              {language.t("workflow.tool")}
              <select
                value={node().tool}
                onChange={(event) => props.onChange({ ...node(), tool: event.currentTarget.value })}
              >
                <option value="">{language.t("workflow.selectTool")}</option>
                <For each={props.catalog.tools.filter((tool) => tool.server === node().server)}>
                  {(tool) => <option value={tool.name}>{tool.name}</option>}
                </For>
              </select>
            </label>
            <label class="workflow-field">
              {language.t("workflow.arguments")}
              <span class="workflow-hint">{language.t("workflow.bindings", { inputToken: "{{input}}" })}</span>
              <textarea
                rows={7}
                class="workflow-code"
                value={state.arguments}
                aria-invalid={state.invalid}
                onInput={(event) => {
                  const text = event.currentTarget.value
                  setState("arguments", text)
                  const value = Schema.decodeUnknownOption(argumentsSchema)(text)
                  setState("invalid", Option.isNone(value))
                  props.onInvalid(Option.isNone(value))
                  if (Option.isSome(value)) props.onChange({ ...node(), arguments: value.value })
                }}
              />
            </label>
            <Show when={state.invalid}>
              <p role="alert" class="workflow-error">
                {language.t("workflow.invalidArguments")}
              </p>
            </Show>
            <Show when={props.catalog.tools.find((tool) => tool.server === node().server && tool.name === node().tool)}>
              {(tool) => (
                <details>
                  <summary>{language.t("workflow.toolSchema")}</summary>
                  <p class="workflow-hint">{tool().description}</p>
                  <pre class="workflow-code">{JSON.stringify(tool().inputSchema, null, 2)}</pre>
                </details>
              )}
            </Show>
          </>
        )}
      </Show>
      <Show when={props.node.kind === "decision" ? props.node : undefined}>
        {(node) => (
          <>
            <p class="workflow-hint">{language.t("workflow.clefHint")}</p>
            <Show when={!props.catalog.clefConfigured}>
              <p class="workflow-hint workflow-warning">{language.t("workflow.clefMissing")}</p>
            </Show>
            <label class="workflow-field">
              {language.t("workflow.model")}
              <select
                value={node().model}
                onChange={(event) =>
                  props.onChange({
                    ...node(),
                    model: event.currentTarget.value === "clef-flash" ? "clef-flash" : "clef",
                  })
                }
              >
                <option value="clef">Clef</option>
                <option value="clef-flash">Clef Flash</option>
              </select>
            </label>
            <label class="workflow-field">
              {language.t("workflow.question")}
              <textarea
                rows={4}
                value={node().question}
                maxLength={100000}
                onInput={(event) => props.onChange({ ...node(), question: event.currentTarget.value })}
              />
            </label>
            <label class="workflow-field">
              {language.t("workflow.threshold")}
              <input
                type="number"
                min={0.5}
                max={1}
                step={0.05}
                value={node().threshold}
                onInput={(event) => props.onChange({ ...node(), threshold: event.currentTarget.valueAsNumber })}
              />
            </label>
          </>
        )}
      </Show>
      <Show when={props.node.kind === "approval" ? props.node : undefined}>
        {(node) => (
          <label class="workflow-field">
            {language.t("workflow.instructions")}
            <textarea
              rows={5}
              maxLength={100000}
              value={node().instructions}
              onInput={(event) => props.onChange({ ...node(), instructions: event.currentTarget.value })}
            />
          </label>
        )}
      </Show>
      <section class="workflow-connections">
        <h4>{language.t("workflow.connections")}</h4>
        <Show when={!connections().length}>
          <p class="workflow-hint">{language.t("workflow.noConnections")}</p>
        </Show>
        <For each={connections()}>
          {(edge) => (
            <div class="workflow-connection">
              <span>
                <Show when={edge.outcome}>
                  {(outcome) => <strong>{language.t(outcome() === "yes" ? "workflow.yes" : "workflow.no")} → </strong>}
                </Show>
                {props.nodes.find((node) => node.id === edge.to)?.name ?? edge.to}
              </span>
              <button
                type="button"
                class="workflow-text-button"
                aria-label={language.t("workflow.removeConnection", {
                  name: props.nodes.find((node) => node.id === edge.to)?.name ?? edge.to,
                })}
                onClick={() => props.onDisconnect(edge.id)}
              >
                ×
              </button>
            </div>
          )}
        </For>
        <Show when={props.node.kind === "decision"}>
          <label class="workflow-field">
            {language.t("workflow.outcome")}
            <select
              value={state.outcome}
              onChange={(event) => setState("outcome", event.currentTarget.value === "yes" ? "yes" : "no")}
            >
              <option value="yes">{language.t("workflow.yes")}</option>
              <option value="no">{language.t("workflow.no")}</option>
            </select>
          </label>
        </Show>
        <label class="workflow-field">
          {language.t("workflow.connectTo")}
          <select value={state.to} onChange={(event) => setState("to", event.currentTarget.value)}>
            <option value="">{language.t("workflow.connectTo")}</option>
            <For each={candidates()}>{(node) => <option value={node.id}>{node.name}</option>}</For>
          </select>
        </label>
        <ButtonV2
          variant="neutral"
          disabled={!state.to}
          onClick={() => {
            props.onConnect(state.to, props.node.kind === "decision" ? state.outcome : undefined)
            setState("to", "")
          }}
        >
          {language.t("workflow.connect")}
        </ButtonV2>
      </section>
      <Show when={props.node.kind !== "start"}>
        <ButtonV2 variant="neutral" onClick={props.onRemove}>
          {language.t("workflow.removeStep")}
        </ButtonV2>
      </Show>
    </section>
  )
}
