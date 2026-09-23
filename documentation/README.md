# Development documentation

Start with the [current roadmap](../plans/README.md). The app is for the owner and a few friends, with English as the only required language. Priorities are OpenCode free-model access, reliable development checks, and Jev output review. Multilingual support and public-launch preparation are outside the current scope.

This is a locally maintained OpenCode-based workspace. The development desktop currently displays **Code Daddy**; the desired release direction remains **OpenCode**. Product naming, provider access, and update ownership are separate decisions. No package identity or model configuration was changed by this documentation update.

## Find the right document

| Need | Start here | Status / purpose |
| --- | --- | --- |
| Next implementation work | [Roadmap](../plans/README.md) | Current priorities and acceptance criteria |
| Codex-style workflows | [Codex workflow plan](../plans/codex-alignment.md) | Implemented source slices, installed-app limits, Sentry privacy choice, and remaining acceptance gaps |
| Run, build, and contribute | [Contributing](../CONTRIBUTING.md), [desktop setup](../packages/desktop/README.md), [app setup](../packages/app/README.md) | Development commands; root installation/download links describe upstream distributions |
| Update the installed local desktop app | [Desktop update workflow](desktop-updates.md) | Required rebuild, package, install, and provenance checks for Code Daddy development builds |
| Editing and test rules | [Repository instructions](../AGENTS.md) and package-local `AGENTS.md` files | Operating constraints; run tests/typechecks from package directories |
| Understand language requirements | [English-only scope](localization.md) | English copy and test requirements; historical translation backlog is out of scope |
| Configure or test Jev | [Jev package README](../packages/jev/README.md) | Implemented commands, settings, supported inputs, and limitations |
| Review UI consistency | [UI fixes and verification](../plans/jev-ui-fixes.md), [original Jev review](../plans/jev-ui-review.md) | Six repaired findings, browser/native checks, Jev assessments, and installed-build verification |
| Use or evaluate Jev output review | [Jev integration plan](../plans/jev-integration.md) | Explicit review flow, current validation, and later milestones |
| Understand session execution | [Runtime concepts](../CONTEXT.md), [V2 session contract](../specs/v2/session.md) | Vocabulary, invariants, implemented behavior, and migration gaps |
| Understand other V2 boundaries | [Configuration](../specs/v2/config.md), [provider/model](../specs/v2/provider-model.md), [tools](../specs/v2/tools.md), [instructions](../specs/v2/instructions.md), [provider policy](../specs/v2/provider-policy.md) | Architecture references; verify partial/missing claims against current code before implementation |
| Review project and storage designs | [Projects](../specs/project.md), [TUI package](../specs/tui-package.md), [storage design](../specs/storage/effect-sqlite-package.md), [storage migration proposal](../specs/storage/remove-opencode-db.md) | Domain-specific design references |
| Understand current risks | [Workspace review](../plans/007-workspace-review.md) | Dated findings and tests; not a continuously updated release certificate |
| Find previous feature work | [Plan index](../plans/README.md) | Links to implementation records, historical plans, and their acceptance limits |
| Inspect Jev audit evidence | [Core audit](../plans/validation/jev-audit-core.md), [platform audit](../plans/validation/jev-audit-platform.md), [response diagnostic](../plans/validation/jev-audit-response-diagnostic.md) | Dated investigations; candidate findings need source/test confirmation |

## Keep documentation useful

- `plans/README.md` owns priority and next steps. Update it when work changes status; link to details instead of copying the whole plan.
- Package READMEs own commands for implemented features. Mark proposed commands and controls explicitly; do not document them as already shipped.
- `specs/` and `CONTEXT.md` own architecture and invariants. Update affected behavior/status entries in the same change as the implementation.
- `plans/validation/` owns dated evidence, screenshots, and diagnostic results. Record the source snapshot, environment, and limits. Keep credentials out of artifacts.
- Historical reviews remain useful evidence. Add a dated status note when findings are repaired or superseded, rather than treating every old issue as still open.
- Keep user-facing model names from the current provider catalog. Historical free-model names and prices are not permanent product guarantees.

No new documentation system is required. These locations and links are the navigation layer for the existing material.
