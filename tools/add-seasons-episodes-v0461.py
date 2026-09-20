"""Guarded Streaming Browser v0.4.61 patch: Nuvio-like season/episode browser."""
from pathlib import Path
p = Path('streaming-browser-card.js')
s = p.read_text(encoding='utf-8')

def change(old, new):
    global s
    n = s.count(old)
    if n != 1:
        raise AssertionError(f'Expected one match; found {n}: {old[:130]!r}')
    s = s.replace(old, new, 1)

change(' * v0.4.60\n', ' * v0.4.61\n')
change('const STREAMING_BROWSER_VERSION = "0.4.60";', 'const STREAMING_BROWSER_VERSION = "0.4.61";')
change('"%c STREAMING-BROWSER-CARD %c v0.4.60 "', '"%c STREAMING-BROWSER-CARD %c v0.4.61 "')
change('            "open_on_tv": "Open on TV",', '''            "open_on_tv": "Open on TV",
            "season": "Season",
            "episode": "Episode",
            "episodes": "Episodes",
            "choose_episode": "Select an episode to view streaming sources.",
            "loading_episodes": "Loading episodes…",
            "no_episodes": "No episodes were reported for this season.",
            "episode_load_error": "Could not load episodes: {error}",
            "episode_link_note": "These streaming links may open the series page rather than this exact episode. Select the episode in the provider app if necessary.",''')
change('            "open_on_tv": "Abrir en TV",', '''            "open_on_tv": "Abrir en TV",
            "season": "Temporada",
            "episode": "Episodio",
            "episodes": "Episodios",
            "choose_episode": "Selecciona un episodio para ver las plataformas disponibles.",
            "loading_episodes": "Cargando episodios…",
            "no_episodes": "No hay episodios reportados para esta temporada.",
            "episode_load_error": "No se pudieron cargar los episodios: {error}",
            "episode_link_note": "Estos enlaces pueden abrir la página de la serie en vez del episodio exacto. Si es necesario, selecciona el episodio en la app de la plataforma.",''')

# Populate the series browser from the real TMDB seasons and /season/{n} episode metadata.
change('''      this._details = {
        loading: false,
        item,
        type,
        details,
        providers:
          providers.results?.[this._config.region] || {},
      };''', '''      const seasons = type === "tv" && Array.isArray(details.seasons)
        ? details.seasons.filter((season) => Number.isInteger(Number(season.season_number)))
            .sort((a, b) => Number(a.season_number) - Number(b.season_number))
        : [];
      const firstRegular = seasons.find((season) => Number(season.season_number) > 0);
      const firstSeason = firstRegular || seasons[0];
      this._details = {
        loading: false,
        item,
        type,
        details,
        providers: providers.results?.[this._config.region] || {},
        seriesSeasons: seasons,
        selectedSeason: firstSeason ? Number(firstSeason.season_number) : null,
        selectedEpisode: null,
        episodes: [],
        episodesLoading: false,
        seasonCache: new Map(),
        seasonRequest: 0,
      };''')
change('''      void this._primeLocalTitleLinks(currentDetail);
    }
  }

  async _primeLocalTitleLinks(detail) {''', '''      void this._primeLocalTitleLinks(currentDetail);
      if (currentDetail.type === "tv" && currentDetail.selectedSeason !== null) {
        void this._loadSeasonEpisodes(currentDetail, currentDetail.selectedSeason);
      }
    }
  }

  async _loadSeasonEpisodes(detail, seasonNumber) {
    if (this._details !== detail || detail.type !== "tv") return;
    const season = Number(seasonNumber);
    if (!detail.seriesSeasons.some((entry) => Number(entry.season_number) === season)) return;
    const request = ++detail.seasonRequest;
    detail.selectedSeason = season;
    detail.selectedEpisode = null;
    detail.seasonError = "";
    detail.episodes = [];
    detail.episodesLoading = true;
    this._render();
    try {
      let episodes = detail.seasonCache.get(season);
      if (!episodes) {
        const data = await this._api(`/tv/${detail.item.id}/season/${season}`);
        episodes = Array.isArray(data?.episodes)
          ? data.episodes.slice().sort((a, b) => Number(a.episode_number) - Number(b.episode_number))
          : [];
        detail.seasonCache.set(season, episodes);
      }
      if (this._details !== detail || request !== detail.seasonRequest) return;
      detail.episodes = episodes;
    } catch (err) {
      if (this._details !== detail || request !== detail.seasonRequest) return;
      detail.seasonError = this._formatError(err);
    } finally {
      if (this._details === detail && request === detail.seasonRequest) {
        detail.episodesLoading = false;
        this._render();
      }
    }
  }

  _selectEpisode(detail, index) {
    if (this._details !== detail || detail.episodesLoading) return;
    const episode = detail.episodes?.[index];
    if (!episode) return;
    detail.selectedEpisode = episode;
    this._render();
  }

  async _primeLocalTitleLinks(detail) {''')

# Styled, keyboard-accessible season tabs and episode rows, with a selected-episode
# summary just above the provider actions. Each provider retains TV/local buttons.
change('''      .provider-grid {
        display: grid;''', '''      .season-tabs { display:flex; gap:8px; overflow-x:auto; padding:4px 1px 12px;
        scrollbar-width:thin; }
      .season-tab { flex:0 0 auto; border:1px solid var(--divider-color);
        border-radius:20px; background:var(--secondary-background-color);
        color:var(--primary-text-color); padding:9px 13px; font:inherit; cursor:pointer; }
      .season-tab.active { background:var(--primary-color); border-color:var(--primary-color);
        color:var(--text-primary-color,#fff); }
      .episode-list { display:grid; gap:8px; margin:3px 0 14px; }
      .episode-row { display:flex; align-items:center; width:100%; min-width:0;
        gap:12px; padding:9px; text-align:left; font:inherit; cursor:pointer;
        border:1px solid var(--divider-color); border-radius:12px;
        background:var(--secondary-background-color); color:var(--primary-text-color); }
      .episode-row.active { border-color:var(--primary-color);
        box-shadow:inset 0 0 0 1px var(--primary-color); }
      .episode-thumb { width:118px; aspect-ratio:16/9; flex:0 0 118px;
        border-radius:8px; object-fit:cover; background:var(--card-background-color); }
      .episode-fallback { display:grid; place-items:center; }
      .episode-copy { flex:1; min-width:0; }
      .episode-copy strong { display:block; font-size:14px; margin-bottom:4px; }
      .episode-copy small { display:block; opacity:.7; font-size:11px; margin-bottom:4px; }
      .episode-copy p { margin:0; opacity:.78; font-size:12px; line-height:1.35;
        display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
      .episode-selected { padding:12px; background:var(--secondary-background-color);
        border:1px solid var(--primary-color); border-radius:12px; margin:12px 0; }
      .episode-selected strong { display:block; margin-bottom:5px; }
      .episode-selected p { font-size:13px; line-height:1.45; margin:4px 0; }
      .episode-link-note { font-size:12px; opacity:.72; margin:5px 0 13px; line-height:1.4; }
      .provider-grid {
        display: grid;''')
change('''        .provider-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
  }

  _renderDetails() {''', '''        .provider-grid {
          grid-template-columns: 1fr;
        }
        .episode-thumb { width:88px; flex-basis:88px; }
      }
    `;
  }

  _renderEpisodeBrowser(detail) {
    const seasons = detail.seriesSeasons || [];
    if (!seasons.length) return `<div class="episode-link-note">${this._t("no_episodes")}</div>`;
    const selected = detail.selectedEpisode;
    const tabs = seasons.map((season) => {
      const n = Number(season.season_number);
      const label = season.name || `${this._t("season")} ${n}`;
      return `<button type="button" class="season-tab ${n === detail.selectedSeason ? "active" : ""}"
        data-season="${n}" aria-pressed="${String(n === detail.selectedSeason)}">${this._esc(label)}</button>`;
    }).join("");
    const rows = (detail.episodes || []).map((episode, index) => {
      const num = Number(episode.episode_number);
      const active = selected && Number(selected.episode_number) === num;
      const name = episode.name || `${this._t("episode")} ${num}`;
      const thumb = this._img(episode.still_path, "w300");
      const runtime = episode.runtime ? `${episode.runtime} min` : "";
      const meta = [episode.air_date, runtime].filter(Boolean).join(" · ");
      return `<button type="button" class="episode-row ${active ? "active" : ""}"
        data-episode-index="${index}" aria-pressed="${String(Boolean(active))}">
        ${thumb ? `<img class="episode-thumb" loading="lazy" src="${this._esc(thumb)}" alt="">`
          : `<span class="episode-thumb episode-fallback"><ha-icon icon="mdi:movie-open"></ha-icon></span>`}
        <span class="episode-copy"><strong>${this._t("episode")} ${num} · ${this._esc(name)}</strong>
          ${meta ? `<small>${this._esc(meta)}</small>` : ""}
          ${episode.overview ? `<p>${this._esc(episode.overview)}</p>` : ""}
        </span><ha-icon icon="mdi:chevron-right"></ha-icon>
      </button>`;
    }).join("");
    const status = detail.episodesLoading
      ? `<p class="episode-link-note">${this._t("loading_episodes")}</p>`
      : detail.seasonError
        ? `<p class="episode-link-note">${this._t("episode_load_error", { error: this._esc(detail.seasonError) })}</p>`
        : rows || `<p class="episode-link-note">${this._t("no_episodes")}</p>`;
    const chosen = selected
      ? `<div class="episode-selected"><strong>${this._t("season")} ${detail.selectedSeason} · ${this._t("episode")} ${Number(selected.episode_number)}: ${this._esc(selected.name || "")}</strong>
          ${selected.overview ? `<p>${this._esc(selected.overview)}</p>` : ""}</div>
          <p class="episode-link-note">${this._t("episode_link_note")}</p>`
      : `<p class="episode-link-note">${this._t("choose_episode")}</p>`;
    return `<div class="provider-title">${this._t("episodes")}</div>
      <div class="season-tabs">${tabs}</div><div class="episode-list">${status}</div>${chosen}`;
  }

  _renderDetails() {''')

change('''    const providers = this._detailProviders();
    const link = detail.providers?.link;

    const providerCards = providers.length
''', '''    const providers = this._detailProviders();
    const isSeries = detail.type === "tv";
    const episodeBrowser = isSeries ? this._renderEpisodeBrowser(detail) : "";
    const showProviderActions = !isSeries || Boolean(detail.selectedEpisode);
    const link = detail.providers?.link;

    const providerCards = showProviderActions && providers.length
''')
change('''            <div class="provider-title">
              ${this._t("where_to_watch")}
              ${this._esc(this._config.region)}
            </div>

            <div class="provider-grid">
              ${providerCards}
            </div>
''', '''            ${episodeBrowser}
            ${showProviderActions ? `
              <div class="provider-title">
                ${this._t("where_to_watch")}
                ${this._esc(this._config.region)}
              </div>
              <div class="provider-grid">${providerCards}</div>
            ` : ""}
''')

# Rebuilds caused by status updates, provider lookup, and episode selection must
# not throw the user back to the top of a long series' detail modal.
change('''    const tv = this._tvState();

    const posterWidth =''', '''    const tv = this._tvState();
    const detailScrollTop = this.shadowRoot.querySelector(".detail")?.scrollTop ?? null;

    const posterWidth =''')
change('''    `;

    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Events''', '''    `;

    if (detailScrollTop !== null) {
      const detailPane = this.shadowRoot.querySelector(".detail");
      if (detailPane) detailPane.scrollTop = detailScrollTop;
    }
    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Events''')
change('''    root
      .querySelectorAll("[data-title-provider]")
''', '''    root.querySelectorAll("[data-season]").forEach((element) =>
      element.addEventListener("click", () => {
        const detail = this._details;
        if (detail) void this._loadSeasonEpisodes(detail, Number(element.dataset.season));
      })
    );
    root.querySelectorAll("[data-episode-index]").forEach((element) =>
      element.addEventListener("click", () => {
        const detail = this._details;
        if (detail) this._selectEpisode(detail, Number(element.dataset.episodeIndex));
      })
    );

    root
      .querySelectorAll("[data-title-provider]")
''')

p.write_text(s, encoding='utf-8')
print('v0.4.61: Nuvio-like season tabs, real TMDB episode rows, selection, safe provider-link disclosure, retained modal scroll')
