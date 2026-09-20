"""Publish the refreshed HACS-facing README with a matching integration/card version."""
from pathlib import Path
import json

root = Path('custom_components/streaming_browser')
frontend = root / 'frontend/streaming-browser-card.js'
js = frontend.read_text(encoding='utf-8')
old = 'const STREAMING_BROWSER_VERSION = "0.4.74";'
assert js.count(old) == 1, 'Unexpected frontend version: abort docs release'
js = js.replace(old, 'const STREAMING_BROWSER_VERSION = "0.4.75";', 1)
js = js.replace(' * v0.4.74\n', ' * v0.4.75\n', 1)
js = js.replace('STREAMING-BROWSER-CARD %c v0.4.74', 'STREAMING-BROWSER-CARD %c v0.4.75', 1)
frontend.write_text(js, encoding='utf-8')

manifest_path = root / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.74', 'Unexpected integration version: abort docs release'
manifest['version'] = '0.4.75'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

readme_path = Path('README.md')
readme = readme_path.read_text(encoding='utf-8')
heading = '## Recent release highlights\n\n'
assert readme.count(heading) == 1
assert 'v0.4.74 — Roku TV and Roku streaming players' in readme
assert '**Current version: v0.4.66.**' not in readme
assert 'v=0.4.63' not in readme
readme = readme.replace(heading, heading + '- **v0.4.75 — HACS documentation:** Bring the HACS-facing README, installation instructions and recent changes up to date; link directly to the latest GitHub release notes and use a dynamic release badge instead of an obsolete hard-coded current-version statement. Playback behavior and existing configurations are unchanged.\n', 1)
readme_path.write_text(readme, encoding='utf-8')
print('PASS: v0.4.75 manifest/frontend and current HACS README aligned')
