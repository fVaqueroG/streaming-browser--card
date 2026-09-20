"""Keep V2 categories as three equal-width tabs, shorten Recent Releases caption."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
base=root/'custom_components'/'streaming_browser'
v1=base/'frontend'/'streaming-browser-card.js'
v2=base/'frontend'/'streaming-browser-card-v2.js'
meta_path=base/'manifest.json'
meta=json.loads(meta_path.read_text(encoding='utf-8'))
assert meta['version']=='0.4.103', meta['version']
original_v1=v1.read_bytes()
src=v2.read_text(encoding='utf-8')
assert src.count('const STREAMING_BROWSER_VERSION = "0.4.103";')==1

def once(old,new):
    global src
    assert src.count(old)==1, (src.count(old), old)
    src=src.replace(old,new,1)

once('    .v2-categories { display:flex; gap:8px; overflow-x:auto;\n'
     '      overscroll-behavior-inline:contain; scrollbar-width:thin; padding-top:10px;\n'
     '      border-top:1px solid var(--divider-color); }',
     '    /* Three equal horizontal categories span the entire card width. */\n'
     '    .v2-categories { display:grid; grid-template-columns:repeat(3,minmax(0,1fr));\n'
     '      width:100%; min-width:0; gap:8px; overflow:visible; padding-top:10px;\n'
     '      border-top:1px solid var(--divider-color); }')
once('    .v2-category-tab { flex:1 0 max-content; display:flex; align-items:center;\n'
     '      justify-content:center; gap:9px; padding:10px 14px; min-height:44px;',
     '    .v2-category-tab { display:flex; min-width:0; width:100%; align-items:center;\n'
     '      justify-content:center; gap:7px; padding:10px 8px; min-height:44px;')
once('    .v2-category-tab ha-icon { --mdc-icon-size:20px; }',
     '    .v2-category-tab ha-icon { --mdc-icon-size:20px; flex:0 0 auto; }\n'
     '    .v2-category-tab span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }')
once('      .v2-category-tab { padding:9px 12px; min-height:40px; font-size:12px; }',
     '      .v2-categories { gap:5px; }\n'
     '      .v2-category-tab { padding:9px 4px; gap:4px; min-height:40px; font-size:12px; }\n'
     '      .v2-category-tab ha-icon { --mdc-icon-size:17px; }')
once('tab.innerHTML = `<ha-icon icon="${tabIcons[key]}" aria-hidden="true"></ha-icon><span>${this._t(tabLabels[key])}</span>`;',
     "tab.innerHTML = `<ha-icon icon=\"${tabIcons[key]}\" aria-hidden=\"true\"></ha-icon><span>${key === 'provider-recent' ? (this._locale() === 'es' ? 'Recientes' : 'Recent') : this._t(tabLabels[key])}</span>`;")
once('const STREAMING_BROWSER_VERSION = "0.4.103";', 'const STREAMING_BROWSER_VERSION = "0.4.104";')
assert v1.read_bytes()==original_v1
assert 'v2-provider-scroll' in src and '--v2-source-size' in src
v2.write_text(src,encoding='utf-8')
meta['version']='0.4.104'
meta_path.write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
with (root/'README.md').open('a',encoding='utf-8') as f:
    f.write('\n\n## v0.4.104 — three equal-width V2 category tabs\n\nV2 distributes Popular, Top Rated and Recent into three equal-width tabs spanning its full width. Recent is a shorter label for the existing Recent Releases catalog; the category query, fixed controls, All and identically sized square provider buttons from v0.4.103 remain unchanged. V1 is unchanged.\n')
print('PASS V2 equal-width Popular/Top Rated/Recent tabs; square fixed source controls and V1 preserved')
