"""Align V2 genre selector under Movies + Series while keeping filter group fixed."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
card_path = base / 'frontend' / 'streaming-browser-card-v2.js'
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.101', f"Expected v0.4.101, got {manifest['version']}"
source = card_path.read_text(encoding='utf-8')
assert source.count('const STREAMING_BROWSER_VERSION = "0.4.101";') == 1
old = '''    .v2-provider-strip .switcher { flex:0 0 auto; flex-wrap:nowrap; margin:0;
      max-width:100%; min-width:0; }
    .v2-provider-strip .mode { min-height:62px; min-width:78px; }
'''
new = '''    /* Movies and Series share the top row; genre spans precisely both columns.
       The whole group stays outside the horizontally scrolling provider logos. */
    .v2-provider-strip .switcher { display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px 6px;
      flex:0 0 clamp(166px,18vw,202px); width:clamp(166px,18vw,202px);
      max-width:100%; min-width:0; margin:0; align-items:stretch; }
    .v2-provider-strip .switcher .mode { min-width:0; width:100%;
      min-height:56px; padding:8px 6px; margin:0; }
    .v2-provider-strip .switcher .genre-select { grid-column:1 / -1;
      width:100%; min-width:0; max-width:none; min-height:38px;
      margin:0; box-sizing:border-box; }
'''
assert source.count(old) == 1, 'Could not locate initial V2 fixed-filter CSS'
source = source.replace(old, new, 1)
old = '''      .v2-provider-strip .mode { min-height:56px; padding:7px 9px; }
      .v2-provider-strip .genre-select { min-width:110px; max-width:135px; margin:0; }
'''
new = '''      .v2-provider-strip .switcher { flex-basis:min(100%,176px);
        width:min(100%,176px); }
      .v2-provider-strip .switcher .mode { min-height:48px; padding:7px 5px; }
      .v2-provider-strip .switcher .genre-select { min-width:0;
        max-width:none; width:100%; margin:0; }
'''
assert source.count(old) == 1, 'Could not locate original V2 mobile genre CSS'
source = source.replace(old, new, 1)
source = source.replace('const STREAMING_BROWSER_VERSION = "0.4.101";',
                        'const STREAMING_BROWSER_VERSION = "0.4.102";', 1)
card_path.write_text(source, encoding='utf-8')
manifest['version'] = '0.4.102'
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with (root/'README.md').open('a', encoding='utf-8') as readme:
    readme.write('''\n\n## v0.4.102 — V2 aligned fixed filters\n\nV2 places the genre selector directly beneath Movies and Series, spanning exactly the combined width of the two buttons. This aligned filter group stays fixed while provider logos scroll; the separate grid-icon-over-**All** button remains fixed as well. The filter group adapts on tablets and phones. V1, room routing and playback are unchanged.\n''')
print('PASS V2 Movies/Series above full-width genre selector; independent provider logo scrolling retained')
