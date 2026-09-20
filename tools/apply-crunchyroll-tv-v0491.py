"""Fix Crunchyroll's unsupported generic Android TV HTTPS launch without changing providers."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components/streaming_browser'
card = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
readme = root / 'README.md'
source = card.read_text(encoding='utf-8')
old = 'const STREAMING_BROWSER_VERSION = "0.4.90";'
marker = '/* Streaming Browser v0.4.91: Crunchyroll Android TV opens its installed app, never a generic web intent. */'
assert source.count(old) == 1, 'Expected released 0.4.90 frontend'
assert marker not in source, 'Already patched'
assert '/* Streaming Browser v0.4.90: Prime TV targeting and Disney+ link specificity. */' in source
assert '/* Streaming Browser v0.4.88: series link routing finalization. */' in source
addon = (root / 'tools/streaming-browser-crunchyroll-tv-v0491.js').read_text(encoding='utf-8')
assert addon.count(marker) == 1
source = source.replace(old, 'const STREAMING_BROWSER_VERSION = "0.4.91";', 1)
card.write_text(source.rstrip() + '\n\n' + addon.rstrip() + '\n', encoding='utf-8')
meta = json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version'] == '0.4.90', 'Expected manifest 0.4.90'
meta['version'] = '0.4.91'
manifest.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as output:
    output.write('\n\n## v0.4.91: Crunchyroll Android TV app routing\n\nThe Crunchyroll Play on TV button now launches the installed Android TV package directly using the normal Android TV Remote, falling back to the selected TV media player app launcher when needed. It never submits Crunchyroll HTTPS URLs as generic Android VIEW intents, which can show “You don’t have an app that can do this” even with Crunchyroll installed. The TV button correctly says App because an external exact-episode TV handler is not verified. Play in device continues to use its original source URL. ADB remains entirely optional, as a last resort when standard app-launch services explicitly fail. Netflix, Prime Video, Disney+, per-provider episode/season/series ranking, WatchHub-last priority, rooms and remote controls are unchanged.\n')
print('Installed Crunchyroll app-specific Android TV launch and honest App destination')
