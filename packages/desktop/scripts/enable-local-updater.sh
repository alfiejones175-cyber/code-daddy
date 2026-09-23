#!/bin/bash
set -euo pipefail

[[ $(uname -s) == Darwin ]] || { echo "This updater is for macOS" >&2; exit 1; }

script=$(cd "$(dirname "$0")" && pwd)/local-update.sh
plist="$HOME/Library/LaunchAgents/com.code-daddy.local-updater.plist"
log_dir="$HOME/Library/Logs/Code Daddy"
runtime_dir="$HOME/Library/Application Support/Code Daddy Local Updater"
/bin/mkdir -p "$(dirname "$plist")" "$log_dir" "$runtime_dir"
/usr/bin/ditto "$script" "$runtime_dir/local-update.sh"
/bin/bash "$script" mark

cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.code-daddy.local-updater</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>$runtime_dir/local-update.sh</string>
    <string>check</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>$log_dir/local-updater.log</string>
  <key>StandardErrorPath</key><string>$log_dir/local-updater.log</string>
</dict></plist>
EOF

/usr/bin/plutil -lint "$plist"
/bin/launchctl bootout "gui/$(id -u)" "$plist" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "gui/$(id -u)" "$plist"
/bin/launchctl kickstart "gui/$(id -u)/com.code-daddy.local-updater"
echo "Code Daddy local updater enabled: $plist"
