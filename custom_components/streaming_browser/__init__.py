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
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .justwatch import JustWatchGraphQLApi, JustWatchApiError
from .watchhub import provider_links

DOMAIN = "streaming_browser"
_LOGGER = logging.getLogger(__name__)
_INTEGRATION_DIR = Path(__file__).parent
_CARD_URL = "/streaming_browser/streaming-browser-card.js"
_CARD_FILE = _INTEGRATION_DIR / "frontend" / "streaming-browser-card.js"
_VERSION = str(json.loads((_INTEGRATION_DIR / "manifest.json").read_text(encoding="utf-8"))["version"])
_RESOURCE_URL = f"{_CARD_URL}?v={_VERSION}"
_STATIC_REGISTERED_KEY = f"{DOMAIN}_card_static_registered"
_FRONTEND_REGISTERED_KEY = f"{DOMAIN}_card_frontend_registered"
_RESOURCE_RETRY_KEY = f"{DOMAIN}_resource_retry_scheduled"
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
    # Re-running setup must repair a missing resource without attempting to
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
        _LOGGER.info("Streaming Browser card resource created: %s", _RESOURCE_URL)
        return
    primary = matches[0]
    if primary.get(CONF_URL) != _RESOURCE_URL or primary.get(CONF_TYPE) != "module":
        await collection.async_update_item(
            primary[CONF_ID], {CONF_URL: _RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"}
        )
    for duplicate in matches[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])
    _LOGGER.info("Streaming Browser card registered as a module resource: %s", _RESOURCE_URL)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Initialize once for both config entries and legacy YAML setups."""
    if DOMAIN in hass.data:
        return True
    hass.data[DOMAIN] = JustWatchGraphQLApi(async_get_clientsession(hass))
    websocket_api.async_register_command(hass, ws_episode_links)
    websocket_api.async_register_command(hass, ws_watchhub_links)
    await _register_card(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Ensure UI setup repairs a missed startup resource registration."""
    if DOMAIN not in hass.data:
        return await async_setup(hass, {})
    await _register_card(hass)
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): "streaming_browser/watchhub_links",
        vol.Required("imdb_id"): str,
        vol.Required("media_type"): vol.In(["movie", "series"]),
        vol.Required("region"): str,
        vol.Optional("season"): vol.Coerce(int),
        vol.Optional("episode"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def ws_watchhub_links(hass: HomeAssistant, connection, msg: dict) -> None:
    """Look up official external WatchHub provider links for one exact item."""
    try:
        country = str(msg["region"]).strip().upper()
        if not country or len(country) != 2 or not country.isalpha():
            raise ValueError("Invalid two-letter region")
        links = await provider_links(
            async_get_clientsession(hass),
            imdb_id=msg["imdb_id"],
            region=country,
            media_type=msg["media_type"],
            season=msg.get("season"),
            episode=msg.get("episode"),
        )
        connection.send_result(msg["id"], {"links": links, "source": "watchhub"})
    except Exception as err:
        # The optional third-party source must not interrupt Watchmode/JustWatch.
        _LOGGER.debug("WatchHub official link lookup unavailable: %s", err)
        connection.send_error(msg["id"], "watchhub_unavailable", "WatchHub official links unavailable")
