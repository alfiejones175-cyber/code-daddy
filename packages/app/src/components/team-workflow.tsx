import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { For, Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { teamWorkflowLayers } from "@/utils/team-workflow"
import "./team-workflow.css"

export function TeamWorkflow(props: { steps: readonly AgentTeam.Step[]; compact?: boolean }) {
  const language = useLanguage()
  const [state, setState] = createStore({ selected: "" })
  const layers = createMemo(() => teamWorkflowLayers(props.steps))
  const nodes = createMemo(() =>
    layers().flatMap((layer, column) => layer.map((step, row) => ({ step, x: column * 220 + 8, y: row * 112 + 8 }))),
  )
  const height = () => Math.max(...layers().map((layer) => layer.length), 1) * 112 + 8
  const width = () => Math.max(layers().length, 1) * 220 - 12
  const selected = () => props.steps.find((step) => step.id === state.selected) ?? props.steps[0]
  return (
    <section class="team-workflow" data-compact={props.compact || undefined} aria-label={language.t("team.board.workflow")}>
      <div class="team-workflow-scroll" tabIndex={0} role="region" aria-label={language.t("team.board.diagram")}>
        <div class="team-workflow-canvas" style={{ width: `${width()}px`, height: `${height()}px` }}>
          <svg width={width()} height={height()} aria-hidden="true" class="team-workflow-edges">
            <For each={nodes()}>
              {(node) => (
                <For each={node.step.dependsOn ?? []}>
                  {(id) => {
                    const parent = () => nodes().find((item) => item.step.id === id)
                    return (
                      <Show when={parent()}>
                        {(from) => (
                          <path
                            d={`M ${from().x + 184} ${from().y + 44} C ${from().x + 202} ${from().y + 44}, ${node.x - 18} ${node.y + 44}, ${node.x} ${node.y + 44}`}
                          />
                        )}
                      </Show>
                    )
                  }}
                </For>
              )}
            </For>
          </svg>
          <For each={nodes()}>
            {(node) => (
              <button
                type="button"
                class="team-workflow-node"
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                aria-pressed={selected()?.id === node.step.id}
                onClick={() => setState("selected", node.step.id)}
                title={node.step.title}
              >
                <span class="team-workflow-node-title">{node.step.title}</span>
                <span>{node.step.role}</span>
                <Show when={node.step.approval}>
                  <strong>{language.t("team.board.decision")}</strong>
                </Show>
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={selected()}>
        {(step) => (
          <div class="team-workflow-detail" aria-live="polite">
            <div class="team-workflow-detail-heading">
              <strong>{step().title}</strong>
              <span>{language.t("team.board.owner", { role: step().role })}</span>
            </div>
            <p>{step().instructions}</p>
            <Show when={step().dependsOn?.length}>
              <p>
                {language.t("team.board.after", {
                  steps: step()
                    .dependsOn!.map((id) => props.steps.find((item) => item.id === id)?.title ?? id)
                    .join(", "),
                })}
              </p>
            </Show>
            <Show when={step().approval}>
              <p class="team-workflow-decision">{language.t("team.board.decisionHint")}</p>
            </Show>
            <Show when={step().deliverables?.length || step().checks?.length}>
              <details>
                <summary>{language.t("team.board.evidence")}</summary>
                <Show when={step().deliverables?.length}>
                  <p>{language.t("team.board.deliverables")}</p>
                  <ul><For each={step().deliverables}>{(item) => <li>{item}</li>}</For></ul>
                </Show>
                <Show when={step().checks?.length}>
                  <p>{language.t("team.board.checks")}</p>
                  <ul><For each={step().checks}>{(item) => <li>{item}</li>}</For></ul>
                </Show>
              </details>
            </Show>
          </div>
        )}
      </Show>
    </section>
  )
}
