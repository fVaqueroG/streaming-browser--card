"""Apply scope-first provider link resolution after the v0.4.82 launcher restore."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
frontend = root/'custom_components/streaming_browser/frontend/streaming-browser-card.js'
backend = root/'custom_components/streaming_browser/__init__.py'
justwatch = root/'custom_components/streaming_browser/justwatch.py'
card = frontend.read_text(encoding='utf-8')
marker = '/* Streaming Browser v0.4.88: episode > season > series; WatchHub last. */'
assert '/* Streaming Browser v0.4.88: restored v0.4.82 link handling. */' in card
assert marker not in card
card += '\n' + (root/'tools/streaming-browser-series-priority-v0488.js').read_text(encoding='utf-8').rstrip() + '\n'
frontend.write_text(card,encoding='utf-8')

py = justwatch.read_text(encoding='utf-8')
anchor = '\n\nclass JustWatchApiError(Exception):'
assert py.count(anchor)==1
query = '''

_SEASON_OFFERS_QUERY = """
query StreamingBrowserSeasonOffers(
  $nodeId: ID!, $country: Country!, $filter: OfferFilter!
) {
  node(id: $nodeId) {
    ... on Season {
      offers(country: $country, platform: WEB, filter: $filter) {
        standardWebURL preAffiliatedStandardWebURL streamUrl
        monetizationType presentationType
        package { clearName technicalName shortName packageId }
      }
    }
  }
}
"""
'''
py=py.replace(anchor,query+anchor,1)
py += '''

async def _streaming_browser_scope_offers(
    self, *, scope: str, title: str, country: str, language: str = "en-US",
    tmdb_id: int | str | None = None, season: int | None = None,
) -> list[dict[str, Any]]:
    """Resolve distinct season or series provider URLs without claiming episode scope."""
    if scope not in {"season", "series"}:
        raise ValueError("Expected season or series scope")
    title = " ".join(str(title or "").split())
    if not title:
        return []
    node = await self._search_title(
        title=title, media_type="series", country=country.upper(),
        language=self._language(language), tmdb_id=tmdb_id, imdb_id=None,
    )
    if not node:
        return []
    if scope == "series":
        return self._offers(node.get("offers"))
    if season is None:
        return []
    season_id = await self._season_id(
        show_id=str(node.get("id") or ""), season=int(season),
        country=country.upper(), language=self._language(language),
    )
    if not season_id:
        return []
    response = await self._post(
        operation_name="StreamingBrowserSeasonOffers",
        query=_SEASON_OFFERS_QUERY,
        variables={"nodeId": season_id, "country": country.upper(),
                   "filter": {"bestOnly": True, "preAffiliate": True}},
    )
    season_node = (response.get("data") or {}).get("node") or {}
    return self._offers(season_node.get("offers")) if isinstance(season_node, dict) else []


JustWatchGraphQLApi.async_scope_offers = _streaming_browser_scope_offers
'''
justwatch.write_text(py,encoding='utf-8')

init=backend.read_text(encoding='utf-8')
old = '    websocket_api.async_register_command(hass, ws_watchhub_links)\n'
assert init.count(old)==1
init=init.replace(old,old+'    websocket_api.async_register_command(hass, ws_series_fallback_links)\n',1)
init += '''

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
'''
backend.write_text(init,encoding='utf-8')
print('Installed scoped JustWatch season/series lookup and source-first card adapter')
