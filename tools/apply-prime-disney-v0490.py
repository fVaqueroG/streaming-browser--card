"""Bundle Prime TV deep links and provider URL destination specificity into v0.4.90."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
base=root/'custom_components'/'streaming_browser'
card=base/'frontend'/'streaming-browser-card.js'
manifest=base/'manifest.json'
source=card.read_text(encoding='utf-8')
old='const STREAMING_BROWSER_VERSION = "0.4.89";'
marker='/* Streaming Browser v0.4.90: Prime TV targeting and Disney+ link specificity. */'
assert source.count(old)==1,'Expected v0.4.89 installed frontend'
assert marker not in source,'Already bundled'
for required in ('/* Streaming Browser v0.4.89: Netflix episode TV app-specific launch. */',
                 '/* Streaming Browser v0.4.88: episode > season > series; WatchHub last. */',
                 '/* Streaming Browser v0.4.88: series link routing finalization. */',
                 '/* Compact action captions v0.4.84 */'):
    assert required in source,required
addon=(root/'tools'/'streaming-browser-prime-disney-v0490.js').read_text(encoding='utf-8')
assert addon.startswith(marker)
source=source.replace(old,'const STREAMING_BROWSER_VERSION = "0.4.90";',1)
source=source.replace(' * v0.4.89\n',' * v0.4.90\n',1)
card.write_text(source.rstrip()+'\n\n'+addon.rstrip()+'\n',encoding='utf-8')
meta=json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version']=='0.4.89', 'Expected v0.4.89 manifest'
meta['version']='0.4.90'
manifest.write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
with (root/'README.md').open('a',encoding='utf-8') as file:
    file.write('''\n\n## v0.4.90: Prime Video TV links and Disney+ destination labels\n\nPrime Video Play on TV translates a provider `/detail/<id>` link to the Prime Android TV app GTI target, explicitly targeting the installed Prime package when an optional ADB media player or ADB remote is configured; the standard remote remains the fallback/default. LG webOS passes the full selected original Prime URL as `amazon` `contentTarget` before a legacy launcher retry on a service error. Play in device stays unchanged. Disney+ `/series/`, `/show/` and `/browse/entity-` links returned from an episode lookup are now **Series**, not **Episode**. Links must identify a distinct playable entity and have matching season/episode metadata before they receive the Episode label. Duplicate Prime episode and series links are downgraded rather than advertised as exact episodes. Netflix v0.4.89 launcher, compact buttons, rooms, ADB remote and episode > season > series / WatchHub last priorities are retained. Exact TV app navigation still depends on installed provider app link support.\n''')
print('Bundled v0.4.90 Prime TV app target and Disney+ destination classification')
