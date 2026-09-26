# OpenRouter model pricing in the picker — 25 September 2026

The legacy and V2 model pickers show the catalog's USD input and output rates per million tokens for OpenRouter models. Tooltips repeat the rates. Routing aliases and other entries without a trustworthy fixed rate show “Price varies or unavailable” instead of a misleading $0. Explicit `:free` models and `openrouter/free` retain $0 pricing.

The displayed rates come from the app's model catalog, so they are reference rates rather than a live OpenRouter quote. The catalog can be stale, and some models have higher long-context tiers or other charges that the compact picker does not detail.

## Validation

- `packages/app`: targeted pricing tests passed (2 tests); `bun typecheck` passed.
- Desktop `dev` build passed using `packages/opencode/test/tool/fixtures/models-api.json`, dated 19 September 2026, because `models.dev` was unavailable from this environment. Swift's module cache was redirected to `/private/tmp` because the sandbox cannot write under `~/.cache`.
- macOS ZIP packaging passed using the locally installed Electron distribution because GitHub was unavailable. The verified ZIP was staged for the local updater.
- Packaged app asar SHA-256: `ebffdfbd833e8bb1def8581c6ae81333ab3f691cc471144b0f07321e9560826c`.
- The installed app still has asar SHA-256 `07e004cb2933f552906392d8f5b425539dbb769d29221276ea7ffaa9d21cc0b7`. The updater skipped installation while Code Daddy was running. It will install the staged ZIP after the app quits; startup and model-picker smoke checks remain pending.
- Source commit at packaging: `75e46238ec89273ff55759bb0b635c0557db4b92`, plus the uncommitted working-tree changes present on 25 September 2026.
