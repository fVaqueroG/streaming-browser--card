/* Streaming Browser v0.4.87: restore working provider URL routes without losing newer controls. */
(() => {
  const Card = StreamingBrowserCard;
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
