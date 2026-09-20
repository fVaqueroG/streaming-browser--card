"""Replace the separate Open app button with two icon/caption action buttons.

Patches only the bundled Streaming Browser frontend; existing launch handlers,
HDMI/rooms/remote and WatchHub/Watchmode/JustWatch lookup remain untouched.
"""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components/streaming_browser'
card = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
readme = root / 'README.md'
source = card.read_text(encoding='utf-8')
old_version = 'const STREAMING_BROWSER_VERSION = "0.4.83";'
assert source.count(old_version) == 1, 'Expected installed v0.4.83; inspect the current card first'
assert '/* Compact action captions v0.4.84 */' not in source, 'Already patched'

old_css = '''      /* Icon-only source actions stay compact and tappable on mobile. */
      .mini-btn.icon-action {
        width: 44px;
        min-width: 44px;
        height: 44px;
        padding: 0;
        flex: 0 0 44px;
      }
      .mini-btn.icon-action ha-icon { --mdc-icon-size: 24px; }
'''
new_css = '''      /* Compact action captions v0.4.84 */
      .provider-actions .mini-btn.icon-action {
        box-sizing: border-box;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        width: 74px;
        min-width: 74px;
        height: 72px;
        min-height: 72px;
        padding: 6px 4px;
        flex: 0 0 74px;
        border-radius: 14px;
        text-align: center;
        line-height: 1.15;
      }
      .provider-actions .mini-btn.icon-action ha-icon {
        --mdc-icon-size: 26px;
        flex: none;
      }
      .provider-actions .provider-action-caption {
        display: block;
        max-width: 100%;
        font-size: 11px;
        line-height: 1.15;
        font-weight: 550;
        white-space: nowrap;
      }
      @media(max-width:600px) {
        .provider-actions .mini-btn.icon-action {
          width: 64px; min-width: 64px; flex-basis: 64px;
          height: 68px; min-height: 68px;
        }
      }
'''
assert source.count(old_css) == 1, 'Could not uniquely locate previous icon button styles'
source = source.replace(old_css, new_css, 1)

start = source.index('  _renderProviderCards(detail, providers, isSeries = false) {')
end = source.index('  _renderEpisodeBrowser(detail) {', start)
block = source[start:end]
old_line = '''        const sourceStatus = isSeries ? "" : loading
          ? this._t("local_link_loading")
          : !url ? this._t("local_link_missing") : "";
'''
new_line = old_line + '''        // The label is the resolved destination of this particular action,
        // not the type of content selected in TMDB. A series URL must never be
        // advertised as an exact episode when one is selected.
        const exactKind = !url ? "app" : isSeries
          ? (exact?.scope === "episode" && validEpisodeLink(exact) ? "episode" : "app")
          : "movie";
        const es = this._locale().startsWith("es");
        const captions = es
          ? { episode: "Episodio", season: "Temporada", series: "Serie", movie: "Película", app: "App" }
          : { episode: "Episode", season: "Season", series: "Series", movie: "Movie", app: "App" };
        const exactTv = Boolean(url) && this._platform() !== "roku";
        const tvCaption = captions[exactTv ? exactKind : "app"];
        const deviceCaption = captions[exactKind];
'''
assert block.count(old_line) == 1, 'Could not uniquely locate provider destination calculation'
block = block.replace(old_line, new_line, 1)

action_start = block.index('              <div class="provider-actions">')
closing = '              </div>\n            </div>\n          </div>`;'
action_end = block.index(closing, action_start) + len('              </div>')
new_actions = '''              <div class="provider-actions">
                ${(exactTv || tvSource) ? `<button type="button"
                  class="mini-btn ${exactTv ? "title " : ""}icon-action"
                  ${exactTv ? `data-title-provider="${this._esc(name)}"` : `data-open-provider="${this._esc(name)}"`}
                  aria-label="${this._esc(this._t("open_on_tv"))}: ${this._esc(tvCaption)}"
                  title="${this._esc(this._t("open_on_tv"))}: ${this._esc(tvCaption)}"
                ><ha-icon icon="mdi:television-play" aria-hidden="true"></ha-icon><span class="provider-action-caption">${this._esc(tvCaption)}</span></button>` : ""}
                ${url ? `<a class="mini-btn icon-action" href="${this._esc(url)}" target="_blank"
                  rel="noopener noreferrer"
                  aria-label="${this._esc(this._t("open_this_device"))}: ${this._esc(deviceCaption)}"
                  title="${this._esc(this._t("open_this_device"))}: ${this._esc(deviceCaption)}"
                ><ha-icon icon="mdi:cellphone-play" aria-hidden="true"></ha-icon><span class="provider-action-caption">${this._esc(deviceCaption)}</span></a>` : ""}
              </div>'''
block = block[:action_start] + new_actions + block[action_end:]
assert 'data-open-provider' in block and 'data-title-provider' in block
assert 'this._t("open_app")' not in block, 'Separate Open app button remains'
source = source[:start] + block + source[end:]
source = source.replace(old_version, 'const STREAMING_BROWSER_VERSION = "0.4.84";', 1)
source = source.replace(' * v0.4.83\n', ' * v0.4.84\n', 1)
card.write_text(source, encoding='utf-8')

settings = json.loads(manifest.read_text(encoding='utf-8'))
assert settings['version'] == '0.4.83', 'Expected matching integration manifest'
settings['version'] = '0.4.84'
manifest.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as file:
    file.write('\n\n## v0.4.84: compact playback buttons with destination labels\n\nThe provider row now shows up to two icon-only action buttons: television and device. A small Episode, Season, Series, Movie, or App label appears **inside** each actionable button under its icon (localized for Spanish). The separate Open app button is removed; when only an app launch is available, the TV button performs that existing action and says App. When no device URL is available, an unusable device button is not shown. Roku does not receive a fake exact TV deep link. Existing provider badges, WatchHub, Watchmode, JustWatch, room power/HDMI and compact remote commands are preserved.\n')
print('Bundled v0.4.84 provider actions with in-button destination captions')
