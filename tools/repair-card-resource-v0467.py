"""Build v0.4.67: make frontend/resource registration retryable and observable."""
from pathlib import Path
import json

base = Path('custom_components/streaming_browser')
p = base / '__init__.py'
s = p.read_text(encoding='utf-8')
def replace(before, after, label):
    global s
    count = s.count(before)
    if count != 1:
        raise AssertionError(f'{label}: expected exactly one occurrence, got {count}')
    s = s.replace(before, after, 1)

replace('from homeassistant.core import HomeAssistant\n',
        'from homeassistant.core import HomeAssistant\nfrom homeassistant.const import EVENT_HOMEASSISTANT_STARTED\n',
        'HA started event import')
replace('_RESOURCE_URL = f"{_CARD_URL}?v={_VERSION}"\n',
        '_RESOURCE_URL = f"{_CARD_URL}?v={_VERSION}"\n'
        '_STATIC_REGISTERED_KEY = f"{DOMAIN}_card_static_registered"\n'
        '_FRONTEND_REGISTERED_KEY = f"{DOMAIN}_card_frontend_registered"\n'
        '_RESOURCE_RETRY_KEY = f"{DOMAIN}_resource_retry_scheduled"\n',
        'registration state')
replace('''    await hass.http.async_register_static_paths(
        [StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False)]
    )
    # Load the versioned module globally: the Add card picker needs its custom
    # element and window.customCards metadata even without an existing card.
    # The Lovelace resource below imports the identical URL, so the browser's
    # module cache prevents duplicate evaluation and conflicting definitions.
    frontend.add_extra_js_url(hass, _RESOURCE_URL)

    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None or lovelace.resource_mode != MODE_STORAGE:
        return
''', '''    # Re-running setup must repair a missing resource without attempting to
    # register the same aiohttp route twice (which can prevent HA startup).
    if not hass.data.get(_STATIC_REGISTERED_KEY):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False)]
        )
        hass.data[_STATIC_REGISTERED_KEY] = True
    # The global module lets the named card appear in Add card even before a
    # dashboard containing it has loaded. Register once for repeated setup.
    if not hass.data.get(_FRONTEND_REGISTERED_KEY):
        frontend.add_extra_js_url(hass, _RESOURCE_URL)
        hass.data[_FRONTEND_REGISTERED_KEY] = True

    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None:
        # Some startup orders initialize the integration before Lovelace's
        # resources collection. Retry when startup finishes rather than
        # permanently skipping the resource on the first attempt.
        if not hass.data.get(_RESOURCE_RETRY_KEY) and not hass.is_running:
            hass.data[_RESOURCE_RETRY_KEY] = True
            hass.bus.async_listen_once(
                EVENT_HOMEASSISTANT_STARTED,
                lambda _event: hass.async_create_task(_register_card(hass)),
            )
        _LOGGER.warning("Streaming Browser resource not yet ready: Lovelace data unavailable; retry is %s",
                        "scheduled" if hass.data.get(_RESOURCE_RETRY_KEY) else "not available")
        return
    if lovelace.resource_mode != MODE_STORAGE:
        _LOGGER.info("Streaming Browser module loaded globally; Lovelace resources use YAML mode")
        return
''', 'retryable frontend setup')
replace('''    for duplicate in matches[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])
''', '''    for duplicate in matches[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])
    _LOGGER.info("Streaming Browser card registered as a module resource: %s", _RESOURCE_URL)
''', 'registration status log')
replace('''        await collection.async_create_item(
            {CONF_URL: _RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"}
        )
        return
''', '''        await collection.async_create_item(
            {CONF_URL: _RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"}
        )
        _LOGGER.info("Streaming Browser card resource created: %s", _RESOURCE_URL)
        return
''', 'create status log')
replace('''async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Allow setup entirely through the Home Assistant UI, without YAML."""
    if DOMAIN not in hass.data:
        return await async_setup(hass, {})
    return True
''', '''async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Ensure UI setup repairs a missed startup resource registration."""
    if DOMAIN not in hass.data:
        return await async_setup(hass, {})
    await _register_card(hass)
    return True
''', 'config entry resource retry')
p.write_text(s, encoding='utf-8')

manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.66', manifest['version']
manifest['version'] = '0.4.67'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
js_path = base / 'frontend/streaming-browser-card.js'
js = js_path.read_text(encoding='utf-8')
for old, new in [(' * v0.4.66\n', ' * v0.4.67\n'),
                 ('const STREAMING_BROWSER_VERSION = "0.4.66";', 'const STREAMING_BROWSER_VERSION = "0.4.67";'),
                 ('"%c STREAMING-BROWSER-CARD %c v0.4.66 "', '"%c STREAMING-BROWSER-CARD %c v0.4.67 "')]:
    assert js.count(old) == 1, old
    js = js.replace(old, new, 1)
js_path.write_text(js, encoding='utf-8')
print('Built v0.4.67: resource setup retries, startup fallback, idempotent routes, named card version sync')
