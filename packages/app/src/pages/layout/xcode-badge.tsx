import { createEffect, createMemo, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"

type Kind = "xcodeproj" | "xcworkspace" | "swift-package" | "none"

export function XcodeBadge(props: { directory: string }) {
  const platform = usePlatform()
  const language = useLanguage()
  const [state, setState] = createStore({ kind: "none" as Kind })

  createEffect(() => {
    const scan = platform.xcodeScanProject
    if (!scan) return
    const directory = props.directory
    void scan(directory)
      .then((info) => setState("kind", info.kind))
      .catch(() => setState("kind", "none"))
  })

  const label = createMemo(() => {
    if (state.kind === "swift-package") return language.t("xcode.badge.package")
    return language.t("xcode.badge.ios")
  })

  return (
    <Show when={state.kind !== "none"}>
      <span
        data-component="xcode-badge"
        data-kind={state.kind}
        title={label()}
        class="shrink-0 rounded px-1 py-0.5 text-11-medium text-text-weak bg-surface-base-active"
      >
        {label()}
      </span>
    </Show>
  )
}
