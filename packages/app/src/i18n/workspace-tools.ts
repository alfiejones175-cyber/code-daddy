export * as WorkspaceToolsI18n from "./workspace-tools"

export const dict = {
  "workspaceTools.title": "Workspace tools",
  "workspaceTools.description": "Inspect the running app and prepare focused work for the agent.",
  "workspaceTools.browser": "Browser",
  "workspaceTools.xcode": "Xcode",
  "workspaceTools.browserDescription":
    "Prepare navigation, DOM interaction, screenshots, and browser diagnostics through the connected tools.",
  "workspaceTools.xcodeDescription":
    "Prepare project inspection, build, or test work through the connected Xcode tools.",
  "workspaceTools.url": "URL",
  "workspaceTools.urlPlaceholder": "https://example.com",
  "workspaceTools.prepareNavigate": "Prepare navigation",
  "workspaceTools.prepareScreenshot": "Prepare screenshot",
  "workspaceTools.prepareConsole": "Prepare console and network inspection",
  "workspaceTools.prepareInspect": "Prepare project inspection",
  "workspaceTools.prepareBuild": "Prepare build",
  "workspaceTools.prepareTest": "Prepare tests",
  "workspaceTools.setup": "Set up capability",
  "workspaceTools.unavailable": "This capability is not connected for the current project.",
  "workspaceTools.agentToolsV2":
    "Agent tool connections require a V2 server. Native preview and Xcode inspection are available here.",
  "workspaceTools.legacyDesktopOnly": "Connect agent tools from the desktop app.",
  "workspaceTools.legacySetupFailed": "Could not connect these agent tools. Check the project config and try again.",
  "workspaceTools.legacyConnecting": "Connecting…",
  "workspaceTools.legacyConnect": "Connect agent tools",
  "workspaceTools.legacyDescription": "Adds a local MCP server to this project's opencode config.",
  "workspaceTools.legacyConnected": "Agent tools connected for this project.",
  "workspaceTools.invalidUrl": "Enter an http or https URL.",
  "workspaceTools.evidence": "Recent agent tool evidence",
  "workspaceTools.noEvidence": "No browser or Xcode tool results are attached to this session yet.",
  "workspaceTools.editPrompt": "Prepare a draft for the composer, then edit it before sending.",
  "workspaceTools.previewTitle": "Live preview",
  "workspaceTools.previewDescription":
    "This preview has its own browser session. Agent browser tools use a separate Playwright profile.",
  "workspaceTools.previewDesktopOnly": "Live preview is available in the desktop app.",
  "workspaceTools.previewEmpty": "Enter an HTTP or HTTPS address to open the preview.",
  "workspaceTools.previewOpen": "Open preview",
  "workspaceTools.previewReload": "Reload",
  "workspaceTools.previewClose": "Close preview",
  "workspaceTools.previewCapture": "Capture preview",
  "workspaceTools.previewDiagnostics": "Refresh diagnostics",
  "workspaceTools.previewFailed": "Could not open the preview. Check the address and try again.",
  "workspaceTools.previewCaptured": "Preview captured at {{time}}",
  "workspaceTools.previewViewing": "Viewing {{url}}",
  "workspaceTools.previewDiagnosticsFor": "Diagnostics for {{url}}",
  "workspaceTools.previewNoDiagnostics": "No console or failed-load diagnostics captured yet.",
  "workspaceTools.xcodeProject": "Xcode project",
  "workspaceTools.xcodeProjectNone": "No Xcode project or Swift package found at this project root.",
  "workspaceTools.xcodeSchemes": "Schemes",
  "workspaceTools.xcodeTargets": "Targets",
  "workspaceTools.xcodeSimulators": "Available simulators",
  "workspaceTools.xcodeNoSimulators": "No available simulators found.",
  "workspaceTools.xcodeInspectFailed": "Could not inspect this Xcode project. Check Xcode and the selected project.",
  "workspaceTools.xcodeRefresh": "Refresh Xcode",
  "workspaceTools.xcodeCapture": "Capture simulator",
  "workspaceTools.xcodeCaptureFailed": "Could not capture the selected simulator. It must be booted.",
  "workspaceTools.xcodeCaptured": "Simulator captured at {{time}}",
  "workspaceTools.xcodeCapturedDevice": "{{device}} captured at {{time}}",
  "workspaceTools.prompt.navigate":
    "Use the connected browser tools to navigate to {{url}}, inspect the DOM, and report what you find.",
  "workspaceTools.prompt.screenshot":
    "Use the connected browser tools to capture a screenshot of the current page and attach it as evidence.",
  "workspaceTools.prompt.console":
    "Use the connected browser tools to inspect console and network errors on the current page, then report actionable findings.",
  "workspaceTools.prompt.inspect":
    "Use the connected Xcode tools to inspect the project at {{directory}}, identify its targets and schemes, and report the available build and test actions.",
  "workspaceTools.prompt.build":
    "Use the connected Xcode tools to build the current project and report the command, result, and any errors.",
  "workspaceTools.prompt.test":
    "Use the connected Xcode tools to run the project's tests and report failures with the relevant test names and diagnostics.",
} as const
