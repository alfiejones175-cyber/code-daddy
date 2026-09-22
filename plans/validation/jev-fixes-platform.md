# Peripheral fixes and validation

- Replaced the unfinished Black workspace picker with a localized redirect to the existing plan page. Removed eight fabricated workspace IDs and all nonexistent enrollment links. This deliberately hides an unfinished flow; it does not invent enrollment or change account authorization. Console app `bun typecheck` passed.
- Enabled the TUI sorted-tree rendering test. It now uses the existing bounded frame-settling helper, and its border filter keeps legitimate final-child tree rows. Added the previously hidden root file to the assertions, including expanded/collapsed cases.
- Enabled HTML JavaScript/CSS injection highlighting. A three-line pinned OpenTUI 0.4.5 patch honors each capture's standard `injection.language` property before falling back to existing node-type/fenced-code mappings. HTML and CSS highlight queries are pinned to their grammar versions. The [upstream HTML query](https://raw.githubusercontent.com/tree-sitter/tree-sitter-html/v0.23.2/queries/injections.scm) uses the same `raw_text` node type for both bodies, distinguished by that property.
- Added a real-worker offline HTML regression using pinned, MIT-licensed HTML/CSS WASM/query fixtures. JavaScript uses OpenTUI's bundled grammar. The test checks `const`, a JS string, CSS `color`, preserved HTML tags, and absence of surrounding tags from injected content. Five tests across the parser and diff-tree files pass, with no skipped test. TUI `bun typecheck` passed. Existing fixture warnings about a missing temporary KV file do not fail assertions.
- Documented unsupported SQLite row streaming in both the node adapter and Core database directory. Streaming is still unsupported; callers are directed to bounded queries/keyset pagination. No production consumer requiring streaming was established, so no new iterator/transaction semantics were invented.

# Jev diagnostics

Direct callers can pass `diagnostics: true` to evaluator options. Invalid responses can then include a fixed validation category (`response_schema`, `answer_ids`, `choice_answer`, `ranking_answer`); defaults and rejection behavior are unchanged. No request/response contents, credentials, or exceptions are returned. Local HTTP fixture tests verify opt-in behavior and non-disclosure. Jev package: 24 tests passed and package typecheck passed.

Fresh live checks after the change: smoke and research-ranking both returned `status: ok` from `jev-1.13.0`. Saved responses are `jev-after-smoke.json` and `jev-after-rank.json` in this directory. These responses contain no API credential.
