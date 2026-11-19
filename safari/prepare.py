#!/usr/bin/env python3
"""Generate the Safari copy of the extension from ../extension (left untouched).

Output: safari/Extension/ — the folder the Xcode project's appex bundles.
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent / "extension"
OUT = ROOT / "Extension"
PORT = "8767"
VERSION = "1.1.0"

if OUT.exists():
    shutil.rmtree(OUT)
shutil.copytree(SRC, OUT, ignore=shutil.ignore_patterns("*.svg", ".DS_Store"))

# --- manifest: MV2 with a persistent background page (macOS Safari allows it) ---
m = json.loads((SRC / "manifest.json").read_text())
m.pop("browser_specific_settings", None)
m["name"] = "ClaudeCodeBrowser"
m["version"] = VERSION
m["background"] = {"scripts": ["bridge.js", "background.js"], "persistent": True}
perms = [p for p in m["permissions"] if p != "<all_urls>"]
m["permissions"] = perms + ["<all_urls>", "http://127.0.0.1/*", "http://localhost/*"]
(OUT / "manifest.json").write_text(json.dumps(m, indent=2) + "\n")

shutil.copy(ROOT / "bridge.js", OUT / "bridge.js")

# --- background.js: swap native messaging for the HTTP bridge, Safari URL guards ---
bg = (OUT / "background.js").read_text()
needle = "browser.runtime.connectNative(NATIVE_HOST_NAME)"
assert needle in bg, "connectNative call not found; background.js changed"
bg = bg.replace(needle, "createHttpBridgePort()")
# Tabs without site permission may have no url in Safari
bg = bg.replace(".url.startsWith(", ".url?.startsWith(")
bg = bg.replace("moz-extension:", "safari-web-extension:")
bg = bg.replace(
    "browser.runtime.onMessageExternal.addListener(",
    "browser.runtime.onMessageExternal && browser.runtime.onMessageExternal.addListener(",
)
# Commands via runtime messages only from extension pages (popup), never from content scripts
needle = 'if (message.target === "background") {'
assert needle in bg, "background onMessage guard not found"
bg = bg.replace(needle, 'if (message.target === "background" && !sender.tab) {')
(OUT / "background.js").write_text(bg)

# --- popup: point at the Safari server port ---
for f in (OUT / "popup").glob("*.js"):
    f.write_text(re.sub(r"localhost:8765", f"127.0.0.1:{PORT}", f.read_text()))

print(f"Prepared {OUT}")
