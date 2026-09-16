/*
 * Streaming Browser Card for Home Assistant + LG webOS
 * v0.4.46
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

  static getConfigForm() {
    const labels = {
      title: "Card title",
      platform: "Platform",
      tv_entity: "Media player",
      remote_entity: "Android TV remote",
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
      profile_launch_delay_ms: "Profile app launch delay",
      profile_navigation_delay_ms: "Profile navigation step delay",
      netflix_profile_autoselect: "Auto-select Netflix profile",
      netflix_profile_launch_delay_ms: "Netflix profile picker delay",
      netflix_profile_navigation_delay_ms: "Netflix profile navigation delay",
      netflix_profile_after_select_delay_ms: "Netflix profile settle delay",
      profiles: "Profiles and per-app behavior",
      provider_sources: "Provider source overrides",
      android_app_links: "Android app/deep-link overrides",
    };

    const helpers = {
      platform:
        "Choose LG webOS or Android TV Remote.",
      remote_entity:
        "Required for Android TV. Use the remote entity from the Android TV Remote integration.",
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
      netflix_profile_autoselect:
        "Automatically select the active Streaming Browser profile when Netflix shows its TV profile picker.",
      netflix_profile_launch_delay_ms:
        "How long to wait for Netflix to show its profile picker after a fresh launch.",
      netflix_profile_navigation_delay_ms:
        "Delay between Netflix profile-picker remote steps.",
      netflix_profile_after_select_delay_ms:
        "Delay after choosing the Netflix profile before sending a title deep link.",
      profiles:
        "Advanced object containing profile names, app modes, PIN scripts and navigation sequences.",
      provider_sources:
        "Advanced mapping used when automatic provider-to-app matching needs an override.",
      android_app_links:
        "Optional Android provider-to-deep-link mapping. Built-in defaults cover common streaming apps.",
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
            {
              name: "netflix_profile_autoselect",
              selector: { boolean: {} },
            },
            {
              type: "grid",
              name: "",
              flatten: true,
              column_min_width: "170px",
              schema: [
                {
                  name: "profile_launch_delay_ms",
                  selector: {
                    number: {
                      min: 0,
                      step: 100,
                      unit_of_measurement: "ms",
                    },
                  },
                },
                {
                  name: "profile_navigation_delay_ms",
                  selector: {
                    number: {
                      min: 0,
                      step: 50,
                      unit_of_measurement: "ms",
                    },
                  },
                },
                {
                  name: "netflix_profile_launch_delay_ms",
                  selector: {
                    number: {
                      min: 0,
                      step: 100,
                      unit_of_measurement: "ms",
                    },
                  },
                },
                {
                  name: "netflix_profile_navigation_delay_ms",
                  selector: {
                    number: {
                      min: 0,
                      step: 50,
                      unit_of_measurement: "ms",
                    },
                  },
                },
                {
                  name: "netflix_profile_after_select_delay_ms",
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
          title: "Advanced",
          flatten: true,
          schema: [
            {
              name: "profiles",
              selector: { object: {} },
            },
            {
              name: "provider_sources",
              selector: { object: {} },
            },
            {
              name: "android_app_links",
              selector: { object: {} },
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
      tv_entity: "media_player.lg_webos_tv",
      remote_entity: null,
      adb_entity: null,
      tmdb_api_key: "YOUR_TMDB_V3_API_KEY",
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
      profiles: {
        Felipe: {
          icon: "mdi:account",
          apps: {
            Netflix: { mode: "netflix", profile_position: 1 }
          }
        }
      }
    };
  }

  setConfig(config) {
    if (!config.tv_entity) throw new Error("tv_entity is required");
    if (!config.tmdb_api_key) throw new Error("tmdb_api_key is required");

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
          this._t("profile_update_failed", { entity: entityId, error: this._formatError(err) })
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
      language: this._languageCode(),
      ...params,
    });

    return `https://api.themoviedb.org/3${path}?${q.toString()}`;
  }

  async _api(path, params = {}) {
    const res = await fetch(this._apiUrl(path, params));

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
            labelKey: "trending",
            path: "/trending/movie/week",
            params: {},
          },
          {
            key: "popular",
            labelKey: "popular",
            path: "/movie/popular",
            params: { region },
          },
          {
            key: "now-playing",
            labelKey: "now_playing",
            path: "/movie/now_playing",
            params: { region },
          },
          {
            key: "top-rated",
            labelKey: "top_rated",
            path: "/movie/top_rated",
            params: { region },
          },
          {
            key: "upcoming",
            labelKey: "upcoming",
            path: "/movie/upcoming",
            params: { region },
          },
        ];
      }

      return [
        {
          key: "trending",
          labelKey: "trending",
          path: "/trending/tv/week",
          params: {},
        },
        {
          key: "popular",
          labelKey: "popular",
          path: "/tv/popular",
          params: {},
        },
        {
          key: "on-air",
          labelKey: "on_air",
          path: "/tv/on_the_air",
          params: {},
        },
        {
          key: "top-rated",
          labelKey: "top_rated",
          path: "/tv/top_rated",
          params: {},
        },
        {
          key: "airing-today",
          labelKey: "airing_today",
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
        this._t("provider_unavailable")
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
    return this._config?.platform === "android_tv"
      ? "android_tv"
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
      Number(
        appConfig?.launch_delay_ms ??
          this._config.netflix_profile_launch_delay_ms ??
          this._config.profile_launch_delay_ms
      ) || 0;

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

  async _sendRemoteButton(button) {
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
      Number(
        appConfig?.launch_delay_ms ??
          this._config.profile_launch_delay_ms
      ) || 0;

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
          await this._androidLaunchActivity(activity);
        }

        await this._applyProfile(
          providerName,
          source,
          { appJustOpened: !appAlreadyOpen }
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

      await this._applyProfile(
        providerName,
        source,
        { appJustOpened: !appAlreadyOpen }
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

  async _watchmodeSourcesForCurrentTitle() {
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

    this._toast(
      this._t("looking_up_exact_link")
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
              await this._androidLaunchActivity(activity);
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
          }

          await this._applyProfile(
            providerName,
            source,
            { appJustOpened: true }
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
            <div class="loading">${this._t("loading_details")}</div>
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
                      ${this._t("open_app")}
                    </button>

                    <button
                      class="mini-btn title"
                      data-title-provider="${this._esc(
                        provider.provider_name
                      )}"
                      ${disabled}
                    >
                      🎬 ${this._t("open_title")}
                    </button>

                    <button
                      class="mini-btn play"
                      data-title-play-provider="${this._esc(
                        provider.provider_name
                      )}"
                      ${disabled}
                    >
                      ▶ ${this._t("title_play")}
                    </button>
                  </div>
                </div>
              </div>
            `;
          })
          .join("")
      : `
        <div style="opacity:.65">
          ${this._t("no_providers")}
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
                  this._t("no_synopsis")
              )}
            </div>

            ${
              this._selectedProfile
                ? `
                  <div class="profile-status">
                    <b>${this._t("active_profile")}</b>
                    ${this._esc(this._selectedProfile)}
                  </div>
                `
                : ""
            }

            <div class="provider-title">
              ${this._t("where_to_watch")}
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
                      ${this._t("open_availability")}
                    </button>
                  `
                  : ""
              }
            </div>

            <div class="note">
              ${this._t("detail_note")}
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
          🔥 ${this._t("trending")}
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
              placeholder="${this._t("search_placeholder")}"
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

          <div class="note">
            ${this._t("active_profile")}
            <b>${this._esc(this._selectedProfile || this._t("none"))}</b>.
            ${this._t("footer_note")}
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
  "%c STREAMING-BROWSER-CARD %c v0.4.46 ",
  "color:white;background:#03a9f4;font-weight:bold;",
  "color:#03a9f4;background:white;font-weight:bold;"
);