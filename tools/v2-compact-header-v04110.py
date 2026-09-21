from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
card_path = root / "custom_components/streaming_browser/frontend/streaming-browser-card-v2.js"
manifest_path = root / "custom_components/streaming_browser/manifest.json"
readme_path = root / "README.md"

card = card_path.read_text()
replacements = {
    'const STREAMING_BROWSER_VERSION = "0.4.109";':
        'const STREAMING_BROWSER_VERSION = "0.4.110";',
    'flex-wrap:wrap; align-items:center; gap:9px; margin:0 0 10px;':
        'flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 7px;',
    'max-width:none; margin:0; }\n    .v2-header .sbr-room-controls':
        'max-width:none; margin:0; padding:8px 12px; border-radius:16px; }\n    .v2-header .sbr-room-controls',
    '.v2-provider-strip { --v2-mode-height:56px; --v2-genre-height:38px;\n      --v2-filter-gap:7px;':
        '.v2-provider-strip { --v2-mode-height:46px; --v2-genre-height:34px;\n      --v2-filter-gap:5px;',
    'gap:clamp(8px,1.2vw,16px); overflow:visible; padding:2px 1px 10px;':
        'gap:clamp(7px,1vw,12px); overflow:visible; padding:2px 1px 7px;',
    'padding:8px 6px; margin:0; }':
        'padding:6px; margin:0; }',
    'margin:0; box-sizing:border-box; }\n    .v2-provider-choice':
        'margin:0; padding:5px 8px; box-sizing:border-box; }\n    .v2-provider-choice',
    'aspect-ratio:1 / 1; padding:8px; display:flex; align-items:center;\n      justify-content:center; gap:4px; border-radius:13px;':
        'aspect-ratio:1 / 1; padding:6px; display:flex; align-items:center;\n      justify-content:center; gap:3px; border-radius:12px;',
    '.v2-provider-strip .chip img { width:54px; height:54px;':
        '.v2-provider-strip .chip img { width:46px; height:46px;',
    '.v2-provider-strip .chip[data-provider="all"] ha-icon { --mdc-icon-size:32px; }':
        '.v2-provider-strip .chip[data-provider="all"] ha-icon { --mdc-icon-size:28px; }',
    'width:100%; min-width:0; gap:8px; overflow:visible; padding-top:10px;':
        'width:100%; min-width:0; gap:7px; overflow:visible; padding-top:7px;',
    'justify-content:center; gap:7px; padding:10px 8px; min-height:44px;':
        'justify-content:center; gap:6px; padding:7px 8px; min-height:38px;',
    '.v2-category-tab ha-icon { --mdc-icon-size:20px; flex:0 0 auto; }':
        '.v2-category-tab ha-icon { --mdc-icon-size:18px; flex:0 0 auto; }',
    '.v2-provider-strip { --v2-mode-height:44px; --v2-genre-height:36px;\n        --v2-filter-gap:6px; flex-wrap:nowrap; gap:8px; align-items:stretch;':
        '.v2-provider-strip { --v2-mode-height:38px; --v2-genre-height:32px;\n        --v2-filter-gap:4px; flex-wrap:nowrap; gap:7px; align-items:stretch;',
    '.v2-provider-strip .chip img { width:38px; height:38px; }':
        '.v2-provider-strip .chip img { width:34px; height:34px; }',
    '.v2-categories { gap:5px; }':
        '.v2-categories { gap:5px; padding-top:6px; }',
    '.v2-category-tab { padding:9px 4px; gap:4px; min-height:40px; font-size:12px; }':
        '.v2-category-tab { padding:6px 4px; gap:4px; min-height:36px; font-size:12px; }',
    '.v2-category-tab ha-icon { --mdc-icon-size:17px; }':
        '.v2-category-tab ha-icon { --mdc-icon-size:16px; }',
}
for old, new in replacements.items():
    count = card.count(old)
    assert count == 1, f"Expected exactly one match, got {count}: {old[:80]}"
    card = card.replace(old, new, 1)
card_path.write_text(card)

manifest = json.loads(manifest_path.read_text())
assert manifest["version"] == "0.4.109"
manifest["version"] = "0.4.110"
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

readme = readme_path.read_text()
note = """
## v0.4.110 — More compact V2 browsing controls

The fixed V2 controls from the search field through the category tabs use shorter fields, source buttons, spacing and category buttons, leaving more vertical room for posters. The same controls, labels and TV-friendly targets remain available. Room controls, horizontal provider scrolling, catalogs, V1 and playback are unchanged.
"""
assert "## v0.4.110" not in readme
readme_path.write_text(readme.rstrip() + "\n\n" + note.lstrip())
