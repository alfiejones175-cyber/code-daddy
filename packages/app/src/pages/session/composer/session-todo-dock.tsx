import type { Todo } from "@opencode-ai/sdk/v2"
import { AnimatedNumber } from "@opencode-ai/ui/animated-number"
import { DockTray } from "@opencode-ai/ui/dock-surface"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useSpring } from "@opencode-ai/ui/motion-spring"
import { TextReveal } from "@opencode-ai/ui/text-reveal"
import { TextStrikethrough } from "@opencode-ai/ui/text-strikethrough"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { For, Index, createEffect, createMemo } from "solid-js"
import { Dynamic } from "solid-js/web"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"

const doneToken = "\u0000done\u0000"
const totalToken = "\u0000total\u0000"

export function SessionTodoDock(props: {
  todos: Todo[]
  collapsed: boolean
  onToggle: () => void
  collapseLabel: string
  expandLabel: string
  dockProgress: number
}) {
  const language = useLanguage()
  const settings = useSettings()
  const [store, setStore] = createStore({
    height: 78,
  })

  const total = createMemo(() => props.todos.length)
  const done = createMemo(() => props.todos.filter((todo) => todo.status === "completed").length)
  const label = createMemo(() => language.t("session.todo.progress", { done: done(), total: total() }))
  const progress = createMemo(() =>
    language
      .t("session.todo.progress", { done: doneToken, total: totalToken })
      .split(/(\u0000done\u0000|\u0000total\u0000)/),
  )

  const active = createMemo(
    () =>
      props.todos.find((todo) => todo.status === "in_progress") ??
      props.todos.find((todo) => todo.status === "pending") ??
      props.todos.filter((todo) => todo.status === "completed").at(-1) ??
      props.todos[0],
  )

  const preview = createMemo(() => active()?.content ?? "")
  const collapse = useSpring(() => (props.collapsed ? 1 : 0), { visualDuration: 0.3, bounce: 0 })
  const dock = createMemo(() => Math.max(0, Math.min(1, props.dockProgress)))
  const shut = createMemo(() => 1 - dock())
  const value = createMemo(() => Math.max(0, Math.min(1, collapse())))
  const hide = createMemo(() => Math.max(value(), shut()))
  const off = createMemo(() => hide() > 0.98)
  const turn = createMemo(() => Math.max(0, Math.min(1, value())))
  const full = createMemo(() => Math.max(78, store.height))
  let contentRef: HTMLDivElement | undefined

  createEffect(() => {
    const el = contentRef
    if (!el) return
    const update = () => {
      setStore("height", (height) => Math.max(height, el.scrollHeight))
    }
    update()
    createResizeObserver(el, update)
  })

  return (
    <Dynamic
      component={settings.general.newLayoutDesigns() ? "div" : DockTray}
      data-component="session-todo-dock"
      classList={{
        "w-full overflow-hidden rounded-xl border-[0.5px] border-v2-border-border-base bg-v2-background-bg-layer-01":
          settings.general.newLayoutDesigns(),
      }}
      style={{
        "overflow-x": "visible",
        "overflow-y": "hidden",
        "max-height": `${Math.max(78, full() - value() * (full() - 78))}px`,
      }}
    >
      <div ref={contentRef}>
        <div
          data-action="session-todo-toggle"
          classList={{
            "flex items-center gap-2 overflow-visible": true,
            "h-[42px] pl-4 pr-2": settings.general.newLayoutDesigns(),
            "pl-3 pr-2 py-2": !settings.general.newLayoutDesigns(),
          }}
          role="button"
          tabIndex={0}
          onClick={props.onToggle}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            props.onToggle()
          }}
        >
          <span
            classList={{
              "cursor-default inline-flex items-baseline shrink-0 overflow-visible": true,
              "font-[440] text-[13px] leading-5 tracking-[-0.04px] text-v2-text-text-muted":
                settings.general.newLayoutDesigns(),
              "text-14-regular text-text-strong": !settings.general.newLayoutDesigns(),
            }}
            aria-label={label()}
            style={{
              "--tool-motion-odometer-ms": "600ms",
              "--tool-motion-mask": "18%",
              "--tool-motion-mask-height": "0px",
              "--tool-motion-spring-ms": "560ms",
              "white-space": "pre",
              opacity: `${Math.max(0, Math.min(1, 1 - shut()))}`,
            }}
          >
            <Index each={progress()}>
              {(item) =>
                item() === doneToken ? (
                  <AnimatedNumber value={done()} />
                ) : item() === totalToken ? (
                  <AnimatedNumber value={total()} />
                ) : (
                  <span>{item()}</span>
                )
              }
            </Index>
          </span>
          <div
            data-slot="session-todo-preview"
            class="ml-1 min-w-0 overflow-hidden"
            style={{
              flex: "1 1 auto",
              "max-width": "100%",
            }}
          >
            <TextReveal
              class={
                settings.general.newLayoutDesigns()
                  ? "cursor-default text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-faint"
                  : "text-14-regular text-text-base cursor-default"
              }
              text={props.collapsed ? preview() : undefined}
              duration={600}
              travel={25}
              edge={17}
              spring="cubic-bezier(0.34, 1, 0.64, 1)"
              springSoft="cubic-bezier(0.34, 1, 0.64, 1)"
              growOnly
              truncate
            />
          </div>
          <div class="ml-auto">
            <IconButton
              data-action="session-todo-toggle-button"
              data-collapsed={props.collapsed ? "true" : "false"}
              icon="chevron-down"
              size="normal"
              variant="ghost"
              style={{ transform: `rotate(${turn() * 180}deg)` }}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
                props.onToggle()
              }}
              aria-label={props.collapsed ? props.expandLabel : props.collapseLabel}
            />
          </div>
        </div>

        <div
          data-slot="session-todo-list"
          aria-hidden={props.collapsed || off()}
          classList={{
            "pointer-events-none": hide() > 0.1,
          }}
          style={{
            visibility: off() ? "hidden" : "visible",
            opacity: `${Math.max(0, Math.min(1, 1 - hide()))}`,
          }}
        >
          <TodoList todos={props.todos} />
        </div>
      </div>
    </Dynamic>
  )
}

function TodoList(props: { todos: Todo[] }) {
  const [store, setStore] = createStore({
    stuck: false,
  })
  const language = useLanguage()
  const todos = createMemo(() => [
    ...props.todos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled"),
    ...props.todos.filter((todo) => todo.status === "completed" || todo.status === "cancelled"),
  ])

  return (
    <div class="relative">
      <ol
        aria-label={language.t("ui.tool.todos")}
        class="px-3 pb-11 flex flex-col gap-1.5 max-h-42 overflow-y-auto no-scrollbar"
        style={{ "overflow-anchor": "none" }}
        onScroll={(e) => {
          setStore("stuck", e.currentTarget.scrollTop > 0)
        }}
      >
        <For each={todos()}>
          {(todo) => (
            <li
              data-component="agent-task-item"
              data-in-progress={todo.status === "in_progress" ? "" : undefined}
              data-state={todo.status}
              classList={{
                "flex items-start gap-3 rounded-lg border px-3 py-2 transition-[background-color,border-color,opacity,transform] duration-300": true,
                "border-v2-border-border-muted bg-v2-background-bg-base": todo.status === "pending",
                "border-v2-text-text-accent/40 bg-v2-text-text-accent/5 shadow-[0_0_20px_color-mix(in_srgb,var(--v2-text-text-accent)_8%,transparent)]":
                  todo.status === "in_progress",
                "border-v2-border-border-muted/60 bg-v2-background-bg-layer-01 opacity-70":
                  todo.status === "completed" || todo.status === "cancelled",
              }}
            >
              <TodoMarker status={todo.status} />
              <TextStrikethrough
                active={todo.status === "completed" || todo.status === "cancelled"}
                text={todo.content}
                class="text-14-regular min-w-0 break-words pt-px"
                style={{
                  "line-height": "var(--line-height-normal)",
                  color:
                    todo.status === "completed" || todo.status === "cancelled"
                      ? "var(--v2-text-text-muted)"
                      : "var(--v2-text-text-base)",
                }}
              />
            </li>
          )}
        </For>
      </ol>
      <div
        class="pointer-events-none absolute top-0 left-0 right-0 h-4 transition-opacity duration-150"
        style={{
          background: "linear-gradient(to bottom, var(--background-base), transparent)",
          opacity: store.stuck ? 1 : 0,
        }}
      />
    </div>
  )
}

function TodoMarker(props: { status: Todo["status"] }) {
  const finished = () => props.status === "completed" || props.status === "cancelled"
  return (
    <span
      aria-hidden="true"
      classList={{
        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-300": true,
        "border-v2-border-border-muted": props.status === "pending",
        "border-v2-text-text-accent bg-v2-text-text-accent/15": props.status === "in_progress",
        "border-v2-text-text-accent bg-v2-text-text-accent text-v2-background-bg-base": finished(),
      }}
    >
      {finished() ? (
        <svg viewBox="0 0 12 12" class="size-3" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="m2.2 6.1 2.2 2.2 5-5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      ) : props.status === "in_progress" ? (
        <span class="size-1.5 rounded-full bg-v2-text-text-accent animate-pulse motion-reduce:animate-none" />
      ) : null}
    </span>
  )
}
