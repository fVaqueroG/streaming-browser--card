"""Restore the missing streaming-title provider-card renderer in v0.4.68."""
from pathlib import Path
import json

base = Path('custom_components/streaming_browser')
path = base / 'frontend/streaming-browser-card.js'
src = path.read_text(encoding='utf-8')
assert src.count('  _renderEpisodeBrowser(detail) {') == 1, 'episode browser insertion point changed'
assert '_renderProviderCards(detail, providers, isSeries = false) {' not in src, 'provider renderer already exists'
assert src.count('this._renderProviderCards(') == 2, 'unexpected provider renderer call sites'
assert 'const STREAMING_BROWSER_VERSION = "0.4.67";' in src
method = r'''  // A title detail and the selected episode use the SAME provider-card layout,
  // but only the matching title/episode link may be opened. Never substitute a
  // whole-series URL for an episode-specific URL.
  _renderProviderCards(detail, providers, isSeries = false) {
    if (isSeries && !detail?.selectedEpisode) return "";
    const loading = isSeries ? detail.episodeSourcesLoading : detail.localSourcesLoading;
    const sources = isSeries ? detail.episodeSources || [] : detail.localSources || [];
    const season = Number(detail.selectedSeason);
    const episodeNumber = Number(detail.selectedEpisode?.episode_number);
    const validEpisodeLink = (source) =>
      source?.scope === "episode" &&
      Number(source.season) === season &&
      Number(source.episode) === episodeNumber;

    return (Array.isArray(providers) ? providers : [])
      .map((provider) => {
        const name = String(provider?.provider_name || "").trim();
        if (!name) return "";
        const exact = loading ? null : this._pickWatchmodeSource(name,
          isSeries ? sources.filter(validEpisodeLink) : sources);
        const url = exact && typeof exact.web_url === "string" &&
          /^https:\/\//i.test(exact.web_url) ? exact.web_url : "";
        const tvSource = this._sourceForProvider(name);
        const groups = Array.isArray(provider.groups) ? provider.groups.join(" · ") : "";
        const sourceStatus = loading
          ? this._t("local_link_loading")
          : !url ? this._t("local_link_missing") : "";
        return `
          <div class="provider-card">
            ${this._providerLogo(provider)}
            <div class="provider-main">
              <div class="provider-name">${this._esc(name)}</div>
              ${groups ? `<div class="provider-source">${this._esc(groups)}</div>` : ""}
              ${sourceStatus ? `<div class="provider-source">${this._esc(sourceStatus)}</div>` : ""}
              <div class="provider-actions">
                ${url ? `
                  <button type="button" class="mini-btn title"
                    data-title-provider="${this._esc(name)}">${this._esc(this._t("open_on_tv"))}</button>
                  <a class="mini-btn" href="${this._esc(url)}" target="_blank"
                    rel="noopener noreferrer">${this._esc(this._t("open_this_device"))}</a>
                ` : ""}
                ${tvSource ? `<button type="button" class="mini-btn"
                  data-open-provider="${this._esc(name)}">${this._esc(this._t("open_app"))}</button>` : ""}
              </div>
            </div>
          </div>`;
      }).join("");
  }

'''
src = src.replace('  _renderEpisodeBrowser(detail) {', method + '  _renderEpisodeBrowser(detail) {', 1)
src = src.replace(' * v0.4.67\n', ' * v0.4.68\n', 1)
src = src.replace('const STREAMING_BROWSER_VERSION = "0.4.67";', 'const STREAMING_BROWSER_VERSION = "0.4.68";', 1)
src = src.replace('"%c STREAMING-BROWSER-CARD %c v0.4.67 "', '"%c STREAMING-BROWSER-CARD %c v0.4.68 "', 1)
path.write_text(src, encoding='utf-8')
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.67', 'unexpected current manifest version'
manifest['version'] = '0.4.68'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
readme_path = Path('README.md')
readme = readme_path.read_text(encoding='utf-8')
section = '''## v0.4.68: Fix title detail provider cards

Fix the missing `_renderProviderCards()` method that caused `this._renderProviderCards is not a function` when opening movie or series details. The restored renderer uses TMDB provider availability and the existing TV/app controls, exposes exact provider links on this device when available, and shows episode-specific links only for the selected episode. Update the Streaming Browser HACS **Integration**, restart Home Assistant and fully reload the dashboard; saved card configuration is unaffected.\n\n'''
assert section not in readme
readme = readme.replace('# Streaming Browser — Home Assistant Integration\n', '# Streaming Browser — Home Assistant Integration\n\n' + section, 1)
readme_path.write_text(readme, encoding='utf-8')
print('Built v0.4.68 with restored provider cards and scoped movie / episode links')
