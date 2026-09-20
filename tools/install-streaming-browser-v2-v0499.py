"""Build separately registered V2 from the released V1 without altering V1."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
old = base / 'frontend' / 'streaming-browser-card.js'
new = base / 'frontend' / 'streaming-browser-card-v2.js'
backend = base / '__init__.py'
manifest = base / 'manifest.json'
readme = root / 'README.md'
version = json.loads(manifest.read_text())['version']
assert version == '0.4.98', f'Expected v0.4.98 before V2, got {version}'
assert not new.exists(), 'V2 must be created separately; do not overwrite existing V2'
source = old.read_text(encoding='utf-8')
assert source.count('class StreamingBrowserCard extends HTMLElement') == 1
assert source.count('class StreamingBrowserCardEditor extends HTMLElement') == 1
assert source.count('const STREAMING_BROWSER_VERSION = "0.4.98";') == 1
source = source.replace('StreamingBrowserCardEditor', 'StreamingBrowserV2CardEditor')
source = source.replace('StreamingBrowserCard', 'StreamingBrowserV2Card')
source = source.replace('streaming-browser-card-editor', 'streaming-browser-card-v2-editor')
# Only change the custom-element name (not repository URLs or inherited keys).
source = source.replace('"streaming-browser-card"', '"streaming-browser-card-v2"')
source = source.replace('const STREAMING_BROWSER_VERSION = "0.4.98";', 'const STREAMING_BROWSER_VERSION = "0.4.99";')
source = source.replace('name: "Streaming Browser Card",', 'name: "Streaming Browser Card V2",')
source += '\n\n' + (root / 'tools' / 'streaming-browser-v2-layout-v0499.js').read_text(encoding='utf-8') + '\n'
assert source.count('customElements.define(\n    "streaming-browser-card-v2",') == 1
assert 'customElements.define(\n    "streaming-browser-card",' not in source
assert 'class StreamingBrowserV2Card extends HTMLElement' in source
assert 'class StreamingBrowserV2CardEditor extends HTMLElement' in source
new.write_text(source, encoding='utf-8')

py = backend.read_text(encoding='utf-8')
needle = '_RESOURCE_URL = f"{_CARD_URL}?v={_VERSION}"\n'
addition = ('_V2_CARD_URL = "/streaming_browser/streaming-browser-card-v2.js"\n'
            '_V2_CARD_FILE = _INTEGRATION_DIR / "frontend" / "streaming-browser-card-v2.js"\n'
            '_V2_RESOURCE_URL = f"{_V2_CARD_URL}?v={_VERSION}"\n')
assert py.count(needle) == 1
py = py.replace(needle, needle + addition, 1)
needle = '    if not _CARD_FILE.is_file():\n        _LOGGER.error("Streaming Browser card file is missing: %s", _CARD_FILE)\n        return\n'
assert py.count(needle) == 1
py = py.replace(needle, needle + ('    if not _V2_CARD_FILE.is_file():\n'
    '        _LOGGER.error("Streaming Browser V2 card file is missing: %s", _V2_CARD_FILE)\n'
    '        return\n'), 1)
needle = '[StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False)]'
assert py.count(needle) == 1
py = py.replace(needle, '[StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False),\n'
                       '             StaticPathConfig(_V2_CARD_URL, str(_V2_CARD_FILE), cache_headers=False)]', 1)
needle = '        frontend.add_extra_js_url(hass, _RESOURCE_URL)\n'
assert py.count(needle) == 1
py = py.replace(needle, needle + '        frontend.add_extra_js_url(hass, _V2_RESOURCE_URL)\n', 1)
# Register a second Lovelace module rather than replacing the existing V1 module.
helper = '''async def _ensure_v2_resource(collection) -> None:
    """Create/update only the V2 module; existing V1 dashboards remain untouched."""
    existing = [item for item in collection.async_items() or []
                if str(item.get(CONF_URL) or "").split("?", 1)[0] == _V2_CARD_URL]
    if not existing:
        await collection.async_create_item(
            {CONF_URL: _V2_RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"})
        return
    main = existing[0]
    if main.get(CONF_URL) != _V2_RESOURCE_URL or main.get(CONF_TYPE) != "module":
        await collection.async_update_item(
            main[CONF_ID], {CONF_URL: _V2_RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"})
    for duplicate in existing[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])


'''
needle = 'async def _register_card(hass: HomeAssistant) -> None:\n'
assert py.count(needle) == 1
py = py.replace(needle, helper + needle, 1)
needle = '        _LOGGER.info("Streaming Browser card resource created: %s", _RESOURCE_URL)\n        return\n'
assert py.count(needle) == 1
py = py.replace(needle, '        _LOGGER.info("Streaming Browser card resource created: %s", _RESOURCE_URL)\n'
                       '        await _ensure_v2_resource(collection)\n        return\n', 1)
needle = '    _LOGGER.info("Streaming Browser card registered as a module resource: %s", _RESOURCE_URL)\n'
assert py.count(needle) == 1
py = py.replace(needle, needle + '    await _ensure_v2_resource(collection)\n', 1)
backend.write_text(py, encoding='utf-8')
meta = json.loads(manifest.read_text(encoding='utf-8'))
meta['version'] = '0.4.99'
manifest.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as out:
    out.write('''\n\n## v0.4.99 — optional Streaming Browser Card V2\n\nV1 (`custom:streaming-browser-card`) remains installed and unchanged. A separately served and registered card `custom:streaming-browser-card-v2` provides a sticky header with existing room/connection selectors, search, Movies/Series/genre, icon-only provider chips, and an All provider chip with the icon above the label **All** inside the same button. Popular / Top Rated / Recent Releases are horizontal tabs that show one horizontal catalog at a time. Each selected tab has a See all button at the bottom to expand a responsive poster grid and continue paging, and a Back to carousel button to collapse it. The catalog scrolls internally while the header stays visible. V2 retains the V1 visual editor and link/playback/routing functionality as of this release, with a separate frontend bundle so V1 is not replaced. In a dashboard, add a new card of type `custom:streaming-browser-card-v2`, then copy the V1 configuration or use its visual editor. For a full-screen tablet, use Panel or full-width Sections layout.\n''')
print('Built independent V2 frontend and registered both V1 and V2 resources')
