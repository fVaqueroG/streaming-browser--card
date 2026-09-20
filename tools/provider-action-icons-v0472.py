"""Replace movie and episode source-action labels with accessible icon buttons."""
from pathlib import Path
import json

root = Path('custom_components/streaming_browser')
card = root / 'frontend/streaming-browser-card.js'
src = card.read_text(encoding='utf-8')
assert 'const STREAMING_BROWSER_VERSION = "0.4.71";' in src, 'Unexpected current version'
old = '''                  <button type="button" class="mini-btn title"
                    data-title-provider="${this._esc(name)}">${this._esc(this._t("open_on_tv"))}</button>
                  <a class="mini-btn" href="${this._esc(url)}" target="_blank"
                    rel="noopener noreferrer">${this._esc(this._t("open_this_device"))}</a>'''
new = '''                  <button type="button" class="mini-btn title icon-action"
                    data-title-provider="${this._esc(name)}"
                    aria-label="${this._esc(this._t("open_on_tv"))}"
                    title="${this._esc(this._t("open_on_tv"))}"><ha-icon icon="mdi:television-play" aria-hidden="true"></ha-icon></button>
                  <a class="mini-btn icon-action" href="${this._esc(url)}" target="_blank"
                    rel="noopener noreferrer"
                    aria-label="${this._esc(this._t("open_this_device"))}"
                    title="${this._esc(this._t("open_this_device"))}"><ha-icon icon="mdi:cellphone-play" aria-hidden="true"></ha-icon></a>'''
assert src.count(old) == 1, 'Provider action markup changed or duplicated'
src = src.replace(old, new, 1)
old_css = '''      .mini-btn.title {
        background:'''
new_css = '''      /* Icon-only source actions stay compact and tappable on mobile. */
      .mini-btn.icon-action {
        width: 44px;
        min-width: 44px;
        height: 44px;
        padding: 0;
        flex: 0 0 44px;
      }
      .mini-btn.icon-action ha-icon { --mdc-icon-size: 24px; }

      .mini-btn.title {
        background:'''
assert src.count(old_css) == 1, 'Provider action styles changed'
src = src.replace(old_css, new_css, 1)
src = src.replace('const STREAMING_BROWSER_VERSION = "0.4.71";', 'const STREAMING_BROWSER_VERSION = "0.4.72";', 1)
src = src.replace('STREAMING-BROWSER-CARD %c v0.4.71', 'STREAMING-BROWSER-CARD %c v0.4.72', 1)
src = src.replace(' * v0.4.71\n', ' * v0.4.72\n', 1)
card.write_text(src, encoding='utf-8')
manifest_file = root / 'manifest.json'
manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.71', 'Unexpected manifest version'
manifest['version'] = '0.4.72'
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('PASS: icon-only TV / this-device actions with accessible names, preserved targets, v0.4.72')
