"""Patch v0.4.94 with WatchHub visibility, larger logos and server-side JustWatch sessions."""
from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]
base = root / 'custom_components/streaming_browser'
card = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
readme = root / 'README.md'
source = card.read_text(encoding='utf-8')
old_version = 'const STREAMING_BROWSER_VERSION = "0.4.94";'
assert source.count(old_version) == 1, 'Expected released v0.4.94; do not overwrite newer changes'
assert '/* Streaming Browser v0.4.95: WatchHub source visibility and larger provider logos. */' not in source
source = source.replace(old_version, 'const STREAMING_BROWSER_VERSION = "0.4.95";', 1)
old_logo = '''      .provider-card img {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        object-fit: contain;
        background: white;
      }
'''
new_logo = '''      /* Streaming Browser v0.4.95: WatchHub source visibility and larger provider logos. */
      .provider-card img {
        width: 48px;
        height: 48px;
        border-radius: 9px;
        object-fit: contain;
        background: white;
      }
'''
assert source.count(old_logo) == 1
source = source.replace(old_logo, new_logo, 1)
old_brand = '''        flex: 0 0 44px;
        width: 44px;
        min-height: 44px;
'''
assert source.count(old_brand) == 1
source = source.replace(old_brand, '''        flex: 0 0 52px;
        width: 52px;
        min-height: 52px;
''', 1)
old_css = '''      .provider-source {
        font-size: 10px;
        opacity: .72;
        margin: 0;
      }
'''
assert source.count(old_css) == 1
source = source.replace(old_css, old_css + '''      .provider-link-origin {
        display: inline-flex;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 2px 5px;
        white-space: nowrap;
        opacity: .86;
      }
''', 1)
old_status = '''        const sourceStatus = isSeries ? "" : loading
          ? this._t("local_link_loading")
          : !url ? this._t("local_link_missing") : "";
'''
assert source.count(old_status) == 1
source = source.replace(old_status, old_status + '''        const linkOrigin = url ? ({watchhub: 'WatchHub', justwatch: 'JustWatch',
          watchmode: 'Watchmode'})[String(exact?.source || '').toLowerCase()] || '' : '';
''', 1)
old_html = '''              ${sourceStatus ? `<span class="provider-source">${this._esc(sourceStatus)}</span>` : ""}
              <div class="provider-actions">
'''
assert source.count(old_html) == 1
source = source.replace(old_html, '''              ${sourceStatus ? `<span class="provider-source">${this._esc(sourceStatus)}</span>` : ""}
              ${linkOrigin ? `<span class="provider-source provider-link-origin" title="${this._esc(linkOrigin)}">${this._esc(linkOrigin)}</span>` : ""}
              <div class="provider-actions">
''', 1)
# A WatchHub offer for a selected TMDB provider can exist even if TMDB's
# separate watch/providers endpoint did not include it. Show that provider's
# normal TMDB logo and the actual WatchHub link without bypassing user filters.
old_map = '''    const selectedIds =
      this._selectedProviderIds();

    return [...map.values()]
'''
assert source.count(old_map) == 1
source = source.replace(old_map, '''    const selectedIds =
      this._selectedProviderIds();

    if (this._config?.watchhub_enabled !== false) {
      const detail = this._details;
      const mode = detail?.type === 'tv' ? 'tv' : 'movie';
      const links = detail?.type === 'tv'
        ? this._seriesLinksForDetail(detail)
        : (detail?.localSources || []);
      const available = (this._providers?.[mode] || []).filter(provider =>
        selectedIds.has(String(provider.provider_id)));
      for (const link of links) {
        if (String(link?.source || '').toLowerCase() !== 'watchhub') continue;
        const provider = available.find(item =>
          this._watchmodeProviderScore(item.provider_name, link.name) >= 90);
        if (provider && !map.has(provider.provider_id))
          map.set(provider.provider_id, {...provider, groups: []});
      }
    }

    return [...map.values()]
''', 1)
card.write_text(source, encoding='utf-8')

backend = base / '__init__.py'
content = backend.read_text(encoding='utf-8')
assert content.count('hass.data[DOMAIN] = JustWatchGraphQLApi(async_get_clientsession(hass))') == 1
insertion_point = 'async def _register_card(hass: HomeAssistant) -> None:'
assert content.count(insertion_point) == 1
helper = '''def _justwatch_api_for_entry(hass: HomeAssistant, entry) -> JustWatchGraphQLApi:
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


'''
content = content.replace(insertion_point, helper + insertion_point, 1)
content = content.replace('hass.data[DOMAIN] = JustWatchGraphQLApi(async_get_clientsession(hass))',
'''entry = next(iter(hass.config_entries.async_entries(DOMAIN)), None)
    hass.data[DOMAIN] = _justwatch_api_for_entry(hass, entry)''', 1)
old_entry = '''    if DOMAIN not in hass.data:
        return await async_setup(hass, {})
    await _register_card(hass)
    return True
'''
assert content.count(old_entry) == 1
content = content.replace(old_entry, '''    if DOMAIN not in hass.data:
        if not await async_setup(hass, {}):
            return False
    await _justwatch_options_updated(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_justwatch_options_updated))
    await _register_card(hass)
    return True
''', 1)
backend.write_text(content, encoding='utf-8')

meta = json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version'] == '0.4.94'
meta['version'] = '0.4.95'
manifest.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as file:
    file.write('''\n\n## v0.4.95: WatchHub visibility, JustWatch account and larger logos\n\nWatchHub remains an optional official-app link source (enabled by default in the card editor under Exact-title playback). Selected provider cards now identify whether their current link came from WatchHub, JustWatch, or Watchmode. A selected provider with a WatchHub link is shown even when TMDB's separate current-availability endpoint omits it; selected provider filters still apply. Provider logos are 48px instead of 40px while TV/device buttons retain their size. Link selection still prioritizes episode, then season, then series; WatchHub is last within each tier.\n\nFor account-authenticated JustWatch links, go to Settings → Devices & services → Streaming Browser → Configure, then choose JustWatch email/password or browser ID token. Email/password is exchanged server-side for a renewable session; the password is not saved in the dashboard or integration settings. A browser-only token cannot refresh automatically. Disconnect is available in the same settings. This uses the same unofficial JustWatch GraphQL/Firebase implementation already included in Streaming Browser and Nuvio, so sign-in depends on those endpoints remaining available. Anonymous JustWatch links continue to work without an account.\n''')
print('Patched v0.4.95 frontend, WatchHub visibility, protected JustWatch runtime and manifest')
