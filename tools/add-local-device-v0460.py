"""One-time, guarded v0.4.60 migration of the Streaming Browser Card."""
from pathlib import Path

p = Path('streaming-browser-card.js')
s = p.read_text(encoding='utf-8')


def replace(old: str, new: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise ValueError(f'Expected one match, got {count}: {old[:110]!r}')
    s = s.replace(old, new, 1)


replace(' * v0.4.59\n', ' * v0.4.60\n')
replace('const STREAMING_BROWSER_VERSION = "0.4.59";', 'const STREAMING_BROWSER_VERSION = "0.4.60";')
replace('"%c STREAMING-BROWSER-CARD %c v0.4.56 "', '"%c STREAMING-BROWSER-CARD %c v0.4.60 "')

# These translations are intentionally separate from any legacy open_title uses.
replace('            "open_title": "Open title",', '''            "open_title": "Open title",
            "open_on_tv": "Open on TV",
            "open_this_device": "Open on this device",
            "local_link_loading": "Looking up title link…",
            "local_link_missing": "No exact provider link is available for this title.",
            "local_device_hint": "Open the provider link on this device; the app or website used depends on your device.",''')
replace('            "open_title": "Abrir título",', '''            "open_title": "Abrir título",
            "open_on_tv": "Abrir en TV",
            "open_this_device": "Abrir en este dispositivo",
            "local_link_loading": "Buscando enlace del título…",
            "local_link_missing": "No hay un enlace exacto de este proveedor para el título.",
            "local_device_hint": "Abre el enlace del proveedor en este dispositivo; la app o el sitio utilizado depende del dispositivo.",''')

# Resolve provider-specific links without driving the TV, and render native
# anchors only once a real exact-title URL is available. This avoids popup
# blockers on iOS/Android/web browsers because link navigation is a user click.
replace('''    this._render();
  }

  _detailProviders() {''', '''    this._render();
    if (this._details?.details && !this._details.error) {
      const currentDetail = this._details;
      currentDetail.localSourcesLoading = true;
      void this._primeLocalTitleLinks(currentDetail);
    }
  }

  async _primeLocalTitleLinks(detail) {
    try {
      detail.localSources = await this._watchmodeSourcesForCurrentTitle({ silent: true });
    } catch (err) {
      detail.localSources = [];
      detail.localSourceError = this._formatError(err);
    } finally {
      detail.localSourcesLoading = false;
      // Do not replace a newer title's popup when an older lookup completes.
      if (this._details === detail) this._render();
    }
  }

  _detailProviders() {''')

replace('''  async _watchmodeSourcesForCurrentTitle() {
''', '''  async _watchmodeSourcesForCurrentTitle({ silent = false } = {}) {
''')
replace('''    this._toast(
      this._t("looking_up_exact_link")
    );''', '''    if (!silent) {
      this._toast(this._t("looking_up_exact_link"));
    }''')

replace('''            const platform = this._platform() === "android_tv" ? "Android TV" : "LG webOS";
            return `''', '''            const platform = this._platform() === "android_tv" ? "Android TV" : "LG webOS";
            const localMatch = Array.isArray(detail.localSources)
              ? this._pickWatchmodeSource(provider.provider_name, detail.localSources)
              : null;
            // Use only the exact HTTP(S) provider link; never send it to HA's
            // media_player or use the generic TMDB availability page here.
            const localUrl = typeof localMatch?.web_url === "string" &&
              /^https?:\\/\\//i.test(localMatch.web_url)
              ? localMatch.web_url : "";
            const localAction = localUrl
              ? `<a class="mini-btn local-device"
                  href="${this._esc(localUrl)}" target="_blank" rel="noopener noreferrer"
                  title="${this._esc(this._t("local_device_hint"))}">
                  <ha-icon icon="mdi:cellphone" style="--mdc-icon-size:17px"></ha-icon>
                  ${this._t("open_this_device")}
                </a>`
              : `<button class="mini-btn local-device" type="button" disabled
                  title="${this._esc(detail.localSourcesLoading
                    ? this._t("local_link_loading")
                    : detail.localSourceError || this._t("local_link_missing"))}">
                  <ha-icon icon="mdi:cellphone" style="--mdc-icon-size:17px"></ha-icon>
                  ${this._t("open_this_device")}
                </button>`;
            return `''')

replace('''                      🎬 ${this._t("open_title")}
                    </button>
                  </div>''', '''                      <ha-icon icon="mdi:television" style="--mdc-icon-size:17px"></ha-icon>
                      ${this._t("open_on_tv")}
                    </button>
                    ${localAction}
                  </div>''')

replace('''        font-size: 12px;
      }

      .mini-btn.title {''', '''        font-size: 12px;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 36px;
      }

      .mini-btn.title {''')

p.write_text(s, encoding='utf-8')
print('Prepared v0.4.60 with native local-device provider links and existing TV action.')
