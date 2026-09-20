import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:/OpenCode/PromptInputV2Editing"
const projectID = "proj_prompt_input_v2_editing"
const sessionID = "ses_prompt_input_v2_editing"

test("preserves the draft when a populated command menu triggers a built-in", async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "prompt-input-v2-editing",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [
      {
        id: sessionID,
        slug: "prompt-input-v2-editing",
        projectID,
        directory,
        title: "Prompt input V2 editing",
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
    )
    if (!localStorage.getItem("opencode-color-scheme")) localStorage.setItem("opencode-color-scheme", "dark")
  })

  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  const composer = page.locator('[data-component="prompt-input-v2"]')
  const input = composer.locator('[data-component="prompt-input"]')
  await expectAppVisible(composer)

  await input.fill("keep me")
  await composer.getByRole("button", { name: "Add images and files" }).click()
  await page.getByRole("menuitem", { name: "Commands" }).click()
  await page.locator('[data-suggestion-id="model.choose"]').click()

  await expect(input).toHaveText("keep me")
  const modelDialog = page.getByRole("dialog", { name: "Select model", exact: true })
  await expect(modelDialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(modelDialog).not.toBeVisible()
  await expect(composer).toHaveAttribute("data-mode", "normal")
  const controls = composer.locator('[data-slot="prompt-input-v2-controls"]')
  const pill = controls.locator('[data-component="button-v2"], [data-component="icon-button-v2"]').first()
  await expect(pill).toHaveCSS("border-radius", "999px")
  const pillStyle = await pill.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    shadow: getComputedStyle(element).boxShadow,
  }))
  expect(pillStyle.background).not.toBe("rgba(0, 0, 0, 0)")
  expect(pillStyle.shadow).not.toBe("none")

  const submit = composer.locator('[data-action="prompt-submit"]')
  await expect(submit).toBeEnabled()
  await submit.hover()
  await expect(submit).toHaveCSS("filter", "brightness(1.08)")
  await submit.focus()
  await expect(submit).toBeFocused()
  await page.screenshot({ path: "../../plans/validation/spectrum-composer-desktop-dark.png", animations: "disabled" })

  await composer.getByRole("button", { name: "Add images and files" }).click()
  await page.getByRole("menuitem", { name: "Shell command !", exact: true }).click()
  await expect(composer).toHaveAttribute("data-mode", "shell")
  await expect(controls).toHaveAttribute("aria-hidden", "true")
  await expect(submit).toHaveAttribute("tabindex", "-1")

  await page.emulateMedia({ reducedMotion: "reduce" })
  await expect(composer).toHaveCSS("transition-duration", "0s")
  await expect(pill).toHaveCSS("transition-duration", "0s")
  await expect(submit).toHaveCSS("transition-duration", "0s")

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => composerFitsViewport(page)).toBe(true)
  await page.screenshot({ path: "../../plans/validation/spectrum-composer-compact-shell.png", animations: "disabled" })

  await page.evaluate(() => localStorage.setItem("opencode-color-scheme", "light"))
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await expectAppVisible(composer)
  await page.screenshot({ path: "../../plans/validation/spectrum-composer-compact-light.png", animations: "disabled" })
})

async function composerFitsViewport(page: Page) {
  return page.evaluate(() => {
    const composer = document.querySelector<HTMLElement>('[data-component="prompt-input-v2"]')
    if (!composer) return false
    const bounds = composer.getBoundingClientRect()
    return bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight
  })
}
