"""Add Roku TV playback, control, and honest exact-title handling to Streaming Browser."""
from pathlib import Path
import json

root = Path('custom_components/streaming_browser')
js_file = root / 'frontend/streaming-browser-card.js'
src = js_file.read_text(encoding='utf-8')

def replace(old, new, count=1):
    global src
    n=src.count(old)
    assert n == count, f'Expected {count} occurrences, saw {n}: {old[:120]!r}'
    src=src.replace(old,new,count)

replace(' * Streaming Browser Card for Home Assistant + LG webOS',' * Streaming Browser Card for Home Assistant: LG webOS, Android TV and Roku TV')
replace(' * v0.4.73',' * v0.4.74')
replace('const STREAMING_BROWSER_VERSION = "0.4.73";', 'const STREAMING_BROWSER_VERSION = "0.4.74";')
replace('STREAMING-BROWSER-CARD %c v0.4.73', 'STREAMING-BROWSER-CARD %c v0.4.74')
replace('remote_entity: "Android TV remote",','remote_entity: "Playback device remote (Android TV / Roku)",')
replace('"Choose LG webOS or Android TV Remote.",','"Choose LG webOS, Android TV Remote or Roku TV. For Roku, install Home Assistant’s Roku integration first.",')
replace('"Optional display television for a separate HDMI playback device. Select the LG/webOS television here, not the Android TV box.",','"Optional display TV for a separate HDMI player, including a Roku TV. Select the display TV here, not the external player.",')
replace('"Required for Android TV. Use the remote entity from the Android TV Remote integration.",','"Required for Android TV and Roku. Choose the matching remote entity from the Android TV Remote or Roku integration.",')
replace('                    { value: "android_tv", label: "Android TV Remote" },','                    { value: "android_tv", label: "Android TV Remote" },\n                    { value: "roku", label: "Roku TV / Roku player" },')
replace('''  _platform() {
    return this._config?.platform === "android_tv"
      ? "android_tv"
      : "webos";
  }''','''  _platform() {
    const platform = this._config?.platform;
    return platform === "android_tv" || platform === "roku"
      ? platform
      : "webos";
  }''')
replace('''  async _sendRemoteButton(button) {
    if (this._platform() === "android_tv") {''','''  _rokuRemoteCommand(button) {
    const key = String(button ?? "").toUpperCase();
    const commands = {
      UP: "up", DOWN: "down", LEFT: "left", RIGHT: "right",
      ENTER: "select", CENTER: "select", HOME: "home", BACK: "back",
      BACKSPACE: "backspace", PLAY: "play", PAUSE: "play",
      VOLUME_UP: "volume_up", VOLUME_DOWN: "volume_down",
      MUTE: "volume_mute",
    };
    // Roku offers a Play/Pause toggle key, not separate Play and Pause keys.
    if (/^[0-9]$/.test(key)) return `Lit_${key}`;
    const command = commands[key];
    if (!command) throw new Error(`Unsupported Roku remote button: ${key}`);
    return command;
  }

  async _sendRemoteButton(button) {
    if (this._platform() === "roku") {
      if (!this._config.remote_entity) {
        throw new Error("Select the Roku remote entity in Streaming Browser card settings.");
      }
      await this._hass.callService("remote", "send_command", {
        entity_id: this._config.remote_entity,
        command: this._rokuRemoteCommand(button),
      });
      return;
    }
    if (this._platform() === "android_tv") {''')
replace('''          else if (key === "MUTE" || key === "VOLUME_UP" || key === "VOLUME_DOWN") {
            // On an HDMI setup, adjust the display TV's speakers rather than the player.
            const volumeEntity = this._config.display_entity || this._config.tv_entity;''','''          else if (key === "MUTE" || key === "VOLUME_UP" || key === "VOLUME_DOWN") {
            // Roku TV volume/mute uses ECP remote keys; an external HDMI player
            // uses the configured display TV's Home Assistant volume services.
            if (this._platform() === "roku" && !this._config.display_entity) {
              await this._sendRemoteButton(key);
              return;
            }
            const volumeEntity = this._config.display_entity || this._config.tv_entity;''')
# Both Android TV and Roku are connected media players with independent remote entities;
# Roku source_list reports the names of installed apps and Roku select_source launches them.
replace('''      const appAlreadyOpen =
        this._norm(currentSource) === this._norm(source);

      if (appAlreadyOpen) {''','''      if (this._platform() === "roku") {
        const appAlreadyOpen = this._norm(currentSource) === this._norm(source);
        if (!appAlreadyOpen) {
          this._toast(this._t("opening_app", { source }));
          await this._hass.callService("media_player", "select_source", {
            entity_id: this._config.tv_entity, source,
          });
          // Let Roku finish launching before any explicit profile/navigation steps.
          await this._sleep(Math.max(0, Number(this._config.profile_launch_delay_ms ?? 3000)));
        }
        await this._applyProfile(providerName, source, {
          appJustOpened: !appAlreadyOpen,
          appReadyWaited: !appAlreadyOpen,
        });
        if (autoPlay) {
          await this._sleep(Math.max(0, Number(this._config.auto_play_delay_ms ?? 4000)));
          await this._sendProviderPlay(providerName, source);
        }
        this._toast(this._t("app_opened", { source, profile: "" }));
        return;
      }

      const appAlreadyOpen =
        this._norm(currentSource) === this._norm(source);

      if (appAlreadyOpen) {''')
replace('''  async _openExactTitle(
    providerName,
    autoPlay = false
  ) {
    if (!this._hass) {
      return;
    }

    try {''','''  async _openExactTitle(
    providerName,
    autoPlay = false
  ) {
    if (!this._hass) {
      return;
    }

    if (this._platform() === "roku") {
      // A Watchmode/JustWatch web URL is not a Roku channel-specific content ID.
      // Do not send it to webOS, or claim that launching an app played the title.
      this._toast(this._locale() === "es"
        ? "Roku necesita un ID de contenido de la app para abrir este título. Usa Abrir app."
        : "Roku needs an app-specific content ID for exact title playback. Use Open app.");
      return;
    }

    try {''')
# Ensure the watch-availability action cannot send webOS commands to a Roku TV.
replace('''  async _openWatchPage() {
    const link = this._details?.providers?.link;

    if (!link || !this._hass) return;''','''  async _openWatchPage() {
    const link = this._details?.providers?.link;

    if (!link || !this._hass) return;
    if (this._platform() === "roku") {
      this._toast("Roku cannot open a web availability page; choose an installed streaming app.");
      return;
    }''')
replace('''                  <button type="button" class="mini-btn title icon-action"
                    data-title-provider="${this._esc(name)}"
                    aria-label="${this._esc(this._t("open_on_tv"))}"
                    title="${this._esc(this._t("open_on_tv"))}"><ha-icon icon="mdi:television-play" aria-hidden="true"></ha-icon></button>''','''                  ${this._platform() !== "roku" ? `<button type="button" class="mini-btn title icon-action"
                    data-title-provider="${this._esc(name)}"
                    aria-label="${this._esc(this._t("open_on_tv"))}"
                    title="${this._esc(this._t("open_on_tv"))}"><ha-icon icon="mdi:television-play" aria-hidden="true"></ha-icon></button>` : ""}''')
# Roku app sources must be actual installed sources, not Android activity URLs.
# Generic source_list matching and provider_sources overrides already work for Roku.
assert 'value: "roku", label: "Roku TV / Roku player"' in src
assert 'if (this._platform() === "roku" && !this._config.display_entity)' in src
js_file.write_text(src, encoding='utf-8')
manifest_file = root/'manifest.json'
manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.73'
manifest['version'] = '0.4.74'
manifest_file.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
readme=Path('README.md')
text=readme.read_text(encoding='utf-8')
text += '''\n\n## Roku TV and Roku streaming players (v0.4.74)\n\nInstall the official **Roku** integration in Home Assistant. Select **Roku TV / Roku player** under the Streaming Browser card's **Platform**, its `media_player` entity as **Playback device**, and the same Roku device's `remote` entity as **Playback device remote**. The TMDB catalogs, installed-source matching, app launching, circular D-pad, volume and playback controls work on Roku TVs. Roku set-top boxes may not support volume control; configure **Display TV** and its HDMI input when using a separate Roku player. When Roku is itself the display for another HDMI player, select the Roku TV as the display device and its HDMI input in that player's card settings. Enable Roku's **Control by mobile apps** / network access if remote keys do not work. TV power-on from full standby depends on the Roku model and its network-standby settings.\n\n**Exact-title limitations:** Roku `media_player.select_source` opens a streaming app, not the selected movie/episode. Roku exact playback requires that streaming app's own app ID and content ID through Roku's `media_player.play_media` app/deep-link interface. Browser URLs from the existing provider lookup cannot be treated as Roku content IDs. Accordingly, Roku provider cards expose **Open app** and **Open on this device** (when a provider URL exists), but do not display a misleading exact-title **Open on TV** action. The Roku Play and Pause remote icons both send Roku's Play/Pause toggle; digit keys enter text only when an on-screen keyboard is active.\n'''
readme.write_text(text, encoding='utf-8')
print('PASS: Roku platform, remote, app selection, HDMI routing, volume, conservative exact-title handling and v0.4.74 manifest')