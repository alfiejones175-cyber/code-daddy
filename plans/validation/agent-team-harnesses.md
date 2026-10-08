# Agent team harnesses — 30 September 2026

Extends the saved-team implementation in [agent-teams.md](agent-teams.md). Source is the dirty working tree on `dev`, based on `e4afec5344a5484fcfe7e1d995feec86fe62b8f2`; no commit or push was made.

## Implemented

- Purpose → Members setup, saved-team cards, collapsible member details, explicit model selection and provider pricing labels, review checklist, and preserved purpose when starting manually.
- Per-member required installed skills and concrete work standards. Missing/denied skills stop dispatch before creating a child; approval policies apply to the lead, role and session. Role model selection preserves provider permissions.
- Independent review member with restricted inspection tools; optional Jev code-review tool when source policy permits it. The lead receives a final-review workflow. Standards and final review are prompt guidance, not an automated completion gate.
- Tool-free AI team drafting from available source profiles and permitted installed skills, with bounded output and timeout. Draft validation requires standards and a separate reviewer; it cannot enable external Jev review automatically.
- Saved-team skill research prepares an editable normal chat with source-research instructions, current configuration and harness criteria. It does not send the prompt, install skills or write configuration.

## Local verification

- App typecheck; 20 focused transport/Jev/bootstrap/agent tests passed.
- Core team configuration/settings/draft validation: 12 passed. Focused agent projection/task permission tests: 34 passed. Jev plugin integration: 2 passed.
- Opencode typecheck; focused agent/task/registry tests passed 87 before final ceiling fixes; final targeted task regressions passed 3. An earlier combined run encountered an unrelated FSEvents failure; the fresh focused run passed.
- Schema, Protocol, Server and Client typechecks passed. Native client and legacy JavaScript SDK were regenerated through their scripts.
- Jev typecheck; 15 fixture tests passed. Sandbox execution could not open fixture listeners, so the successful rerun used explicitly approved loopback listeners.
- Opencode Jev concurrent-request fixture: 1 passed, proving identical requests join one provider call while a cancelled waiter does not cancel another active waiter.
- Browser production preview with disposable XDG storage: create/save/reopen retained two members, standards and review checklist. Blank setup preserved its purpose and naming a member kept reviewer selection at None. Research opened an unsent chat containing the source instructions and team configuration. No real app configuration was changed by these checks.
- Final overview was inspected at a 982 × 720 browser viewport; buttons and cards fit after compact-layout fixes. Programmatic viewport resizing was unavailable in this browser. [Overview screenshot](agent-team-harnesses-overview.jpg).
- V1 HTTP draft fixture: explicit selected model reached the local fake provider; missing model returned 503 without fallback; abort cancelled the provider request; configuration bytes remained identical. Dummy key and loopback model only.

- Native V2 HTTP draft fixture: after the location catalog became ready, explicit model selection returned a validated draft with 200; an unavailable model returned 503 without another provider call; cancellation aborted the provider fixture request; global/project configuration bytes stayed unchanged. The fixture exposed a missing LLMClient service in the first implementation. A location-scoped draft service now captures that client and local catalog/configuration dependencies, and the handler uses this service. Core/Server typechecks, four draft validation tests, and an independent review of scope/interruption passed after the fix. Dummy key and loopback model only.

## Jev audit

The shared evaluator now has a separate bounded code-simplicity operation (requirements, diffs and limited context; 20,000 characters total). It asks independent questions for scope, duplication and abstraction, allows insufficient evidence, and records a digest and rubric version. V1 and V2 canonical tools are registered. Reviewer permission tests cover actual hashed V2 names and preserve explicit denies.

Session output reviews reuse identical successful results by digest/rubric/model, join concurrent identical requests, propagate cancellation, and preserve the previous successful result if a changed-input retry fails. The app reports that failed attempt instead of presenting the old success as a new result. These are deterministic behavior checks; no accuracy or latency improvement on real code is claimed.

Primary API references reviewed: [state](https://docs.typesafe.ai/concepts/state), [models](https://docs.typesafe.ai/models), [fan-out](https://docs.typesafe.ai/patterns/fan-out), and [request options](https://docs.typesafe.ai/sdk/javascript/api/interfaces/RequestOptions). In particular, questions in one batch cannot inspect sibling answers; evidence-support questions now evaluate the supplied evidence independently.

A live advisory review was blocked by automatic approval review because it would upload private source excerpts to `https://api.typesafe.ai`. Specific upload permission was requested and remains pending. [Blocked attempt record](agent-teams-jev-code.json). No live Jev findings or quality benchmark are available.

## Desktop provenance

Final build uses the cached model catalog `/Users/alfredo/.cache/opencode/models.json`, modified 30 September 2026 at 00:17:38 BST (about 30 minutes before the final accepted build started). Default desktop sidecar remains V1; native HTTP drafting was verified separately with a disposable native server.

Build and `package:local` completed successfully. Installed at `/Users/alfredo/Applications/Code Daddy.app` on 30 September 2026 at approximately 00:50 BST, while the app was closed. Previous bundle retained at `/Users/alfredo/Applications/Code Daddy.previous-teams-20260930-004954.app`. No app data, credentials, settings or history were removed.

Packaged and installed `Contents/Resources/app.asar` both hash to:

```text
24efd4a413a9c190847b141fdff2d0df24ca3516b115b78a8b7cb2c34df8e044
```

Installed-app smoke through the desktop UI passed: Home loaded existing projects and recent sessions; Settings loaded; Teams displayed the new overview; New team opened Purpose with model selection and an enabled manual path; manual setup opened Members with the source lead selector, independent reviewer and disabled Save until configured. No test team was saved to the real configuration and no real model request was sent. [Installed setup screenshot](agent-team-harnesses-installed.png).

The V1/V2 model acceptance above uses controlled local fixtures. Real provider output quality and a live Jev code review remain separate from this desktop startup acceptance.
