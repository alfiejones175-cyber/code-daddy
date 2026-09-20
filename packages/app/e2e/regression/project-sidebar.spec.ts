import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { currentSession, mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const projects = ["alpha-project", "bravo-project"].map((name) => ({
  id: `project_${name}`,
  name,
  worktree: `C:/OpenCode/${name}`,
  vcs: "git",
  time: { created: 1700000000000, updated: 1700000000000 },
  sandboxes: [],
}))
const sessions = [
  session("ses_sidebar_alpha", "Alpha conversation", projects[0]),
  session("ses_sidebar_bravo", "Bravo conversation", projects[1]),
  session("ses_sidebar_child", "Inspect project structure", projects[1], "ses_sidebar_bravo"),
]
const integrations = [
  {
    id: "openai",
    name: "OpenAI",
    methods: [
      { id: "chatgpt-browser", type: "oauth", label: "ChatGPT" },
      { type: "key", label: "API key" },
    ],
    connections: [],
  },
  { id: "openrouter", name: "OpenRouter", methods: [{ type: "key", label: "API key" }], connections: [] },
]

test.use({ viewport: { width: 1280, height: 800 } })

test("project navigation replaces top tabs and preserves multiple drafts", async ({ page }) => {
  await setup(page)
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)
  await expect(page.locator('[data-slot="titlebar-tabs"]')).toHaveCount(0)
  const sidebar = page.locator('[data-component="project-sidebar"]')
  const input = page.locator('[data-component="prompt-input-v2"] [data-component="prompt-input"]')
  await sidebar.locator('[data-action="sidebar-new-chat"]').click()
  await expect(page.locator('[data-action="prompt-project"]')).toBeVisible()
  await expect(page).toHaveURL(/\/new-session\?draftId=.+$/)
  await expectDraftScope(page, projects[1].worktree)
  await input.fill("First unfinished idea")
  const first = sidebar.getByRole("link", { name: "First unfinished idea", exact: true })
  await expect(first).toHaveAttribute("aria-current", "page")
  await sidebar.locator('[data-action="sidebar-new-chat"]').click()
  await expect(input).toHaveText("")
  await input.fill("Second unfinished idea")
  await first.click()
  await expect(input).toHaveText("First unfinished idea")
  await page.reload()
  await expect(input).toHaveText("First unfinished idea")
  await sidebar.getByRole("link", { name: "Second unfinished idea", exact: true }).click()
  await expect(input).toHaveText("Second unfinished idea")
  await sidebar.locator(`[data-session-id="${sessions[1].id}"]`).click()
  await expectSessionTitle(page, sessions[1].title)
  await expect(page.getByRole("button", { name: "Toggle review", exact: true })).toBeVisible()
  await page.screenshot({ path: "../../plans/validation/sidebar-without-top-tabs.png", animations: "disabled" })
})

test("new chat follows the canonical session's project and survives reload", async ({ page }) => {
  await setup(page)
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  const sidebar = page.locator('[data-component="project-sidebar"]')
  await expect(sidebar.getByRole("button", { name: projects[0].name, exact: true })).toHaveCount(1)
  await expect(sidebar.getByRole("button", { name: projects[1].name, exact: true })).toHaveCount(1)
  await expect(sidebar.locator(".project-sidebar-rail").getByRole("button")).toHaveCount(1)
  const selected = sidebar.locator(`[data-session-id="${sessions[1].id}"]`)
  await expect(selected).toHaveAttribute("href", href(sessions[1].id))
  await expect(selected).toHaveAttribute("aria-current", "page")
  await sidebar.locator('[data-action="sidebar-new-chat"]').click()

  await expect(page).toHaveURL(/\/new-session\?draftId=.+$/)
  await expect(
    page.locator('[data-action="prompt-project"]').getByText(projects[1].name, { exact: true }),
  ).toBeVisible()
  await expectDraftScope(page, projects[1].worktree)

  await page.reload()
  await expect(
    page.locator('[data-action="prompt-project"]').getByText(projects[1].name, { exact: true }),
  ).toBeVisible()
  await expectDraftScope(page, projects[1].worktree)
})

test("shows recent project token activity", async ({ page }) => {
  const now = Date.now()
  const active = {
    ...sessions[1],
    time: { created: now - 2 * 24 * 60 * 60 * 1000, updated: now - 2 * 24 * 60 * 60 * 1000 },
    tokens: { input: 1200, output: 800, reasoning: 400, cache: { read: 2400, write: 120 } },
  }
  const recent = {
    ...session("ses_sidebar_usage", "Usage activity", projects[1], undefined, {
      cost: 0.02,
      tokens: { input: 600, output: 350, reasoning: 150, cache: { read: 1200, write: 60 } },
    }),
    time: { created: now, updated: now },
  }
  await setup(page, { sessions: [sessions[0], active, recent, sessions[2]] })
  await page.goto(href(active.id))
  await expectSessionTitle(page, active.title)

  const activity = page.locator('[data-component="project-sidebar"] .sidebar-app-usage')
  await expect(activity).toHaveAttribute("aria-label", /Tokens/)
  await activity.click()
  const grid = page.getByRole("img", { name: /Tokens/ })
  await expect(grid).toBeVisible()
  await expect(grid.locator("span")).toHaveCount(42)
  await page.screenshot({ path: "../../plans/validation/project-token-activity.png", animations: "disabled" })
  await page.keyboard.press("Escape")
  await expect(grid).not.toBeVisible()
  await expect(activity).toBeFocused()
})

test("switching projects navigates to the canonical chat before creating a draft", async ({ page }) => {
  await setup(page)
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  const sidebar = page.locator('[data-component="project-sidebar"]')
  const list = sidebar.locator(".project-sidebar-list")
  const marker = list.locator(".sidebar-active-marker")
  const selected = list.locator('.sidebar-chat-row[data-selected="true"]')
  await expect(marker).toHaveAttribute("data-visible", "true")
  await expect(marker).toHaveAttribute("data-ready", "true")
  await expect(selected).toHaveCount(1)
  await expect.poll(() => markerAlignment(page)).toEqual({ aligned: true, sameHeight: true })
  const project = sidebar.locator(`[data-project="${base64Encode(projects[0].worktree)}"]`)
  const toggle = project.locator('[data-action="project-toggle"]')
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  await expect.poll(() => markerAlignment(page)).toEqual({ aligned: true, sameHeight: true })
  const initialTransform = await marker.evaluate((element) => (element as HTMLElement).style.transform)
  const chat = project.locator(`[data-session-id="${sessions[0].id}"]`)
  const chatRow = project.locator(`.sidebar-chat-row:has([data-session-id="${sessions[0].id}"])`)
  await expect(chat).toHaveAttribute("href", href(sessions[0].id))
  await chat.hover()
  await expect(selected).toHaveCount(1)
  await expect(chatRow).not.toHaveAttribute("data-selected", "true")
  await expect.poll(() => marker.evaluate((element) => (element as HTMLElement).style.transform)).toBe(initialTransform)
  await chat.click()

  await expect(page).toHaveURL((url) => url.pathname === href(sessions[0].id))
  await expectSessionTitle(page, sessions[0].title)
  await expect(chat).toHaveAttribute("aria-current", "page")
  await expect(selected).toHaveCount(1)
  await expect(chatRow).toHaveAttribute("data-selected", "true")
  await expect.poll(() => markerAlignment(page)).toEqual({ aligned: true, sameHeight: true })
  await expect
    .poll(() => marker.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe(initialTransform)
  await sidebar.locator('[data-action="sidebar-new-chat"]').click()
  await expect(
    page.locator('[data-action="prompt-project"]').getByText(projects[0].name, { exact: true }),
  ).toBeVisible()
  await expectDraftScope(page, projects[0].worktree)
})

test("the active conversation stays visible when newer chats exceed the project limit", async ({ page }) => {
  await setup(page, {
    sessions: [
      ...Array.from({ length: 7 }, (_, index) => ({
        ...session(`ses_sidebar_recent_${index}`, `Recent conversation ${index}`, projects[1]),
        time: { created: 1700000001000 + index, updated: 1700000001000 + index },
      })),
      ...sessions,
    ],
  })
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  const project = page.locator(`[data-component="project-group"][data-project="${base64Encode(projects[1].worktree)}"]`)
  await expect(project.locator('[data-session-id="ses_sidebar_recent_6"]')).toBeVisible()
  await expect(project.locator(`[data-session-id="${sessions[1].id}"]`)).toBeVisible()
  await expect(project.locator(`[data-session-id="${sessions[1].id}"]`)).toHaveAttribute("aria-current", "page")
})

test("a sandbox conversation belongs to its project and keeps its directory for new chat", async ({ page }) => {
  const sandbox = `${projects[1].worktree}-sandbox`
  const chat = session("ses_sidebar_sandbox", "Sandbox conversation", { ...projects[1], worktree: sandbox })
  await setup(page, { sessions: [...sessions, chat], sandbox })
  await page.goto(href(chat.id))
  await expectSessionTitle(page, chat.title)

  const sidebar = page.locator('[data-component="project-sidebar"]')
  const project = sidebar.locator(`[data-project="${base64Encode(projects[1].worktree)}"]`)
  await expect(project).toHaveAttribute("data-active", "true")
  await expect(project.locator(`[data-session-id="${chat.id}"]`)).toBeVisible()
  await expect(project.locator(`[data-session-id="${chat.id}"]`)).toHaveAttribute("aria-current", "page")
  await sidebar.locator('[data-action="sidebar-new-chat"]').click()

  await expect(page).toHaveURL(/\/new-session\?draftId=.+$/)
  await expectDraftScope(page, sandbox)
  await expect(sidebar.locator('[data-component="sidebar-current-project"]')).toHaveText(projects[1].name)
})

test("a child omitted from root results opens from its parent's disclosure", async ({ page }) => {
  await setup(page)
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  const project = page.locator(`[data-component="project-group"][data-project="${base64Encode(projects[1].worktree)}"]`)
  const disclosure = project
    .locator(".sidebar-chat-row")
    .filter({ has: page.locator(`[data-session-id="${sessions[1].id}"]`) })
    .locator('[data-action="session-children-toggle"]')
  const child = project.locator(`[data-session-id="${sessions[2].id}"]`)
  await expect(disclosure).toHaveAttribute("aria-expanded", "false")
  await expect(child).not.toBeVisible()
  await disclosure.click()

  await expect(disclosure).toHaveAttribute("aria-expanded", "true")
  await expect(child).toHaveAttribute("href", href(sessions[2].id))
  await child.click()
  await expect(page).toHaveURL((url) => url.pathname === href(sessions[2].id))
  await expect(child).toHaveAttribute("aria-current", "page")
  await expectSessionTitle(page, sessions[2].title)

  await project.locator(`[data-session-id="${sessions[1].id}"]`).click()
  await expect(page).toHaveURL((url) => url.pathname === href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  await page.evaluate(() => localStorage.setItem("opencode-color-scheme", "light"))
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  if (!(await child.isVisible())) await disclosure.click()
  await expect(child).toBeVisible()
  await page.screenshot({ path: "../../plans/validation/spectrum-sidebar-desktop-light.png", animations: "disabled" })

  await page.evaluate(() => localStorage.setItem("opencode-color-scheme", "dark"))
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark")
  if (!(await child.isVisible())) await disclosure.click()
  await expect(child).toBeVisible()
  await page.screenshot({ path: "../../plans/validation/spectrum-sidebar-desktop-dark.png", animations: "disabled" })
})

test("session usage stays independent and updates from cumulative session counters", async ({ page }) => {
  const events: unknown[] = []
  const parent = session(sessions[1].id, sessions[1].title, projects[1], undefined, {
    cost: 0.25,
    tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } },
  })
  const child = session(sessions[2].id, sessions[2].title, projects[1], sessions[1].id, {
    cost: 0.5,
    tokens: { input: 11, output: 13, reasoning: 17, cache: { read: 19, write: 23 } },
  })
  await setup(page, { sessions: [sessions[0], parent, child], events: () => events.splice(0, 1) })
  await page.addInitScript(() => localStorage.setItem("opencode-color-scheme", "dark"))
  await page.goto(href(parent.id))
  await expectSessionTitle(page, parent.title)
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark")

  const project = page.locator(`[data-component="project-group"][data-project="${base64Encode(projects[1].worktree)}"]`)
  const parentUsage = project.locator(`[data-session-usage="${parent.id}"]`)
  await expect(parentUsage).toHaveText("15Tokens")
  await expect(parentUsage.getByRole("button", { name: "Total Tokens: 15", exact: true })).toBeVisible()

  events.push({
    id: "evt_sidebar_usage",
    created: 1_700_000_001_000,
    type: "session.usage.updated",
    location: { directory: projects[1].worktree },
    data: {
      sessionID: parent.id,
      cost: 1.23456,
      tokens: { input: 1_200, output: 230, reasoning: 70, cache: { read: 300, write: 40 } },
    },
  })
  await expect(parentUsage).toHaveText("1.8KTokens")
  await expect(parentUsage.locator(".sidebar-usage-value")).toHaveClass(/tick/)
  await parentUsage.getByRole("button", { name: "Total Tokens: 1,840", exact: true }).click()

  const details = page.locator('[data-component="popover-content"]').filter({ hasText: parent.title })
  await expect(details.getByText("1,840", { exact: true })).toBeVisible()
  await expect(details.locator("dd")).toHaveText(["1,200", "230", "70", "300 / 40", "$1.2346"])
  await page.screenshot({ path: "../../plans/validation/spectrum-sidebar-usage-dark.png", animations: "disabled" })
  await details.getByRole("button", { name: "Close", exact: true }).click()

  const disclosure = project
    .locator(".sidebar-chat-row")
    .filter({ has: page.locator(`[data-session-id="${parent.id}"]`) })
    .locator('[data-action="session-children-toggle"]')
  await disclosure.click()
  const childUsage = project.locator(`[data-session-usage="${child.id}"]`)
  await expect(childUsage).toHaveText("83Tokens")
  await expect(childUsage.getByRole("button", { name: "Total Tokens: 83", exact: true })).toBeVisible()
  await expect(parentUsage).toHaveText("1.8KTokens")
  await expect(parentUsage.getByRole("button", { name: "Total Tokens: 1,840", exact: true })).toBeVisible()
})

test("session usage distinguishes recorded zero from unavailable counters", async ({ page }) => {
  const zero = session(sessions[0].id, sessions[0].title, projects[0], undefined, {
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })
  const missing = session("ses_sidebar_missing_usage", "Missing usage", projects[0])
  await setup(page, { sessions: [zero, missing, sessions[1], sessions[2]] })
  await page.goto(href(zero.id))
  await expectSessionTitle(page, zero.title)

  const project = page.locator(`[data-component="project-group"][data-project="${base64Encode(projects[0].worktree)}"]`)
  const zeroUsage = project.locator(`[data-session-usage="${zero.id}"]`)
  const missingUsage = project.locator(`[data-session-usage="${missing.id}"]`)
  await expect(zeroUsage).toHaveText("0Tokens")
  await expect(missingUsage).toHaveText("—Tokens")

  await zeroUsage.getByRole("button", { name: "Total Tokens: 0", exact: true }).click()
  const zeroDetails = page.locator('[data-component="popover-content"]').filter({ hasText: zero.title })
  await expect(zeroDetails.locator(".sidebar-usage-total strong")).toHaveText("0")
  await expect(zeroDetails.locator("dd")).toHaveText(["0", "0", "0", "0 / 0", "$0.00"])
  await zeroDetails.getByRole("button", { name: "Close", exact: true }).click()

  await missingUsage.getByRole("button", { name: "Total Tokens: —", exact: true }).click()
  const missingDetails = page.locator('[data-component="popover-content"]').filter({ hasText: missing.title })
  await expect(missingDetails.locator(".sidebar-usage-total strong")).toHaveText("—")
  await expect(missingDetails.locator("dd")).toHaveText(["—", "—", "—", "— / —", "—"])
})

test("a custom project logo persists through save, reload, and removal", async ({ page }) => {
  const requests: { directory?: string; body: unknown }[] = []
  await setup(page, {
    appearance: (request) => requests.push(request),
  })
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  const project = page.locator(`[data-component="project-group"][data-project="${base64Encode(projects[1].worktree)}"]`)
  await project.getByRole("button", { name: "Edit project", exact: true }).click()
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Edit project", exact: true }) })
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XyA9WQAAAABJRU5ErkJggg=="
  const source = `data:image/png;base64,${png}`
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "project.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") })
  await expect(dialog.locator('[data-slot="project-avatar-image"]')).toHaveAttribute("src", source)
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Save", exact: true }).click()

  await expect(dialog).not.toBeVisible()
  await expect(project.locator('[data-action="project-edit"] [data-slot="project-avatar-image"]')).toHaveAttribute(
    "src",
    source,
  )
  await page.screenshot({ path: "/tmp/opencode-sidebar-logo.png", animations: "disabled" })
  expect(requests).toEqual([
    {
      directory: encodeURIComponent(projects[1].worktree),
      body: { name: "", icon: { color: "", override: source }, commands: { start: "" } },
    },
  ])

  await page.reload()
  await expectSessionTitle(page, sessions[1].title)
  await expect(project.locator('[data-action="project-edit"] [data-slot="project-avatar-image"]')).toHaveAttribute(
    "src",
    source,
  )
  await project.getByRole("button", { name: "Edit project", exact: true }).click()
  await dialog.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(dialog.locator('[data-slot="project-avatar-image"]')).toHaveCount(0)
  await dialog.getByRole("button", { name: "Save", exact: true }).click()

  await expect(dialog).not.toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual({
    directory: encodeURIComponent(projects[1].worktree),
    body: { name: "", icon: { color: "", override: "" }, commands: { start: "" } },
  })
  await page.reload()
  await expectSessionTitle(page, sessions[1].title)
  await expect(project.locator('[data-action="project-edit"] [data-slot="project-avatar-image"]')).toHaveCount(0)
})

test("native task state makes a running delegation card open its subchat", async ({ page }) => {
  await setup(page)
  await page.route(`${server}/api/session/${sessions[1].id}/message*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        data: [
          {
            id: "msg_sidebar_assistant",
            type: "assistant",
            agent: "build",
            model: { id: "mock-model", providerID: "mock-provider" },
            time: { created: 1700000001000 },
            cost: 0,
            tokens: { input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
            content: [
              {
                type: "tool",
                id: "call_sidebar_task",
                name: "task",
                time: { created: 1700000001000, ran: 1700000001000 },
                state: {
                  status: "running",
                  input: {
                    description: sessions[2].title,
                    subagent_type: "explore",
                    prompt: "Inspect project structure",
                  },
                  structured: { sessionID: sessions[2].id, status: "running" },
                  content: [],
                },
              },
            ],
          },
          { id: "msg_sidebar_user", type: "user", text: "Inspect this project", time: { created: 1700000000000 } },
        ],
        cursor: {},
      }),
    }),
  )
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)
  const task = page.locator('[data-timeline-part-id="call_sidebar_task"]')
  await expect(task).toBeVisible()
  const link = task.locator(`a[href="${href(sessions[2].id)}"]`)
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL((url) => url.pathname === href(sessions[2].id))
  await expectSessionTitle(page, sessions[2].title)
})

test("a child follow-up posts to the child session", async ({ page }) => {
  await setup(page)
  await page.goto(href(sessions[2].id))
  await expectSessionTitle(page, sessions[2].title)

  const request = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" && new URL(candidate.url()).pathname === `/api/session/${sessions[2].id}/prompt`,
  )
  const input = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  await expect(input).toBeVisible()
  await input.fill("Continue in this child")
  await input.press("Enter")

  const prompt = await request
  expect(new URL(prompt.url()).pathname).toBe(`/api/session/${sessions[2].id}/prompt`)
  expect(prompt.postDataJSON()).toMatchObject({ text: "Continue in this child" })
})

test("Providers shows unconnected OpenAI and OpenRouter options", async ({ page }) => {
  await setup(page)
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  await page.locator(".sidebar-connections").click()
  await expect(page.getByRole("heading", { name: "Providers", exact: true })).toBeVisible()
  const openAI = page.locator(".settings-v2-provider-row").filter({ hasText: "OpenAI" })
  const openRouter = page.locator(".settings-v2-provider-row").filter({ hasText: "OpenRouter" })
  await expect(openAI).toBeVisible()
  await expect(openRouter).toBeVisible()
  await expect(openAI.getByRole("button", { name: "Connect", exact: true })).toBeVisible()
  await expect(openRouter.getByRole("button", { name: "Connect", exact: true })).toBeVisible()

  await openAI.getByRole("button", { name: "Connect", exact: true }).click()
  await expect(page.getByRole("button", { name: "ChatGPT", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Navigate back", exact: true }).click()
  await expect(openRouter).toBeVisible()
  await openRouter.getByRole("button", { name: "Connect", exact: true }).click()
  await expect(page.locator('[data-input="provider-api-key"]')).toBeVisible()
})

test("keyboard collapse keeps focus and rail actions with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await setup(page)
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  const sidebar = page.locator('[data-component="project-sidebar"]')
  const toggle = sidebar.locator('[data-action="sidebar-toggle"]')
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  await toggle.focus()
  await toggle.press("Enter")

  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(toggle).toBeFocused()
  await expect(sidebar.locator('[data-action="sidebar-new-chat"]')).toBeVisible()
  await expect(sidebar.locator('[data-action="sidebar-open-project"]')).toBeVisible()
  await expect(sidebar.locator('[data-action="sidebar-settings"]')).toBeVisible()
  await expect(sidebar.locator(`[data-session-id="${sessions[1].id}"]`)).not.toBeVisible()
  await expectSessionTitle(page, sessions[1].title)

  await toggle.press("Enter")
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  await expect(toggle).toBeFocused()
  await expect(sidebar.locator(`[data-session-id="${sessions[1].id}"]`)).toHaveAttribute("aria-current", "page")
  const marker = sidebar.locator(".sidebar-active-marker")
  await expect(marker).toHaveAttribute("data-visible", "true")
  await expect(marker).toHaveCSS("transition-duration", "0s")
  await expect.poll(() => markerAlignment(page)).toEqual({ aligned: true, sameHeight: true })
})

test("compact navigation traps focus and Escape restores the composer background", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto(href(sessions[1].id))
  await expectSessionTitle(page, sessions[1].title)

  const sidebar = page.locator('[data-component="project-sidebar"]')
  const toggle = sidebar.locator('[data-action="sidebar-toggle"]')
  const navigation = sidebar.getByRole("navigation")
  const main = page.locator("main")
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  await expect(main).toHaveAttribute("inert", "")
  const close = navigation.getByRole("button", { name: "Close", exact: true })
  await expect(close).toBeFocused()
  await expect(sidebar.locator(`[data-session-id="${sessions[1].id}"]`)).toHaveAttribute("aria-current", "page")
  await page.screenshot({ path: "../../plans/validation/spectrum-sidebar-compact.png", animations: "disabled" })

  const usage = sidebar.locator(`[data-session-usage="${sessions[1].id}"]`).getByRole("button", {
    name: "Total Tokens: —",
    exact: true,
  })
  await usage.click()
  const popover = page.locator('[data-component="popover-content"]').filter({ hasText: sessions[1].title })
  await expect(popover).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(popover).not.toBeVisible()
  await expect(usage).toBeFocused()
  await expect(toggle).toHaveAttribute("aria-expanded", "true")

  await close.focus()
  await page.keyboard.press("Shift+Tab")
  await expect(navigation.getByRole("button", { name: "Settings", exact: true })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(close).toBeFocused()
  await page.keyboard.press("Escape")

  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(toggle).toBeFocused()
  await expect(main).not.toHaveAttribute("inert", "")
  await expect(navigation).not.toBeVisible()
  await expectSessionTitle(page, sessions[1].title)
})

async function setup(
  page: Page,
  input?: {
    sessions?: ReturnType<typeof session>[]
    sandbox?: string
    events?: () => unknown[]
    appearance?: (request: { directory?: string; body: unknown }) => void
  },
) {
  const items = input?.sessions ?? sessions
  const directories = projects.map((project) => ({
    ...project,
    sandboxes: project.id === projects[1].id && input?.sandbox ? [input.sandbox] : [],
  }))
  await mockOpenCodeServer(page, {
    protocol: "v2",
    directory: projects[1].worktree,
    project: directories[1],
    sessions: items,
    provider: { all: [], connected: [], default: { providerID: "", modelID: "" } },
    pageMessages: () => ({ items: [] }),
    fileList: () => [],
    findFiles: () => [],
    events: input?.events,
    eventRetry: input?.events ? 16 : undefined,
  })
  await page.route(
    (url) => url.origin === server,
    async (route) => {
      const url = new URL(route.request().url())
      const directory = url.searchParams.get("location[directory]") ?? url.searchParams.get("directory")
      const project =
        directories.find((item) => item.worktree === directory || item.sandboxes.includes(directory ?? "")) ??
        directories[1]
      const body = (() => {
        const location = {
          directory: directory ?? project.worktree,
          project: { id: project.id, directory: project.worktree },
        }
        if (url.pathname === "/project" || url.pathname === "/api/project") return directories
        if (url.pathname === "/project/current") return project
        if (url.pathname === "/api/project/current") return { id: project.id, directory: project.worktree }
        if (url.pathname === "/api/project/current/appearance" && route.request().method() === "PATCH") {
          const payload = route.request().postDataJSON() as {
            name: string
            icon: { color: string; override: string }
            commands: { start: string }
          }
          input?.appearance?.({ directory: route.request().headers()["x-opencode-directory"], body: payload })
          Object.assign(project, {
            name: payload.name || project.name,
            icon: {
              color: payload.icon.color || undefined,
              override: payload.icon.override || undefined,
            },
            commands: { start: payload.commands.start || undefined },
          })
          return { location, data: project }
        }
        if (url.pathname === "/api/provider")
          return {
            location,
            data: [{ id: "mock-provider", name: "Mock Provider", package: "mock-provider" }],
          }
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
        if (url.pathname === "/api/integration") return { location, data: integrations }
        const integrationID = url.pathname.match(/^\/api\/integration\/([^/]+)$/)?.[1]
        if (integrationID)
          return { location, data: integrations.find((integration) => integration.id === integrationID) ?? null }
        if (url.pathname === "/path" || url.pathname === "/api/path")
          return {
            directory: directory ?? project.worktree,
            worktree: project.worktree,
            state: project.worktree,
            config: project.worktree,
            home: "C:/OpenCode",
          }
        if (url.pathname === "/api/session") {
          const parentID = url.searchParams.get("parentID")
          const matching = items
            .filter((item) => !directory || item.directory === directory)
            .filter((item) => !parentID || (parentID === "null" ? !item.parentID : item.parentID === parentID))
            .sort((a, b) =>
              url.searchParams.get("order") === "asc"
                ? a.time.created - b.time.created
                : b.time.updated - a.time.updated,
            )
          const offset = Number(url.searchParams.get("cursor") ?? 0)
          const limit = Number(url.searchParams.get("limit") ?? 50)
          return {
            data: matching.slice(offset, offset + limit).map((item) => ({
              ...currentSession(item),
              cost: "cost" in item ? item.cost : undefined,
              tokens: "tokens" in item ? item.tokens : undefined,
            })),
            cursor: { next: offset + limit < matching.length ? String(offset + limit) : undefined },
          }
        }
        const parentID = url.pathname.match(/^\/session\/([^/]+)\/children$/)?.[1]
        if (parentID) return items.filter((item) => item.parentID === parentID)
      })()
      if (body === undefined) return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      })
    },
  )
  await page.addInitScript(
    ({ projects, server, sessionId }) => {
      if (localStorage.getItem("opencode.window.browser.dat:tabs")) return
      localStorage.setItem("sidebar.project.open", "1")
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: projects.map((project) => ({ worktree: project.worktree, expanded: false })) },
          lastProject: { local: projects[0].worktree },
        }),
      )
      localStorage.setItem("opencode.window.browser.dat:tabs", JSON.stringify([{ type: "session", server, sessionId }]))
    },
    { projects: directories, server, sessionId: sessions[1].id },
  )
}

async function markerAlignment(page: Page) {
  return page.evaluate(() => {
    const marker = document.querySelector<HTMLElement>(".sidebar-active-marker")
    const selected = document.querySelector<HTMLElement>('.sidebar-chat-row[data-selected="true"]')
    if (!marker || !selected) return { aligned: false, sameHeight: false }
    const markerBounds = marker.getBoundingClientRect()
    const selectedBounds = selected.getBoundingClientRect()
    return {
      aligned: Math.abs(markerBounds.top - selectedBounds.top) < 1,
      sameHeight: Math.abs(markerBounds.height - selectedBounds.height) < 1,
    }
  })
}

async function expectDraftScope(page: Page, directory: string) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const tabs = JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]") as {
          type: string
          draftID?: string
          directory?: string
          server: string
        }[]
        const draft = tabs.find(
          (tab) => tab.type === "draft" && tab.draftID === new URL(location.href).searchParams.get("draftId"),
        )
        return draft ? { directory: draft.directory, server: draft.server } : undefined
      }),
    )
    .toEqual({ directory, server })
}

function session(
  id: string,
  title: string,
  project: (typeof projects)[number],
  parentID?: string,
  usage?: {
    cost: number
    tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  },
) {
  return {
    id,
    title,
    parentID,
    slug: id,
    projectID: project.id,
    directory: project.worktree,
    version: "dev",
    time: { created: 1700000000000, updated: 1700000000000 },
    ...usage,
  }
}

function href(sessionID: string) {
  return `/server/${base64Encode(server)}/session/${sessionID}`
}
