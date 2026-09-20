/* Streaming Browser v0.4.88: episode > season > series; WatchHub last. */
(() => {
  const Card = StreamingBrowserCard;
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
