import { Show, createEffect, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { createWorkspaceApi } from "@/utils/workspace-api"

export function SessionRecoveryNotice(props: { sessionID?: string; directory: string; workspaceID?: string }) {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()
  const protocol = useServerProtocol()
  const sync = useServerSync()
  const [state, setState] = createStore({ resuming: "", failed: false })
  createEffect(() => {
    props.sessionID
    sdk().scope
    setState({ resuming: "", failed: false })
  })
  const [status, actions] = createResource(
    () =>
      props.sessionID && protocol() === "v2"
        ? {
            id: props.sessionID,
            scope: sdk().scope,
            server: sdk().server.http,
            directory: props.directory,
            workspaceID: props.workspaceID,
            working: sync().session.data.session_working(props.sessionID),
          }
        : undefined,
    async (input) => {
      if (input.working) return { id: input.id, scope: input.scope, value: { type: "running" as const } }
      return createWorkspaceApi({ server: input.server, fetch: platform.fetch })
        .recovery(input, input.id)
        .then((value) => ({ id: input.id, scope: input.scope, value }))
        .catch(() => undefined)
    },
  )
  const current = () => {
    const value = status.latest
    return value && value.id === props.sessionID && value.scope === sdk().scope ? value.value : undefined
  }
  const resume = async () => {
    const id = props.sessionID
    if (!id || state.resuming) return
    const scope = sdk().scope
    setState({ resuming: id, failed: false })
    await createWorkspaceApi({ server: sdk().server.http, fetch: platform.fetch })
      .resume({ directory: props.directory, workspaceID: props.workspaceID }, id)
      .then(() => actions.refetch())
      .catch(() => {
        if (id === props.sessionID && scope === sdk().scope) setState("failed", true)
      })
    if (id === props.sessionID && scope === sdk().scope) setState("resuming", "")
  }
  return (
    <Show when={current()?.type === "needs_recovery" || current()?.type === "pending" || state.failed}>
      <div
        class="mx-2 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border border-border-weak-base bg-surface-base-active p-3"
        role="status"
        data-component="session-recovery"
      >
        <div class="min-w-0 flex-1 text-13-regular">
          <p class="font-medium text-text-strong">{language.t(state.failed ? "recovery.failed" : "recovery.title")}</p>
          <p class="mt-1 text-text-weak">{language.t("recovery.description")}</p>
        </div>
        <Button variant="secondary" disabled={!!state.resuming} onClick={() => void resume()}>
          <Show when={state.resuming} fallback={language.t("recovery.resume")}>
            <Spinner class="size-4" />
            {language.t("recovery.resuming")}
          </Show>
        </Button>
      </div>
    </Show>
  )
}
