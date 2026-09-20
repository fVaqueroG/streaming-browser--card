/*
 * Streaming Browser Card for Home Assistant: LG webOS, Android TV and Roku TV
 * v0.4.90
 *
 * Features:
 * - Browse/search TMDB movies and TV
 * - Categorized horizontal catalog rows with lazy pagination
 * - English (en-US) and Spanish (es-MX) card UI localization
 * - Screensaver-aware wake handling for LG webOS and Android TV
 * - Region-specific watch providers
 * - Match providers to LG webOS source_list
 * - Open/reopen streaming apps
 * - Optional automatic PLAY
 * - Streaming profile selector
 * - Optional HA input_select/select synchronization
 * - Per-profile, per-app profile handling:
 *     remember    = let the app keep its last profile
 *     netflix     = auto-select a Netflix profile by TV position
 *     navigation  = send configured remote-button steps
 *     command     = send a configured webostv.command
 * - Netflix default-profile automation for LG webOS and Android TV via ADB
 * - navigation sequences can call Home Assistant scripts, allowing
 *   profile PIN entry to stay outside Lovelace/JavaScript.
 * - Watchmode exact-title lookup through a Home Assistant backend script.
 * - Exact-title URLs stay behind Home Assistant; the Watchmode API key can
 *   remain in secrets.yaml instead of Lovelace.
 *
 * This product uses the TMDB and Watchmode APIs but is not endorsed or
 * certified by either service.
 */

const STREAMING_BROWSER_BACKEND = Object.freeze({
  defaultProviderIds: [8, 337, 119],
  fallbackProfiles: [
    {
      name: "Felipe",
      icon: "mdi:account",
    },
    {
      name: "Guest",
      icon: "mdi:account-outline",
    },
  ],
  profileRules: {
    netflix: {
      launchDelayMs: 10000,
      stepDelayMs: 350,
      afterSelectDelayMs: 2000,
    },
    disney: {
      launchDelayMs: 10000,
      stepDelayMs: 350,
      afterSelectDelayMs: 3000,
    },
    prime: {
      launchDelayMs: 10000,
      stepDelayMs: 350,
      afterSelectDelayMs: 3000,
    },
  },
});

const STREAMING_BROWSER_VERSION = "0.4.99";

class StreamingBrowserV2Card extends HTMLElement {
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
    // Genres are fetched from TMDB for each media type and language.
    // Keep separate selections when switching Movies / Series.
    this._genres = { movie: [], tv: [] };
    this._genreByMode = { movie: "all", tv: "all" };
    this._browseRequest = 0;
    this._provider = "all";
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
    this._detailCache = new Map();
    this._providerDetailCache = new Map();
    this._remoteExpanded = false;
    this._remotePortal = null;
  }

  static getConfigElement() {
    return document.createElement(
      "streaming-browser-card-v2-editor"
    );
  }

  static getConfigForm(hass = null, config = {}) {
    // Use the physical HDMI inputs of the host/display TV, NOT the player.
    const tv = hass?.states?.[config?.display_entity];
    const sourceList = tv?.attributes?.source_list;
    const sources = Array.isArray(sourceList) ? sourceList : [];
    const hdmiInputs = [...new Set(sources
      .filter((source) => typeof source === "string")
      .map((source) => source.trim())
      .filter((source) => /\bHDMI(?:\b|(?=\d))/i.test(source))
    )];
    // Preserve a saved input when the display TV is temporarily offline.
    const saved = String(config?.display_source || "").trim();
    if (config?.display_entity && saved && !hdmiInputs.includes(saved)) {
      hdmiInputs.unshift(saved);
    }
    const hdmiOptions = hdmiInputs.map((source) => ({
      value: source,
      label: source,
    }));

    const labels = {
      title: "Card title",
      platform: "Platform",
      tv_entity: "Playback device (media player)",
      display_entity: "Display TV (optional HDMI host)",
      display_source: "HDMI input on display TV",
      display_source_delay_ms: "HDMI switch delay (ms)",
      remote_side: "Remote position",
      remote_entity: "Playback device remote (Android TV / Roku)",
      adb_entity: "Android TV ADB media player",
      tmdb_api_key: "TMDB API key (v3)",
      region: "Region",
      language: "Language",
      poster_width: "Poster width",
      catalog_prefetch_threshold_px: "Load-more threshold",
      include_rent_buy: "Include rental and purchase providers",
      watchmode_script: "Watchmode Home Assistant script",
      exact_title_fallback_to_app: "Fall back to opening the app",
      wake_delay_ms: "TV power-on delay",
      screensaver_wake_delay_ms: "Screensaver wake delay",
      android_play_command: "Android play/select command",
      relaunch_delay_ms: "App relaunch delay",
      auto_play_delay_ms: "Automatic Play delay",
      exact_title_play_delay_ms: "Exact-title Play delay",
      profile_entity: "Profile helper",
      default_profile: "Default profile",
    };

    const helpers = {
      platform:
        "Choose LG webOS, Android TV Remote or Roku TV. For Roku, install Home Assistant’s Roku integration first.",
      display_entity:
        "Optional display TV for a separate HDMI player, including a Roku TV. Select the display TV here, not the external player.",
      display_source:
        "Select an HDMI input reported by the selected display TV. Turn on the display TV if no inputs are shown.",
      display_source_delay_ms:
        "Time allowed for the HDMI input to become ready after switching.",
      remote_side:
        "Position of the same floating controller used in Nuvio.",
      remote_entity:
        "Required for Android TV and Roku. Choose the matching remote entity from the Android TV Remote or Roku integration.",
      adb_entity:
        "Optional for Android TV generally, but required for Netflix profile auto-selection because Android TV Remote key commands do not work inside Netflix.",
      tmdb_api_key:
        "Use the short TMDB API key v3. It is stored in the dashboard card configuration.",
      region:
        "Two-letter country code used for streaming availability, for example MX.",
      language:
        "TMDB language code, for example es-MX or en-US.",
      catalog_prefetch_threshold_px:
        "Distance from the end of a horizontal catalog row before the next TMDB page is loaded.",
      screensaver_wake_delay_ms:
        "How long to wait after dismissing a screensaver before launching the app or title.",
      android_play_command:
        "Android TV command used for Play. DPAD_CENTER works better than MEDIA_PLAY in many streaming apps.",
      include_rent_buy:
        "Also show rental and purchase providers in title availability.",
      watchmode_script:
        "Leave empty to use script.streaming_watchmode_sources.",
      exact_title_fallback_to_app:
        "If an exact-title deep link fails, open the provider app instead.",
      profile_entity:
        "Optional input_select or select entity used to synchronize the active streaming profile.",
      default_profile:
        "Profile selected when no profile helper or saved choice is available.",
    };

    return {
      schema: [
        {
          type: "expandable",
          name: "",
          title: "General",
          flatten: true,
          schema: [
            {
              name: "title",
              selector: { text: {} },
            },
            {
              name: "platform",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "webos", label: "LG webOS" },
                    { value: "android_tv", label: "Android TV Remote" },
                    { value: "roku", label: "Roku TV / Roku player" },
                  ],
                },
              },
            },
            {
              name: "tv_entity",
              required: true,
              selector: {
                entity: {
                  filter: { domain: "media_player" },
                },
              },
            },
            {
              name: "remote_entity",
              selector: {
                entity: {
                  filter: { domain: "remote" },
                },
              },
            },
            {
              name: "adb_entity",
              selector: {
                entity: {
                  filter: { domain: "media_player" },
                },
              },
            },
            {
              name: "tmdb_api_key",
              required: true,
              selector: {
                text: {
                  type: "password",
                  autocomplete: "off",
                },
              },
            },
            {
              type: "grid",
              name: "",
              flatten: true,
              column_min_width: "160px",
              schema: [
                {
                  name: "region",
                  selector: {
                    text: {
                      pattern: "[A-Za-z]{2}",
                      validation_message:
                        "Use a two-letter country code such as MX.",
                    },
                  },
                },
                {
                  name: "language",
                  selector: {
                    select: {
                      mode: "dropdown",
                      options: ["es-MX", "en-US"],
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          type: "expandable",
          name: "",
          title: "HDMI / remote",
          flatten: true,
          schema: [
            {
              name: "display_entity",
              selector: { entity: { filter: { domain: "media_player" } } },
            },
            {
              name: "display_source",
              selector: {
                select: {
                  mode: "dropdown",
                  options: hdmiOptions,
                },
              },
            },
            {
              name: "display_source_delay_ms",
              selector: { number: { min: 0, max: 20000, step: 100, unit_of_measurement: "ms" } },
            },
            {
              name: "remote_side",
              selector: { select: { mode: "dropdown", options: [
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
              ] } },
            },
          ],
        },
        {
          type: "expandable",
          name: "",
          title: "Catalog",
          flatten: true,
          schema: [
            {
              name: "poster_width",
              selector: {
                number: {
                  min: 100,
                  max: 280,
                  step: 5,
                  unit_of_measurement: "px",
                },
              },
            },
            {
              name: "catalog_prefetch_threshold_px",
              selector: {
                number: {
                  min: 100,
                  max: 1500,
                  step: 20,
                  unit_of_measurement: "px",
                },
              },
            },
            {
              name: "include_rent_buy",
              selector: { boolean: {} },
            },
          ],
        },
        {
          type: "expandable",
          name: "",
          title: "Exact-title playback",
          flatten: true,
          schema: [
            {
              name: "watchmode_script",
              selector: {
                entity: {
                  filter: { domain: "script" },
                },
              },
            },
            {
              name: "exact_title_fallback_to_app",
              selector: { boolean: {} },
            },
            {
              type: "grid",
              name: "",
              flatten: true,
              column_min_width: "170px",
              schema: [
                {
                  name: "wake_delay_ms",
                  selector: {
                    number: {
                      min: 0,
                      step: 100,
                      unit_of_measurement: "ms",
                    },
                  },
                },
                {
                  name: "screensaver_wake_delay_ms",
                  selector: {
                    number: {
                      min: 200,
                      max: 5000,
                      step: 100,
                      unit_of_measurement: "ms",
                    },
                  },
                },
                {
                  name: "android_play_command",
                  selector: {
                    select: {
                      mode: "dropdown",
                      options: [
                        "DPAD_CENTER",
                        "MEDIA_PLAY",
                        "ENTER",
                      ],
                    },
                  },
                },
                {
                  name: "relaunch_delay_ms",
                  selector: {
                    number: {
                      min: 0,
                      step: 100,
                      unit_of_measurement: "ms",
                    },
                  },
                },
                {
                  name: "auto_play_delay_ms",
                  selector: {
                    number: {
                      min: 0,
                      step: 100,
                      unit_of_measurement: "ms",
                    },
                  },
                },
                {
                  name: "exact_title_play_delay_ms",
                  selector: {
                    number: {
                      min: 0,
                      step: 100,
                      unit_of_measurement: "ms",
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          type: "expandable",
          name: "",
          title: "Profiles",
          flatten: true,
          schema: [
            {
              name: "profile_entity",
              selector: {
                entity: {
                  filter: {
                    domain: ["input_select", "select"],
                  },
                },
              },
            },
            {
              name: "default_profile",
              selector: { text: {} },
            },
          ],
        },
      ],
      computeLabel: (schema) => labels[schema.name],
      computeHelper: (schema) => helpers[schema.name],
    };
  }

  static getStubConfig() {
    return {
      platform: "webos",
      tv_entity: "",
      remote_entity: null,
      adb_entity: null,
      display_entity: null,
      display_source: "",
      display_source_delay_ms: 2500,
      remote_side: "left",
      tmdb_api_key: "",
      region: "MX",
      language: "es-MX",
      title: "Streaming",
      poster_width: 145,
      max_items: 24,
      catalog_prefetch_threshold_px: 360,
      wake_delay_ms: 4500,
      screensaver_wake_delay_ms: 1200,
      android_play_command: "DPAD_CENTER",
      relaunch_delay_ms: 1200,
      auto_play_delay_ms: 4000,
      profile_launch_delay_ms: 3000,
      profile_navigation_delay_ms: 500,
      netflix_profile_autoselect: true,
      netflix_profile_launch_delay_ms: 4500,
      netflix_profile_navigation_delay_ms: 350,
      netflix_profile_after_select_delay_ms: 1500,
      exact_title_play_delay_ms: 5000,
      watchmode_script: "script.streaming_watchmode_sources",
      default_profile: "Felipe",
      selected_provider_ids: [
        ...STREAMING_BROWSER_BACKEND
          .defaultProviderIds,
      ]
    };
  }

  setConfig(config) {
    // Incomplete configuration is expected while creating a card.
    // The editor collects both required fields; the preview explains what is missing.
    const previousLanguage = this._languageCode?.() || null;

    this._config = {
      platform: "webos",
      remote_entity: null,
      adb_entity: null,
      region: "MX",
      language: "es-MX",
      title: "Streaming",
      poster_width: 145,
      max_items: 24,
      catalog_prefetch_threshold_px: 360,
      include_rent_buy: false,
      wake_delay_ms: 4500,
      screensaver_wake_delay_ms: 1200,
      android_play_command: "DPAD_CENTER",
      android_app_links: {},
      display_entity: null,
      display_source: "",
      display_source_delay_ms: 2500,
      remote_side: "left",
      relaunch_delay_ms: 1200,
      auto_play_delay_ms: 4000,
      profile_launch_delay_ms: 3000,
      profile_navigation_delay_ms: 500,
      netflix_profile_autoselect: true,
      netflix_profile_launch_delay_ms: 4500,
      netflix_profile_navigation_delay_ms: 350,
      netflix_profile_after_select_delay_ms: 1500,
      exact_title_play_delay_ms: 5000,
      watchmode_script: "script.streaming_watchmode_sources",
      exact_title_fallback_to_app: true,
      provider_sources: {},
      profiles: {},
      default_profile: null,
      profile_entity: null,
      selected_provider_ids: [
        ...STREAMING_BROWSER_BACKEND
          .defaultProviderIds,
      ],
      ...config,
    };

    this._selectedProfile = null;
    this._initialized = false;
    this._render();

    const nextLanguage = this._languageCode();
    if (
      this._hass &&
      previousLanguage &&
      previousLanguage !== nextLanguage
    ) {
      queueMicrotask(() => this._initialize());
    }
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

    // Do not start network calls for a new, not-yet-configured card.
    if (!this._initialized && this._config.tv_entity &&
        this._config.tmdb_api_key &&
        this._config.tmdb_api_key !== "YOUR_TMDB_V3_API_KEY") {
      this._initialized = true;
      this._initialize();
    }
  }

  connectedCallback() {
    this._render();
  }

  disconnectedCallback() {
    if (this._remoteExpanded) {
      this._remoteExpanded = false;
      this._remotePortal?.remove();
      this._remotePortal = null;
    }
  }

  getCardSize() {
    return 9;
  }

  getGridOptions() {
    // In a Sections view take all columns of the section, at every breakpoint.
    // Height is content-driven: catalog rows and episode lists grow naturally.
    return { columns: "full", min_columns: 12 };
  }

  async _initialize() {
    try {
      this._loading = true;
      this._error = "";
      this._render();

      await Promise.all([this._loadProviderLists(), this._loadGenreLists()]);
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

  _languageCode() {
    const configured = this._config?.language;
    const raw =
      configured && typeof configured === "object"
        ? configured.value || configured.label
        : configured;

    return String(
      raw ||
      this._hass?.language ||
      "es-MX"
    );
  }

  _locale() {
    return this._languageCode()
      .toLowerCase()
      .startsWith("en")
      ? "en"
      : "es";
  }

  _t(key, vars = {}) {
    const strings = {
      "en": {
            "profile_update_failed": "Could not update {entity}: {error}",
            "tmdb_key_rejected": "TMDB rejected the API key. Use the short v3 API key, not the v4 token.",
            "trending": "Trending",
            "all_sources": "All sources",
            "genre": "Genre",
            "all_genres": "All genres",
            "popular": "Popular",
            "now_playing": "Now Playing",
            "top_rated": "Top Rated",
            "upcoming": "Upcoming",
            "on_air": "On Air",
            "airing_today": "Airing Today",
            "recent_releases": "Recent Releases",
            "search_results": "Results for “{query}”",
            "scroll_left": "Scroll left",
            "scroll_right": "Scroll right",
            "reopening_app": "Reopening {source}…",
            "opening_app": "Opening {source}…",
            "play_in": "PLAY in {seconds}s…",
            "play_sent_to": "▶ PLAY sent to {source}",
            "app_opened": "{source} opened{profile}",
            "play_sent": "▶ PLAY sent",
            "opening_availability": "Opening availability in the TV browser…",
            "provider_unavailable": "That provider is not available for this type of content.",
            "load_more_failed": "Could not load more titles: {error}",
            "preparing_profile": "{source}: preparing profile {profile}…",
            "navigation_missing": "Profile {profile} uses navigation for {source}, but has no sequence.",
            "selecting_profile": "{source}: selecting profile {profile}…",
            "netflix_adb_required": "Netflix profile auto-selection on Android TV requires an Android Debug Bridge media_player entity.",
            "netflix_profile_position_invalid": "Netflix profile position for {profile} must be between 1 and 5.",
            "netflix_title_id_missing": "Could not extract the Netflix title ID from the provider link.",
            "unlocking_profile": "{source}: unlocking profile {profile}…",
            "command_missing": "Profile {profile} uses command for {source}, but has no command.",
            "applying_profile": "{source}: applying profile {profile}…",
            "unknown_profile_mode": "Unknown profile mode: {mode}",
            "app_match_failed": "Could not match “{provider}” to an app on the target device.",
            "profile_prefix": "profile {profile} · ",
            "profile_suffix": " · profile {profile}",
            "app_open_failed": "Could not open {source}: {error}",
            "callws_unavailable": "This frontend version does not expose hass.callWS.",
            "invalid_response_action": "Invalid response action: {entity}",
            "no_title_selected": "No title is selected.",
            "looking_up_exact_link": "Looking up exact title link…",
            "waking_screensaver": "Waking TV from screensaver…",
            "screensaver_fallback": "Screensaver is still active; sending HOME…",
            "turning_on_tv": "Turning on TV…",
            "watchmode_http": "Watchmode returned HTTP {status}.",
            "watchmode_bad_response": "Watchmode returned a response I could not interpret.",
            "watchmode_not_list": "Watchmode did not return a source list.",
            "watchmode_no_provider_link": "Watchmode did not find a {provider} link for this title in {region}.",
            "opening_and_preparing": "Opening {source} and preparing profile {profile}…",
            "waiting_profile_session": "{source}: waiting for the profile session…",
            "using_current_session": "{source} is already open; using the current session…",
            "opening_title": "Opening title in {provider}…",
            "title_opened_play": "Title opened · PLAY in {seconds}s…",
            "title_link_sent": "Title link sent to the TV",
            "title_open_failed": "Could not open the title: {error}",
            "title_fallback": "Could not open the exact title; opening {provider} as fallback…",
            "page_open_failed": "Could not open the page: {error}",
            "who_is_watching": "Who’s watching?",
            "loading_details": "Loading details…",
            "open_app": "Open app",
            "open_title": "Open title",
            "open_on_tv": "Open on TV",
            "season": "Season",
            "episode": "Episode",
            "episodes": "Episodes",
            "choose_episode": "Select an episode to view streaming sources.",
            "loading_episodes": "Loading episodes…",
            "no_episodes": "No episodes were reported for this season.",
            "episode_load_error": "Could not load episodes: {error}",
            "episode_link_note": "Episode links are shown only when available for the selected episode.",
            "install_episode_backend": "Install the independent Streaming Browser Episode Links component and restart Home Assistant.",
            "no_exact_episode_links": "No exact episode links were returned for this episode and region.",
            "open_this_device": "Open on this device",
            "local_link_loading": "Looking up title link…",
            "local_link_missing": "No exact provider link is available for this title.",
            "local_device_hint": "Open the provider link on this device; the app or website used depends on your device.",
            "title_play": "Title + Play",
            "no_providers": "No providers were reported for your region.",
            "app_not_found": "App not found on the target device",
            "no_synopsis": "No synopsis available.",
            "active_profile": "Active profile:",
            "where_to_watch": "Where to watch in",
            "open_availability": "Open availability in LG browser",
            "detail_note": "<b>Open app</b> uses the standard LG webOS integration. <b>Open title</b> uses Watchmode with the TMDB ID and sends the exact provider link to the LG. <b>Title + Play</b> does the same and then sends PLAY. If webOS or the app rejects the link, the card opens the app as a fallback.",
            "movie": "Movie",
            "series": "Series",
            "loading": "Loading…",
            "empty_selection": "No titles found for this selection.",
            "search_placeholder": "Search movies or series…",
            "movies": "Movies",
            "tv_series": "Series",
            "no_source_list": "I can’t see <code>source_list</code> on your TV entity. Turn on the TV and verify the Sources exposed by the LG webOS integration.",
            "loading_catalog": "Loading catalog…",
            "none": "none",
            "footer_note": "“Open app” keeps the profile/PIN flow. “Open title” and “Title + Play” use Watchmode to find the exact title link and send it to the LG."
      },
      "es": {
            "profile_update_failed": "No pude actualizar {entity}: {error}",
            "tmdb_key_rejected": "TMDB rechazó la API key. Usa la API key v3 corta, no el token v4.",
            "trending": "Tendencias",
            "all_sources": "Todas las fuentes",
            "genre": "Género",
            "all_genres": "Todos los géneros",
            "popular": "Populares",
            "now_playing": "En cartelera",
            "top_rated": "Mejor valoradas",
            "upcoming": "Próximamente",
            "on_air": "En emisión",
            "airing_today": "Episodios hoy",
            "recent_releases": "Estrenos recientes",
            "search_results": "Resultados para “{query}”",
            "scroll_left": "Desplazar a la izquierda",
            "scroll_right": "Desplazar a la derecha",
            "reopening_app": "Reabriendo {source}…",
            "opening_app": "Abriendo {source}…",
            "play_in": "PLAY en {seconds}s…",
            "play_sent_to": "▶ PLAY enviado a {source}",
            "app_opened": "{source} abierto{profile}",
            "play_sent": "▶ PLAY enviado",
            "opening_availability": "Abriendo disponibilidad en el navegador de la TV…",
            "provider_unavailable": "Ese proveedor no está disponible para este tipo de contenido.",
            "load_more_failed": "No pude cargar más títulos: {error}",
            "preparing_profile": "{source}: preparando perfil {profile}…",
            "navigation_missing": "El perfil {profile} usa navigation para {source}, pero no tiene sequence.",
            "selecting_profile": "{source}: seleccionando perfil {profile}…",
            "netflix_adb_required": "La selección automática de perfil de Netflix en Android TV requiere una entidad media_player de Android Debug Bridge.",
            "netflix_profile_position_invalid": "La posición del perfil de Netflix para {profile} debe estar entre 1 y 5.",
            "netflix_title_id_missing": "No pude extraer el ID del título de Netflix del enlace del proveedor.",
            "unlocking_profile": "{source}: desbloqueando perfil {profile}…",
            "command_missing": "El perfil {profile} usa command para {source}, pero no tiene command.",
            "applying_profile": "{source}: aplicando perfil {profile}…",
            "unknown_profile_mode": "profile mode desconocido: {mode}",
            "app_match_failed": "No pude relacionar “{provider}” con una app del LG.",
            "profile_prefix": "perfil {profile} · ",
            "profile_suffix": " · perfil {profile}",
            "app_open_failed": "No se pudo abrir {source}: {error}",
            "callws_unavailable": "Esta versión del frontend no expone hass.callWS.",
            "invalid_response_action": "Acción inválida para respuesta: {entity}",
            "no_title_selected": "No hay un título seleccionado.",
            "looking_up_exact_link": "Buscando enlace exacto del título…",
            "waking_screensaver": "Activando TV desde el salvapantallas…",
            "screensaver_fallback": "El salvapantallas sigue activo; enviando HOME…",
            "turning_on_tv": "Encendiendo TV…",
            "watchmode_http": "Watchmode respondió HTTP {status}.",
            "watchmode_bad_response": "Watchmode devolvió una respuesta que no pude interpretar.",
            "watchmode_not_list": "Watchmode no devolvió una lista de fuentes.",
            "watchmode_no_provider_link": "Watchmode no encontró un enlace de {provider} para este título en {region}.",
            "opening_and_preparing": "Abriendo {source} y preparando perfil {profile}…",
            "waiting_profile_session": "{source}: esperando sesión del perfil…",
            "using_current_session": "{source} ya está abierto; usando la sesión actual…",
            "opening_title": "Abriendo título en {provider}…",
            "title_opened_play": "Título abierto · PLAY en {seconds}s…",
            "title_link_sent": "Enlace del título enviado al LG",
            "title_open_failed": "No se pudo abrir el título: {error}",
            "title_fallback": "No pude abrir el título exacto; abriendo {provider} como respaldo…",
            "page_open_failed": "No se pudo abrir la página: {error}",
            "who_is_watching": "¿Quién está viendo?",
            "loading_details": "Cargando detalles…",
            "open_app": "Abrir app",
            "open_title": "Abrir título",
            "open_on_tv": "Abrir en TV",
            "season": "Temporada",
            "episode": "Episodio",
            "episodes": "Episodios",
            "choose_episode": "Selecciona un episodio para ver las plataformas disponibles.",
            "loading_episodes": "Cargando episodios…",
            "no_episodes": "No hay episodios reportados para esta temporada.",
            "episode_load_error": "No se pudieron cargar los episodios: {error}",
            "episode_link_note": "Se muestran enlaces únicamente cuando están disponibles para el episodio seleccionado.",
            "install_episode_backend": "Instala el componente independiente Streaming Browser Episode Links y reinicia Home Assistant.",
            "no_exact_episode_links": "No se encontraron enlaces directos para este episodio y región.",
            "open_this_device": "Abrir en este dispositivo",
            "local_link_loading": "Buscando enlace del título…",
            "local_link_missing": "No hay un enlace exacto de este proveedor para el título.",
            "local_device_hint": "Abre el enlace del proveedor en este dispositivo; la app o el sitio utilizado depende del dispositivo.",
            "title_play": "Título + Play",
            "no_providers": "No hay proveedores reportados para tu región.",
            "app_not_found": "App no encontrada en el dispositivo",
            "no_synopsis": "Sin sinopsis disponible.",
            "active_profile": "Perfil activo:",
            "where_to_watch": "Dónde verla en",
            "open_availability": "Abrir disponibilidad en navegador del LG",
            "detail_note": "<b>Abrir app</b> usa la integración LG webOS normal. <b>Abrir título</b> consulta Watchmode usando el TMDB ID y envía el enlace exacto del proveedor al LG. <b>Título + Play</b> hace lo mismo y después envía PLAY. Si webOS o la app no aceptan el enlace, el card vuelve a abrir la app como respaldo.",
            "movie": "Película",
            "series": "Serie",
            "loading": "Cargando…",
            "empty_selection": "No encontré títulos para esta selección.",
            "search_placeholder": "Buscar película o serie…",
            "movies": "Películas",
            "tv_series": "Series",
            "no_source_list": "No veo <code>source_list</code> en la entidad de tu TV. Enciende la TV y verifica las Sources de la integración LG webOS.",
            "loading_catalog": "Cargando catálogo…",
            "none": "ninguno",
            "footer_note": "“Abrir app” conserva el flujo de perfil/PIN. “Abrir título” y “Título + Play” usan Watchmode para buscar el enlace exacto del título y enviarlo al LG."
      }
};

    let value =
      strings[this._locale()]?.[key] ??
      strings.es[key] ??
      key;

    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(
        "{" + name + "}",
        String(replacement ?? "")
      );
    }

    return value;
  }

  async _toggleNuvioRemote() {
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
          /* Nuvio-inspired remote layout v0.4.81 */
          .sbr-remote {
            position:fixed;z-index:100500;top:max(10px,env(safe-area-inset-top));
            ${right ? "right" : "left"}:max(10px,env(safe-area-inset-${right ? "right" : "left"}));
            box-sizing:border-box;width:min(390px,calc(100vw - 20px));
            max-height:calc(100dvh - 20px);overflow-y:auto;overscroll-behavior:contain;
            padding:20px;border:1px solid #414145;border-radius:30px;
            color:#fff;background:#202022;box-shadow:0 16px 48px #000b;
            font:500 15px/1.3 system-ui,sans-serif;
          }
          .sbr-remote button {font:inherit;cursor:pointer;color:#fff;background:#303033;
            border:1px solid #3b3b40;transition:background .12s ease,transform .12s ease}
          .sbr-remote button:active {background:#47474e;transform:scale(.98)}
          .sbr-remote button:focus-visible {outline:2px solid var(--primary-color,#58a6ff);outline-offset:3px}
          .sbr-head {display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px}
          .sbr-head-title {font-size:22px;font-weight:750;line-height:1.2}
          .sbr-head-subtitle {font-size:11px;opacity:.65;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:245px}
          .sbr-x {width:52px;height:52px;min-height:52px!important;flex:none;
            display:grid;place-items:center;border:0!important;border-radius:50%!important;
            font-size:36px!important;font-weight:600!important;line-height:1;background:#303033!important}
          .sbr-wake {display:flex;align-items:center;justify-content:center;gap:12px;width:100%;
            min-height:58px;border:0!important;border-radius:35px!important;font-size:19px!important}
          .sbr-wake ha-icon {--mdc-icon-size:22px}
          .sbr-pad {width:min(300px,100%);aspect-ratio:1;position:relative;margin:20px auto 22px;
            border-radius:50%;background:#35353b;box-shadow:inset 0 0 0 2px #ffffff0b}
          .sbr-pad .sbr-dir {position:absolute;display:grid;place-items:center;
            width:34%;height:34%;min-height:0;border:0;border-radius:50%;background:transparent;padding:0}
          .sbr-pad .sbr-dir ha-icon {--mdc-icon-size:45px}
          .sbr-pad .sbr-up {top:0;left:33%}
          .sbr-pad .sbr-down {bottom:0;left:33%}
          .sbr-pad .sbr-left {top:33%;left:0}
          .sbr-pad .sbr-right {top:33%;right:0}
          .sbr-pad .sbr-ok {position:absolute;top:28%;left:28%;width:44%;height:44%;min-height:0;
            display:grid;place-items:center;border:0;border-radius:50%;background:#2c2c30;
            font-size:23px;font-weight:750;box-shadow:0 0 0 10px #2b2b3055}
          .sbr-pad .sbr-dir:active {background:#ffffff1c}
          .sbr-numbers {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
          .sbr-numbers button {min-width:0;min-height:62px;border-radius:20px;font-size:27px;font-weight:650}
          .sbr-numbers .sbr-key-secondary {font-size:21px;opacity:.9}
          .sbr-navigation {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:15px 0}
          .sbr-navigation button {display:flex;align-items:center;justify-content:center;gap:9px;
            min-width:0;min-height:61px;border-radius:24px;font-size:17px}
          .sbr-navigation ha-icon {--mdc-icon-size:21px}
          .sbr-actions {display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;
            padding-top:13px;border-top:1px solid #ffffff1d;margin-top:9px}
          .sbr-actions .sbr-icon-btn {display:grid;place-items:center;min-width:0;
            min-height:49px;padding:8px 0;border-radius:15px}
          .sbr-actions .sbr-icon-btn ha-icon {--mdc-icon-size:23px}
          @media(max-width:360px) {
            .sbr-remote {padding:14px;border-radius:22px}
            .sbr-pad {width:min(252px,100%);margin:14px auto}
            .sbr-numbers {gap:7px}
            .sbr-numbers button {min-height:54px}
          }
          /* Compact Nuvio-sized remote v0.4.82 */
          .sbr-remote {
            top:max(10px,env(safe-area-inset-top));
            width:176px;max-width:calc(100vw - 20px);
            max-height:calc(100dvh - 20px);overflow-y:auto;
            padding:12px;border-radius:24px;font:500 12px/1.25 Roboto,Arial,sans-serif;
          }
          .sbr-head {gap:5px;margin:0 0 10px}
          .sbr-head-title {font-size:13px;line-height:1.2}
          .sbr-head-subtitle {font-size:9px;max-width:104px;margin-top:2px}
          .sbr-x {width:30px;height:30px;min-height:30px!important;font-size:21px!important}
          .sbr-wake {min-height:36px;gap:7px;border-radius:18px!important;font-size:12px!important}
          .sbr-wake ha-icon {--mdc-icon-size:17px}
          .sbr-pad {width:132px;max-width:100%;margin:12px auto;
            background:radial-gradient(circle at center,#2c2c2e 0 34%,#35353a 35% 100%)}
          .sbr-pad .sbr-dir ha-icon {--mdc-icon-size:32px}
          .sbr-pad .sbr-ok {font-size:11px;box-shadow:0 0 0 3px #2b2b3055}
          .sbr-numbers {gap:7px}
          .sbr-numbers button {min-height:36px;border-radius:12px;font-size:16px}
          .sbr-numbers .sbr-key-secondary {font-size:16px}
          .sbr-navigation {gap:8px;margin:10px 0 0}
          .sbr-navigation button {min-height:40px;border-radius:14px;gap:4px;font-size:12px}
          .sbr-navigation ha-icon {--mdc-icon-size:15px}
          .sbr-actions {grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;
            margin:10px 0 0;padding-top:10px}
          .sbr-actions .sbr-icon-btn {min-height:36px;padding:5px 0;border-radius:12px}
          .sbr-actions .sbr-icon-btn ha-icon {--mdc-icon-size:21px}
          /* Back and Home remain at the bottom, after Streaming Browser's extra controls. */
          .sbr-remote {display:flex;flex-direction:column}
          .sbr-navigation {order:5}
          .sbr-actions {order:4}
          @media(max-width:700px) {
            .sbr-remote {width:166px;padding:11px;border-radius:24px}
            .sbr-pad {width:122px;max-width:100%;margin:12px auto}
            .sbr-numbers {gap:7px}
            .sbr-numbers button {min-height:36px}
          }
        </style>
        <section class="sbr-remote" role="dialog" aria-label="TV Remote">
          <header class="sbr-head">
            <div><div class="sbr-head-title">${this._locale() === "es" ? "Control remoto" : "TV Remote"}</div>
              <div class="sbr-head-subtitle">${this._esc(this._hass?.states?.[this._config.tv_entity]?.attributes?.friendly_name || this._config.tv_entity || "")}</div></div>
            <button type="button" class="sbr-x" data-close-remote aria-label="Close remote">×</button>
          </header>
          <button type="button" class="sbr-wake" data-remote="WAKE" title="Wake" aria-label="Wake">
            <ha-icon icon="mdi:sleep-off"></ha-icon>${this._locale() === "es" ? "Despertar" : "Wake"}</button>
          <div class="sbr-pad" role="group" aria-label="Directional pad">
            <button type="button" class="sbr-dir sbr-up" data-remote="UP" title="Up" aria-label="Up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <button type="button" class="sbr-dir sbr-left" data-remote="LEFT" title="Left" aria-label="Left"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <button type="button" class="sbr-ok" data-remote="ENTER" title="OK" aria-label="OK">OK</button>
            <button type="button" class="sbr-dir sbr-right" data-remote="RIGHT" title="Right" aria-label="Right"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button type="button" class="sbr-dir sbr-down" data-remote="DOWN" title="Down" aria-label="Down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
          </div>
          <div class="sbr-numbers" role="group" aria-label="Number pad">
            ${[1,2,3,4,5,6,7,8,9,"⌫",0,"↵"].map((n) => `<button type="button" class="${n === "⌫" || n === "↵" ? "sbr-key-secondary" : ""}"
              data-remote="${n === "⌫" ? "BACK" : n === "↵" ? "ENTER" : n}"
              title="${n === "⌫" ? "Backspace" : n === "↵" ? "Enter" : n}"
              aria-label="${n === "⌫" ? "Backspace" : n === "↵" ? "Enter" : n}">${n}</button>`).join("")}
          </div>
          <div class="sbr-navigation" role="group" aria-label="Navigation">
            <button type="button" data-remote="BACK" title="Back" aria-label="Back"><ha-icon icon="mdi:arrow-left"></ha-icon>${this._locale() === "es" ? "Atrás" : "Back"}</button>
            <button type="button" data-remote="HOME" title="Home" aria-label="Home"><ha-icon icon="mdi:home-outline"></ha-icon>${this._locale() === "es" ? "Inicio" : "Home"}</button>
          </div>
          <div class="sbr-actions" role="group" aria-label="Playback and volume">
            <button type="button" class="sbr-icon-btn" data-remote="PLAY" title="Play" aria-label="Play"><ha-icon icon="mdi:play"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="PAUSE" title="Pause" aria-label="Pause"><ha-icon icon="mdi:pause"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="MUTE" title="Mute" aria-label="Mute"><ha-icon icon="mdi:volume-mute"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="VOLUME_DOWN" title="Volume down" aria-label="Volume down"><ha-icon icon="mdi:volume-minus"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="VOLUME_UP" title="Volume up" aria-label="Volume up"><ha-icon icon="mdi:volume-plus"></ha-icon></button>
          </div>
        </section>`;
      portal.querySelector("[data-close-remote]")?.addEventListener("click", () => this._toggleNuvioRemote());
      portal.querySelectorAll("[data-remote]").forEach((button) => button.addEventListener("click", async () => {
        try {
          const key = button.dataset.remote;
          if (key === "WAKE") await this._ensureTvOn();
          else if (key === "MUTE" || key === "VOLUME_UP" || key === "VOLUME_DOWN") {
            // Roku TV volume/mute uses ECP remote keys; an external HDMI player
            // uses the configured display TV's Home Assistant volume services.
            if (this._platform() === "roku" && !this._config.display_entity) {
              await this._sendRemoteButton(key);
              return;
            }
            const volumeEntity = this._config.display_entity || this._config.tv_entity;
            if (key === "MUTE") {
              const muted = this._hass.states?.[volumeEntity]?.attributes?.is_volume_muted;
              await this._hass.callService("media_player", "volume_mute", {
                entity_id: volumeEntity, is_volume_muted: muted !== true
              });
            } else {
              await this._hass.callService("media_player",
                key === "VOLUME_UP" ? "volume_up" : "volume_down",
                { entity_id: volumeEntity });
            }
          } else await this._sendRemoteButton(key);
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

  _updateNuvioRemoteButton() {
    this.shadowRoot?.querySelectorAll(".streaming-remote-toggle").forEach((button) => {
      button.setAttribute("aria-pressed", String(this._remoteExpanded));
      button.style.background = this._remoteExpanded
        ? "var(--primary-color)" : "var(--secondary-background-color)";
      button.style.color = this._remoteExpanded ? "white" : "var(--primary-text-color)";
    });
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

  _selectedProviderIds() {
    const values =
      this._config?.selected_provider_ids;

    if (!Array.isArray(values)) {
      return new Set(
        STREAMING_BROWSER_BACKEND
          .defaultProviderIds
          .map((id) => String(id))
      );
    }

    return new Set(
      values
        .map((id) => String(id))
        .filter(Boolean)
    );
  }

  _isSelectedTmdbProvider(provider) {
    return this._selectedProviderIds().has(
      String(provider?.provider_id)
    );
  }

  _fallbackProfiles() {
    return STREAMING_BROWSER_BACKEND
      .fallbackProfiles;
  }

  _profileNames() {
    const helper =
      this._config?.profile_entity
        ? this._hass?.states?.[
            this._config.profile_entity
          ]
        : null;

    const helperOptions =
      helper?.attributes?.options;

    if (
      Array.isArray(helperOptions) &&
      helperOptions.length
    ) {
      return helperOptions
        .map((name) => String(name))
        .filter(Boolean);
    }

    const configured =
      Object.keys(
        this._config?.profiles || {}
      );

    if (configured.length) {
      return configured;
    }

    return this._fallbackProfiles()
      .map((profile) => profile.name);
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
          this._t("profile_update_failed", { entity: entityId, error: this._formatError(err) })
        );
      }
    }

    this._render();
  }

  _currentProfileConfigForName(name) {
    const configured =
      this._config?.profiles?.[name];

    if (configured) {
      return {
        icon: configured.icon,
        picture: configured.picture,
      };
    }

    return (
      this._fallbackProfiles().find(
        (profile) =>
          profile.name === name
      ) || {}
    );
  }

  _currentProfileConfig() {
    if (!this._selectedProfile) {
      return null;
    }

    const configured =
      this._config?.profiles?.[
        this._selectedProfile
      ];

    if (configured) {
      return {
        icon: configured.icon,
        picture: configured.picture,
      };
    }

    return (
      this._fallbackProfiles().find(
        (profile) =>
          profile.name ===
          this._selectedProfile
      ) || null
    );
  }

  // ---------------------------------------------------------------------------
  // TMDB
  // ---------------------------------------------------------------------------

  _apiUrl(path, params = {}) {
    const q = new URLSearchParams({
      api_key: this._config.tmdb_api_key,
      language: this._languageCode(),
      ...params,
    });

    return `https://api.themoviedb.org/3${path}?${q.toString()}`;
  }

  async _api(path, params = {}, { signal } = {}) {
    const res = await fetch(this._apiUrl(path, params), { signal });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          this._t("tmdb_key_rejected")
        );
      }

      throw new Error(`TMDB request failed (${res.status})`);
    }

    return res.json();
  }

  async _apiWithTimeout(path, params = {}, timeoutMs = 12000) {
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

  // Pull localized genre names from TMDB; film and television IDs differ.
  // A failure here must never prevent the selected provider catalog from loading.
  async _loadGenreLists() {
    const modes = ["movie", "tv"];
    const results = await Promise.allSettled(
      modes.map((mode) => this._apiWithTimeout(`/genre/${mode}/list`, {}, 8000))
    );
    modes.forEach((mode, index) => {
      if (results[index].status !== "fulfilled") return;
      const list = results[index].value?.genres;
      if (!Array.isArray(list)) return;
      this._genres[mode] = list.filter((genre) =>
        Number.isInteger(Number(genre.id)) && Number(genre.id) > 0 &&
        typeof genre.name === "string" && genre.name.trim()
      ).map((genre) => ({ id: String(genre.id), name: genre.name.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name, this._languageCode()));
    });
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

    if (this._platform() === "android_tv") {
      if (overrides[providerName]) {
        return overrides[providerName];
      }

      const normalizedOverride = Object.entries(overrides).find(
        ([key]) => this._norm(key) === this._norm(providerName)
      );

      if (normalizedOverride) {
        return normalizedOverride[1];
      }

      const links = {
        ...this._defaultAndroidAppLinks(),
        ...(this._config.android_app_links || {}),
      };

      const aliases = this._providerAliases(providerName);

      const match = Object.keys(links).find((name) => {
        const key = this._norm(name);
        return aliases.some(
          (alias) =>
            alias &&
            (key === alias ||
              key.includes(alias) ||
              alias.includes(key))
        );
      });

      return match || providerName;
    }

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
        .filter((provider) =>
          this._isSelectedTmdbProvider(
            provider
          )
        )
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

    this._ensureSelectedProvider();
  }

  _catalogProviderIds() {
    return (
      this._matchedProviders[
        this._mode
      ] || []
    )
      .map((provider) =>
        String(
          provider.provider_id
        )
      )
      .filter(Boolean);
  }

  _ensureSelectedProvider() {
    if (this._provider == null || this._provider === "") {
      this._provider = "all";
    }
  }

  // ---------------------------------------------------------------------------
  // Browse / search
  // ---------------------------------------------------------------------------

  _catalogDefinitions() {
    const mode = this._mode;
    const region = this._config.region;
    const today = new Date().toISOString().slice(0, 10);

    this._ensureSelectedProvider();

    const providers =
      this._matchedProviders[mode] || [];

    const providerIds =
      this._provider === "all"
        ? providers
            .map((item) =>
              String(
                item.provider_id
              )
            )
            .filter(Boolean)
        : [
            String(
              this._provider || ""
            ),
          ].filter(Boolean);

    if (!providerIds.length) {
      throw new Error(
        this._t("provider_unavailable")
      );
    }

    const provider =
      this._provider === "all"
        ? null
        : providers.find(
            (item) =>
              String(
                item.provider_id
              ) ===
              String(this._provider)
          );

    if (this._provider !== "all" && !provider) {
      return [];
    }

    const base = {
      watch_region: region,
      /*
       * TMDB treats pipe-separated provider IDs as OR logic.
       * All sources therefore returns titles available on any
       * of the selected/matched platforms.
       */
      with_watch_providers:
        providerIds.join("|"),
      with_watch_monetization_types:
        "flatrate",
      include_adult: "false",
      // TMDB applies this genre server-side before paginating the catalog.
      ...(this._genreByMode[mode] !== "all"
        ? { with_genres: this._genreByMode[mode] } : {}),
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
        labelKey: "popular",
        path: `/discover/${mode}`,
        params: {
          ...base,
          sort_by: "popularity.desc",
        },
      },
      {
        key: "provider-top-rated",
        labelKey: "top_rated",
        path: `/discover/${mode}`,
        params: {
          ...base,
          sort_by: "vote_average.desc",
          "vote_count.gte": "50",
        },
      },
      {
        key: "provider-recent",
        labelKey: "recent_releases",
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
          if (!["movie", "tv"].includes(item.media_type)) return false;
          const genre = this._genreByMode[section.mediaType || this._mode] || "all";
          if (genre === "all") return true; // Keep the existing global search.
          return item.media_type === (section.mediaType || this._mode) &&
            Array.isArray(item.genre_ids) &&
            item.genre_ids.some((id) => String(id) === genre);
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
    const request = ++this._browseRequest;

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

      if (request !== this._browseRequest) return;
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
      if (request !== this._browseRequest) return;
      this._error = this._formatError(err);
      this._sections = [];
    } finally {
      if (request === this._browseRequest) {
        this._loading = false;
        this._render();
      }
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
        this._t("load_more_failed", { error: this._formatError(err) })
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
    const request = ++this._browseRequest;

    this._loading = true;
    this._error = "";
    this._sections = [];
    this._render();

    try {
      const definition = {
        key: "search",
        labelKey: "search_results",
        labelVars: { query: q },
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
      if (request !== this._browseRequest) return;
      this._sections = section.items.length ? [section] : [];
    } catch (err) {
      if (request !== this._browseRequest) return;
      this._error = this._formatError(err);
      this._sections = [];
    } finally {
      if (request === this._browseRequest) {
        this._loading = false;
        this._render();
      }
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

  // Link and provider updates reuse the current popup and its scroll container.
  _refreshDetailsInPlace(detail) {
    if (this._details !== detail || detail.loading || detail.error) return;
    const pane = this.shadowRoot?.querySelector(".detail");
    const previousBody = pane?.querySelector(".body");
    if (!previousBody) { this._render(); return; }
    const oldScrollTop = pane.scrollTop;
    const previousActive = previousBody.querySelector(".episode-row.active");
    const activeTop = previousActive?.getBoundingClientRect().top;
    const previousEpisode = previousActive?.dataset.episodeIndex;
    const template = document.createElement("template");
    template.innerHTML = this._renderDetails().trim();
    const updatedBody = template.content.querySelector(".detail .body");
    if (!updatedBody) return;
    previousBody.replaceWith(updatedBody);
    // Preserve the selected episode's location even when its links expand.
    const nextActive = previousEpisode === undefined ? null :
      updatedBody.querySelector(`.episode-row.active[data-episode-index="${previousEpisode}"]`);
    if (nextActive && Number.isFinite(activeTop)) {
      pane.scrollTop = oldScrollTop + nextActive.getBoundingClientRect().top - activeTop;
    } else {
      pane.scrollTop = oldScrollTop;
    }
    this._bindDetailBodyActions(updatedBody);
  }

  _bindDetailBodyActions(root) {
    root.querySelectorAll("[data-open-provider]").forEach((element) =>
      element.addEventListener("click", () =>
        this._launchProvider(element.dataset.openProvider, false)));
    root.querySelectorAll("[data-season]").forEach((element) =>
      element.addEventListener("click", () => {
        const detail = this._details;
        if (detail) void this._loadSeasonEpisodes(detail, Number(element.dataset.season));
      }));
    root.querySelectorAll("[data-episode-index]").forEach((element) =>
      element.addEventListener("click", () => {
        const detail = this._details;
        if (detail) this._selectEpisode(detail, Number(element.dataset.episodeIndex));
      }));
    root.querySelectorAll("[data-title-provider]").forEach((element) =>
      element.addEventListener("click", () =>
        this._openExactTitle(element.dataset.titleProvider, false)));
    root.querySelectorAll("[data-title-play-provider]").forEach((element) =>
      element.addEventListener("click", () =>
        this._openExactTitle(element.dataset.titlePlayProvider, true)));
    const watchPage = root.querySelector("[data-watch-page]");
    if (watchPage) watchPage.addEventListener("click", () => this._openWatchPage());
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
        this._refreshDetailsInPlace(detail);
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
        const data = await this._apiWithTimeout(`/tv/${detail.item.id}/season/${season}`, {}, 12000);
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
        this._refreshDetailsInPlace(detail);
      }
    }
  }

  _selectEpisode(detail, index) {
    if (this._details !== detail || detail.episodesLoading) return;
    const episode = detail.episodes?.[index];
    if (!episode) return;
    detail.selectedEpisode = episode;
    detail.episodeSources = [];
    detail.episodeSourcesError = "";
    detail.episodeSourcesLoading = true;
    this._refreshDetailsInPlace(detail);
    void this._loadIndependentEpisodeLinks(detail, episode);
  }

  async _loadIndependentEpisodeLinks(detail, episode) {
    const season = Number(detail.selectedSeason);
    const number = Number(episode.episode_number);
    try {
      const response = await this._withTimeout(this._hass.callWS({
        type: "streaming_browser/episode_links",
        tmdb_id: Number(detail.item.id),
        title: String(detail.details?.name || detail.item.name || ""),
        season, episode: number,
        region: this._config.region || "MX",
        language: this._languageCode(),
      }), 12000, "Episode provider lookup");
      if (this._details !== detail || detail.selectedEpisode !== episode ||
          Number(detail.selectedSeason) !== season) return;
      detail.episodeSources = (Array.isArray(response?.links) ? response.links : [])
        .filter((link) => link?.scope === "episode" &&
          Number(link.season) === season && Number(link.episode) === number &&
          typeof link.web_url === "string" && /^https:\/\//i.test(link.web_url));
    } catch (err) {
      if (this._details !== detail || detail.selectedEpisode !== episode) return;
      detail.episodeSources = [];
      detail.episodeSourcesError = this._formatError(err);
    } finally {
      if (this._details === detail && detail.selectedEpisode === episode) {
        detail.episodeSourcesLoading = false;
        this._refreshDetailsInPlace(detail);
      }
    }
  }

  async _primeLocalTitleLinks(detail) {
    try {
      detail.localSources = await this._withTimeout(
        this._watchmodeSourcesForCurrentTitle({ silent: true }), 12000, "Movie provider lookup");
    } catch (err) {
      detail.localSources = [];
      detail.localSourceError = this._formatError(err);
    } finally {
      detail.localSourcesLoading = false;
      // Never replace the scrollable popup when a movie link finishes.
      if (this._details === detail) this._refreshDetailsInPlace(detail);
    }
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

    const selectedIds =
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
      .filter((provider) =>
        selectedIds.has(
          String(
            provider.provider_id
          )
        )
      );
  }

  // ---------------------------------------------------------------------------
  // Profile config lookup
  // ---------------------------------------------------------------------------

  _backendProfilePosition() {
    const names = this._profileNames();

    const index =
      names.indexOf(
        this._selectedProfile
      );

    return Math.max(1, index + 1);
  }

  _horizontalProfileSequence(
    position,
    afterSelectDelayMs
  ) {
    const sequence = [];

    for (let i = 0; i < 6; i += 1) {
      sequence.push({
        button: "LEFT",
        wait_ms: 250,
      });
    }

    for (let i = 1; i < position; i += 1) {
      sequence.push({
        button: "RIGHT",
        wait_ms: 300,
      });
    }

    sequence.push({
      button: "ENTER",
      wait_ms: afterSelectDelayMs,
    });

    return sequence;
  }

  _verticalProfileSequence(
    position,
    afterSelectDelayMs
  ) {
    const sequence = [];

    for (let i = 0; i < 6; i += 1) {
      sequence.push({
        button: "UP",
        wait_ms: 250,
      });
    }

    for (let i = 1; i < position; i += 1) {
      sequence.push({
        button: "DOWN",
        wait_ms: 300,
      });
    }

    sequence.push({
      button: "ENTER",
      wait_ms: afterSelectDelayMs,
    });

    return sequence;
  }

  _findProfileAppConfig(providerName, source) {
    const position =
      this._backendProfilePosition();

    if (
      this._isNetflixProvider(
        providerName,
        source
      )
    ) {
      const rule =
        STREAMING_BROWSER_BACKEND
          .profileRules.netflix;

      return {
        mode: "netflix",
        profile_position: position,
        launch_delay_ms:
          rule.launchDelayMs,
        step_delay_ms:
          rule.stepDelayMs,
        after_select_delay_ms:
          rule.afterSelectDelayMs,
      };
    }

    const aliases = new Set([
      ...this._providerAliases(
        providerName
      ),
      ...this._providerAliases(
        source
      ),
    ]);

    const isDisney =
      [...aliases].some(
        (alias) =>
          alias &&
          alias.includes("disney")
      );

    if (isDisney) {
      const rule =
        STREAMING_BROWSER_BACKEND
          .profileRules.disney;

      return {
        mode: "navigation",
        launch_delay_ms:
          rule.launchDelayMs,
        step_delay_ms:
          rule.stepDelayMs,
        exact_title_profile_first:
          true,
        exact_title_after_profile_delay_ms:
          rule.afterSelectDelayMs,
        sequence:
          this._horizontalProfileSequence(
            position,
            rule.afterSelectDelayMs
          ),
      };
    }

    const isPrime =
      [...aliases].some(
        (alias) =>
          alias &&
          (
            alias.includes("amazonprimevideo") ||
            alias.includes("primevideo") ||
            alias === "prime"
          )
      );

    if (isPrime) {
      const rule =
        STREAMING_BROWSER_BACKEND
          .profileRules.prime;

      return {
        mode: "navigation",
        launch_delay_ms:
          rule.launchDelayMs,
        step_delay_ms:
          rule.stepDelayMs,
        exact_title_profile_first:
          true,
        exact_title_after_profile_delay_ms:
          rule.afterSelectDelayMs,
        sequence:
          this._verticalProfileSequence(
            position,
            rule.afterSelectDelayMs
          ),
      };
    }

    return {
      mode: "remember",
    };
  }

  _isNetflixProvider(providerName, source = "") {
    const aliases = new Set([
      ...this._providerAliases(providerName),
      ...this._providerAliases(source),
    ]);

    return [...aliases].some(
      (alias) => alias && alias.includes("netflix")
    );
  }

  _profileModeFor(providerName, source) {
    const configured =
      this._findProfileAppConfig(providerName, source)?.mode ||
      "remember";

    if (configured === "netflix") {
      return "netflix";
    }

    if (
      configured === "remember" &&
      this._config?.netflix_profile_autoselect !== false &&
      this._isNetflixProvider(providerName, source)
    ) {
      return "netflix";
    }

    return configured;
  }

  // ---------------------------------------------------------------------------
  // webOS controls / profile execution
  // ---------------------------------------------------------------------------

  _platform() {
    const platform = this._config?.platform;
    return platform === "android_tv" || platform === "roku"
      ? platform
      : "webos";
  }

  _remoteState() {
    const entityId = this._config?.remote_entity;
    return entityId ? this._hass?.states?.[entityId] : null;
  }

  _androidActivity() {
    return String(
      this._remoteState()?.attributes?.current_activity ||
      this._tvState()?.attributes?.app_id ||
      this._tvState()?.attributes?.source ||
      ""
    );
  }

  _isScreensaverActive(tv = this._tvState()) {
    if (!tv) return false;

    const values = [
      tv?.attributes?.source,
      tv?.attributes?.app_name,
      tv?.attributes?.app_id,
      tv?.attributes?.media_title,
      tv?.attributes?.media_content_id,
      this._androidActivity(),
    ]
      .filter((value) => value != null)
      .map((value) => String(value).toLowerCase());

    return values.some((value) =>
      ["screensaver", "screen saver", "ambient", "dream"]
        .some((needle) => value.includes(needle))
    );
  }

  _androidCommand(button) {
    const map = {
      UP: "DPAD_UP",
      DOWN: "DPAD_DOWN",
      LEFT: "DPAD_LEFT",
      RIGHT: "DPAD_RIGHT",
      ENTER: "DPAD_CENTER",
      CENTER: "DPAD_CENTER",
      PLAY: this._config?.android_play_command || "DPAD_CENTER",
      HOME: "HOME",
      BACK: "BACK",
    };

    return map[String(button || "").toUpperCase()] || button;
  }

  _androidAdbEntity() {
    if (this._config?.adb_entity) {
      return this._config.adb_entity;
    }

    const tv = this._tvState();

    if (
      tv?.attributes &&
      Object.prototype.hasOwnProperty.call(
        tv.attributes,
        "adb_response"
      )
    ) {
      return this._config?.tv_entity || null;
    }

    return null;
  }

  _androidAdbState() {
    const entityId = this._androidAdbEntity();
    return entityId ? this._hass?.states?.[entityId] : null;
  }

  async _androidAdbCommand(command) {
    const entityId = this._androidAdbEntity();

    if (!entityId) {
      throw new Error(this._t("netflix_adb_required"));
    }

    await this._hass.callService(
      "androidtv",
      "adb_command",
      {
        entity_id: entityId,
        command,
      }
    );
  }

  async _androidDreamState() {
    if (!this._androidAdbEntity()) {
      return null;
    }

    try {
      await this._androidAdbCommand(
        "sh -c \"dumpsys power | grep -E 'mWakefulness=|mWakefulnessRaw='; dumpsys dream | grep -E 'mIsDreaming|mDreaming|mCurrentDreamComponent'\""
      );

      await this._sleep(300);

      const response = String(
        this._androidAdbState()?.attributes?.adb_response || ""
      );

      if (!response) {
        return null;
      }

      const normalized =
        response.toLowerCase();

      if (
        normalized.includes("wakefulness=dreaming") ||
        normalized.includes("wakefulnessraw=dreaming") ||
        /misdreaming\s*[=:]\s*true/i.test(response) ||
        /mdreaming\s*[=:]\s*true/i.test(response)
      ) {
        return true;
      }

      if (
        normalized.includes("wakefulness=awake") ||
        normalized.includes("wakefulnessraw=awake") ||
        /misdreaming\s*[=:]\s*false/i.test(response) ||
        /mdreaming\s*[=:]\s*false/i.test(response)
      ) {
        return false;
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  async _wakeAndroidFromScreensaver() {
    const delay =
      Number(
        this._config.screensaver_wake_delay_ms
      ) || 1200;

    this._toast(
      this._t("waking_screensaver")
    );

    if (this._androidAdbEntity()) {
      // KEYCODE_WAKEUP
      await this._androidAdbCommand(
        "input keyevent 224"
      );

      await this._sleep(250);

      // DPAD_CENTER dismisses Android TV dreams/ambient mode.
      await this._androidAdbCommand(
        "input keyevent 23"
      );

      await this._sleep(delay);

      const stillDreaming =
        await this._androidDreamState();

      if (stillDreaming === true) {
        this._toast(
          this._t("screensaver_fallback")
        );

        // HOME reliably exits a stubborn dream/screen saver.
        await this._androidAdbCommand(
          "input keyevent 3"
        );

        await this._sleep(delay);
      }

      return;
    }

    /*
     * Fallback for Android TV Remote-only setups. remote.turn_on wakes
     * the device, then CENTER attempts to dismiss ambient/screensaver.
     */
    if (this._config.remote_entity) {
      await this._hass.callService(
        "remote",
        "turn_on",
        {
          entity_id:
            this._config.remote_entity,
        }
      );

      await this._sleep(250);
    }

    await this._sendRemoteButton(
      "ENTER"
    );

    await this._sleep(delay);
  }

  async _androidNetflixPickerVisible() {
    try {
      await this._androidAdbCommand(
        "uiautomator dump /sdcard/window.xml >/dev/null 2>&1 && cat /sdcard/window.xml"
      );

      await this._sleep(350);

      const response = String(
        this._androidAdbState()?.attributes?.adb_response || ""
      );

      if (!response || !response.includes("<hierarchy")) {
        return null;
      }

      const normalized = this._norm(response);

      const pickerMarkers = [
        "whoswatching",
        "whoiswatching",
        "quienestaviendo",
        "manageprofiles",
        "administrarperfiles",
        "addprofile",
        "agregarperfil",
      ];

      const profileMarkers = this._profileNames()
        .map((name) => this._norm(name))
        .filter(Boolean);

      if (
        [...pickerMarkers, ...profileMarkers].some(
          (marker) => normalized.includes(marker)
        )
      ) {
        return true;
      }

      const homeMarkers = [
        "mynetflix",
        "home",
        "inicio",
        "search",
        "buscar",
        "tvshows",
        "series",
        "movies",
        "peliculas",
      ];

      if (
        homeMarkers.some(
          (marker) => normalized.includes(marker)
        )
      ) {
        return false;
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  _netflixProfilePosition(appConfig) {
    const profileName = this._selectedProfile;
    const profileConfig = this._currentProfileConfig();

    const fallback =
      Math.max(
        0,
        this._profileNames().indexOf(profileName)
      ) + 1;

    const raw =
      appConfig?.profile_position ??
      appConfig?.netflix_profile_position ??
      profileConfig?.netflix_profile_position ??
      fallback;

    const position = Number(raw);

    if (
      !Number.isInteger(position) ||
      position < 1 ||
      position > 5
    ) {
      throw new Error(
        this._t("netflix_profile_position_invalid", {
          profile: profileName,
        })
      );
    }

    return position;
  }

  async _sendNetflixProfileButton(button) {
    if (this._platform() !== "android_tv") {
      await this._sendRemoteButton(button);
      return;
    }

    /*
     * Send raw Android keyevents for Netflix. This bypasses any
     * integration-level key-name translation and is more reliable
     * inside com.netflix.ninja.
     */
    const key = String(button || "").toUpperCase();
    const map = {
      UP: 19,
      DOWN: 20,
      LEFT: 21,
      RIGHT: 22,
      ENTER: 23,
      CENTER: 23,
      BACK: 4,
      HOME: 3,
    };

    if (map[key] != null) {
      await this._androidAdbCommand(
        "input keyevent " + map[key]
      );
      return;
    }

    await this._androidAdbCommand(button);
  }

  async _openNetflixProfilePickerFromHome(
    appConfig = {}
  ) {
    const stepDelay =
      Number(
        appConfig?.step_delay_ms ??
          this._config.netflix_profile_navigation_delay_ms ??
          350
      ) || 350;

    const pickerDelay =
      Number(
        appConfig?.picker_open_delay_ms ??
          1200
      ) || 1200;

    await this._sendNetflixProfileButton(
      "BACK"
    );

    await this._sleep(
      Math.max(500, stepDelay)
    );

    const upPresses = Math.min(
      12,
      Math.max(
        4,
        Number(
          appConfig?.menu_up_presses ?? 8
        ) || 8
      )
    );

    for (let i = 0; i < upPresses; i += 1) {
      await this._sendNetflixProfileButton(
        "UP"
      );

      await this._sleep(
        Math.min(stepDelay, 250)
      );
    }

    await this._sendNetflixProfileButton(
      "ENTER"
    );

    await this._sleep(pickerDelay);
  }

  async _runNetflixProfilePosition(
    appConfig = {}
  ) {
    const position =
      this._netflixProfilePosition(
        appConfig
      );

    const stepDelay =
      Number(
        appConfig?.step_delay_ms ??
          this._config.netflix_profile_navigation_delay_ms ??
          this._config.profile_navigation_delay_ms
      ) || 300;

    const anchorPresses = Math.min(
      10,
      Math.max(
        1,
        Number(
          appConfig?.anchor_left_presses ?? 6
        ) || 6
      )
    );

    for (let i = 0; i < anchorPresses; i += 1) {
      await this._sendNetflixProfileButton(
        "LEFT"
      );

      if (stepDelay > 0) {
        await this._sleep(stepDelay);
      }
    }

    for (let i = 1; i < position; i += 1) {
      await this._sendNetflixProfileButton(
        "RIGHT"
      );

      if (stepDelay > 0) {
        await this._sleep(stepDelay);
      }
    }

    await this._sendNetflixProfileButton(
      "ENTER"
    );
  }

  async _selectNetflixProfile(
    providerName,
    source,
    appConfig,
    options = {}
  ) {
    const appJustOpened =
      options.appJustOpened === true;

    const alwaysSelect =
      appConfig?.always_select === true;

    if (
      this._platform() === "webos" &&
      !appJustOpened &&
      !alwaysSelect
    ) {
      return false;
    }

    const initialDelay =
      options.appReadyWaited === true
        ? 0
        : (
            Number(
              appConfig?.launch_delay_ms ??
                this._config.netflix_profile_launch_delay_ms ??
                this._config.profile_launch_delay_ms
            ) || 0
          );

    if (initialDelay > 0) {
      this._toast(
        this._t("preparing_profile", {
          source,
          profile: this._selectedProfile,
        })
      );

      await this._sleep(initialDelay);
    }

    if (this._platform() === "android_tv") {
      if (!this._androidAdbEntity()) {
        throw new Error(
          this._t("netflix_adb_required")
        );
      }

      const pickerVisible =
        await this._androidNetflixPickerVisible();

      /*
       * Netflix frequently hides its UI hierarchy from uiautomator.
       * Previously, an "unknown" result while Netflix was already
       * running caused profile selection to be skipped entirely.
       *
       * If the picker is definitely not visible, or its state is
       * unknown while Netflix was already running, explicitly open
       * Netflix's profile selector through its TV menu first.
       */
      if (
        pickerVisible === false ||
        (
          pickerVisible == null &&
          !appJustOpened
        )
      ) {
        await this._openNetflixProfilePickerFromHome(
          appConfig
        );
      }
    }

    this._toast(
      this._t("selecting_profile", {
        source,
        profile: this._selectedProfile,
      })
    );

    await this._runNetflixProfilePosition(
      appConfig
    );

    const afterSelectDelay =
      Number(
        appConfig?.after_select_delay_ms ??
          this._config.netflix_profile_after_select_delay_ms
      ) || 0;

    if (afterSelectDelay > 0) {
      await this._sleep(afterSelectDelay);
    }

    if (
      this._platform() === "android_tv"
    ) {
      const stillOnPicker =
        await this._androidNetflixPickerVisible();

      if (stillOnPicker === true) {
        await this._sleep(700);

        await this._runNetflixProfilePosition(
          appConfig
        );

        if (afterSelectDelay > 0) {
          await this._sleep(
            afterSelectDelay
          );
        }
      }
    }

    return true;
  }

  _isPrimeProvider(providerName, source = "") {
    const aliases = new Set([
      ...this._providerAliases(
        providerName
      ),
      ...this._providerAliases(
        source
      ),
    ]);

    return [...aliases].some(
      (alias) =>
        alias &&
        (
          alias.includes(
            "amazonprimevideo"
          ) ||
          alias.includes(
            "primevideo"
          ) ||
          alias === "prime" ||
          alias === "amazon"
        )
    );
  }

  _primeContentTarget(webUrl) {
    const raw =
      String(webUrl || "").trim();

    if (!raw) {
      return "";
    }

    let decoded = raw;

    try {
      decoded =
        decodeURIComponent(raw);
    } catch (_) {}

    const candidates =
      [decoded, raw];

    const patterns = [
      /primevideo\.com\/(?:region\/[a-z]{2}\/)?detail\/([a-z0-9]+)/i,
      /amazon\.[^/]+\/(?:[^/]+\/)?gp\/video\/detail\/([a-z0-9]+)/i,
      /amazon\.[^/]+\/dp\/([a-z0-9]+)/i,
    ];

    for (
      const candidate of candidates
    ) {
      for (const pattern of patterns) {
        const match =
          candidate.match(pattern);

        if (match?.[1]) {
          return (
            "https://www.primevideo.com/detail/" +
            match[1]
          );
        }
      }
    }

    return raw;
  }

  async _openPrimeExactTitle(webUrl) {
    const target =
      this._primeContentTarget(
        webUrl
      );

    if (!target) {
      throw new Error(
        "Prime Video title link is missing."
      );
    }

    /*
     * Do not use system.launcher/open here: that endpoint is
     * explicitly the webOS browser URL opener. Prime Video's
     * webOS app id is "amazon". Send the deep link through the
     * app launcher as both contentId and contentTarget so both
     * newer and older webOS launcher generations can deliver it.
     */
    await this._hass.callService(
      "webostv",
      "command",
      {
        entity_id:
          this._config.tv_entity,

        command:
          "system.launcher/launch",

        payload: {
          id: "amazon",
          contentId: target,
          params: {
            contentTarget:
              target,
          },
        },
      }
    );
  }

  _netflixContentId(url) {
    const raw = String(url || "");

    let decoded = raw;

    try {
      decoded = decodeURIComponent(raw);
    } catch (_) {}

    const candidates = [
      raw,
      decoded,
    ];

    const patterns = [
      /netflix\.com\/(?:watch|title)\/(\d+)/i,
      /api\.netflix\.com\/catalog\/titles\/(?:movies|series|programs)\/(\d+)/i,
      /(?:^|[?&])(?:movieid|contentid|titleid)=(\d+)/i,
    ];

    for (
      const candidate of candidates
    ) {
      for (const pattern of patterns) {
        const match =
          String(candidate).match(
            pattern
          );

        if (match?.[1]) {
          return match[1];
        }
      }
    }

    return null;
  }

  async _openNetflixExactTitle(webUrl) {
    const contentId =
      this._netflixContentId(
        webUrl
      );

    if (!contentId) {
      throw new Error(
        this._t(
          "netflix_title_id_missing"
        )
      );
    }

    if (
      this._platform() ===
      "android_tv"
    ) {
      if (
        this._androidAdbEntity()
      ) {
        await this._androidAdbCommand(
          "am start -W -n com.netflix.ninja/.MainActivity " +
          "-a android.intent.action.VIEW " +
          "-d netflix://title/" +
          contentId +
          " -f 0x10000020 -e source 30"
        );

        return;
      }

      await this._androidLaunchActivity(
        "netflix://title/" +
          contentId
      );

      return;
    }

    await this._hass.callService(
      "webostv",
      "command",
      {
        entity_id:
          this._config.tv_entity,

        command:
          "system.launcher/launch",

        payload: {
          id: "netflix",
          contentId:
            "m=http%3A%2F%2Fapi.netflix.com%2Fcatalog%2Ftitles%2Fmovies%2F" +
            contentId +
            "&source_type=4",
        },
      }
    );
  }

  async _sendProviderPlay(providerName, source = "") {
    if (
      this._platform() === "android_tv" &&
      this._isNetflixProvider(providerName, source) &&
      this._androidAdbEntity()
    ) {
      const command =
        String(
          this._config?.android_play_command ||
          "DPAD_CENTER"
        ).toUpperCase();

      if (command === "MEDIA_PLAY") {
        await this._androidAdbCommand(
          "input keyevent 126"
        );
      } else {
        await this._androidAdbCommand("CENTER");
      }

      return;
    }

    await this._sendRemoteButton("PLAY");
  }

  _rokuRemoteCommand(button) {
    const key = String(button ?? "").toUpperCase();
    const commands = {
      UP: "up", DOWN: "down", LEFT: "left", RIGHT: "right",
      ENTER: "select", CENTER: "select", HOME: "home", BACK: "back",
      BACKSPACE: "backspace", PLAY: "play", PAUSE: "play",
      VOLUME_UP: "volume_up", VOLUME_DOWN: "volume_down",
      MUTE: "volume_mute",
    };
    // Roku offers a Play/Pause toggle key, not separate Play and Pause keys.
    if (/^[0-9]$/.test(key)) return `Lit_${key}`;
    const command = commands[key];
    if (!command) throw new Error(`Unsupported Roku remote button: ${key}`);
    return command;
  }

  async _sendRemoteButton(button) {
    if (this._platform() === "roku") {
      if (!this._config.remote_entity) {
        throw new Error("Select the Roku remote entity in Streaming Browser card settings.");
      }
      await this._hass.callService("remote", "send_command", {
        entity_id: this._config.remote_entity,
        command: this._rokuRemoteCommand(button),
      });
      return;
    }
    if (this._platform() === "android_tv") {
      if (!this._config.remote_entity) {
        throw new Error("remote_entity is required for Android TV");
      }

      await this._hass.callService("remote", "send_command", {
        entity_id: this._config.remote_entity,
        command: this._androidCommand(button),
      });
      return;
    }

    await this._hass.callService("webostv", "button", {
      entity_id: this._config.tv_entity,
      button,
    });
  }

  async _applyProfile(
    providerName,
    source,
    options = {}
  ) {
    if (this._config.manual_profile_selection !== false) return;
    const profileName = this._selectedProfile;

    if (!profileName) return;

    const appConfig = this._findProfileAppConfig(
      providerName,
      source
    );

    const mode =
      this._profileModeFor(providerName, source);

    if (mode === "remember") {
      return;
    }

    if (mode === "netflix") {
      await this._selectNetflixProfile(
        providerName,
        source,
        appConfig || {},
        options
      );
      return;
    }

    const initialDelay =
      options.appReadyWaited === true
        ? 0
        : (
            Number(
              appConfig?.launch_delay_ms ??
                this._config.profile_launch_delay_ms
            ) || 0
          );

    if (initialDelay > 0) {
      this._toast(
        this._t("preparing_profile", { source, profile: profileName })
      );

      await this._sleep(initialDelay);
    }

    if (mode === "navigation") {
      const sequence = appConfig?.sequence;

      if (!Array.isArray(sequence) || !sequence.length) {
        throw new Error(
          this._t("navigation_missing", { profile: profileName, source })
        );
      }

      const defaultDelay =
        Number(
          appConfig?.step_delay_ms ??
            this._config.profile_navigation_delay_ms
        ) || 450;

      this._toast(
        this._t("selecting_profile", { source, profile: profileName })
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
            this._t("unlocking_profile", { source, profile: profileName })
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
          this._t("command_missing", { profile: profileName, source })
        );
      }

      this._toast(
        this._t("applying_profile", { source, profile: profileName })
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

    throw new Error(this._t("unknown_profile_mode", { mode }));
  }

  async _prepareDisplayRoute() {
    const display = String(this._config?.display_entity || "").trim();
    if (!display) return;
    const source = String(this._config?.display_source || "").trim();
    if (!source) throw new Error("Choose the HDMI input for the display TV in card settings.");
    if (display === this._config.tv_entity) {
      throw new Error("Display TV and playback device must be different for HDMI routing.");
    }
    const state = this._hass?.states?.[display];
    if (!state || state.state === "unavailable") {
      throw new Error("The configured HDMI display TV is unavailable: " + display);
    }
    if (["off", "standby", "unknown"].includes(state.state)) {
      await this._hass.callService("media_player", "turn_on", { entity_id: display });
      await this._sleep(Math.max(0, Number(this._config.wake_delay_ms ?? 4500)));
    }
    const current = this._hass.states?.[display]?.attributes?.source || "";
    if (current !== source) {
      await this._hass.callService("media_player", "select_source", {
        entity_id: display, source,
      });
      await this._sleep(Math.max(0, Number(this._config.display_source_delay_ms ?? 2500)));
    }
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

    const android =
      this._platform() === "android_tv";

    if (!tv || !onStates.has(tv.state)) {
      this._toast(
        this._t("turning_on_tv")
      );

      if (
        android &&
        this._config.remote_entity
      ) {
        await this._hass.callService(
          "remote",
          "turn_on",
          {
            entity_id:
              this._config.remote_entity,
          }
        );
      } else {
        await this._hass.callService(
          "media_player",
          "turn_on",
          {
            entity_id:
              this._config.tv_entity,
          }
        );
      }

      await this._sleep(
        Number(
          this._config.wake_delay_ms
        ) || 4500
      );

      tv = this._tvState();
    }

    if (android) {
      /*
       * Android TV often keeps the media player/source attributes from
       * the app underneath the screensaver. Query Android's actual
       * Dreaming/Awake state over ADB when available.
       */
      const dreamState =
        await this._androidDreamState();

      const attributeScreensaver =
        this._isScreensaverActive(tv);

      const likelyRemoteOnlyScreensaver =
        dreamState == null &&
        !this._androidAdbEntity() &&
        tv?.state === "idle";

      if (
        dreamState === true ||
        attributeScreensaver ||
        likelyRemoteOnlyScreensaver
      ) {
        await this._wakeAndroidFromScreensaver();
        tv = this._tvState();
      } else if (
        this._config.remote_entity &&
        tv?.state === "idle"
      ) {
        /*
         * Keep the Android TV Remote entity awake without injecting
         * CENTER unless we actually detected/strongly suspect a dream.
         */
        await this._hass.callService(
          "remote",
          "turn_on",
          {
            entity_id:
              this._config.remote_entity,
          }
        );

        await this._sleep(250);
        tv = this._tvState();
      }

      return tv;
    }

    if (this._isScreensaverActive(tv)) {
      this._toast(
        this._t("waking_screensaver")
      );

      await this._sendRemoteButton(
        "ENTER"
      );

      const delay =
        Number(
          this._config
            .screensaver_wake_delay_ms
        ) || 1200;

      await this._sleep(delay);
      tv = this._tvState();

      if (
        this._isScreensaverActive(tv)
      ) {
        this._toast(
          this._t(
            "screensaver_fallback"
          )
        );

        await this._sendRemoteButton(
          "HOME"
        );

        await this._sleep(delay);
        tv = this._tvState();
      }
    }

    return tv;
  }

  _defaultAndroidAppLinks() {
    return {
      Netflix: "netflix://",
      "Netflix Standard with Ads": "netflix://",
      "Disney Plus": "https://www.disneyplus.com",
      "Amazon Prime Video": "https://app.primevideo.com",
      "Prime Video": "https://app.primevideo.com",
      Max: "https://play.max.com",
      "HBO Max": "https://play.max.com",
      "Paramount Plus": "https://www.paramountplus.com",
      "Apple TV Plus": "https://tv.apple.com",
      Crunchyroll: "https://www.crunchyroll.com",
      ViX: "https://vix.com",
      "Claro Video": "https://www.clarovideo.com",
    };
  }

  _androidAppLink(providerName, source) {
    const links = {
      ...this._defaultAndroidAppLinks(),
      ...(this._config.android_app_links || {}),
    };

    const aliases = new Set([
      ...this._providerAliases(providerName),
      this._norm(source),
    ]);

    for (const [name, link] of Object.entries(links)) {
      const key = this._norm(name);
      if (aliases.has(key)) return link;
      if ([...aliases].some(
        (alias) => alias && (key.includes(alias) || alias.includes(key))
      )) return link;
    }

    return null;
  }

  _androidAppIsActive(providerName, source = "") {
    const current =
      this._norm(this._androidActivity());

    if (!current) {
      return false;
    }

    const aliases = new Set([
      ...this._providerAliases(providerName),
      ...this._providerAliases(source),
    ]);

    if (
      this._isNetflixProvider(
        providerName,
        source
      )
    ) {
      aliases.add("netflix");
      aliases.add("comnetflixninja");
    }

    return [...aliases].some(
      (alias) =>
        alias &&
        (
          current.includes(alias) ||
          alias.includes(current)
        )
    );
  }

  async _waitForAndroidAppReady(
    providerName,
    source,
    appConfig = {}
  ) {
    const minimumWait =
      Number(
        appConfig?.launch_delay_ms ??
          (
            this._isNetflixProvider(
              providerName,
              source
            )
              ? this._config
                  .netflix_profile_launch_delay_ms
              : this._config
                  .profile_launch_delay_ms
          )
      ) || 0;

    const timeout =
      Math.max(
        minimumWait,
        Number(
          appConfig?.launch_timeout_ms ??
            this._config
              .android_app_launch_timeout_ms ??
            8000
        ) || 8000
      );

    const startedAt = Date.now();
    let active = false;

    while (
      Date.now() - startedAt <
      timeout
    ) {
      if (
        this._androidAppIsActive(
          providerName,
          source
        )
      ) {
        active = true;
        break;
      }

      await this._sleep(250);
    }

    const elapsed =
      Date.now() - startedAt;

    const remaining =
      Math.max(
        0,
        minimumWait - elapsed
      );

    if (remaining > 0) {
      await this._sleep(remaining);
    }

    /*
     * Home Assistant can report current_activity slightly before the
     * Android TV app is ready to accept DPAD input. Give the app a
     * short settle window after it becomes foreground.
     */
    if (active) {
      const settleDelay =
        Number(
          appConfig?.settle_delay_ms ??
            this._config
              .android_app_settle_delay_ms ??
            750
        ) || 0;

      if (settleDelay > 0) {
        await this._sleep(
          settleDelay
        );
      }
    }
  }

  async _waitForWebOsAppReady(
    providerName,
    source,
    appConfig = {}
  ) {
    const minimumWait =
      Number(
        appConfig?.launch_delay_ms ??
          STREAMING_BROWSER_BACKEND
            .profileRules[
              this._isNetflixProvider(
                providerName,
                source
              )
                ? "netflix"
                : (
                    this._isPrimeProvider(
                      providerName,
                      source
                    )
                      ? "prime"
                      : "disney"
                  )
            ]?.launchDelayMs ??
          5000
      ) || 5000;

    const timeout =
      Math.max(
        minimumWait,
        Number(
          appConfig?.launch_timeout_ms ??
            9000
        ) || 9000
      );

    const startedAt =
      Date.now();

    let active = false;

    while (
      Date.now() - startedAt <
      timeout
    ) {
      const current =
        this._norm(
          this._tvState()
            ?.attributes?.source ||
          ""
        );

      const expected =
        this._norm(source);

      if (
        current &&
        expected &&
        (
          current === expected ||
          current.includes(expected) ||
          expected.includes(current)
        )
      ) {
        active = true;
        break;
      }

      await this._sleep(250);
    }

    /*
     * The app becoming the reported source only means webOS has
     * switched foreground ownership. It does not mean the app's
     * profile UI is ready. Start the full app-loading delay AFTER
     * the target source becomes active (or after the readiness
     * timeout if webOS never reports it).
     */
    await this._sleep(
      minimumWait
    );

    /*
     * Give the rendered profile picker one additional settle window
     * before the first navigation key is injected.
     */
    await this._sleep(
      active ? 1000 : 1500
    );
  }

  async _androidLaunchActivity(activity) {
    if (!this._config.remote_entity) {
      throw new Error("remote_entity is required for Android TV");
    }

    await this._hass.callService("remote", "turn_on", {
      entity_id: this._config.remote_entity,
      activity,
    });
  }
  async _launchProvider(providerName, autoPlay = false) {
    if (!this._hass) return;

    const source = this._sourceForProvider(providerName);

    if (!source) {
      this._toast(
        this._t("app_match_failed", { provider: providerName })
      );
      return;
    }

    try {
      await this._prepareDisplayRoute();
      const tv = await this._ensureTvOn();
      const currentSource = tv?.attributes?.source || "";

      if (this._platform() === "android_tv") {
        const activity = this._androidAppLink(providerName, source);

        if (!activity) {
          throw new Error(
            "No Android TV app/deep link is configured for " + providerName
          );
        }

        const currentActivity = this._norm(this._androidActivity());
        const aliases = this._providerAliases(providerName);
        const appAlreadyOpen = aliases.some(
          (alias) => alias && currentActivity.includes(alias)
        );

        if (!appAlreadyOpen) {
          await this._androidLaunchActivity(
            activity
          );

          const appConfig =
            this._findProfileAppConfig(
              providerName,
              source
            ) || {};

          await this._waitForAndroidAppReady(
            providerName,
            source,
            appConfig
          );
        }

        await this._applyProfile(
          providerName,
          source,
          {
            appJustOpened:
              !appAlreadyOpen,
            appReadyWaited:
              !appAlreadyOpen,
          }
        );

        if (autoPlay) {
          const delay =
            Number(this._config.auto_play_delay_ms) || 4000;
          await this._sleep(delay);
          await this._sendProviderPlay(
            providerName,
            source
          );
        }

        return;
      }

      if (this._platform() === "roku") {
        const appAlreadyOpen = this._norm(currentSource) === this._norm(source);
        if (!appAlreadyOpen) {
          this._toast(this._t("opening_app", { source }));
          await this._hass.callService("media_player", "select_source", {
            entity_id: this._config.tv_entity, source,
          });
          // Let Roku finish launching before any explicit profile/navigation steps.
          await this._sleep(Math.max(0, Number(this._config.profile_launch_delay_ms ?? 3000)));
        }
        await this._applyProfile(providerName, source, {
          appJustOpened: !appAlreadyOpen,
          appReadyWaited: !appAlreadyOpen,
        });
        if (autoPlay) {
          await this._sleep(Math.max(0, Number(this._config.auto_play_delay_ms ?? 4000)));
          await this._sendProviderPlay(providerName, source);
        }
        this._toast(this._t("app_opened", { source, profile: "" }));
        return;
      }

      const appAlreadyOpen =
        this._norm(currentSource) === this._norm(source);

      if (appAlreadyOpen) {
        this._toast(this._t("reopening_app", { source }));

        await this._sendRemoteButton("HOME");

        await this._sleep(
          Number(this._config.relaunch_delay_ms) || 1200
        );
      } else {
        this._toast(this._t("opening_app", { source }));
      }

      await this._hass.callService(
        "media_player",
        "select_source",
        {
          entity_id: this._config.tv_entity,
          source,
        }
      );

      const appConfig =
        this._findProfileAppConfig(
          providerName,
          source
        ) || {};

      this._toast(
        this._t(
          "preparing_profile",
          {
            source,
            profile:
              this._selectedProfile || "",
          }
        )
      );

      await this._waitForWebOsAppReady(
        providerName,
        source,
        appConfig
      );

      await this._applyProfile(
        providerName,
        source,
        {
          appJustOpened:
            !appAlreadyOpen,
          appReadyWaited: true,
        }
      );

      if (autoPlay) {
        const delay =
          Number(this._config.auto_play_delay_ms) || 4000;

        this._toast(
          `${source} · ${
            this._selectedProfile
              ? this._t("profile_prefix", {
                  profile: this._selectedProfile,
                })
              : ""
          }${this._t("play_in", {
            seconds: Math.round(delay / 100) / 10,
          })}`
        );

        await this._sleep(delay);

        await this._sendProviderPlay(
          providerName,
          source
        );

        this._toast(this._t("play_sent_to", { source }));
      } else {
        this._toast(
          this._t("app_opened", {
            source,
            profile: this._selectedProfile
              ? this._t("profile_suffix", {
                  profile: this._selectedProfile,
                })
              : "",
          })
        );
      }
    } catch (err) {
      this._toast(
        this._t("app_open_failed", { source, error: this._formatError(err) })
      );
    }
  }


  // ---------------------------------------------------------------------------
  // Watchmode exact-title lookup
  // ---------------------------------------------------------------------------

  async _callServiceWithResponse(entityId, serviceData = {}) {
    if (!this._hass?.callWS) {
      throw new Error(
        this._t("callws_unavailable")
      );
    }

    const parts = String(entityId || "").split(".");

    if (parts.length !== 2) {
      throw new Error(
        this._t("invalid_response_action", { entity: entityId })
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

  async _watchmodeSourcesForCurrentTitle({ silent = false } = {}) {
    const detail = this._details;

    if (!detail?.item?.id) {
      throw new Error(
        this._t("no_title_selected")
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

    if (!silent) {
      this._toast(this._t("looking_up_exact_link"));
    }

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
        this._t("watchmode_http", { status })
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
          this._t("watchmode_bad_response")
        );
      }
    }

    if (!Array.isArray(content)) {
      throw new Error(
        this._t("watchmode_not_list")
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

    if (this._platform() === "roku") {
      // A Watchmode/JustWatch web URL is not a Roku channel-specific content ID.
      // Do not send it to webOS, or claim that launching an app played the title.
      this._toast(this._locale() === "es"
        ? "Roku necesita un ID de contenido de la app para abrir este título. Usa Abrir app."
        : "Roku needs an app-specific content ID for exact title playback. Use Open app.");
      return;
    }

    try {
      await this._prepareDisplayRoute();
      const tv = await this._ensureTvOn();

      const detail = this._details;
      const series = detail?.type === "tv";
      const sources = series
        ? (detail.selectedEpisode && !detail.episodeSourcesLoading ? detail.episodeSources || [] : [])
        : await this._watchmodeSourcesForCurrentTitle();

      const match =
        this._pickWatchmodeSource(
          providerName,
          sources
        );

      if (!match?.web_url) {
        throw new Error(
          this._t("watchmode_no_provider_link", { provider: providerName, region: this._config.region })
        );
      }

      const source =
        this._sourceForProvider(providerName);

      const appConfig =
        this._findProfileAppConfig(
          providerName,
          source || providerName
        );

      const profileMode =
        this._profileModeFor(
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
        this._config.manual_profile_selection === false &&
        source &&
        (
          appConfig?.exact_title_profile_first === true ||
          profileMode === "netflix"
        )
      ) {
        const currentSource =
          this._platform() === "android_tv"
            ? this._androidActivity()
            : tv?.attributes?.source || "";

        const appAlreadyOpen =
          this._platform() === "android_tv"
            ? this._providerAliases(providerName).some(
                (alias) =>
                  alias &&
                  this._norm(currentSource).includes(alias)
              )
            : this._norm(currentSource) ===
              this._norm(source);

        if (!appAlreadyOpen) {
          this._toast(
            this._t("opening_and_preparing", { source, profile: this._selectedProfile || "" })
          );

          if (this._platform() === "android_tv") {
            const activity =
              this._androidAppLink(providerName, source);

            if (activity) {
              await this._androidLaunchActivity(
                activity
              );

              await this._waitForAndroidAppReady(
                providerName,
                source,
                appConfig || {}
              );
            }
          } else {
            await this._hass.callService(
              "media_player",
              "select_source",
              {
                entity_id:
                  this._config.tv_entity,
                source,
              }
            );

            this._toast(
              this._t(
                "preparing_profile",
                {
                  source,
                  profile:
                    this._selectedProfile || "",
                }
              )
            );

            await this._waitForWebOsAppReady(
              providerName,
              source,
              appConfig || {}
            );
          }

          await this._applyProfile(
            providerName,
            source,
            {
              appJustOpened: true,
              appReadyWaited: true,
            }
          );

          const afterProfileDelay =
            Number(
              appConfig
                .exact_title_after_profile_delay_ms ??
                0
            ) || 0;

          if (afterProfileDelay > 0) {
            this._toast(
              this._t("waiting_profile_session", { source })
            );

            await this._sleep(
              afterProfileDelay
            );
          }
        } else {
          if (
            profileMode === "netflix" &&
            this._platform() === "android_tv"
          ) {
            await this._applyProfile(
              providerName,
              source,
              { appJustOpened: false }
            );
          }

          this._toast(
            this._t("using_current_session", { source })
          );
        }
      }

      this._toast(
        this._t("opening_title", { provider: match.name || providerName })
      );

      if (
        this._isNetflixProvider(
          providerName,
          source || match.name || ""
        )
      ) {
        await this._openNetflixExactTitle(
          match.web_url
        );
      } else if (
        this._platform() === "webos" &&
        this._isPrimeProvider(
          providerName,
          source || match.name || ""
        )
      ) {
        await this._openPrimeExactTitle(
          match.web_url
        );
      } else if (this._platform() === "android_tv") {
        await this._androidLaunchActivity(match.web_url);
      } else {
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
      }

      if (autoPlay) {
        const delay =
          Number(
            this._config
              .exact_title_play_delay_ms
          ) || 5000;

        this._toast(
          this._t("title_opened_play", { seconds: Math.round(delay / 100) / 10 })
        );

        await this._sleep(delay);

        await this._sendProviderPlay(
          providerName,
          source || providerName
        );

        this._toast(
          this._t("play_sent")
        );
      } else {
        this._toast(
          this._t("title_link_sent")
        );
      }

    } catch (err) {
      if (this._details?.type === "tv") {
        this._toast(this._t("title_open_failed", { error: this._formatError(err) }));
        return; // Never open the series home as an episode-link fallback.
      }
      const fallback =
        this._config
          .exact_title_fallback_to_app !==
        false;

      if (!fallback) {
        this._toast(
          this._t("title_open_failed", { error: this._formatError(err) })
        );

        return;
      }

      this._toast(
        this._t("title_fallback", { provider: providerName })
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
    if (this._platform() === "roku") {
      this._toast("Roku cannot open a web availability page; choose an installed streaming app.");
      return;
    }

    try {
      await this._hass.callService("webostv", "command", {
        entity_id: this._config.tv_entity,
        command: "system.launcher/open",
        payload: {
          target: link,
        },
      });

      this._toast(
        this._t("opening_availability")
      );
    } catch (err) {
      this._toast(
        this._t("page_open_failed", { error: this._formatError(err) })
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
          ${this._t("who_is_watching")}
        </div>

        <div class="profiles">
          ${names
            .map((name) => {
              const cfg =
                this._currentProfileConfigForName(
                  name
                );
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
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        z-index: 9999;
        background: rgba(0,0,0,.68);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        backdrop-filter: blur(8px);
      }

      .detail {
        /* Fluid modal: use the available viewport minus overlay padding. */
        width: 100%;
        max-width: 100%;
        min-width: 0;
        max-height: min(92vh, 92dvh);
        overflow: auto;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        border-radius: 18px;
        box-shadow: 0 18px 70px rgba(0,0,0,.45);
        position: relative;
      }

      /* Title and close/remote buttons remain visible while episodes scroll. */
      .detail-sticky-header {
        position:sticky; top:0; z-index:8;
        display:flex; align-items:center; gap:8px;
        padding:8px 12px; min-height:52px;
        color:var(--primary-text-color);
        background:var(--card-background-color);
        border-bottom:1px solid var(--divider-color);
      }
      .detail-sticky-title {
        flex:1; min-width:0; overflow:hidden;
        white-space:nowrap; text-overflow:ellipsis;
        font-size:15px; font-weight:700;
      }
      .detail-sticky-header .detail-remote-button,
      .detail-sticky-header .close {
        position:static; flex:0 0 36px;
        width:36px; height:36px; min-height:36px;
        border-radius:50%; background:var(--secondary-background-color);
        color:var(--primary-text-color); display:grid;place-items:center;
      }
      .detail-loading-panel { padding: 64px 28px 32px; min-height: 180px; }
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

      .detail-remote-button {
        position: absolute; top: 12px; right: 58px; z-index: 5;
        width: 38px; height: 38px; border: 0; border-radius: 50%;
        background: rgba(0,0,0,.64); color: white; cursor: pointer;
        display: grid; place-items: center;
      }
      .detail-remote-button ha-icon { --mdc-icon-size: 22px; }
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

      .season-tabs { display:flex; gap:8px; overflow-x:auto; padding:4px 1px 12px;
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
      /* One accent outline on the shared episode + sources wrapper. */
      .episode-row-container { border-bottom:1px solid var(--divider-color); }
      .episode-row-container.selected {
        border:2px solid var(--primary-color);
        border-radius:12px;
        overflow:hidden;
        background:var(--secondary-background-color);
      }
      .episode-row-container.selected .episode-row.active {
        border:0;
        border-radius:0;
        box-shadow:none;
      }
      .episode-inline-actions {
        padding:12px 14px 16px;
        background:var(--secondary-background-color);
        border:0;
        border-top:1px solid var(--divider-color);
        border-radius:0;
        margin:0;
      }
      .episode-inline-actions > strong { display:block; margin-bottom:10px; }
      .episode-inline-actions .provider-card { min-width:0; align-items:flex-start; }
      .episode-inline-actions .provider-main { min-width:0; flex:1; }
      .episode-inline-actions .provider-actions { gap:7px; }
      .episode-inline-actions .provider-grid { margin-top:8px; }
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

      /* Streaming Browser v0.4.95: WatchHub source visibility and larger provider logos. */
      .provider-card img {
        width: 48px;
        height: 48px;
        border-radius: 9px;
        object-fit: contain;
        background: white;
      }

      /* Brand logo replaces the redundant visible service name. Preserve the
         name for assistive technology, hover, and services without a logo. */
      .provider-brand {
        display: grid;
        place-items: center;
        flex: 0 0 52px;
        width: 52px;
        min-height: 52px;
        position: relative;
        overflow: visible;
      }
      /* A tiny offer badge floats above the service logo without resizing it. */
      .provider-offer-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        z-index: 1;
        min-width: 21px;
        height: 21px;
        box-sizing: border-box;
        padding: 1px 2px;
        display: inline-flex;
        justify-content: center;
        align-items: center;
        gap: 1px;
        border-radius: 11px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color);
        box-shadow: 0 1px 3px #0006;
        pointer-events: none;
      }
      .provider-offer-badge ha-icon { --mdc-icon-size: 15px; }
      .provider-offer-badge.ads { right: -13px; min-width: 31px; }
      .provider-offer-badge .provider-ad-text {
        font: 700 7px/1 system-ui, sans-serif;
        letter-spacing: -0.02em;
      }
      .provider-brand-fallback {
        flex: 0 1 110px;
        width: auto;
        max-width: 110px;
      }
      .provider-name-fallback {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      .provider-main {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 10px;
      }
      .provider-source {
        font-size: 10px;
        opacity: .72;
        margin: 0;
      }
      .provider-link-origin {
        display: inline-flex;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        padding: 2px 5px;
        white-space: nowrap;
        opacity: .86;
      }
      .provider-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin: 0 0 0 auto;
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
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 36px;
      }

      /* Compact action captions v0.4.84 */
      .provider-actions .mini-btn.icon-action {
        box-sizing: border-box;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        width: 74px;
        min-width: 74px;
        height: 72px;
        min-height: 72px;
        padding: 6px 4px;
        flex: 0 0 74px;
        border-radius: 14px;
        text-align: center;
        line-height: 1.15;
      }
      .provider-actions .mini-btn.icon-action ha-icon {
        --mdc-icon-size: 26px;
        flex: none;
      }
      .provider-actions .provider-action-caption {
        display: block;
        max-width: 100%;
        font-size: 11px;
        line-height: 1.15;
        font-weight: 550;
        white-space: nowrap;
      }
      @media(max-width:600px) {
        .provider-actions .mini-btn.icon-action {
          width: 64px; min-width: 64px; flex-basis: 64px;
          height: 68px; min-height: 68px;
        }
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
        .episode-thumb { width:88px; flex-basis:88px; }
      }
    `;
  }

  // TMDB offer types, not provider names or URLs, determine the logo badge.
  // A subscription offer is preferred when one provider lists several ways to watch.
  _providerOffer(groups) {
    const types = new Set((Array.isArray(groups) ? groups : [])
      .map((value) => String(value).toLowerCase()));
    const es = this._locale().startsWith("es");
    if (types.has("flatrate")) {
      return { kind: "included", icon: "mdi:currency-usd-off",
        label: es ? "Incluido con suscripción" : "Included with subscription" };
    }
    if (types.has("ads")) {
      return { kind: "ads", icon: "mdi:play-circle-outline",
        label: es ? "Gratis con anuncios" : "Free with ads" };
    }
    if (types.has("free")) {
      return { kind: "included", icon: "mdi:currency-usd-off",
        label: es ? "Gratis" : "Free" };
    }
    if (types.has("rent") || types.has("buy")) {
      return { kind: "paid", icon: "mdi:currency-usd",
        label: es ? "Alquiler o compra adicional" : "Additional rental or purchase" };
    }
    return null;
  }

  // A title detail and the selected episode use the SAME provider-card layout,
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
          sources);
        const url = exact && typeof exact.web_url === "string" &&
          /^https:\/\//i.test(exact.web_url) ? exact.web_url : "";
        const tvSource = this._sourceForProvider(name) ||
          (this._platform() === "android_tv" && /crunchyroll/i.test(name) ? "Crunchyroll" : "");
        if (isSeries && !loading && !url && !tvSource) return "";
        const offer = this._providerOffer(provider.groups);
        const brandLabel = name + (offer ? ` · ${offer.label}` : "");
        const sourceStatus = isSeries ? "" : loading
          ? this._t("local_link_loading")
          : !url ? this._t("local_link_missing") : "";
        const linkOrigin = url ? ({watchhub: 'WatchHub', justwatch: 'JustWatch',
          watchmode: 'Watchmode'})[String(exact?.source || '').toLowerCase()] || '' : '';
        // The label is the resolved destination of this particular action,
        // not the type of content selected in TMDB. A series URL must never be
        // advertised as an exact episode when one is selected.
        // The WatchHub/JustWatch episode query does not prove the provider
        // URL itself is episode-specific, or that its TV app accepts the URL.
        const destination = this._providerDestination(name, exact, detail, isSeries);
        const es = this._locale().startsWith("es");
        const captions = es
          ? { episode: "Episodio", season: "Temporada", series: "Serie", movie: "Película", app: "App" }
          : { episode: "Episode", season: "Season", series: "Series", movie: "Movie", app: "App" };
        const exactTv = Boolean(url) && destination.tvCanOpen;
        const tvCaption = captions[exactTv ? destination.deviceKind : "app"];
        const deviceCaption = captions[destination.deviceKind];
        return `
          <div class="provider-card">
            <span class="provider-brand ${provider.logo_path ? "" : "provider-brand-fallback"}"
              role="img" aria-label="${this._esc(brandLabel)}" title="${this._esc(brandLabel)}">
              ${provider.logo_path ? this._providerLogo(provider)
                : `<span class="provider-name-fallback">${this._esc(name)}</span>`}
              ${offer ? `<span class="provider-offer-badge ${offer.kind}" aria-hidden="true"><ha-icon icon="${offer.icon}"></ha-icon>${offer.kind === "ads" ? `<span class="provider-ad-text">AD</span>` : ""}</span>` : ""}
            </span>
            <div class="provider-main">
              ${sourceStatus ? `<span class="provider-source">${this._esc(sourceStatus)}</span>` : ""}
              ${linkOrigin ? `<span class="provider-source provider-link-origin" title="${this._esc(linkOrigin)}">${this._esc(linkOrigin)}</span>` : ""}
              <div class="provider-actions">
                ${(exactTv || tvSource) ? `<button type="button"
                  class="mini-btn ${exactTv ? "title " : ""}icon-action"
                  ${exactTv ? `data-title-provider="${this._esc(name)}"` : `data-open-provider="${this._esc(name)}"`}
                  aria-label="${this._esc(this._t("open_on_tv"))}: ${this._esc(tvCaption)}"
                  title="${this._esc(this._t("open_on_tv"))}: ${this._esc(tvCaption)}"
                ><ha-icon icon="mdi:television-play" aria-hidden="true"></ha-icon><span class="provider-action-caption">${this._esc(tvCaption)}</span></button>` : ""}
                ${url ? `<a class="mini-btn icon-action" href="${this._esc(url)}" target="_blank"
                  rel="noopener noreferrer"
                  aria-label="${this._esc(this._t("open_this_device"))}: ${this._esc(deviceCaption)}"
                  title="${this._esc(this._t("open_this_device"))}: ${this._esc(deviceCaption)}"
                ><ha-icon icon="mdi:cellphone-play" aria-hidden="true"></ha-icon><span class="provider-action-caption">${this._esc(deviceCaption)}</span></a>` : ""}
              </div>
            </div>
          </div>`;
      }).join("");
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
      const inlineActions = active ? `<div class="episode-inline-actions">
        <strong>${this._t("where_to_watch")} ${this._esc(this._config.region)}</strong>
        ${detail.episodeSourcesLoading ? `<p class="episode-link-note">${this._t("local_link_loading")}</p>` : ""}
        ${detail.episodeSourcesError ? `<p class="episode-link-note">${this._esc(detail.episodeSourcesError)} · ${this._t("install_episode_backend")}</p>` : ""}
        ${!detail.episodeSourcesLoading && !detail.episodeSourcesError && !detail.episodeSources?.length
            ? `<p class="episode-link-note">${this._t("no_exact_episode_links")}</p>` : ""}
        ${detail.providersLoading
          ? `<p class="episode-link-note" role="status">${this._locale().startsWith("es") ? "Cargando plataformas disponibles…" : "Loading streaming providers…"}</p>`
          : detail.providersError
            ? `<p class="episode-link-note" role="alert">${this._esc(detail.providersError)}</p>`
            : `<div class="provider-grid">${this._renderProviderCards(detail, this._detailProviders(), true)}</div>`}
      </div>` : "";
      return `<div class="episode-row-container ${active ? "selected" : ""}"><button type="button" class="episode-row ${active ? "active" : ""}"
        data-episode-index="${index}" aria-pressed="${String(Boolean(active))}">
        ${thumb ? `<img class="episode-thumb" loading="lazy" src="${this._esc(thumb)}" alt="">`
          : `<span class="episode-thumb episode-fallback"><ha-icon icon="mdi:movie-open"></ha-icon></span>`}
        <span class="episode-copy"><strong>${this._t("episode")} ${num} · ${this._esc(name)}</strong>
          ${meta ? `<small>${this._esc(meta)}</small>` : ""}
          ${episode.overview ? `<p>${this._esc(episode.overview)}</p>` : ""}
        </span><ha-icon icon="mdi:chevron-right"></ha-icon>
      </button>${inlineActions}</div>`;
    }).join("");
    const status = detail.episodesLoading
      ? `<p class="episode-link-note">${this._t("loading_episodes")}</p>`
      : detail.seasonError
        ? `<p class="episode-link-note">${this._t("episode_load_error", { error: this._esc(detail.seasonError) })}</p>`
        : rows || `<p class="episode-link-note">${this._t("no_episodes")}</p>`;
    return `<div class="provider-title">${this._t("episodes")}</div>
      <div class="season-tabs">${tabs}</div><div class="episode-list">${status}</div>`;
  }

  _renderDetails() {
    const detail = this._details;

    if (!detail) return "";

    if (detail.loading) {
      return `
        <div class="overlay">
          <div class="detail">
            <button class="close" data-close>×</button>
            <div class="detail-loading-panel" role="status" aria-live="polite">
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
    const isSeries = detail.type === "tv";
    const episodeBrowser = isSeries ? this._renderEpisodeBrowser(detail) : "";
    const showProviderActions = !isSeries;
    const link = detail.providers?.link;

    const providerCards = this._renderProviderCards(detail, providers, isSeries);

    return `
      <div class="overlay" data-overlay>
        <div class="detail">
          <header class="detail-sticky-header">
            <span class="detail-sticky-title" title="${this._esc(title)}">${this._esc(title)}</span>
            <button class="detail-remote-button streaming-remote-toggle"
              type="button" title="TV remote" aria-label="TV remote"
              aria-pressed="${this._remoteExpanded ? "true" : "false"}">
              <ha-icon icon="mdi:remote-tv"></ha-icon>
            </button>
            <button class="close" type="button" data-close aria-label="Close title details">×</button>
          </header>

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
                  this._t("no_synopsis")
              )}
            </div>

            ${episodeBrowser}
            ${showProviderActions ? `
              <div class="provider-title">
                ${this._t("where_to_watch")}
                ${this._esc(this._config.region)}
              </div>
              ${detail.providersLoading
                ? `<p class="episode-link-note" role="status">${this._locale().startsWith("es") ? "Cargando plataformas disponibles…" : "Loading streaming providers…"}</p>`
                : detail.providersError
                  ? `<p class="error" role="alert">${this._esc(detail.providersError)}</p>`
                  : `<div class="provider-grid">${providerCards || this._t("no_providers")}</div>`}
            ` : ""}

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

    if (!this._config.tv_entity || !this._config.tmdb_api_key ||
        this._config.tmdb_api_key === "YOUR_TMDB_V3_API_KEY") {
      this.shadowRoot.innerHTML = `
        <ha-card><div style="padding:16px;line-height:1.5">
          <strong>Set up Streaming Browser</strong><br>
          Edit this card and choose its playback device and enter your TMDB API key.
          Existing cards keep their saved settings.
        </div></ha-card>`;
      return;
    }

    const availableProviders = this._matchedProviders[this._mode] || [];
    const selectedMissing = this._provider !== "all" &&
      !availableProviders.some((item) => String(item.provider_id) === String(this._provider));
    const previousSelection = selectedMissing
      ? [...(this._matchedProviders.movie || []), ...(this._matchedProviders.tv || [])]
          .find((item) => String(item.provider_id) === String(this._provider))
      : null;
    const providers = previousSelection ? [...availableProviders, previousSelection] : availableProviders;
    const activeGenre = this._genreByMode[this._mode] || "all";
    const genreOptions = [
      `<option value="all" ${activeGenre === "all" ? "selected" : ""}>${this._esc(this._t("all_genres"))}</option>`,
      ...(this._genres[this._mode] || []).map((genre) =>
        `<option value="${this._esc(genre.id)}" ${activeGenre === genre.id ? "selected" : ""}>${this._esc(genre.name)}</option>`),
    ].join("");

    const tv = this._tvState();
    const detailScrollTop = this.shadowRoot.querySelector(".detail")?.scrollTop ?? null;

    const posterWidth = Math.max(
      100,
      Number(this._config.poster_width) || 145
    );

    const providerChips = [
      `
        <button
          class="chip ${
            this._provider === "all"
              ? "active"
              : ""
          }"
          data-provider="all"
          title="${this._esc(
            this._t("all_sources")
          )}"
        >
          <ha-icon
            icon="mdi:apps"
          ></ha-icon>
          <span>
            ${this._t(
              "all_sources"
            )}
          </span>
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
                                ? this._t("movie")
                                : this._t("series")
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
                  <h3>${this._esc(
                    section.labelKey
                      ? this._t(
                          section.labelKey,
                          section.labelVars || {}
                        )
                      : section.label || ""
                  )}</h3>

                  <div class="catalog-controls">
                    <button
                      class="row-nav"
                      data-scroll-row="${this._esc(section.key)}"
                      data-direction="-1"
                      aria-label="${this._esc(this._t("scroll_left"))}"
                    >‹</button>

                    <button
                      class="row-nav"
                      data-scroll-row="${this._esc(section.key)}"
                      data-direction="1"
                      aria-label="${this._esc(this._t("scroll_right"))}"
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
                          ${this._t("loading")}
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
          ${this._t("empty_selection")}
        </div>
      `
      : "";

    this.shadowRoot.innerHTML = `
      <style>
        /* Streaming Browser v0.4.98: container-responsive full-width layout. */
        :host {
          display: block;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }

        ha-card {
          width: 100%;
          min-width: 0;
          max-width: 100%;
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
          width: 100%;
          min-width: 0;
          max-width: 100%;
          padding: clamp(12px, 1.8vw, 24px);
          position: relative;
          min-height: 260px;
        }
        .catalog, .catalog-section, .catalog-row {
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }

        .top {
          position: sticky;
          top: 0;
          z-index: 20;
          background: var(--card-background-color);
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }

        .card-version {
          display: block; font-size: 11px; line-height: 1.2;
          color: var(--secondary-text-color); font-weight: 400;
          margin-top: 2px; opacity: .85;
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
          min-width: 0;
          max-width: 100%;
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
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin: 2px 0 12px;
        }
        .genre-select {
          min-width: 132px;
          max-width: min(225px, 50vw);
          min-height: 38px;
          margin-left: 4px;
          padding: 7px 9px;
          border: 1px solid var(--divider-color);
          border-radius: 16px;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
        }
        .genre-select:focus-visible { outline: 2px solid var(--primary-color); }

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
              <span class="card-version">v${STREAMING_BROWSER_VERSION}</span>
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

            <button
              class="streaming-remote-toggle"
              type="button" title="TV remote" aria-label="TV remote"
              aria-pressed="${this._remoteExpanded ? "true" : "false"}"
              style="width:38px;height:38px;flex:0 0 38px;border:0;border-radius:50%;background:var(--secondary-background-color);color:var(--primary-text-color);display:grid;place-items:center;cursor:pointer;"
            ><ha-icon icon="mdi:remote-tv" style="--mdc-icon-size:19px"></ha-icon></button>

            <input
              class="search"
              type="search"
              placeholder="${this._t("search_placeholder")}"
              value="${this._esc(this._query)}"
            >
          </div>

          ${this._config.manual_profile_selection === false ? this._renderProfileSelector() : ""}

          <div class="switcher">
            <button
              class="mode ${
                this._mode === "movie" ? "active" : ""
              }"
              data-mode="movie"
            >
              ${this._t("movies")}
            </button>

            <button
              class="mode ${
                this._mode === "tv" ? "active" : ""
              }"
              data-mode="tv"
            >
              ${this._t("tv_series")}
            </button>
            <select class="genre-select" aria-label="${this._esc(this._t("genre"))}"
              title="${this._esc(this._t("genre"))}">${genreOptions}</select>
          </div>

          <div class="chips">
            ${providerChips}
          </div>

          ${
            this._platform() !== "android_tv" &&
            !this._tvSources().length
              ? `
                <div class="error">
                  ${this._t("no_source_list")}
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
                  ${this._t("loading_catalog")}
                </div>
              `
              : `
                <div class="catalog">
                  ${sectionsHtml}
                </div>
              `
          }

          ${this._config.manual_profile_selection === false ? `
          <div class="note">
            ${this._t("active_profile")}
            <b>${this._esc(this._selectedProfile || this._t("none"))}</b>.
            ${this._t("footer_note")}
          </div>
          ` : ""}

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

    if (detailScrollTop !== null) {
      const detailPane = this.shadowRoot.querySelector(".detail");
      if (detailPane) detailPane.scrollTop = detailScrollTop;
    }
    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  _bindEvents() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll(".streaming-remote-toggle").forEach((button) =>
      button.addEventListener("click", () => this._toggleNuvioRemote())
    );
    this._updateNuvioRemoteButton();

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
          this._ensureSelectedProvider();
          this._rowScrollPositions.clear();
          this._query = "";
          await this._loadBrowse();
        })
      );

    root.querySelector(".genre-select")?.addEventListener("change", async (event) => {
      const genre = String(event.target.value);
      if (genre !== "all" && !(this._genres[this._mode] || []).some((g) => g.id === genre)) return;
      if (this._genreByMode[this._mode] === genre) return;
      this._genreByMode[this._mode] = genre;
      this._query = "";
      this._rowScrollPositions.clear();
      await this._loadBrowse();
    });

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

    this._bindDetailBodyActions(root);
  }
}


class StreamingBrowserV2CardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._providers = [];
    this._providersLoading = false;
    this._providersError = "";
    this._providerQuery = "";
    this._providerLoadToken = 0;
  }

  set hass(hass) {
    this._hass = hass;
    // Frequent HA state updates must NOT destroy and recreate ha-form: that
    // resets the expandable sections on every state change or input event.
    if (this.shadowRoot?.querySelector("#base ha-form")) {
      this._syncEditorForm();
    } else {
      this._render();
    }
  }

  setConfig(config) {
    const previous = this._config;
    const next = {
      selected_provider_ids: [
        ...STREAMING_BROWSER_BACKEND.defaultProviderIds,
      ],
      ...config,
    };
    const changed = JSON.stringify(previous) !== JSON.stringify(next);
    this._config = next;

    if (this.shadowRoot?.querySelector("#base ha-form")) {
      // ha-form already owns the value entered by the user. Do not push the
      // same value back into it on every config-changed event.
      this._syncEditorForm(changed);
    } else {
      this._render();
    }
    if (!previous || previous.region !== next.region ||
        previous.language !== next.language ||
        previous.tmdb_api_key !== next.tmdb_api_key) {
      this._loadProviders();
    }
  }

  connectedCallback() {
    this._render();
    if (this._config && !this._providers.length && !this._providersLoading) {
      this._loadProviders();
    }
  }

  _syncEditorForm(updateData = false) {
    const form = this.shadowRoot?.querySelector("#base ha-form");
    if (!form || !this._config) return;
    form.hass = this._hass;
    if (updateData) form.data = this._config;
    const formConfig = StreamingBrowserV2Card.getConfigForm(this._hass, this._config);
    const hdmiSection = formConfig.schema.find((item) => item.title === "HDMI / remote");
    const hdmiSelector = hdmiSection?.schema?.find((item) => item.name === "display_source");
    const key = JSON.stringify([
      this._config.display_entity || "",
      hdmiSelector?.selector?.select?.options || [],
    ]);
    if (key !== this._hdmiSchemaKey) {
      this._hdmiSchemaKey = key;
      // Update only when the display TV or its source_list actually changes.
      // The form element is never replaced, so other expanded sections stay open.
      form.schema = formConfig.schema;
    }
  }

  _emitConfig(config) {
    this._config = config;

    this.dispatchEvent(
      new CustomEvent(
        "config-changed",
        {
          detail: { config },
          bubbles: true,
          composed: true,
        }
      )
    );
  }

  _selectedIds() {
    const values =
      this._config?.selected_provider_ids;

    return new Set(
      (
        Array.isArray(values)
          ? values
          : STREAMING_BROWSER_BACKEND
              .defaultProviderIds
      ).map((id) => String(id))
    );
  }

  async _tmdb(path, params = {}) {
    const key =
      this._config?.tmdb_api_key;

    if (
      !key ||
      key === "YOUR_TMDB_V3_API_KEY"
    ) {
      throw new Error(
        "Enter the TMDB API key first."
      );
    }

    const url = new URL(
      "https://api.themoviedb.org/3" +
        path
    );

    url.searchParams.set(
      "api_key",
      key
    );

    Object.entries(params)
      .filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== ""
      )
      .forEach(([name, value]) =>
        url.searchParams.set(
          name,
          String(value)
        )
      );

    const response =
      await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        "TMDB provider request failed (" +
          response.status +
          ")."
      );
    }

    return response.json();
  }

  async _loadProviders() {
    if (!this._config) {
      return;
    }

    const token =
      ++this._providerLoadToken;

    this._providersLoading = true;
    this._providersError = "";
    this._renderProviders();

    try {
      const region =
        String(
          this._config.region || "MX"
        ).toUpperCase();

      const language =
        this._config.language ||
        "en-US";

      const [movieData, tvData] =
        await Promise.all([
          this._tmdb(
            "/watch/providers/movie",
            {
              watch_region: region,
              language,
            }
          ),
          this._tmdb(
            "/watch/providers/tv",
            {
              watch_region: region,
              language,
            }
          ),
        ]);

      if (
        token !==
        this._providerLoadToken
      ) {
        return;
      }

      const map = new Map();

      for (
        const provider of [
          ...(movieData.results || []),
          ...(tvData.results || []),
        ]
      ) {
        const key =
          String(
            provider.provider_id
          );

        const existing =
          map.get(key);

        if (!existing) {
          map.set(
            key,
            {
              ...provider,
              movie: (
                movieData.results || []
              ).some(
                (item) =>
                  String(
                    item.provider_id
                  ) === key
              ),
              tv: (
                tvData.results || []
              ).some(
                (item) =>
                  String(
                    item.provider_id
                  ) === key
              ),
            }
          );
        } else {
          existing.movie =
            existing.movie ||
            (
              movieData.results || []
            ).some(
              (item) =>
                String(
                  item.provider_id
                ) === key
            );

          existing.tv =
            existing.tv ||
            (
              tvData.results || []
            ).some(
              (item) =>
                String(
                  item.provider_id
                ) === key
            );
        }
      }

      this._providers =
        [...map.values()].sort(
          (a, b) =>
            (
              a.display_priority ??
              999
            ) -
              (
                b.display_priority ??
                999
              ) ||
            String(
              a.provider_name
            ).localeCompare(
              String(
                b.provider_name
              )
            )
        );
    } catch (err) {
      if (
        token !==
        this._providerLoadToken
      ) {
        return;
      }

      this._providers = [];
      this._providersError =
        err?.message ||
        String(err);
    } finally {
      if (
        token ===
        this._providerLoadToken
      ) {
        this._providersLoading =
          false;
        this._renderProviders();
      }
    }
  }

  _toggleProvider(
    providerId,
    checked
  ) {
    const selected =
      this._selectedIds();

    const key =
      String(providerId);

    if (checked) {
      selected.add(key);
    } else {
      selected.delete(key);
    }

    const ids =
      [...selected]
        .map((id) => Number(id))
        .filter(Number.isFinite);

    this._emitConfig({
      ...this._config,
      selected_provider_ids: ids,
    });

    this._renderProviders();
  }

  _setAllProviders(selected) {
    const ids =
      selected
        ? this._providers.map(
            (provider) =>
              Number(
                provider.provider_id
              )
          )
        : [];

    this._emitConfig({
      ...this._config,
      selected_provider_ids: ids,
    });

    this._renderProviders();
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    if (this.shadowRoot.querySelector("#base ha-form")) {
      this._syncEditorForm();
      this._renderProviders();
      return;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .providers {
          margin-top: 18px;
          padding-top: 16px;
          border-top:
            1px solid
            var(--divider-color);
        }

        .providers h3 {
          margin: 0 0 4px;
          font-size: 16px;
        }

        .help {
          margin: 0 0 12px;
          opacity: .7;
          font-size: 13px;
          line-height: 1.4;
        }

        .provider-toolbar {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .provider-search {
          flex: 1 1 220px;
          border:
            1px solid
            var(--divider-color);
          background:
            var(
              --secondary-background-color
            );
          color:
            var(--primary-text-color);
          border-radius: 10px;
          padding: 9px 10px;
          font: inherit;
        }

        button {
          border:
            1px solid
            var(--divider-color);
          background:
            var(
              --secondary-background-color
            );
          color:
            var(--primary-text-color);
          border-radius: 10px;
          padding: 8px 10px;
          cursor: pointer;
          font: inherit;
        }

        .provider-list {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fill,
              minmax(220px, 1fr)
            );
          gap: 8px;
          max-height: 390px;
          overflow: auto;
          padding: 2px;
        }

        .provider-item {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
          padding: 8px 9px;
          border:
            1px solid
            var(--divider-color);
          border-radius: 10px;
          background:
            var(
              --secondary-background-color
            );
          cursor: pointer;
        }

        .provider-item img {
          width: 34px;
          height: 34px;
          border-radius: 7px;
          object-fit: contain;
          background: white;
          flex: 0 0 auto;
        }

        .provider-name {
          min-width: 0;
          flex: 1;
        }

        .provider-name strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .provider-name small {
          opacity: .65;
        }

        .status {
          padding: 12px 0;
          opacity: .7;
          font-size: 13px;
        }

        .error {
          color:
            var(
              --error-color,
              #db4437
            );
        }
      </style>

      <div id="base"></div>

      <section class="providers">
        <h3>TMDB Providers</h3>
        <p class="help">
          Choose which TMDB watch providers are shown as app tabs.
          The list is loaded for the configured region.
          App/profile navigation remains managed internally by the card.
        </p>

        <div class="provider-toolbar">
          <input
            id="provider-search"
            class="provider-search"
            type="search"
            placeholder="Search providers"
            value="${this._escape(
              this._providerQuery
            )}"
          >

          <button
            type="button"
            data-provider-all
          >
            Select all
          </button>

          <button
            type="button"
            data-provider-none
          >
            Clear
          </button>
        </div>

        <div
          id="provider-list"
          class="provider-list"
        ></div>
      </section>
    `;

    const base =
      this.shadowRoot
        .querySelector("#base");

    const form =
      document.createElement(
        "ha-form"
      );

    const formConfig = StreamingBrowserV2Card.getConfigForm(this._hass, this._config);
    const hdmiSection = formConfig.schema.find((item) => item.title === "HDMI / remote");
    const hdmiSelector = hdmiSection?.schema?.find((item) => item.name === "display_source");
    this._hdmiSchemaKey = JSON.stringify([
      this._config.display_entity || "",
      hdmiSelector?.selector?.select?.options || [],
    ]);

    form.hass = this._hass;
    form.data = this._config;
    form.schema =
      formConfig.schema;
    form.computeLabel =
      formConfig.computeLabel;
    form.computeHelper =
      formConfig.computeHelper;

    form.addEventListener(
      "value-changed",
      (event) => {
        const oldDisplay = this._config?.display_entity;
        const oldRegion =
          this._config?.region;
        const oldKey =
          this._config
            ?.tmdb_api_key;
        const oldLanguage =
          this._config
            ?.language;

        const next = {
          ...this._config,
          ...(event.detail?.value ||
            {}),
        };

        if (oldDisplay !== next.display_entity) {
          // Never carry a stale HDMI input across two different display TVs.
          next.display_source = "";
        }
        this._emitConfig(next);
        if (oldDisplay !== next.display_entity) {
          this._syncEditorForm(true);
        }

        if (
          oldRegion !==
            next.region ||
          oldKey !==
            next.tmdb_api_key ||
          oldLanguage !==
            next.language
        ) {
          this._loadProviders();
        }
      }
    );

    base.appendChild(form);

    this.shadowRoot
      .querySelector(
        "#provider-search"
      )
      ?.addEventListener(
        "input",
        (event) => {
          this._providerQuery =
            event.target.value || "";

          this._renderProviders();
        }
      );

    this.shadowRoot
      .querySelector(
        "[data-provider-all]"
      )
      ?.addEventListener(
        "click",
        () =>
          this._setAllProviders(true)
      );

    this.shadowRoot
      .querySelector(
        "[data-provider-none]"
      )
      ?.addEventListener(
        "click",
        () =>
          this._setAllProviders(false)
      );

    this._renderProviders();
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  _renderProviders() {
    const root =
      this.shadowRoot?.querySelector(
        "#provider-list"
      );

    if (!root) {
      return;
    }

    if (this._providersLoading) {
      root.innerHTML =
        '<div class="status">Loading TMDB providers…</div>';
      return;
    }

    if (this._providersError) {
      root.innerHTML =
        '<div class="status error">' +
        this._escape(
          this._providersError
        ) +
        "</div>";
      return;
    }

    const query =
      String(
        this._providerQuery || ""
      ).trim().toLowerCase();

    const selected =
      this._selectedIds();

    const providers =
      this._providers.filter(
        (provider) =>
          !query ||
          String(
            provider.provider_name
          )
            .toLowerCase()
            .includes(query)
      );

    if (!providers.length) {
      root.innerHTML =
        '<div class="status">No providers found.</div>';
      return;
    }

    root.innerHTML =
      providers
        .map((provider) => {
          const id =
            String(
              provider.provider_id
            );

          const checked =
            selected.has(id)
              ? "checked"
              : "";

          const types = [
            provider.movie
              ? "Movies"
              : "",
            provider.tv
              ? "TV"
              : "",
          ]
            .filter(Boolean)
            .join(" · ");

          const logo =
            provider.logo_path
              ? "https://image.tmdb.org/t/p/w92" +
                provider.logo_path
              : "";

          return `
            <label
              class="provider-item"
            >
              <input
                type="checkbox"
                data-provider-id="${this._escape(
                  id
                )}"
                ${checked}
              >

              ${
                logo
                  ? `
                    <img
                      src="${this._escape(
                        logo
                      )}"
                      alt=""
                    >
                  `
                  : ""
              }

              <span
                class="provider-name"
              >
                <strong>
                  ${this._escape(
                    provider.provider_name
                  )}
                </strong>
                <small>
                  ${this._escape(
                    types
                  )}
                </small>
              </span>
            </label>
          `;
        })
        .join("");

    root
      .querySelectorAll(
        "[data-provider-id]"
      )
      .forEach((input) =>
        input.addEventListener(
          "change",
          () =>
            this._toggleProvider(
              input.dataset
                .providerId,
              input.checked
            )
        )
      );
  }
}

if (
  !customElements.get(
    "streaming-browser-card-v2-editor"
  )
) {
  customElements.define(
    "streaming-browser-card-v2-editor",
    StreamingBrowserV2CardEditor
  );
}

if (!customElements.get("streaming-browser-card-v2")) {
  customElements.define(
    "streaming-browser-card-v2",
    StreamingBrowserV2Card
  );
}

// Make Streaming Browser searchable by name in Home Assistant's Add card picker.
// Refresh metadata from a previously loaded resource without adding duplicates.
window.customCards = Array.isArray(window.customCards) ? window.customCards : [];
const streamingBrowserPickerEntry = {
  type: "streaming-browser-card-v2",
  name: "Streaming Browser Card V2",
  description: "Browse streaming movies and series; open titles on your TV or this device.",
  preview: false,
  documentationURL: "https://github.com/fVaqueroG/streaming-browser--card",
};
const streamingBrowserPreviousPickerEntry = window.customCards.find(
  (card) => card?.type === streamingBrowserPickerEntry.type
);
if (streamingBrowserPreviousPickerEntry) {
  Object.assign(streamingBrowserPreviousPickerEntry, streamingBrowserPickerEntry);
} else {
  window.customCards.push(streamingBrowserPickerEntry);
}

console.info(
  "%c STREAMING-BROWSER-CARD %c v0.4.77 ",
  "color:white;background:#03a9f4;font-weight:bold;",
  "color:#03a9f4;background:white;font-weight:bold;"
);

/* Streaming Browser v0.4.78: room and connection routing. Bundled into the card. */
(() => {
  const Card = StreamingBrowserV2Card;
  const Editor = StreamingBrowserV2CardEditor;
  const cardSetConfig = Card.prototype.setConfig;
  const cardRender = Card.prototype._render;
  const editorRender = Editor.prototype._render;
  const editorSync = Editor.prototype._syncEditorForm;
  const originalConfigForm = Card.getConfigForm;
  const roomList = (config) => Array.isArray(config?.rooms) ? config.rooms : [];
  const routes = (room) => Array.isArray(room?.connections) ? room.connections : [];
  const choice = (room, id) => routes(room).find((entry) => entry.id === id) ||
    routes(room).find((entry) => entry.id === room.default_connection_id) || routes(room)[0];
  const uniqueId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const escape = (value) => String(value ?? '').replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const strings = (language) => String(language || '').toLowerCase().startsWith('es') ? {
    room: 'Habitación', device: 'Dispositivo', rooms: 'Habitaciones y conexiones',
    addRoom: 'Agregar habitación', addConnection: 'Agregar conexión', remove: 'Eliminar',
    default: 'Predeterminado', makeDefault: 'Usar de forma predeterminada',
    roomName: 'Nombre de la habitación', connectionName: 'Nombre de la conexión',
    player: 'Reproductor', display: 'Televisor / pantalla (opcional)',
    hdmi: 'Entrada HDMI del televisor', remote: 'Control remoto', adb: 'Reproductor ADB (opcional)',
    delay: 'Espera HDMI (ms)', platform: 'Plataforma', noRooms: 'Agrega una habitación para activar el selector.',
    invalid: 'Selecciona un reproductor para esta conexión.',
  } : {
    room: 'Room', device: 'Device', rooms: 'Rooms & connections',
    addRoom: 'Add room', addConnection: 'Add connection', remove: 'Remove',
    default: 'Default', makeDefault: 'Set as default',
    roomName: 'Room name', connectionName: 'Connection name',
    player: 'Playback device', display: 'Display TV (optional)',
    hdmi: 'HDMI input on display TV', remote: 'Remote entity', adb: 'ADB media player (optional)',
    delay: 'HDMI switch delay (ms)', platform: 'Platform', noRooms: 'Add a room to enable room selection.',
    invalid: 'Select a media player for this connection.',
  };

  Card.getConfigForm = function(hass, config = {}) {
    const form = originalConfigForm.call(this, hass, config);
    if (!roomList(config).length) return form;
    for (const section of form.schema) {
      if (section.title === 'General') {
        section.schema = section.schema.filter((item) =>
          !['tv_entity', 'platform', 'remote_entity', 'adb_entity'].includes(item.name));
      } else if (section.title === 'HDMI / remote') {
        section.schema = section.schema.filter((item) =>
          !['display_entity', 'display_source', 'display_source_delay_ms'].includes(item.name));
      }
    }
    return form;
  };

  Card.prototype._roomStored = function() {
    try { return JSON.parse(localStorage.getItem(this._roomStorageKey) || '{}') || {}; }
    catch (_) { return {}; }
  };
  Card.prototype._roomSave = function() {
    try { localStorage.setItem(this._roomStorageKey, JSON.stringify({
      room: this._activeRoomId, connections: this._activeConnections || {},
    })); } catch (_) { /* Private browsing or disabled local storage. */ }
  };
  Card.prototype._roomCurrent = function() {
    return roomList(this._roomConfig).find((room) => room.id === this._activeRoomId) ||
      roomList(this._roomConfig)[0];
  };
  Card.prototype._roomConnection = function(room = this._roomCurrent()) {
    return room && choice(room, this._activeConnections?.[room.id]);
  };
  Card.prototype._roomEffectiveConfig = function() {
    const room = this._roomCurrent();
    const selected = this._roomConnection(room);
    if (!selected) return { ...this._roomConfig };
    return {
      ...this._roomConfig,
      platform: selected.platform || 'webos',
      tv_entity: selected.tv_entity || '',
      display_entity: selected.display_entity || null,
      display_source: selected.display_entity ? (selected.display_source || '') : '',
      display_source_delay_ms: Number(selected.display_source_delay_ms ?? 2500),
      remote_entity: selected.remote_entity || null,
      adb_entity: selected.adb_entity || null,
    };
  };
  Card.prototype.setConfig = function(config) {
    this._roomConfig = { ...config };
    this._roomStorageKey = 'streaming-browser:room:' +
      (config.room_storage_key || config.title || 'default');
    const saved = this._roomStored();
    const available = roomList(config);
    this._activeRoomId = available.some((room) => room.id === this._activeRoomId)
      ? this._activeRoomId : available.some((room) => room.id === saved.room)
        ? saved.room : available[0]?.id;
    this._activeConnections = { ...(saved.connections || {}), ...(this._activeConnections || {}) };
    cardSetConfig.call(this, this._roomEffectiveConfig());
  };
  Card.prototype._selectRoomRoute = function(roomId, connectionId) {
    const selectedRoom = roomList(this._roomConfig).find((room) => room.id === roomId);
    if (!selectedRoom) return;
    const selectedConnection = choice(selectedRoom, connectionId);
    if (!selectedConnection) return;
    if (roomId === this._activeRoomId &&
        selectedConnection.id === this._roomConnection()?.id) return;
    const positions = new Map();
    this.shadowRoot?.querySelectorAll('.catalog-row[data-section]').forEach((row) =>
      positions.set(row.dataset.section, row.scrollLeft));
    const detailTop = this.shadowRoot?.querySelector('.detail')?.scrollTop;
    this._activeRoomId = roomId;
    this._activeConnections[selectedRoom.id] = selectedConnection.id;
    this._roomSave();
    if (this._remoteExpanded) {
      this._remoteExpanded = false;
      this._remotePortal?.remove();
      this._remotePortal = null;
    }
    this._config = { ...this._config, ...this._roomEffectiveConfig() };
    this._lastTvSourcesKey = '';
    if (this._providers.movie.length || this._providers.tv.length) {
      this._matchProvidersToTv();
    }
    this._render();
    this.shadowRoot?.querySelectorAll('.catalog-row[data-section]').forEach((row) => {
      if (positions.has(row.dataset.section)) row.scrollLeft = positions.get(row.dataset.section);
    });
    if (detailTop != null) {
      const pane = this.shadowRoot?.querySelector('.detail');
      if (pane) pane.scrollTop = detailTop;
    }
  };
  Card.prototype._render = function(...args) {
    cardRender.apply(this, args);
    const available = roomList(this._roomConfig);
    const top = this.shadowRoot?.querySelector('.top');
    if (!available.length || !top) return;
    const room = this._roomCurrent();
    if (!room) return;
    const currentConnection = this._roomConnection(room);
    const t = strings(this._config?.language || this._hass?.language);
    const controls = document.createElement('div');
    controls.className = 'sbr-room-controls';
    controls.innerHTML = `
      <label class="sbr-route-label">${escape(t.room)}
        <select class="sbr-room-select" aria-label="${escape(t.room)}">
          ${available.map((item) => `<option value="${escape(item.id)}" ${room.id === item.id ? 'selected' : ''}>${escape(item.name || t.room)}</option>`).join('')}
        </select>
      </label>
      ${routes(room).length > 1 ? `<label class="sbr-route-label">${escape(t.device)}
        <select class="sbr-connection-select" aria-label="${escape(t.device)}">
          ${routes(room).map((item) => `<option value="${escape(item.id)}" ${currentConnection?.id === item.id ? 'selected' : ''}>${escape(item.name || item.tv_entity || t.device)}</option>`).join('')}
        </select></label>` : ''}
      ${currentConnection && !currentConnection.tv_entity ? `<span class="sbr-route-error">${escape(t.invalid)}</span>` : ''}
      <style>
        .sbr-room-controls { display:flex; flex:1 1 220px; min-width:0; align-items:center; gap:8px; flex-wrap:wrap; }
        .sbr-route-label { display:flex; flex:1 1 130px; min-width:110px; flex-direction:column; gap:2px; font-size:11px; opacity:.9; }
        .sbr-route-label select { width:100%; color:var(--primary-text-color); background:var(--card-background-color,var(--secondary-background-color)); border:1px solid var(--divider-color); padding:7px 9px; border-radius:9px; font:inherit; font-size:13px; }
        .sbr-route-error { font-size:12px; color:var(--error-color,#db4437); }
      </style>`;
    top.insertBefore(controls, top.querySelector('.tvstate'));
    controls.querySelector('.sbr-room-select')?.addEventListener('change', (event) =>
      this._selectRoomRoute(event.target.value, null));
    controls.querySelector('.sbr-connection-select')?.addEventListener('change', (event) =>
      this._selectRoomRoute(room.id, event.target.value));
  };

  Editor.prototype._roomMutate = function(mutator) {
    const next = structuredClone(this._config || {});
    next.rooms = roomList(next);
    mutator(next);
    this._emitConfig(next);
    const form = this.shadowRoot?.querySelector('#base ha-form');
    if (form) {
      const schema = Card.getConfigForm(this._hass, next);
      form.schema = schema.schema;
      form.data = next;
    }
    this._renderRoomEditor();
  };
  Editor.prototype._roomEntityOptions = function(domain, selected) {
    const entities = Object.entries(this._hass?.states || {})
      .filter(([id]) => id.startsWith(domain + '.'))
      .sort((a, b) => String(a[1]?.attributes?.friendly_name || a[0])
        .localeCompare(String(b[1]?.attributes?.friendly_name || b[0])));
    const options = [`<option value="">—</option>`];
    if (selected && !entities.some(([id]) => id === selected)) {
      options.push(`<option value="${escape(selected)}" selected>${escape(selected)}</option>`);
    }
    for (const [id, state] of entities) {
      options.push(`<option value="${escape(id)}" ${id === selected ? 'selected' : ''}>${escape(state.attributes?.friendly_name || id)} (${escape(id)})</option>`);
    }
    return options.join('');
  };
  Editor.prototype._roomHdmiOptions = function(entity, selected) {
    const sources = this._hass?.states?.[entity]?.attributes?.source_list;
    const available = Array.isArray(sources) ? sources.filter((source) =>
      typeof source === 'string' && /\bHDMI(?:\b|(?=\d))/i.test(source)) : [];
    if (selected && !available.includes(selected)) available.unshift(selected);
    return [`<option value="">—</option>`, ...[...new Set(available)].map((source) =>
      `<option value="${escape(source)}" ${source === selected ? 'selected' : ''}>${escape(source)}</option>`)].join('');
  };
  Editor.prototype._renderRoomEditor = function() {
    const base = this.shadowRoot?.querySelector('#base');
    if (!base || !this._config) return;
    const previous = this.shadowRoot.querySelector('#sbr-room-editor');
    const expanded = new Set(previous ? [...previous.querySelectorAll('details[open]')].map((item) => item.dataset.key) : []);
    const fresh = !previous;
    const section = document.createElement('section');
    section.id = 'sbr-room-editor';
    const t = strings(this._config.language || this._hass?.language);
    const rooms = roomList(this._config);
    const field = (label, key, value, ri, ci = '') => `<label>${escape(label)}
      <input data-ri="${ri}" data-ci="${ci}" data-field="${escape(key)}" value="${escape(value)}"></label>`;
    const select = (label, key, options, ri, ci) => `<label>${escape(label)}<select data-ri="${ri}" data-ci="${ci}" data-field="${escape(key)}">${options}</select></label>`;
    const platformOptions = (selected) => [['webos','LG webOS'], ['android_tv','Android TV'], ['roku','Roku']]
      .map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
    section.innerHTML = `<style>
      #sbr-room-editor { margin:14px 0; border:1px solid var(--divider-color); border-radius:12px; padding:12px; }
      #sbr-room-editor h3 { margin:0 0 10px; font-size:16px; }
      #sbr-room-editor details { border:1px solid var(--divider-color); border-radius:10px; padding:8px 10px; margin:9px 0; }
      #sbr-room-editor summary { cursor:pointer; padding:4px; font-weight:600; }
      #sbr-room-editor .sbr-route-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; padding:10px 0; }
      #sbr-room-editor label { display:flex; flex-direction:column; gap:5px; font-size:12px; }
      #sbr-room-editor input, #sbr-room-editor select { width:100%; min-width:0; box-sizing:border-box; padding:9px; border-radius:8px; border:1px solid var(--divider-color); background:var(--card-background-color,var(--secondary-background-color)); color:var(--primary-text-color); font:inherit; }
      #sbr-room-editor .sbr-route-actions { display:flex; gap:8px; flex-wrap:wrap; margin:6px 0; }
      #sbr-room-editor button { border:1px solid var(--divider-color); border-radius:9px; padding:8px 10px; background:var(--secondary-background-color); color:var(--primary-text-color); cursor:pointer; }
      #sbr-room-editor .sbr-route-note { font-size:12px; opacity:.7; }
    </style><h3>${escape(t.rooms)}</h3>
    ${rooms.length ? rooms.map((room, ri) => `
      <details data-key="room:${escape(room.id)}" ${fresh && ri === 0 || expanded.has('room:' + room.id) ? 'open' : ''}>
        <summary>${escape(room.name || `${t.room} ${ri + 1}`)} · ${routes(room).length} ${escape(t.device)}</summary>
        <div class="sbr-route-grid">${field(t.roomName, 'name', room.name || '', ri)}</div>
        ${routes(room).map((entry, ci) => `
          <details data-key="connection:${escape(entry.id)}" ${fresh && ci === 0 && ri === 0 || expanded.has('connection:' + entry.id) ? 'open' : ''}>
            <summary>${escape(entry.name || `${t.device} ${ci + 1}`)} ${room.default_connection_id === entry.id ? '★' : ''}</summary>
            <div class="sbr-route-grid">
              ${field(t.connectionName, 'name', entry.name || '', ri, ci)}
              ${select(t.platform, 'platform', platformOptions(entry.platform || 'webos'), ri, ci)}
              ${select(t.player, 'tv_entity', this._roomEntityOptions('media_player', entry.tv_entity), ri, ci)}
              ${select(t.display, 'display_entity', this._roomEntityOptions('media_player', entry.display_entity), ri, ci)}
              ${select(t.hdmi, 'display_source', this._roomHdmiOptions(entry.display_entity, entry.display_source), ri, ci)}
              ${select(t.remote, 'remote_entity', this._roomEntityOptions('remote', entry.remote_entity), ri, ci)}
              ${select(t.adb, 'adb_entity', this._roomEntityOptions('media_player', entry.adb_entity), ri, ci)}
              ${field(t.delay, 'display_source_delay_ms', entry.display_source_delay_ms ?? 2500, ri, ci)}
            </div>
            <div class="sbr-route-actions">
              <button data-action="default" data-ri="${ri}" data-ci="${ci}" ${room.default_connection_id === entry.id ? 'disabled' : ''}>${escape(room.default_connection_id === entry.id ? t.default : t.makeDefault)}</button>
              <button data-action="remove-connection" data-ri="${ri}" data-ci="${ci}">${escape(t.remove)}</button>
            </div>
          </details>`).join('')}
        <div class="sbr-route-actions"><button data-action="add-connection" data-ri="${ri}">+ ${escape(t.addConnection)}</button>
          <button data-action="remove-room" data-ri="${ri}">${escape(t.remove)}</button></div>
      </details>`).join('') : `<p class="sbr-route-note">${escape(t.noRooms)}</p>`}
    <button data-action="add-room">+ ${escape(t.addRoom)}</button>`;
    if (previous) previous.replaceWith(section);
    else base.insertAdjacentElement('afterend', section);
    section.addEventListener('change', (event) => {
      const target = event.target;
      if (!target.matches('[data-field]')) return;
      const ri = Number(target.dataset.ri);
      const ci = target.dataset.ci === '' ? null : Number(target.dataset.ci);
      const fieldName = target.dataset.field;
      this._roomMutate((config) => {
        const item = ci === null ? config.rooms[ri] : config.rooms[ri]?.connections?.[ci];
        if (!item) return;
        item[fieldName] = fieldName === 'display_source_delay_ms' ?
          Math.max(0, Math.min(20000, Number(target.value) || 0)) : target.value;
        if (fieldName === 'display_entity' && ci !== null) item.display_source = '';
      });
    });
    section.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      const ri = Number(button.dataset.ri);
      const ci = Number(button.dataset.ci);
      this._roomMutate((config) => {
        if (action === 'add-room') {
          const id = uniqueId('room');
          const entry = { id: uniqueId('connection'), name: 'TV', platform: config.platform || 'webos',
            tv_entity: config.rooms.length ? '' : (config.tv_entity || ''),
            display_entity: config.rooms.length ? '' : (config.display_entity || ''),
            display_source: config.rooms.length ? '' : (config.display_source || ''),
            remote_entity: config.rooms.length ? '' : (config.remote_entity || ''),
            adb_entity: config.rooms.length ? '' : (config.adb_entity || ''),
            display_source_delay_ms: Number(config.display_source_delay_ms ?? 2500) };
          config.rooms.push({ id, name: `${t.room} ${config.rooms.length + 1}`,
            default_connection_id: entry.id, connections: [entry] });
        } else if (action === 'remove-room') {
          config.rooms.splice(ri, 1);
        } else if (action === 'add-connection') {
          config.rooms[ri]?.connections?.push({ id: uniqueId('connection'), name: `${t.device} ${routes(config.rooms[ri]).length + 1}`,
            platform: 'webos', tv_entity: '', display_entity: '', display_source: '',
            remote_entity: '', adb_entity: '', display_source_delay_ms: 2500 });
        } else if (action === 'remove-connection') {
          const room = config.rooms[ri];
          if (!room) return;
          const removed = room.connections.splice(ci, 1)[0];
          if (removed?.id === room.default_connection_id) room.default_connection_id = room.connections[0]?.id || '';
        } else if (action === 'default') {
          const room = config.rooms[ri];
          if (room?.connections?.[ci]) room.default_connection_id = room.connections[ci].id;
        }
      });
    });
  };
  Editor.prototype._render = function(...args) {
    editorRender.apply(this, args);
    this._renderRoomEditor();
  };
  Editor.prototype._syncEditorForm = function(...args) {
    editorSync.apply(this, args);
    const rooms = roomList(this._config);
    const sourceKey = JSON.stringify(rooms.map((room) => routes(room).map((entry) => [
      entry.display_entity,
      this._hass?.states?.[entry.display_entity]?.attributes?.source_list || [],
    ])));
    if (sourceKey !== this._roomSourceKey) {
      this._roomSourceKey = sourceKey;
      this._renderRoomEditor();
    }
  };
})();

/* Streaming Browser v0.4.79: optional per-connection power helper. */
(() => {
  const Card = StreamingBrowserV2Card;
  const Editor = StreamingBrowserV2CardEditor;
  const originalPrepareDisplay = Card.prototype._prepareDisplayRoute;
  const originalEnsureTvOn = Card.prototype._ensureTvOn;
  const originalCardRender = Card.prototype._render;
  const originalRoomEditorRender = Editor.prototype._renderRoomEditor;
  const html = (value) => String(value ?? '').replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const locale = (card) => String(card._config?.language || card._hass?.language || 'en')
    .toLowerCase().startsWith('es');
  const clampDelay = (value) => Math.min(60000, Math.max(0, Number(value) || 0));
  const entityDomain = (entity) => String(entity || '').split('.')[0];
  const validEntity = (entity) => /^(?:switch|input_boolean)\.[a-z0-9_]+$/.test(String(entity || ''));

  Card.prototype._roomPowerConnection = function() {
    return typeof this._roomConnection === 'function' ? this._roomConnection() : null;
  };
  Card.prototype._roomPowerKey = function() {
    const connection = this._roomPowerConnection();
    return connection?.power_entity ? `${this._activeRoomId}:${connection.id}:${connection.power_entity}` : '';
  };
  Card.prototype._roomPowerRefresh = function() {
    const root = this.shadowRoot;
    const holder = root?.querySelector('.sbr-power-controls');
    if (!holder) return;
    const connection = this._roomPowerConnection();
    const entity = String(connection?.power_entity || '');
    const state = this._hass?.states?.[entity]?.state || 'unavailable';
    const busy = !!this._roomPowerPending;
    const es = locale(this);
    const status = holder.querySelector('.sbr-power-status');
    if (status) status.textContent = busy ? (es ? 'Iniciando…' : 'Starting…') :
      state === 'on' ? (es ? 'Encendido' : 'On') :
      state === 'off' ? (es ? 'Apagado' : 'Off') : (es ? 'No disponible' : 'Unavailable');
    holder.querySelectorAll('button').forEach((button) => {
      button.disabled = busy || !validEntity(entity) || !this._hass?.states?.[entity] ||
        ['unavailable', 'unknown'].includes(state) ||
        (button.dataset.power === 'on' && state === 'on') ||
        (button.dataset.power === 'off' && state === 'off');
    });
  };
  Card.prototype._roomEnsurePowerOn = async function() {
    const connection = this._roomPowerConnection();
    const entity = String(connection?.power_entity || '').trim();
    if (!entity) return;
    if (!validEntity(entity)) throw new Error('Power helper must be a switch or input_boolean entity.');
    const state = this._hass?.states?.[entity];
    if (!state || ['unavailable', 'unknown'].includes(state.state)) {
      throw new Error(`Power helper is unavailable: ${entity}`);
    }
    if (state.state === 'on') return;
    const key = this._roomPowerKey();
    if (this._roomPowerPending?.key === key) return this._roomPowerPending.promise;
    // Home Assistant may not have received the changed switch state yet. Do not
    // send duplicate turn_on commands while the connected device is booting.
    if (this._roomPowerLastOn?.key === key && Date.now() - this._roomPowerLastOn.at < 20000) return;
    const pending = { key, promise: null };
    this._roomPowerPending = pending;
    pending.promise = (async () => {
      this._roomPowerRefresh();
      await this._hass.callService(entityDomain(entity), 'turn_on', { entity_id: entity });
      this._roomPowerLastOn = { key, at: Date.now() };
      const delay = clampDelay(connection.power_on_delay_ms ?? 5000);
      if (delay) await this._sleep(delay);
    })();
    try {
      await pending.promise;
    } finally {
      if (this._roomPowerPending === pending) this._roomPowerPending = null;
      this._roomPowerRefresh();
    }
  };
  Card.prototype._roomSetPower = async function(on) {
    const connection = this._roomPowerConnection();
    const entity = String(connection?.power_entity || '').trim();
    if (!entity || !validEntity(entity)) return;
    if (on) return this._roomEnsurePowerOn();
    if (this._roomPowerPending) return;
    const state = this._hass?.states?.[entity];
    if (!state || ['unavailable', 'unknown'].includes(state.state)) {
      throw new Error(`Power helper is unavailable: ${entity}`);
    }
    if (state.state === 'off') return;
    const player = this._hass?.states?.[connection.tv_entity];
    if (['playing', 'paused'].includes(player?.state) && typeof window.confirm === 'function' &&
        !window.confirm(locale(this) ? '¿Apagar la alimentación durante la reproducción?' :
          'Turn off power while the device is playing?')) return;
    const pending = { key: this._roomPowerKey(), promise: null };
    this._roomPowerPending = pending;
    this._roomPowerRefresh();
    try {
      await this._hass.callService(entityDomain(entity), 'turn_off', { entity_id: entity });
      this._roomPowerLastOn = null;
    } finally {
      if (this._roomPowerPending === pending) this._roomPowerPending = null;
      this._roomPowerRefresh();
    }
  };
  const beforePlayback = async function(original, args) {
    const key = this._roomPowerKey();
    await this._roomEnsurePowerOn();
    if (key && key !== this._roomPowerKey()) {
      throw new Error('The room or playback device changed during power-on. Please retry playback.');
    }
    return original.apply(this, args);
  };
  Card.prototype._prepareDisplayRoute = function(...args) {
    return beforePlayback.call(this, originalPrepareDisplay, args);
  };
  Card.prototype._ensureTvOn = function(...args) {
    return beforePlayback.call(this, originalEnsureTvOn, args);
  };
  Card.prototype._render = function(...args) {
    originalCardRender.apply(this, args);
    const connection = this._roomPowerConnection();
    if (!connection?.power_entity) return;
    const roomBar = this.shadowRoot?.querySelector('.sbr-room-controls');
    if (!roomBar) return;
    const es = locale(this);
    const holder = document.createElement('span');
    holder.className = 'sbr-power-controls';
    holder.style.cssText = 'display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap';
    holder.innerHTML = `<span class="sbr-power-status" style="font-size:11px;opacity:.75"></span>
      <button type="button" data-power="on" title="${es ? 'Encender alimentación' : 'Turn power on'}"
        aria-label="${es ? 'Encender alimentación' : 'Turn power on'}"
        style="border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);padding:6px;cursor:pointer"><ha-icon icon="mdi:power" style="--mdc-icon-size:19px"></ha-icon></button>
      <button type="button" data-power="off" title="${es ? 'Apagar alimentación' : 'Turn power off'}"
        aria-label="${es ? 'Apagar alimentación' : 'Turn power off'}"
        style="border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);padding:6px;cursor:pointer"><ha-icon icon="mdi:power-off" style="--mdc-icon-size:19px"></ha-icon></button>`;
    roomBar.appendChild(holder);
    holder.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      void this._roomSetPower(button.dataset.power === 'on').catch((error) =>
        this._toast(`Power helper: ${error?.message || error}`));
    }));
    this._roomPowerRefresh();
  };

  Editor.prototype._renderRoomEditor = function(...args) {
    originalRoomEditorRender.apply(this, args);
    const section = this.shadowRoot?.querySelector('#sbr-room-editor');
    if (!section) return;
    const es = locale(this);
    for (const [ri, room] of (this._config?.rooms || []).entries()) {
      for (const [ci, connection] of (room.connections || []).entries()) {
        const reference = section.querySelector(
          `[data-field="tv_entity"][data-ri="${ri}"][data-ci="${ci}"]`);
        const grid = reference?.closest('.sbr-route-grid');
        if (!grid) continue;
        const entity = String(connection.power_entity || '');
        const switchOptions = this._roomEntityOptions('switch', entity.startsWith('switch.') ? entity : '');
        const booleanOptions = this._roomEntityOptions('input_boolean', entity.startsWith('input_boolean.') ? entity : '')
          .replace(/^<option value="">—<\/option>/, '');
        grid.insertAdjacentHTML('beforeend', `
          <label>${es ? 'Ayudante de encendido (opcional)' : 'Power helper (optional)'}
            <select data-ri="${ri}" data-ci="${ci}" data-field="power_entity">
              ${switchOptions}${booleanOptions}
            </select>
          </label>
          <label>${es ? 'Espera tras encender (ms)' : 'Power-on delay (ms)'}
            <input type="number" min="0" max="60000" step="500" data-ri="${ri}" data-ci="${ci}"
              data-field="power_on_delay_ms" value="${html(connection.power_on_delay_ms ?? 5000)}">
          </label>`);
      }
    }
  };
})();

/* Streaming Browser v0.4.79: synchronize power helper controls with Home Assistant state. */
(() => {
  const descriptor = Object.getOwnPropertyDescriptor(StreamingBrowserV2Card.prototype, 'hass');
  if (!descriptor?.set) return;
  Object.defineProperty(StreamingBrowserV2Card.prototype, 'hass', {
    ...descriptor,
    set(value) {
      descriptor.set.call(this, value);
      this._roomPowerRefresh?.();
    },
  });
})();

/* Streaming Browser v0.4.80: replace separate power buttons with a single state-driven switch. */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousRender = Card.prototype._render;
  const previousPowerRefresh = Card.prototype._roomPowerRefresh;
  const isSpanish = (card) => String(card._config?.language || card._hass?.language || 'en')
    .toLowerCase().startsWith('es');
  const validEntity = (entity) => /^(?:switch|input_boolean)\.[a-z0-9_]+$/.test(String(entity || ''));

  // Home Assistant is the source of truth: the switch never assumes that a
  // service call succeeded and remains disabled when the entity is unavailable.
  Card.prototype._roomPowerRefresh = function(...args) {
    const holder = this.shadowRoot?.querySelector('.sbr-power-controls');
    const toggle = holder?.querySelector('.sbr-power-switch');
    if (!toggle) return previousPowerRefresh?.apply(this, args);
    const entity = String(this._roomPowerConnection?.()?.power_entity || '').trim();
    const state = this._hass?.states?.[entity]?.state || 'unavailable';
    const available = validEntity(entity) && ['on', 'off'].includes(state);
    const busy = !!this._roomPowerPending;
    const es = isSpanish(this);
    const label = holder.querySelector('.sbr-power-status');
    toggle.checked = state === 'on';
    toggle.disabled = busy || !available;
    toggle.setAttribute('aria-checked', String(toggle.checked));
    if (label) label.textContent = busy ? (es ? 'Cambiando…' : 'Switching…') :
      state === 'on' ? (es ? 'Encendido' : 'On') :
      state === 'off' ? (es ? 'Apagado' : 'Off') : (es ? 'No disponible' : 'Unavailable');
    holder.setAttribute('data-power-state', available ? state : 'unavailable');
  };

  Card.prototype._render = function(...args) {
    previousRender.apply(this, args);
    const holder = this.shadowRoot?.querySelector('.sbr-power-controls');
    if (!holder) return;
    const es = isSpanish(this);
    const title = es ? 'Alimentación' : 'Power';
    holder.innerHTML = `
      <style>
        .sbr-power-controls { display:inline-flex; align-items:center; gap:7px; white-space:nowrap; }
        .sbr-power-label { display:inline-flex; align-items:center; gap:7px; cursor:pointer; user-select:none; font-size:12px; }
        .sbr-power-switch { position:absolute; width:1px; height:1px; opacity:0; }
        .sbr-power-track { position:relative; display:inline-block; width:38px; height:22px;
          border-radius:999px; background:var(--disabled-text-color,#757575); flex:0 0 38px;
          transition:background .16s ease; }
        .sbr-power-track::after { content:''; position:absolute; top:3px; left:3px;
          width:16px; height:16px; border-radius:50%; background:#fff;
          transition:transform .16s ease; box-shadow:0 1px 3px #0004; }
        .sbr-power-switch:checked + .sbr-power-track { background:var(--success-color,#2e995a); }
        .sbr-power-switch:checked + .sbr-power-track::after { transform:translateX(16px); }
        .sbr-power-switch:focus-visible + .sbr-power-track {
          outline:2px solid var(--primary-color,#03a9f4); outline-offset:3px; }
        .sbr-power-switch:disabled + .sbr-power-track { opacity:.45; }
        .sbr-power-switch:disabled ~ .sbr-power-name { opacity:.65; }
        .sbr-power-status { font-size:11px; opacity:.75; }
      </style>
      <label class="sbr-power-label">
        <input class="sbr-power-switch" type="checkbox" role="switch"
          aria-label="${title}" aria-checked="false">
        <span class="sbr-power-track" aria-hidden="true"></span>
        <span class="sbr-power-name">${title}</span>
      </label>
      <span class="sbr-power-status" aria-live="polite"></span>`;
    const toggle = holder.querySelector('.sbr-power-switch');
    toggle.addEventListener('change', () => {
      const intendedOn = toggle.checked;
      // Revert the optimistic DOM change until HA reports the new state. This
      // also restores the switch if a power-off confirmation is cancelled.
      this._roomPowerRefresh();
      void Promise.resolve().then(() => this._roomSetPower(intendedOn))
        .catch((error) => this._toast(`Power helper: ${error?.message || error}`))
        .finally(() => this._roomPowerRefresh());
    });
    this._roomPowerRefresh();
  };
})();

/* Streaming Browser v0.4.83: optional WatchHub official-app link source. */
(() => {
  const Card = StreamingBrowserV2Card;
  const originalTitleLinks = Card.prototype._watchmodeSourcesForCurrentTitle;
  const originalEpisodeLinks = Card.prototype._loadIndependentEpisodeLinks;
  const originalForm = Card.getConfigForm;
  const enabled = card => card._config?.watchhub_enabled !== false;
  const isCurrentEpisode = (card, detail, episode, season) =>
    card._details === detail && detail.selectedEpisode === episode &&
    Number(detail.selectedSeason) === season;
  const uniq = links => {
    const seen = new Set();
    return links.filter(link => {
      if (!link || typeof link.web_url !== 'string' || !/^https:\/\//i.test(link.web_url)) return false;
      const key = `${String(link.name || '').toLowerCase()}|${link.web_url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  Card.getConfigForm = function(...args) {
    const form = originalForm.apply(this, args);
    const section = form?.schema?.find(item => item.title === 'Exact-title playback');
    if (section?.schema && !section.schema.some(item => item.name === 'watchhub_enabled')) {
      section.schema.unshift({ name: 'watchhub_enabled', selector: { boolean: {} } });
    }
    const label = form.computeLabel;
    const helper = form.computeHelper;
    form.computeLabel = item => item.name === 'watchhub_enabled' ? 'Use WatchHub official-app links' : label?.(item);
    form.computeHelper = item => item.name === 'watchhub_enabled'
      ? 'Look up region-specific WatchHub externalUrl provider links (not video streams). Uses the configured TMDB key to resolve IMDb IDs; no streaming account password is needed.'
      : helper?.(item);
    return form;
  };

  Card.prototype._watchhubSourcesFor = async function(detail, episode = null) {
    if (!enabled(this) || !detail?.item?.id || !this._hass?.callWS) return [];
    const mediaType = detail.type === 'tv' ? 'series' : 'movie';
    const season = episode ? Number(detail.selectedSeason) : null;
    const number = episode ? Number(episode.episode_number) : null;
    if (mediaType === 'series' && (!episode || !Number.isInteger(season) || !Number.isInteger(number))) return [];
    const region = String(this._config.region || 'MX').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(region)) return [];
    this._watchhubLinkCache ||= new Map();
    this._watchhubIdCache ||= new Map();
    const idKey = `${mediaType}:${detail.item.id}`;
    const key = `${idKey}:${season ?? ''}:${number ?? ''}:${region}`;
    if (this._watchhubLinkCache.has(key)) return this._watchhubLinkCache.get(key);
    let imdb = this._watchhubIdCache.get(idKey);
    if (!imdb) {
      const kind = mediaType === 'series' ? 'tv' : 'movie';
      const ids = await this._api(`/${kind}/${detail.item.id}/external_ids`);
      imdb = String(ids?.imdb_id || '').trim();
      if (!/^tt\d{5,12}$/.test(imdb)) return [];
      this._watchhubIdCache.set(idKey, imdb);
    }
    const payload = { type: 'streaming_browser/watchhub_links', imdb_id: imdb,
      region, media_type: mediaType };
    if (mediaType === 'series') {
      payload.season = season;
      payload.episode = number;
    }
    const result = await this._withTimeout(this._hass.callWS(payload), 12000, 'WatchHub official links');
    const links = Array.isArray(result?.links) ? result.links : [];
    const valid = uniq(links.filter(link => link.source === 'watchhub' &&
      (mediaType !== 'series' || (link.scope === 'episode' &&
       Number(link.season) === season && Number(link.episode) === number))));
    this._watchhubLinkCache.set(key, valid);
    return valid;
  };

  // Preserve Watchmode when available, but let WatchHub provide official links
  // if the Watchmode script is not configured or times out.
  Card.prototype._watchmodeSourcesForCurrentTitle = async function(options = {}) {
    if (!enabled(this)) return originalTitleLinks.call(this, options);
    const detail = this._details;
    if (detail?.type === 'tv') return originalTitleLinks.call(this, options);
    const [previous, watchhub] = await Promise.allSettled([
      originalTitleLinks.call(this, options), this._watchhubSourcesFor(detail),
    ]);
    const existing = previous.status === 'fulfilled' ? previous.value : [];
    const additional = watchhub.status === 'fulfilled' ? watchhub.value : [];
    const links = uniq([...(additional || []), ...(existing || [])]);
    if (!links.length && previous.status === 'rejected') throw previous.reason;
    return links;
  };

  // The existing episode loader retrieves JustWatch episode links. Append only
  // WatchHub links tied to the selected episode, never a generic series URL.
  Card.prototype._loadIndependentEpisodeLinks = async function(detail, episode) {
    if (!enabled(this)) return originalEpisodeLinks.call(this, detail, episode);
    const season = Number(detail.selectedSeason);
    const lookup = this._watchhubSourcesFor(detail, episode).catch(() => []);
    await originalEpisodeLinks.call(this, detail, episode);
    if (!isCurrentEpisode(this, detail, episode, season)) return;
    detail.episodeSourcesLoading = true;
    this._refreshDetailsInPlace(detail);
    try {
      const additional = await lookup;
      if (!isCurrentEpisode(this, detail, episode, season)) return;
      detail.episodeSources = uniq([...additional, ...(detail.episodeSources || [])]);
      if (detail.episodeSources.length) detail.episodeSourcesError = '';
    } finally {
      if (isCurrentEpisode(this, detail, episode, season)) {
        detail.episodeSourcesLoading = false;
        this._refreshDetailsInPlace(detail);
      }
    }
  };
})();

/* Streaming Browser v0.4.85: native Android TV app routing and honest episode destinations. */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousForm = Card.getConfigForm;
  const previousPick = Card.prototype._pickWatchmodeSource;
  const previousLaunch = Card.prototype._launchProvider;
  const previousExact = Card.prototype._openExactTitle;
  const previousNetflix = Card.prototype._openNetflixExactTitle;
  const previousApplyProfile = Card.prototype._applyProfile;
  const previousDreamState = Card.prototype._androidDreamState;
  const previousScreensaverWake = Card.prototype._wakeAndroidFromScreensaver;
  const previousActivityLaunch = Card.prototype._androidLaunchActivity;
  const normalize = value => String(value || '').trim().toLowerCase();
  const isCrunchyroll = provider => normalize(provider).includes('crunchyroll');
  const isPrime = provider => /(?:prime\s*video|amazon\s*prime)/i.test(String(provider || ''));
  const message = (card, english, spanish) => card._locale?.().startsWith('es') ? spanish : english;

  // Both the main and room visual editors keep ADB entirely optional. Do not
  // silently treat a regular media player as an ADB entity just because it has
  // once exposed adb_response: only an explicitly selected helper can use ADB.
  Card.getConfigForm = function(...args) {
    const form = previousForm.apply(this, args);
    const label = form.computeLabel;
    const helper = form.computeHelper;
    form.computeLabel = field => field.name === 'adb_entity'
      ? 'ADB media player (optional)' : label?.(field);
    form.computeHelper = field => field.name === 'adb_entity'
      ? 'Leave empty for standard Android TV Remote control. Optional ADB is used only for Netflix profile key input or when a normal app/deep-link launch explicitly fails; it is not needed for routine TV remote buttons.'
      : helper?.(field);
    return form;
  };
  Card.prototype._androidAdbEntity = function() {
    if (this._platform() !== 'android_tv') return null;
    const entity = String(this._config?.adb_entity || '').trim();
    if (!entity || !entity.startsWith('media_player.')) return null;
    const state = this._hass?.states?.[entity];
    return state && !['unavailable', 'unknown'].includes(state.state) ? entity : null;
  };
  // Normal screensaver wake needs no debugging connection when a remote exists.
  Card.prototype._androidDreamState = async function() {
    return this._config?.remote_entity ? null : previousDreamState.call(this);
  };
  Card.prototype._wakeAndroidFromScreensaver = async function() {
    if (!this._config?.remote_entity) return previousScreensaverWake.call(this);
    this._toast(this._t('waking_screensaver'));
    await this._hass.callService('remote', 'turn_on', { entity_id: this._config.remote_entity });
    await this._sleep(250);
    await this._sendRemoteButton('ENTER');
    await this._sleep(Math.max(200, Number(this._config?.screensaver_wake_delay_ms ?? 1200)));
  };
  Card.prototype._applyProfile = async function(provider, source, options = {}) {
    if (this._platform() === 'android_tv' && this._isNetflixProvider(provider, source) &&
        this._config?.manual_profile_selection === false && !this._androidAdbEntity()) {
      this._toast(message(this, 'Select your Netflix profile manually; optional ADB is needed only for automatic Netflix profile input.',
        'Selecciona tu perfil de Netflix manualmente; ADB opcional solo se necesita para seleccionar el perfil automáticamente.'));
      return false;
    }
    return previousApplyProfile.call(this, provider, source, options);
  };

  // A Stremio/JustWatch query for S1E2 identifies the *query*, not necessarily
  // the destination. Netflix /title/ is a series page, Prime /detail/ may be a
  // series page, and Crunchyroll /series/ is not an episode link.
  Card.prototype._providerDestination = function(provider, match, detail, isSeries) {
    const url = String(match?.web_url || '').trim();
    if (!/^https:\/\//i.test(url)) return { deviceKind: 'app', tvCanOpen: false };
    const android = this._platform() === 'android_tv';
    const webos = this._platform() === 'webos';
    const roku = this._platform() === 'roku';
    if (!isSeries) {
      return { deviceKind: 'movie', tvCanOpen: !roku && !(android && isCrunchyroll(provider)) };
    }
    const episode = match?.scope === 'episode' &&
      Number(match.season) === Number(detail?.selectedSeason) &&
      Number(match.episode) === Number(detail?.selectedEpisode?.episode_number);
    if (!episode) return { deviceKind: 'series', tvCanOpen: false };
    if (this._isNetflixProvider(provider)) {
      if (/^https:\/\/(?:www\.)?netflix\.com\/watch\/\d+(?:[/?#]|$)/i.test(url)) {
        // webOS legacy Netflix launcher uses movie-specific content IDs; it
        // cannot be assumed to accept episode IDs. Android has a VIEW route.
        return { deviceKind: 'episode', tvCanOpen: android };
      }
      return { deviceKind: 'series', tvCanOpen: false };
    }
    if (isPrime(provider)) {
      // A /detail/ ASIN alone is insufficient to distinguish a series from a
      // single episode. Only a provider link explicitly identifying an episode
      // may be advertised as one. Never infer it from the WatchHub query.
      const explicitEpisode = /[?&#](?:episode|episodeid|videoid)=[a-z0-9_-]+/i.test(url);
      return { deviceKind: explicitEpisode ? 'episode' : 'series',
        tvCanOpen: explicitEpisode && android };
    }
    if (isCrunchyroll(provider)) {
      const episodeUrl = /^https:\/\/(?:www\.)?crunchyroll\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch\/[a-z0-9]+(?:[/?#]|$)/i.test(url);
      // The installed Android TV Crunchyroll app need not register web VIEW
      // intents: do not feed it a generic URL and trigger 'no app can do this'.
      return { deviceKind: episodeUrl ? 'episode' : 'series', tvCanOpen: false };
    }
    return { deviceKind: 'episode', tvCanOpen: !roku };
  };

  // Prefer a Netflix /watch/<episode-id> link over a series /title/ link when
  // several sources advertise the same provider for the selected episode.
  Card.prototype._pickWatchmodeSource = function(provider, sources) {
    const matches = Array.isArray(sources) ? sources : [];
    if (this._details?.type === 'tv' && this._isNetflixProvider(provider)) {
      const specific = matches.filter(item => /^https:\/\/(?:www\.)?netflix\.com\/watch\/\d+(?:[/?#]|$)/i.test(String(item?.web_url || '')));
      if (specific.length) return previousPick.call(this, provider, specific);
    }
    return previousPick.call(this, provider, sources);
  };

  Card.prototype._openOfficialCrunchyrollApp = async function() {
    await this._prepareDisplayRoute();
    await this._ensureTvOn();
    if (this._androidAppIsActive('Crunchyroll', 'Crunchyroll')) return;
    const packageName = 'com.crunchyroll.crunchyroid';
    try {
      // Android TV Remote's media_player documents app-specific launch by
      // package ID, unlike the unsupported Crunchyroll generic web VIEW URL.
      await this._hass.callService('media_player', 'play_media', {
        entity_id: this._config.tv_entity,
        media_content_type: 'app', media_content_id: packageName,
      });
    } catch (standardError) {
      try {
        await this._androidLaunchActivity(packageName);
      } catch (remoteError) {
        if (!this._androidAdbEntity()) throw remoteError;
        // Only after normal HA app launch actions explicitly fail.
        await this._androidAdbCommand('monkey -p com.crunchyroll.crunchyroid -c android.intent.category.LEANBACK_LAUNCHER 1');
      }
    }
    this._toast(message(this, 'Opening Crunchyroll app. This TV app has not confirmed an external episode-link handler.',
      'Abriendo la app de Crunchyroll. Su app de TV no ha confirmado que admita enlaces externos a episodios.'));
  };
  Card.prototype._launchProvider = async function(provider, autoPlay = false) {
    if (this._platform() === 'android_tv' && isCrunchyroll(provider)) {
      try { await this._openOfficialCrunchyrollApp(); }
      catch (error) { this._toast(this._formatError(error)); }
      return;
    }
    return previousLaunch.call(this, provider, autoPlay);
  };

  // Send Netflix's actual /watch/<id> URL to Android TV Remote first. The old
  // netflix://title/<id> rewrite loses episode intent; ADB is a fallback only
  // if the standard remote action reports a launch error.
  Card.prototype._openNetflixExactTitle = async function(url) {
    if (this._platform() !== 'android_tv') return previousNetflix.call(this, url);
    const id = this._netflixContentId(url);
    if (!id) throw new Error(this._t('netflix_title_id_missing'));
    const episode = this._details?.type === 'tv';
    const target = `https://www.netflix.com/${episode ? 'watch' : 'title'}/${id}`;
    try { await this._androidLaunchActivity(target); }
    catch (remoteError) {
      if (!this._androidAdbEntity()) throw remoteError;
      await this._androidAdbCommand('am start -a android.intent.action.VIEW -d ' + target +
        ' -p com.netflix.ninja -f 0x10000000 -e source 30');
    }
  };

  // The standard Android TV Remote registers app.primevideo.com as its Prime
  // activity root. Retain the provider's content path instead of launching an
  // unhandled www.primevideo.com URL through an arbitrary browser.
  Card.prototype._androidLaunchActivity = async function(activity) {
    let target = activity;
    if (this._platform() === 'android_tv' && /^https:\/\/(?:www\.)?primevideo\.com\/(?:region\/[a-z]{2}\/)?detail\/[a-z0-9]+/i.test(String(activity || ''))) {
      const original = new URL(activity);
      target = 'https://app.primevideo.com' + original.pathname.replace(/^\/region\/[a-z]{2}(?=\/)/i, '') + original.search + original.hash;
    }
    return previousActivityLaunch.call(this, target);
  };

  // A source may contain an episode-scoped *query* but only a series URL.
  // For the three reported providers, skip unsupported TV URL launches and
  // expose the actual app fallback instead of claiming the episode opened.
  Card.prototype._openExactTitle = async function(provider, autoPlay = false) {
    const detail = this._details;
    if (detail?.type === 'tv' && detail?.selectedEpisode &&
        (this._isNetflixProvider(provider) || isPrime(provider) || isCrunchyroll(provider))) {
      const available = !detail.episodeSourcesLoading ? detail.episodeSources || [] : [];
      const exact = this._pickWatchmodeSource(provider, available.filter(link =>
        link?.scope === 'episode' && Number(link.season) === Number(detail.selectedSeason) &&
        Number(link.episode) === Number(detail.selectedEpisode.episode_number)));
      const route = this._providerDestination(provider, exact, detail, true);
      if (!route.tvCanOpen) {
        await this._launchProvider(provider, false);
        this._toast(message(this, 'This TV app has no verified exact episode launch for the available link; opened the app instead.',
          'Esta app de TV no tiene un enlace confirmado al episodio para la fuente disponible; se abrió la app.'));
        return;
      }
    }
    return previousExact.call(this, provider, autoPlay);
  };
})();

/* Streaming Browser v0.4.86: optional ADB remote entity (distinct from ADB media player). */
(() => {
  const Card = StreamingBrowserV2Card;
  const Editor = StreamingBrowserV2CardEditor;
  const baseForm = Card.getConfigForm;
  const baseRoomConfig = Card.prototype._roomEffectiveConfig;
  const baseRoomEditor = Editor.prototype._renderRoomEditor;
  const baseSendRemote = Card.prototype._sendRemoteButton;
  const baseNetflixKey = Card.prototype._sendNetflixProfileButton;
  const baseApplyProfile = Card.prototype._applyProfile;
  const code = button => {
    const names = { UP: 19, DOWN: 20, LEFT: 21, RIGHT: 22, ENTER: 23, CENTER: 23,
      BACK: 4, HOME: 3, BACKSPACE: 67, PLAY: 126, PAUSE: 127, MUTE: 164,
      VOLUME_UP: 24, VOLUME_DOWN: 25, CHANNEL_UP: 166, CHANNEL_DOWN: 167 };
    const key = String(button || '').trim().toUpperCase();
    if (/^[0-9]$/.test(key)) return 7 + Number(key);
    return Object.hasOwn(names, key) ? names[key] : null;
  };
  const isNetflix = card => /(?:com\.netflix\.ninja|netflix)/i.test(String(card._androidActivity?.() || ''));

  // An ADB remote is a remote.* entity created by HA's Android Debug Bridge
  // integration. It is NOT the adb_entity media_player.* used by adb_command.
  Card.prototype._adbRemoteEntity = function() {
    if (this._platform() !== 'android_tv') return null;
    const entity = String(this._config?.adb_remote_entity || '').trim();
    if (!/^remote\.[a-z0-9_]+$/.test(entity)) return null;
    const state = this._hass?.states?.[entity];
    return state && !['unavailable', 'unknown'].includes(state.state) ? entity : null;
  };
  Card.prototype._adbRemoteKey = async function(button) {
    const entity = this._adbRemoteEntity();
    const key = code(button);
    if (!entity || key === null) throw new Error('Optional ADB remote is unavailable or does not support this key: ' + button);
    await this._hass.callService('remote', 'send_command', {
      entity_id: entity, command: 'input keyevent ' + key,
    });
  };

  // Use the standard remote for ordinary commands. Netflix specifically
  // ignores some standard Android TV Remote key events; only then prefer an
  // explicitly configured ADB remote. A failed standard call may also retry.
  Card.prototype._sendRemoteButton = async function(button) {
    const adb = this._adbRemoteEntity();
    if (adb && isNetflix(this) && code(button) !== null) {
      return this._adbRemoteKey(button);
    }
    try { return await baseSendRemote.call(this, button); }
    catch (error) {
      if (!adb || code(button) === null) throw error;
      return this._adbRemoteKey(button);
    }
  };
  Card.prototype._sendNetflixProfileButton = async function(button) {
    if (this._adbRemoteEntity()) return this._adbRemoteKey(button);
    return baseNetflixKey.call(this, button);
  };

  // The previous Netflix auto-profile guard required an ADB media player.
  // When an ADB remote is explicitly configured, use its documented input
  // keyevent commands for profile navigation without inventing a media player.
  Card.prototype._applyProfile = async function(provider, source, options = {}) {
    if (this._platform() === 'android_tv' && this._isNetflixProvider(provider, source) &&
        this._config?.manual_profile_selection === false && this._adbRemoteEntity() &&
        !this._androidAdbEntity()) {
      if (!this._selectedProfile) return false;
      const rule = this._findProfileAppConfig(provider, source) || {};
      if (!options.appReadyWaited) {
        await this._sleep(Math.max(0, Number(rule.launch_delay_ms ?? 10000)));
      }
      if (!options.appJustOpened || rule.always_select === true) {
        await this._openNetflixProfilePickerFromHome(rule);
      }
      await this._runNetflixProfilePosition(rule);
      await this._sleep(Math.max(0, Number(rule.after_select_delay_ms ?? 2000)));
      return true;
    }
    return baseApplyProfile.call(this, provider, source, options);
  };

  // Keep the new option out of the general schema in rooms mode: each room's
  // connection needs its own independently selectable ADB remote entity.
  Card.getConfigForm = function(...args) {
    const form = baseForm.apply(this, args);
    const general = form?.schema?.find(section => section.title === 'General');
    const fields = general?.schema;
    if (Array.isArray(fields) && fields.some(field => field.name === 'adb_entity') &&
        !fields.some(field => field.name === 'adb_remote_entity')) {
      const index = fields.findIndex(field => field.name === 'adb_entity');
      fields.splice(index + 1, 0, { name: 'adb_remote_entity',
        selector: { entity: { filter: { domain: 'remote' } } } });
    }
    const label = form.computeLabel;
    const helper = form.computeHelper;
    form.computeLabel = field => field.name === 'adb_remote_entity'
      ? 'ADB remote (optional)' : label?.(field);
    form.computeHelper = field => field.name === 'adb_remote_entity'
      ? 'Optional remote entity from the Android Debug Bridge integration. Standard Android TV Remote is used normally; this remote is used for Netflix-specific keys or when the standard command fails. It can replace an ADB media player for automatic Netflix profile keys.'
      : helper?.(field);
    return form;
  };

  if (baseRoomConfig) {
    Card.prototype._roomEffectiveConfig = function() {
      const config = baseRoomConfig.call(this);
      const connection = this._roomConnection?.();
      if (!connection) return config;
      return { ...config, adb_remote_entity: connection.adb_remote_entity || null };
    };
  }
  if (baseRoomEditor) {
    Editor.prototype._renderRoomEditor = function(...args) {
      const result = baseRoomEditor.apply(this, args);
      const section = this.shadowRoot?.querySelector('#sbr-room-editor');
      if (!section) return result;
      const rooms = Array.isArray(this._config?.rooms) ? this._config.rooms : [];
      const es = String(this._config?.language || '').toLowerCase().startsWith('es');
      rooms.forEach((room, ri) => {
        (room.connections || []).forEach((connection, ci) => {
          const route = [...section.querySelectorAll('details[data-key]')]
            .find(node => node.dataset.key === 'connection:' + connection.id);
          const grid = route?.querySelector('.sbr-route-grid');
          if (!grid || grid.querySelector('[data-field="adb_remote_entity"]')) return;
          const label = document.createElement('label');
          label.textContent = es ? 'Control remoto ADB (opcional)' : 'ADB remote (optional)';
          const select = document.createElement('select');
          select.dataset.ri = String(ri);
          select.dataset.ci = String(ci);
          select.dataset.field = 'adb_remote_entity';
          // Reuse the same escaped Home Assistant entity options and delegated
          // change handler as the existing Rooms & connections visual editor.
          select.innerHTML = this._roomEntityOptions('remote', connection.adb_remote_entity);
          label.appendChild(select);
          grid.appendChild(label);
        });
      });
      return result;
    };
  }
})();

/* Streaming Browser v0.4.87: restore working provider URL routes without losing newer controls. */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousDestination = Card.prototype._providerDestination;
  const previousPick = Card.prototype._pickWatchmodeSource;
  const previousMovieSources = Card.prototype._watchmodeSourcesForCurrentTitle;
  const previousEpisodeSources = Card.prototype._loadIndependentEpisodeLinks;
  const previousLaunchActivity = Card.prototype._androidLaunchActivity;
  const previousNetflix = Card.prototype._openNetflixExactTitle;
  const prime = name => /(?:prime\s*video|amazon\s*prime)/i.test(String(name || ''));
  const netflix = name => /netflix/i.test(String(name || ''));
  const accepted = (provider, raw) => {
    try {
      const u = new URL(String(raw || ''));
      if (u.protocol !== 'https:' || u.username || u.password) return false;
      const host = u.hostname.toLowerCase();
      if (netflix(provider)) return host === 'netflix.com' || host.endsWith('.netflix.com');
      if (prime(provider)) return host === 'primevideo.com' || host.endsWith('.primevideo.com') ||
        /^amazon\.[a-z.]+$/.test(host) || /^www\.amazon\.[a-z.]+$/.test(host);
    } catch (_) {}
    return false;
  };
  const sourcePriority = source => ({watchmode: 30, justwatch: 20, watchhub: 10})[
    String(source?.source || '').toLowerCase()] || 15;
  const orderSources = links => Array.isArray(links) ? [...links].sort((a,b) =>
    sourcePriority(b) - sourcePriority(a)) : links;

  // WatchHub is an OPTIONAL addition, not a replacement for provider links
  // obtained earlier through Watchmode or JustWatch. Preserve their order.
  Card.prototype._watchmodeSourcesForCurrentTitle = async function(...args) {
    return orderSources(await previousMovieSources.apply(this,args));
  };
  Card.prototype._loadIndependentEpisodeLinks = async function(detail, episode) {
    await previousEpisodeSources.call(this, detail, episode);
    if (this._details !== detail || detail.selectedEpisode !== episode) return;
    detail.episodeSources = orderSources(detail.episodeSources);
    if (!detail.episodeSourcesLoading) this._refreshDetailsInPlace(detail);
  };
  // Netflix's episode /watch ID takes priority over a series /title ID even
  // if the latter was found via a higher-priority lookup source.
  Card.prototype._pickWatchmodeSource = function(provider, sources) {
    const list = orderSources(sources);
    if (this._details?.type === 'tv' && netflix(provider)) {
      const watch = list.filter(item => /^https:\/\/(?:www\.)?netflix\.com\/watch\/\d+(?:[/?#]|$)/i
        .test(String(item?.web_url || '')));
      if (watch.length) return previousPick.call(this, provider, watch);
    }
    return previousPick.call(this, provider, list);
  };

  // v0.4.85 prematurely changed previously actionable series/title URLs into
  // an App button. Restore the *attempt* when a genuine provider URL exists;
  // keep the Series caption when no provider-specific episode ID is proven.
  Card.prototype._providerDestination = function(provider, match, detail, isSeries) {
    const route = previousDestination.call(this, provider, match, detail, isSeries);
    if (isSeries && (netflix(provider) || prime(provider)) &&
        this._platform() !== 'roku' && accepted(provider, match?.web_url)) {
      return { ...route, tvCanOpen: true };
    }
    return route;
  };

  // Restore the old Prime Video target URL as the FIRST attempt. v0.4.85
  // rewrote www.primevideo.com links to app.primevideo.com unconditionally,
  // removing a working path on some devices. Try the alternative only when
  // Home Assistant explicitly rejects the original launch command.
  Card.prototype._androidLaunchActivity = async function(activity) {
    const url = String(activity || '');
    if (this._platform() === 'android_tv' &&
        /^https:\/\/(?:www\.)?primevideo\.com\/(?:region\/[a-z]{2}\/)?detail\//i.test(url) &&
        this._config?.remote_entity) {
      try {
        return await this._hass.callService('remote', 'turn_on', {
          entity_id: this._config.remote_entity, activity: url,
        });
      } catch (firstError) {
        // This fallback uses the v0.4.85 app.primevideo.com path.
        return previousLaunchActivity.call(this, activity);
      }
    }
    return previousLaunchActivity.call(this, activity);
  };

  // Restore the original Netflix native title route for movies. It was
  // replaced with a generic HTTPS intent in v0.4.85. Keep /watch for an
  // episode first; only try the native route after an explicit error.
  Card.prototype._openNetflixExactTitle = async function(webUrl) {
    if (this._platform() !== 'android_tv') return previousNetflix.call(this, webUrl);
    const id = this._netflixContentId(webUrl);
    if (!id) return previousNetflix.call(this, webUrl);
    const native = 'netflix://title/' + id;
    const episode = this._details?.type === 'tv';
    if (!episode) {
      // Older releases used this app-native intent, with or without ADB.
      if (this._androidAdbEntity?.()) {
        try {
          return await this._androidAdbCommand('am start -W -n com.netflix.ninja/.MainActivity -a android.intent.action.VIEW -d ' + native + ' -f 0x10000020 -e source 30');
        } catch (_) { /* Use standard remote if an older ADB activity path fails. */ }
      }
      try { return await this._androidLaunchActivity(native); }
      catch (_) { return previousNetflix.call(this, webUrl); }
    }
    try { return await previousNetflix.call(this, webUrl); }
    catch (_) { return this._androidLaunchActivity(native); }
  };
})();

/* Streaming Browser v0.4.88: restored v0.4.82 link handling. */
(() => {
  const Card = StreamingBrowserV2Card;
  // These method bodies are copied verbatim from the v0.4.82 release tag by
  // the bundler. Installing them LAST removes the v0.4.83–0.4.87 launch and
  // source-order overrides while preserving the newer UI and remote methods.
  const Historical = class {
  async _watchmodeSourcesForCurrentTitle({ silent = false } = {}) {
    const detail = this._details;

    if (!detail?.item?.id) {
      throw new Error(
        this._t("no_title_selected")
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

    if (!silent) {
      this._toast(this._t("looking_up_exact_link"));
    }

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
        this._t("watchmode_http", { status })
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
          this._t("watchmode_bad_response")
        );
      }
    }

    if (!Array.isArray(content)) {
      throw new Error(
        this._t("watchmode_not_list")
      );
    }

    this._watchmodeCache.set(
      cacheKey,
      content
    );

    return content;
  }

  async _loadIndependentEpisodeLinks(detail, episode) {
    const season = Number(detail.selectedSeason);
    const number = Number(episode.episode_number);
    try {
      const response = await this._withTimeout(this._hass.callWS({
        type: "streaming_browser/episode_links",
        tmdb_id: Number(detail.item.id),
        title: String(detail.details?.name || detail.item.name || ""),
        season, episode: number,
        region: this._config.region || "MX",
        language: this._languageCode(),
      }), 12000, "Episode provider lookup");
      if (this._details !== detail || detail.selectedEpisode !== episode ||
          Number(detail.selectedSeason) !== season) return;
      detail.episodeSources = (Array.isArray(response?.links) ? response.links : [])
        .filter((link) => link?.scope === "episode" &&
          Number(link.season) === season && Number(link.episode) === number &&
          typeof link.web_url === "string" && /^https:\/\//i.test(link.web_url));
    } catch (err) {
      if (this._details !== detail || detail.selectedEpisode !== episode) return;
      detail.episodeSources = [];
      detail.episodeSourcesError = this._formatError(err);
    } finally {
      if (this._details === detail && detail.selectedEpisode === episode) {
        detail.episodeSourcesLoading = false;
        this._refreshDetailsInPlace(detail);
      }
    }
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

  async _androidLaunchActivity(activity) {
    if (!this._config.remote_entity) {
      throw new Error("remote_entity is required for Android TV");
    }

    await this._hass.callService("remote", "turn_on", {
      entity_id: this._config.remote_entity,
      activity,
    });
  }

  async _openNetflixExactTitle(webUrl) {
    const contentId =
      this._netflixContentId(
        webUrl
      );

    if (!contentId) {
      throw new Error(
        this._t(
          "netflix_title_id_missing"
        )
      );
    }

    if (
      this._platform() ===
      "android_tv"
    ) {
      if (
        this._androidAdbEntity()
      ) {
        await this._androidAdbCommand(
          "am start -W -n com.netflix.ninja/.MainActivity " +
          "-a android.intent.action.VIEW " +
          "-d netflix://title/" +
          contentId +
          " -f 0x10000020 -e source 30"
        );

        return;
      }

      await this._androidLaunchActivity(
        "netflix://title/" +
          contentId
      );

      return;
    }

    await this._hass.callService(
      "webostv",
      "command",
      {
        entity_id:
          this._config.tv_entity,

        command:
          "system.launcher/launch",

        payload: {
          id: "netflix",
          contentId:
            "m=http%3A%2F%2Fapi.netflix.com%2Fcatalog%2Ftitles%2Fmovies%2F" +
            contentId +
            "&source_type=4",
        },
      }
    );
  }

  async _openExactTitle(
    providerName,
    autoPlay = false
  ) {
    if (!this._hass) {
      return;
    }

    if (this._platform() === "roku") {
      // A Watchmode/JustWatch web URL is not a Roku channel-specific content ID.
      // Do not send it to webOS, or claim that launching an app played the title.
      this._toast(this._locale() === "es"
        ? "Roku necesita un ID de contenido de la app para abrir este título. Usa Abrir app."
        : "Roku needs an app-specific content ID for exact title playback. Use Open app.");
      return;
    }

    try {
      await this._prepareDisplayRoute();
      const tv = await this._ensureTvOn();

      const detail = this._details;
      const series = detail?.type === "tv";
      const sources = series
        ? (detail.selectedEpisode && !detail.episodeSourcesLoading ? detail.episodeSources || [] : [])
        : await this._watchmodeSourcesForCurrentTitle();

      const match =
        this._pickWatchmodeSource(
          providerName,
          sources
        );

      if (!match?.web_url) {
        throw new Error(
          this._t("watchmode_no_provider_link", { provider: providerName, region: this._config.region })
        );
      }

      const source =
        this._sourceForProvider(providerName);

      const appConfig =
        this._findProfileAppConfig(
          providerName,
          source || providerName
        );

      const profileMode =
        this._profileModeFor(
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
        this._config.manual_profile_selection === false &&
        source &&
        (
          appConfig?.exact_title_profile_first === true ||
          profileMode === "netflix"
        )
      ) {
        const currentSource =
          this._platform() === "android_tv"
            ? this._androidActivity()
            : tv?.attributes?.source || "";

        const appAlreadyOpen =
          this._platform() === "android_tv"
            ? this._providerAliases(providerName).some(
                (alias) =>
                  alias &&
                  this._norm(currentSource).includes(alias)
              )
            : this._norm(currentSource) ===
              this._norm(source);

        if (!appAlreadyOpen) {
          this._toast(
            this._t("opening_and_preparing", { source, profile: this._selectedProfile || "" })
          );

          if (this._platform() === "android_tv") {
            const activity =
              this._androidAppLink(providerName, source);

            if (activity) {
              await this._androidLaunchActivity(
                activity
              );

              await this._waitForAndroidAppReady(
                providerName,
                source,
                appConfig || {}
              );
            }
          } else {
            await this._hass.callService(
              "media_player",
              "select_source",
              {
                entity_id:
                  this._config.tv_entity,
                source,
              }
            );

            this._toast(
              this._t(
                "preparing_profile",
                {
                  source,
                  profile:
                    this._selectedProfile || "",
                }
              )
            );

            await this._waitForWebOsAppReady(
              providerName,
              source,
              appConfig || {}
            );
          }

          await this._applyProfile(
            providerName,
            source,
            {
              appJustOpened: true,
              appReadyWaited: true,
            }
          );

          const afterProfileDelay =
            Number(
              appConfig
                .exact_title_after_profile_delay_ms ??
                0
            ) || 0;

          if (afterProfileDelay > 0) {
            this._toast(
              this._t("waiting_profile_session", { source })
            );

            await this._sleep(
              afterProfileDelay
            );
          }
        } else {
          if (
            profileMode === "netflix" &&
            this._platform() === "android_tv"
          ) {
            await this._applyProfile(
              providerName,
              source,
              { appJustOpened: false }
            );
          }

          this._toast(
            this._t("using_current_session", { source })
          );
        }
      }

      this._toast(
        this._t("opening_title", { provider: match.name || providerName })
      );

      if (
        this._isNetflixProvider(
          providerName,
          source || match.name || ""
        )
      ) {
        await this._openNetflixExactTitle(
          match.web_url
        );
      } else if (
        this._platform() === "webos" &&
        this._isPrimeProvider(
          providerName,
          source || match.name || ""
        )
      ) {
        await this._openPrimeExactTitle(
          match.web_url
        );
      } else if (this._platform() === "android_tv") {
        await this._androidLaunchActivity(match.web_url);
      } else {
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
      }

      if (autoPlay) {
        const delay =
          Number(
            this._config
              .exact_title_play_delay_ms
          ) || 5000;

        this._toast(
          this._t("title_opened_play", { seconds: Math.round(delay / 100) / 10 })
        );

        await this._sleep(delay);

        await this._sendProviderPlay(
          providerName,
          source || providerName
        );

        this._toast(
          this._t("play_sent")
        );
      } else {
        this._toast(
          this._t("title_link_sent")
        );
      }

    } catch (err) {
      if (this._details?.type === "tv") {
        this._toast(this._t("title_open_failed", { error: this._formatError(err) }));
        return; // Never open the series home as an episode-link fallback.
      }
      const fallback =
        this._config
          .exact_title_fallback_to_app !==
        false;

      if (!fallback) {
        this._toast(
          this._t("title_open_failed", { error: this._formatError(err) })
        );

        return;
      }

      this._toast(
        this._t("title_fallback", { provider: providerName })
      );

      await this._sleep(700);

      await this._launchProvider(
        providerName,
        autoPlay
      );
    }
  }
  };
  for (const name of ["_watchmodeSourcesForCurrentTitle", "_loadIndependentEpisodeLinks", "_pickWatchmodeSource", "_androidLaunchActivity", "_openNetflixExactTitle", "_openExactTitle"]) {
    Card.prototype[name] = Historical.prototype[name];
  }

  // v0.4.82 Watchmode / JustWatch results always win. Retain optional WatchHub
  // only when the original source has no links; never reorder a working list.
  const oldMovieSources = Card.prototype._watchmodeSourcesForCurrentTitle;
  Card.prototype._watchmodeSourcesForCurrentTitle = async function(options = {}) {
    let old, originalError;
    try { old = await oldMovieSources.call(this, options); }
    catch (err) { originalError = err; }
    if (Array.isArray(old) && old.length) return old;
    if (this._config?.watchhub_enabled !== false &&
        this._details?.type !== 'tv' && this._watchhubSourcesFor) {
      try {
        const fallback = await this._watchhubSourcesFor(this._details);
        if (Array.isArray(fallback) && fallback.length) return fallback;
      } catch (_) { /* The v0.4.82 error remains authoritative. */ }
    }
    if (originalError) throw originalError;
    return old || [];
  };
  const oldEpisodeSources = Card.prototype._loadIndependentEpisodeLinks;
  Card.prototype._loadIndependentEpisodeLinks = async function(detail, episode) {
    const season = Number(detail.selectedSeason);
    await oldEpisodeSources.call(this, detail, episode);
    if (this._details !== detail || detail.selectedEpisode !== episode ||
        Number(detail.selectedSeason) !== season || detail.episodeSources?.length ||
        this._config?.watchhub_enabled === false || !this._watchhubSourcesFor) return;
    try {
      const fallback = await this._watchhubSourcesFor(detail, episode);
      if (this._details !== detail || detail.selectedEpisode !== episode ||
          Number(detail.selectedSeason) !== season || !fallback?.length) return;
      detail.episodeSources = fallback;
      detail.episodeSourcesError = '';
      this._refreshDetailsInPlace(detail);
    } catch (_) { /* Preserve the original source error and card behavior. */ }
  };

  // The new compact TV button must invoke the original v0.4.82 content-link
  // path whenever it has an HTTPS provider URL, not the v0.4.85 App shortcut.
  // Preserve the destination label as descriptive, not proof of playback.
  const newerDestination = Card.prototype._providerDestination;
  Card.prototype._providerDestination = function(provider, match, detail, isSeries) {
    const newer = newerDestination.call(this, provider, match, detail, isSeries);
    const url = String(match?.web_url || '');
    return { ...newer, tvCanOpen: this._platform() !== 'roku' && /^https:\/\//i.test(url) };
  };
})();

/* Streaming Browser v0.4.88: episode > season > series; WatchHub last. */
(() => {
  const Card = StreamingBrowserV2Card;
  const historicEpisodeLoader = Card.prototype._loadIndependentEpisodeLinks;
  const historicPick = Card.prototype._pickWatchmodeSource;
  const historicNetflixLaunch = Card.prototype._openNetflixExactTitle;
  const historicRender = Card.prototype._renderProviderCards;
  const sourceRank = link => ({watchmode: 0, justwatch: 1, watchhub: 9})[
    String(link?.source || '').toLowerCase()] ?? 5;
  const scopes = {episode:0, season:1, series:2};
  const netflix = name => /netflix/i.test(String(name || ''));
  const normalized = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const signature = link => `${normalized(link.name)}|${String(link.web_url || '')}`;
  const unique = list => {
    const seen = new Set();
    return (list || []).filter(link => {
      if (!link || !/^https:\/\//i.test(String(link.web_url || ''))) return false;
      const k = `${signature(link)}|${link.scope}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const actualScope = (link, season, episode) => {
    const claimed = String(link?.scope || '').toLowerCase();
    let url;
    try { url = new URL(String(link?.web_url || '')); } catch (_) { return null; }
    const path = url.pathname.toLowerCase();
    const host = url.hostname.toLowerCase();
    // A Netflix /title/ link does not become an episode link just because
    // JustWatch/WatchHub looked it up for an episode. /watch/ carries the
    // actual episode ID; preserve its optional trackId and other parameters.
    if (host === 'netflix.com' || host.endsWith('.netflix.com')) {
      if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?title\/\d+(?:\/|$)/i.test(path)) return 'series';
      if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch\/\d+(?:\/|$)/i.test(path)) {
        return claimed === 'episode' && Number(link.season) === season &&
          Number(link.episode) === episode ? 'episode' : 'series';
      }
    }
    if (/\/series\//.test(path) || /\/show\//.test(path)) return 'series';
    if (/\/season\//.test(path)) return 'season';
    if (claimed === 'episode' && Number(link.season) === season &&
        Number(link.episode) === episode) return 'episode';
    if (claimed === 'season' && Number(link.season) === season) return 'season';
    return 'series';
  };

  // Fetch exact-episode links using the historical v0.4.82 JustWatch flow;
  // then obtain separate, explicitly scoped season/series offers. A provider
  // with an episode link is never downgraded merely because another provider
  // has only a series page. WatchHub is never the first source in any scope.
  Card.prototype._loadIndependentEpisodeLinks = async function(detail, episode) {
    detail.seriesFallbackSources = [];
    const season = Number(detail.selectedSeason);
    const current = () => this._details === detail && detail.selectedEpisode === episode &&
      Number(detail.selectedSeason) === season;
    await historicEpisodeLoader.call(this, detail, episode);
    if (!current()) return;
    let fallback = [], watchhub = [], watchmode = [];
    try {
      const response = await this._withTimeout(this._hass.callWS({
        type:'streaming_browser/series_fallback_links',
        tmdb_id:Number(detail.item.id),
        title:String(detail.details?.name || detail.item.name || ''),
        season, region:this._config.region || 'MX', language:this._languageCode(),
      }), 16000, 'Season and series provider lookup');
      if (!current()) return;
      fallback = Array.isArray(response?.links) ? response.links : [];
    } catch (_) { /* Fallback tiers are optional. */ }
    if (this._config?.watchhub_enabled !== false && this._watchhubSourcesFor) {
      try { watchhub = await this._watchhubSourcesFor(detail, episode); }
      catch (_) { /* No WatchHub result must break an existing link. */ }
    }
    if (!current()) return;
    try {
      const result = await this._watchmodeSourcesForCurrentTitle({silent:true});
      watchmode = Array.isArray(result) ? result.map(link => ({...link,
        source:link.source || 'watchmode',scope:link.scope || 'series'})) : [];
    } catch (_) { /* No Watchmode script configured. */ }
    if (!current()) return;
    // Re-include WatchHub episode results even if JustWatch returned a link
    // for another provider; each provider must be resolved independently.
    detail.episodeSources = unique([...(detail.episodeSources || []), ...watchhub]);
    detail.seriesFallbackSources = unique([...fallback, ...watchmode]);
    this._refreshDetailsInPlace(detail);
  };

  Card.prototype._seriesLinksForDetail = function(detail) {
    if (!detail?.selectedEpisode) return [];
    const season = Number(detail.selectedSeason);
    const episode = Number(detail.selectedEpisode.episode_number);
    const all = unique([...(detail.episodeSources || []),
      ...(detail.seriesFallbackSources || [])]);
    const resolved = all.map(link => ({...link, scope:actualScope(link, season, episode)}))
      .filter(link => link.scope && Object.hasOwn(scopes, link.scope));
    // Season and show offers can resolve to the SAME general provider page.
    // If so the URL has not demonstrated season-level navigation.
    const seriesUrls = new Set(resolved.filter(link => link.scope === 'series')
      .map(link => signature(link)));
    for (const link of resolved) {
      if (link.scope === 'season' && seriesUrls.has(signature(link))) link.scope = 'series';
    }
    return resolved.sort((a,b) => scopes[a.scope]-scopes[b.scope] ||
      sourceRank(a)-sourceRank(b));
  };

  Card.prototype._pickWatchmodeSource = function(provider, sources) {
    const list = Array.isArray(sources) ? sources : [];
    if (!this._details?.selectedEpisode) return historicPick.call(this,provider,list);
    // Filter to the selected provider before choosing the highest available
    // specificity. The historical source scoring still resolves name aliases.
    const ranked = [...list].sort((a,b) =>
      (scopes[a.scope] ?? 3) - (scopes[b.scope] ?? 3) ||
      sourceRank(a) - sourceRank(b));
    for (const candidate of ranked) {
      if (historicPick.call(this,provider,[candidate])) return candidate;
    }
    return null;
  };

  // Compact button rendering and the original v0.4.82 click handler now use
  // the same ranked list; the clicked provider is resolved per provider.
  Card.prototype._renderProviderCards = function(detail,providers,isSeries=false) {
    if (!isSeries) return historicRender.call(this,detail,providers,false);
    const oldEpisodeSources = detail.episodeSources;
    const oldLoading = detail.episodeSourcesLoading;
    try {
      detail.episodeSources = this._seriesLinksForDetail(detail);
      detail.episodeSourcesLoading = oldLoading && !detail.episodeSources.length;
      return historicRender.call(this,detail,providers,true);
    } finally {
      detail.episodeSources = oldEpisodeSources;
      detail.episodeSourcesLoading = oldLoading;
    }
  };

  // Netflix episode URL may carry trackId (which is NOT an episode ID).
  // Keep it untouched for the TV's direct URL launch. Without an episode
  // /watch/ URL, the historical v0.4.82 Netflix native route is unchanged.
  Card.prototype._openNetflixExactTitle = async function(url) {
    if (this._platform() === 'android_tv' && this._details?.type === 'tv' &&
        /^https:\/\/(?:www\.)?netflix\.com\/watch\/\d+(?:[/?#]|$)/i.test(String(url || '')) &&
        new URL(url).searchParams.has('trackId')) {
      return this._androidLaunchActivity(url);
    }
    return historicNetflixLaunch.call(this,url);
  };
})();

/* Streaming Browser v0.4.88: series link routing finalization. */
(() => {
  const Card = StreamingBrowserV2Card;
  const legacyOpen = Card.prototype._openExactTitle;
  const previousDestination = Card.prototype._providerDestination;

  // v0.4.82 dispatch remains untouched; only its source list is temporarily
  // supplied by the same per-provider priority resolver used by the UI.
  Card.prototype._openExactTitle = async function(provider, autoPlay=false) {
    const detail = this._details;
    if (!detail || detail.type !== 'tv' || !detail.selectedEpisode)
      return legacyOpen.call(this,provider,autoPlay);
    const original = detail.episodeSources;
    detail.episodeSources = this._seriesLinksForDetail(detail);
    try { return await legacyOpen.call(this,provider,autoPlay); }
    finally { detail.episodeSources = original; }
  };
  Card.prototype._providerDestination = function(provider,link,detail,isSeries) {
    const original = previousDestination.call(this,provider,link,detail,isSeries);
    if (!isSeries || !link?.web_url) return original;
    const scope = String(link.scope || 'series').toLowerCase();
    return {...original, deviceKind:['episode','season','series'].includes(scope) ? scope : 'series',
      tvCanOpen:this._platform() !== 'roku' && /^https:\/\//i.test(link.web_url)};
  };
})();

/* Streaming Browser v0.4.89: Netflix episode TV app-specific launch. */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousNetflix = Card.prototype._openNetflixExactTitle;

  // The ordinary device link stays the original JustWatch/Watchmode/WatchHub
  // URL, including trackId. Only the TV dispatch needs a platform-specific
  // target: handing an HTTPS URL to Android TV's generic activity may just
  // open the Netflix app instead of navigating to the selected episode.
  Card.prototype._openNetflixExactTitle = async function(rawUrl) {
    const url = String(rawUrl || '');
    let episodeId;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol === 'https:' &&
          (host === 'netflix.com' || host.endsWith('.netflix.com')) &&
          this._details?.type === 'tv') {
        episodeId = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch\/(\d+)(?:\/|$)/i.exec(parsed.pathname)?.[1];
      }
    } catch (_) { /* Keep historical behavior for unknown links. */ }
    if (!episodeId) return previousNetflix.call(this, rawUrl);

    if (this._platform() === 'android_tv') {
      // Matches the Netflix app-native launch contract used by Nuvio and the
      // v0.4.82 Streaming Browser launcher. The numeric ID is from the selected
      // /watch/ EPISODE URL, not a separately looked-up show/season ID.
      const activity = 'netflix://title/' + episodeId;
      const command = 'am start -W -n com.netflix.ninja/.MainActivity ' +
        '-a android.intent.action.VIEW -d ' + activity +
        ' -f 0x10000020 -e source 30';
      if (this._androidAdbEntity?.()) {
        try { return await this._androidAdbCommand(command); }
        catch (_) { /* Use the configured standard remote if ADB is unavailable. */ }
      }
      const adbRemote = this._adbRemoteEntity?.();
      if (adbRemote) {
        try {
          return await this._hass.callService('remote', 'send_command', {
            entity_id: adbRemote, command,
          });
        } catch (_) { /* The ADB remote is optional; use the standard remote. */ }
      }
      return this._androidLaunchActivity(activity);
    }

    if (this._platform() === 'webos') {
      // Nuvio's Netflix webOS provider path sends the ORIGINAL episode URL
      // via contentTarget first. This retains its trackId and avoids the
      // historical /catalog/titles/movies/<id> route for TV episodes.
      try {
        return await this._hass.callService('webostv', 'command', {
          entity_id: this._config.tv_entity,
          command: 'com.webos.applicationManager/launch',
          payload: {id: 'netflix', params: {contentTarget: url}},
        });
      } catch (_) {
        // Only use an alternate episode-specific contract on an explicit
        // webOS service error. Never fall back to movie-only Netflix paths.
        return this._hass.callService('webostv', 'command', {
          entity_id: this._config.tv_entity,
          command: 'system.launcher/launch',
          payload: {id: 'netflix', contentId:
            'm=https://www.netflix.com/watch/' + episodeId + '&source_type=4'},
        });
      }
    }
    return previousNetflix.call(this, rawUrl);
  };
})();

/* Streaming Browser v0.4.90: Prime TV targeting and Disney+ link specificity. */
(() => {
  const Card = StreamingBrowserV2Card;
  const priorAndroidActivity = Card.prototype._androidLaunchActivity;
  const priorWebosPrime = Card.prototype._openPrimeExactTitle;
  const priorSeriesLinks = Card.prototype._seriesLinksForDetail;
  const sourceRank = link => ({watchmode: 0, justwatch: 1, watchhub: 9})[
    String(link?.source || '').toLowerCase()] ?? 5;
  const scopeRank = {episode: 0, season: 1, series: 2};
  const signature = link => String(link.name || '').toLowerCase().replace(/[^a-z0-9]/g,'') + '|' + String(link.web_url || '');
  const primeId = raw => {
    let url;
    try { url = new URL(String(raw || '')); } catch (_) { return ''; }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(
      host === 'primevideo.com' || host.endsWith('.primevideo.com') ||
      host === 'amazon.com' || host.endsWith('.amazon.com') ||
      host === 'amazon.com.mx' || host.endsWith('.amazon.com.mx') ||
      host === 'amazon.co.uk' || host.endsWith('.amazon.co.uk') ||
      host === 'amazon.de' || host.endsWith('.amazon.de'))) return '';
    const id = url.searchParams.get('gti') || url.searchParams.get('asin') ||
      /^\/(?:region\/[a-z]{2}\/)?(?:detail|gp\/video\/detail)\/([a-z0-9._-]+)/i.exec(url.pathname)?.[1] || '';
    return /^[a-z0-9._-]{5,80}$/i.test(id) ? id : '';
  };
  const disneyScope = link => {
    let url;
    try { url = new URL(String(link?.web_url || '')); } catch (_) { return 'series'; }
    const host = url.hostname.toLowerCase();
    if (!(host === 'disneyplus.com' || host.endsWith('.disneyplus.com'))) return link.scope;
    const path = url.pathname.toLowerCase();
    // JustWatch/WatchHub may return the SHOW'S /series/ or /browse/entity-
    // address in response to an episode query. An episode-scoped lookup is
    // NOT evidence that such a URL opens an episode in Disney+.
    if (/(?:^|\/)series(?:\/|$)|(?:^|\/)shows?(?:\/|$)|(?:^|\/)browse\/entity[-/]/.test(path) ||
        /(?:^|\/)entity[-/]/.test(path) || /(?:^|\/)title\//.test(path)) return 'series';
    if (/(?:^|\/)seasons?(?:\/|$)/.test(path))
      return link.scope === 'season' ? 'season' : 'series';
    // Distinct /play/ or /video/ URLs identify a playable entity. Only retain
    // an episode label if the episode-specific lookup carried matching numbers.
    if (/(?:^|\/)(?:play|video|watch|episodes?)(?:\/|$)/.test(path) &&
        link.scope === 'episode' && Number.isInteger(Number(link.episode))) return 'episode';
    return 'series';
  };

  Card.prototype._seriesLinksForDetail = function(detail) {
    const all = priorSeriesLinks.call(this, detail);
    const season = Number(detail?.selectedSeason);
    const episode = Number(detail?.selectedEpisode?.episode_number);
    const adjusted = all.map(link => {
      if (!/disney/i.test(String(link.name || ''))) return link;
      const scope = disneyScope(link);
      return {...link, scope: scope === 'episode' &&
        (Number(link.season) !== season || Number(link.episode) !== episode)
        ? 'series' : scope};
    });
    // If an alleged episode/season link is identical to the provider's show
    // URL, it cannot justify a more-specific caption. This also covers Prime
    // /detail/<id> URLs, whose shape alone does not reveal episode vs show.
    const seriesUrls = new Set(adjusted.filter(link => link.scope === 'series').map(signature));
    const seasonUrls = new Set(adjusted.filter(link => link.scope === 'season').map(signature));
    return adjusted.map(link => {
      if (link.scope === 'episode' && (seriesUrls.has(signature(link)) || seasonUrls.has(signature(link))))
        return {...link, scope: seriesUrls.has(signature(link)) ? 'series' : 'season'};
      if (link.scope === 'season' && seriesUrls.has(signature(link)))
        return {...link, scope: 'series'};
      return link;
    }).sort((a,b) => (scopeRank[a.scope] ?? 3) - (scopeRank[b.scope] ?? 3) || sourceRank(a)-sourceRank(b));
  };

  // Do not alter the working Play in device URL. Convert the URL only when
  // handing the selected link to the Prime Video TV app.
  Card.prototype._androidLaunchActivity = async function(activity) {
    const id = this._platform() === 'android_tv' ? primeId(activity) : '';
    if (!id) return priorAndroidActivity.call(this, activity);
    const appTarget = 'https://app.primevideo.com/detail?gti=' + encodeURIComponent(id);
    const command = 'am start -W -a android.intent.action.VIEW -d ' +
      "'" + appTarget + "'" + ' -p com.amazon.amazonvideo.livingroom';
    const adbPlayer = this._androidAdbEntity?.();
    if (adbPlayer) {
      try { return await this._hass.callService('androidtv','adb_command',{
        entity_id:adbPlayer, command,
      }); } catch (_) { /* Optional ADB is not required. */ }
    }
    const adbRemote = this._adbRemoteEntity?.();
    if (adbRemote) {
      try { return await this._hass.callService('remote','send_command',{
        entity_id:adbRemote, command,
      }); } catch (_) { /* Use the normal remote. */ }
    }
    return priorAndroidActivity.call(this, appTarget);
  };

  // Nuvio's Prime webOS routing tries the app's contentTarget before legacy
  // contentId. Preserve the original selected episode URL incl. query string.
  Card.prototype._openPrimeExactTitle = async function(rawUrl) {
    if (this._platform() !== 'webos' || !primeId(rawUrl))
      return priorWebosPrime.call(this, rawUrl);
    const url = String(rawUrl);
    try {
      return await this._hass.callService('webostv','command',{
        entity_id:this._config.tv_entity,
        command:'com.webos.applicationManager/launch',
        payload:{id:'amazon',params:{contentTarget:url}},
      });
    } catch (_) {
      return this._hass.callService('webostv','command',{
        entity_id:this._config.tv_entity,
        command:'system.launcher/launch',
        payload:{id:'amazon',contentId:url,params:{contentTarget:url,gti:primeId(url)}},
      });
    }
  };
})();

/* Streaming Browser v0.4.91: Crunchyroll Android TV opens its installed app, never a generic web intent. */
(() => {
  const Card = StreamingBrowserV2Card;
  const packageName = 'com.crunchyroll.crunchyroid';
  const isCrunchyroll = value => /crunchyroll/i.test(String(value || ''));
  const previousDestination = Card.prototype._providerDestination;
  const previousExact = Card.prototype._openExactTitle;
  const previousApp = Card.prototype._openOfficialCrunchyrollApp;
  const previousLaunch = Card.prototype._launchProvider;

  // The Android TV Crunchyroll app is not a verified HTTPS /watch/ intent
  // handler. Episode metadata from a link resolver does not change that fact.
  // This applies after v0.4.88's general URL override, including room cards.
  Card.prototype._providerDestination = function(provider, link, detail, isSeries) {
    const destination = previousDestination.call(this, provider, link, detail, isSeries);
    if (this._platform() !== 'android_tv' || !isCrunchyroll(provider)) return destination;
    return {...destination, tvCanOpen: false};
  };

  Card.prototype._openOfficialCrunchyrollApp = async function() {
    if (this._platform() !== 'android_tv') {
      return previousApp.call(this);
    }
    await this._prepareDisplayRoute();
    await this._ensureTvOn();
    if (this._androidAppIsActive?.('Crunchyroll', 'Crunchyroll')) return;
    let error;
    const remote = String(this._config?.remote_entity || '').trim();
    if (remote.startsWith('remote.')) {
      try {
        // The standard Android TV Remote app launcher accepts a package ID.
        // Unlike an HTTPS VIEW intent, this does not depend on Crunchyroll
        // registering itself as an Android browser-link handler.
        await this._hass.callService('remote', 'turn_on', {
          entity_id: remote, activity: packageName,
        });
        this._toast(this._locale?.().startsWith('es')
          ? 'Abriendo la app de Crunchyroll en la TV.'
          : 'Opening Crunchyroll app on TV.');
        return;
      } catch (err) { error = err; }
    }
    const tv = String(this._config?.tv_entity || '').trim();
    if (tv.startsWith('media_player.')) {
      try {
        await this._hass.callService('media_player', 'play_media', {
          entity_id: tv, media_content_type: 'app', media_content_id: packageName,
        });
        this._toast(this._locale?.().startsWith('es')
          ? 'Abriendo la app de Crunchyroll en la TV.'
          : 'Opening Crunchyroll app on TV.');
        return;
      } catch (err) { error = err; }
    }
    // Optional ADB is a last resort for launching the installed package,
    // never a requirement for ordinary app opening or normal remote keys.
    if (this._androidAdbEntity?.()) {
      return this._androidAdbCommand(
        'monkey -p ' + packageName + ' -c android.intent.category.LEANBACK_LAUNCHER 1'
      );
    }
    const adbRemote = this._adbRemoteEntity?.();
    if (adbRemote) {
      return this._hass.callService('remote', 'send_command', {
        entity_id: adbRemote,
        command: 'monkey -p ' + packageName + ' -c android.intent.category.LEANBACK_LAUNCHER 1',
      });
    }
    throw error || new Error('Configure an Android TV Remote or media player to open Crunchyroll.');
  };

  // Existing dashboard buttons can still have an exact-title click handler.
  // Do not send their old generic HTTPS Crunchyroll URL to Android TV either.
  Card.prototype._openExactTitle = async function(provider, autoPlay = false) {
    if (this._platform() === 'android_tv' && isCrunchyroll(provider)) {
      return this._openOfficialCrunchyrollApp();
    }
    return previousExact.call(this, provider, autoPlay);
  };

  // Keep the existing provider button, including the app-only path, working
  // when no provider content link was returned for this episode.
  Card.prototype._launchProvider = async function(provider, autoPlay = false) {
    if (this._platform() === 'android_tv' && isCrunchyroll(provider)) {
      return this._openOfficialCrunchyrollApp();
    }
    return previousLaunch.call(this, provider, autoPlay);
  };
})();

/* Streaming Browser v0.4.92: native Crunchyroll /watch/ playback on Android TV. */
(() => {
  const Card = StreamingBrowserV2Card;
  const priorDestination = Card.prototype._providerDestination;
  const priorExact = Card.prototype._openExactTitle;
  const crunchyroll = name => /crunchyroll/i.test(String(name || ''));

  // A TMDB, IMDb, show or season ID is never a Crunchyroll playback ID.
  // Only accept the content ID actually present in an official /watch/ URL.
  const watchId = link => {
    try {
      const url = new URL(String(link?.web_url || ''));
      if (url.protocol !== 'https:' || url.username || url.password ||
          !['crunchyroll.com', 'www.crunchyroll.com'].includes(url.hostname.toLowerCase())) return null;
      return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch\/([a-z0-9]+)(?:\/|$)/i.exec(url.pathname)?.[1] || null;
    } catch (_) { return null; }
  };
  const exact = (link, detail) => {
    if (!watchId(link)) return false;
    if (detail?.type !== 'tv') return !['episode', 'season', 'series'].includes(String(link.scope || '').toLowerCase());
    return String(link.scope || '').toLowerCase() === 'episode' &&
      Number(link.season) === Number(detail.selectedSeason) &&
      Number(link.episode) === Number(detail.selectedEpisode?.episode_number);
  };
  const candidates = (card, detail) => detail?.type === 'tv'
    ? (card._seriesLinksForDetail?.(detail) || detail?.episodeSources || [])
    : (detail?.localSources || []);

  // Make a verified /watch/ URL an Episode/Movie TV action rather than App.
  // A /series/ URL or an incorrectly scoped episode keeps the App fallback.
  Card.prototype._providerDestination = function(provider, link, detail, isSeries) {
    const route = priorDestination.call(this, provider, link, detail, isSeries);
    if (this._platform() !== 'android_tv' || !crunchyroll(provider) || !exact(link, detail)) return route;
    return {...route, deviceKind: detail?.type === 'tv' ? 'episode' : 'movie', tvCanOpen: true};
  };

  Card.prototype._playCrunchyrollWatch = async function(link, detail) {
    const id = watchId(link);
    if (!id || !exact(link, detail)) throw new Error('No exact Crunchyroll watch link is available for this title.');
    // Tested for episodes on Android TV; the movie scheme uses the APK's
    // movie destination but still requires an on-device movie playback test.
    const uri = `crunchyroll://${detail?.type === 'tv' ? 'episode' : 'movie'}/${id}`;
    await this._prepareDisplayRoute();
    await this._ensureTvOn();
    let remoteError;
    const remote = String(this._config?.remote_entity || '').trim();
    if (remote.startsWith('remote.')) {
      try {
        await this._hass.callService('remote', 'turn_on', {entity_id: remote, activity: uri});
        return;
      } catch (error) { remoteError = error; }
    }
    const player = String(this._config?.tv_entity || '').trim();
    if (player.startsWith('media_player.')) {
      try {
        await this._hass.callService('media_player', 'play_media', {
          entity_id: player, media_content_type: 'url', media_content_id: uri,
        });
        return;
      } catch (error) { remoteError = error; }
    }
    throw remoteError || new Error('Set an Android TV Remote or Android TV media player in the selected room.');
  };

  Card.prototype._openExactTitle = async function(provider, autoPlay = false) {
    if (this._platform() !== 'android_tv' || !crunchyroll(provider)) {
      return priorExact.call(this, provider, autoPlay);
    }
    const detail = this._details;
    // Use the same provider-selected source list as the card, respecting its
    // episode > season > series resolution and WatchHub-last ordering.
    let available = candidates(this, detail).filter(link => exact(link, detail));
    if (!available.length && detail?.type !== 'tv' && this._watchmodeSourcesForCurrentTitle) {
      try {
        const resolved = await this._watchmodeSourcesForCurrentTitle({silent: true});
        if (this._details === detail) available = (Array.isArray(resolved) ? resolved : []).filter(link => exact(link, detail));
      } catch (_) { /* Retain app-only fallback when no movie link resolves. */ }
    }
    const selected = this._pickWatchmodeSource?.(provider, available);
    if (!selected || !exact(selected, detail)) return priorExact.call(this, provider, autoPlay);
    return this._playCrunchyrollWatch(selected, detail);
  };
})();


/* Netflix v0.4.93: verified Android TV ADB playback.
 * Never append a Play/OK key after the Netflix intent: the app handles
 * movie playback itself and episode switching needs no extra key.
 */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousExact = Card.prototype._openExactTitle;
  const previousDestination = Card.prototype._providerDestination;
  const isNetflix = name => /netflix/i.test(String(name || ''));
  const video = (raw, episode) => {
    try {
      const url = new URL(String(raw || ''));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          !['netflix.com', 'www.netflix.com'].includes(url.hostname.toLowerCase())) return null;
      const match = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(watch|title)\/(\d+)\/?$/i.exec(url.pathname);
      if (!match || (episode && match[1].toLowerCase() !== 'watch')) return null;
      return match[2];
    } catch (_) { return null; }
  };
  const matchesEpisode = (link, detail) => link?.scope === 'episode' &&
    Number(link.season) === Number(detail?.selectedSeason) &&
    Number(link.episode) === Number(detail?.selectedEpisode?.episode_number);

  // Only expose exact episode playback for a genuine Netflix /watch/
  // episode ID tied to the currently selected season and episode.
  Card.prototype._providerDestination = function(provider, link, detail, isSeries) {
    const old = previousDestination.call(this, provider, link, detail, isSeries);
    if (this._platform() !== 'android_tv' || !isNetflix(provider) ||
        !this._androidAdbEntity?.()) return old;
    const id = video(link?.web_url, isSeries);
    if (!id || (isSeries && !matchesEpisode(link, detail))) return old;
    return {...old, deviceKind: isSeries ? 'episode' : 'movie', tvCanOpen: true};
  };

  Card.prototype._openExactTitle = async function(provider, autoPlay = false) {
    if (this._platform() !== 'android_tv' || !isNetflix(provider)) {
      return previousExact.call(this, provider, autoPlay);
    }
    // Preserve the existing non-ADB configuration behavior. When an
    // ADB connection was selected but is unavailable, do not silently
    // downgrade an exact-play request to the Netflix home screen.
    if (!this._androidAdbEntity?.()) {
      if (!this._config?.adb_entity) return previousExact.call(this, provider, autoPlay);
      this._toast('Netflix ADB media player is unavailable for the selected room.');
      return;
    }
    const detail = this._details;
    const episode = detail?.type === 'tv';
    if (!detail || (episode && !detail.selectedEpisode)) {
      this._toast('Select an episode before playing on Netflix.');
      return;
    }
    try {
      const sources = episode
        ? (!detail.episodeSourcesLoading ? detail.episodeSources || [] : [])
        : (!detail.localSourcesLoading && detail.localSources?.length
            ? detail.localSources
            : await this._watchmodeSourcesForCurrentTitle());
      const valid = sources.filter(link => isNetflix(link?.name) &&
        video(link?.web_url, episode) &&
        (!episode || matchesEpisode(link, detail)));
      const selected = this._pickWatchmodeSource(provider, valid);
      const id = selected && video(selected.web_url, episode);
      if (!id) {
        this._toast(episode
          ? 'No exact Netflix episode URL is available; a series ID cannot play an episode.'
          : 'No playable Netflix movie URL is available.');
        return;
      }
      // Existing room connection power, HDMI routing and wake logic.
      await this._prepareDisplayRoute();
      await this._ensureTvOn();
      await this._androidAdbCommand(
        'am start -a android.intent.action.VIEW ' +
        '-d http://www.netflix.com/watch/' + id + ' ' +
        '--es source 30 -n com.netflix.ninja/.MainActivity'
      );
      // Do NOT call _launchProvider, _applyProfile, _sendProviderPlay,
      // keyevent 23, force-stop or any restart path after this intent.
      this._toast('Netflix playback requested on the selected Android TV.');
    } catch (err) {
      this._toast('Netflix ADB launch failed: ' + this._formatError(err));
    }
  };
})();

/* Streaming Browser v0.4.94: Prime Video GTI details through Android TV Remote; manual playback. */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousDestination = Card.prototype._providerDestination;
  const previousExact = Card.prototype._openExactTitle;
  const previousLaunch = Card.prototype._launchProvider;
  const previousProfile = Card.prototype._applyProfile;
  const previousAndroidActivity = Card.prototype._androidLaunchActivity;
  const isPrime = name => /(?:prime\s*video|amazon\s*prime|amazon\s*video|^prime$)/i.test(String(name || ''));
  const episodeMatches = (link, detail) => link?.scope === 'episode' &&
    Number.isInteger(Number(link.season)) && Number(link.season) === Number(detail?.selectedSeason) &&
    Number.isInteger(Number(link.episode)) && Number(link.episode) === Number(detail?.selectedEpisode?.episode_number);
  const gtiFromUrl = raw => {
    try {
      const url = new URL(String(raw || ''));
      if (url.protocol !== 'https:' || url.username || url.password ||
          !['app.primevideo.com', 'www.primevideo.com', 'primevideo.com'].includes(url.hostname.toLowerCase())) return null;
      // A /region/na/detail/<ASIN> URL is NOT an episode GTI, even with autoplay=1.
      // The Android TV app opened Home instead when non-GTI IDs were placed in ?gti=.
      const gti = url.searchParams.get('gti');
      return /^amzn1\.dv\.gti\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(gti || '')) ? gti : null;
    } catch (_) { return null; }
  };
  const validPrime = link => gtiFromUrl(link?.web_url);
  const localized = (card, en, es) => card._locale?.().startsWith('es') ? es : en;
  const available = (card, detail) => detail?.type === 'tv'
    ? (!detail.episodeSourcesLoading ? (card._seriesLinksForDetail?.(detail) || detail.episodeSources || []) : [])
    : (!detail?.localSourcesLoading ? (detail?.localSources || []) : []);

  Card.prototype._providerDestination = function(provider, link, detail, isSeries) {
    const route = previousDestination.call(this, provider, link, detail, isSeries);
    if (this._platform() !== 'android_tv' || !isPrime(provider)) return route;
    if (!validPrime(link)) return {...route, deviceKind: 'app', tvCanOpen: false};
    if (!isSeries) return {...route, deviceKind: 'movie', tvCanOpen: true};
    if (episodeMatches(link, detail)) return {...route, deviceKind: 'episode', tvCanOpen: true};
    if (link?.scope === 'season' && Number(link.season) === Number(detail?.selectedSeason))
      return {...route, deviceKind: 'season', tvCanOpen: true};
    return {...route, deviceKind: 'series', tvCanOpen: true};
  };

  Card.prototype._primeOpenGti = async function(rawUrl) {
    const gti = gtiFromUrl(rawUrl);
    if (!gti) throw new Error('An episode/movie/season-specific Prime Video GTI link is required.');
    const remote = String(this._config?.remote_entity || '').trim();
    if (!remote.startsWith('remote.')) throw new Error('Select an Android TV Remote entity for this room.');
    const activity = 'https://app.primevideo.com/detail?gti=' + encodeURIComponent(gti);
    // Non-ADB route verified on the user's Android TV for an individual episode.
    // Do not send Enter, Play, autoplay, force-stop, or any profile/PIN navigation.
    await this._prepareDisplayRoute();
    await this._ensureTvOn();
    await this._hass.callService('remote', 'turn_on', {entity_id: remote, activity});
    this._toast(localized(this, 'Prime Video details opened; choose your profile and Play manually.',
      'Se abrieron los detalles de Prime Video; elige el perfil y reproduce manualmente.'));
  };

  Card.prototype._openExactTitle = async function(provider, autoPlay = false) {
    if (this._platform() !== 'android_tv' || !isPrime(provider))
      return previousExact.call(this, provider, autoPlay);
    const detail = this._details;
    if (!detail) return;
    if (detail.type === 'tv' && !detail.selectedEpisode) {
      this._toast(localized(this, 'Select an episode first.', 'Selecciona primero un episodio.'));
      return;
    }
    try {
      let links = available(this, detail);
      if (detail.type !== 'tv' && !links.some(validPrime) && this._watchmodeSourcesForCurrentTitle) {
        const loaded = await this._watchmodeSourcesForCurrentTitle({silent: true});
        if (this._details !== detail) return;
        links = [...links, ...(Array.isArray(loaded) ? loaded : [])];
      }
      const matching = links.filter(link => validPrime(link));
      const currentEpisode = detail.type === 'tv'
        ? matching.filter(link => episodeMatches(link, detail)) : matching;
      let selected = this._pickWatchmodeSource(provider, currentEpisode);
      let fallback = '';
      if (!selected && detail.type === 'tv') {
        selected = this._pickWatchmodeSource(provider, matching.filter(link =>
          link.scope === 'season' && Number(link.season) === Number(detail.selectedSeason)));
        if (selected) fallback = 'season';
        if (!selected) {
          selected = this._pickWatchmodeSource(provider, matching.filter(link => link.scope === 'series'));
          if (selected) fallback = 'series';
        }
      }
      if (!selected) {
        this._toast(localized(this, 'No Prime Video GTI for this title; an ASIN cannot be used as an episode GTI.',
          'No hay GTI de Prime Video para este título; un ASIN no es un GTI de episodio.'));
        return;
      }
      await this._primeOpenGti(selected.web_url);
      if (fallback) this._toast(localized(this,
        `No exact episode GTI; opened the ${fallback} details for manual episode selection.`,
        `No hay GTI del episodio; se abrieron los detalles de ${fallback === 'season' ? 'la temporada' : 'la serie'} para seleccionar el episodio manualmente.`));
    } catch (error) {
      this._toast(localized(this, 'Prime Video link failed: ', 'Falló el enlace de Prime Video: ') +
        (this._formatError?.(error) || String(error)));
    }
  };

  // Keep Open app separate from exact-title links, but never auto-press Play.
  Card.prototype._launchProvider = async function(provider, autoPlay = false) {
    return previousLaunch.call(this, provider,
      this._platform() === 'android_tv' && isPrime(provider) ? false : autoPlay);
  };
  Card.prototype._applyProfile = async function(provider, source, options = {}) {
    if (this._platform() === 'android_tv' && (isPrime(provider) || isPrime(source))) return false;
    return previousProfile.call(this, provider, source, options);
  };
  // Protect other direct URL launch paths from the old ASIN -> GTI rewrite.
  Card.prototype._androidLaunchActivity = async function(activity) {
    if (this._platform() !== 'android_tv') return previousAndroidActivity.call(this, activity);
    let url;
    try { url = new URL(String(activity || '')); } catch (_) { return previousAndroidActivity.call(this, activity); }
    if (!['primevideo.com', 'www.primevideo.com', 'app.primevideo.com'].includes(url.hostname.toLowerCase()))
      return previousAndroidActivity.call(this, activity);
    if (gtiFromUrl(activity)) {
      const remote = String(this._config?.remote_entity || '').trim();
      if (!remote.startsWith('remote.')) throw new Error('Select an Android TV Remote entity for this room.');
      return this._hass.callService('remote', 'turn_on', {entity_id: remote,
        activity: 'https://app.primevideo.com/detail?gti=' + encodeURIComponent(gtiFromUrl(activity))});
    }
    if (/\/(?:region\/[a-z]{2}\/)?detail(?:\/|$)/i.test(url.pathname) || url.searchParams.has('gti'))
      throw new Error('Unsupported Prime Video title ID; a real amzn1.dv.gti. link is required.');
    return previousAndroidActivity.call(this, activity);
  };
})();


/* Netflix v0.4.96: exact episode > selected season > series navigation.
 * Never treat a series title ID as an episode ID or auto-press Enter.
 */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousExact = Card.prototype._openExactTitle;
  const previousDestination = Card.prototype._providerDestination;
  const isNetflix = name => /netflix/i.test(String(name || ''));
  const parse = raw => {
    try {
      const url = new URL(String(raw || ''));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          !['netflix.com', 'www.netflix.com'].includes(url.hostname.toLowerCase())) return null;
      const match = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(watch|title)\/(\d+)\/?$/i.exec(url.pathname);
      return match ? {kind: match[1].toLowerCase(), id: match[2]} : null;
    } catch (_) { return null; }
  };
  const episodeMatches = (link, detail) =>
    link?.scope === 'episode' && Number.isInteger(Number(link.season)) &&
    Number.isInteger(Number(link.episode)) &&
    Number(link.season) === Number(detail?.selectedSeason) &&
    Number(link.episode) === Number(detail?.selectedEpisode?.episode_number);
  const seasonMatches = (link, detail) =>
    link?.scope === 'season' && Number.isInteger(Number(link.season)) &&
    Number(link.season) === Number(detail?.selectedSeason);
  const select = (card, provider, sources, detail, tier) => {
    const matches = (Array.isArray(sources) ? sources : []).filter(link => {
      if (!isNetflix(link?.name)) return false;
      const target = parse(link.web_url);
      if (!target) return false;
      if (tier === 'episode') return target.kind === 'watch' && episodeMatches(link, detail);
      // Netflix /title/ links are navigation only. Do not play a random
      // video from a season/series link that happens to contain /watch/.
      if (target.kind !== 'title') return false;
      return tier === 'season' ? seasonMatches(link, detail) : link.scope === 'series';
    });
    return card._pickWatchmodeSource(provider, matches) || null;
  };
  const localized = (card, en, es) => card._locale?.().startsWith('es') ? es : en;

  Card.prototype._providerDestination = function(provider, link, detail, isSeries) {
    const original = previousDestination.call(this, provider, link, detail, isSeries);
    if (this._platform() !== 'android_tv' || !isNetflix(provider) ||
        !this._androidAdbEntity?.() || !isSeries) return original;
    const target = parse(link?.web_url);
    if (!target) return original;
    if (target.kind === 'watch' && episodeMatches(link, detail))
      return {...original, deviceKind: 'episode', tvCanOpen: true};
    if (target.kind === 'title' && seasonMatches(link, detail))
      return {...original, deviceKind: 'season', tvCanOpen: true};
    if (target.kind === 'title' && link?.scope === 'series')
      return {...original, deviceKind: 'series', tvCanOpen: true};
    return original;
  };

  Card.prototype._openExactTitle = async function(provider, autoPlay = false) {
    if (this._platform() !== 'android_tv' || !isNetflix(provider))
      return previousExact.call(this, provider, autoPlay);
    // Preserve existing non-ADB behavior. Never silently downgrade a
    // configured but disconnected ADB player to Netflix's home page.
    if (!this._androidAdbEntity?.()) {
      if (!this._config?.adb_entity) return previousExact.call(this, provider, autoPlay);
      this._toast(localized(this, 'Netflix ADB media player is unavailable for this room.',
        'El reproductor ADB de Netflix no está disponible para esta habitación.'));
      return;
    }
    const detail = this._details;
    if (!detail || (detail.type === 'tv' && !detail.selectedEpisode)) {
      this._toast(localized(this, 'Select an episode first.', 'Selecciona primero un episodio.'));
      return;
    }
    const isSeries = detail.type === 'tv';
    try {
      let selected = null;
      let tier = 'movie';
      if (isSeries) {
        // Prevent premature series fallback while an exact episode
        // lookup is still in flight.
        if (detail.episodeSourcesLoading) {
          this._toast(localized(this, 'Episode links are still loading; retry shortly.',
            'Todavía se están buscando enlaces del episodio; inténtalo de nuevo.'));
          return;
        }
        const links = this._seriesLinksForDetail?.(detail) || [
          ...(detail.episodeSources || []), ...(detail.seriesFallbackSources || [])];
        for (const level of ['episode', 'season', 'series']) {
          selected = select(this, provider, links, detail, level);
          if (selected) { tier = level; break; }
        }
        // A series link may also be available from the existing
        // Watchmode lookup even when episode/season lookup returned none.
        if (!selected && this._watchmodeSourcesForCurrentTitle) {
          try {
            const extra = await this._watchmodeSourcesForCurrentTitle({silent: true});
            if (this._details !== detail) return;
            selected = select(this, provider, (extra || []).map(link =>
              ({...link, scope: 'series'})), detail, 'series');
            if (selected) tier = 'series';
          } catch (_) { /* A missing optional lookup must not launch the wrong title. */ }
        }
      } else {
        let links = !detail.localSourcesLoading ? detail.localSources || [] : [];
        if (!links.some(link => isNetflix(link?.name) && parse(link?.web_url)) &&
            this._watchmodeSourcesForCurrentTitle) {
          links = await this._watchmodeSourcesForCurrentTitle({silent: true});
          if (this._details !== detail) return;
        }
        const movies = (Array.isArray(links) ? links : []).filter(link =>
          isNetflix(link?.name) && parse(link?.web_url));
        selected = this._pickWatchmodeSource(provider, movies);
      }
      const target = selected && parse(selected.web_url);
      if (!target) {
        this._toast(localized(this,
          isSeries ? 'No Netflix episode, season or series link was found for this title.' : 'No playable Netflix movie link was found.',
          isSeries ? 'No se encontró un enlace de Netflix para el episodio, la temporada o la serie.' : 'No se encontró un enlace de Netflix para la película.'));
        return;
      }
      // Only an exact episode (or a movie) uses /watch/ with source=30.
      // Season and series links use their own /title/ ID for navigation;
      // a /title/ URL is not evidence of an exact playable episode.
      const route = isSeries && tier !== 'episode' ? 'title' : 'watch';
      await this._prepareDisplayRoute();
      await this._ensureTvOn();
      await this._androidAdbCommand(
        'am start -a android.intent.action.VIEW ' +
        '-d http://www.netflix.com/' + route + '/' + target.id + ' ' +
        '--es source 30 -n com.netflix.ninja/.MainActivity'
      );
      this._toast(tier === 'episode' || tier === 'movie'
        ? localized(this, 'Netflix playback requested on this Android TV.',
            'Se solicitó la reproducción en Netflix en esta Android TV.')
        : tier === 'season'
          ? localized(this, 'No exact episode link; opening the season for manual episode selection.',
              'No hay enlace del episodio; abriendo la temporada para seleccionar el episodio manualmente.')
          : localized(this, 'No episode or season link; opening the series for manual episode selection.',
              'No hay enlace del episodio ni de la temporada; abriendo la serie para seleccionar el episodio manualmente.'));
      // No auto Enter/Play, no profile navigation and no app restart.
    } catch (error) {
      this._toast(localized(this, 'Netflix launch failed: ', 'Falló el enlace de Netflix: ') +
        (this._formatError?.(error) || String(error)));
    }
  };
})();

/* Streaming Browser v0.4.97: close a different foreground streaming app before switching.
 * Never stop an app when the selected provider is already foreground.
 * Only force-stop recognized streaming apps on Android TV when ADB is configured;
 * on other platforms use HOME to leave the current app before opening the next.
 */
(() => {
  const Card = StreamingBrowserV2Card;
  const oldPrepareRoute = Card.prototype._prepareDisplayRoute;
  const catalog = [
    {key: 'netflix', pkg: 'com.netflix.ninja', pattern: /netflix/i},
    {key: 'prime', pkg: 'com.amazon.amazonvideo.livingroom', pattern: /(?:prime\s*video|amazon\s*prime|amazonvideo|amazonvideo\.livingroom)/i},
    {key: 'crunchyroll', pkg: 'com.crunchyroll.crunchyroid', pattern: /crunchyroll/i},
    {key: 'disney', pkg: 'com.disney.disneyplus', pattern: /disney/i},
    {key: 'max', pkg: 'com.wbd.stream', pattern: /(?:^|[.\s])(?:hbo\s*)?max(?:$|[.\s])|com\.wbd\.stream|com\.hbo\.hbomax/i},
    {key: 'youtube', pkg: 'com.google.android.youtube.tv', pattern: /youtube/i},
    {key: 'plex', pkg: 'com.plexapp.android', pattern: /plex/i},
    {key: 'paramount', pkg: 'com.cbs.ott', pattern: /paramount|com\.cbs\.ott/i},
    {key: 'apple', pkg: 'com.apple.atve.androidtv.appletv', pattern: /apple\s*tv|com\.apple\.atve/i},
  ];
  const identify = value => catalog.find(app => app.pattern.test(String(value || ''))) || null;
  const currentApp = card => card._platform() === 'android_tv'
    ? card._androidActivity?.() || ''
    : card._platform() === 'webos'
      ? card._tvState?.()?.attributes?.source || ''
      : card._tvState?.()?.attributes?.app_id ||
        card._tvState?.()?.attributes?.source || '';
  const leavePrevious = async (card, targetName) => {
    const target = identify(targetName);
    const previous = identify(currentApp(card));
    // Unknown or system foreground apps must not be force-stopped.
    // If already in the same streaming app, retain its running session.
    if (!target || !previous || target.key === previous.key) return;
    if (card._platform() === 'android_tv' && card._androidAdbEntity?.()) {
      await card._androidAdbCommand('am force-stop ' + previous.pkg);
      return;
    }
    // webOS/Roku/standard Android TV remotes can leave the foreground
    // app with HOME, but cannot guarantee OS-level process termination.
    if (card._platform() === 'android_tv' || card._platform() === 'roku') {
      const remote = String(card._config?.remote_entity || '');
      if (remote.startsWith('remote.')) {
        await card._hass.callService('remote', 'send_command', {
          entity_id: remote, command: 'HOME',
        });
      }
    } else if (card._platform() === 'webos') {
      await card._sendRemoteButton('HOME');
    }
  };
  // Existing power/HDMI preparation runs first. The close operation
  // happens just before each selected app's launch, not on idle renders.
  Card.prototype._prepareDisplayRoute = async function(...args) {
    await oldPrepareRoute.apply(this, args);
    if (!this._appSwitchTarget || this._appSwitchChecked) return;
    this._appSwitchChecked = true;
    await leavePrevious(this, this._appSwitchTarget);
  };
  const wrap = (name, destination) => {
    const original = Card.prototype[name];
    if (typeof original !== 'function') return;
    Card.prototype[name] = async function(...args) {
      const priorTarget = this._appSwitchTarget;
      const priorChecked = this._appSwitchChecked;
      this._appSwitchTarget = destination(...args);
      this._appSwitchChecked = false;
      try { return await original.apply(this, args); }
      finally {
        this._appSwitchTarget = priorTarget;
        this._appSwitchChecked = priorChecked;
      }
    };
  };
  // Cover Play on TV, Open app, and the platform-specific playback
  // helpers without modifying Netflix's verified source=30 intent.
  wrap('_openExactTitle', provider => provider);
  wrap('_launchProvider', provider => provider);
  wrap('_playCrunchyrollWatch', () => 'Crunchyroll');
  wrap('_openOfficialCrunchyrollApp', () => 'Crunchyroll');
  wrap('_primeOpenGti', () => 'Prime Video');
})();


/* Streaming Browser V2 v0.4.99: independent layout over the original full-featured card. */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousRender = Card.prototype._render;
  const keys = ['provider-popular', 'provider-top-rated', 'provider-recent'];
  const tabLabels = { 'provider-popular': 'popular', 'provider-top-rated': 'top_rated',
                      'provider-recent': 'recent_releases' };
  const tabIcons = { 'provider-popular': 'mdi:star-outline',
                     'provider-top-rated': 'mdi:chart-bar',
                     'provider-recent': 'mdi:clock-outline' };
  const styles = `
    :host { width:100%; min-width:0; display:block; }
    ha-card { width:100%; height: min(1050px, calc(100dvh - 76px));
      min-height:470px; max-width:100%; display:block; overflow:hidden; }
    ha-card > .wrap { padding:0; height:100%; min-height:0; min-width:0;
      display:flex; flex-direction:column; overflow:hidden; }
    .v2-header { position:relative; flex:0 0 auto; z-index:25; min-width:0;
      background:var(--card-background-color); padding:clamp(10px,1.5vw,20px);
      border-bottom:1px solid var(--divider-color); box-shadow:0 4px 14px #0002; }
    .v2-header .top { position:relative; top:auto; display:flex;
      flex-wrap:wrap; align-items:center; gap:9px; margin:0 0 10px; }
    .v2-header .top .title { flex:1 1 190px; font-size:clamp(18px,2.5vw,25px); }
    .v2-header .top .tvstate { min-width:0; font-size:11px; }
    .v2-header .top .search { order:10; flex:1 1 100%; width:100%; min-width:0;
      max-width:none; margin:0; }
    .v2-header .sbr-room-controls { flex:0 1 235px; gap:5px; min-width:120px; }
    .v2-header .sbr-room-controls .sbr-route-label { flex:1 1 100px;
      min-width:100px; font-size:0; }
    .v2-header .sbr-room-controls .sbr-route-label select { font-size:13px;
      border-radius:22px; min-height:36px; padding:7px 12px; }
    .v2-provider-strip { display:flex; align-items:center; min-width:0;
      gap:clamp(10px,2vw,28px); overflow-x:auto; overscroll-behavior-inline:contain;
      scrollbar-width:thin; padding:2px 1px 10px; }
    .v2-provider-strip .switcher { flex:0 0 auto; flex-wrap:nowrap; margin:0; }
    .v2-provider-strip .mode { min-height:62px; min-width:78px; }
    .v2-provider-strip .chips { flex:0 0 auto; overflow:visible;
      padding:0; gap:8px; align-items:center; }
    .v2-provider-strip .chip { width:70px; min-width:70px; height:64px;
      padding:6px; display:flex; align-items:center; justify-content:center;
      gap:3px; border-radius:13px; }
    .v2-provider-strip .chip:not([data-provider="all"]) span { display:none; }
    .v2-provider-strip .chip img { width:38px; height:38px; border-radius:8px; }
    .v2-provider-strip .chip[data-provider="all"] { flex-direction:column; }
    .v2-provider-strip .chip[data-provider="all"] ha-icon { --mdc-icon-size:24px; }
    .v2-provider-strip .chip[data-provider="all"] span { font-size:11px;
      font-weight:650; line-height:1; white-space:nowrap; }
    .v2-categories { display:flex; gap:8px; overflow-x:auto;
      overscroll-behavior-inline:contain; scrollbar-width:thin; padding-top:10px;
      border-top:1px solid var(--divider-color); }
    .v2-category-tab { flex:1 0 max-content; display:flex; align-items:center;
      justify-content:center; gap:9px; padding:10px 14px; min-height:44px;
      border:1px solid var(--divider-color); border-radius:10px;
      background:var(--secondary-background-color); color:var(--primary-text-color);
      cursor:pointer; font:inherit; font-size:13px; font-weight:650; }
    .v2-category-tab.active { border-color:var(--primary-color);
      background:color-mix(in srgb,var(--primary-color) 22%,var(--secondary-background-color)); }
    .v2-category-tab ha-icon { --mdc-icon-size:20px; }
    .v2-body { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain;
      padding:clamp(10px,1.5vw,20px); scrollbar-width:thin; }
    .v2-body .catalog-section { margin:0; min-width:0; }
    .v2-body .catalog-heading { display:none; }
    .v2-body .catalog-row { width:100%; min-width:0; max-width:100%; }
    .v2-see-all { display:flex; align-items:center; justify-content:flex-end;
      gap:6px; margin:18px 0 3px auto; min-height:38px; border:0;
      background:transparent; color:var(--primary-text-color); cursor:pointer;
      font:inherit; font-size:13px; opacity:.88; padding:6px 8px; }
    .v2-see-all ha-icon { --mdc-icon-size:18px; }
    .v2-expanded .catalog-row { display:grid; grid-auto-flow:row;
      grid-auto-columns:auto; grid-template-columns:repeat(auto-fill,minmax(min(155px,38vw),1fr));
      gap:14px; overflow:visible; scroll-snap-type:none; }
    .v2-expanded .catalog-row .poster { width:100%; min-width:0; }
    .v2-expanded .catalog-row .row-loading { width:100%; min-height:110px; }
    @media(max-width:600px) {
      ha-card { height:calc(100dvh - 60px); min-height:430px; }
      .v2-header { padding:9px; }
      .v2-header .top .title { flex:1 1 125px; }
      .v2-header .top .tvstate { display:none; }
      .v2-header .sbr-room-controls { flex:0 1 155px; }
      .v2-provider-strip { gap:9px; }
      .v2-provider-strip .mode { min-height:56px; padding:7px 9px; }
      .v2-provider-strip .genre-select { min-width:110px; max-width:135px; margin:0; }
      .v2-provider-strip .chip { width:59px; min-width:59px; height:57px; }
      .v2-provider-strip .chip img { width:32px; height:32px; }
      .v2-category-tab { padding:9px 12px; min-height:40px; font-size:12px; }
      .v2-body { padding:10px 9px; }
    }
  `;

  // Preserve the original card's room/connection, TV routing, details and editor.
  // Reorganize only this V2 instance's rendered DOM; V1 remains entirely separate.
  Card.prototype._render = function(...args) {
    const previousBody = this.shadowRoot?.querySelector('.v2-body');
    const oldScroll = previousBody?.scrollTop || 0;
    previousRender.apply(this, args);
    const root = this.shadowRoot;
    const wrap = root?.querySelector('ha-card > .wrap');
    if (!wrap) return;
    const top = wrap.querySelector(':scope > .top');
    const switcher = wrap.querySelector(':scope > .switcher');
    const chips = wrap.querySelector(':scope > .chips');
    if (!top || !switcher || !chips) return;

    const style = document.createElement('style');
    style.textContent = styles;
    root.append(style);

    const header = document.createElement('div');
    header.className = 'v2-header';
    const strip = document.createElement('div');
    strip.className = 'v2-provider-strip';
    strip.append(switcher, chips);
    header.append(top, strip);

    // The full 'All' caption belongs INSIDE its own icon-above-label chip.
    const allChip = chips.querySelector('.chip[data-provider="all"]');
    if (allChip) {
      allChip.innerHTML = '<ha-icon icon="mdi:apps" aria-hidden="true"></ha-icon><span>All</span>';
      allChip.setAttribute('aria-label', this._t('all_sources'));
    }
    chips.querySelectorAll('.chip[data-provider]:not([data-provider="all"])').forEach(chip => {
      const name = chip.querySelector('span')?.textContent?.trim() || chip.title || '';
      chip.querySelectorAll(':scope > span').forEach(span => span.remove());
      if (name) { chip.title = name; chip.setAttribute('aria-label', name); }
    });

    const searchActive = String(this._query || '').trim().length >= 2;
    const actualCategories = (this._sections || []).filter(s => keys.includes(s.key));
    if (!keys.includes(this._v2CategoryKey)) this._v2CategoryKey = keys[0];
    if (!searchActive && actualCategories.length &&
        !actualCategories.some(s => s.key === this._v2CategoryKey)) {
      this._v2CategoryKey = actualCategories[0].key;
    }
    if (!searchActive) {
      const nav = document.createElement('nav');
      nav.className = 'v2-categories';
      nav.setAttribute('aria-label', this._locale() === 'es' ? 'Categorías' : 'Categories');
      for (const key of keys) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'v2-category-tab' + (key === this._v2CategoryKey ? ' active' : '');
        tab.dataset.v2Category = key;
        tab.setAttribute('aria-pressed', String(key === this._v2CategoryKey));
        tab.innerHTML = `<ha-icon icon="${tabIcons[key]}" aria-hidden="true"></ha-icon><span>${this._t(tabLabels[key])}</span>`;
        tab.addEventListener('click', () => {
          if (this._v2CategoryKey === key && !this._v2ShowAll) return;
          this._v2CategoryKey = key;
          this._v2ShowAll = false;
          this._v2ResetScroll = true;
          this._render();
        });
        nav.append(tab);
      }
      header.append(nav);
    }

    const body = document.createElement('div');
    body.className = 'v2-body';
    // Keep all existing error states, provider details and actions in the body.
    for (const child of [...wrap.children]) body.append(child);
    wrap.append(header, body);
    const sections = body.querySelectorAll('.catalog-section');
    sections.forEach(sectionElement => {
      const row = sectionElement.querySelector('.catalog-row[data-section]');
      if (!row) return;
      const key = row.dataset.section;
      const selected = searchActive || key === this._v2CategoryKey;
      sectionElement.hidden = !selected;
      sectionElement.style.display = selected ? '' : 'none';
      if (!selected) return;
      if (!searchActive && keys.includes(key)) {
        sectionElement.classList.toggle('v2-expanded', this._v2ShowAll === true);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'v2-see-all';
        const expanded = this._v2ShowAll === true;
        button.setAttribute('aria-expanded', String(expanded));
        button.innerHTML = `<span>${expanded
          ? (this._locale() === 'es' ? 'Volver al carrusel' : 'Back to carousel')
          : (this._locale() === 'es' ? 'Ver todo' : 'See all')}</span><ha-icon icon="mdi:chevron-right" aria-hidden="true"></ha-icon>`;
        button.addEventListener('click', () => {
          this._v2ShowAll = !expanded;
          this._v2ResetScroll = true;
          this._render();
        });
        sectionElement.append(button);
      }
    });
    body.scrollTop = this._v2ResetScroll ? 0 : oldScroll;
    this._v2ResetScroll = false;
    body.addEventListener('scroll', () => {
      if (!this._v2ShowAll || searchActive) return;
      if (body.scrollHeight - body.scrollTop - body.clientHeight > 450) return;
      const category = this._sections?.find(s => s.key === this._v2CategoryKey);
      if (category && !category.loadingMore && Number(category.page) < Number(category.totalPages)) {
        void this._loadMoreSection(category.key);
      }
    }, { passive: true });
  };
})();

