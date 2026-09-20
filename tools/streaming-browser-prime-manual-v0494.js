/* Streaming Browser v0.4.94: Prime Video GTI details through Android TV Remote; manual playback. */
(() => {
  const Card = StreamingBrowserCard;
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
