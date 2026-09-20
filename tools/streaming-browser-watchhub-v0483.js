/* Streaming Browser v0.4.83: optional WatchHub official-app link source. */
(() => {
  const Card = StreamingBrowserCard;
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
