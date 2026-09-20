import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { currentSession, mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const project = {
  id: "project_capabilities",
  name: "capabilities-project",
  worktree: "C:/OpenCode/capabilities-project",
  vcs: "git",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
  sandboxes: [],
}
const session = {
  id: "ses_capabilities",
  title: "Capability checks",
  slug: "ses_capabilities",
  projectID: project.id,
  directory: project.worktree,
  version: "dev",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
}

test.use({ viewport: { width: 1280, height: 800 } })

test("workspace actions preserve the draft and capability setup exposes test status", async ({ page }) => {
  const capabilities: Capability[] = []
  const actions: string[] = []
  await setup(page, { capabilities, actions })
  await page.goto(href())

  const composer = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  await expect(composer).toBeVisible()
  await composer.fill("Keep this draft")
  await page.getByRole("button", { name: "Workspace tools", exact: true }).click()
  const tools = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Workspace tools" }) })
  await expect(tools).toBeVisible()
  await tools.getByRole("button", { name: "Set up capability", exact: true }).click()

  const settings = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Capabilities" }) })
  await expect(settings).toBeVisible()
  await settings.locator('[data-action="setup-browser"]').click()
  const browser = settings.locator('[data-capability="browser"]')
  await expect(browser.locator('[data-state="available"]')).toHaveText("Available to agents")
  await browser.getByRole("button", { name: "Test connection", exact: true }).click()
  await expect.poll(() => actions).toEqual(["setup:browser", "test:browser"])
  await page.screenshot({ path: "../../plans/validation/capabilities-setup.png", animations: "disabled" })
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Workspace tools", exact: true }).click()
  const browserTools = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Workspace tools" }) })
  await browserTools.getByLabel("URL", { exact: true }).fill("https://example.com/dashboard")
  await browserTools.getByRole("button", { name: "Prepare navigation", exact: true }).click()
  await expect(composer).toContainText("Keep this draft")
  await expect(composer).toContainText("https://example.com/dashboard")

  await page.getByRole("button", { name: "Workspace tools", exact: true }).click()
  const xcodeTools = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Workspace tools" }) })
  await xcodeTools.getByRole("tab", { name: "Xcode", exact: true }).click()
  await xcodeTools.getByRole("button", { name: "Set up capability", exact: true }).click()
  const xcodeSettings = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Capabilities" }) })
  await xcodeSettings.locator('[data-action="setup-xcode"]').click()
  await expect(xcodeSettings.locator('[data-capability="xcode"] [data-state="available"]')).toHaveText(
    "Available to agents",
  )
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Workspace tools", exact: true }).click()
  const preparedXcode = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Workspace tools" }) })
  await preparedXcode.getByRole("tab", { name: "Xcode", exact: true }).click()
  await preparedXcode.getByRole("button", { name: "Prepare build", exact: true }).click()
  await expect(composer).toContainText("Keep this draft")
  await expect(composer).toContainText("build the current project")
})

test("recovery resumes explicitly and clears only after the resume response", async ({ page }) => {
  let recovery: "needs_recovery" | "idle" = "needs_recovery"
  let resumes = 0
  await setup(page, {
    recovery: () => (recovery === "idle" ? { type: "idle" } : { type: "needs_recovery", reason: "promoted_input" }),
    resume: () => {
      resumes++
      recovery = "idle"
    },
  })
  await page.goto(href())

  const notice = page.locator('[data-component="session-recovery"]')
  await expect(notice).toContainText("This conversation has unfinished work")
  await page.screenshot({ path: "../../plans/validation/recovery-needs-review.png", animations: "disabled" })
  await notice.getByRole("button", { name: "Resume after review", exact: true }).click()
  await expect.poll(() => resumes).toBe(1)
  await expect(notice).toHaveCount(0)
  await page.screenshot({ path: "../../plans/validation/recovery-resumed.png", animations: "disabled" })
})

test("team preparation includes the selected model and bounded turn budget without replacing the draft", async ({
  page,
}) => {
  await setup(page)
  await page.goto(href())

  const composer = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  await expect(composer).toBeVisible()
  await composer.fill("Parent context stays here")
  await page.getByRole("button", { name: "Agent tasks", exact: true }).click()
  const team = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Agent tasks" }) })
  await expect(team).toBeVisible()
  await team.getByLabel("Task instructions", { exact: true }).fill("Audit the retry flow")
  await expect(page.getByRole("combobox", { name: "Agent", exact: true })).toHaveValue("explore")
  await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("mock-provider/mock-model")
  await page.getByRole("spinbutton", { name: "Maximum model turns (1–100)", exact: true }).fill("3")
  await page.screenshot({ path: "../../plans/validation/team-delegation-dialog.png", animations: "disabled" })
  await team.getByRole("button", { name: "Prepare delegated task", exact: true }).click()

  await expect(composer).toContainText("Parent context stays here")
  await expect(composer).toContainText('"subagent_type": "explore"')
  await expect(composer).toContainText('"max_turns": 3')
  await expect(composer).toContainText('"providerID": "mock-provider"')
  await expect(composer).toContainText('"id": "mock-model"')
  await page.screenshot({ path: "../../plans/validation/team-prepared-task.png", animations: "disabled" })
})

test("agent activity shows real child state and opens the selected child", async ({ page }) => {
  const children = [
    child("ses_team_running", "Trace the streaming path", "explore", 1_700_000_001_000),
    child("ses_team_waiting", "Confirm the permission boundary", "review", 1_700_000_002_000),
    child("ses_team_complete", "Summarize the protocol changes", "explore", 1_700_000_003_000),
  ]
  const events = [
    {
      id: "evt_team_complete_started",
      created: 1_700_000_002_500,
      type: "session.step.started",
      location: { directory: project.worktree },
      data: {
        sessionID: children[2]!.id,
        assistantMessageID: "msg_team_complete",
        agent: "explore",
        model: { id: "mock-model", providerID: "mock-provider" },
      },
    },
    {
      id: "evt_team_complete_ended",
      created: 1_700_000_003_000,
      type: "session.step.ended",
      location: { directory: project.worktree },
      data: {
        sessionID: children[2]!.id,
        assistantMessageID: "msg_team_complete",
        finish: "stop",
        cost: 0,
        tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    },
  ]
  await setup(page, {
    children,
    events: () => events.splice(0),
    sessionStatus: { [children[0]!.id]: { type: "running" } },
    permissions: [
      {
        id: "per_team_waiting",
        sessionID: children[1]!.id,
        action: "read",
        resources: ["src/session.ts"],
        metadata: {},
      },
    ],
  })
  await page.goto(href())

  await page.getByRole("button", { name: "Agent tasks", exact: true }).click()
  const team = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Agent tasks" }) })
  const running = team.locator(`[data-session-id="${children[0]!.id}"]`)
  const waiting = team.locator(`[data-session-id="${children[1]!.id}"]`)
  const complete = team.locator(`[data-session-id="${children[2]!.id}"]`)
  await expect(running).toHaveAttribute("data-status", "running")
  await expect(waiting).toHaveAttribute("data-status", "waiting")
  await expect(complete).toHaveAttribute("data-status", "complete")
  await expect(running).toContainText("explore")
  await expect(running).toContainText("mock-model")
  await expect(running.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
  await expect(waiting.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
  await expect(complete.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0)
  await expect(complete.getByRole("link", { name: children[2]!.title, exact: true })).toBeVisible()
  await expect(complete.locator("time")).toHaveAttribute("datetime", new Date(children[2]!.time.updated).toISOString())
  await expect(complete.locator("time")).toHaveAttribute("title", /^Updated /)
  await page.screenshot({ path: "../../plans/validation/spectrum-team-activity-desktop.png", animations: "disabled" })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(team).toBeVisible()
  await expect.poll(() => rowsDoNotOverlap(page)).toBe(true)
  await page.screenshot({ path: "../../plans/validation/spectrum-team-activity-compact.png", animations: "disabled" })

  await complete.getByRole("link", { name: children[2]!.title, exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/session/${children[2]!.id}`))
  await expectSessionTitle(page, children[2]!.title)
})

test("provider loading failure offers a working retry", async ({ page }) => {
  let attempts = 0
  await setup(page, {
    integrations: () => {
      attempts++
      return attempts === 1 ? undefined : []
    },
  })
  await page.goto(href())
  await expect(page.locator('[data-component="prompt-input"][contenteditable="true"]')).toBeVisible()

  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("tab", { name: "Providers", exact: true }).click()
  const providers = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Providers" }) })
  await expect(providers.getByRole("alert")).toHaveText(
    "Could not load providers. Check the server connection and try again.",
  )
  await providers.getByRole("button", { name: "Retry", exact: true }).click()
  await expect.poll(() => attempts).toBe(2)
  await expect(providers.getByRole("alert")).toHaveCount(0)
})

test("permission request explains the project-scoped persistent choice", async ({ page }) => {
  await setup(page, {
    permissions: [
      {
        id: "per_capabilities",
        sessionID: session.id,
        permission: "bash",
        patterns: ["git status"],
        always: ["git status"],
        metadata: {},
      },
    ],
  })
  await page.goto(href())

  await expect(page.getByText("Permission required", { exact: true })).toBeVisible()
  await expect(
    page.getByText(
      `Always allowing saves permission for bash in project ${project.worktree} for the patterns below, including matching pending requests.`,
    ),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Always allow in this project", exact: true })).toBeVisible()
})

test("dictation appends to the current draft and exposes recoverable recognition errors", async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => {
    // Replace the browser service boundary so this test never records microphone audio.
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: class {
        onstart?: () => void
        onresult?: (event: unknown) => void
        onerror?: (event: unknown) => void
        onend?: () => void
        start() {
          document.addEventListener("test-dictation", this.receive)
          this.onstart?.()
        }
        stop() {
          this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "spoken text" }, isFinal: true }] })
          this.onend?.()
          this.abort()
        }
        abort() {
          document.removeEventListener("test-dictation", this.receive)
        }
        receive = () => this.onerror?.({ error: "not-allowed" })
      },
    })
  })
  await page.goto(href())
  const composer = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  const button = page.locator('[data-action="prompt-transcribe"]')
  await expect(composer).toBeVisible()
  await composer.fill("Before")
  await button.click()
  await expect(button).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator('[data-component="dictation"] [role="status"]')).toHaveText("Listening…")
  await composer.fill("Edited while speaking")
  await button.click()
  await expect(composer).toContainText("Edited while speaking spoken text")
  await expect(button).toHaveAttribute("aria-pressed", "false")
  await button.click()
  await page.evaluate(() => document.dispatchEvent(new Event("test-dictation")))
  await expect(page.locator('[data-component="dictation"] [role="alert"]')).toContainText("Allow microphone")
  await expect(button).toHaveAttribute("aria-pressed", "false")
  await page.screenshot({ path: "../../plans/validation/dictation-permission.png", animations: "disabled" })
  await button.click()
  await expect(page.locator('[data-component="dictation"] [role="alert"]')).toHaveCount(0)
  await expect(button).toHaveAttribute("aria-pressed", "true")
  await page.screenshot({ path: "../../plans/validation/dictation-listening.png", animations: "disabled" })
})

type Capability = {
  id: "browser" | "xcode"
  name: string
  transport: "local"
  state: "available"
  tools: { name: string; source: string }[]
}

async function setup(
  page: Page,
  input?: {
    capabilities?: Capability[]
    actions?: string[]
    children?: ReturnType<typeof child>[]
    events?: () => unknown[]
    sessionStatus?: Record<string, unknown>
    recovery?: () => { type: "idle" } | { type: "needs_recovery"; reason: "promoted_input" }
    resume?: () => void
    integrations?: () => unknown[] | undefined
    permissions?: unknown[]
  },
) {
  await mockOpenCodeServer(page, {
    protocol: "v2",
    directory: project.worktree,
    project,
    sessions: [session, ...(input?.children ?? [])],
    provider: { all: [], connected: [], default: { providerID: "mock-provider", modelID: "mock-model" } },
    pageMessages: () => ({ items: [] }),
    fileList: () => [],
    findFiles: () => [],
    permissions: input?.permissions,
    events: input?.events,
    eventRetry: input?.events ? 16 : undefined,
    sessionStatus: input?.sessionStatus,
  })
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    const location = {
      directory: project.worktree,
      project: { id: project.id, directory: project.worktree },
    }
    if (url.pathname === "/api/integration" && route.request().method() === "GET") {
      const integrations = input?.integrations?.()
      if (integrations === undefined)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Provider catalog unavailable" }),
        })
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ location, data: integrations }),
      })
    }
    const body = (() => {
      if (url.pathname === "/api/project") return [project]
      if (url.pathname === "/api/project/current") return { id: project.id, directory: project.worktree }
      if (url.pathname === "/api/provider")
        return { location, data: [{ id: "mock-provider", name: "Mock Provider", package: "mock-provider" }] }
      if (url.pathname === "/api/model")
        return {
          location,
          data: [
            {
              id: "mock-model",
              providerID: "mock-provider",
              modelID: "mock-model",
              name: "Mock Model",
              package: "mock-provider",
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              variants: [],
              time: { released: 0 },
              cost: [],
              status: "active",
              enabled: true,
              limit: { context: 200_000, output: 8_192 },
            },
          ],
        }
      if (url.pathname === "/api/model/default")
        return { location, data: { id: "mock-model", providerID: "mock-provider" } }
      if (url.pathname === "/api/agent")
        return {
          location,
          data: [
            {
              id: "build",
              name: "build",
              mode: "primary",
              hidden: false,
              request: { settings: {}, headers: {}, body: {} },
              permissions: [],
            },
            {
              id: "explore",
              name: "explore",
              mode: "subagent",
              hidden: false,
              request: { settings: {}, headers: {}, body: {} },
              permissions: [],
            },
          ],
        }
      if (url.pathname === "/api/session")
        return {
          data: (url.searchParams.get("parentID") && url.searchParams.get("parentID") !== "null"
            ? (input?.children ?? []).filter((item) => item.parentID === url.searchParams.get("parentID"))
            : [session]
          ).map((item) => currentSession(item, project.worktree)),
          cursor: {},
        }
      if (url.pathname === `/api/session/${session.id}/recovery`) return input?.recovery?.() ?? { type: "idle" }
      if (url.pathname === `/api/session/${session.id}/resume` && route.request().method() === "POST") {
        input?.resume?.()
        return undefined
      }
      if (url.pathname === "/api/mcp" && route.request().method() === "GET")
        return { location, data: input?.capabilities ?? [] }
      const setup = url.pathname.match(/^\/api\/mcp\/preset\/(browser|xcode)$/)?.[1] as "browser" | "xcode" | undefined
      if (setup) {
        input?.actions?.push(`setup:${setup}`)
        const capability: Capability = {
          id: setup,
          name: setup === "browser" ? "Browser" : "Xcode",
          transport: "local",
          state: "available",
          tools: [{ name: setup === "browser" ? "browser.open" : "xcode.build", source: setup }],
        }
        if (!input?.capabilities?.some((item) => item.id === setup)) input?.capabilities?.push(capability)
        return { location, data: capability }
      }
      const capabilityAction = url.pathname.match(/^\/api\/mcp\/(browser|xcode)\/(test|reconnect)$/)
      if (capabilityAction) {
        input?.actions?.push(`${capabilityAction[2]}:${capabilityAction[1]}`)
        return { location, data: input?.capabilities?.find((item) => item.id === capabilityAction[1]) }
      }
    })()
    if (url.pathname === `/api/session/${session.id}/resume` && route.request().method() === "POST")
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } })
    if (body === undefined) return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(body),
    })
  })
  await page.addInitScript(
    ({ project, server, sessionID }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: project.worktree, expanded: true }] },
          lastProject: { local: project.worktree },
        }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: sessionID }]),
      )
    },
    { project, server, sessionID: session.id },
  )
}

function href() {
  return `/server/${base64Encode(server)}/session/${session.id}`
}

function child(id: string, title: string, agent: string, updated: number) {
  return {
    id,
    title,
    slug: id,
    parentID: session.id,
    projectID: project.id,
    directory: project.worktree,
    agent,
    model: { id: "mock-model", providerID: "mock-provider" },
    version: "dev",
    time: { created: updated - 1_000, updated },
  }
}

async function rowsDoNotOverlap(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".team-activity-row")].every((row) => {
      const state = row.querySelector<HTMLElement>(".team-activity-state")?.getBoundingClientRect()
      const stop = row.querySelector<HTMLElement>(".team-activity-stop")?.getBoundingClientRect()
      if (!state || !stop) return true
      return (
        state.bottom <= stop.top || state.right <= stop.left || stop.bottom <= state.top || stop.right <= state.left
      )
    }),
  )
}
