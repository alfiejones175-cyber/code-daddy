import { execFile } from "node:child_process"
import { mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const COMMAND_TIMEOUT = 15_000
const MAX_OUTPUT = 1_000_000
const MAX_SCREENSHOT = 20_000_000

export type XcodeWorkspaceKind = "xcodeproj" | "xcworkspace" | "swift-package" | "none"

export type XcodeWorkspaceProject = {
  kind: XcodeWorkspaceKind
  name: string
}

export type XcodeWorkspaceScan = {
  directory: string
  kind: XcodeWorkspaceKind
  projects: XcodeWorkspaceProject[]
}

export type XcodeSimulator = {
  deviceTypeIdentifier?: string
  isAvailable: boolean
  name: string
  runtime: string
  state: string
  udid: string
}

type CommandResult = { stdout: string; stderr: string }

/** Finds Xcode projects and Swift packages immediately inside a validated directory. */
export async function inspectProject(
  directory: string,
): Promise<XcodeWorkspaceScan & { schemes: string[]; targets: string[] }> {
  const root = await validateDirectory(directory)
  const entries = await readdir(root, { withFileTypes: true })
  const projects = entries.reduce<XcodeWorkspaceProject[]>((projects, entry) => {
    if (entry.isDirectory() && entry.name.endsWith(".xcworkspace")) {
      projects.push({ kind: "xcworkspace", name: entry.name })
      return projects
    }
    if (entry.isDirectory() && entry.name.endsWith(".xcodeproj")) {
      projects.push({ kind: "xcodeproj", name: entry.name })
    }
    return projects
  }, [])
  if (entries.some((entry) => entry.isFile() && entry.name === "Package.swift")) {
    projects.push({ kind: "swift-package", name: basename(root) })
  }
  const kind: XcodeWorkspaceKind = projects.some((project) => project.kind === "xcworkspace")
    ? "xcworkspace"
    : projects.some((project) => project.kind === "xcodeproj")
      ? "xcodeproj"
      : projects.some((project) => project.kind === "swift-package")
        ? "swift-package"
        : "none"
  const scan = { directory: root, kind, projects }
  const project =
    scan.projects.find((candidate) => candidate.kind === "xcworkspace") ??
    scan.projects.find((candidate) => candidate.kind === "xcodeproj") ??
    scan.projects.find((candidate) => candidate.kind === "swift-package")
  if (!project) return { ...scan, schemes: [], targets: [] }
  if (process.platform !== "darwin") throw new Error("Xcode project listing is only available on macOS")

  const path = project.kind === "swift-package" ? scan.directory : join(scan.directory, project.name)
  const args =
    project.kind === "xcworkspace"
      ? ["-list", "-json", "-workspace", path]
      : project.kind === "xcodeproj"
        ? ["-list", "-json", "-project", path]
        : ["-list", "-json", "-packagePath", path]
  const output = await runCommand("xcodebuild", args)
  const parsed: unknown = JSON.parse(output.stdout)
  return {
    ...scan,
    kind: project.kind,
    schemes: findStringArray(parsed, ["workspace", "project", "package"], "schemes"),
    targets: findStringArray(parsed, ["workspace", "project", "package"], "targets"),
  }
}

/** Lists available simulator devices using the installed Xcode command line tools. */
export async function listSimulators(): Promise<XcodeSimulator[]> {
  if (process.platform !== "darwin") throw new Error("Simulator listing is only available on macOS")
  const output = await runCommand("xcrun", ["simctl", "list", "devices", "available", "-j"])
  const parsed: unknown = JSON.parse(output.stdout)
  if (!isRecord(parsed) || !isRecord(parsed.devices)) throw new Error("Simulator returned an invalid device list")
  return Object.entries(parsed.devices).flatMap(([runtime, devices]) =>
    Array.isArray(devices)
      ? devices.flatMap((device) => {
          if (!isRecord(device) || typeof device.name !== "string" || typeof device.udid !== "string") return []
          return [
            {
              deviceTypeIdentifier:
                typeof device.deviceTypeIdentifier === "string" ? device.deviceTypeIdentifier : undefined,
              isAvailable: device.isAvailable === true,
              name: device.name,
              runtime,
              state: typeof device.state === "string" ? device.state : "Unknown",
              udid: device.udid,
            },
          ]
        })
      : [],
  )
}

/** Captures a PNG from a selected booted simulator and returns it as a data URL. */
export async function captureSimulatorScreenshot(udid: string): Promise<string> {
  if (!/^[A-Fa-f0-9-]{20,40}$/.test(udid)) throw new Error("Invalid simulator identifier")
  const simulator = (await listSimulators()).find((device) => device.udid === udid)
  if (!simulator || !simulator.isAvailable || simulator.state !== "Booted") {
    throw new Error("Select an available booted simulator to capture a screenshot")
  }
  const directory = await mkdtemp(join(tmpdir(), "xcode-simulator-"))
  const path = join(directory, "screen.png")
  try {
    await runCommand("xcrun", ["simctl", "io", simulator.udid, "screenshot", path])
    const image = await readFile(path)
    if (image.length === 0 || image.length > MAX_SCREENSHOT) throw new Error("Simulator screenshot has an invalid size")
    return `data:image/png;base64,${image.toString("base64")}`
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function validateDirectory(directory: string) {
  if (typeof directory !== "string" || directory.trim().length === 0) throw new Error("Select a project directory")
  const absolute = resolve(directory)
  const canonical = await realpath(absolute)
  if (!(await stat(canonical)).isDirectory()) throw new Error("Selected project path is not a directory")
  return canonical
}

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT,
    timeout: COMMAND_TIMEOUT,
    windowsHide: true,
  })
  return { stdout: String(result.stdout), stderr: String(result.stderr) }
}

function findStringArray(value: unknown, containers: string[], key: string) {
  if (!isRecord(value)) return []
  for (const name of containers) {
    const container = value[name]
    if (isRecord(container) && Array.isArray(container[key])) {
      return container[key].filter((entry): entry is string => typeof entry === "string")
    }
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
