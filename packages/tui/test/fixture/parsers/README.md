# Offline parser fixtures

These MIT-licensed upstream assets make the real-worker HTML injection regression
test independent of network access. The JavaScript parser is bundled by OpenTUI.

- HTML WASM and queries: tree-sitter/tree-sitter-html **v0.23.2**.
- CSS WASM and queries: tree-sitter/tree-sitter-css **v0.25.0**.
- WASM source: each repository's matching GitHub release asset.
- Query/license source: each repository's matching version tag, `queries/*.scm`
  and `LICENSE`. Original licenses are included beside the assets.

The OpenTUI 0.4.5 patch reads the standard `injection.language` query property.
Without it, both HTML bodies are `raw_text` nodes and node-type mapping cannot
distinguish JavaScript from CSS. Remove the patch when an upgraded dependency
supports this property and this test passes without it.
