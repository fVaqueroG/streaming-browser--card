"""Independent Streaming Browser episode links; no Nuvio dependency.

Enable with `streaming_browser:` in configuration.yaml. This optional backend
runs server-side because direct browser requests to JustWatch are subject to
CORS restrictions. All lookups are limited to the exact requested episode;
there is intentionally no series-level fallback disguised as an episode link.
"""
from __future__ import annotations

import logging

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .justwatch import JustWatchGraphQLApi, JustWatchApiError

DOMAIN = "streaming_browser"
_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    if DOMAIN in hass.data:
        return True
    hass.data[DOMAIN] = JustWatchGraphQLApi(async_get_clientsession(hass))
    websocket_api.async_register_command(hass, ws_episode_links)
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
    """Return provider landing URLs that JustWatch associates with an episode."""
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
        connection.send_result(msg["id"], {"links": links, "scope": "episode", "source": "justwatch"})
    except (JustWatchApiError, ValueError, LookupError, TypeError) as err:
        _LOGGER.debug("Streaming Browser episode lookup failed: %s", err)
        connection.send_error(msg["id"], "episode_links_unavailable", str(err))
