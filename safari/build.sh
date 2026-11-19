#!/bin/zsh
# Build the Safari extension app, install to ~/Applications, and register it with Safari.
set -euo pipefail
ROOT=${0:A:h}
APP="ClaudeCodeBrowser"
python3 "$ROOT/prepare.py"
xcodebuild -project "$ROOT/$APP/$APP.xcodeproj" -scheme "$APP" -configuration Release \
  -derivedDataPath "$ROOT/build" DEVELOPMENT_TEAM=NZDQYCJX3N CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates build -quiet
BUILT="$ROOT/build/Build/Products/Release/$APP.app"
pkill -x "$APP" 2>/dev/null || true
mkdir -p ~/Applications
rm -rf ~/Applications/"$APP.app"
cp -R "$BUILT" ~/Applications/
# Drop the build-folder copy so Safari doesn't list the extension twice.
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
for ext in "$BUILT"/Contents/PlugIns/*.appex; do pluginkit -r "$ext" 2>/dev/null || true; done
"$LSR" -u "$BUILT" 2>/dev/null || true
rm -rf "$BUILT"
open ~/Applications/"$APP.app"
echo "Installed ~/Applications/$APP.app"
