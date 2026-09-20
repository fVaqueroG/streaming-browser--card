"""Build the next single-package release, preserving existing card configuration."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / "custom_components" / "streaming_browser"
js_path = base / "frontend" / "streaming-browser-card.js"
js = js_path.read_text(encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


js = replace_once(js, ' * v0.4.64\n', ' * v0.4.65\n', 'header version')
js = replace_once(js, 'const STREAMING_BROWSER_VERSION = "0.4.64";',
                  'const STREAMING_BROWSER_VERSION = "0.4.65";', 'visible version')
# Lovelace instantiates a card and calls setConfig before the visual editor has
# collected required values. Throwing here makes the card impossible to create.
js = replace_once(js,
    '    if (!config.tv_entity) throw new Error("tv_entity is required");\n'
    '    if (!config.tmdb_api_key) throw new Error("tmdb_api_key is required");\n\n',
    '    // Incomplete configuration is expected while creating a card.\n'
    '    // The editor collects both required fields; the preview explains what is missing.\n',
    'accept incomplete setup')
start = js.index('  static getStubConfig() {')
end = js.index('  setConfig(config) {', start)
stub = js[start:end]
assert 'tv_entity: "media_player.lg_webos_tv"' in stub
assert 'tmdb_api_key: "YOUR_TMDB_V3_API_KEY"' in stub
stub = stub.replace('tv_entity: "media_player.lg_webos_tv"', 'tv_entity: ""', 1)
stub = stub.replace('tmdb_api_key: "YOUR_TMDB_V3_API_KEY"', 'tmdb_api_key: ""', 1)
js = js[:start] + stub + js[end:]
js = replace_once(js,
    '    if (!this._initialized) {\n      this._initialized = true;\n      this._initialize();\n    }',
    '    // Do not start network calls for a new, not-yet-configured card.\n'
    '    if (!this._initialized && this._config.tv_entity &&\n'
    '        this._config.tmdb_api_key &&\n'
    '        this._config.tmdb_api_key !== "YOUR_TMDB_V3_API_KEY") {\n'
    '      this._initialized = true;\n      this._initialize();\n    }',
    'skip incomplete API startup')
js = replace_once(js,
    '    const providers =\n      this._matchedProviders[this._mode] || [];\n\n    const tv = this._tvState();',
    '    if (!this._config.tv_entity || !this._config.tmdb_api_key ||\n'
    '        this._config.tmdb_api_key === "YOUR_TMDB_V3_API_KEY") {\n'
    '      this.shadowRoot.innerHTML = `\n'
    '        <ha-card><div style="padding:16px;line-height:1.5">\n'
    '          <strong>Set up Streaming Browser</strong><br>\n'
    '          Edit this card and choose its playback device and enter your TMDB API key.\n'
    '          Existing cards keep their saved settings.\n'
    '        </div></ha-card>`;\n'
    '      return;\n    }\n\n'
    '    const providers =\n      this._matchedProviders[this._mode] || [];\n\n    const tv = this._tvState();',
    'clear first-time setup guidance')
js_path.write_text(js, encoding="utf-8")

init_path = base / "__init__.py"
init = init_path.read_text(encoding="utf-8")
init = replace_once(init,
    '_RESOURCE_URL = f"{_CARD_URL}?v={_VERSION}"\n',
    '_RESOURCE_URL = f"{_CARD_URL}?v={_VERSION}"\n'
    '# URLs installed by the old HACS Dashboard category of this same repository.\n'
    '# They define the same custom element and can prevent the new visual editor\n'
    '# from loading. Remove only these recognized legacy HACS resource URLs.\n'
    '_LEGACY_CARD_URLS = frozenset({\n'
    '    "/hacsfiles/streaming-browser--card/streaming-browser-card.js",\n'
    '    "/local/community/streaming-browser--card/streaming-browser-card.js",\n'
    '})\n',
    'legacy resource definition')
init = replace_once(init,
    '    matches = [\n'
    '        item for item in resources\n'
    '        if str(item.get(CONF_URL) or "").split("?", 1)[0] == _CARD_URL\n'
    '    ]\n'
    '    if not matches:\n',
    '    # Automatically migrate the former Dashboard HACS resource. The old\n'
    '    # and new URLs must never load together: customElements.define is\n'
    '    # first-wins, so the older file would disable the current card editor.\n'
    '    for item in resources:\n'
    '        url = str(item.get(CONF_URL) or "").split("?", 1)[0]\n'
    '        if url in _LEGACY_CARD_URLS:\n'
    '            await collection.async_delete_item(item[CONF_ID])\n'
    '            _LOGGER.info("Removed obsolete Streaming Browser dashboard resource: %s", url)\n'
    '    resources = collection.async_items() or []\n'
    '    matches = [\n'
    '        item for item in resources\n'
    '        if str(item.get(CONF_URL) or "").split("?", 1)[0] == _CARD_URL\n'
    '    ]\n'
    '    if not matches:\n',
    'remove old HACS card and dedupe versioned integration resource')
init_path.write_text(init, encoding="utf-8")
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.64'
manifest['version'] = '0.4.65'
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

readme_path = root / 'README.md'
readme = readme_path.read_text(encoding='utf-8')
notice = '''## v0.4.65: Editor setup and automatic resource migration\n\nThe card now accepts an empty first-time configuration, allowing you to choose the playback device and enter your existing TMDB API key in the visual card editor. Previously saved dashboard card settings are unchanged.\n\nThe **Streaming Browser HACS Integration** registers `/streaming_browser/streaming-browser-card.js?v=0.4.65` and, on Home Assistant startup, updates an existing resource of that URL to the installed version, deduplicates the new resource, and deletes the obsolete `/hacsfiles/streaming-browser--card/streaming-browser-card.js` (or `/local/community/streaming-browser--card/streaming-browser-card.js`) resource left by the old Dashboard-category package. This avoids competing JavaScript versions. After updating the Integration in HACS, restart Home Assistant and reload the browser or mobile companion app. Do not reinstall the former Dashboard-category card; it is a legacy package. For a first-time installation, complete Settings > Devices & services > Add integration > Streaming Browser.\n\nIf you manually added a different `/local/...` copy of the card, remove that duplicate resource yourself; the integration intentionally does not delete unrelated user-managed resources. Updating files in HACS alone does not hot-reload a running Python integration or an already loaded browser module.\n\n'''
readme_path.write_text(readme.replace('# Streaming Browser', '# Streaming Browser', 1).replace('\n## One-time migration', '\n' + notice + '## One-time migration', 1), encoding='utf-8')
print('Built v0.4.65: new-card configuration and HACS resource migration')
