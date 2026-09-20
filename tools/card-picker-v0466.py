"""One-time patch for discoverable Streaming Browser card with synchronous editor."""
from pathlib import Path
import json

base = Path('custom_components/streaming_browser')
js_path = base / 'frontend/streaming-browser-card.js'
js = js_path.read_text(encoding='utf-8')

def once(text, before, after, label):
    count = text.count(before)
    if count != 1:
        raise AssertionError(f'{label}: expected one occurrence, got {count}')
    return text.replace(before, after, 1)

js = once(js, ' * v0.4.65\n', ' * v0.4.66\n', 'card file version')
js = once(js, 'const STREAMING_BROWSER_VERSION = "0.4.65";', 'const STREAMING_BROWSER_VERSION = "0.4.66";', 'card visible version')
js = once(js, 'static async getConfigElement() {', 'static getConfigElement() {', 'visual editor must return an element, not a Promise')
start = js.index('window.customCards = window.customCards || [];')
end = js.index('\nconsole.info(', start)
old = js[start:end]
assert 'name: "Streaming Browser Card"' in old and 'preview: false' in old
registry = '''// Make Streaming Browser searchable by name in Home Assistant's Add card picker.
// Refresh metadata from a previously loaded resource without adding duplicates.
window.customCards = Array.isArray(window.customCards) ? window.customCards : [];
const streamingBrowserPickerEntry = {
  type: "streaming-browser-card",
  name: "Streaming Browser Card",
  description: "Browse streaming movies and series; open titles on your TV or this device.",
  preview: false,
  documentationURL: "https://github.com/fVaqueroG/streaming-browser--card",
};
const streamingBrowserPreviousPickerEntry = window.customCards.find(
  (card) => card?.type === streamingBrowserPickerEntry.type
);
if (streamingBrowserPreviousPickerEntry) {
  Object.assign(streamingBrowserPreviousPickerEntry, streamingBrowserPickerEntry);
} else {
  window.customCards.push(streamingBrowserPickerEntry);
}
'''
js = js[:start] + registry + js[end:]
js = once(js, '"%c STREAMING-BROWSER-CARD %c v0.4.62 "', '"%c STREAMING-BROWSER-CARD %c v0.4.66 "', 'console version')
js_path.write_text(js, encoding='utf-8')

init_path = base / '__init__.py'
init = init_path.read_text(encoding='utf-8')
init = once(init, '''    await hass.http.async_register_static_paths(
        [StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False)]
    )

    lovelace = hass.data.get(LOVELACE_DATA)
    if lovelace is None or lovelace.resource_mode != MODE_STORAGE:
        frontend.add_extra_js_url(hass, _RESOURCE_URL)
        return
''', '''    await hass.http.async_register_static_paths(
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
''', 'load named card globally as well as via dashboard resource')
init_path.write_text(init, encoding='utf-8')

manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.65'
manifest['version'] = '0.4.66'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

readme = Path('README.md')
text = readme.read_text(encoding='utf-8')
preface = '''## v0.4.66: Add card by name with its visual editor

After updating **Streaming Browser** in HACS under **Integrations** and restarting Home Assistant, refresh the dashboard. In **Edit dashboard > Add card**, search for **Streaming Browser Card**, select its named card, and complete the visual editor. Do not select a Manual card or paste YAML. The integration loads the same versioned JavaScript globally for card-picker discovery and as a dashboard resource. Existing dashboard card settings remain intact.

'''
assert '## v0.4.66: Add card by name' not in text
text = once(text, '# Streaming Browser — Home Assistant Integration\n', '# Streaming Browser — Home Assistant Integration\n\n' + preface, 'readme intro')
text = once(text, '**Current version: v0.4.64.**', '**Current version: v0.4.66.**', 'readme current version')
readme.write_text(text, encoding='utf-8')
print('BUILD OK: named picker registry, synchronous visual editor, globally loaded versioned resource, v0.4.66 aligned')