"""Bundle optional Android TV ADB remote without requiring an ADB media player."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components/streaming_browser'
card = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
readme = root / 'README.md'
source = card.read_text(encoding='utf-8')
old_version = 'const STREAMING_BROWSER_VERSION = "0.4.85";'
assert source.count(old_version) == 1, 'Expected v0.4.85 installed frontend'
assert '/* Streaming Browser v0.4.86: optional ADB remote entity' not in source, 'Already patched'
addon = (root / 'tools/streaming-browser-optional-adb-remote-v0486.js').read_text(encoding='utf-8')
assert addon.startswith('/* Streaming Browser v0.4.86: optional ADB remote entity')
source = source.replace(old_version, 'const STREAMING_BROWSER_VERSION = "0.4.86";', 1)
source = source.replace(' * v0.4.85\n', ' * v0.4.86\n', 1)
card.write_text(source.rstrip() + '\n\n' + addon.rstrip() + '\n', encoding='utf-8')
meta = json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version'] == '0.4.85', 'Expected manifest v0.4.85'
meta['version'] = '0.4.86'
manifest.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as file:
    file.write('\n\n## v0.4.86: optional ADB remote\n\nAn Android TV connection can now select a separate optional `remote.*` entity from the Android Debug Bridge integration, as well as the existing optional ADB `media_player.*` entity. Set **ADB remote (optional)** in the single-card editor or in **Rooms & connections** for each Android TV connection. Standard Android TV Remote handles routine commands. The selected ADB remote is used for Netflix-specific keys and only when a standard remote command fails; Netflix auto-profile navigation can use the ADB remote without configuring an ADB media player. Leaving the field blank preserves existing behavior. This does not add universal TV-app episode deep-link support.\n')
print('Bundled Streaming Browser v0.4.86 with per-room optional ADB remote')
