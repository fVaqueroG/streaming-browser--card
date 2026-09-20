"""Verify the registered picker module and the Lovelace resource use one version."""
import ast
import asyncio
import json
import logging
import types
from pathlib import Path

base = Path('custom_components/streaming_browser')
init = (base / '__init__.py').read_text()
manifest = json.loads((base / 'manifest.json').read_text())
source = (base / 'frontend/streaming-browser-card.js').read_text()
assert manifest['version'] == '0.4.66'
assert 'STREAMING_BROWSER_VERSION = "0.4.66"' in source
function = next(node for node in ast.parse(init).body if isinstance(node, ast.AsyncFunctionDef) and node.name == '_register_card')

class Resources:
    def __init__(self):
        self.items = []
    async def async_get_info(self):
        pass
    def async_items(self):
        return list(self.items)
    async def async_create_item(self, data):
        self.items.append({'id': 'new', **data})
    async def async_update_item(self, resource_id, data):
        next(item for item in self.items if item['id'] == resource_id).update(data)
    async def async_delete_item(self, resource_id):
        self.items = [item for item in self.items if item['id'] != resource_id]

class Http:
    async def async_register_static_paths(self, paths):
        self.paths = paths

async def verify():
    collection = Resources()
    global_urls = []
    lovelace = types.SimpleNamespace(resource_mode='storage', resources=collection)
    hass = types.SimpleNamespace(data={'lovelace': lovelace}, http=Http())
    resource_url = '/streaming_browser/streaming-browser-card.js?v=0.4.66'
    env = {
        'HomeAssistant': object,
        '_CARD_FILE': base / 'frontend/streaming-browser-card.js',
        '_CARD_URL': '/streaming_browser/streaming-browser-card.js',
        '_RESOURCE_URL': resource_url,
        '_LEGACY_CARD_URLS': {'/hacsfiles/streaming-browser--card/streaming-browser-card.js'},
        '_LOGGER': logging.getLogger('test'),
        'StaticPathConfig': lambda *args, **kwargs: args,
        'LOVELACE_DATA': 'lovelace', 'MODE_STORAGE': 'storage',
        'CONF_URL': 'url', 'CONF_TYPE': 'type', 'CONF_ID': 'id', 'CONF_RESOURCE_TYPE_WS': 'type',
        'frontend': types.SimpleNamespace(add_extra_js_url=lambda _hass, url: global_urls.append(url)),
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<resource-test>', 'exec'), env)
    await env['_register_card'](hass)
    assert global_urls == [resource_url], global_urls
    assert len(collection.items) == 1 and collection.items[0]['url'] == resource_url
    assert collection.items[0]['type'] == 'module'
    print('PASS: card loads by name globally and same v0.4.66 module appears in dashboard resources')

asyncio.run(verify())