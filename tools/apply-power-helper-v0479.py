"""Bundle optional per-connection power control into Streaming Browser v0.4.79."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
base = ROOT / 'custom_components/streaming_browser'
frontend = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
card = frontend.read_text(encoding='utf-8')
marker = '/* Streaming Browser v0.4.79: optional per-connection power helper. */'
assert marker not in card, 'Power helper already bundled; refusing duplicate installation'
old = 'const STREAMING_BROWSER_VERSION = "0.4.78";'
assert card.count(old) == 1, 'Expected v0.4.78 card; rebase before applying'
assert '/* Streaming Browser v0.4.78: room and connection routing.' in card, 'Room routing is required'
card = card.replace(old, 'const STREAMING_BROWSER_VERSION = "0.4.79";', 1)
card = card.replace(' * v0.4.78\n', ' * v0.4.79\n', 1)
power = (ROOT / 'tools/streaming-browser-power-helper-v0479.js').read_text(encoding='utf-8')
status = (ROOT / 'tools/streaming-browser-power-status-v0479.js').read_text(encoding='utf-8')
frontend.write_text(card.rstrip() + '\n\n' + power.rstrip() + '\n\n' + status.rstrip() + '\n', encoding='utf-8')
data = json.loads(manifest.read_text(encoding='utf-8'))
assert data['version'] == '0.4.78', 'Unexpected integration version; rebase first'
data['version'] = '0.4.79'
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
readme = ROOT / 'README.md'
text = readme.read_text(encoding='utf-8')
text += '''\n\n## Optional smart-plug / power helper (v0.4.79)\n\nIn the card visual editor, expand **Rooms & connections**, then expand the desired playback connection. Choose an optional **Power helper** (`switch.*` smart plug or `input_boolean.*` Home Assistant helper) and a **Power-on delay** in milliseconds (default 5000, max 60000). Leave the field empty for devices that do not need external power. The helper is scoped to the selected connection, not the entire dashboard. When playback or HDMI preparation starts, the card turns on an off helper, waits for the configured boot delay, then uses the existing TV/HDMI/wake/playback routing. The card skips `turn_on` if Home Assistant reports the helper already on and deduplicates commands while Home Assistant is updating. The room selector displays separate power-on and power-off buttons with the current entity status for connections with a helper. Power-off is **manual only**, never triggered by changing rooms or playback devices; shutting off power during playback asks for confirmation. An `input_boolean` must have Home Assistant automations that actually turn the smart plug on/off. If an external smart plug powers a TV or streamer, configure a safe shutdown method where necessary before cutting its mains power. Existing cards and other room connections without a helper are unaffected.\n'''
readme.write_text(text, encoding='utf-8')
print('Bundled Streaming Browser v0.4.79 optional per-connection power helper')
