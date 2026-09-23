import { expect, test } from "@playwright/test"
import {
  assistantID,
  assistantMessage,
  sessionID,
  setupTimeline,
  textPart,
  userMessage,
  userText,
} from "../performance/timeline-stability/fixture"

test("reviews a completed response and shows stale saved findings after reload", async ({ page }) => {
  const response = "Fixed the sample login handler. The login test passed."
  await setupTimeline(page, {
    messages: [
      userMessage([userText("Fix the sample login handler and run its test.")]),
      assistantMessage([textPart("prt_jev_response", response)]),
    ],
  })

  const evidence = [
    { id: "evidence-1", text: "login.test.ts: 1 passed, 0 failed", url: "https://example.com/test-log" },
  ]
  const review = {
    createdAt: 1,
    responseDigest: "response-digest",
    requirements: ["Fix the sample login handler and run its test."],
    evidence,
    result: {
      status: "ok",
      advisory: true,
      rubricVersion: "jev-output-review-1",
      model: "jev-1.13.0",
      findings: [
        { criterion: "requirements", assessment: "supported", evidenceID: "evidence-1" },
        { criterion: "checks", assessment: "concern", evidenceID: "evidence-1" },
        { criterion: "completion", assessment: "supported" },
        { criterion: "errors", assessment: "insufficient_evidence" },
      ],
    },
  }
  let saved = false
  let stale = false
  const submissions: unknown[] = []
  await page.route(`**/session/${sessionID}/jev-review/${assistantID}`, async (route) => {
    if (route.request().method() === "POST") {
      submissions.push(route.request().postDataJSON())
      saved = true
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: saved ? (stale ? "stale" : "reviewed") : "not_reviewed",
        responseDigest: "response-digest",
        review: saved ? review : null,
      }),
    })
  })

  const panel = page.getByRole("region", { name: "Response review" })
  await expect(panel.getByRole("button", { name: "Review response with Jev" })).toBeVisible()
  await panel.getByRole("button", { name: "Review response with Jev" }).click()
  await expect(panel).toContainText("Not reviewed")
  await panel.getByRole("button", { name: "Review response with Jev" }).click()
  await panel.getByRole("textbox", { name: "Evidence excerpt (optional)" }).fill(evidence[0]!.text)
  await panel.getByRole("textbox", { name: "Evidence link (optional)" }).fill(evidence[0]!.url)
  await panel.getByRole("button", { name: "Run review" }).click()

  await expect(panel).toContainText("Supports check claims")
  await expect(panel).toContainText("Concern")
  await expect(panel.getByRole("button", { name: "Address findings" })).toBeVisible()
  expect(submissions).toEqual([{ requirements: review.requirements, evidence }])

  stale = true
  await page.reload()
  const reloaded = page.getByRole("region", { name: "Response review" })
  await reloaded.getByRole("button", { name: "Review response with Jev" }).click()
  await expect(reloaded).toContainText("This review is stale because the response changed")
  await expect(reloaded.getByRole("button", { name: "Address findings" })).toHaveCount(0)
})
