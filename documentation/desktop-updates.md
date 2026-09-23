# Desktop update workflow

This workspace's local desktop build is **Code Daddy** on the `dev` channel.
It is for the owner and a few friends, and English is the only required UI
language. This document covers the local development app; it does not describe
an upstream OpenCode release, signing, notarization, or public distribution.

## Required after desktop changes

After every desktop runtime or UI addition/fix, rebuild, package, and install
the app before saying the installed app contains the change. The installed app
is separate from the source checkout:

```sh
cd packages/desktop
OPENCODE_CHANNEL=dev CSC_IDENTITY_AUTO_DISCOVERY=false bun run build
OPENCODE_CHANNEL=dev CSC_IDENTITY_AUTO_DISCOVERY=false bun run package:local
```

The commands deliberately select the `dev` channel and disable automatic macOS
signing-identity discovery for an unsigned local package. The package step
creates the app under `packages/desktop/dist/` (on Apple Silicon,
`dist/mac-arm64/Code Daddy.app`) plus a macOS ZIP. `package:local`
also stages that ZIP for the local updater. The installed app changes only
after the updater runs while Code Daddy is closed, or after the manual install
below. Verify that install before calling the installed app current.

The dev prebuild compiles the CLI from this checkout and embeds it with the
desktop UI. This is required for local backend routes and plugins to match the
source. If `models.dev` is unreachable, set `MODELS_DEV_API_JSON` to a cached
`models.dev/api.json` snapshot for the build; record that snapshot's age.

`bun dev` runs from the checkout. A git commit or push only records or shares
source. None of those actions rebuilds, repackages, or replaces the installed
application.

## Automatic install on this Mac

The local updater installs a successfully packaged `dev` build from this
checkout after Code Daddy quits. It checks every five minutes. It does not
pull Git commits or build source by itself; run the build and package commands
above to approve a new local build. The `package:local` command builds only the
ZIP needed for this updater, verifies that it contains the packaged app, then
writes an update marker and copies that archive to
`~/Library/Caches/Code Daddy Local Updater`. The updater checks the archive
and extracted app hash before installation, and retains the previous app
bundle for rollback. It never installs while Code Daddy is running.

Enable it once on the Mac that runs the app:

```sh
cd packages/desktop
bash scripts/enable-local-updater.sh
```

Inspect `~/Library/Logs/Code Daddy/local-updater.log` if installation does not
occur after quitting the app. The LaunchAgent lives at
`~/Library/LaunchAgents/com.code-daddy.local-updater.plist`. To turn it off,
run `launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/com.code-daddy.local-updater.plist"`
and remove that plist. The background job reads the staged archive from Library,
so macOS does not need to grant it access to the source checkout in Documents.
It does not use OpenCode's upstream updater or touch local application data.

## Manual install of the local macOS build

Use this path when the local updater is not enabled or an immediate install is
needed. Finish active tasks and quit Code Daddy normally before replacing its bundle.
For this owner's Apple Silicon installation, run the following from
`packages/desktop` after packaging. Keep the previous bundle until the new one
has passed the startup check; the backup is an app bundle, not a data backup.

```sh
set -eu
app_source="$PWD/dist/mac-arm64/Code Daddy.app"
app_target="$HOME/Applications/Code Daddy.app"
app_stage=$(mktemp -d "$HOME/Applications/.code-daddy-install.XXXXXX")
app_backup="$HOME/Applications/Code Daddy.previous-$(date +%Y%m%d-%H%M%S).app"
ditto "$app_source" "$app_stage/Code Daddy.app"
source_hash=$(shasum -a 256 "$app_source/Contents/Resources/app.asar" | cut -d ' ' -f 1)
stage_hash=$(shasum -a 256 "$app_stage/Code Daddy.app/Contents/Resources/app.asar" | cut -d ' ' -f 1)
test "$source_hash" = "$stage_hash"
mv "$app_target" "$app_backup"
if mv "$app_stage/Code Daddy.app" "$app_target"; then
  rmdir "$app_stage"
else
  mv "$app_backup" "$app_target"
  exit 1
fi
```

Use the actual existing install location on other machines. Replace only the
app bundle; leave Application Support, XDG storage, provider credentials and
`~/.config/code-daddy/jev.env` intact. Do not force-quit an active agent to
complete an update. If installation cannot proceed, report the built artifact
and the specific outstanding installation step.

## Provenance and verification

Before packaging, confirm the source commit intended for the local update:

```sh
git rev-parse HEAD
git status --short
```

Record the commit and hash the packaged application before installation:

```sh
shasum -a 256 "dist/mac-arm64/Code Daddy.app/Contents/Resources/app.asar"
```

After the separate install action, compare that result with the installed app:

```sh
shasum -a 256 "$HOME/Applications/Code Daddy.app/Contents/Resources/app.asar"
```

Matching hashes verify that the installed application contains the packaged
JavaScript application. They do not replace a startup or feature smoke test.
Preserve the existing application data, settings, history, and CLI state when
installing; do not remove user data merely to update the app bundle.

Open the installed app and confirm Home and Settings load. Smoke-test the
changed feature when practical and record the result separately from the
successful build. Record any pending changes alongside the commit: a commit
hash alone does not identify a dirty working-tree build. Include the build and
install date, install path, matching artifact hashes, startup outcome, and
remaining limitations in the task's validation evidence. This is a required
completion step after changes that affect the installed app, not an automatic
updater triggered by Git.

## What the package contains

The build compiles the desktop main process and renderer, and bundles the local
embedded server from `packages/opencode/dist/node`. Run the desktop build after
server or frontend changes so those artifacts are refreshed in the package.

The `dev` prebuild compiles and includes this checkout's OpenCode CLI binary
for the optional `OPENCODE_SIDECAR_V2=1` background-service path. The default
desktop sidecar remains V1 until that environment variable is set. Features
implemented only on the V2 HTTP API need a V2 connection; packaging their UI
does not make them usable against the default V1 server. When validating the V2
path, record its CLI version, server protocol, and actual feature smoke result.
