"""Bundle dashboard JS, backend, and one-time migration docs for v0.4.63."""
from pathlib import Path
import json

root = Path('.')
folder = root / 'custom_components' / 'streaming_browser'
manifest = json.loads((folder / 'manifest.json').read_text())
assert manifest['version'] == '0.4.63' and manifest['config_flow'] is True
assert (folder / 'justwatch.py').is_file() and (folder / 'providers.py').is_file()
original = (root / 'streaming-browser-card.js').read_text(encoding='utf-8')
assert 'const STREAMING_BROWSER_VERSION = "0.4.62";' in original
card = original.replace('const STREAMING_BROWSER_VERSION = "0.4.62";', 'const STREAMING_BROWSER_VERSION = "0.4.63";', 1)
card = card.replace(' * v0.4.62', ' * v0.4.63', 1)
assert 'streaming_browser/episode_links' in card and '/nuvio/nuvio-card.js' not in card
target = folder / 'frontend' / 'streaming-browser-card.js'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(card, encoding='utf-8')
init = (folder / '__init__.py').read_text(encoding='utf-8')
assert '_CARD_URL = "/streaming_browser/streaming-browser-card.js"' in init
assert 'StaticPathConfig' in init and 'async_create_item' in init
assert 'ws_episode_links' in init
readme = root / 'README.md'
old = readme.read_text(encoding='utf-8')
prefix = '''# Streaming Browser — Home Assistant Integration

**Current version: v0.4.63.** The dashboard card and independent episode-link backend are now **one HACS Integration**. All runtime files are bundled inside `custom_components/streaming_browser/`; the card's JavaScript is served automatically from `/streaming_browser/streaming-browser-card.js?v=0.4.63`. No manual file copying or `configuration.yaml` entry is required for a new install.

## One-time migration from the older HACS Dashboard card

1. In HACS, uninstall the **old Streaming Browser Card** from the **Dashboard** category (do **not** delete your existing dashboard cards or their configuration). This prevents loading two copies of the same custom element.
2. Under HACS > Custom repositories, remove the old repository entry if it persists, then add `https://github.com/fVaqueroG/streaming-browser--card` in the **Integration** category. Install **Streaming Browser**.
3. Restart Home Assistant, then go to Settings > Devices & services > Add integration > **Streaming Browser** and confirm its setup form. No API key is needed for its anonymous JustWatch lookup; your existing TMDB key stays in the dashboard card configuration.
4. Refresh the dashboard. Existing `type: custom:streaming-browser-card` cards should be preserved. The card's version label should read **v0.4.63**. If an old HACS dashboard resource remains under Settings > Dashboards > Resources, remove its `/hacsfiles/streaming-browser--card/streaming-browser-card.js` resource; keep the new `/streaming_browser/streaming-browser-card.js?v=0.4.63` module.

**Future updates:** update only **Streaming Browser** in HACS (Integration category), restart Home Assistant, and refresh the dashboard. The backend and card JavaScript update together, and the resource URL changes version automatically to avoid stale caching. No additional Nuvio installation is required.

**Existing legacy YAML:** if you already added `streaming_browser:` to `configuration.yaml` for the older backend, it is safe to leave it temporarily; remove that obsolete line when convenient and restart. The new UI integration does not require it.

**Scope:** TMDB still supplies catalogs and episode metadata; the independent JustWatch GraphQL resolver supplies episode-level provider links. It is an unofficial service and cannot guarantee playback in every native TV app. Movie title URLs may still use your previously configured Watchmode script.

---

## Earlier card release notes (historical)

'''
assert '# Streaming Browser — Home Assistant Integration' not in old
readme.write_text(prefix + old, encoding='utf-8')
(root / 'EPISODE_LINKS_SETUP.md').write_text('''# Independent episode links — integrated installation

As of **Streaming Browser v0.4.63**, the frontend and episode-link backend are packaged in a single **HACS Integration**. The previous v0.4.62 manual-copy instructions are obsolete.

Follow the installation and one-time migration instructions at the top of [README.md](README.md). After the initial HACS Integration installation, all files update together through HACS. No manual custom-component file copies or YAML integration entry are needed. The optional JustWatch lookup is independent of Nuvio, with no extra JustWatch API key; keep your existing TMDB API key in the card's editor.
''', encoding='utf-8')
print('Bundled v0.4.63 frontend and backend with migration documentation')
