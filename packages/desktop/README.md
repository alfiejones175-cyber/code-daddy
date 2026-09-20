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
bun run build && bun run package
```
