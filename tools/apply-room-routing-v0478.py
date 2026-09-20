"""Bundle the room selector into the Home Assistant integration frontend."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
frontend = ROOT / 'custom_components/streaming_browser/frontend/streaming-browser-card.js'
manifest = ROOT / 'custom_components/streaming_browser/manifest.json'
addition = (ROOT / 'tools/streaming-browser-room-routing-v0478.js').read_text(encoding='utf-8')
card = frontend.read_text(encoding='utf-8')
marker = '/* Streaming Browser v0.4.78: room and connection routing. Bundled into the card. */'
assert marker not in card, 'Room routing already bundled; refusing a duplicate installation'
card, count = re.subn(r'const STREAMING_BROWSER_VERSION = "0\.4\.77";',
                      'const STREAMING_BROWSER_VERSION = "0.4.78";', card, count=1)
assert count == 1, 'Expected v0.4.77 card; main has changed, rebase before applying'
card = card.replace(' * v0.4.77\n', ' * v0.4.78\n', 1)
# Existing UI registers its custom element before this compatibility-safe extension.
assert 'customElements.define(\n    "streaming-browser-card",\n    StreamingBrowserCard\n  );' in card
frontend.write_text(card.rstrip() + '\n\n' + addition.rstrip() + '\n', encoding='utf-8')
data = json.loads(manifest.read_text(encoding='utf-8'))
assert data['version'] == '0.4.77', 'Expected v0.4.77 integration manifest'
data['version'] = '0.4.78'
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
readme = ROOT / 'README.md'
text = readme.read_text(encoding='utf-8')
text += '''\n\n## Rooms and HDMI connections (v0.4.78)\n\nEdit a Streaming Browser card and expand **Rooms & connections**. Select **Add room** to migrate the original TV/media-player configuration into the first room; then rename it and add as many rooms and playback connections as needed. Each connection has its own platform (LG webOS, Android TV, Roku), playback `media_player`, optional display TV, HDMI input, optional `remote` and ADB entities, and HDMI switching delay. HDMI options are read from the selected display TV's `source_list`; saved inputs remain selectable while a TV is offline. Choose a default connection in each room. On the card, select a room and, when a room has multiple connections, select a playback device. Device selection reroutes playback and the remote without discarding the current catalog or title view. The last room and connection are saved locally per card title; set `room_storage_key` on cards with identical titles that should keep independent selections. Older single-device cards continue to work unchanged. The existing playback logic turns on the display, switches HDMI if configured and then opens the streaming app on the selected playback device.\n'''
readme.write_text(text, encoding='utf-8')
print('Bundled Streaming Browser v0.4.78 with rooms, multiple HDMI routes and visual editor')
