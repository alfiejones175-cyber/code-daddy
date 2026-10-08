# Agent team validation

Validated 29–30 September 2026, Europe/London. Source was a dirty `dev` checkout based on `e4afec5344a5484fcfe7e1d995feec86fe62b8f2`; no commit or push was requested.

## Package checks

| Check | Result |
| --- | --- |
| Schema, Core, Protocol, Server, Client and App package `bun typecheck` | Passed |
| Core config, migration, projection, command and task suite | 50 passed |
| Final Core team settings, teams, agents and task subset | 36 passed |
| V1 command, task and permission suite | 48 passed |
| V1 agent team projection subset | 1 passed |
| V1 JSON/JSONC complete-roster replacement subset | 2 passed |
| Final App transport, protocol, bootstrap, normalization, queue, selection and compatibility subset | 42 passed |
| Legacy SDK build and native Client generation | Passed; generated output retained |
| App production build and `git diff --check` | Passed |

App tests use `--conditions=browser` so Solid's browser exports load. An initial run without that condition failed before bootstrap tests could load. A broader V1 agent run encountered a sandbox FSEvents stream failure; the targeted team projection test passed.

## UI and runtime checks

- Disposable V1 backend storage under `/tmp/code-daddy-team-check`: create/save team, add a second role, remove that role and save, disable team and clear default, recreate team. Files confirmed removed roles stayed removed and explicit null was retained.
- Composer selected a generated lead with the ordinary agent picker hidden. Selecting a team and returning to No team preserved the draft.
- Native V2 global GET/PATCH and effective location GET returned team settings. The global agent catalog included `team-coding` and `team-coding/research`.
- Native V2 production UI loaded the saved default team, loaded its source agents, edited and saved it, and selected/deselected it in a session without changing its draft. A disposable same-origin proxy was used because the standalone native server did not supply browser CORS headers.
- Layout checked at desktop and narrow widths; editor controls and roles stack at narrow widths. The inherited Settings sidebar leaves little space at phone widths.
- No live model prompt was sent. Task tests verified roster isolation, permission boundaries, model inheritance and child-session reuse rather than relying on a paid provider.

The native CLI's existing `serve` wiring failed with an unbound `SessionExecution` before listening. Native HTTP acceptance used the server routes directly with the local execution binding. A native session also surfaced an existing project reload `UnexpectedStatus` notification; the team picker and settings save worked. These results do not certify the optional installed V2 sidecar workflow.

## Session benchmark

Production V2 session tab switch benchmark, one observation per case with 72 review diffs. Both runs passed with zero blank or wrong-destination samples.

| Stable observation, ms | Before | Final |
| --- | ---: | ---: |
| Review closed, cold | 79.0 | 122.2 |
| Review closed, hot | 33.5 | 29.2 |
| Review open, cold | 56.9 | 60.0 |
| Review open, hot | 32.4 | 50.5 |

Single observations during local builds are a correctness smoke check, not statistical performance evidence. An intermediate runtime crash was traced to spreading a controller with a non-enumerable model accessor; the final controller preserves both model and agent accessors.

## Installed desktop

- Built with `OPENCODE_CHANNEL=dev`, automatic signing discovery disabled, and the cached model catalog `/Users/alfredo/.cache/opencode/models.json` (mtime 29 September 2026, 23:17:24 +0100; about 47 minutes old at final acceptance).
- Final build and `package:local` succeeded. Artifact: `packages/desktop/dist/mac-arm64/Code Daddy.app` and `dist/opencode-desktop-mac-arm64.zip`.
- Installed to `/Users/alfredo/Applications/Code Daddy.app` by the local updater on 30 September 2026 at 00:03:25 +0100 while the app was closed. Previous bundle retained at `/Users/alfredo/Applications/Code Daddy.previous-auto-20260930-000325-31988.app`.
- Matching packaged and installed `Contents/Resources/app.asar` SHA-256: `dcd7efbd5366ac04727badcb1f301c9515077ad65cf536fc71b1f4a8177e601e`.
- Opened the installed app: Home, Settings and Teams loaded, including the New team entry point. Existing projects and sessions remained visible. User team configuration was not changed during the installed smoke check.

The build includes the uncommitted team implementation and the compatibility fixes described above. Application data, provider credentials and session history were preserved.
