# OpenCode Desktop

The OpenCode Desktop app, built with Electron.

## Development

```bash
bun install
bun dev
```

## Build

Run the `build` script to build the app's JS assets, then `package` to
bundle the assets as an application. The resulting app will be in `dist/`.

Local builds use the default `dev` channel and are named **Code Daddy**
(`Code Daddy.app` on macOS).

```bash
OPENCODE_CHANNEL=dev CSC_IDENTITY_AUTO_DISCOVERY=false bun run build
OPENCODE_CHANNEL=dev CSC_IDENTITY_AUTO_DISCOVERY=false bun run package:local
```

Use this sequence after every desktop runtime or UI addition/fix. It creates an
unsigned local development package. On a Mac with the local updater enabled,
`package:local` stages the archive and installs it after Code Daddy quits.
Running `bun dev`, committing, or pushing does not update
`~/Applications/Code Daddy.app`.

For source provenance, update from the intended commit first and record
`git rev-parse HEAD` plus a SHA-256 hash of the packaged `app.asar` before
installing. See [desktop update workflow](../../documentation/desktop-updates.md)
for the complete local-update and verification procedure.
