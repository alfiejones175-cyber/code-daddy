#!/usr/bin/env bun
import { $ } from "bun"

import { downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
const version = (await Bun.file("./package.json").json()).version
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`
await $`bun ./scripts/build-dictation.ts`

await $`cd ../opencode && OPENCODE_VERSION=${version} bun script/build-node.ts`
if (channel === "dev") await downloadCliToResources()
