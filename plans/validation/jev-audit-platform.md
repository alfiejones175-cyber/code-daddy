# Jev peripheral package audit

Read-only survey of console/stats/web/CLI/TUI/codemode/LLM/build-adjacent packages. Existing worktree changes were left untouched.

## High-value candidates

### 1. OpenAI Responses tool strictness remains hardcoded

- **Evidence:** `packages/llm/src/protocols/openai-responses.ts:259-266` always emits `strict: false`; the inline TODO says direct LLM callers cannot opt into strict schemas. The lowering is used for every request with tools at `:478-490`.
- **Current contract:** `packages/llm/test/provider/openai-responses.test.ts:114-129` asserts `strict: false`, so changing behavior requires an explicit compatibility/design decision and updated fixtures.
- **Why Jev can help:** classify whether a tool schema is safe for strict lowering, or score schema risk, as an advisory migration report. Keep actual schema validation/lowering deterministic in code.
- **Priority:** High for reliability, but not an unambiguous bug: strict mode may intentionally be disabled for provider compatibility.
- **Next validation:** inventory provider/model compatibility and run prepared-body tests for representative schemas before changing the default.

### 2. TUI diff tree has a permanently skipped rendering regression test

- **Evidence:** `packages/tui/test/cli/tui/diff-viewer-file-tree.test.tsx:29-30` uses `test.skip("renders sorted hierarchical file rows", ...)`. The test exercises the production `DiffViewerFileTree` component and checks ordering/row rendering; no skip rationale is present in the file or its initial commit.
- **Why it matters:** the surrounding tests cover empty/error/collapse/highlight states, but the skipped case is the direct sorted hierarchical rendering assertion.
- **Why Jev can help:** rank whether skipped tests are coverage gaps versus environment-sensitive tests, then suggest the smallest deterministic repair. Do not auto-enable without reproducing the renderer behavior.
- **Priority:** Medium-high; likely a targeted test repair.

### 3. TUI syntax highlighting has known HTML injections gap

- **Evidence:** `packages/tui/src/parsers-config.ts:145-166` comments out HTML `injections` and `injectionMapping` with `TODO: Injections not working for some reason`. This means embedded JavaScript/CSS in HTML is not configured for tree-sitter injection highlighting.
- **Related limitation:** Nix uses a third-party WASM parser at `:285-296` with a TODO to replace it when the official parser is published; this is an upstream dependency limitation, not a local defect.
- **Why Jev can help:** classify snippets/files where highlighting degradation is likely and generate an issue/diagnostic suggestion; keep parser selection and injection mappings deterministic.
- **Priority:** Medium; verify OpenTUI/tree-sitter compatibility before implementation.

### 4. Console Black workspace route renders fabricated IDs and links to an absent dynamic destination

- **Evidence:** `packages/console/app/src/routes/black/workspace.tsx:26-39` contains an explicit TODO and eight hardcoded `wrk_123`-style IDs. Those IDs drive navigation at `:43-46` and `:188-208`, so selecting a workspace links to `/black/workspace/wrk_123`-style URLs. The route tree contains `black.tsx` (the layout), `black/index.tsx`, and `black/workspace.tsx`, but no `black/workspace/[id].tsx` or equivalent dynamic descendant; source inspection therefore indicates the generated destination is absent. The ordinary workspace picker uses a real server query in `packages/console/app/src/routes/workspace-picker.tsx:35-57`.
- **Reachability/gating:** `packages/console/app/src/routes/black.tsx` is the parent layout and renders `props.children`; it has no pause guard. The `Resource.App.stage === "production"` check in `packages/console/app/src/routes/black/index.tsx:7-16` only controls the index child’s enrollment UI. `packages/console/app/src/middleware.ts` contains locale/referral/server-action handling but no Black-route guard. Thus the source does not establish that `/black/workspace` is protected by the index pause check, and this report makes no claim about deployed production reachability.
- **Why Jev can help:** evaluate whether a user is in a real workspace-selection flow versus a marketing/demo route, and flag placeholder data or links whose destination is absent. Jev should only advise; workspace identity, route existence, and authorization remain deterministic.
- **Priority:** High as a source-level incomplete path if the workspace child is intended to be navigable; rollout status remains unresolved and should be checked separately.

## Intentional/deferred backlog (do not label bugs automatically)

CodeMode’s OpenAPI adapter explicitly returns unsupported operations in `skipped` (`packages/codemode/src/openapi/index.ts:33-39, 62-88, 115`) and documents future work in `packages/codemode/src/openapi/TODO.md:1-19`: cookies, advanced serialization, external refs, binary/SSE/WebSocket, response validation, size/redirect policies, and broader security coverage. Existing tests assert skipped reasons (`packages/codemode/test/openapi.test.ts:178-187, 630-709`). This is a deliberate safe boundary. Jev could help prioritize skipped operations from observed specs, but the adapter must continue to fail closed and report precise reasons.

## Test/validation notes

- LLM recorded tests intentionally skip cases when a cassette is absent or required credentials are missing (`packages/llm/test/recorded-runner.ts:58-75`); this is test harness behavior, not a production gap.
- No actionable TODOs were found in the CLI package during this pass.
- `packages/web/src/components/share/content-code.tsx:14-15` contains only a commented artificial delay for testing, not an incomplete feature.
- Suggested Jev pilot: expose a read-only `audit` command that batches atomic questions over TODOs, skipped tests, routing guards, and caller evidence; store findings with file/line references and confidence; require human review before issue creation or code changes.
