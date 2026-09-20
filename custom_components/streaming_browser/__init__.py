"""Streaming Browser: bundled dashboard card and standalone episode links.

Install the entire custom component through HACS (Integration category), then
add Streaming Browser under Settings > Devices & services. No Nuvio dependency.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE, CONF_RESOURCE_TYPE_WS
from homeassistant.const import CONF_ID, CONF_TYPE, CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .justwatch import JustWatchGraphQLApi, JustWatchApiError

DOMAIN = "streaming_browser"
_LOGGER = logging.getLogger(__name__)
_INTEGRATION_DIR = Path(__file__).parent
_CARD_URL = "/streaming_browser/streaming-browser-card.js"
_CARD_FILE = _INTEGRATION_DIR / "frontend" / "streaming-browser-card.js"
_VERSION = str(json.loads((_INTEGRATION_DIR / "manifest.json").read_text(encoding="utf-8"))["version"])
_RESOURCE_URL = f"{_CARD_URL}?v={_VERSION}"
# URLs installed by the old HACS Dashboard category of this same repository.
# They define the same custom element and can prevent the new visual editor
# from loading. Remove only these recognized legacy HACS resource URLs.
_LEGACY_CARD_URLS = frozenset({
    "/hacsfiles/streaming-browser--card/streaming-browser-card.js",
    "/local/community/streaming-browser--card/streaming-browser-card.js",
})


async def _register_card(hass: HomeAssistant) -> None:
    """Serve the exact JS bundled with this installed integration version."""
    if not _CARD_FILE.is_file():
        _LOGGER.error("Streaming Browser card file is missing: %s", _CARD_FILE)
        return
    await hass.http.async_register_static_paths(
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

    collection = lovelace.resources
    await collection.async_get_info()
    resources = collection.async_items() or []
    # Automatically migrate the former Dashboard HACS resource. The old
    # and new URLs must never load together: customElements.define is
    # first-wins, so the older file would disable the current card editor.
    for item in resources:
        url = str(item.get(CONF_URL) or "").split("?", 1)[0]
        if url in _LEGACY_CARD_URLS:
            await collection.async_delete_item(item[CONF_ID])
            _LOGGER.info("Removed obsolete Streaming Browser dashboard resource: %s", url)
    resources = collection.async_items() or []
    matches = [
        item for item in resources
        if str(item.get(CONF_URL) or "").split("?", 1)[0] == _CARD_URL
    ]
    if not matches:
        await collection.async_create_item(
            {CONF_URL: _RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"}
        )
        return
    primary = matches[0]
    if primary.get(CONF_URL) != _RESOURCE_URL or primary.get(CONF_TYPE) != "module":
        await collection.async_update_item(
            primary[CONF_ID], {CONF_URL: _RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"}
        )
    for duplicate in matches[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Initialize once for both config entries and legacy YAML setups."""
    if DOMAIN in hass.data:
        return True
    hass.data[DOMAIN] = JustWatchGraphQLApi(async_get_clientsession(hass))
    websocket_api.async_register_command(hass, ws_episode_links)
    await _register_card(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Allow setup entirely through the Home Assistant UI, without YAML."""
    if DOMAIN not in hass.data:
        return await async_setup(hass, {})
    return True


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """A running dashboard may still use the card; keep the resource served."""
    return True


@websocket_api.websocket_command(
    {
        vol.Required("type"): "streaming_browser/episode_links",
        vol.Required("title"): str,
        vol.Required("tmdb_id"): vol.Coerce(int),
        vol.Required("season"): vol.Coerce(int),
        vol.Required("episode"): vol.Coerce(int),
        vol.Optional("region", default="MX"): str,
        vol.Optional("language", default="en-US"): str,
    }
)
@websocket_api.async_response
async def ws_episode_links(hass: HomeAssistant, connection, msg: dict) -> None:
    """Return only provider links associated with the requested episode."""
    try:
        if msg["tmdb_id"] <= 0 or msg["season"] < 0 or msg["episode"] <= 0:
            raise ValueError("Invalid series, season, or episode identifier")
        if not msg["title"].strip():
            raise ValueError("Missing series title")
        region = msg["region"].strip().upper()
        if len(region) != 2 or not region.isalpha():
            raise ValueError("Invalid two-letter region")
        api: JustWatchGraphQLApi = hass.data[DOMAIN]
        offers = await api.async_provider_offers(
            media_type="series",
            title=msg["title"],
            country=region,
            language=msg["language"],
            tmdb_id=msg["tmdb_id"],
            season=msg["season"],
            episode=msg["episode"],
        )
        links = [
            {
                "name": offer["provider_name"],
                "web_url": offer["url"],
                "scope": "episode",
                "season": msg["season"],
                "episode": msg["episode"],
                "source": "justwatch",
            }
            for offer in offers
            if isinstance(offer, dict)
            and str(offer.get("url") or "").lower().startswith("https://")
            and offer.get("provider_name")
        ]
        connection.send_result(
            msg["id"], {"links": links, "scope": "episode", "source": "justwatch"}
        )
    except (JustWatchApiError, ValueError, LookupError, TypeError) as err:
        _LOGGER.debug("Streaming Browser episode lookup failed: %s", err)
        connection.send_error(msg["id"], "episode_links_unavailable", str(err))
