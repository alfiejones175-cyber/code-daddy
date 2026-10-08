import { A } from "@solidjs/router"
import { createQuery } from "@tanstack/solid-query"
import { For, Show, createEffect, createMemo, onCleanup } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { TeamWorkflow } from "@/components/team-workflow"
import { normalizeSessionInfo } from "@/utils/session"
import { sessionHref } from "@/utils/session-route"
import { sidebarOutcome } from "@/pages/layout/project-sidebar-model"
import "./session-team-board.css"

export function SessionTeamBoard(props: {
  name: string
  team: AgentTeam.Info
  sessionID?: string
  onOpenTasks: () => void
}) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const sync = useServerSync()
  const children = createQuery(() => ({
    queryKey: [sdk().scope, "team-children", props.sessionID],
    enabled: !!props.sessionID,
    queryFn: async () => {
      const result = await sdk().api.session.list({ parentID: props.sessionID!, limit: 100, order: "desc" })
      return { items: result.data.map(normalizeSessionInfo), more: !!result.cursor.next }
    },
  }))
  createEffect(() => {
    const id = props.sessionID
    onCleanup(
      sdk().event.listen((event) => {
        if (event.details.type !== "session.created" && event.details.type !== "session.deleted") return
        const properties = event.details.properties as { info?: { parentID?: string; id?: string }; sessionID?: string }
        if (
          id &&
          (properties.info?.parentID === id ||
            children.data?.items.some((item) => item.id === (properties.info?.id ?? properties.sessionID)))
        )
          void children.refetch()
      }),
    )
  })
  const roles = createMemo(() => Object.entries(props.team.roles))
  const latest = (role: string) =>
    children.data?.items.find((child) => (sync().session.get(child.id) ?? child).agent === `team-${props.name}/${role}`)
  const status = (role: string) => {
    const child = latest(role)
    if (!child) return "planned"
    const data = sync().session.data
    if (data.permission[child.id]?.length || data.question[child.id]?.length) return "waiting"
    if (data.session_working(child.id)) return "running"
    return sidebarOutcome(data.session_message[child.id]?.at(-1))
  }
  const questions = () =>
    (props.sessionID ? (sync().session.data.question[props.sessionID]?.length ?? 0) : 0) +
    (children.data?.items.reduce((count, child) => count + (sync().session.data.question[child.id]?.length ?? 0), 0) ?? 0)
  return (
    <section class="session-team-board" aria-label={language.t("team.board.title")} data-component="session-team-board">
      <div class="session-team-board-heading">
        <div>
          <strong>{props.team.description || props.name}</strong>
          <span>{language.t("team.board.members", { count: roles().length })}</span>
        </div>
        <Show when={props.sessionID}>
          <Button variant="ghost" size="small" onClick={props.onOpenTasks}>{language.t("team.title")}</Button>
        </Show>
      </div>
      <Show when={questions()}>
        <p class="session-team-board-decision" role="status">{language.t("team.board.questions")}</p>
      </Show>
      <Show when={props.team.workflow?.length} fallback={<p>{language.t("team.board.noWorkflow")}</p>}>
        <TeamWorkflow steps={props.team.workflow!} compact />
        <p class="session-team-board-caption">{language.t("team.board.planHint")}</p>
      </Show>
      <details class="session-team-board-roster">
        <summary>{language.t("team.board.activity")}</summary>
        <Show when={children.isError}>
          <p role="alert">{language.t("team.board.loadError")}</p>
          <Button variant="ghost" onClick={() => void children.refetch()}>{language.t("common.retry")}</Button>
        </Show>
        <ul>
          <For each={roles()}>
            {([role, member]) => (
              <li>
                <div>
                  <strong>{role}</strong>
                  <Show when={member.description}><p>{member.description}</p></Show>
                  <span>{language.t(`team.board.status.${status(role)}`)}</span>
                </div>
                <Show when={latest(role)}>
                  {(child) => (
                    <A href={sessionHref(ServerConnection.key(sdk().server), child().id)}>
                      {language.t("team.board.openWork")}
                    </A>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={children.data?.more}><p>{language.t("team.board.more")}</p></Show>
      </details>
    </section>
  )
}
