# Transcription repair

The composer previously used Web Speech recognition even inside Electron, where the exposed constructor does not ensure a working recognition service. Desktop capture permissions were absent, and recognition errors were stored without being rendered.

The implementation adds a macOS Apple Speech helper, a window-owned preload/IPC bridge, and a shared dictation controller. The browser path remains available in supported web browsers. The composer shows startup, listening, finishing, and recoverable error states. Speech uses the app's canonical language tag. Cancelling, navigation, draft identity changes, and cleanup discard stale results; stopping retains the pending final result. Appending text preserves existing mentions and attachments.

## Verification

- Shared dictation/runtime-adapter tests: 12 pass, 39 assertions.
- Prompt-store tests: 6 pass, including structured-content preservation.
- App, app E2E, and session-ui typechecks pass.
- Production-browser dictation regression: 1 pass. Covers edits while speaking, final text on stop, permission error visibility, and retry. The recognition service boundary is simulated; no microphone audio is recorded.
- Visual checks: `validation/dictation-permission.png` and `validation/dictation-listening.png`.
- Production session navigation benchmark: 2 pass, all correctness counters clean. Timings are higher than the older reference run; see `validation/transcription-append-benchmark.json`. This is not a controlled latency comparison or a microphone test.

## Acceptance boundary

Native permission prompts and real speech-to-text must be checked interactively in the rebuilt application. Automated checks must not be represented as a successful live microphone test. Existing installed/running app copies do not receive source changes automatically. No user app or backend process was restarted.

## Native and packaged checks

- Desktop bridge and packaging config tests: 11 pass, 39 assertions, including UTF-8 boundaries, failed-helper termination, busy ownership, and malformed/late events.
- Desktop typecheck, backend Node build, and production-channel Electron build pass.
- Local Apple Silicon application package created with the existing installed bundle identity `ai.opencode.desktop`.
- Packaged helper is at `Contents/Helpers/OpenCodeDictation.app`; both helper slices (arm64 and x86_64) target macOS 12.
- The packaged helper and outer app pass strict deep code-signature verification. The helper carries the audio-input entitlement. Both required privacy descriptions are present.
- The packaged helper's metadata-aware `--probe` succeeds without recording audio.
- This is an ad-hoc signed local build, not a notarized public release. No installed app was overwritten or launched.
- Archive: `packages/desktop/dist/OpenCode-dictation-local-arm64.zip`.
