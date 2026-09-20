import { execFile } from "node:child_process"
import { access, readdir } from "node:fs/promises"
import { join } from "node:path"
import util from "node:util"

const execFilePromise = util.promisify(execFile)

export type XcodeProjectKind = "xcodeproj" | "xcworkspace" | "swift-package" | "none"

export type XcodeStatus = {
  installed: boolean
  version?: string
  build?: string
  developerDir?: string
}

export type XcodeProjectInfo = {
  directory: string
  kind: XcodeProjectKind
  names: string[]
}

const run = (cmd: string, args: string[]) =>
  execFilePromise(cmd, args, { timeout: 10_000 })
    .then((result) => result.stdout.toString().trim())
    .catch(() => null)

export async function xcodeDetect(): Promise<XcodeStatus> {
  if (process.platform !== "darwin") return { installed: false }
  const developerDir = await run("xcode-select", ["-p"])
  const versionOutput = await run("xcodebuild", ["-version"])
  if (!versionOutput) return { installed: false, developerDir: developerDir ?? undefined }
  const [versionLine, buildLine] = versionOutput.split("\n")
  const version = versionLine?.replace("Xcode", "").trim() || undefined
  const build = buildLine?.replace("Build version", "").trim() || undefined
  return { installed: true, version, build, developerDir: developerDir ?? undefined }
}

export async function xcodeScanProject(directory: string): Promise<XcodeProjectInfo> {
  const names: string[] = []
  let kind: XcodeProjectKind = "none"
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() && entry.name !== "Package.swift") continue
    if (entry.name.endsWith(".xcworkspace")) {
      kind = "xcworkspace"
      names.push(entry.name)
    }
    if (entry.name.endsWith(".xcodeproj") && kind !== "xcworkspace") kind = "xcodeproj"
    if (entry.name.endsWith(".xcodeproj")) names.push(entry.name)
    if (entry.name === "Package.swift" && kind === "none") kind = "swift-package"
  }
  const packagePath = join(directory, "Package.swift")
  const hasPackage = await access(packagePath)
    .then(() => true)
    .catch(() => false)
  if (hasPackage && kind === "none") kind = "swift-package"
  return { directory, kind, names: names.slice(0, 5) }
}
