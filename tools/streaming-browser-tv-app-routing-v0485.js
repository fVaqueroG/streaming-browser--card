/* Streaming Browser v0.4.85: native Android TV app routing and honest episode destinations. */
(() => {
  const Card = StreamingBrowserCard;
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
