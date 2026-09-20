"""Bundle a single state-driven power toggle into Streaming Browser v0.4.80."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
base = ROOT / 'custom_components/streaming_browser'
frontend = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
card = frontend.read_text(encoding='utf-8')
marker = '/* Streaming Browser v0.4.80: replace separate power buttons with a single state-driven switch. */'
assert marker not in card, 'Power toggle already bundled; refusing duplicate installation'
old = 'const STREAMING_BROWSER_VERSION = "0.4.79";'
assert card.count(old) == 1, 'Expected v0.4.79 card; rebase before applying'
assert '/* Streaming Browser v0.4.79: optional per-connection power helper. */' in card
card = card.replace(old, 'const STREAMING_BROWSER_VERSION = "0.4.80";', 1)
card = card.replace(' * v0.4.79\n', ' * v0.4.80\n', 1)
addition = (ROOT / 'tools/streaming-browser-power-toggle-v0480.js').read_text(encoding='utf-8')
frontend.write_text(card.rstrip() + '\n\n' + addition.rstrip() + '\n', encoding='utf-8')
data = json.loads(manifest.read_text(encoding='utf-8'))
assert data['version'] == '0.4.79', 'Unexpected manifest version; rebase first'
data['version'] = '0.4.80'
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
readme = ROOT / 'README.md'
readme.write_text(readme.read_text(encoding='utf-8') + '''\n\n## One power switch (v0.4.80)\n\nFor room connections with an optional Power helper, the card displays one accessible On/Off switch instead of two separate power buttons. The switch reflects the Home Assistant `switch.*` or `input_boolean.*` entity state, is disabled when the entity is unavailable or a power command is in progress, and remains unchanged if turning off during playback is cancelled. The existing automatic turn-on, startup delay and manual-off confirmation are preserved. Connections without a Power helper have no power switch.\n''', encoding='utf-8')
print('Bundled Streaming Browser v0.4.80 with one power switch')
