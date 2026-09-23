import { createMemo, createResource, For, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { requestJevReview } from "@/utils/jev-review"

const criteriaKeys = {
  requirements: "jevReview.criteria.requirements",
  checks: "jevReview.criteria.checks",
  completion: "jevReview.criteria.completion",
  errors: "jevReview.criteria.errors",
} as const

const assessmentKeys = {
  supported: "jevReview.assessment.supported",
  concern: "jevReview.assessment.concern",
  insufficient_evidence: "jevReview.assessment.insufficient_evidence",
} as const

export type JevReviewForm = {
  active: boolean
  open: boolean
  requirement: string
  evidence: string
  evidenceURL: string
  pending: boolean
  error: string
}

export function JevResponseReview(props: {
  sessionID: string
  messageID: string
  response: string
  requirement: string
  changedFiles: string[]
  form?: JevReviewForm
  onFormChange: (form: JevReviewForm) => void
  onPreparePrompt?: (text: string) => void
}) {
  const language = useLanguage()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const form = createMemo(
    () =>
      props.form ?? {
        active: false,
        open: false,
        requirement: props.requirement.slice(0, 2_000),
        evidence: "",
        evidenceURL: "",
        pending: false,
        error: "",
      },
  )
  const setForm = <K extends keyof JevReviewForm>(key: K, value: JevReviewForm[K]) =>
    props.onFormChange({ ...form(), [key]: value })
  const [state, { refetch }] = createResource(
    () =>
      form().active
        ? {
            server: serverSDK().server.http,
            directory: sdk().directory,
            sessionID: props.sessionID,
            messageID: props.messageID,
            response: props.response,
          }
        : undefined,
    (input) => requestJevReview(input),
  )
  const review = createMemo(() => state()?.review)
  const success = createMemo(() => {
    const result = review()?.result
    if (result?.status !== "ok") return
    return result
  })
  const findings = createMemo(() => {
    return success()?.findings ?? []
  })
  const concerns = createMemo(() => findings().filter((item) => item.assessment === "concern"))

  const submit = () => {
    if (form().pending || !form().requirement.trim()) return
    setForm("pending", true)
    setForm("error", "")
    const evidence = form().evidence.trim()
    void requestJevReview({
      server: serverSDK().server.http,
      directory: sdk().directory,
      sessionID: props.sessionID,
      messageID: props.messageID,
      payload: {
        requirements: [form().requirement.trim()],
        evidence: evidence
          ? [
              {
                id: "evidence-1",
                text: evidence,
                ...(form().evidenceURL.trim() ? { url: form().evidenceURL.trim() } : {}),
              },
            ]
          : [],
      },
    })
      .then(() => {
        setForm("open", false)
        void refetch()
      })
      .catch(() => setForm("error", language.t("jevReview.unavailable")))
      .finally(() => setForm("pending", false))
  }

  const prepareFindings = () => {
    if (!props.onPreparePrompt || concerns().length === 0) return
    props.onPreparePrompt(
      [
        "Address these advisory Jev review findings for the completed response. Recheck the original requirement and evidence before changing code:",
        ...concerns().map(
          (item) =>
            `- ${language.t(criteriaKeys[item.criterion])}: ${language.t(assessmentKeys[item.assessment])}${item.evidenceID ? ` (supplied excerpt: ${item.evidenceID})` : ""}`,
        ),
        "Explain what changed, which checks you actually ran, and anything unresolved.",
      ].join("\n"),
    )
    showToast({ title: language.t("jevReview.draftReady") })
  }

  const evidenceLink = (evidenceID: string | undefined) => {
    const item = review()?.evidence.find((entry) => entry.id === evidenceID)
    if (!item) return
    const url = item.url
    return url && /^https?:\/\//.test(url) ? url : undefined
  }

  return (
    <section
      class="mt-2 min-w-0 text-12-regular"
      aria-label={language.t("jevReview.heading")}
      data-component="jev-response-review"
    >
      <Show when={!form().active}>
        <Button size="small" variant="secondary" onClick={() => setForm("active", true)} data-action="jev-open-review">
          {language.t("jevReview.action")}
        </Button>
      </Show>
      <Show when={form().active}>
        <div class="rounded-lg border border-border-weak-base bg-background-base p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="text-12-medium text-text-strong">{language.t("jevReview.heading")}</div>
              <div class="text-text-weak">
                {state.loading
                  ? language.t("common.loading")
                  : state.error
                    ? language.t("jevReview.unavailable")
                    : state()?.status === "not_reviewed"
                      ? language.t("jevReview.notReviewed")
                      : state()?.status === "stale"
                        ? language.t("jevReview.stale")
                        : ""}
              </div>
            </div>
            <Button
              size="small"
              variant="secondary"
              onClick={() => setForm("open", !form().open)}
              data-action="jev-review-response"
            >
              {state()?.status === "reviewed" ? language.t("jevReview.retry") : language.t("jevReview.action")}
            </Button>
          </div>

          <Show when={success()}>
            <div class="mt-3 border-t border-border-weak-base pt-3">
              <p class="text-text-weak">{language.t("jevReview.advisory")}</p>
              <p class="mt-1 text-text-weak">
                {language.t("jevReview.provenance", {
                  model: success()?.model ?? "",
                  version: success()?.rubricVersion ?? "",
                })}
              </p>
              <ul class="mt-2 space-y-2">
                <For each={findings()}>
                  {(item) => (
                    <li class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span class="text-text-strong">{language.t(criteriaKeys[item.criterion])}</span>
                      <span class="text-text-weak">{language.t(assessmentKeys[item.assessment])}</span>
                      <Show when={item.evidenceID}>
                        {(id) => (
                          <Show when={evidenceLink(id())} fallback={<span class="text-text-weak">{id()}</span>}>
                            {(url) => (
                              <a class="underline" href={url()} target="_blank" rel="noopener noreferrer">
                                {id()}
                              </a>
                            )}
                          </Show>
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={props.changedFiles.length > 0}>
                <div class="mt-3 border-t border-border-weak-base pt-2">
                  <div class="text-text-strong">{language.t("jevReview.changedFiles")}</div>
                  <ul class="mt-1 space-y-1 text-text-weak">
                    <For each={props.changedFiles.slice(0, 10)}>{(file) => <li class="break-all">{file}</li>}</For>
                  </ul>
                </div>
              </Show>
              <Show when={review()?.evidence.length}>
                <div class="mt-3 border-t border-border-weak-base pt-2">
                  <div class="text-text-strong">{language.t("jevReview.suppliedEvidence")}</div>
                  <For each={review()?.evidence}>
                    {(item) => (
                      <details class="mt-1 text-text-weak">
                        <summary class="cursor-pointer">{item.id}</summary>
                        <pre class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words">{item.text}</pre>
                      </details>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={findings().some((item) => item.assessment === "insufficient_evidence")}>
                <p class="mt-2 text-text-weak">{language.t("jevReview.insufficient")}</p>
              </Show>
              <Show when={concerns().length > 0 && props.onPreparePrompt && state()?.status !== "stale"}>
                <Button
                  class="mt-3"
                  size="small"
                  variant="primary"
                  onClick={prepareFindings}
                  data-action="jev-address-findings"
                >
                  {language.t("jevReview.address")}
                </Button>
              </Show>
            </div>
          </Show>
          <Show when={review()?.result.status === "unavailable"}>
            <p class="mt-2 text-text-weak" role="status">
              {language.t("jevReview.unavailable")}
            </p>
          </Show>
          <Show when={review()?.result.status === "invalid_input"}>
            <p class="mt-2 text-text-weak" role="status">
              {language.t("jevReview.invalidInput")}
            </p>
          </Show>

          <Show when={form().open}>
            <form
              class="mt-3 space-y-3 border-t border-border-weak-base pt-3"
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <p class="text-text-weak">{language.t("jevReview.description")}</p>
              <label class="block text-text-strong">
                <span>{language.t("jevReview.requirement")}</span>
                <textarea
                  class="mt-1 block w-full resize-y rounded border border-border-weak-base bg-background-base p-2 text-text-strong"
                  rows={3}
                  maxLength={2_000}
                  required
                  value={form().requirement}
                  onInput={(event) => setForm("requirement", event.currentTarget.value)}
                />
              </label>
              <label class="block text-text-strong">
                <span>{language.t("jevReview.evidence")}</span>
                <span class="block text-text-weak">{language.t("jevReview.evidenceHint")}</span>
                <textarea
                  class="mt-1 block w-full resize-y rounded border border-border-weak-base bg-background-base p-2 text-text-strong"
                  rows={3}
                  maxLength={6_000}
                  value={form().evidence}
                  onInput={(event) => setForm("evidence", event.currentTarget.value)}
                />
              </label>
              <label class="block text-text-strong">
                <span>{language.t("jevReview.evidenceUrl")}</span>
                <input
                  class="mt-1 block w-full rounded border border-border-weak-base bg-background-base p-2 text-text-strong"
                  type="url"
                  maxLength={2_000}
                  value={form().evidenceURL}
                  onInput={(event) => setForm("evidenceURL", event.currentTarget.value)}
                />
              </label>
              <Show when={form().error}>
                <p role="alert" class="text-text-strong">
                  {form().error}
                </p>
              </Show>
              <Button
                size="small"
                variant="primary"
                type="submit"
                disabled={form().pending}
                data-action="jev-run-review"
              >
                {form().pending ? language.t("jevReview.running") : language.t("jevReview.submit")}
              </Button>
            </form>
          </Show>
        </div>
      </Show>
    </section>
  )
}
