import { createEffect, For, Match, on, onCleanup, onMount, Show, Switch, type Accessor, type JSX } from "solid-js"
import { animate, type AnimationPlaybackControls } from "motion"
import { useI18n } from "@opencode-ai/ui/context/i18n"
import { createStore } from "solid-js/store"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import type { IconProps } from "@opencode-ai/ui/icon"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"

export type TriggerTitle = {
  title: string
  titleClass?: string
  subtitle?: string
  subtitleClass?: string
  args?: string[]
  argsClass?: string
  action?: JSX.Element
}

const isTriggerTitle = (val: any): val is TriggerTitle => {
  return (
    typeof val === "object" && val !== null && "title" in val && (typeof Node === "undefined" || !(val instanceof Node))
  )
}

export interface BasicToolProps {
  icon: IconProps["name"]
  trigger: TriggerTitle | JSX.Element | ((open: Accessor<boolean>) => JSX.Element)
  children?: JSX.Element
  status?: string
  hideDetails?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  forceOpen?: boolean
  allowOpenWhilePending?: boolean
  defer?: boolean
  locked?: boolean
  animated?: boolean
  onSubtitleClick?: () => void
  onTriggerClick?: JSX.EventHandlerUnion<HTMLElement, MouseEvent>
  onTriggerKeyDown?: JSX.EventHandlerUnion<HTMLElement, KeyboardEvent>
  triggerHref?: string
  triggerAsLink?: boolean
  clickable?: boolean
}

const SPRING = { type: "spring" as const, visualDuration: 0.35, bounce: 0 }
const deferredMounts: Array<{ active: boolean; fn: () => void }> = []
let deferredFrame: number | undefined

function flushDeferredMounts() {
  while (deferredMounts.length > 0) {
    // Timeline tools are mounted top-to-bottom, but the viewport starts at the latest turn.
    // Pop from the end so heavy default-open bodies near the bottom become interactive first.
    const item = deferredMounts.pop()!
    if (item.active) {
      deferredFrame = deferredMounts.length > 0 ? requestAnimationFrame(flushDeferredMounts) : undefined
      item.fn()
      return
    }
  }
  deferredFrame = undefined
}

function scheduleDeferredFlush() {
  if (deferredFrame !== undefined) return
  deferredFrame = requestAnimationFrame(() => {
    deferredFrame = requestAnimationFrame(flushDeferredMounts)
  })
}

function scheduleDeferredMount(fn: () => void) {
  const item = { active: true, fn }
  deferredMounts.push(item)
  scheduleDeferredFlush()
  return () => {
    item.active = false
  }
}

function scheduleFrameMount(fn: () => void) {
  const frame = requestAnimationFrame(fn)
  return () => cancelAnimationFrame(frame)
}

export function BasicTool(props: BasicToolProps) {
  const [state, setState] = createStore({
    open: props.defaultOpen ?? false,
    ready: !props.defer && (props.defaultOpen ?? false),
  })
  const open = () => props.open ?? state.open
  const ready = () => state.ready
  const pending = () => props.status === "pending" || props.status === "running"
  const hasChildren = () => (props.defer ? "children" in props : props.children)
  const dynamicTrigger = typeof props.trigger === "function" ? props.trigger(open) : undefined

  let cancelReady: (() => void) | undefined

  const cancel = () => {
    cancelReady?.()
    cancelReady = undefined
  }

  const scheduleReady = (initial = false) => {
    cancel()
    cancelReady = (initial ? scheduleDeferredMount : scheduleFrameMount)(() => {
      cancelReady = undefined
      if (!open()) return
      setState("ready", true)
    })
  }

  onCleanup(cancel)

  onMount(() => {
    if (props.defer && open()) scheduleReady(true)
  })

  const setOpen = (value: boolean) => {
    if (props.open === undefined) setState("open", value)
    props.onOpenChange?.(value)
  }

  createEffect(() => {
    if (!props.forceOpen) return
    if (open()) return
    setOpen(true)
  })

  createEffect(
    on(
      open,
      (value) => {
        if (!props.defer) return
        if (!value) {
          cancel()
          setState("ready", false)
          return
        }

        scheduleReady()
      },
      { defer: true },
    ),
  )

  // Animated height for collapsible open/close
  let contentRef: HTMLDivElement | undefined
  let heightAnim: AnimationPlaybackControls | undefined
  const initialOpen = open()

  createEffect(
    on(
      open,
      (isOpen) => {
        if (!props.animated || !contentRef) return
        heightAnim?.stop()
        if (isOpen) {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "auto" }, SPRING)
          void heightAnim.finished.then(() => {
            if (!contentRef || !open()) return
            contentRef.style.overflow = "visible"
            contentRef.style.height = "auto"
          })
        } else {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "0px" }, SPRING)
        }
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    heightAnim?.stop()
  })

  const handleOpenChange = (value: boolean) => {
    if (pending() && !props.allowOpenWhilePending) return
    if (props.locked && !value) return
    setOpen(value)
  }

  const trigger = () => (
    <div
      data-component="tool-trigger"
      data-clickable={props.clickable ? "true" : undefined}
      data-hide-details={props.hideDetails ? "true" : undefined}
    >
      <div data-slot="basic-tool-tool-trigger-content">
        <div data-slot="basic-tool-tool-info">
          <Switch>
            <Match when={dynamicTrigger !== undefined}>{dynamicTrigger}</Match>
            <Match when={isTriggerTitle(props.trigger) && props.trigger}>
              {(title) => (
                <div data-slot="basic-tool-tool-info-structured">
                  <div data-slot="basic-tool-tool-info-main">
                    <span
                      data-slot="basic-tool-tool-title"
                      classList={{
                        [title().titleClass ?? ""]: !!title().titleClass,
                      }}
                    >
                      <TextShimmer text={title().title} active={pending()} />
                    </span>
                    <Show when={!pending() || title().subtitle || title().args?.length}>
                      <Show when={title().subtitle}>
                        <span
                          data-slot="basic-tool-tool-subtitle"
                          classList={{
                            [title().subtitleClass ?? ""]: !!title().subtitleClass,
                            clickable: !!props.onSubtitleClick,
                          }}
                          onClick={(e) => {
                            if (props.onSubtitleClick) {
                              e.stopPropagation()
                              props.onSubtitleClick()
                            }
                          }}
                        >
                          {title().subtitle}
                        </span>
                      </Show>
                      <Show when={title().args?.length}>
                        <For each={title().args}>
                          {(arg) => (
                            <span
                              data-slot="basic-tool-tool-arg"
                              classList={{
                                [title().argsClass ?? ""]: !!title().argsClass,
                              }}
                            >
                              {arg}
                            </span>
                          )}
                        </For>
                      </Show>
                    </Show>
                  </div>
                  <Show when={!pending() && title().action}>
                    <span data-slot="basic-tool-tool-action">{title().action}</span>
                  </Show>
                </div>
              )}
            </Match>
            <Match when={true}>{props.trigger as JSX.Element}</Match>
          </Switch>
        </div>
      </div>
      <Show when={hasChildren() && !props.hideDetails && !props.locked && (!pending() || props.allowOpenWhilePending)}>
        <Collapsible.Arrow />
      </Show>
    </div>
  )

  return (
    <Collapsible open={open()} onOpenChange={handleOpenChange} class="tool-collapsible">
      <Show
        when={props.triggerAsLink || props.triggerHref}
        fallback={
          <Collapsible.Trigger
            data-hide-details={props.hideDetails ? "true" : undefined}
            onClick={props.onTriggerClick}
          >
            {trigger()}
          </Collapsible.Trigger>
        }
      >
        <Collapsible.Trigger
          as="a"
          href={props.triggerHref}
          role={!props.triggerHref && props.clickable ? "button" : undefined}
          tabIndex={!props.triggerHref && props.clickable ? 0 : undefined}
          data-hide-details={props.hideDetails ? "true" : undefined}
          onClick={props.onTriggerClick}
          onKeyDown={props.onTriggerKeyDown}
        >
          {trigger()}
        </Collapsible.Trigger>
      </Show>
      <Show when={props.animated && hasChildren() && !props.hideDetails}>
        <div
          ref={contentRef}
          data-slot="collapsible-content"
          data-animated
          style={{
            height: initialOpen ? "auto" : "0px",
            overflow: initialOpen ? "visible" : "hidden",
          }}
        >
          <Show when={!props.defer || ready()}>{props.children}</Show>
        </div>
      </Show>
      <Show when={!props.animated && hasChildren() && !props.hideDetails}>
        <Collapsible.Content>
          <Show when={!props.defer || ready()}>{props.children}</Show>
        </Collapsible.Content>
      </Show>
    </Collapsible>
  )
}

function label(input: Record<string, unknown> | undefined) {
  const keys = ["description", "query", "url", "filePath", "path", "pattern", "name"]
  return keys
    .map((key) => input?.[key])
    .find((value): value is string => typeof value === "string" && value.length > 0)
    ?.slice(0, GENERIC_TOOL_PREVIEW_LIMIT)
}

export const GENERIC_TOOL_PREVIEW_LIMIT = 240
export const GENERIC_TOOL_DISCLOSURE_LIMIT = 48_000

export function genericToolArgs(
  input: Record<string, unknown> | undefined,
  payloadLabel: (input: { key: string; count: number }) => string,
) {
  if (!input) return []
  const skip = new Set(["description", "query", "url", "filePath", "path", "pattern", "name"])
  const payloads = new Set(["body", "content", "evidence", "text"])
  return Object.entries(input)
    .filter(([key]) => !skip.has(key))
    .flatMap(([key, value]) => {
      if (typeof value === "string") {
        if (payloads.has(key)) return [payloadLabel({ key, count: value.length }).slice(0, GENERIC_TOOL_PREVIEW_LIMIT)]
        const prefix = `${key}=`
        return [
          `${prefix.slice(0, GENERIC_TOOL_PREVIEW_LIMIT)}${value.slice(
            0,
            Math.max(0, GENERIC_TOOL_PREVIEW_LIMIT - prefix.length),
          )}`,
        ]
      }
      if (typeof value === "number") return [`${key}=${value}`.slice(0, GENERIC_TOOL_PREVIEW_LIMIT)]
      if (typeof value === "boolean") return [`${key}=${value}`.slice(0, GENERIC_TOOL_PREVIEW_LIMIT)]
      return []
    })
    .slice(0, 3)
}

export function genericToolDetail(value: unknown, unavailable = "") {
  try {
    const text = stringifyToolValue(value)
    return {
      text: text.slice(0, GENERIC_TOOL_DISCLOSURE_LIMIT),
      truncated: text.length > GENERIC_TOOL_DISCLOSURE_LIMIT,
    }
  } catch {
    return {
      text: unavailable,
      truncated: false,
    }
  }
}

function stringifyToolValue(value: unknown) {
  if (typeof value !== "string") return JSON.stringify(value, undefined, 2) ?? ""
  try {
    return JSON.stringify(JSON.parse(value), undefined, 2)
  } catch {
    return value
  }
}

function jevResult(tool: string, output: unknown) {
  if (!isJevTool(tool) || typeof output !== "string") return
  try {
    const parsed: unknown = JSON.parse(output)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return
    const result = parsed as Record<string, unknown>
    const status = result.status
    if (status !== "ok" && status !== "unavailable" && status !== "invalid_input") return
    return {
      status,
      message: typeof result.message === "string" ? result.message : undefined,
    }
  } catch {
    return
  }
}

function isJevTool(tool: string) {
  return (
    tool === "jev_triage_failure" ||
    tool === "jev_rank_evidence" ||
    /^plugin_jev_triage_failure_[a-z0-9]{1,7}$/.test(tool) ||
    /^plugin_jev_rank_evidence_[a-z0-9]{1,7}$/.test(tool)
  )
}

export function GenericTool(props: {
  tool: string
  status?: string
  hideDetails?: boolean
  input?: Record<string, unknown>
  output?: unknown
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  deferContent?: boolean
}) {
  const i18n = useI18n()
  const result = () => jevResult(props.tool, props.output)
  const output = () => genericToolDetail(props.output, i18n.t("ui.genericTool.unavailable"))
  const input = () => genericToolDetail(props.input, i18n.t("ui.genericTool.unavailable"))
  const subtitle = () => {
    const state = result()
    if (!state) return label(props.input)
    if (state.status === "ok") return i18n.t("ui.genericTool.jev.completed")
    if (state.status === "unavailable") return i18n.t("ui.genericTool.jev.unavailable")
    return i18n.t("ui.genericTool.jev.invalidInput")
  }
  const args = () => {
    const state = result()
    const payloadLabel = (input: { key: string; count: number }) =>
      i18n.t("ui.genericTool.characterCount", { name: input.key, count: input.count })
    if (!state?.message) return genericToolArgs(props.input, payloadLabel)
    return [state.message.slice(0, GENERIC_TOOL_PREVIEW_LIMIT), ...genericToolArgs(props.input, payloadLabel)].slice(0, 3)
  }

  return (
    <BasicTool
      icon="mcp"
      status={props.status}
      defaultOpen={props.defaultOpen}
      open={props.open}
      onOpenChange={props.onOpenChange}
      defer={props.deferContent}
      trigger={{
        title: isJevTool(props.tool)
          ? i18n.t("ui.genericTool.jev.title")
          : i18n.t("ui.basicTool.called", { tool: props.tool }),
        subtitle: subtitle(),
        args: args(),
      }}
      hideDetails={props.hideDetails}
    >
      <div data-component="generic-tool-output">
        <Show when={result()}>
          {(state) => (
            <p data-slot="generic-tool-result">
              <Show when={state().status === "ok"}>{i18n.t("ui.genericTool.jev.completed")}</Show>
              <Show when={state().status === "unavailable"}>{i18n.t("ui.genericTool.jev.unavailable")}</Show>
              <Show when={state().status === "invalid_input"}>{i18n.t("ui.genericTool.jev.invalidInput")}</Show>
            </p>
          )}
        </Show>
        <Show when={props.output !== undefined}>
          <section data-slot="generic-tool-detail">
            <span>{i18n.t("ui.genericTool.output")}</span>
            <pre>{output().text}</pre>
            <Show when={output().truncated}>
              <p>{i18n.t("ui.genericTool.truncated", { limit: GENERIC_TOOL_DISCLOSURE_LIMIT })}</p>
            </Show>
          </section>
        </Show>
        <Show when={props.input && Object.keys(props.input).length > 0}>
          <section data-slot="generic-tool-detail">
            <span>{i18n.t("ui.genericTool.input")}</span>
            <pre>{input().text}</pre>
            <Show when={input().truncated}>
              <p>{i18n.t("ui.genericTool.truncated", { limit: GENERIC_TOOL_DISCLOSURE_LIMIT })}</p>
            </Show>
          </section>
        </Show>
      </div>
    </BasicTool>
  )
}
