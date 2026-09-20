"""WatchHub official-provider navigation links for Streaming Browser.

WatchHub uses Stremio's public stream add-on protocol.  Only externalUrl
links to known official streaming-provider hosts are exposed.  Never treat
stream URLs, torrents, debrid sources, or Stremio player links as app links.
"""
from __future__ import annotations

import asyncio
import re
from urllib.parse import quote, urlsplit

from aiohttp import ClientError, ClientSession, ClientTimeout

IMDB_ID = re.compile(r"^tt[0-9]{5,12}$")
REGION = re.compile(r"^[A-Z]{2}$")
PROVIDER_HOSTS = {
    "netflix.com": "Netflix", "disneyplus.com": "Disney+",
    "primevideo.com": "Prime Video", "amazon.com": "Prime Video",
    "amazon.co.uk": "Prime Video", "amazon.de": "Prime Video",
    "amazon.co.jp": "Prime Video", "amazon.com.mx": "Prime Video",
    "max.com": "Max", "hbomax.com": "Max", "tv.apple.com": "Apple TV",
    "paramountplus.com": "Paramount+", "crunchyroll.com": "Crunchyroll",
    "hulu.com": "Hulu", "peacocktv.com": "Peacock",
    "tubitv.com": "Tubi", "pluto.tv": "Pluto TV",
    "vix.com": "ViX", "mubi.com": "MUBI", "rakuten.tv": "Rakuten TV",
    "youtube.com": "YouTube", "play.google.com": "Google TV",
    "appletv.com": "Apple TV", "disneyplus.co.uk": "Disney+",
}


def official_provider_url(raw: object) -> tuple[str, str] | None:
    """Reject unknown domains, non-HTTPS URLs, credentials, and direct media."""
    if not isinstance(raw, str) or len(raw) > 3000:
        return None
    try:
        parsed = urlsplit(raw.strip())
        host = (parsed.hostname or "").lower().rstrip(".")
    except ValueError:
        return None
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        return None
    if parsed.port not in (None, 443):
        return None
    if re.search(r"\.(?:m3u8|mpd|mp4|mkv|ts)(?:$|/)", parsed.path, re.I):
        return None
    for domain, provider in PROVIDER_HOSTS.items():
        if host == domain or host.endswith("." + domain):
            return provider, raw.strip()
    return None


def _country_matches(stream: dict, region: str) -> bool:
    hints = stream.get("behaviorHints")
    if not isinstance(hints, dict):
        hints = {}
    allowed = []
    for value in (stream.get("geos"), stream.get("countryWhitelist"),
                  hints.get("countryWhitelist"), hints.get("country_whitelist")):
        if isinstance(value, str):
            allowed.append(value.upper())
        elif isinstance(value, (list, tuple)):
            allowed.extend(str(v).strip().upper() for v in value)
    if not allowed:
        return True
    synonyms = {region, "UK" if region == "GB" else region}
    return bool(synonyms.intersection(allowed))


async def _fetch_streams(session: ClientSession, url: str, timeout: float) -> list[dict]:
    async with session.get(url, timeout=ClientTimeout(total=timeout)) as response:
        response.raise_for_status()
        payload = await response.json(content_type=None)
    if not isinstance(payload, dict) or not isinstance(payload.get("streams"), list):
        raise ValueError("Invalid WatchHub response")
    return [item for item in payload["streams"] if isinstance(item, dict)]


async def provider_links(
    session: ClientSession, *, imdb_id: str, region: str,
    media_type: str, season: int | None = None, episode: int | None = None,
) -> list[dict]:
    """Retrieve external official app links; only episode-specific IDs for TV."""
    if not IMDB_ID.fullmatch(imdb_id) or not REGION.fullmatch(region):
        raise ValueError("Invalid IMDb ID or region")
    if media_type not in ("movie", "series"):
        raise ValueError("Invalid media type")
    video_id = imdb_id
    if media_type == "series":
        if season is None or episode is None or not 0 <= season <= 100 or not 1 <= episode <= 10000:
            raise ValueError("Season and episode are required for WatchHub TV links")
        video_id = f"{imdb_id}:{season}:{episode}"
    path = f"stream/{'series' if media_type == 'series' else 'movie'}/{quote(video_id, safe=':')}.json"
    country_url = f"https://watchhub-{region.lower()}.strem.io/{path}"
    general_url = f"https://watchhub.strem.io/{path}"
    try:
        streams = await _fetch_streams(session, country_url, 4.0)
        country_endpoint = True
    except (ClientError, TimeoutError, asyncio.TimeoutError, ValueError):
        streams = await _fetch_streams(session, general_url, 7.0)
        country_endpoint = False
    result, seen = [], set()
    for stream in streams:
        if not _country_matches(stream, region):
            continue
        official = official_provider_url(stream.get("externalUrl"))
        if official is None:
            continue
        name, link = official
        key = (name, link)
        if key in seen:
            continue
        seen.add(key)
        item = {"name": name, "web_url": link, "source": "watchhub",
                "type": "sub", "region": region if country_endpoint else "",
                "scope": "episode" if media_type == "series" else "movie"}
        if media_type == "series":
            item.update({"season": season, "episode": episode})
        result.append(item)
    return result
