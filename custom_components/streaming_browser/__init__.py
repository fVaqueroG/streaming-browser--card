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
_V2_CARD_URL = "/streaming_browser/streaming-browser-card-v2.js"
_V2_CARD_FILE = _INTEGRATION_DIR / "frontend" / "streaming-browser-card-v2.js"
_V2_RESOURCE_URL = f"{_V2_CARD_URL}?v={_VERSION}"
_POPUP_CARD_URL = "/streaming_browser/streaming-browser-popup-card.js"
_POPUP_CARD_FILE = _INTEGRATION_DIR / "frontend" / "streaming-browser-popup-card.js"
_POPUP_RESOURCE_URL = f"{_POPUP_CARD_URL}?v={_VERSION}"
_BRANDING_URL = "/streaming_browser/streaming-browser-branding.js"
_BRANDING_FILE = _INTEGRATION_DIR / "frontend" / "streaming-browser-branding.js"
_BRANDING_RESOURCE_URL = f"{_BRANDING_URL}?v={_VERSION}"
_LOGO_FILES = {(name, version): _INTEGRATION_DIR / "frontend" / "assets" / f"streaming-browser-{name}-{version}.png"
               for version in ("v124", "v127", "v131") for name in ("horizontal", "vertical", "icon")}
_LOGO_FILES[("horizontal", "v130")] = _INTEGRATION_DIR / "frontend" / "assets" / "streaming-browser-horizontal-v130.png"
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


def _justwatch_api_for_entry(hass: HomeAssistant, entry) -> JustWatchGraphQLApi:
    """Keep private JustWatch session tokens in HA config-entry options."""
    options = entry.options if entry is not None else {}

    async def persist(tokens: dict[str, str]) -> None:
        if entry is None:
            return
        updated = dict(entry.options)
        for name in ("access_token", "refresh_token"):
            token = str(tokens.get(name) or "").strip()
            if token:
                updated["justwatch_" + name] = token
        if updated != entry.options:
            hass.config_entries.async_update_entry(entry, options=updated)

    return JustWatchGraphQLApi(
        async_get_clientsession(hass),
        access_token=options.get("justwatch_access_token"),
        refresh_token=options.get("justwatch_refresh_token"),
        token_updated=persist,
    )


async def _justwatch_options_updated(hass: HomeAssistant, entry) -> None:
    """Apply new sign-in/disconnect settings without discarding refreshed tokens."""
    api = hass.data.get(DOMAIN)
    current = api.session_tokens if isinstance(api, JustWatchGraphQLApi) else {}
    configured = {
        "access_token": str(entry.options.get("justwatch_access_token") or ""),
        "refresh_token": str(entry.options.get("justwatch_refresh_token") or ""),
    }
    if current != configured:
        hass.data[DOMAIN] = _justwatch_api_for_entry(hass, entry)


async def _ensure_v2_resource(collection) -> None:
    """Create/update only the V2 module; existing V1 dashboards remain untouched."""
    existing = [item for item in collection.async_items() or []
                if str(item.get(CONF_URL) or "").split("?", 1)[0] == _V2_CARD_URL]
    if not existing:
        await collection.async_create_item(
            {CONF_URL: _V2_RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"})
        return
    main = existing[0]
    if main.get(CONF_URL) != _V2_RESOURCE_URL or main.get(CONF_TYPE) != "module":
        await collection.async_update_item(
            main[CONF_ID], {CONF_URL: _V2_RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"})
    for duplicate in existing[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])


async def _ensure_popup_resource(collection) -> None:
    """Register the compact button separately, after V2, without duplicating V2 code."""
    existing = [item for item in collection.async_items() or []
                if str(item.get(CONF_URL) or "").split("?", 1)[0] == _POPUP_CARD_URL]
    if not existing:
        await collection.async_create_item(
            {CONF_URL: _POPUP_RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"})
        return
    main = existing[0]
    if main.get(CONF_URL) != _POPUP_RESOURCE_URL or main.get(CONF_TYPE) != "module":
        await collection.async_update_item(
            main[CONF_ID], {CONF_URL: _POPUP_RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"})
    for duplicate in existing[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])


async def _ensure_branding_resource(collection) -> None:
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


async def _register_card(hass: HomeAssistant) -> None:
    """Serve the exact JS bundled with this installed integration version."""
    if not _CARD_FILE.is_file():
        _LOGGER.error("Streaming Browser card file is missing: %s", _CARD_FILE)
        return
    # A missing or not-yet-installed V2 bundle must never disable the working V1
    # card. Browser-cached V1 can otherwise appear on one view while a freshly
    # opened subview reports that the custom card resource is unavailable.
    v2_available = _V2_CARD_FILE.is_file()
    popup_available = v2_available and _POPUP_CARD_FILE.is_file()
    branding_available = popup_available and _BRANDING_FILE.is_file()
    if not v2_available:
        _LOGGER.warning("Streaming Browser V2 bundle is not installed: %s; registering V1 independently", _V2_CARD_FILE)
    if v2_available and not popup_available:
        _LOGGER.warning("Streaming Browser popup bundle is not installed: %s; registering V1 and V2 independently", _POPUP_CARD_FILE)
    # Re-running setup must repair a missing resource without attempting to
    # register the same aiohttp route twice (which can prevent HA startup).
    if not hass.data.get(_STATIC_REGISTERED_KEY):
        paths = [StaticPathConfig(_CARD_URL, str(_CARD_FILE), cache_headers=False)]
        if v2_available:
            paths.append(StaticPathConfig(_V2_CARD_URL, str(_V2_CARD_FILE), cache_headers=False))
        if popup_available:
            paths.append(StaticPathConfig(_POPUP_CARD_URL, str(_POPUP_CARD_FILE), cache_headers=False))
        if branding_available:
            paths.append(StaticPathConfig(_BRANDING_URL, str(_BRANDING_FILE), cache_headers=False))
        # Served from this integration, not /local or an external image host.
        # Stable versioned URLs allow the browser to cache these tiny assets.
        for (name, version), file in _LOGO_FILES.items():
            if file.is_file():
                paths.append(StaticPathConfig(
                    f"/streaming_browser/assets/streaming-browser-{name}-{version}.png",
                    str(file), cache_headers=True))
            else:
                _LOGGER.warning("Missing bundled Streaming Browser logo: %s", file)
        await hass.http.async_register_static_paths(paths)
        hass.data[_STATIC_REGISTERED_KEY] = True
    # The global module lets the named card appear in Add card even before a
    # dashboard containing it has loaded. Register once for repeated setup.
    if not hass.data.get(_FRONTEND_REGISTERED_KEY):
        frontend.add_extra_js_url(hass, _RESOURCE_URL)
        if v2_available:
            frontend.add_extra_js_url(hass, _V2_RESOURCE_URL)
        if popup_available:
            frontend.add_extra_js_url(hass, _POPUP_RESOURCE_URL)
        if branding_available:
            frontend.add_extra_js_url(hass, _BRANDING_RESOURCE_URL)
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
        if v2_available:
            await _ensure_v2_resource(collection)
        if popup_available:
            await _ensure_popup_resource(collection)
        if branding_available:
            await _ensure_branding_resource(collection)
        return
    primary = matches[0]
    if primary.get(CONF_URL) != _RESOURCE_URL or primary.get(CONF_TYPE) != "module":
        await collection.async_update_item(
            primary[CONF_ID], {CONF_URL: _RESOURCE_URL, CONF_RESOURCE_TYPE_WS: "module"}
        )
    for duplicate in matches[1:]:
        await collection.async_delete_item(duplicate[CONF_ID])
    _LOGGER.info("Streaming Browser card registered as a module resource: %s", _RESOURCE_URL)
    if v2_available:
        await _ensure_v2_resource(collection)
    if popup_available:
        await _ensure_popup_resource(collection)
    if branding_available:
        await _ensure_branding_resource(collection)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Initialize once for both config entries and legacy YAML setups."""
    if DOMAIN in hass.data:
        return True
    entry = next(iter(hass.config_entries.async_entries(DOMAIN)), None)
    hass.data[DOMAIN] = _justwatch_api_for_entry(hass, entry)
    websocket_api.async_register_command(hass, ws_episode_links)
    websocket_api.async_register_command(hass, ws_watchhub_links)
    websocket_api.async_register_command(hass, ws_series_fallback_links)
    await _register_card(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Ensure UI setup repairs a missed startup resource registration."""
    if DOMAIN not in hass.data:
        if not await async_setup(hass, {}):
            return False
    await _justwatch_options_updated(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_justwatch_options_updated))
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): "streaming_browser/series_fallback_links",
        vol.Required("title"): str,
        vol.Required("tmdb_id"): vol.Coerce(int),
        vol.Required("season"): vol.Coerce(int),
        vol.Optional("region", default="MX"): str,
        vol.Optional("language", default="en-US"): str,
    }
)
@websocket_api.async_response
async def ws_series_fallback_links(hass: HomeAssistant, connection, msg: dict) -> None:
    """Return separately scoped JustWatch season and series links for a show."""
    try:
        if msg["tmdb_id"] <= 0 or msg["season"] < 0 or not msg["title"].strip():
            raise ValueError("Invalid series or season")
        region = msg["region"].strip().upper()
        if len(region) != 2 or not region.isalpha():
            raise ValueError("Invalid region")
        api: JustWatchGraphQLApi = hass.data[DOMAIN]
        links: list[dict] = []
        for scope in ("season", "series"):
            try:
                offers = await api.async_scope_offers(
                    scope=scope, title=msg["title"], tmdb_id=msg["tmdb_id"],
                    season=msg["season"], country=region, language=msg["language"],
                )
            except (JustWatchApiError, ValueError, LookupError, TypeError) as exc:
                _LOGGER.debug("JustWatch %s fallback unavailable: %s",scope,exc)
                continue
            for offer in offers:
                if (isinstance(offer,dict) and offer.get("provider_name")
                    and str(offer.get("url") or "").startswith("https://")):
                    item = {"name":offer["provider_name"],"web_url":offer["url"],
                            "source":"justwatch","scope":scope}
                    if scope == "season":
                        item["season"] = msg["season"]
                    links.append(item)
        connection.send_result(msg["id"],{"links":links})
    except (ValueError,TypeError) as exc:
        connection.send_error(msg["id"],"series_fallback_unavailable",str(exc))