/* Streaming Browser v0.4.92: native Crunchyroll /watch/ playback on Android TV. */
(() => {
  const Card = StreamingBrowserCard;
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
