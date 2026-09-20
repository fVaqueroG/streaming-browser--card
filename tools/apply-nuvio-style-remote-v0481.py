"""Restyle the existing Streaming Browser remote without changing its command handlers."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "custom_components/streaming_browser"
CARD = BASE / "frontend/streaming-browser-card.js"
MANIFEST = BASE / "manifest.json"
README = ROOT / "README.md"
source = CARD.read_text(encoding="utf-8")
old_version = 'const STREAMING_BROWSER_VERSION = "0.4.80";'
assert source.count(old_version) == 1, "Expected v0.4.80; inspect current version before applying"
assert '/* Nuvio-inspired remote layout v0.4.81 */' not in source
method_start = source.index('  async _toggleNuvioRemote() {')
start = source.index('      portal.innerHTML = `', method_start)
end = source.index('        </section>`;', start) + len('        </section>`;')
old_markup = source[start:end]
for key in ('WAKE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ENTER', 'BACK', 'HOME', 'PLAY', 'PAUSE', 'MUTE', 'VOLUME_DOWN', 'VOLUME_UP'):
    assert f'data-remote="{key}"' in old_markup, f"Existing remote missing {key}; do not drop commands"
assert 'data-remote="${n === "⌫" ? "BACK"' in old_markup, "Expected old numeric keypad"

# Change only portal markup/styles. Keep the original click listeners, volume routing,
# HDMI preparation, platform handling, and room-selected target unchanged.
new_markup = r'''      portal.innerHTML = `
        <style>
          /* Nuvio-inspired remote layout v0.4.81 */
          .sbr-remote {
            position:fixed;z-index:100500;top:max(10px,env(safe-area-inset-top));
            ${right ? "right" : "left"}:max(10px,env(safe-area-inset-${right ? "right" : "left"}));
            box-sizing:border-box;width:min(390px,calc(100vw - 20px));
            max-height:calc(100dvh - 20px);overflow-y:auto;overscroll-behavior:contain;
            padding:20px;border:1px solid #414145;border-radius:30px;
            color:#fff;background:#202022;box-shadow:0 16px 48px #000b;
            font:500 15px/1.3 system-ui,sans-serif;
          }
          .sbr-remote button {font:inherit;cursor:pointer;color:#fff;background:#303033;
            border:1px solid #3b3b40;transition:background .12s ease,transform .12s ease}
          .sbr-remote button:active {background:#47474e;transform:scale(.98)}
          .sbr-remote button:focus-visible {outline:2px solid var(--primary-color,#58a6ff);outline-offset:3px}
          .sbr-head {display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px}
          .sbr-head-title {font-size:22px;font-weight:750;line-height:1.2}
          .sbr-head-subtitle {font-size:11px;opacity:.65;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:245px}
          .sbr-x {width:52px;height:52px;min-height:52px!important;flex:none;
            display:grid;place-items:center;border:0!important;border-radius:50%!important;
            font-size:36px!important;font-weight:600!important;line-height:1;background:#303033!important}
          .sbr-wake {display:flex;align-items:center;justify-content:center;gap:12px;width:100%;
            min-height:58px;border:0!important;border-radius:35px!important;font-size:19px!important}
          .sbr-wake ha-icon {--mdc-icon-size:22px}
          .sbr-pad {width:min(300px,100%);aspect-ratio:1;position:relative;margin:20px auto 22px;
            border-radius:50%;background:#35353b;box-shadow:inset 0 0 0 2px #ffffff0b}
          .sbr-pad .sbr-dir {position:absolute;display:grid;place-items:center;
            width:34%;height:34%;min-height:0;border:0;border-radius:50%;background:transparent;padding:0}
          .sbr-pad .sbr-dir ha-icon {--mdc-icon-size:45px}
          .sbr-pad .sbr-up {top:0;left:33%}
          .sbr-pad .sbr-down {bottom:0;left:33%}
          .sbr-pad .sbr-left {top:33%;left:0}
          .sbr-pad .sbr-right {top:33%;right:0}
          .sbr-pad .sbr-ok {position:absolute;top:28%;left:28%;width:44%;height:44%;min-height:0;
            display:grid;place-items:center;border:0;border-radius:50%;background:#2c2c30;
            font-size:23px;font-weight:750;box-shadow:0 0 0 10px #2b2b3055}
          .sbr-pad .sbr-dir:active {background:#ffffff1c}
          .sbr-numbers {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
          .sbr-numbers button {min-width:0;min-height:62px;border-radius:20px;font-size:27px;font-weight:650}
          .sbr-numbers .sbr-key-secondary {font-size:21px;opacity:.9}
          .sbr-navigation {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:15px 0}
          .sbr-navigation button {display:flex;align-items:center;justify-content:center;gap:9px;
            min-width:0;min-height:61px;border-radius:24px;font-size:17px}
          .sbr-navigation ha-icon {--mdc-icon-size:21px}
          .sbr-actions {display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;
            padding-top:13px;border-top:1px solid #ffffff1d;margin-top:9px}
          .sbr-actions .sbr-icon-btn {display:grid;place-items:center;min-width:0;
            min-height:49px;padding:8px 0;border-radius:15px}
          .sbr-actions .sbr-icon-btn ha-icon {--mdc-icon-size:23px}
          @media(max-width:360px) {
            .sbr-remote {padding:14px;border-radius:22px}
            .sbr-pad {width:min(252px,100%);margin:14px auto}
            .sbr-numbers {gap:7px}
            .sbr-numbers button {min-height:54px}
          }
        </style>
        <section class="sbr-remote" role="dialog" aria-label="TV Remote">
          <header class="sbr-head">
            <div><div class="sbr-head-title">${this._locale() === "es" ? "Control remoto" : "TV Remote"}</div>
              <div class="sbr-head-subtitle">${this._esc(this._hass?.states?.[this._config.tv_entity]?.attributes?.friendly_name || this._config.tv_entity || "")}</div></div>
            <button type="button" class="sbr-x" data-close-remote aria-label="Close remote">×</button>
          </header>
          <button type="button" class="sbr-wake" data-remote="WAKE" title="Wake" aria-label="Wake">
            <ha-icon icon="mdi:sleep-off"></ha-icon>${this._locale() === "es" ? "Despertar" : "Wake"}</button>
          <div class="sbr-pad" role="group" aria-label="Directional pad">
            <button type="button" class="sbr-dir sbr-up" data-remote="UP" title="Up" aria-label="Up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <button type="button" class="sbr-dir sbr-left" data-remote="LEFT" title="Left" aria-label="Left"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <button type="button" class="sbr-ok" data-remote="ENTER" title="OK" aria-label="OK">OK</button>
            <button type="button" class="sbr-dir sbr-right" data-remote="RIGHT" title="Right" aria-label="Right"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button type="button" class="sbr-dir sbr-down" data-remote="DOWN" title="Down" aria-label="Down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
          </div>
          <div class="sbr-numbers" role="group" aria-label="Number pad">
            ${[1,2,3,4,5,6,7,8,9,"⌫",0,"↵"].map((n) => `<button type="button" class="${n === "⌫" || n === "↵" ? "sbr-key-secondary" : ""}"
              data-remote="${n === "⌫" ? "BACK" : n === "↵" ? "ENTER" : n}"
              title="${n === "⌫" ? "Backspace" : n === "↵" ? "Enter" : n}"
              aria-label="${n === "⌫" ? "Backspace" : n === "↵" ? "Enter" : n}">${n}</button>`).join("")}
          </div>
          <div class="sbr-navigation" role="group" aria-label="Navigation">
            <button type="button" data-remote="BACK" title="Back" aria-label="Back"><ha-icon icon="mdi:arrow-left"></ha-icon>${this._locale() === "es" ? "Atrás" : "Back"}</button>
            <button type="button" data-remote="HOME" title="Home" aria-label="Home"><ha-icon icon="mdi:home-outline"></ha-icon>${this._locale() === "es" ? "Inicio" : "Home"}</button>
          </div>
          <div class="sbr-actions" role="group" aria-label="Playback and volume">
            <button type="button" class="sbr-icon-btn" data-remote="PLAY" title="Play" aria-label="Play"><ha-icon icon="mdi:play"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="PAUSE" title="Pause" aria-label="Pause"><ha-icon icon="mdi:pause"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="MUTE" title="Mute" aria-label="Mute"><ha-icon icon="mdi:volume-mute"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="VOLUME_DOWN" title="Volume down" aria-label="Volume down"><ha-icon icon="mdi:volume-minus"></ha-icon></button>
            <button type="button" class="sbr-icon-btn" data-remote="VOLUME_UP" title="Volume up" aria-label="Volume up"><ha-icon icon="mdi:volume-plus"></ha-icon></button>
          </div>
        </section>`;'''

source = source[:start] + new_markup + source[end:]
assert source.count('/* Nuvio-inspired remote layout v0.4.81 */') == 1
source = source.replace(old_version, 'const STREAMING_BROWSER_VERSION = "0.4.81";', 1)
source = source.replace(' * v0.4.80\n', ' * v0.4.81\n', 1)
CARD.write_text(source, encoding="utf-8")
manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
assert manifest['version'] == '0.4.80', "Expected the previous integration release"
manifest['version'] = '0.4.81'
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding="utf-8")
with README.open('a', encoding='utf-8') as readme:
    readme.write("\n\n## v0.4.81: Nuvio-inspired Streaming Browser remote\n\nThe remote keeps the same command dispatch and player selection but now uses a dark, rounded popup with a full-width Wake button, large circular D-pad, 12-key number pad including Backspace and Enter, large Back and Home buttons, and compact Play, Pause, Mute and volume controls. It remains scrollable on short screens and keeps the configured remote position. Update the integration through HACS, restart Home Assistant, and reload the dashboard.\n")
print("Bundled v0.4.81 remote restyle; original device and action handlers preserved")