#!/usr/bin/env python3
"""Bundle logo display extension after V2/popup and bump integration version."""
import json
from pathlib import Path

BASE = Path('custom_components/streaming_browser')
INIT = BASE / '__init__.py'
MANIFEST = BASE / 'manifest.json'
V2 = BASE / 'frontend/streaming-browser-card-v2.js'
BRAND = BASE / 'frontend/streaming-browser-branding.js'
assert BRAND.is_file()
source = INIT.read_text()

def replace_once(old, new):
    global source
    assert source.count(old) == 1, (old, source.count(old))
    source = source.replace(old, new)

replace_once(
    '_POPUP_RESOURCE_URL = f"{_POPUP_CARD_URL}?v={_VERSION}"',
    '_POPUP_RESOURCE_URL = f"{_POPUP_CARD_URL}?v={_VERSION}"\n'
    '_BRANDING_URL = "/streaming_browser/streaming-browser-branding.js"\n'
    '_BRANDING_FILE = _INTEGRATION_DIR / "frontend" / "streaming-browser-branding.js"\n'
    '_BRANDING_RESOURCE_URL = f"{_BRANDING_URL}?v={_VERSION}"'
)
replace_once(
    'async def _register_card(hass: HomeAssistant) -> None:',
    '''async def _ensure_branding_resource(collection) -> None:
    """Load branding after both V2 and popup, with HACS cache-busting."""
    matches = [item for item in collection.async_items() or []
               if str(item.get(CONF_URL) or "").split("?", 1)[0] == _BRANDING_URL]
    if not matches:
        await collection.async_create_item(
            {CONF_URL: _BRANDING_RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"})
        return
    main = matches[0]
    if main.get(CONF_URL) != _BRANDING_RESOURCE_URL or main.get(CONF_TYPE) != "module":
        await collection.async_update_item(
            main[CONF_ID], {CONF_URL: _BRANDING_RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"})
    for duplicate in matches[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])


async def _register_card(hass: HomeAssistant) -> None:'''
)
replace_once(
    '    popup_available = v2_available and _POPUP_CARD_FILE.is_file()',
    '    popup_available = v2_available and _POPUP_CARD_FILE.is_file()\n'
    '    branding_available = popup_available and _BRANDING_FILE.is_file()'
)
replace_once(
    '            paths.append(StaticPathConfig(_POPUP_CARD_URL, str(_POPUP_CARD_FILE), cache_headers=False))',
    '            paths.append(StaticPathConfig(_POPUP_CARD_URL, str(_POPUP_CARD_FILE), cache_headers=False))\n'
    '        if branding_available:\n'
    '            paths.append(StaticPathConfig(_BRANDING_URL, str(_BRANDING_FILE), cache_headers=False))'
)
replace_once(
    '            frontend.add_extra_js_url(hass, _POPUP_RESOURCE_URL)',
    '            frontend.add_extra_js_url(hass, _POPUP_RESOURCE_URL)\n'
    '        if branding_available:\n'
    '            frontend.add_extra_js_url(hass, _BRANDING_RESOURCE_URL)'
)
assert source.count('            await _ensure_popup_resource(collection)') == 1
source = source.replace(
    '            await _ensure_popup_resource(collection)',
    '            await _ensure_popup_resource(collection)\n'
    '        if branding_available:\n'
    '            await _ensure_branding_resource(collection)', 1
)
assert source.count('        await _ensure_popup_resource(collection)') == 2
# Only the final non-nested resource registration branch.
old = '    if popup_available:\n        await _ensure_popup_resource(collection)'
replace_once(old, old + '\n    if branding_available:\n        await _ensure_branding_resource(collection)')
INIT.write_text(source)

manifest = json.loads(MANIFEST.read_text())
assert manifest['version'] == '0.4.112'
manifest['version'] = '0.4.113'
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
v2 = V2.read_text()
assert v2.count('const STREAMING_BROWSER_VERSION = "0.4.112";') == 1
V2.write_text(v2.replace('const STREAMING_BROWSER_VERSION = "0.4.112";',
                         'const STREAMING_BROWSER_VERSION = "0.4.113";', 1))
print('PASS branding module registered after V2 and popup; version 0.4.113')
