"""Restore previously attempted provider deep links after v0.4.85 restrictions.

Keep provider caption layout, WatchHub, optional ADB remote and room routing.
"""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / "custom_components/streaming_browser"
frontend = base / "frontend/streaming-browser-card.js"
manifest = base / "manifest.json"
text = frontend.read_text(encoding="utf-8")
assert text.count('const STREAMING_BROWSER_VERSION = "0.4.86";') == 1
assert "/* Streaming Browser v0.4.86: optional ADB remote entity" in text
assert "/* Streaming Browser v0.4.85: native Android TV app routing" in text
assert "/* Streaming Browser v0.4.87: restore working provider URL routes" not in text
addon = (root / "tools/streaming-browser-link-compatibility-v0487.js").read_text(encoding="utf-8")
assert addon.startswith("/* Streaming Browser v0.4.87: restore working provider URL routes")
text = text.replace('const STREAMING_BROWSER_VERSION = "0.4.86";',
                    'const STREAMING_BROWSER_VERSION = "0.4.87";', 1)
text = text.replace(" * v0.4.86\n", " * v0.4.87\n", 1)
frontend.write_text(text.rstrip() + "\n\n" + addon.rstrip() + "\n", encoding="utf-8")
meta = json.loads(manifest.read_text(encoding="utf-8"))
assert meta["version"] == "0.4.86"
meta["version"] = "0.4.87"
manifest.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
with (root / "README.md").open("a", encoding="utf-8") as f:
    f.write("\n\n## v0.4.87 — link compatibility recovery\n\n"
            "Restores attempting existing provider-specific Netflix/Prime TV links that "
            "v0.4.85 previously blocked and labeled App, without falsely labeling "
            "a generic series destination as Episode. Original Prime Video URLs "
            "are tried first rather than unconditionally rewritten to a different "
            "host; the alternate is used if Home Assistant rejects the original. "
            "Restores the previous Netflix native Android TV movie intent, preserving "
            "the episode /watch link as the first episode attempt. Previously used "
            "Watchmode and JustWatch links are preferred ahead of new WatchHub "
            "fallbacks. Crunchyroll Android TV continues to launch the installed "
            "app rather than an unsupported web intent. A TV accepting a command "
            "is not confirmation that the provider actually navigated to the title. "
            "WatchHub, icon/caption controls, rooms, HDMI, power switch, and "
            "optional ADB remote remain available.\n")
print("Bundled Streaming Browser v0.4.87 link compatibility restoration")
