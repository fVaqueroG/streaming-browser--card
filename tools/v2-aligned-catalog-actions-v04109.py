"""Align V2 catalog actions on the right and use one consistent button style."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
card_path = base / 'frontend' / 'streaming-browser-card-v2.js'
manifest_path = base / 'manifest.json'
data = json.loads(manifest_path.read_text(encoding='utf-8'))
assert data['version'] == '0.4.108', data['version']
s = card_path.read_text(encoding='utf-8')
assert s.count('const STREAMING_BROWSER_VERSION = "0.4.108";') == 1

# Align the existing non-scrolling expanded-catalog toolbar to the right.
old = '''    .v2-back-to-carousel-bar { flex:0 0 auto; display:flex; align-items:center;
      justify-content:flex-start; min-width:0; padding:8px clamp(10px,1.5vw,20px);'''
new = '''    .v2-back-to-carousel-bar { flex:0 0 auto; display:flex; align-items:center;
      justify-content:flex-end; min-width:0; padding:8px clamp(10px,1.5vw,20px);'''
assert s.count(old) == 1, 'Cannot locate the V2 expanded catalog toolbar alignment'
s = s.replace(old, new, 1)

# Both actions use the same actual button appearance. The return action keeps
# its left chevron and fixed position; See all retains its right chevron and
# remains beneath the regular carousel. Nothing here moves catalog content.
old = '''    .v2-see-all { display:flex; align-items:center; justify-content:flex-end;
      gap:6px; margin:18px 0 3px auto; min-height:38px; border:0;
      background:transparent; color:var(--primary-text-color); cursor:pointer;
      font:inherit; font-size:13px; opacity:.88; padding:6px 8px; }'''
new = '''    .v2-see-all { display:flex; align-items:center; justify-content:center;
      width:max-content; max-width:100%; gap:6px; margin:18px 0 3px auto;
      min-height:36px; border:1px solid var(--divider-color); border-radius:9px;
      background:var(--secondary-background-color); color:var(--primary-text-color);
      cursor:pointer; font:inherit; font-size:13px; opacity:1; padding:7px 10px; }'''
assert s.count(old) == 1, 'Cannot locate the V2 See all button style'
s = s.replace(old, new, 1)

# Previously the toolbar overrode button styling. Remove the duplicate style
# definitions so both actions inherit precisely the same shared treatment.
old = '''    .v2-back-to-carousel-bar .v2-see-all { margin:0; padding:7px 10px;
      min-height:36px; justify-content:flex-start; gap:6px;
      border-radius:9px; background:var(--secondary-background-color); }'''
new = '''    .v2-back-to-carousel-bar .v2-see-all { margin:0; }'''
assert s.count(old) == 1, 'Cannot locate the V2 return-button style overrides'
s = s.replace(old, new, 1)

s = s.replace('const STREAMING_BROWSER_VERSION = "0.4.108";',
              'const STREAMING_BROWSER_VERSION = "0.4.109";', 1)
card_path.write_text(s, encoding='utf-8')
data['version'] = '0.4.109'
manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with (root / 'README.md').open('a', encoding='utf-8') as readme:
    readme.write('''\n\n## v0.4.109 — Matching right-aligned catalog actions (V2)\n\nThe fixed **Back to carousel** button sits on the right above the expanded poster grid. **See all** stays beneath the horizontal carousel and now uses the same bordered, rounded secondary-background button treatment, spacing and icon sizing. Incremental rendering, room controls, provider scrolling, V1 and playback are unchanged.\n''')
print('PASS: V2 Back to carousel right-aligned; See all and Back share button styling; V1 untouched')
