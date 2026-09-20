"""Bundle Netflix episode TV navigation without altering provider URL selection."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root/'custom_components'/'streaming_browser'
card = base/'frontend'/'streaming-browser-card.js'
manifest = base/'manifest.json'
source = card.read_text(encoding='utf-8')
old_version='const STREAMING_BROWSER_VERSION = "0.4.88";'
marker='/* Streaming Browser v0.4.89: Netflix episode TV app-specific launch. */'
assert source.count(old_version)==1, 'Expected frontend version v0.4.88'
assert marker not in source, 'Netflix episode fix already applied'
for required in ('/* Streaming Browser v0.4.88: restored v0.4.82 link handling. */',
                 '/* Streaming Browser v0.4.88: episode > season > series; WatchHub last. */',
                 '/* Streaming Browser v0.4.88: series link routing finalization. */',
                 '/* Streaming Browser v0.4.86: optional ADB remote entity'):
    assert required in source, required
addon=(root/'tools'/'streaming-browser-netflix-episode-tv-v0489.js').read_text(encoding='utf-8')
assert addon.startswith(marker)
source=source.replace(old_version,'const STREAMING_BROWSER_VERSION = "0.4.89";',1)
source=source.replace(' * v0.4.88\n',' * v0.4.89\n',1)
card.write_text(source.rstrip()+'\n\n'+addon.rstrip()+'\n',encoding='utf-8')
meta=json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version']=='0.4.88', 'Expected manifest version v0.4.88'
meta['version']='0.4.89'
manifest.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with (root/'README.md').open('a',encoding='utf-8') as file:
    file.write('''\n\n## v0.4.89: Netflix episode TV navigation\n\nNetflix episode Play on TV no longer routes the selected `/watch/<episodeId>?trackId=...` HTTPS link through Android TV's generic activity handler (which can merely open Netflix). Android TV uses the Netflix-native episode content ID, via the optional ADB media player/remote if configured or the standard Android TV Remote otherwise. LG webOS sends the original provider episode URL, including its existing trackId, to Netflix `contentTarget` before attempting an episode-specific webOS launch fallback. Play in device retains the unchanged source URL; Watchmode/JustWatch/WatchHub and episode > season > series priority are unchanged. A successful Home Assistant service call does not guarantee that a particular Netflix TV app build supports exact episode navigation.\n''')
print('Bundled v0.4.89 Netflix episode app-specific TV launch; source links and priority unchanged')
