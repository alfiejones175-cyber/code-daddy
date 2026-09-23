#!/bin/bash
set -euo pipefail

package_dir=$(cd "$(dirname "$0")/.." && pwd)
dist_dir="$package_dir/dist"
cache_dir="$HOME/Library/Caches/Code Daddy Local Updater"
marker="$cache_dir/local-update.ready"
cached_archive="$cache_dir/opencode-desktop-mac.zip"
channel=${OPENCODE_CHANNEL:-dev}

if [[ $(uname -s) != Darwin || "$channel" != dev ]]; then
  exit 0
fi

case $(uname -m) in
  arm64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  *) echo "Unsupported Mac architecture" >&2; exit 1 ;;
esac

source_app="$dist_dir/mac-$arch/Code Daddy.app"
source_asar="$source_app/Contents/Resources/app.asar"
archive="$dist_dir/opencode-desktop-mac-$arch.zip"
target_app="$HOME/Applications/Code Daddy.app"
state_dir="$HOME/Library/Application Support/Code Daddy Local Updater"
state_file="$state_dir/installed.sha256"

hash_file() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{ print $1 }'
}

case ${1:-} in
  mark)
    [[ -f "$source_asar" && -f "$archive" ]] || { echo "Missing packaged Code Daddy app or zip" >&2; exit 1; }
    [[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$source_app/Contents/Info.plist") == ai.opencode.desktop.dev ]] || {
      echo "Refusing to mark a non-dev app" >&2
      exit 1
    }
    asar_hash=$(hash_file "$source_asar")
    archive_asar_hash=$(/usr/bin/unzip -p "$archive" "Code Daddy.app/Contents/Resources/app.asar" | /usr/bin/shasum -a 256 | /usr/bin/awk '{ print $1 }')
    [[ "$archive_asar_hash" == "$asar_hash" ]] || { echo "Packaged app and zip differ" >&2; exit 1; }
    /bin/mkdir -p "$cache_dir"
    temp_archive=$(mktemp "$cache_dir/.opencode-desktop-mac.XXXXXX")
    /usr/bin/ditto "$archive" "$temp_archive"
    archive_hash=$(hash_file "$archive")
    [[ $(hash_file "$temp_archive") == "$archive_hash" ]] || { /bin/rm -f "$temp_archive"; echo "Archive changed during staging" >&2; exit 1; }
    /bin/mv "$temp_archive" "$cached_archive"
    temp_marker=$(mktemp "$cache_dir/.local-update.ready.XXXXXX")
    printf '%s %s\n' "$archive_hash" "$asar_hash" > "$temp_marker"
    /bin/mv "$temp_marker" "$marker"
    ;;
  check)
    [[ -f "$marker" && -f "$cached_archive" ]] || exit 0
    read -r archive_hash asar_hash < "$marker"
    [[ "$archive_hash" =~ ^[0-9a-f]{64}$ && "$asar_hash" =~ ^[0-9a-f]{64}$ ]] || { echo "Invalid update marker" >&2; exit 1; }
    [[ $(hash_file "$cached_archive") == "$archive_hash" ]] || exit 0
    /bin/mkdir -p "$state_dir"
    if [[ -f "$state_file" && -f "$target_app/Contents/Resources/app.asar" && $(/bin/cat "$state_file") == "$archive_hash" && $(hash_file "$target_app/Contents/Resources/app.asar") == "$asar_hash" ]]; then
      exit 0
    fi
    set +e
    /usr/bin/pgrep -f "$target_app/Contents/MacOS/Code Daddy" >/dev/null
    running=$?
    set -e
    [[ "$running" == 0 ]] && exit 0
    [[ "$running" == 1 ]] || { echo "Could not inspect running app" >&2; exit 1; }

    /bin/mkdir -p "$HOME/Applications"
    stage_dir=$(mktemp -d "$HOME/Applications/.code-daddy-update.XXXXXX")
    /usr/bin/ditto -x -k "$cached_archive" "$stage_dir"
    if [[ ! -f "$stage_dir/Code Daddy.app/Contents/Resources/app.asar" ]] ||
       [[ $(hash_file "$stage_dir/Code Daddy.app/Contents/Resources/app.asar") != "$asar_hash" ]] ||
       [[ $(hash_file "$cached_archive") != "$archive_hash" ]] ||
       [[ ! -f "$marker" || $(/bin/cat "$marker") != "$archive_hash $asar_hash" ]] ||
       [[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$stage_dir/Code Daddy.app/Contents/Info.plist") != ai.opencode.desktop.dev ]]; then
      /bin/rm -rf "$stage_dir"
      echo "Staged package failed verification; will retry" >&2
      exit 1
    fi
    set +e
    /usr/bin/pgrep -f "$target_app/Contents/MacOS/Code Daddy" >/dev/null
    running=$?
    set -e
    if [[ "$running" == 0 ]]; then /bin/rm -rf "$stage_dir"; exit 0; fi
    [[ "$running" == 1 ]] || { /bin/rm -rf "$stage_dir"; echo "Could not inspect running app" >&2; exit 1; }

    backup="$HOME/Applications/Code Daddy.previous-auto-$(date +%Y%m%d-%H%M%S)-$$.app"
    if [[ -d "$target_app" ]]; then /bin/mv "$target_app" "$backup"; fi
    if ! /bin/mv "$stage_dir/Code Daddy.app" "$target_app"; then
      if [[ -d "$backup" ]]; then /bin/mv "$backup" "$target_app"; fi
      /bin/rm -rf "$stage_dir"
      echo "Install failed; previous app restored" >&2
      exit 1
    fi
    /bin/rmdir "$stage_dir"
    if [[ $(hash_file "$target_app/Contents/Resources/app.asar") != "$asar_hash" ]]; then
      /bin/mv "$target_app" "$HOME/Applications/Code Daddy.failed-$(date +%Y%m%d-%H%M%S).app"
      if [[ -d "$backup" ]]; then /bin/mv "$backup" "$target_app"; fi
      echo "Installed app failed verification; previous app restored" >&2
      exit 1
    fi
    printf '%s\n' "$archive_hash" > "$state_file"
    echo "Installed Code Daddy update; previous bundle: $backup"
    ;;
  *)
    echo "Usage: $0 mark|check" >&2
    exit 2
    ;;
esac
