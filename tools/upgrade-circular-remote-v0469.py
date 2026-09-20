"""Build v0.4.69: circular D-pad, icon-only actions, volume controls."""
from pathlib import Path
import json

root = Path('custom_components/streaming_browser')
js = root / 'frontend/streaming-browser-card.js'
src = js.read_text(encoding='utf-8')
assert 'const STREAMING_BROWSER_VERSION = "0.4.68";' in src
assert 'async _toggleNuvioRemote() {' in src

css_start = src.index('          .sbr-pad {width:194px;')
css_end = src.index('        </style>', css_start)
src = src[:css_start] + '''          /* Circular D-pad: a solid four-way ring with an independent OK center. */
          .sbr-pad {width:min(244px,100%);aspect-ratio:1;position:relative;margin:10px auto 14px;
            border-radius:50%;background:#37373c;box-shadow:inset 0 0 0 2px #ffffff0c,0 3px 11px #0005}
          .sbr-pad .sbr-dir {position:absolute;width:34%;height:34%;min-height:0;
            display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:#fff;padding:0}
          .sbr-pad .sbr-dir ha-icon {--mdc-icon-size:46px}
          .sbr-pad .sbr-up {top:0;left:33%}
          .sbr-pad .sbr-down {bottom:0;left:33%}
          .sbr-pad .sbr-left {top:33%;left:0}
          .sbr-pad .sbr-right {top:33%;right:0}
          .sbr-pad .sbr-ok {position:absolute;top:28%;left:28%;width:44%;height:44%;min-height:0;
            display:grid;place-items:center;border-radius:50%;border:0;
            background:#2c2c31;color:#fff;font-size:25px;font-weight:750;
            box-shadow:0 0 0 10px #2b2b2f55,inset 0 1px 3px #0005}
          .sbr-pad .sbr-dir:active {background:#ffffff24}
          .sbr-pad .sbr-ok:active {background:#414148}
          .sbr-actions {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 12px}
          .sbr-remote .sbr-icon-btn {display:grid;place-items:center;min-width:0;min-height:44px;
            padding:7px;border-radius:12px;background:#373737;color:#fff}
          .sbr-icon-btn ha-icon {--mdc-icon-size:23px}
          .sbr-numbers {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:12px}
''' + src[css_end:]

html_start = src.index('          <div class="sbr-row"><button data-remote="WAKE">')
html_end = src.index('          <div class="sbr-numbers">', html_start)
src = src[:html_start] + '''          <div class="sbr-pad" role="group" aria-label="Directional pad">
            <button type="button" class="sbr-dir sbr-up" data-remote="UP" title="Up" aria-label="Up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <button type="button" class="sbr-dir sbr-left" data-remote="LEFT" title="Left" aria-label="Left"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <button type="button" class="sbr-ok" data-remote="ENTER" title="OK" aria-label="OK">OK</button>
            <button type="button" class="sbr-dir sbr-right" data-remote="RIGHT" title="Right" aria-label="Right"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button type="button" class="sbr-dir sbr-down" data-remote="DOWN" title="Down" aria-label="Down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
          </div>
          <div class="sbr-actions" role="group" aria-label="TV actions">
            <button type="button" class="sbr-icon-btn" data-remote="WAKE" title="Wake" aria-label="Wake"><ha-icon icon="mdi:sleep-off"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="BACK" title="Back" aria-label="Back"><ha-icon icon="mdi:arrow-left"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="HOME" title="Home" aria-label="Home"><ha-icon icon="mdi:home"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="MUTE" title="Mute" aria-label="Mute"><ha-icon icon="mdi:volume-mute"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="PLAY" title="Play" aria-label="Play"><ha-icon icon="mdi:play"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="PAUSE" title="Pause" aria-label="Pause"><ha-icon icon="mdi:pause"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="VOLUME_DOWN" title="Volume down" aria-label="Volume down"><ha-icon icon="mdi:volume-minus"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="VOLUME_UP" title="Volume up" aria-label="Volume up"><ha-icon icon="mdi:volume-plus"></ha-icon></button>
          </div>
''' + src[html_end:]

old_handler = '''          if (key === "WAKE") await this._ensureTvOn();
          else if (key === "MUTE") await this._hass.callService("media_player", "volume_mute", {entity_id:this._config.tv_entity,is_volume_muted:true});
          else await this._sendRemoteButton(key);'''
new_handler = '''          if (key === "WAKE") await this._ensureTvOn();
          else if (key === "MUTE" || key === "VOLUME_UP" || key === "VOLUME_DOWN") {
            // On an HDMI setup, adjust the display TV's speakers rather than the player.
            const volumeEntity = this._config.display_entity || this._config.tv_entity;
            if (key === "MUTE") {
              const muted = this._hass.states?.[volumeEntity]?.attributes?.is_volume_muted;
              await this._hass.callService("media_player", "volume_mute", {
                entity_id: volumeEntity, is_volume_muted: muted !== true
              });
            } else {
              await this._hass.callService("media_player",
                key === "VOLUME_UP" ? "volume_up" : "volume_down",
                { entity_id: volumeEntity });
            }
          } else await this._sendRemoteButton(key);'''
assert src.count(old_handler) == 1, 'remote button dispatch has changed'
src = src.replace(old_handler, new_handler, 1)
assert src.count('class="sbr-pad" role="group"') == 1
assert src.count('class="sbr-actions" role="group"') == 1
src = src.replace(' * v0.4.68\n', ' * v0.4.69\n', 1)
src = src.replace('const STREAMING_BROWSER_VERSION = "0.4.68";', 'const STREAMING_BROWSER_VERSION = "0.4.69";', 1)
src = src.replace('"%c STREAMING-BROWSER-CARD %c v0.4.68 "', '"%c STREAMING-BROWSER-CARD %c v0.4.69 "', 1)
js.write_text(src, encoding='utf-8')

manifest_file = root / 'manifest.json'
manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.68'
manifest['version'] = '0.4.69'
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

readme_file = Path('README.md')
readme = readme_file.read_text(encoding='utf-8')
section = '''## v0.4.69: Circular remote and volume controls\n\nThe floating Streaming Browser remote now has a round, four-way D-pad with centered OK, icon-only Home/Back/Play/Pause/Mute/Wake buttons, `mdi:volume-mute` and `mdi:sleep-off`, plus Volume up/down. When an optional HDMI display entity is configured, volume controls target that TV; otherwise they target the playback media player. Update through HACS Integrations, restart Home Assistant and reload the dashboard; existing cards retain their settings.\n\n'''
if section not in readme:
    readme = readme.replace('\n', '\n\n' + section, 1)
    readme_file.write_text(readme, encoding='utf-8')
print('Built v0.4.69: circular D-pad, icon-only actions, mute toggle, volume control')