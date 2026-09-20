"""Guarded frontend migration: standalone episode offers and inline controls."""
from pathlib import Path
p = Path('streaming-browser-card.js')
s = p.read_text(encoding='utf8')

def replace(old, new):
    global s
    n = s.count(old)
    if n != 1:
        raise AssertionError(f'Expected exactly one match, got {n}: {old[:130]!r}')
    s = s.replace(old, new, 1)

replace('const STREAMING_BROWSER_VERSION = "0.4.61";', 'const STREAMING_BROWSER_VERSION = "0.4.62";')
replace(' * v0.4.61\n', ' * v0.4.62\n')
replace('"%c STREAMING-BROWSER-CARD %c v0.4.61 "', '"%c STREAMING-BROWSER-CARD %c v0.4.62 "')
replace('    this._remoteExpanded = false;\n  }\n\n  static async getConfigElement()', '    this._remoteExpanded = false;\n    this._remotePortal = null;\n  }\n\n  static async getConfigElement()')

# Self-contained remote: no /nuvio frontend import or nuvio service needed.
a = s.index('  async _toggleNuvioRemote() {')
b = s.index('  _updateNuvioRemoteButton() {', a)
remote = '''  async _toggleNuvioRemote() {
    if (this._remoteExpanded) {
      this._remoteExpanded = false;
      this._remotePortal?.remove();
      this._remotePortal = null;
      this._updateNuvioRemoteButton();
      return;
    }
    try {
      await this._prepareDisplayRoute();
      const portal = document.createElement("div");
      portal.className = "streaming-browser-remote-portal";
      const right = this._config?.remote_side === "right";
      portal.innerHTML = `
        <style>
          .sbr-remote {position:fixed;z-index:100500;top:70px;${right ? "right" : "left"}:16px;
            width:min(310px,calc(100vw - 32px));max-height:calc(100dvh - 85px);overflow:auto;
            padding:14px;border:1px solid #4b4b4b;border-radius:19px;
            color:white;background:linear-gradient(150deg,#282828,#111);
            box-shadow:0 14px 45px #0009;font:500 14px system-ui,sans-serif}
          .sbr-head {display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:12px}
          .sbr-remote button {font:inherit;cursor:pointer;color:white;background:#373737;
            border:1px solid #555;border-radius:12px;min-height:41px}
          .sbr-remote button:active {background:#147da7}
          .sbr-x {width:36px;height:36px;min-height:36px!important;border-radius:50%!important}
          .sbr-pad {width:194px;height:194px;margin:8px auto;display:grid;
            grid-template:repeat(3,1fr)/repeat(3,1fr);gap:5px}
          .sbr-pad button {border-radius:50%;font-size:21px}
          .sbr-pad .sbr-ok {background:#1595cf;border-color:#1595cf;font-size:15px;font-weight:700}
          .sbr-row {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
          .sbr-numbers {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:12px}
        </style>
        <section class="sbr-remote" role="dialog" aria-label="TV remote">
          <header class="sbr-head"><strong>Control · ${this._esc(this._hass?.states?.[this._config.tv_entity]?.attributes?.friendly_name || this._config.tv_entity)}</strong>
          <button type="button" class="sbr-x" data-close-remote aria-label="Close remote">×</button></header>
          <div class="sbr-row"><button data-remote="WAKE">⏻ Wake</button>
            <button data-remote="BACK">↶ Back</button><button data-remote="HOME">⌂ Home</button></div>
          <div class="sbr-pad"><span></span><button data-remote="UP" aria-label="Up">▲</button><span></span>
            <button data-remote="LEFT" aria-label="Left">◀</button><button data-remote="ENTER" class="sbr-ok">OK</button><button data-remote="RIGHT" aria-label="Right">▶</button>
            <span></span><button data-remote="DOWN" aria-label="Down">▼</button><span></span></div>
          <div class="sbr-row"><button data-remote="PLAY">▶ Play</button><button data-remote="PAUSE">Ⅱ Pause</button><button data-remote="MUTE">🔇 Mute</button></div>
          <div class="sbr-numbers">${[1,2,3,4,5,6,7,8,9,"⌫",0,"↵"].map((n) => `<button data-remote="${n === "⌫" ? "BACK" : n === "↵" ? "ENTER" : n}">${n}</button>`).join("")}</div>
        </section>`;
      portal.querySelector("[data-close-remote]")?.addEventListener("click", () => this._toggleNuvioRemote());
      portal.querySelectorAll("[data-remote]").forEach((button) => button.addEventListener("click", async () => {
        try {
          const key = button.dataset.remote;
          if (key === "WAKE") await this._ensureTvOn();
          else if (key === "MUTE") await this._hass.callService("media_player", "volume_mute", {entity_id:this._config.tv_entity,is_volume_muted:true});
          else await this._sendRemoteButton(key);
        } catch (err) { this._toast(`TV remote: ${this._formatError(err)}`); }
      }));
      document.body.appendChild(portal);
      this._remotePortal = portal;
      this._remoteExpanded = true;
      this._updateNuvioRemoteButton();
    } catch (err) {
      this._remoteExpanded = false;
      this._toast(`TV remote: ${this._formatError(err)}`);
    }
  }

'''
s = s[:a] + remote + s[b:]
replace('      document.getElementById("nuvio-remote-portal")?.remove();', '      this._remotePortal?.remove();\n      this._remotePortal = null;')

# Do not fetch a series-level Watchmode URL and mislabel it as an episode.
replace('      currentDetail.localSourcesLoading = true;\n      void this._primeLocalTitleLinks(currentDetail);', '''      if (currentDetail.type !== "tv") {
        currentDetail.localSourcesLoading = true;
        void this._primeLocalTitleLinks(currentDetail);
      }''')
replace('    detail.selectedEpisode = episode;\n    this._render();\n  }', '''    detail.selectedEpisode = episode;
    detail.episodeSources = [];
    detail.episodeSourcesError = "";
    detail.episodeSourcesLoading = true;
    this._render();
    void this._loadIndependentEpisodeLinks(detail, episode);
  }

  async _loadIndependentEpisodeLinks(detail, episode) {
    const season = Number(detail.selectedSeason);
    const number = Number(episode.episode_number);
    try {
      const response = await this._hass.callWS({
        type: "streaming_browser/episode_links",
        tmdb_id: Number(detail.item.id),
        title: String(detail.details?.name || detail.item.name || ""),
        season, episode: number,
        region: this._config.region || "MX",
        language: this._languageCode(),
      });
      if (this._details !== detail || detail.selectedEpisode !== episode ||
          Number(detail.selectedSeason) !== season) return;
      detail.episodeSources = (Array.isArray(response?.links) ? response.links : [])
        .filter((link) => link?.scope === "episode" &&
          Number(link.season) === season && Number(link.episode) === number &&
          typeof link.web_url === "string" && /^https:\\/\\//i.test(link.web_url));
    } catch (err) {
      if (this._details !== detail || detail.selectedEpisode !== episode) return;
      detail.episodeSources = [];
      detail.episodeSourcesError = this._formatError(err);
    } finally {
      if (this._details === detail && detail.selectedEpisode === episode) {
        detail.episodeSourcesLoading = false;
        this._render();
      }
    }
  }''')

# Share provider rendering for movies and the expanded, inline episode row.
a = s.index('    const providerCards = showProviderActions && providers.length\n')
b = s.index('    return `\n      <div class="overlay" data-overlay>', a)
provider_block = s[a:b]
provider_block = provider_block.replace('    const providerCards = showProviderActions && providers.length', '    const providerCards = providers.length', 1)
provider_block = provider_block.replace('const localMatch = Array.isArray(detail.localSources)\n              ? this._pickWatchmodeSource(provider.provider_name, detail.localSources)', 'const candidates = isSeries ? detail.episodeSources : detail.localSources;\n            const localMatch = Array.isArray(candidates)\n              ? this._pickWatchmodeSource(provider.provider_name, candidates)', 1)
provider_block = provider_block.replace('const disabled = source ? "" : "disabled";', 'const candidates = isSeries ? detail.episodeSources : detail.localSources;\n            const found = Array.isArray(candidates) ? this._pickWatchmodeSource(provider.provider_name, candidates) : null;\n            const disabled = source && (!isSeries || found?.web_url) ? "" : "disabled";', 1)
provider_block = provider_block.replace('const candidates = isSeries ? detail.episodeSources : detail.localSources;\n            const localMatch = Array.isArray(candidates)\n              ? this._pickWatchmodeSource(provider.provider_name, candidates)\n              : null;', 'const localMatch = found;', 1)
provider_block = provider_block.replace('detail.localSourcesLoading\n                    ? this._t("local_link_loading")\n                    : detail.localSourceError || this._t("local_link_missing")', '(isSeries ? detail.episodeSourcesLoading : detail.localSourcesLoading)\n                    ? this._t("local_link_loading")\n                    : (isSeries ? detail.episodeSourcesError : detail.localSourceError) || this._t("local_link_missing")', 1)
provider_block = provider_block.replace('    const providerCards = providers.length', '    const providerCards = providers.length', 1)
# Legacy fallback text is not applicable to a deliberately empty episode lookup.
provider_block = provider_block.replace('      : `\n        <div style="opacity:.65">\n          ${this._t("no_providers")}\n        </div>\n      `;', '      : `<div style="opacity:.65">${this._t("no_providers")}</div>`;', 1)
method = '  _renderProviderCards(detail, providers, isSeries) {\n' + provider_block + '    return providerCards;\n  }\n\n'
s = s[:a] + '    const providerCards = this._renderProviderCards(detail, providers, isSeries);\n\n' + s[b:]
marker = '  _renderDetails() {\n'
replace(marker, method + marker)

# Expand selected episode below its row (not after the entire season list).
replace('''    const rows = (detail.episodes || []).map((episode, index) => {
      const num''', '''    const rows = (detail.episodes || []).map((episode, index) => {
      const num''') if False else None
replace('''      return `<button type="button" class="episode-row ${active ? "active" : ""}"''', '''      const inlineActions = active ? `<div class="episode-inline-actions">
        <strong>${this._t("where_to_watch")} ${this._esc(this._config.region)}</strong>
        ${detail.episodeSourcesLoading ? `<p class="episode-link-note">${this._t("local_link_loading")}</p>` : ""}
        ${detail.episodeSourcesError ? `<p class="episode-link-note">${this._esc(detail.episodeSourcesError)} · ${this._t("install_episode_backend")}</p>` : ""}
        ${!detail.episodeSourcesLoading && !detail.episodeSourcesError && !detail.episodeSources?.length
            ? `<p class="episode-link-note">${this._t("no_exact_episode_links")}</p>` : ""}
        <div class="provider-grid">${this._renderProviderCards(detail, this._detailProviders(), true)}</div>
      </div>` : "";
      return `<div class="episode-row-container"><button type="button" class="episode-row ${active ? "active" : ""}"''')
replace('''        </span><ha-icon icon="mdi:chevron-right"></ha-icon>
      </button>`;''', '''        </span><ha-icon icon="mdi:chevron-right"></ha-icon>
      </button>${inlineActions}</div>`;''')
a = s.index('    const chosen = selected\n', s.index('  _renderEpisodeBrowser(detail) {'))
b = s.index('  }\n\n  _renderDetails() {', a)
s = s[:a] + '''    return `<div class="provider-title">${this._t("episodes")}</div>
      <div class="season-tabs">${tabs}</div><div class="episode-list">${status}</div>`;
''' + s[b:]
replace('''    const showProviderActions = !isSeries || Boolean(detail.selectedEpisode);''', '''    const showProviderActions = !isSeries;''')
replace('''            ${episodeBrowser}
            ${showProviderActions ? `''', '''            ${episodeBrowser}
            ${showProviderActions ? `''')
# Remove the extra provider block at the bottom for TV series via showProviderActions=false above.
# Only TV episode links may drive an episode-level TV launch.
replace('''      const sources =
        await this._watchmodeSourcesForCurrentTitle();''', '''      const detail = this._details;
      const series = detail?.type === "tv";
      const sources = series
        ? (detail.selectedEpisode && !detail.episodeSourcesLoading ? detail.episodeSources || [] : [])
        : await this._watchmodeSourcesForCurrentTitle();''')
replace('''      const fallback =
        this._config
          .exact_title_fallback_to_app !==
        false;''', '''      if (this._details?.type === "tv") {
        this._toast(this._t("title_open_failed", { error: this._formatError(err) }));
        return; // Never open the series home as an episode-link fallback.
      }
      const fallback =
        this._config
          .exact_title_fallback_to_app !==
        false;''')

# Styling for the inline expansion and mobile layout.
replace('''      .episode-thumb {''', '''      .episode-row-container { border-bottom:1px solid var(--divider-color); }
      .episode-inline-actions { padding:12px 12px 17px;background:var(--secondary-background-color);
        border:1px solid var(--primary-color);border-radius:0 0 12px 12px;margin:0 0 9px; }
      .episode-inline-actions .provider-grid { margin-top:8px; }
      .episode-thumb {''')
# English and Spanish copy; retain existing movie translation keys.
replace('''            "episode_link_note": "These links may open the series page instead of the exact episode. Select the episode in the provider app if necessary.",''', '''            "episode_link_note": "Episode links are shown only when available for the selected episode.",
            "install_episode_backend": "Install the independent Streaming Browser Episode Links component and restart Home Assistant.",
            "no_exact_episode_links": "No exact episode links were returned for this episode and region.",''')
replace('''            "episode_link_note": "Estos enlaces pueden abrir la página de la serie en vez del episodio exacto. Si es necesario, selecciona el episodio en la app de la plataforma.",''', '''            "episode_link_note": "Se muestran enlaces únicamente cuando están disponibles para el episodio seleccionado.",
            "install_episode_backend": "Instala el componente independiente Streaming Browser Episode Links y reinicia Home Assistant.",
            "no_exact_episode_links": "No se encontraron enlaces directos para este episodio y región.",''')
# Fix absolute remote cleanup outside the popup.
assert '"/nuvio/nuvio-card.js"' not in s
assert '"nuvio", "remote_key"' not in s
p.write_text(s, encoding='utf8')
print('Patched 0.4.62 with independent JustWatch episode lookups and inline actions')
