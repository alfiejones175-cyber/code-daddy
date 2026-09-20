#!/usr/bin/env bun
import { $ } from "bun"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { dict } from "../../app/src/i18n/en"

if (process.platform !== "darwin") process.exit(0)
const root = resolve(import.meta.dir, "..")
// Stage outside the project: file providers can attach Finder metadata to signed bundles.
const staging = await mkdtemp(join(tmpdir(), "opencode-dictation-"))
const app = join(staging, "OpenCodeDictation.app")
const binary = join(app, "Contents/MacOS/opencode-dictation")
await mkdir(join(app, "Contents/MacOS"), { recursive: true })
await Bun.write(
  join(app, "Contents/Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>opencode-dictation</string>
<key>CFBundleIdentifier</key><string>ai.opencode.desktop.dictation</string>
<key>CFBundleName</key><string>OpenCodeDictation</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSBackgroundOnly</key><true/>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSMicrophoneUsageDescription</key><string>${xml(dict["transcribe.permission.microphone"])}</string>
<key>NSSpeechRecognitionUsageDescription</key><string>${xml(dict["transcribe.permission.speech"])}</string>
</dict></plist>
`,
)
// A universal helper also supports packaging Intel builds from Apple Silicon hosts.
await Promise.all(
  ["arm64", "x86_64"].map(
    (arch) =>
      $`xcrun swiftc -target ${`${arch}-apple-macosx12.0`} -framework AVFoundation -framework Speech ${join(root, "native/dictation.swift")} -o ${join(staging, arch)}`,
  ),
)
await $`xcrun lipo -create ${join(staging, "arm64")} ${join(staging, "x86_64")} -output ${binary}`
await $`codesign --force --sign - ${app}`
await $`codesign --verify --strict --deep ${app}`
await $`${binary} --probe`
const destination = join(root, "native/swift-build/OpenCodeDictation.app")
await rm(destination, { recursive: true, force: true })
await rm(join(root, "native/swift-build/opencode-dictation"), { force: true })
await cp(app, destination, { recursive: true })
await rm(staging, { recursive: true, force: true })

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}
