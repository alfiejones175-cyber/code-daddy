#!/usr/bin/env bun
import { $ } from "bun"

import { resolveChannel, windowsify } from "./utils"

const channel = resolveChannel()
const version = (await Bun.file("./package.json").json()).version
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`
await $`bun ./scripts/build-dictation.ts`

if (channel === "dev") {
  await $`cd ../opencode && OPENCODE_VERSION=${version} bun script/build.ts --single --skip-install --skip-embed-web-ui`
  const target = `opencode-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
  await $`cp ${`../opencode/dist/${target}/bin/${windowsify("opencode")}`} ${windowsify("resources/opencode-cli")}`
}
await $`cd ../opencode && OPENCODE_VERSION=${version} bun script/build-node.ts`
