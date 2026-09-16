/*
 * Streaming Browser Card for Home Assistant + LG webOS
 * v0.4.38
 *
 * Features:
 * - Browse/search TMDB movies and TV
 * - Categorized horizontal catalog rows with lazy pagination
 * - Region-specific watch providers
 * - Match providers to LG webOS source_list
 * - Open/reopen streaming apps
 * - Optional automatic PLAY
 * - Streaming profile selector
 * - Optional HA input_select/select synchronization
 * - Per-profile, per-app profile handling:
 *     remember    = let the app keep its last profile
 *     navigation  = send configured webOS remote-button steps
 *     command     = send a configured webostv.command
 * - navigation sequences can call Home Assistant scripts, allowing
 *   profile PIN entry to stay outside Lovelace/JavaScript.
 * - Watchmode exact-title lookup through a Home Assistant backend script.
 * - Exact-title URLs stay behind Home Assistant; the Watchmode API key can
 *   remain in secrets.yaml instead of Lovelace.
 *
 * This product uses the TMDB and Watchmode APIs but is not endorsed or
 * certified by either service.
 */

class StreamingBrowserCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._hass = null;
    this._config = null;
    this._loading = false;
    this._error = "";
    this._items = [];
    this._sections = [];
    this._sectionLoadLocks = new Set();
    this._rowScrollPositions = new Map();
    this._mode = "movie";
    this._provider = "trending";
    this._providers = { movie: [], tv: [] };
    this._matchedProviders = { movie: [], tv: [] };
    this._details = null;
    this._query = "";
    this._searchTimer = null;
    this._toastTimer = null;
    this._toastMessage = "";
    this._initialized = false;
    this._lastTvSourcesKey = "";
    this._selectedProfile = null;
    this._watchmodeCache = new Map();
  }

  static getStubConfig() {
    return {
      tv_entity: "media_player.lg_webos_tv",
      tmdb_api_key: "YOUR_TMDB_V3_API_KEY",
      region: "MX",
      language: "es-MX",
      title: "Streaming",
      poster_width: 145,
      max_items: 24,
      catalog_prefetch_threshold_px: 360,
      wake_delay_ms: 4500,
      relaunch_delay_ms: 1200,
      auto_play_delay_ms: 4000,
      profile_launch_delay_ms: 3000,
      profile_navigation_delay_ms: 500,
      exact_title_play_delay_ms: 5000,
      watchmode_script: "script.streaming_watchmode_sources",
      default_profile: "Felipe",
      profiles: {
        Felipe: {
          icon: "mdi:account",
          apps: {
            Netflix: { mode: "remember" }
          }
        }
      }
    };
  }

  setConfig(config) {
    if (!config.tv_entity) throw new Error("tv_entity is required");
    if (!config.tmdb_api_key) throw new Error("tmdb_api_key is required");

    this._config = {
      region: "MX",
      language: "es-MX",
      title: "Streaming",
      poster_width: 145,
      max_items: 24,
      catalog_prefetch_threshold_px: 360,
      include_rent_buy: false,
      wake_delay_ms: 4500,
      relaunch_delay_ms: 1200,
      auto_play_delay_ms: 4000,
      profile_launch_delay_ms: 3000,
      profile_navigation_delay_ms: 500,
      exact_title_play_delay_ms: 5000,
      watchmode_script: "script.streaming_watchmode_sources",
      exact_title_fallback_to_app: true,
      provider_sources: {},
      profiles: {},
      default_profile: null,
      profile_entity: null,
      ...config,
    };

    this._selectedProfile = null;
    this._initialized = false;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    this._syncSelectedProfile();

    const key = JSON.stringify(this._tvSources());
    if (key !== this._lastTvSourcesKey) {
      this._lastTvSourcesKey = key;
      if (this._providers.movie.length || this._providers.tv.length) {
        this._matchProvidersToTv();
      }
      this._render();
    }

    if (!this._initialized) {
      this._initialized = true;
      this._initialize();
    }
  }

  connectedCallback() {
    this._render();
  }

  getCardSize() {
    return 9;
  }

  getGridOptions() {
    return {
      rows: 9,
      columns: 12,
      min_rows: 5,
      min_columns: 6,
    };
  }

  async _initialize() {
    try {
      this._loading = true;
      this._error = "";
      this._render();

      await this._loadProviderLists();
      this._matchProvidersToTv();
      await this._loadBrowse();
    } catch (err) {
      this._error = this._formatError(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _formatError(err) {
    return err?.message || String(err || "Unknown error");
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _tvState() {
    return this._hass?.states?.[this._config.tv_entity];
  }

  _tvSources() {
    const list = this._tvState()?.attributes?.source_list;
    return Array.isArray(list) ? list : [];
  }

  // ---------------------------------------------------------------------------
  // Profiles
  // ---------------------------------------------------------------------------

  _profileNames() {
    return Object.keys(this._config?.profiles || {});
  }

  _profileStorageKey() {
    return `streaming-browser-card-profile:${this._config?.tv_entity || "tv"}`;
  }

  _syncSelectedProfile() {
    const names = this._profileNames();

    if (!names.length) {
      this._selectedProfile = null;
      return;
    }

    const helper = this._config.profile_entity
      ? this._hass?.states?.[this._config.profile_entity]
      : null;

    if (helper && names.includes(helper.state)) {
      this._selectedProfile = helper.state;
      return;
    }

    if (this._selectedProfile && names.includes(this._selectedProfile)) {
      return;
    }

    try {
      const saved = localStorage.getItem(this._profileStorageKey());
      if (saved && names.includes(saved)) {
        this._selectedProfile = saved;
        return;
      }
    } catch (_) {}

    if (
      this._config.default_profile &&
      names.includes(this._config.default_profile)
    ) {
      this._selectedProfile = this._config.default_profile;
    } else {
      this._selectedProfile = names[0];
    }
  }

  async _setSelectedProfile(name) {
    if (!this._profileNames().includes(name)) return;

    this._selectedProfile = name;

    try {
      localStorage.setItem(this._profileStorageKey(), name);
    } catch (_) {}

    const entityId = this._config.profile_entity;

    if (entityId && this._hass?.states?.[entityId]) {
      const domain = entityId.split(".")[0];

      try {
        await this._hass.callService(domain, "select_option", {
          entity_id: entityId,
          option: name,
        });
      } catch (err) {
        this._toast(
          `No pude actualizar ${entityId}: ${this._formatError(err)}`
        );
      }
    }

    this._render();
  }

  _currentProfileConfig() {
    if (!this._selectedProfile) return null;
    return this._config.profiles?.[this._selectedProfile] || null;
  }

  // ---------------------------------------------------------------------------
  // TMDB
  // ---------------------------------------------------------------------------

  _apiUrl(path, params = {}) {
    const q = new URLSearchParams({
      api_key: this._config.tmdb_api_key,
      language: this._config.language,
      ...params,
    });

    return `https://api.themoviedb.org/3${path}?${q.toString()}`;
  }

  async _api(path, params = {}) {
    const res = await fetch(this._apiUrl(path, params));

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          "TMDB rechazó la API key. Usa la API key v3 corta, no el token v4."
        );
      }

      throw new Error(`TMDB request failed (${res.status})`);
    }

    return res.json();
  }

  async _loadProviderLists() {
    const region = this._config.region;

    const [movies, tv] = await Promise.all([
      this._api("/watch/providers/movie", { watch_region: region }),
      this._api("/watch/providers/tv", { watch_region: region }),
    ]);

    const sortProviders = (items) =>
      (items || []).sort(
        (a, b) =>
          (a.display_priority ?? 999) - (b.display_priority ?? 999)
      );

    this._providers.movie = sortProviders(movies.results);
    this._providers.tv = sortProviders(tv.results);
  }

  // ---------------------------------------------------------------------------
  // Provider / LG source matching
  // ---------------------------------------------------------------------------

  _norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\+/g, "plus")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]/g, "");
  }

  _providerAliases(name) {
    const n = this._norm(name);
    const aliases = new Set([n]);

    const groups = [
      [
        ["amazonprimevideo", "primevideo", "amazonvideo"],
        ["amazonprimevideo", "primevideo", "prime"],
      ],
      [
        ["disneyplus", "disney"],
        ["disneyplus", "disney"],
      ],
      [
        ["appletvplus", "appletv"],
        ["appletvplus", "appletv", "apple"],
      ],
      [
        ["paramountplus", "paramount"],
        ["paramountplus", "paramount"],
      ],
      [
        ["hbomax", "max"],
        ["hbomax", "max"],
      ],
      [
        ["netflixstandardwithads", "netflix"],
        ["netflixstandardwithads", "netflix"],
      ],
      [
        ["vixpremiumamazonchannel", "vix", "vixpremium"],
        ["vixpremiumamazonchannel", "vixpremium", "vix"],
      ],
      [
        ["crunchyrollamazonchannel", "crunchyroll"],
        ["crunchyrollamazonchannel", "crunchyroll"],
      ],
      [
        ["mubiamazonchannel", "mubi"],
        ["mubiamazonchannel", "mubi"],
      ],
      [
        ["clarovideo", "claro"],
        ["clarovideo", "claro"],
      ],
      [
        ["universalplus", "universal"],
        ["universalplus", "universal"],
      ],
    ];

    for (const [needles, values] of groups) {
      if (
        needles.some((needle) =>
          n.includes(this._norm(needle))
        )
      ) {
        values.forEach((value) => aliases.add(this._norm(value)));
      }
    }

    return [...aliases];
  }

  _sourceForProvider(providerName) {
    const overrides = this._config.provider_sources || {};

    if (overrides[providerName]) {
      return overrides[providerName];
    }

    const normalizedOverride = Object.entries(overrides).find(
      ([key]) => this._norm(key) === this._norm(providerName)
    );

    if (normalizedOverride) {
      return normalizedOverride[1];
    }

    const aliases = this._providerAliases(providerName);

    let best = null;
    let bestScore = -1;

    for (const source of this._tvSources()) {
      const sn = this._norm(source);

      for (const alias of aliases) {
        let score = -1;

        if (sn === alias) {
          score = 100;
        } else if (sn.includes(alias) || alias.includes(sn)) {
          score = Math.min(sn.length, alias.length);
        }

        if (score > bestScore) {
          bestScore = score;
          best = source;
        }
      }
    }

    return bestScore >= 3 ? best : null;
  }

  _matchProvidersToTv() {
    for (const mode of ["movie", "tv"]) {
      const seen = new Set();

      this._matchedProviders[mode] = this._providers[mode]
        .map((provider) => ({
          ...provider,
          tv_source: this._sourceForProvider(provider.provider_name),
        }))
        .filter((provider) => {
          if (!provider.tv_source) return false;

          const key = this._norm(provider.tv_source);

          if (seen.has(key)) return false;

          seen.add(key);
          return true;
        })
        .slice(0, 18);
    }
  }

  // ---------------------------------------------------------------------------
  // Browse / search
  // ---------------------------------------------------------------------------

  _catalogDefinitions() {
    const mode = this._mode;
    const region = this._config.region;
    const today = new Date().toISOString().slice(0, 10);

    if (this._provider === "trending") {
      if (mode === "movie") {
        return [
          {
            key: "trending",
            label: "Tendencias",
            path: "/trending/movie/week",
            params: {},
          },
          {
            key: "popular",
            label: "Populares",
            path: "/movie/popular",
            params: { region },
          },
          {
            key: "now-playing",
            label: "En cartelera",
            path: "/movie/now_playing",
            params: { region },
          },
          {
            key: "top-rated",
            label: "Mejor valoradas",
            path: "/movie/top_rated",
            params: { region },
          },
          {
            key: "upcoming",
            label: "Próximamente",
            path: "/movie/upcoming",
            params: { region },
          },
        ];
      }

      return [
        {
          key: "trending",
          label: "Tendencias",
          path: "/trending/tv/week",
          params: {},
        },
        {
          key: "popular",
          label: "Populares",
          path: "/tv/popular",
          params: {},
        },
        {
          key: "on-air",
          label: "En emisión",
          path: "/tv/on_the_air",
          params: {},
        },
        {
          key: "top-rated",
          label: "Mejor valoradas",
          path: "/tv/top_rated",
          params: {},
        },
        {
          key: "airing-today",
          label: "Episodios hoy",
          path: "/tv/airing_today",
          params: {},
        },
      ];
    }

    const provider = this._matchedProviders[mode].find(
      (item) =>
        String(item.provider_id) === String(this._provider)
    );

    if (!provider) {
      throw new Error(
        "Ese proveedor no está disponible para este tipo de contenido."
      );
    }

    const base = {
      watch_region: region,
      with_watch_providers: provider.provider_id,
      with_watch_monetization_types: "flatrate",
      include_adult: "false",
    };

    const recentDateField =
      mode === "movie"
        ? "primary_release_date.lte"
        : "first_air_date.lte";

    const recentSort =
      mode === "movie"
        ? "primary_release_date.desc"
        : "first_air_date.desc";

    return [
      {
        key: "provider-popular",
        label: "Populares",
        path: `/discover/${mode}`,
        params: {
          ...base,
          sort_by: "popularity.desc",
        },
      },
      {
        key: "provider-top-rated",
        label: "Mejor valoradas",
        path: `/discover/${mode}`,
        params: {
          ...base,
          sort_by: "vote_average.desc",
          "vote_count.gte": "50",
        },
      },
      {
        key: "provider-recent",
        label: "Estrenos recientes",
        path: `/discover/${mode}`,
        params: {
          ...base,
          sort_by: recentSort,
          [recentDateField]: today,
        },
      },
    ];
  }

  _sectionItems(section, results) {
    const items = (results || [])
      .filter((item) => {
        if (!item?.poster_path) return false;

        if (section.search) {
          return ["movie", "tv"].includes(item.media_type);
        }

        return true;
      })
      .map((item) => ({
        ...item,
        media_type: item.media_type || section.mediaType || this._mode,
      }));

    const seen = new Set();

    return items.filter((item) => {
      const key = `${item.media_type}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async _fetchSection(definition, page = 1) {
    const data = await this._api(definition.path, {
      ...(definition.params || {}),
      page: String(page),
    });

    return {
      ...definition,
      mediaType: definition.mediaType || this._mode,
      page: Number(data.page || page),
      totalPages: Number(data.total_pages || 1),
      items: this._sectionItems(definition, data.results),
      loadingMore: false,
    };
  }

  async _loadBrowse() {
    if (!this._config || !this._hass) return;

    this._loading = true;
    this._error = "";
    this._details = null;
    this._sections = [];
    this._items = [];
    this._render();

    try {
      const definitions = this._catalogDefinitions().map((definition) => ({
        ...definition,
        mediaType: this._mode,
      }));

      const results = await Promise.allSettled(
        definitions.map((definition) =>
          this._fetchSection(definition, 1)
        )
      );

      this._sections = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((section) => section.items.length);

      const failed = results.filter(
        (result) => result.status === "rejected"
      );

      if (!this._sections.length && failed.length) {
        throw failed[0].reason;
      }
    } catch (err) {
      this._error = this._formatError(err);
      this._sections = [];
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadMoreSection(key) {
    const section = this._sections.find((item) => item.key === key);

    if (
      !section ||
      section.loadingMore ||
      this._sectionLoadLocks.has(key) ||
      section.page >= section.totalPages
    ) {
      return;
    }

    this._sectionLoadLocks.add(key);
    section.loadingMore = true;

    try {
      const nextPage = section.page + 1;
      const data = await this._api(section.path, {
        ...(section.params || {}),
        page: String(nextPage),
      });

      const incoming = this._sectionItems(section, data.results);
      const existing = new Set(
        section.items.map(
          (item) => `${item.media_type}:${item.id}`
        )
      );

      for (const item of incoming) {
        const itemKey = `${item.media_type}:${item.id}`;
        if (!existing.has(itemKey)) {
          existing.add(itemKey);
          section.items.push(item);
        }
      }

      section.page = Number(data.page || nextPage);
      section.totalPages = Number(
        data.total_pages || section.totalPages || 1
      );
    } catch (err) {
      this._toast(
        `No pude cargar más títulos: ${this._formatError(err)}`
      );
    } finally {
      section.loadingMore = false;
      this._sectionLoadLocks.delete(key);
      this._render();
    }
  }

  async _search(query) {
    const q = (query || "").trim();
    this._query = q;

    if (q.length < 2) {
      await this._loadBrowse();
      return;
    }

    this._loading = true;
    this._error = "";
    this._sections = [];
    this._render();

    try {
      const definition = {
        key: "search",
        label: `Resultados para “${q}”`,
        path: "/search/multi",
        params: {
          query: q,
          include_adult: "false",
          region: this._config.region,
        },
        mediaType: this._mode,
        search: true,
      };

      const section = await this._fetchSection(definition, 1);
      this._sections = section.items.length ? [section] : [];
    } catch (err) {
      this._error = this._formatError(err);
      this._sections = [];
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _mediaType(item) {
    return item.media_type || this._mode;
  }

  _title(item) {
    return item.title || item.name || "";
  }

  _year(item) {
    const date = item.release_date || item.first_air_date || "";
    return date ? date.slice(0, 4) : "";
  }

  _img(path, size = "w500") {
    return path
      ? `https://image.tmdb.org/t/p/${size}${path}`
      : "";
  }

  async _openDetails(sectionKey, index) {
    const section = this._sections.find(
      (item) => item.key === sectionKey
    );
    const item = section?.items?.[index];
    if (!item) return;

    const type = this._mediaType(item);

    this._details = {
      loading: true,
      item,
    };

    this._render();

    try {
      const [details, providers] = await Promise.all([
        this._api(`/${type}/${item.id}`, {
          append_to_response: "videos",
        }),
        this._api(`/${type}/${item.id}/watch/providers`),
      ]);

      this._details = {
        loading: false,
        item,
        type,
        details,
        providers:
          providers.results?.[this._config.region] || {},
      };
    } catch (err) {
      this._details = {
        loading: false,
        item,
        error: this._formatError(err),
      };
    }

    this._render();
  }

  _detailProviders() {
    if (!this._details?.providers) return [];

    const providers = this._details.providers;
    const groups = ["flatrate", "free", "ads"];

    if (this._config.include_rent_buy) {
      groups.push("rent", "buy");
    }

    const map = new Map();

    for (const group of groups) {
      for (const provider of providers[group] || []) {
        if (!map.has(provider.provider_id)) {
          map.set(provider.provider_id, {
            ...provider,
            groups: [],
          });
        }

        map.get(provider.provider_id).groups.push(group);
      }
    }

    return [...map.values()];
  }

  // ---------------------------------------------------------------------------
  // Profile config lookup
  // ---------------------------------------------------------------------------

  _findProfileAppConfig(providerName, source) {
    const profile = this._currentProfileConfig();

    if (!profile?.apps) return null;

    const entries = Object.entries(profile.apps);
    const providerNorm = this._norm(providerName);
    const sourceNorm = this._norm(source);

    const exact = entries.find(([key]) => {
      const k = this._norm(key);
      return k === providerNorm || k === sourceNorm;
    });

    if (exact) return exact[1];

    const aliases = new Set(this._providerAliases(providerName));
    aliases.add(sourceNorm);

    const fuzzy = entries.find(([key]) => {
      const k = this._norm(key);
      return [...aliases].some(
        (alias) =>
          alias &&
          (k.includes(alias) || alias.includes(k))
      );
    });

    return fuzzy ? fuzzy[1] : null;
  }

  _profileModeFor(providerName, source) {
    return (
      this._findProfileAppConfig(providerName, source)?.mode ||
      "remember"
    );
  }

  // ---------------------------------------------------------------------------
  // webOS controls / profile execution
  // ---------------------------------------------------------------------------

  async _sendRemoteButton(button) {
    await this._hass.callService("webostv", "button", {
      entity_id: this._config.tv_entity,
      button,
    });
  }

  async _applyProfile(providerName, source) {
    const profileName = this._selectedProfile;

    if (!profileName) return;

    const appConfig = this._findProfileAppConfig(
      providerName,
      source
    );

    const mode = appConfig?.mode || "remember";

    if (mode === "remember") {
      return;
    }

    const initialDelay =
      Number(
        appConfig?.launch_delay_ms ??
          this._config.profile_launch_delay_ms
      ) || 0;

    if (initialDelay > 0) {
      this._toast(
        `${source}: preparando perfil ${profileName}…`
      );

      await this._sleep(initialDelay);
    }

    if (mode === "navigation") {
      const sequence = appConfig?.sequence;

      if (!Array.isArray(sequence) || !sequence.length) {
        throw new Error(
          `El perfil ${profileName} usa navigation para ${source}, pero no tiene sequence.`
        );
      }

      const defaultDelay =
        Number(
          appConfig?.step_delay_ms ??
            this._config.profile_navigation_delay_ms
        ) || 450;

      this._toast(
        `${source}: seleccionando perfil ${profileName}…`
      );

      for (const step of sequence) {
        // Short syntax:
        // - ENTER
        // - RIGHT
        if (typeof step === "string") {
          await this._sendRemoteButton(step);

          if (defaultDelay > 0) {
            await this._sleep(defaultDelay);
          }

          continue;
        }

        if (!step || typeof step !== "object") {
          continue;
        }

        // Script syntax:
        //
        // - script: script.streaming_pin_felipe
        //   wait_ms: 2000
        //
        // The card passes tv_entity/profile/provider/source automatically.
        if (step.script) {
          let scriptName = String(step.script).trim();

          if (scriptName.startsWith("script.")) {
            scriptName = scriptName.substring(7);
          }

          this._toast(
            `${source}: desbloqueando perfil ${profileName}…`
          );

          const scriptData = {
            tv_entity: this._config.tv_entity,
            profile: profileName,
            provider: providerName,
            source,
            ...(step.data || {}),
          };

          await this._hass.callService(
            "script",
            scriptName,
            scriptData
          );

          const wait =
            Number(
              step.wait_ms ??
                step.delay_ms ??
                defaultDelay
            ) || 0;

          if (wait > 0) {
            await this._sleep(wait);
          }

          continue;
        }

        // Wait-only step:
        //
        // - wait_ms: 1500
        if (step.wait_ms != null && !step.button) {
          await this._sleep(Number(step.wait_ms) || 0);
          continue;
        }

        // Button step:
        //
        // - button: ENTER
        //   wait_ms: 1000
        if (step.button) {
          await this._sendRemoteButton(String(step.button));

          const wait =
            Number(
              step.wait_ms ??
                step.delay_ms ??
                defaultDelay
            ) || 0;

          if (wait > 0) {
            await this._sleep(wait);
          }
        }
      }

      return;
    }

    if (mode === "command") {
      if (!appConfig?.command) {
        throw new Error(
          `El perfil ${profileName} usa command para ${source}, pero no tiene command.`
        );
      }

      this._toast(
        `${source}: aplicando perfil ${profileName}…`
      );

      await this._hass.callService("webostv", "command", {
        entity_id: this._config.tv_entity,
        command: appConfig.command,
        ...(appConfig.payload
          ? { payload: appConfig.payload }
          : {}),
      });

      const afterDelay =
        Number(appConfig.after_command_delay_ms || 0);

      if (afterDelay > 0) {
        await this._sleep(afterDelay);
      }

      return;
    }

    throw new Error(`profile mode desconocido: ${mode}`);
  }

  async _ensureTvOn() {
    let tv = this._tvState();

    const onStates = new Set([
      "on",
      "playing",
      "paused",
      "idle",
      "buffering",
    ]);

    if (!tv || !onStates.has(tv.state)) {
      this._toast("Encendiendo TV…");

      await this._hass.callService(
        "media_player",
        "turn_on",
        {
          entity_id: this._config.tv_entity,
        }
      );

      await this._sleep(
        Number(this._config.wake_delay_ms) || 4500
      );

      tv = this._tvState();
    }

    return tv;
  }

  async _launchProvider(providerName, autoPlay = false) {
    if (!this._hass) return;

    const source = this._sourceForProvider(providerName);

    if (!source) {
      this._toast(
        `No pude relacionar “${providerName}” con una app del LG.`
      );
      return;
    }

    try {
      const tv = await this._ensureTvOn();
      const currentSource = tv?.attributes?.source || "";

      const appAlreadyOpen =
        this._norm(currentSource) === this._norm(source);

      if (appAlreadyOpen) {
        this._toast(`Reabriendo ${source}…`);

        await this._sendRemoteButton("HOME");

        await this._sleep(
          Number(this._config.relaunch_delay_ms) || 1200
        );
      } else {
        this._toast(`Abriendo ${source}…`);
      }

      await this._hass.callService(
        "media_player",
        "select_source",
        {
          entity_id: this._config.tv_entity,
          source,
        }
      );

      await this._applyProfile(providerName, source);

      if (autoPlay) {
        const delay =
          Number(this._config.auto_play_delay_ms) || 4000;

        this._toast(
          `${source} · ${
            this._selectedProfile
              ? `perfil ${this._selectedProfile} · `
              : ""
          }PLAY en ${Math.round(delay / 100) / 10}s…`
        );

        await this._sleep(delay);

        await this._sendRemoteButton("PLAY");

        this._toast(`▶ PLAY enviado a ${source}`);
      } else {
        this._toast(
          `${source} abierto${
            this._selectedProfile
              ? ` · perfil ${this._selectedProfile}`
              : ""
          }`
        );
      }
    } catch (err) {
      this._toast(
        `No se pudo abrir ${source}: ${this._formatError(err)}`
      );
    }
  }


  // ---------------------------------------------------------------------------
  // Watchmode exact-title lookup
  // ---------------------------------------------------------------------------

  async _callServiceWithResponse(entityId, serviceData = {}) {
    if (!this._hass?.callWS) {
      throw new Error(
        "Esta versión del frontend no expone hass.callWS."
      );
    }

    const parts = String(entityId || "").split(".");

    if (parts.length !== 2) {
      throw new Error(
        `Acción inválida para respuesta: ${entityId}`
      );
    }

    const [domain, service] = parts;

    const result = await this._hass.callWS({
      type: "call_service",
      domain,
      service,
      service_data: serviceData,
      return_response: true,
    });

    return result?.response ?? result ?? null;
  }

  async _watchmodeSourcesForCurrentTitle() {
    const detail = this._details;

    if (!detail?.item?.id) {
      throw new Error(
        "No hay un título seleccionado."
      );
    }

    const type =
      detail.type ||
      this._mediaType(detail.item);

    const watchmodeType =
      type === "tv"
        ? "tv"
        : "movie";

    const titleId =
      `${watchmodeType}-${detail.item.id}`;

    const cacheKey =
      `${titleId}:${this._config.region}`;

    if (this._watchmodeCache.has(cacheKey)) {
      return this._watchmodeCache.get(cacheKey);
    }

    const action =
      this._config.watchmode_script ||
      "script.streaming_watchmode_sources";

    this._toast(
      "Buscando enlace exacto del título…"
    );

    const response =
      await this._callServiceWithResponse(
        action,
        {
          title_id: titleId,
          region: this._config.region,
        }
      );

    const status =
      Number(response?.status ?? 0);

    if (status && status !== 200) {
      throw new Error(
        `Watchmode respondió HTTP ${status}.`
      );
    }

    let content =
      response?.content ??
      response;

    if (typeof content === "string") {
      try {
        content = JSON.parse(content);
      } catch (_) {
        throw new Error(
          "Watchmode devolvió una respuesta que no pude interpretar."
        );
      }
    }

    if (!Array.isArray(content)) {
      throw new Error(
        "Watchmode no devolvió una lista de fuentes."
      );
    }

    this._watchmodeCache.set(
      cacheKey,
      content
    );

    return content;
  }

  _watchmodeProviderScore(providerName, watchmodeName) {
    const targetAliases =
      new Set(
        this._providerAliases(providerName)
      );

    const target =
      this._norm(providerName);

    targetAliases.add(target);

    const candidate =
      this._norm(watchmodeName);

    if (!candidate) {
      return -1;
    }

    let best = -1;

    for (const alias of targetAliases) {
      if (!alias) continue;

      if (candidate === alias) {
        best = Math.max(best, 100);
        continue;
      }

      if (
        candidate.includes(alias) ||
        alias.includes(candidate)
      ) {
        best = Math.max(
          best,
          Math.min(
            candidate.length,
            alias.length
          )
        );
      }
    }

    /*
     * Extra common provider-name normalization between
     * TMDB/JustWatch and Watchmode.
     */
    const groups = [
      ["amazonprimevideo", "amazonprime", "primevideo"],
      ["disneyplus", "disney"],
      ["appletvplus", "appletv"],
      ["paramountplus", "paramount"],
      ["hbomax", "max"],
      ["clarovideo", "clarovideo"],
    ];

    for (const group of groups) {
      const norms =
        group.map(
          (x) => this._norm(x)
        );

      const targetInGroup =
        norms.some(
          (x) =>
            target.includes(x) ||
            x.includes(target)
        );

      const candidateInGroup =
        norms.some(
          (x) =>
            candidate.includes(x) ||
            x.includes(candidate)
        );

      if (
        targetInGroup &&
        candidateInGroup
      ) {
        best = Math.max(best, 90);
      }
    }

    return best;
  }

  _pickWatchmodeSource(providerName, sources) {
    const region =
      String(
        this._config.region ||
        ""
      ).toUpperCase();

    const preferredTypes = {
      sub: 40,
      free: 30,
      tve: 20,
      rent: 10,
      buy: 5,
    };

    return (sources || [])
      .filter((source) => {
        if (!source?.web_url) {
          return false;
        }

        if (
          !/^https?:\/\//i.test(
            source.web_url
          )
        ) {
          return false;
        }

        if (
          source.region &&
          region &&
          String(source.region).toUpperCase() !==
            region
        ) {
          return false;
        }

        return (
          this._watchmodeProviderScore(
            providerName,
            source.name
          ) >= 0
        );
      })
      .map((source) => ({
        source,
        score:
          this._watchmodeProviderScore(
            providerName,
            source.name
          ) +
          (
            preferredTypes[
              source.type
            ] || 0
          ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      )[0]?.source || null;
  }

  async _openExactTitle(
    providerName,
    autoPlay = false
  ) {
    if (!this._hass) {
      return;
    }

    try {
      const tv = await this._ensureTvOn();

      const sources =
        await this._watchmodeSourcesForCurrentTitle();

      const match =
        this._pickWatchmodeSource(
          providerName,
          sources
        );

      if (!match?.web_url) {
        throw new Error(
          `Watchmode no encontró un enlace de ${providerName} para este título en ${this._config.region}.`
        );
      }

      const source =
        this._sourceForProvider(providerName);

      const appConfig =
        this._findProfileAppConfig(
          providerName,
          source || providerName
        );

      /*
       * Some webOS apps (notably Disney+) discard the original
       * title launch target while the profile picker is active.
       * For those apps, establish the app/profile session first,
       * then send the exact-title link into the running app.
       */
      if (
        source &&
        appConfig?.exact_title_profile_first === true
      ) {
        const currentSource =
          tv?.attributes?.source || "";

        const appAlreadyOpen =
          this._norm(currentSource) ===
          this._norm(source);

        if (!appAlreadyOpen) {
          this._toast(
            `Abriendo ${source} y preparando perfil ${this._selectedProfile || ""}…`
          );

          await this._hass.callService(
            "media_player",
            "select_source",
            {
              entity_id:
                this._config.tv_entity,
              source,
            }
          );

          await this._applyProfile(
            providerName,
            source
          );

          const afterProfileDelay =
            Number(
              appConfig
                .exact_title_after_profile_delay_ms ??
                0
            ) || 0;

          if (afterProfileDelay > 0) {
            this._toast(
              `${source}: esperando sesión del perfil…`
            );

            await this._sleep(
              afterProfileDelay
            );
          }
        } else {
          this._toast(
            `${source} ya está abierto; usando la sesión actual…`
          );
        }
      }

      this._toast(
        `Abriendo título en ${match.name || providerName}…`
      );

      await this._hass.callService(
        "webostv",
        "command",
        {
          entity_id:
            this._config.tv_entity,

          command:
            "system.launcher/open",

          payload: {
            target:
              match.web_url,
          },
        }
      );

      if (autoPlay) {
        const delay =
          Number(
            this._config
              .exact_title_play_delay_ms
          ) || 5000;

        this._toast(
          `Título abierto · PLAY en ${Math.round(delay / 100) / 10}s…`
        );

        await this._sleep(delay);

        await this._sendRemoteButton(
          "PLAY"
        );

        this._toast(
          "▶ PLAY enviado"
        );
      } else {
        this._toast(
          `Enlace del título enviado al LG`
        );
      }

    } catch (err) {
      const fallback =
        this._config
          .exact_title_fallback_to_app !==
        false;

      if (!fallback) {
        this._toast(
          `No se pudo abrir el título: ${this._formatError(err)}`
        );

        return;
      }

      this._toast(
        `No pude abrir el título exacto; abriendo ${providerName} como respaldo…`
      );

      await this._sleep(700);

      await this._launchProvider(
        providerName,
        autoPlay
      );
    }
  }

  async _openWatchPage() {
    const link = this._details?.providers?.link;

    if (!link || !this._hass) return;

    try {
      await this._hass.callService("webostv", "command", {
        entity_id: this._config.tv_entity,
        command: "system.launcher/open",
        payload: {
          target: link,
        },
      });

      this._toast(
        "Abriendo disponibilidad en el navegador del LG"
      );
    } catch (err) {
      this._toast(
        `No se pudo abrir la página: ${this._formatError(err)}`
      );
    }
  }

  _toast(message) {
    this._toastMessage = message;
    this._render();

    clearTimeout(this._toastTimer);

    this._toastTimer = setTimeout(() => {
      this._toastMessage = "";
      this._render();
    }, 3500);
  }

  _esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  _providerLogo(provider) {
    return provider.logo_path
      ? `
        <img
          src="${this._img(provider.logo_path, "w92")}"
          alt=""
        >
      `
      : "";
  }

  // ---------------------------------------------------------------------------
  // Profile UI
  // ---------------------------------------------------------------------------

  _renderProfileSelector() {
    const names = this._profileNames();

    if (!names.length) return "";

    return `
      <div class="profiles-wrap">
        <div class="profiles-label">
          ¿Quién está viendo?
        </div>

        <div class="profiles">
          ${names
            .map((name) => {
              const cfg = this._config.profiles?.[name] || {};
              const active = name === this._selectedProfile;

              const avatar = cfg.picture
                ? `
                  <img
                    class="profile-picture"
                    src="${this._esc(cfg.picture)}"
                    alt=""
                  >
                `
                : `
                  <ha-icon
                    icon="${this._esc(
                      cfg.icon || "mdi:account"
                    )}"
                  ></ha-icon>
                `;

              return `
                <button
                  class="profile-chip ${active ? "active" : ""}"
                  data-profile="${this._esc(name)}"
                >
                  ${avatar}
                  <span>${this._esc(name)}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Detail dialog
  // ---------------------------------------------------------------------------

  _detailStyles() {
    return `
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0,0,0,.68);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        backdrop-filter: blur(8px);
      }

      .detail {
        width: min(860px,96vw);
        max-height: 88vh;
        overflow: auto;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        border-radius: 18px;
        box-shadow: 0 18px 70px rgba(0,0,0,.45);
        position: relative;
      }

      .hero {
        position: relative;
        min-height: 270px;
        background-size: cover;
        background-position: center;
        border-radius: 18px 18px 0 0;
        overflow: hidden;
      }

      .hero:after {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(
            90deg,
            rgba(0,0,0,.88),
            rgba(0,0,0,.36)
          ),
          linear-gradient(
            0deg,
            var(--card-background-color),
            transparent 58%
          );
      }

      .hero-content {
        position: relative;
        z-index: 2;
        display: flex;
        gap: 18px;
        padding: 28px;
        align-items: flex-end;
        min-height: 270px;
      }

      .detail-poster {
        width: 145px;
        aspect-ratio: 2/3;
        object-fit: cover;
        border-radius: 11px;
        box-shadow: 0 8px 25px rgba(0,0,0,.4);
      }

      .detail-head {
        flex: 1;
        min-width: 0;
        color: white;
        text-shadow: 0 1px 8px rgba(0,0,0,.55);
      }

      .detail-title {
        font-size: 30px;
        font-weight: 750;
        line-height: 1.05;
      }

      .detail-meta {
        margin-top: 8px;
        opacity: .85;
      }

      .close {
        position: absolute;
        right: 12px;
        top: 12px;
        z-index: 4;
        width: 38px;
        height: 38px;
        border: 0;
        border-radius: 50%;
        background: rgba(0,0,0,.64);
        color: white;
        cursor: pointer;
        font-size: 22px;
      }

      .body {
        padding: 0 28px 28px;
      }

      .overview {
        line-height: 1.5;
        opacity: .9;
        margin: 10px 0 18px;
      }

      .provider-title {
        font-size: 14px;
        font-weight: 700;
        margin: 14px 0 9px;
      }

      .provider-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit,minmax(220px,1fr));
        gap: 9px;
      }

      .provider-card {
        border: 1px solid var(--divider-color);
        border-radius: 14px;
        background: var(--secondary-background-color);
        padding: 10px;
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .provider-card img {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        object-fit: contain;
        background: white;
      }

      .provider-info {
        flex: 1;
        min-width: 0;
      }

      .provider-name {
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .provider-source {
        font-size: 10px;
        opacity: .62;
        margin-top: 2px;
      }

      .provider-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 7px;
      }

      .mini-btn {
        border: 1px solid var(--divider-color);
        border-radius: 10px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        padding: 7px 9px;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
      }

      .mini-btn.title {
        background:
          color-mix(
            in srgb,
            var(--primary-color) 16%,
            var(--card-background-color)
          );
      }

      .mini-btn.play {
        background: var(--primary-color);
        color: var(--text-primary-color,#fff);
        border-color: transparent;
      }

      .mini-btn:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 15px;
      }

      .action {
        border: 0;
        border-radius: 12px;
        padding: 9px 12px;
        cursor: pointer;
        font: inherit;
        background: var(--primary-color);
        color: var(--text-primary-color,#fff);
      }

      .action.secondary {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color);
      }

      @media(max-width:600px) {
        .hero-content {
          padding: 18px;
        }

        .detail-poster {
          width: 105px;
        }

        .detail-title {
          font-size: 24px;
        }

        .body {
          padding: 0 18px 20px;
        }

        .provider-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
  }

  _renderDetails() {
    const detail = this._details;

    if (!detail) return "";

    if (detail.loading) {
      return `
        <div class="overlay">
          <div class="detail">
            <button class="close" data-close>×</button>
            <div class="loading">Cargando detalles…</div>
          </div>
        </div>
      `;
    }

    if (detail.error) {
      return `
        <div class="overlay">
          <div class="detail">
            <button class="close" data-close>×</button>
            <div class="body" style="padding-top:50px">
              <div class="error">${this._esc(detail.error)}</div>
            </div>
          </div>
        </div>
      `;
    }

    const info = detail.details;

    const title =
      info.title ||
      info.name ||
      this._title(detail.item);

    const year = (
      info.release_date ||
      info.first_air_date ||
      ""
    ).slice(0, 4);

    const runtime = info.runtime
      ? `${info.runtime} min`
      : Array.isArray(info.episode_run_time) &&
        info.episode_run_time[0]
      ? `${info.episode_run_time[0]} min/ep`
      : "";

    const genres = (info.genres || [])
      .map((genre) => genre.name)
      .join(" · ");

    const backdrop = this._img(
      info.backdrop_path,
      "w1280"
    );

    const poster = this._img(
      info.poster_path || detail.item.poster_path,
      "w500"
    );

    const providers = this._detailProviders();
    const link = detail.providers?.link;

    const providerCards = providers.length
      ? providers
          .map((provider) => {
            const source = this._sourceForProvider(
              provider.provider_name
            );

            const disabled = source ? "" : "disabled";

            const mode = source
              ? this._profileModeFor(
                  provider.provider_name,
                  source
                )
              : "remember";

            const profileText = this._selectedProfile
              ? ` · ${this._esc(
                  this._selectedProfile
                )}: ${this._esc(mode)}`
              : "";

            return `
              <div class="provider-card">
                ${this._providerLogo(provider)}

                <div class="provider-info">
                  <div class="provider-name">
                    ${this._esc(provider.provider_name)}
                  </div>

                  <div class="provider-source">
                    ${
                      source
                        ? `LG: ${this._esc(source)}${profileText}`
                        : "App no encontrada en el LG"
                    }
                  </div>

                  <div class="provider-actions">
                    <button
                      class="mini-btn"
                      data-open-provider="${this._esc(
                        provider.provider_name
                      )}"
                      ${disabled}
                    >
                      Abrir app
                    </button>

                    <button
                      class="mini-btn title"
                      data-title-provider="${this._esc(
                        provider.provider_name
                      )}"
                      ${disabled}
                    >
                      🎬 Abrir título
                    </button>

                    <button
                      class="mini-btn play"
                      data-title-play-provider="${this._esc(
                        provider.provider_name
                      )}"
                      ${disabled}
                    >
                      ▶ Título + Play
                    </button>
                  </div>
                </div>
              </div>
            `;
          })
          .join("")
      : `
        <div style="opacity:.65">
          No hay proveedores reportados para tu región.
        </div>
      `;

    return `
      <div class="overlay" data-overlay>
        <div class="detail">
          <button class="close" data-close>×</button>

          <div
            class="hero"
            style="${
              backdrop
                ? `background-image:url('${backdrop}')`
                : ""
            }"
          >
            <div class="hero-content">
              ${
                poster
                  ? `
                    <img
                      class="detail-poster"
                      src="${poster}"
                      alt=""
                    >
                  `
                  : ""
              }

              <div class="detail-head">
                <div class="detail-title">
                  ${this._esc(title)}
                </div>

                <div class="detail-meta">
                  ${this._esc(
                    [
                      year,
                      runtime,
                      genres,
                      info.vote_average
                        ? `★ ${Number(
                            info.vote_average
                          ).toFixed(1)}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  )}
                </div>
              </div>
            </div>
          </div>

          <div class="body">
            <div class="overview">
              ${this._esc(
                info.overview ||
                  "Sin sinopsis disponible."
              )}
            </div>

            ${
              this._selectedProfile
                ? `
                  <div class="profile-status">
                    <b>Perfil activo:</b>
                    ${this._esc(this._selectedProfile)}
                  </div>
                `
                : ""
            }

            <div class="provider-title">
              Dónde verla en
              ${this._esc(this._config.region)}
            </div>

            <div class="provider-grid">
              ${providerCards}
            </div>

            <div class="actions">
              ${
                link
                  ? `
                    <button
                      class="action secondary"
                      data-watch-page
                    >
                      Abrir disponibilidad en navegador del LG
                    </button>
                  `
                  : ""
              }
            </div>

            <div class="note">
              <b>Abrir app</b> usa la integración LG webOS normal.
              <b>Abrir título</b> consulta Watchmode usando el TMDB ID y
              envía el enlace exacto del proveedor al LG.
              <b>Título + Play</b> hace lo mismo y después envía PLAY.
              Si webOS o la app no aceptan el enlace, el card vuelve a
              abrir la app como respaldo.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Main UI
  // ---------------------------------------------------------------------------

  _render() {
    if (!this.shadowRoot) return;

    if (!this._config) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding:16px">
            Configure the card first.
          </div>
        </ha-card>
      `;
      return;
    }

    const providers =
      this._matchedProviders[this._mode] || [];

    const tv = this._tvState();

    const posterWidth = Math.max(
      100,
      Number(this._config.poster_width) || 145
    );

    const providerChips = [
      `
        <button
          class="chip ${
            this._provider === "trending" ? "active" : ""
          }"
          data-provider="trending"
        >
          🔥 Tendencias
        </button>
      `,
      ...providers.map(
        (provider) => `
          <button
            class="chip ${
              String(this._provider) ===
              String(provider.provider_id)
                ? "active"
                : ""
            }"
            data-provider="${provider.provider_id}"
            title="${this._esc(provider.tv_source)}"
          >
            ${this._providerLogo(provider)}
            <span>${this._esc(provider.provider_name)}</span>
          </button>
        `
      ),
    ].join("");

    const sectionsHtml = this._sections.length
      ? this._sections
          .map((section) => {
            const posters = section.items
              .map((item, index) => {
                const title = this._title(item);
                const year = this._year(item);
                const rating = Number(item.vote_average || 0);

                return `
                  <button
                    class="poster"
                    data-section="${this._esc(section.key)}"
                    data-index="${index}"
                    title="${this._esc(title)}"
                  >
                    <div class="poster-img-wrap">
                      <img
                        class="poster-img"
                        loading="lazy"
                        src="${this._img(item.poster_path)}"
                        alt="${this._esc(title)}"
                      >

                      ${
                        rating
                          ? `
                            <span class="rating">
                              ★ ${rating.toFixed(1)}
                            </span>
                          `
                          : ""
                      }
                    </div>

                    <div class="poster-title">
                      ${this._esc(title)}
                    </div>

                    <div class="poster-meta">
                      ${this._esc(year)}
                      ${
                        item.media_type
                          ? ` · ${
                              item.media_type === "movie"
                                ? "Película"
                                : "Serie"
                            }`
                          : ""
                      }
                    </div>
                  </button>
                `;
              })
              .join("");

            return `
              <section class="catalog-section">
                <div class="catalog-heading">
                  <h3>${this._esc(section.label)}</h3>

                  <div class="catalog-controls">
                    <button
                      class="row-nav"
                      data-scroll-row="${this._esc(section.key)}"
                      data-direction="-1"
                      aria-label="Desplazar a la izquierda"
                    >‹</button>

                    <button
                      class="row-nav"
                      data-scroll-row="${this._esc(section.key)}"
                      data-direction="1"
                      aria-label="Desplazar a la derecha"
                    >›</button>
                  </div>
                </div>

                <div
                  class="catalog-row"
                  data-section="${this._esc(section.key)}"
                >
                  ${posters}

                  ${
                    section.loadingMore
                      ? `
                        <div class="row-loading">
                          Cargando…
                        </div>
                      `
                      : ""
                  }
                </div>
              </section>
            `;
          })
          .join("")
      : !this._loading
      ? `
        <div class="empty">
          No encontré títulos para esta selección.
        </div>
      `
      : "";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        ha-card {
          overflow: hidden;
          background:
            var(
              --ha-card-background,
              var(--card-background-color)
            );
        }

        * {
          box-sizing: border-box;
        }

        .wrap {
          padding: 18px;
          position: relative;
          min-height: 260px;
        }

        .top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }

        .title {
          font-size: 24px;
          font-weight: 700;
          flex: 1 1 auto;
          min-width: 140px;
        }

        .tvstate {
          font-size: 12px;
          opacity: .7;
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background:
            ${
              tv &&
              [
                "on",
                "playing",
                "paused",
                "idle",
                "buffering",
              ].includes(tv.state)
                ? "var(--success-color,#43a047)"
                : "var(--disabled-text-color,#888)"
            };
        }

        .search {
          flex: 1 1 260px;
          max-width: 520px;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          color: var(--primary-text-color);
          border-radius: 18px;
          padding: 11px 14px;
          outline: none;
          font: inherit;
        }

        .search:focus {
          border-color: var(--primary-color);
        }

        .profiles-wrap {
          margin: 2px 0 14px;
        }

        .profiles-label {
          font-size: 12px;
          font-weight: 700;
          opacity: .7;
          margin-bottom: 7px;
        }

        .profiles {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
        }

        .profile-chip {
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid var(--divider-color);
          border-radius: 18px;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          padding: 7px 11px;
          cursor: pointer;
          font: inherit;
          white-space: nowrap;
        }

        .profile-chip.active {
          background: var(--primary-color);
          color: var(--text-primary-color,#fff);
          border-color: var(--primary-color);
        }

        .profile-chip ha-icon {
          --mdc-icon-size: 20px;
        }

        .profile-picture {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          object-fit: cover;
        }

        .switcher {
          display: flex;
          gap: 6px;
          margin: 2px 0 12px;
        }

        .mode {
          border: 0;
          border-radius: 16px;
          padding: 8px 14px;
          cursor: pointer;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font: inherit;
        }

        .mode.active {
          background: var(--primary-color);
          color: var(--text-primary-color,#fff);
        }

        .chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 2px 2px 12px;
          scrollbar-width: thin;
        }

        .chip {
          flex: 0 0 auto;
          display: flex;
          gap: 7px;
          align-items: center;
          border: 1px solid var(--divider-color);
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          border-radius: 18px;
          padding: 7px 11px;
          cursor: pointer;
          font: inherit;
        }

        .chip.active {
          border-color: var(--primary-color);
          box-shadow:
            inset 0 0 0 1px var(--primary-color);
        }

        .chip img {
          width: 22px;
          height: 22px;
          border-radius: 5px;
          object-fit: contain;
          background: white;
        }

        .catalog-section {
          margin: 4px 0 22px;
        }

        .catalog-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0 0 10px;
        }

        .catalog-heading h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
        }

        .catalog-controls {
          display: flex;
          gap: 6px;
        }

        .row-nav {
          width: 34px;
          height: 34px;
          border: 1px solid var(--divider-color);
          border-radius: 50%;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
          font-size: 22px;
          line-height: 1;
        }

        .catalog-row {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: ${posterWidth}px;
          gap: 12px;
          overflow-x: auto;
          overflow-y: hidden;
          overscroll-behavior-inline: contain;
          scroll-snap-type: x proximity;
          scrollbar-width: thin;
          padding: 2px 2px 10px;
        }

        .poster {
          min-width: 0;
          width: ${posterWidth}px;
          scroll-snap-align: start;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--primary-text-color);
          cursor: pointer;
          text-align: left;
        }

        .poster-img-wrap {
          position: relative;
          aspect-ratio: 2/3;
          border-radius: 12px;
          overflow: hidden;
          background: var(--secondary-background-color);
          box-shadow:
            0 5px 18px rgba(0,0,0,.18);
        }

        .poster-img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          transition: transform .18s ease;
        }

        .poster:hover .poster-img {
          transform: scale(1.03);
        }

        .rating {
          position: absolute;
          right: 7px;
          top: 7px;
          background: rgba(0,0,0,.72);
          color: white;
          padding: 4px 6px;
          border-radius: 9px;
          font-size: 11px;
        }

        .poster-title {
          font-weight: 650;
          margin-top: 7px;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .poster-meta {
          margin-top: 2px;
          opacity: .65;
          font-size: 12px;
        }

        .row-loading {
          width: 86px;
          min-height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: .65;
          font-size: 12px;
        }

        .loading {
          padding: 28px 0;
          text-align: center;
          opacity: .75;
        }

        .empty {
          padding: 30px;
          text-align: center;
          opacity: .65;
        }

        .error {
          margin: 8px 0 14px;
          padding: 10px 12px;
          border-radius: 10px;
          background:
            color-mix(
              in srgb,
              var(--error-color,#db4437) 14%,
              transparent
            );
          color: var(--primary-text-color);
        }

        .note {
          font-size: 11px;
          opacity: .58;
          margin-top: 14px;
        }

        .profile-status {
          margin: 8px 0 12px;
          font-size: 13px;
        }

        .toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          z-index: 99999;
          background: rgba(25,25,25,.94);
          color: white;
          padding: 11px 15px;
          border-radius: 12px;
          box-shadow:
            0 6px 24px rgba(0,0,0,.35);
          max-width: min(520px,90vw);
          text-align: center;
        }

        ${this._detailStyles()}

        @media(max-width:600px) {
          .wrap {
            padding: 12px;
          }

          .title {
            font-size: 21px;
          }

          .catalog-row {
            gap: 9px;
            grid-auto-columns: min(${posterWidth}px, 38vw);
          }

          .poster {
            width: min(${posterWidth}px, 38vw);
          }

          .catalog-controls {
            display: none;
          }
        }
      </style>

      <ha-card>
        <div class="wrap">
          <div class="top">
            <div class="title">
              ${this._esc(this._config.title)}
            </div>

            <div class="tvstate">
              <span class="dot"></span>

              ${this._esc(
                tv?.attributes?.friendly_name ||
                  this._config.tv_entity
              )}

              · ${this._esc(tv?.state || "unknown")}

              ${
                tv?.attributes?.source
                  ? ` · ${this._esc(tv.attributes.source)}`
                  : ""
              }
            </div>

            <input
              class="search"
              type="search"
              placeholder="Buscar película o serie…"
              value="${this._esc(this._query)}"
            >
          </div>

          ${this._renderProfileSelector()}

          <div class="switcher">
            <button
              class="mode ${
                this._mode === "movie" ? "active" : ""
              }"
              data-mode="movie"
            >
              Películas
            </button>

            <button
              class="mode ${
                this._mode === "tv" ? "active" : ""
              }"
              data-mode="tv"
            >
              Series
            </button>
          </div>

          <div class="chips">
            ${providerChips}
          </div>

          ${
            !this._tvSources().length
              ? `
                <div class="error">
                  No veo <code>source_list</code> en la entidad de tu TV.
                  Enciende la TV y verifica las Sources de la integración LG webOS.
                </div>
              `
              : ""
          }

          ${
            this._error
              ? `
                <div class="error">
                  ${this._esc(this._error)}
                </div>
              `
              : ""
          }

          ${
            this._loading
              ? `
                <div class="loading">
                  Cargando catálogo…
                </div>
              `
              : `
                <div class="catalog">
                  ${sectionsHtml}
                </div>
              `
          }

          <div class="note">
            Perfil activo:
            <b>${this._esc(this._selectedProfile || "ninguno")}</b>.
            “Abrir app” conserva el flujo de perfil/PIN.
            “Abrir título” y “Título + Play” usan Watchmode para buscar
            el enlace exacto del título y enviarlo al LG.
          </div>

          ${
            this._details
              ? this._renderDetails()
              : ""
          }
        </div>
      </ha-card>

      ${
        this._toastMessage
          ? `
            <div class="toast">
              ${this._esc(this._toastMessage)}
            </div>
          `
          : ""
      }
    `;

    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  _bindEvents() {
    const root = this.shadowRoot;
    if (!root) return;

    root
      .querySelectorAll("[data-profile]")
      .forEach((element) =>
        element.addEventListener("click", () =>
          this._setSelectedProfile(element.dataset.profile)
        )
      );

    root
      .querySelectorAll("[data-mode]")
      .forEach((element) =>
        element.addEventListener("click", async () => {
          this._mode = element.dataset.mode;
          this._provider = "trending";
          this._query = "";
          await this._loadBrowse();
        })
      );

    root
      .querySelectorAll("[data-provider]")
      .forEach((element) =>
        element.addEventListener("click", async () => {
          this._provider = element.dataset.provider;
          this._query = "";
          await this._loadBrowse();
        })
      );

    root
      .querySelectorAll(".poster[data-index][data-section]")
      .forEach((element) =>
        element.addEventListener("click", () =>
          this._openDetails(
            element.dataset.section,
            Number(element.dataset.index)
          )
        )
      );

    root
      .querySelectorAll(".catalog-row[data-section]")
      .forEach((row) => {
        const key = row.dataset.section;

        const saved = this._rowScrollPositions.get(key);
        if (Number.isFinite(saved)) {
          row.scrollLeft = saved;
        }

        row.addEventListener(
          "scroll",
          () => {
            this._rowScrollPositions.set(key, row.scrollLeft);

            const threshold = Number(
              this._config.catalog_prefetch_threshold_px || 360
            );

            if (
              row.scrollWidth -
                row.scrollLeft -
                row.clientWidth <=
              threshold
            ) {
              this._loadMoreSection(key);
            }
          },
          { passive: true }
        );
      });

    root
      .querySelectorAll("[data-scroll-row]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const key = button.dataset.scrollRow;
          const row = root.querySelector(
            `.catalog-row[data-section="${key}"]`
          );

          if (!row) return;

          const direction =
            Number(button.dataset.direction || 1) || 1;

          row.scrollBy({
            left: direction * Math.max(320, row.clientWidth * 0.82),
            behavior: "smooth",
          });
        })
      );

    const search = root.querySelector(".search");

    if (search) {
      search.addEventListener("input", (event) => {
        clearTimeout(this._searchTimer);

        const value = event.target.value;
        this._query = value;

        this._searchTimer = setTimeout(
          () => this._search(value),
          350
        );
      });
    }

    root
      .querySelectorAll("[data-close]")
      .forEach((element) =>
        element.addEventListener("click", () => {
          this._details = null;
          this._render();
        })
      );

    const overlay = root.querySelector("[data-overlay]");

    if (overlay) {
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          this._details = null;
          this._render();
        }
      });
    }

    root
      .querySelectorAll("[data-open-provider]")
      .forEach((element) =>
        element.addEventListener("click", () =>
          this._launchProvider(
            element.dataset.openProvider,
            false
          )
        )
      );

    root
      .querySelectorAll("[data-title-provider]")
      .forEach((element) =>
        element.addEventListener("click", () =>
          this._openExactTitle(
            element.dataset.titleProvider,
            false
          )
        )
      );

    root
      .querySelectorAll("[data-title-play-provider]")
      .forEach((element) =>
        element.addEventListener("click", () =>
          this._openExactTitle(
            element.dataset.titlePlayProvider,
            true
          )
        )
      );

    const watchPage = root.querySelector("[data-watch-page]");

    if (watchPage) {
      watchPage.addEventListener("click", () =>
        this._openWatchPage()
      );
    }
  }
}

if (!customElements.get("streaming-browser-card")) {
  customElements.define(
    "streaming-browser-card",
    StreamingBrowserCard
  );
}

window.customCards = window.customCards || [];

if (
  !window.customCards.some(
    (card) =>
      card.type === "streaming-browser-card"
  )
) {
  window.customCards.push({
    type: "streaming-browser-card",
    name: "Streaming Browser Card",
    description:
      "Browse categorized TMDB catalogs in scrollable rows, select a profile, run secure PIN scripts, and launch streaming apps.",
    preview: false,
    documentationURL:
      "https://developer.themoviedb.org/",
  });
}

console.info(
  "%c STREAMING-BROWSER-CARD %c v0.4.38 ",
  "color:white;background:#03a9f4;font-weight:bold;",
  "color:#03a9f4;background:white;font-weight:bold;"
);