import { For, Show } from "solid-js"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/session-ui/dock-prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerProtocol } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { pluginPermissionDescription } from "./session-permission-description"

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}) {
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const protocol = useServerProtocol()

  const toolDescription = () => {
    const plugin = pluginPermissionDescription(props.request)
    if (plugin) return language.t(plugin.key, plugin.params)
    const key = `settings.permissions.tool.${props.request.permission}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return ""
    return value
  }

  return (
    <DockPrompt
      kind="permission"
      header={
        <div data-slot="permission-row" data-variant="header">
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">{language.t("notification.permission.title")}</div>
        </div>
      }
      footer={
        <>
          <div />
          <div data-slot="permission-footer-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {language.t("ui.permission.deny")}
            </Button>
            <Show when={props.request.always.length > 0}>
              <Button
                variant="secondary"
                size="normal"
                onClick={() => props.onDecide("always")}
                disabled={props.responding}
              >
                {language.t(protocol() === "v1" ? "ui.permission.allowAlways" : "permission.allowProject")}
              </Button>
            </Show>
            <Button variant="primary" size="normal" onClick={() => props.onDecide("once")} disabled={props.responding}>
              {language.t("ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <Show when={toolDescription()}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">{toolDescription()}</div>
        </div>
      </Show>

      <Show when={props.request.patterns.length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <For each={props.request.patterns}>
              {(pattern) => <code class="text-12-regular text-text-base break-all">{pattern}</code>}
            </For>
          </div>
        </div>
      </Show>
      <Show when={protocol() !== "v1" && props.request.always.length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div class="flex min-w-0 flex-col gap-1 text-12-regular text-text-weak">
            <p>
              {language.t("permission.projectScope", {
                action: props.request.permission,
                project: sync().data.path.worktree || sdk().directory,
              })}
            </p>
            <For each={props.request.always}>{(pattern) => <code class="break-all">{pattern}</code>}</For>
          </div>
        </div>
      </Show>
    </DockPrompt>
  )
}
