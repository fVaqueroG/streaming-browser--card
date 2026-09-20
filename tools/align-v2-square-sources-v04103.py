"""Size every V2 source chip as one square matching the fixed two-row filter group."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
card = base / 'frontend' / 'streaming-browser-card-v2.js'
manifest = base / 'manifest.json'
old_v1 = (base / 'frontend' / 'streaming-browser-card.js').read_bytes()
meta = json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version'] == '0.4.102', f"Expected 0.4.102, got {meta['version']}"
src = card.read_text(encoding='utf-8')
assert src.count('const STREAMING_BROWSER_VERSION = "0.4.102";') == 1

def replace_once(old: str, new: str) -> None:
    global src
    count = src.count(old)
    assert count == 1, f'Expected exactly one V2 CSS match, found {count}: {old[:110]!r}'
    src = src.replace(old, new, 1)

replace_once(
    '    .v2-provider-strip { display:flex; flex-wrap:wrap; align-items:center; min-width:0;\n'
    '      gap:clamp(8px,1.2vw,16px); overflow:visible; padding:2px 1px 10px; }',
    '    /* One source square matches the complete fixed Movies/Series + genre stack. */\n'
    '    .v2-provider-strip { --v2-mode-height:56px; --v2-genre-height:38px;\n'
    '      --v2-filter-gap:7px;\n'
    '      --v2-source-size:calc(var(--v2-mode-height) + var(--v2-filter-gap) + var(--v2-genre-height));\n'
    '      display:flex; flex-wrap:wrap; align-items:stretch; min-width:0;\n'
    '      gap:clamp(8px,1.2vw,16px); overflow:visible; padding:2px 1px 10px; }'
)
replace_once(
    '    .v2-provider-strip .switcher { display:grid;\n'
    '      grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px 6px;',
    '    .v2-provider-strip .switcher { display:grid;\n'
    '      grid-template-columns:repeat(2,minmax(0,1fr));\n'
    '      column-gap:6px; row-gap:var(--v2-filter-gap);'
)
replace_once(
    '    .v2-provider-strip .switcher .mode { min-width:0; width:100%;\n'
    '      min-height:56px; padding:8px 6px; margin:0; }',
    '    .v2-provider-strip .switcher .mode { min-width:0; width:100%;\n'
    '      height:var(--v2-mode-height); min-height:var(--v2-mode-height);\n'
    '      padding:8px 6px; margin:0; }'
)
replace_once(
    '    .v2-provider-strip .switcher .genre-select { grid-column:1 / -1;\n'
    '      width:100%; min-width:0; max-width:none; min-height:38px;\n'
    '      margin:0; box-sizing:border-box; }',
    '    .v2-provider-strip .switcher .genre-select { grid-column:1 / -1;\n'
    '      width:100%; min-width:0; max-width:none;\n'
    '      height:var(--v2-genre-height); min-height:var(--v2-genre-height);\n'
    '      margin:0; box-sizing:border-box; }'
)
replace_once(
    '    .v2-provider-choice { flex:1 1 250px; min-width:0; max-width:100%;\n'
    '      display:flex; align-items:center; gap:8px; }',
    '    .v2-provider-choice { flex:1 1 250px; min-width:0; max-width:100%;\n'
    '      display:flex; align-items:stretch; gap:8px; }'
)
replace_once(
    '    .v2-provider-choice > .chip[data-provider="all"] { flex:0 0 70px;\n'
    '      position:relative; z-index:1; }',
    '    .v2-provider-choice > .chip[data-provider="all"] {\n'
    '      flex:0 0 var(--v2-source-size); position:relative; z-index:1; }'
)
replace_once(
    '    .v2-provider-scroll { flex:1 1 auto; min-width:0; max-width:100%;\n'
    '      overflow-x:auto; overflow-y:hidden; overscroll-behavior-inline:contain;\n'
    '      touch-action:pan-x; scrollbar-width:thin; padding:1px 1px 8px; }',
    '    .v2-provider-scroll { flex:1 1 auto; min-width:0; max-width:100%;\n'
    '      height:var(--v2-source-size); overflow-x:auto; overflow-y:hidden;\n'
    '      overscroll-behavior-inline:contain; touch-action:pan-x;\n'
    '      scrollbar-width:none; padding:0; }\n'
    '    .v2-provider-scroll::-webkit-scrollbar { display:none; }'
)
replace_once(
    '    .v2-provider-scroll .chips { display:flex; width:max-content; min-width:100%;\n'
    '      flex-wrap:nowrap; overflow:visible; padding:0; gap:8px; align-items:center; }',
    '    .v2-provider-scroll .chips { display:flex; width:max-content; min-width:100%;\n'
    '      height:var(--v2-source-size); flex-wrap:nowrap; overflow:visible;\n'
    '      padding:0; gap:8px; align-items:stretch; }'
)
replace_once(
    '    .v2-provider-strip .chip { width:70px; min-width:70px; height:64px;\n'
    '      padding:6px; display:flex; align-items:center; justify-content:center;\n'
    '      gap:3px; border-radius:13px; }',
    '    .v2-provider-strip .chip { width:var(--v2-source-size);\n'
    '      min-width:var(--v2-source-size); height:var(--v2-source-size);\n'
    '      min-height:var(--v2-source-size); flex:0 0 var(--v2-source-size);\n'
    '      aspect-ratio:1 / 1; padding:8px; display:flex; align-items:center;\n'
    '      justify-content:center; gap:4px; border-radius:13px; }'
)
replace_once(
    '    .v2-provider-strip .chip img { width:38px; height:38px; border-radius:8px; }',
    '    .v2-provider-strip .chip img { width:54px; height:54px;\n'
    '      max-width:100%; max-height:100%; border-radius:9px; object-fit:contain; }'
)
replace_once(
    '    .v2-provider-strip .chip[data-provider="all"] ha-icon { --mdc-icon-size:24px; }',
    '    .v2-provider-strip .chip[data-provider="all"] ha-icon { --mdc-icon-size:32px; }'
)
replace_once(
    '      .v2-provider-strip { gap:9px; }',
    '      .v2-provider-strip { --v2-mode-height:48px; gap:9px; }'
)
replace_once(
    '      .v2-provider-strip .switcher .mode { min-height:48px; padding:7px 5px; }',
    '      .v2-provider-strip .switcher .mode { height:var(--v2-mode-height);\n'
    '        min-height:var(--v2-mode-height); padding:7px 5px; }'
)
replace_once(
    '      .v2-provider-strip .chip { width:59px; min-width:59px; height:57px; }\n'
    '      .v2-provider-strip .chip img { width:32px; height:32px; }',
    '      .v2-provider-strip .chip img { width:48px; height:48px; }'
)
replace_once('const STREAMING_BROWSER_VERSION = "0.4.102";',
             'const STREAMING_BROWSER_VERSION = "0.4.103";')
# The old V1 bundle is never modified, so existing Lovelace instances keep their UI.
assert (base / 'frontend' / 'streaming-browser-card.js').read_bytes() == old_v1
assert 'v2-provider-scroll' in src and '--v2-source-size' in src
assert 'flex:0 0 var(--v2-source-size)' in src
card.write_text(src, encoding='utf-8')
meta['version'] = '0.4.103'
manifest.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with (root / 'README.md').open('a', encoding='utf-8') as readme:
    readme.write('''\n\n## v0.4.103 — V2 aligned square sources\n\nV2 uses equal square All/provider buttons. Their top/bottom edges match the fixed Movies/Series row and full-width Genre selector beneath it, respectively. Buttons are 101 × 101 px on tablets/desktops (56 + 7 + 38), and 93 × 93 px on phones (48 + 7 + 38). All remains fixed; only provider icons scroll horizontally. Room and playback routing, catalog tabs and V1 JavaScript are unchanged.\n''')
print('PASS V2 square source buttons: desktop 101x101, mobile 93x93; matched filter heights; V1 preserved')
