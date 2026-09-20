"""One-time guarded migration of Streaming Browser Card v0.4.57 to v0.4.58.

Run in CI on the checked-out repository, then run node --check and the
lightweight structural tests before committing the resulting card.
"""
from pathlib import Path

p = Path("streaming-browser-card.js")
s = p.read_text(encoding="utf-8")
assert " * v0.4.57\n" in s[:180], "Expected v0.4.57; refusing to change a newer card"
assert "STREAMING_BROWSER_VERSION" not in s, "Already migrated"


def replace(old: str, new: str) -> None:
    global s
    count = s.count(old)
    assert count == 1, f"Expected one occurrence ({count} found): {old[:100]!r}"
    s = s.replace(old, new, 1)


replace(" * v0.4.57\n", " * v0.4.58\n")
replace("class StreamingBrowserCard extends HTMLElement {", '''const STREAMING_BROWSER_VERSION = "0.4.58";

class StreamingBrowserCard extends HTMLElement {''')

# General visual editor: the existing tv_entity is the actual playback device.
replace('      tv_entity: "Media player",', '''      tv_entity: "Playback device (media player)",
      display_entity: "Display TV (optional HDMI host)",
      display_source: "HDMI input on display TV",
      display_source_delay_ms: "HDMI switch delay (ms)",
      remote_side: "Remote position",''')
replace('      remote_entity:\n        "Required for Android TV.', '''      display_entity:
        "Optional display television for a separate HDMI playback device. Select the LG/webOS television here, not the Android TV box.",
      display_source:
        "Exact HDMI source name as shown under the display TV's available sources (for example HDMI 1).",
      display_source_delay_ms:
        "Time allowed for the HDMI input to become ready after switching.",
      remote_side:
        "Position of the same floating controller used in Nuvio.",
      remote_entity:
        "Required for Android TV.''')
anchor = '''        {
          type: "expandable",
          name: "",
          title: "Catalog",'''
replace(anchor, '''        {
          type: "expandable",
          name: "",
          title: "HDMI / remote",
          flatten: true,
          schema: [
            {
              name: "display_entity",
              selector: { entity: { filter: { domain: "media_player" } } },
            },
            { name: "display_source", selector: { text: {} } },
            {
              name: "display_source_delay_ms",
              selector: { number: { min: 0, max: 20000, step: 100, unit_of_measurement: "ms" } },
            },
            {
              name: "remote_side",
              selector: { select: { mode: "dropdown", options: [
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
              ] } },
            },
          ],
        },
''' + anchor)
replace('      remote_entity: null,\n      adb_entity: null,', '''      remote_entity: null,
      adb_entity: null,
      display_entity: null,
      display_source: "",
      display_source_delay_ms: 2500,
      remote_side: "left",''')
# The same default settings must exist in both stub and setConfig.
replace('      android_app_links: {},', '''      android_app_links: {},
      display_entity: null,
      display_source: "",
      display_source_delay_ms: 2500,
      remote_side: "left",''')

# Nuvio's remote already addresses the playback entity (tv_entity). Switch
# only the separate display to the configured HDMI input before launching.
anchor = "  async _ensureTvOn() {"
replace(anchor, '''  async _prepareDisplayRoute() {
    const display = String(this._config?.display_entity || "").trim();
    if (!display) return;
    const source = String(this._config?.display_source || "").trim();
    if (!source) throw new Error("Choose the HDMI input for the display TV in card settings.");
    if (display === this._config.tv_entity) {
      throw new Error("Display TV and playback device must be different for HDMI routing.");
    }
    const state = this._hass?.states?.[display];
    if (!state || state.state === "unavailable") {
      throw new Error("The configured HDMI display TV is unavailable: " + display);
    }
    if (["off", "standby", "unknown"].includes(state.state)) {
      await this._hass.callService("media_player", "turn_on", { entity_id: display });
      await this._sleep(Math.max(0, Number(this._config.wake_delay_ms ?? 4500)));
    }
    const current = this._hass.states?.[display]?.attributes?.source || "";
    if (current !== source) {
      await this._hass.callService("media_player", "select_source", {
        entity_id: display, source,
      });
      await this._sleep(Math.max(0, Number(this._config.display_source_delay_ms ?? 2500)));
    }
  }

''' + anchor)

# A remote opened from inside the popup should have the HDMI input ready,
# but individual keypresses must never re-switch the HDMI source.
replace('''      const card = this;
      this._remoteExpanded = true;''', '''      await this._prepareDisplayRoute();
      const card = this;
      this._remoteExpanded = true;''')
replace('''    try {
      const tv = await this._ensureTvOn();
      const currentSource = tv?.attributes?.source || "";''', '''    try {
      await this._prepareDisplayRoute();
      const tv = await this._ensureTvOn();
      const currentSource = tv?.attributes?.source || "";''')
replace('''    try {
      const tv = await this._ensureTvOn();

      const sources =''', '''    try {
      await this._prepareDisplayRoute();
      const tv = await this._ensureTvOn();

      const sources =''')

# Profile picking is entirely manual by default, including for deep links.
replace('''      if (
        source &&
        (
          appConfig?.exact_title_profile_first === true ||''', '''      if (
        this._config.manual_profile_selection === false &&
        source &&
        (
          appConfig?.exact_title_profile_first === true ||''')

# The detail popup no longer shows the browser, open-app or title+play actions.
start = s.index('          .map((provider) => {', s.index('    const providerCards = providers.length'))
end = s.index('          .join("")', start)
s = s[:start] + '''          .map((provider) => {
            const source = this._sourceForProvider(provider.provider_name);
            const disabled = source ? "" : "disabled";
            const platform = this._platform() === "android_tv" ? "Android TV" : "LG webOS";
            return `
              <div class="provider-card">
                ${this._providerLogo(provider)}
                <div class="provider-info">
                  <div class="provider-name">${this._esc(provider.provider_name)}</div>
                  <div class="provider-source">${source
                    ? `${platform} · ${this._esc(source)}`
                    : "App not matched on playback device"}</div>
                  <div class="provider-actions">
                    <button class="mini-btn title"
                      data-title-provider="${this._esc(provider.provider_name)}" ${disabled}>
                      🎬 ${this._t("open_title")}
                    </button>
                  </div>
                </div>
              </div>`;
          })
''' + s[end:]

# Put the same remote toggle inside the actual detail modal, not just the
# catalog header (which is obscured by the overlay).
anchor = '''      <div class="overlay" data-overlay>
        <div class="detail">
          <button class="close" data-close>×</button>'''
replace(anchor, '''      <div class="overlay" data-overlay>
        <div class="detail">
          <button class="close" data-close>×</button>
          <button class="detail-remote-button streaming-remote-toggle"
            type="button" title="TV remote" aria-label="TV remote"
            aria-pressed="${this._remoteExpanded ? "true" : "false"}">
            <ha-icon icon="mdi:remote-tv"></ha-icon>
          </button>''')
replace('''      .body {
        padding: 0 28px 28px;''', '''      .detail-remote-button {
        position: absolute; top: 12px; right: 58px; z-index: 5;
        width: 38px; height: 38px; border: 0; border-radius: 50%;
        background: rgba(0,0,0,.64); color: white; cursor: pointer;
        display: grid; place-items: center;
      }
      .detail-remote-button ha-icon { --mdc-icon-size: 22px; }
      .body {
        padding: 0 28px 28px;''')

start = s.index('''            ${
              this._selectedProfile
                ? `''', s.index('  _renderDetails() {'))
end = s.index('''            <div class="provider-title">''', start)
s = s[:start] + s[end:]
start = s.index('''            <div class="actions">''', s.index('  _renderDetails() {'))
end = s.index('''          </div>
        </div>
      </div>
    `;''', start)
s = s[:start] + s[end:]

# Label is the JS build actually executing, not a guess at GitHub's latest tag.
replace('''              ${this._esc(this._config.title)}
            </div>''', '''              ${this._esc(this._config.title)}
              <span class="card-version">v${STREAMING_BROWSER_VERSION}</span>
            </div>''')
replace('''        .title {
          font-size: 24px;''', '''        .card-version {
          display: block; font-size: 11px; line-height: 1.2;
          color: var(--secondary-text-color); font-weight: 400;
          margin-top: 2px; opacity: .85;
        }
        .title {
          font-size: 24px;''')
# Both header button and modal button must work, including after any rerender.
replace('''    root.querySelector(".streaming-remote-toggle")?.addEventListener(
      "click", () => this._toggleNuvioRemote()
    );''', '''    root.querySelectorAll(".streaming-remote-toggle").forEach((button) =>
      button.addEventListener("click", () => this._toggleNuvioRemote())
    );''')

p.write_text(s, encoding="utf-8")
print("Migrated to v0.4.58; HDMI routing, popup remote, single Open title, version label")
