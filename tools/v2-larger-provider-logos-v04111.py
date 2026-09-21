from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
card_path = root / "custom_components/streaming_browser/frontend/streaming-browser-card-v2.js"
manifest_path = root / "custom_components/streaming_browser/manifest.json"
readme_path = root / "README.md"

card = card_path.read_text()
replacements = {
    'const STREAMING_BROWSER_VERSION = "0.4.110";':
        'const STREAMING_BROWSER_VERSION = "0.4.111";',
    '.v2-provider-strip .chip img { width:46px; height:46px;':
        '.v2-provider-strip .chip img { width:64px; height:64px;',
    '.v2-provider-strip .chip img { width:34px; height:34px; }':
        '.v2-provider-strip .chip img { width:56px; height:56px; }',
}
for old, new in replacements.items():
    count = card.count(old)
    assert count == 1, f"Expected exactly one match, got {count}: {old}"
    card = card.replace(old, new, 1)
card_path.write_text(card)

manifest = json.loads(manifest_path.read_text())
assert manifest["version"] == "0.4.110"
manifest["version"] = "0.4.111"
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

readme = readme_path.read_text()
note = """
## v0.4.111 — Larger provider logos in V2

Provider app logos now occupy about 75% of their existing square source buttons on desktop and mobile. The button dimensions and compact V2 header remain unchanged. The fixed All button, V1, room controls, catalogs and playback are unchanged.
"""
assert "## v0.4.111" not in readme
readme_path.write_text(readme.rstrip() + "\n\n" + note.lstrip())
