# English-only language scope

Updated 22 September 2026 after the user clarified the app is for personal use and a few friends. **English is the only required UI language.** This supersedes the earlier plan to repair every inherited translation.

## What changes

- Remove the 61-locale translation backlog from active work. The old [audit snapshot](../plans/validation/localization-drift-2026-09-22.json) is historical evidence, not a list that must be completed.
- New features, including Jev review, need clear English copy, placeholders, accessible labels, and recovery messages. They do not need translated copies.
- Keep the existing English dictionaries and typed `language.t(...)`, `language.plural(...)`, and native translation APIs. They already organize copy and fallback behavior; removing the infrastructure would create unnecessary work and complicate upstream changes.
- Existing non-English dictionaries can remain as inherited assets without a completeness commitment. Do not translate, delete, or bulk-rewrite them merely to satisfy this scope change.
- Multilingual visual review, RTL acceptance, and locale expansion are not required for this private build. English keyboard accessibility, readable labels, and compact layouts still matter.

## Tests and runtime follow-through

The inherited parity suite currently requires non-English dictionaries to match English. That requirement is broader than this app's supported scope; it should become an explicit optional compatibility audit rather than a mandatory feature gate. Keep mandatory checks for valid English keys, interpolation, English singular/plural output, and renderer/native English copy. Do not disable unrelated application tests or change failed-test results into passes.

The current runtime can still choose a stored or operating-system locale, and its language picker still contains inherited languages. This documentation update does not alter those behaviors or the test suite. For current use, select English in Settings. If consistent first-launch behavior is needed for friends, make English the initial UI/native-menu choice in a small, tested follow-up; deliberately decide how to handle an existing saved locale instead of silently rewriting preferences.

The existing audit commands remain available for optional upstream compatibility work:

```sh
bun run script/translate-app.ts all --dry-run
bun run script/translate-app.ts all --check
```

These only inspect dictionaries. A nonzero translation-drift result is expected for inherited languages and does not establish an English UI defect. Do not run automatic translation for this app unless the user changes the language requirement.

## What stays in scope

OpenCode provider access, Jev output review, session recovery, correct model/cost reporting, local-data preservation, and reliable builds for the actual machines used. English-only UI does not limit the programming languages, source files, or user documents the coding agent can handle.

Use the [roadmap](../plans/README.md) for implementation priority. No public launch or mass distribution is planned.
