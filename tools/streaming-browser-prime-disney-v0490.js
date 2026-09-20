/* Streaming Browser v0.4.90: Prime TV targeting and Disney+ link specificity. */
(() => {
  const Card = StreamingBrowserCard;
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
