"""Build v0.4.64: progressive detail load and sticky provider selection."""
from pathlib import Path
import json

CARD = Path('custom_components/streaming_browser/frontend/streaming-browser-card.js')
MANIFEST = Path('custom_components/streaming_browser/manifest.json')
s = CARD.read_text(encoding='utf-8')


def replace_once(old, new):
    global s
    count = s.count(old)
    if count != 1:
        raise AssertionError(f'expected 1 occurrence, got {count}: {old[:110]!r}')
    s = s.replace(old, new, 1)


def replace_section(start, end, new):
    global s
    if s.count(start) != 1 or s.count(end) != 1:
        raise AssertionError(f'Cannot locate section {start!r} or {end!r}')
    first = s.index(start)
    last = s.index(end, first)
    s = s[:first] + new + s[last:]

replace_once(' * v0.4.63\n', ' * v0.4.64\n')
replace_once('const STREAMING_BROWSER_VERSION = "0.4.63";', 'const STREAMING_BROWSER_VERSION = "0.4.64";')
replace_once('    this._watchmodeCache = new Map();\n', '    this._watchmodeCache = new Map();\n    this._detailCache = new Map();\n    this._providerDetailCache = new Map();\n')

# Only detail/availability/episode requests gain a finite timeout. Leave catalog paging unchanged.
replace_once('''  async _api(path, params = {}) {
    const res = await fetch(this._apiUrl(path, params));''', '''  async _api(path, params = {}, { signal } = {}) {
    const res = await fetch(this._apiUrl(path, params), { signal });''')
replace_once('''  async _loadProviderLists() {''', '''  async _apiWithTimeout(path, params = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this._api(path, params, { signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`TMDB request timed out after ${Math.round(timeoutMs / 1000)} seconds. Check the TMDB connection or try again.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async _withTimeout(promise, timeoutMs, label) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds. Select the episode again to retry.`)), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async _loadProviderLists() {''')

replace_section('  async _openDetails(sectionKey, index) {', '  async _loadSeasonEpisodes(detail, seasonNumber) {', '''  async _openDetails(sectionKey, index) {
    const section = this._sections.find((entry) => entry.key === sectionKey);
    const item = section?.items?.[index];
    if (!item) return;
    const type = this._mediaType(item);
    const detail = {
      loading: true,
      item,
      type,
      providers: {},
      providersLoading: true,
      providersError: "",
      selectedEpisode: null,
      episodes: [],
      episodesLoading: false,
      seasonCache: new Map(),
      seasonRequest: 0,
    };
    this._details = detail;
    this._render();

    // Provider availability is independent of the title metadata request:
    // a slow/failed provider endpoint must not hold the whole dialog hostage.
    void this._loadDetailProviders(detail);
    const cacheKey = `${type}:${item.id}:${this._languageCode()}`;
    try {
      const cached = this._detailCache.get(cacheKey);
      const info = cached && cached.expires > Date.now()
        ? cached.value
        : await this._apiWithTimeout(`/${type}/${item.id}`, {}, 12000);
      if (this._details !== detail) return;
      this._detailCache.set(cacheKey, { value: info, expires: Date.now() + 10 * 60 * 1000 });
      const seasons = type === "tv" && Array.isArray(info.seasons)
        ? info.seasons.filter((season) => Number.isInteger(Number(season.season_number)))
            .sort((a, b) => Number(a.season_number) - Number(b.season_number))
        : [];
      const firstSeason = seasons.find((season) => Number(season.season_number) > 0) || seasons[0];
      Object.assign(detail, {
        loading: false,
        details: info,
        seriesSeasons: seasons,
        selectedSeason: firstSeason ? Number(firstSeason.season_number) : null,
      });
      this._render();
      if (type === "tv" && detail.selectedSeason !== null) {
        void this._loadSeasonEpisodes(detail, detail.selectedSeason);
      } else if (type !== "tv") {
        detail.localSourcesLoading = true;
        void this._primeLocalTitleLinks(detail);
      }
    } catch (err) {
      if (this._details !== detail) return;
      detail.loading = false;
      detail.error = this._formatError(err);
      this._render();
    }
  }

  async _loadDetailProviders(detail) {
    const key = `${detail.type}:${detail.item.id}:${this._config.region}`;
    try {
      const cached = this._providerDetailCache.get(key);
      const result = cached && cached.expires > Date.now()
        ? cached.value
        : await this._apiWithTimeout(`/${detail.type}/${detail.item.id}/watch/providers`, {}, 8500);
      if (this._details !== detail) return;
      this._providerDetailCache.set(key, { value: result, expires: Date.now() + 10 * 60 * 1000 });
      detail.providers = result?.results?.[this._config.region] || {};
    } catch (err) {
      if (this._details !== detail) return;
      detail.providersError = this._formatError(err);
    } finally {
      if (this._details === detail) {
        detail.providersLoading = false;
        this._render();
      }
    }
  }

''')

replace_once('''        const data = await this._api(`/tv/${detail.item.id}/season/${season}`);''', '''        const data = await this._apiWithTimeout(`/tv/${detail.item.id}/season/${season}`, {}, 12000);''')
replace_once('''      const response = await this._hass.callWS({
        type: "streaming_browser/episode_links",''', '''      const response = await this._withTimeout(this._hass.callWS({
        type: "streaming_browser/episode_links",''')
replace_once('''        language: this._languageCode(),
      });
      if (this._details !== detail || detail.selectedEpisode !== episode ||''', '''        language: this._languageCode(),
      }), 12000, "Episode provider lookup");
      if (this._details !== detail || detail.selectedEpisode !== episode ||''')
replace_once('''      detail.localSources = await this._watchmodeSourcesForCurrentTitle({ silent: true });''', '''      detail.localSources = await this._withTimeout(
        this._watchmodeSourcesForCurrentTitle({ silent: true }), 12000, "Movie provider lookup");''')

# Preserve the requested TMDB provider ID when toggling movie/tv. The choice is
# not silently replaced with All Sources just because a mode has no matching
# offerings (the empty state will explain that mode has no results).
replace_section('  _ensureSelectedProvider() {', '  // ---------------------------------------------------------------------------\n  // Browse / search', '''  _ensureSelectedProvider() {
    if (this._provider == null || this._provider === "") {
      this._provider = "all";
    }
  }

''')
replace_once('''    if (
      this._provider !== "all" &&
      !provider
    ) {
      throw new Error(
        this._t("provider_unavailable")
      );
    }
''', '''    if (this._provider !== "all" && !provider) {
      return [];
    }
''')
replace_once('''          this._mode = element.dataset.mode;
          this._provider = "all";
          this._ensureSelectedProvider();''', '''          this._mode = element.dataset.mode;
          this._ensureSelectedProvider();''')
replace_once('''    const providers =
      this._matchedProviders[this._mode] || [];

    const tv = this._tvState();''', '''    const availableProviders = this._matchedProviders[this._mode] || [];
    const selectedMissing = this._provider !== "all" &&
      !availableProviders.some((item) => String(item.provider_id) === String(this._provider));
    const previousSelection = selectedMissing
      ? [...(this._matchedProviders.movie || []), ...(this._matchedProviders.tv || [])]
          .find((item) => String(item.provider_id) === String(this._provider))
      : null;
    const providers = previousSelection ? [...availableProviders, previousSelection] : availableProviders;

    const tv = this._tvState();''')

replace_once('''            <div class="loading">${this._t("loading_details")}</div>
          </div>
        </div>''', '''            <div class="detail-loading-panel" role="status" aria-live="polite">
              <div class="detail-loading-preview">
                ${detail.item?.poster_path ? `<img src="${this._img(detail.item.poster_path, "w185")}" alt="">` : ""}
                <div><strong>${this._esc(this._title(detail.item))}</strong>
                  <p>${this._t("loading_details")}</p>
                  <small>${this._locale().startsWith("es") ? "Consultando TMDB…" : "Fetching title information from TMDB…"}</small>
                </div>
              </div>
              <div class="detail-loading-track"><span></span></div>
            </div>
          </div>
        </div>''')
replace_once('''      .hero {
        position: relative;''', '''      .detail-loading-panel { padding: 64px 28px 32px; min-height: 180px; }
      .detail-loading-preview { display:flex; gap:14px; align-items:center; }
      .detail-loading-preview img { width:64px; border-radius:7px; flex:0 0 64px; }
      .detail-loading-preview strong { display:block; font-size:18px; margin-bottom:8px; }
      .detail-loading-preview p { margin:0 0 5px; }
      .detail-loading-preview small { opacity:.7; }
      .detail-loading-track { height:4px; background:var(--divider-color); border-radius:4px;
        overflow:hidden; margin-top:20px; }
      .detail-loading-track span { display:block; height:100%; width:32%; background:var(--primary-color);
        border-radius:4px; animation:detail-loading 1.15s ease-in-out infinite alternate; }
      @keyframes detail-loading { from { transform:translateX(0); } to { transform:translateX(210%); } }
      .hero {
        position: relative;''')
replace_once('''              <div class="provider-grid">${providerCards}</div>
            ` : ""}''', '''              ${detail.providersLoading
                ? `<p class="episode-link-note" role="status">${this._locale().startsWith("es") ? "Cargando plataformas disponibles…" : "Loading streaming providers…"}</p>`
                : detail.providersError
                  ? `<p class="error" role="alert">${this._esc(detail.providersError)}</p>`
                  : `<div class="provider-grid">${providerCards || this._t("no_providers")}</div>`}
            ` : ""}''')
replace_once('''        <div class="provider-grid">${this._renderProviderCards(detail, this._detailProviders(), true)}</div>''', '''        ${detail.providersLoading
          ? `<p class="episode-link-note" role="status">${this._locale().startsWith("es") ? "Cargando plataformas disponibles…" : "Loading streaming providers…"}</p>`
          : detail.providersError
            ? `<p class="episode-link-note" role="alert">${this._esc(detail.providersError)}</p>`
            : `<div class="provider-grid">${this._renderProviderCards(detail, this._detailProviders(), true)}</div>`}''')

CARD.write_text(s, encoding='utf-8')
manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.63'
manifest['version'] = '0.4.64'
MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('Built v0.4.64: progressive detail/provider loading, explicit timeouts, cache and persistent provider mode selection')
