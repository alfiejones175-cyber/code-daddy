# Web app development

`packages/app` contains the Solid web interface shared with the desktop app. This workspace's current product priorities and feature status are in the [roadmap](../../plans/README.md); package-specific rules are in [AGENTS.md](AGENTS.md).

## Run locally

Install workspace dependencies once from the repository root with `bun install`. Run the backend and web app in separate terminals:

```sh
# From packages/opencode
bun run ./src/index.ts serve --port 4096
```

```sh
# From packages/app
bun dev -- --port 4444
```

Open <http://localhost:4444>. The app connects to the backend at `localhost:4096` by default. `opencode dev web` proxies the hosted web app and will not show local UI changes.

## Check changes

Run checks from `packages/app`, not the repository root:

```sh
bun typecheck
bun run test:unit
bun run test:browser
bun run build
```

The E2E suite uses Playwright and starts its own Vite server, but expects a backend at `127.0.0.1:4096` by default. Start the backend as shown above, then run:

```sh
bunx playwright install chromium
bun run test:e2e:local
```

Use `PLAYWRIGHT_SERVER_HOST` and `PLAYWRIGHT_SERVER_PORT` for a different backend, `PLAYWRIGHT_PORT` for the Vite port, and `PLAYWRIGHT_BASE_URL` for an alternate app URL. The [Playwright configuration](playwright.config.ts) defines the current defaults and artifacts.

The desktop app bundles this UI. After a desktop UI change, follow the [build, package, and local install workflow](../../documentation/desktop-updates.md) before calling the installed app current.
