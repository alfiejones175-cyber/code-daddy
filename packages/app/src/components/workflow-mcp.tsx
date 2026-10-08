import { For, Show, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"

export function WorkflowMcp(props: { directory: string; onConnected: () => void }) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const [state, setState] = createStore({
    name: "",
    type: "remote",
    value: "",
    busy: false,
    failed: false,
    connected: false,
    auth: "",
    savedName: "",
  })
  createEffect(() => {
    props.directory
    sdk().scope
    setState({ busy: false, failed: false, connected: false, auth: "", savedName: "" })
  })
  const add = async () => {
    if (state.busy) return
    const directory = props.directory
    const context = sdk()
    const client = context.createClient({ directory, throwOnError: true })
    const name = state.name.trim()
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setState("failed", true)
      return
    }
    const config =
      state.type === "remote"
        ? { type: "remote" as const, url: state.value.trim(), enabled: true }
        : await Promise.resolve()
            .then(() => JSON.parse(state.value) as unknown)
            .then((value) =>
              Array.isArray(value) &&
              value.length > 0 &&
              value.every((item): item is string => typeof item === "string" && !!item.trim())
                ? { type: "local" as const, command: value, enabled: true }
                : undefined,
            )
            .catch(() => undefined)
    if (
      !config ||
      (config.type === "remote" &&
        (!URL.canParse(config.url) || !["https:", "http:"].includes(new URL(config.url).protocol)))
    ) {
      setState("failed", true)
      return
    }
    setState({ busy: true, failed: false, connected: false, auth: "" })
    const current = () => props.directory === directory && sdk().scope === context.scope
    await client.mcp
      .status()
      .then(async (result) => {
        if (result.data?.[name] && state.savedName !== name) throw new Error("Duplicate server")
        await client.config.update({ config: { mcp: { [name]: config } } })
        if (current()) setState("savedName", name)
        const added = await client.mcp.add({ name, config })
        if (!current()) return
        const status = added.data?.[name]?.status
        setState({
          connected: status === "connected",
          failed: status !== "connected" && status !== "needs_auth",
          auth: status === "needs_auth" ? name : "",
        })
        props.onConnected()
      })
      .catch(() => {
        if (current()) setState("failed", true)
      })
    if (current()) setState("busy", false)
  }
  const authenticate = async () => {
    if (!state.auth || state.busy) return
    const directory = props.directory
    const context = sdk()
    setState({ busy: true, failed: false })
    await context
      .createClient({ directory, throwOnError: true })
      .mcp.auth.authenticate({ name: state.auth })
      .then((result) => {
        if (props.directory !== directory || sdk().scope !== context.scope) return
        const connected = result.data?.status === "connected"
        setState({ auth: connected ? "" : state.auth, connected, failed: !connected })
        props.onConnected()
      })
      .catch(() => {
        if (props.directory === directory && sdk().scope === context.scope) setState("failed", true)
      })
    if (props.directory === directory && sdk().scope === context.scope) setState("busy", false)
  }
  return (
    <details class="workflow-mcp-setup">
      <summary>{language.t("workflow.mcp.add")}</summary>
      <form
        class="flex flex-col gap-3 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <label class="flex flex-col gap-1">
          <span>{language.t("workflow.mcp.name")}</span>
          <TextInputV2 value={state.name} onInput={(event) => setState("name", event.currentTarget.value)} />
        </label>
        <label class="flex flex-col gap-1">
          <span>{language.t("workflow.mcp.transport")}</span>
          <select value={state.type} onChange={(event) => setState({ type: event.currentTarget.value, value: "" })}>
            <For each={["remote", "local"] as const}>
              {(type) => <option value={type}>{language.t(`workflow.mcp.${type}`)}</option>}
            </For>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span>{language.t(state.type === "remote" ? "workflow.mcp.url" : "workflow.mcp.command")}</span>
          <TextareaV2 value={state.value} rows={2} onInput={(event) => setState("value", event.currentTarget.value)} />
        </label>
        <p class="text-12-regular text-text-weak">{language.t("workflow.mcp.persist")}</p>
        <Show when={state.failed}>
          <p role="alert">{language.t("workflow.mcp.failed")}</p>
        </Show>
        <Show when={state.connected}>
          <p role="status">{language.t("workflow.mcp.connected")}</p>
        </Show>
        <Show when={state.auth}>
          <ButtonV2 type="button" onClick={() => void authenticate()} disabled={state.busy}>
            {language.t("workflow.mcp.authenticate")}
          </ButtonV2>
        </Show>
        <ButtonV2 type="submit" disabled={state.busy || !state.name.trim() || !state.value.trim()}>
          {language.t("workflow.mcp.connect")}
        </ButtonV2>
      </form>
    </details>
  )
}
