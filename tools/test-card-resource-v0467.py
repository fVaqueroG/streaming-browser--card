"""Contract tests for Home Assistant dashboard resource startup and retries."""
import ast
import asyncio
import json
import logging
import types
from pathlib import Path

base = Path('custom_components/streaming_browser')
src = (base / '__init__.py').read_text()
manifest = json.loads((base / 'manifest.json').read_text())
assert manifest['version'] == '0.4.67'
functions = [n for n in ast.parse(src).body
             if isinstance(n, ast.AsyncFunctionDef)
             and n.name in ('_register_card', 'async_setup_entry')]
assert len(functions) == 2

class Collection:
    def __init__(self, items=()): self.items = list(items)
    async def async_get_info(self): pass
    def async_items(self): return list(self.items)
    async def async_create_item(self, item):
        item = dict(item)
        item['type'] = item.pop('res_type')
        self.items.append({'id': 'new', **item})
    async def async_update_item(self, item_id, update):
        update = dict(update)
        if 'res_type' in update: update['type'] = update.pop('res_type')
        next(x for x in self.items if x['id'] == item_id).update(update)
    async def async_delete_item(self, item_id):
        self.items = [x for x in self.items if x['id'] != item_id]

class Http:
    def __init__(self): self.calls = 0
    async def async_register_static_paths(self, paths): self.calls += 1

class Bus:
    def __init__(self): self.callback = None
    def async_listen_once(self, event, callback): self.callback = callback

class HA:
    def __init__(self):
        self.data = {}
        self.is_running = False
        self.http = Http()
        self.bus = Bus()
        self.tasks = []
    def async_create_task(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.tasks.append(task)
        return task

frontend_calls = []
env = {
    'HomeAssistant': HA,
    '_CARD_FILE': base / 'frontend/streaming-browser-card.js',
    '_CARD_URL': '/streaming_browser/streaming-browser-card.js',
    '_RESOURCE_URL': '/streaming_browser/streaming-browser-card.js?v=0.4.67',
    '_STATIC_REGISTERED_KEY': 'static',
    '_FRONTEND_REGISTERED_KEY': 'frontend',
    '_RESOURCE_RETRY_KEY': 'retry',
    '_LOGGER': logging.getLogger('streaming_browser_test'),
    'StaticPathConfig': lambda *args, **kwargs: args,
    'LOVELACE_DATA': 'lovelace', 'MODE_STORAGE': 'storage',
    'frontend': types.SimpleNamespace(add_extra_js_url=lambda hass, url: frontend_calls.append(url)),
    'EVENT_HOMEASSISTANT_STARTED': 'homeassistant_started',
    '_LEGACY_CARD_URLS': {'/hacsfiles/streaming-browser--card/streaming-browser-card.js',
                          '/local/community/streaming-browser--card/streaming-browser-card.js'},
    'CONF_URL': 'url', 'CONF_TYPE': 'type', 'CONF_ID': 'id',
    'CONF_RESOURCE_TYPE_WS': 'res_type', 'DOMAIN': 'streaming_browser',
    'async_setup': lambda *args: asyncio.sleep(0, result=True),
}
exec(compile(ast.Module(body=functions, type_ignores=[]), '<resource tests>', 'exec'), env)

async def test():
    hass = HA()
    await env['_register_card'](hass)
    await env['_register_card'](hass)
    assert hass.http.calls == 1 and len(frontend_calls) == 1
    assert hass.bus.callback is not None
    resources = Collection([
        {'id': 'legacy', 'url': '/hacsfiles/streaming-browser--card/streaming-browser-card.js?v=old', 'type': 'module'},
        {'id': 'current', 'url': '/streaming_browser/streaming-browser-card.js?v=0.4.66', 'type': 'module'},
        {'id': 'duplicate', 'url': '/streaming_browser/streaming-browser-card.js?v=0.4.66', 'type': 'module'},
    ])
    hass.data['lovelace'] = types.SimpleNamespace(resources=resources, resource_mode='storage')
    hass.bus.callback(None)
    await asyncio.gather(*hass.tasks)
    await env['_register_card'](hass)
    assert hass.http.calls == 1 and len(frontend_calls) == 1
    assert len(resources.items) == 1, resources.items
    assert resources.items[0]['id'] == 'current'
    assert resources.items[0]['url'].endswith('?v=0.4.67')
    hass.data['streaming_browser'] = object()
    assert await env['async_setup_entry'](hass, object())
    assert hass.http.calls == 1 and len(resources.items) == 1
    fresh = HA()
    fresh.data['lovelace'] = types.SimpleNamespace(resources=Collection(), resource_mode='storage')
    await env['_register_card'](fresh)
    assert len(fresh.data['lovelace'].resources.items) == 1
    assert fresh.data['lovelace'].resources.items[0]['type'] == 'module'
    print('PASS: startup retry, config-entry retry, idempotent HTTP and global JS, legacy cleanup, versioned resource creation')

asyncio.run(test())
