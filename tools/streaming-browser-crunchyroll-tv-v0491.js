/* Streaming Browser v0.4.91: Crunchyroll Android TV opens its installed app, never a generic web intent. */
(() => {
  const Card = StreamingBrowserCard;
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
