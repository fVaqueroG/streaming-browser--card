"""Keep V1 resource registration independent of optional V2 resource availability."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
init = base / '__init__.py'
manifest = base / 'manifest.json'
readme = root / 'README.md'
meta = json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version'] == '0.4.99', meta['version']
src = init.read_text(encoding='utf-8')

old = '''    if not _V2_CARD_FILE.is_file():
        _LOGGER.error("Streaming Browser V2 card file is missing: %s", _V2_CARD_FILE)
        return
'''
new = '''    # A missing or not-yet-installed V2 bundle must never disable the working V1
    # card. Browser-cached V1 can otherwise appear on one view while a freshly
    # opened subview reports that the custom card resource is unavailable.
    v2_available = _V2_CARD_FILE.is_file()
    if not v2_available:
        _LOGGER.warning("Streaming Browser V2 bundle is not installed: %s; registering V1 independently", _V2_CARD_FILE)
'''
assert src.count(old) == 1
src = src.replace(old, new, 1)
old = '''        await hass.http.async_register_static_paths(
            [StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False),
             StaticPathConfig(_V2_CARD_URL, str(_V2_CARD_FILE), cache_headers=False)]
        )
'''
new = '''        paths = [StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False)]
        if v2_available:
            paths.append(StaticPathConfig(_V2_CARD_URL, str(_V2_CARD_FILE), cache_headers=False))
        await hass.http.async_register_static_paths(paths)
'''
assert src.count(old) == 1
src = src.replace(old, new, 1)
old = '''        frontend.add_extra_js_url(hass, _RESOURCE_URL)
        frontend.add_extra_js_url(hass, _V2_RESOURCE_URL)
'''
new = '''        frontend.add_extra_js_url(hass, _RESOURCE_URL)
        if v2_available:
            frontend.add_extra_js_url(hass, _V2_RESOURCE_URL)
'''
assert src.count(old) == 1
src = src.replace(old, new, 1)
old = '''        await _ensure_v2_resource(collection)
        return
'''
new = '''        if v2_available:
            await _ensure_v2_resource(collection)
        return
'''
assert src.count(old) == 1
src = src.replace(old, new, 1)
old = '''    await _ensure_v2_resource(collection)


async def async_setup'''
new = '''    if v2_available:
        await _ensure_v2_resource(collection)


async def async_setup'''
assert src.count(old) == 1
src = src.replace(old, new, 1)
init.write_text(src, encoding='utf-8')
meta['version'] = '0.4.100'
manifest.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as out:
    out.write('''\n\n## v0.4.100 — V1 resource registration in subviews\n\nV1 resource registration no longer depends on the optional V2 bundle being present during Home Assistant startup. V1's static endpoint, global JavaScript and Lovelace module are always registered when its file exists; V2 is registered separately only when installed. Both custom card types remain unchanged. If a subview uses Panel layout and displays a transient configuration error on a cold visit, Home Assistant frontend may render before custom resources load; use a full-width Sections subview or reload the page after checking that both resource URLs load.\n''')
print('PASS V1 registration decoupled from optional V2 and manifest updated to 0.4.100')
