import { expect, test } from "@playwright/test"
import { assistantMessage, setupTimeline, toolPart, userMessage } from "../performance/timeline-stability/fixture"

test("shows Jev result states with a keyboard-accessible bounded disclosure", async ({ page }) => {
  const evidence = "e".repeat(24_000)
  const parts = [
    toolPart(
      "prt_jev_ok",
      "jev_triage_failure",
      "completed",
      { evidence },
      {
        output: JSON.stringify({
          status: "ok",
          advisory: true,
          category: "timing",
          confidence: 0.82,
        }),
      },
    ),
    toolPart(
      "prt_jev_unavailable",
      "plugin_jev_triage_failure_14s5b",
      "completed",
      { evidence },
      {
        output: JSON.stringify({
          status: "unavailable",
          reason: "missing_key",
          message: "Jev is unavailable because no API key is configured.",
        }),
      },
    ),
    toolPart(
      "prt_jev_rank_ok",
      "plugin_jev_rank_evidence_14s5b",
      "completed",
      {
        query: "Which supplied passage best supports the claim?",
        passages: [{ id: "models", text: "The provider documentation describes model availability." }],
      },
      {
        output: JSON.stringify({
          status: "ok",
          advisory: true,
          ranking: [{ id: "models", score: 2.99, confidence: 0.99 }],
        }),
      },
    ),
    toolPart(
      "prt_jev_invalid",
      "plugin_jev_rank_evidence_14s5b",
      "completed",
      { query: "Why did the regression fail?" },
      {
        output: JSON.stringify({
          status: "invalid_input",
          reason: "invalid_input",
          message: "Input did not match the expected schema.",
        }),
      },
    ),
  ]
  await setupTimeline(page, { messages: [userMessage(), assistantMessage(parts)], viewport: { width: 390, height: 844 } })

  const success = page.locator('[data-timeline-part-id="prt_jev_ok"]')
  const unavailable = page.locator('[data-timeline-part-id="prt_jev_unavailable"]')
  const ranking = page.locator('[data-timeline-part-id="prt_jev_rank_ok"]')
  const invalid = page.locator('[data-timeline-part-id="prt_jev_invalid"]')
  const trigger = success.getByRole("button", { name: /Jev failure triage.*Jev advisory result/ })

  await expect(success).toContainText("Jev failure triage")
  await expect(success).toContainText("Jev advisory result")
  await expect(unavailable).toContainText("Jev failure triage")
  await expect(unavailable).toContainText("Jev unavailable")
  await expect(unavailable).toContainText("Jev is unavailable because no API key is configured.")
  await expect(ranking).toContainText("Jev evidence ranking")
  await expect(ranking).toContainText("Jev advisory result")
  await expect(ranking.locator('[data-slot="basic-tool-tool-arg"]')).toContainText(
    "query=Which supplied passage best supports the claim?",
  )
  await expect(invalid).toContainText("Jev evidence ranking")
  await expect(invalid).toContainText("Input needs attention")
  await expect(invalid.locator('[data-slot="basic-tool-tool-arg"]')).toHaveText([
    "Input did not match the expected schema.",
    "query=Why did the regression fail?",
  ])
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect(trigger).not.toContainText(evidence.slice(0, 241))
  await expect(success.locator('[data-slot="basic-tool-tool-arg"]')).toHaveText("evidence · 24000 characters")

  await trigger.focus()
  await page.keyboard.press("Enter")
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  const inputDetail = success.locator('[data-slot="generic-tool-detail"]').filter({
    has: page.getByText("Input", { exact: true }),
  })
  await expect(inputDetail).toBeVisible()
  await expect(inputDetail.locator("pre")).toContainText(evidence)
  await expect
    .poll(() => success.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
})
