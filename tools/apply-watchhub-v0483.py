"""Install the WatchHub official-link endpoint and card adapter on v0.4.82."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'custom_components/streaming_browser'
BACKEND = BASE / '__init__.py'
CARD = BASE / 'frontend/streaming-browser-card.js'
MANIFEST = BASE / 'manifest.json'
backend = BACKEND.read_text(encoding='utf-8')
card = CARD.read_text(encoding='utf-8')
marker = '/* Streaming Browser v0.4.83: optional WatchHub official-app link source. */'
assert marker not in card, 'WatchHub already bundled'
assert card.count('const STREAMING_BROWSER_VERSION = "0.4.82";') == 1, 'Expected v0.4.82 frontend'
assert '/* Compact Nuvio-sized remote v0.4.82 */' in card, 'Current remote must be preserved'
assert 'from .watchhub import provider_links' not in backend, 'WatchHub backend already installed'
backend = backend.replace(
    'from .justwatch import JustWatchGraphQLApi, JustWatchApiError',
    'from .justwatch import JustWatchGraphQLApi, JustWatchApiError\nfrom .watchhub import provider_links', 1,
)
register = '    websocket_api.async_register_command(hass, ws_episode_links)'
assert backend.count(register) == 1
backend = backend.replace(register, register + '\n    websocket_api.async_register_command(hass, ws_watchhub_links)', 1)
backend += '''\n\n@websocket_api.websocket_command(\n    {\n        vol.Required("type"): "streaming_browser/watchhub_links",\n        vol.Required("imdb_id"): str,\n        vol.Required("media_type"): vol.In(["movie", "series"]),\n        vol.Required("region"): str,\n        vol.Optional("season"): vol.Coerce(int),\n        vol.Optional("episode"): vol.Coerce(int),\n    }\n)\n@websocket_api.async_response\nasync def ws_watchhub_links(hass: HomeAssistant, connection, msg: dict) -> None:\n    """Look up official external WatchHub provider links for one exact item."""\n    try:\n        country = str(msg["region"]).strip().upper()\n        if not country or len(country) != 2 or not country.isalpha():\n            raise ValueError("Invalid two-letter region")\n        links = await provider_links(\n            async_get_clientsession(hass),\n            imdb_id=msg["imdb_id"],\n            region=country,\n            media_type=msg["media_type"],\n            season=msg.get("season"),\n            episode=msg.get("episode"),\n        )\n        connection.send_result(msg["id"], {"links": links, "source": "watchhub"})\n    except Exception as err:\n        # The optional third-party source must not interrupt Watchmode/JustWatch.\n        _LOGGER.debug("WatchHub official link lookup unavailable: %s", err)\n        connection.send_error(msg["id"], "watchhub_unavailable", "WatchHub official links unavailable")\n'''
BACKEND.write_text(backend, encoding='utf-8')
CARD.write_text(card.replace('const STREAMING_BROWSER_VERSION = "0.4.82";',
                             'const STREAMING_BROWSER_VERSION = "0.4.83";', 1)
                .replace(' * v0.4.82\n', ' * v0.4.83\n', 1).rstrip()
                + '\n\n' + (ROOT / 'tools/streaming-browser-watchhub-v0483.js').read_text(encoding='utf-8').rstrip() + '\n',
                encoding='utf-8')
manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.82', 'Expected v0.4.82 manifest'
manifest['version'] = '0.4.83'
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with (ROOT / 'README.md').open('a', encoding='utf-8') as readme:
    readme.write('''\n\n## v0.4.83: Optional WatchHub official-app links\n\nStreaming Browser can now query Stremio WatchHub **externalUrl** provider navigation links as an additional source alongside the existing Watchmode title lookup and JustWatch episode lookup. Enable or disable **Use WatchHub official-app links** in the card visual editor under Exact-title playback (enabled by default). WatchHub requires no streaming account login or Nuvio integration. The card resolves IMDb IDs through its existing TMDB key, requests region-specific WatchHub sources on the Home Assistant backend, and accepts only HTTPS navigation URLs on known official streaming-provider domains. It ignores direct streams/torrents and requires the exact `imdb:season:episode` ID for series. If WatchHub is unavailable, existing links continue working. A provider URL is not proof that the target TV app supports a particular deep-link format or starts playback; the TV app decides how the link is handled. Refresh/restart Home Assistant after HACS update and reload the dashboard.\n''')
print('Bundled Streaming Browser v0.4.83 with optional WatchHub official-app link resolver')
