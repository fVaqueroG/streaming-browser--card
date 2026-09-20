/* Streaming Browser v0.4.89: Netflix episode TV app-specific launch. */
(() => {
  const Card = StreamingBrowserCard;
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
