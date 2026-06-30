#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="ThreadLight"
PROJECT_PATH="native/ThreadLight/ThreadLight.xcodeproj"
SCHEME="ThreadLight (macOS)"
CONFIGURATION="Debug"
DERIVED_DATA_PATH="/private/tmp/threadlight-derived"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="$DERIVED_DATA_PATH/Build/Products/$CONFIGURATION/$APP_NAME.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$APP_NAME"

cd "$ROOT_DIR"

unregister_stale_threadlight_apps() {
  local search_root candidate
  for search_root in \
    "$ROOT_DIR/native/DerivedData" \
    "$HOME/Library/Developer/Xcode/DerivedData" \
    "/private/tmp"; do
    [[ -d "$search_root" ]] || continue
    while IFS= read -r candidate; do
      [[ "$candidate" == "$APP_BUNDLE" ]] && continue
      "$LSREGISTER" -u "$candidate" >/dev/null 2>&1 || true
    done < <(/usr/bin/find "$search_root" -path "*/$APP_NAME.app" -type d -prune 2>/dev/null)
  done
}

pkill -x "$APP_NAME" >/dev/null 2>&1 || true
unregister_stale_threadlight_apps
/usr/bin/xattr -cr "$ROOT_DIR/native/ThreadLight" "$ROOT_DIR/extension" >/dev/null 2>&1 || true
rm -rf "$DERIVED_DATA_PATH/Build/Products/$CONFIGURATION/$APP_NAME.app"
rm -rf "$DERIVED_DATA_PATH/Build/Products/$CONFIGURATION/$APP_NAME Extension.appex"

xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  build

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem CONTAINS \"threadlight\""
    ;;
  --verify|verify)
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
