"""Install native Crunchyroll exact-watch Android TV routing without reverting other providers."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components/streaming_browser'
frontend = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
readme = root / 'README.md'
addon_path = root / 'tools/streaming-browser-crunchyroll-deeplinks-v0492.js'
old = 'const STREAMING_BROWSER_VERSION = "0.4.91";'
new = 'const STREAMING_BROWSER_VERSION = "0.4.92";'
marker = '/* Streaming Browser v0.4.92: native Crunchyroll /watch/ playback on Android TV. */'
text = frontend.read_text(encoding='utf-8')
addon = addon_path.read_text(encoding='utf-8').rstrip()
assert text.count(old) == 1, 'Expected v0.4.91 frontend; refuse to overwrite a different release'
assert text.count(marker) == 0 and addon.count(marker) == 1, 'Native handler already installed or missing'
assert '/* Streaming Browser v0.4.91: Crunchyroll Android TV opens its installed app, never a generic web intent. */' in text
assert '/* Streaming Browser v0.4.90: Prime TV targeting and Disney+ link specificity. */' in text
assert '/* Streaming Browser v0.4.89: Netflix episode TV app-specific launch. */' in text
meta = json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version'] == '0.4.91', 'Expected v0.4.91 backend'
frontend.write_text(text.replace(old, new, 1).rstrip() + '\n\n' + addon + '\n', encoding='utf-8')
meta['version'] = '0.4.92'
manifest.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as output:
    output.write('\n\n## v0.4.92: native Crunchyroll Android TV playback (no ADB)\n\nWhen an exact official Crunchyroll `/watch/{content_id}` source is available for the selected episode or movie, Play on TV extracts its provider-specific ID and sends `crunchyroll://episode/{content_id}` or `crunchyroll://movie/{content_id}` through the selected Android TV Remote. If that remote action raises an error, the configured Android TV media player receives the same URI. Sending the next episode does not restart the app or send extra profile/navigation keys. A missing, show-level or incorrectly scoped link retains the existing app-only action; the card does not invent a Crunchyroll ID from TMDB or substitute another episode. Episode playback and switching have been tested on a TV; movie deep links have been implemented from the APK movie routing but still need an on-device movie test. Existing LG webOS, Roku, Netflix, Prime, Disney, Nuvio, room/HDMI, optional ADB and WatchHub behavior is unchanged.\n')
print('Installed v0.4.92 native Crunchyroll episode and movie watch-link routing')
