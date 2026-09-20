"""One-shot, guarded update of the Streaming Browser Card v0.4.58 editor."""
from pathlib import Path

path = Path('streaming-browser-card.js')
s = path.read_text(encoding='utf-8')
assert ' * v0.4.58\n' in s[:140] and 'const STREAMING_BROWSER_VERSION = "0.4.58";' in s
assert '  _syncEditorForm(' not in s, 'Migration has already run'

def replace_one(old, new):
    global s
    count = s.count(old)
    assert count == 1, f'Expected one match, found {count}: {old[:110]!r}'
    s = s.replace(old, new, 1)

replace_one(' * v0.4.58\n', ' * v0.4.59\n')
replace_one('const STREAMING_BROWSER_VERSION = "0.4.58";', 'const STREAMING_BROWSER_VERSION = "0.4.59";')
replace_one('  static getConfigForm() {', '''  static getConfigForm(hass = null, config = {}) {
    // Use the physical HDMI inputs of the host/display TV, NOT the player.
    const tv = hass?.states?.[config?.display_entity];
    const sourceList = tv?.attributes?.source_list;
    const sources = Array.isArray(sourceList) ? sourceList : [];
    const hdmiInputs = [...new Set(sources
      .filter((source) => typeof source === "string")
      .map((source) => source.trim())
      .filter((source) => /\\bHDMI(?:\\b|(?=\\d))/i.test(source))
    )];
    // Preserve a saved input when the display TV is temporarily offline.
    const saved = String(config?.display_source || "").trim();
    if (config?.display_entity && saved && !hdmiInputs.includes(saved)) {
      hdmiInputs.unshift(saved);
    }
    const hdmiOptions = hdmiInputs.map((source) => ({
      value: source,
      label: source,
    }));
''')
replace_one('        "Exact HDMI source name as shown under the display TV\'s available sources (for example HDMI 1).",',
            '        "Select an HDMI input reported by the selected display TV. Turn on the display TV if no inputs are shown.",')
replace_one('            { name: "display_source", selector: { text: {} } },', '''            {
              name: "display_source",
              selector: {
                select: {
                  mode: "dropdown",
                  options: hdmiOptions,
                },
              },
            },''')
# Both the card's own static form and the custom visual editor use getConfigForm;
# the editor passes the current selected display TV and current HA state.
replace_one('''  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = {
      selected_provider_ids: [
        ...STREAMING_BROWSER_BACKEND
          .defaultProviderIds,
      ],
      ...config,
    };

    this._render();
    this._loadProviders();
  }

  connectedCallback() {
    this._render();

    if (this._config) {
      this._loadProviders();
    }
  }
''', '''  set hass(hass) {
    this._hass = hass;
    // Frequent HA state updates must NOT destroy and recreate ha-form: that
    // resets the expandable sections on every state change or input event.
    if (this.shadowRoot?.querySelector("#base ha-form")) {
      this._syncEditorForm();
    } else {
      this._render();
    }
  }

  setConfig(config) {
    const previous = this._config;
    const next = {
      selected_provider_ids: [
        ...STREAMING_BROWSER_BACKEND.defaultProviderIds,
      ],
      ...config,
    };
    const changed = JSON.stringify(previous) !== JSON.stringify(next);
    this._config = next;

    if (this.shadowRoot?.querySelector("#base ha-form")) {
      // ha-form already owns the value entered by the user. Do not push the
      // same value back into it on every config-changed event.
      this._syncEditorForm(changed);
    } else {
      this._render();
    }
    if (!previous || previous.region !== next.region ||
        previous.language !== next.language ||
        previous.tmdb_api_key !== next.tmdb_api_key) {
      this._loadProviders();
    }
  }

  connectedCallback() {
    this._render();
    if (this._config && !this._providers.length && !this._providersLoading) {
      this._loadProviders();
    }
  }

  _syncEditorForm(updateData = false) {
    const form = this.shadowRoot?.querySelector("#base ha-form");
    if (!form || !this._config) return;
    form.hass = this._hass;
    if (updateData) form.data = this._config;
    const formConfig = StreamingBrowserCard.getConfigForm(this._hass, this._config);
    const hdmiSection = formConfig.schema.find((item) => item.title === "HDMI / remote");
    const hdmiSelector = hdmiSection?.schema?.find((item) => item.name === "display_source");
    const key = JSON.stringify([
      this._config.display_entity || "",
      hdmiSelector?.selector?.select?.options || [],
    ]);
    if (key !== this._hdmiSchemaKey) {
      this._hdmiSchemaKey = key;
      // Update only when the display TV or its source_list actually changes.
      // The form element is never replaced, so other expanded sections stay open.
      form.schema = formConfig.schema;
    }
  }
''')
# Only the editor's _render (after its class declaration) should be changed.
editor_start = s.index('class StreamingBrowserCardEditor extends HTMLElement {')
editor = s[editor_start:]
old = '''  _render() {
    if (
      !this.shadowRoot ||
      !this._config
    ) {
      return;
    }

    this.shadowRoot.innerHTML = `'''
assert editor.count(old) == 1
editor = editor.replace(old, '''  _render() {
    if (!this.shadowRoot || !this._config) return;
    if (this.shadowRoot.querySelector("#base ha-form")) {
      this._syncEditorForm();
      this._renderProviders();
      return;
    }

    this.shadowRoot.innerHTML = `''', 1)
old = '''    const formConfig =
      StreamingBrowserCard
        .getConfigForm();'''
assert editor.count(old) == 1
editor = editor.replace(old, '''    const formConfig = StreamingBrowserCard.getConfigForm(this._hass, this._config);
    const hdmiSection = formConfig.schema.find((item) => item.title === "HDMI / remote");
    const hdmiSelector = hdmiSection?.schema?.find((item) => item.name === "display_source");
    this._hdmiSchemaKey = JSON.stringify([
      this._config.display_entity || "",
      hdmiSelector?.selector?.select?.options || [],
    ]);''', 1)
old = '''        const oldRegion =
          this._config?.region;'''
assert editor.count(old) == 1
editor = editor.replace(old, '''        const oldDisplay = this._config?.display_entity;
        const oldRegion =
          this._config?.region;''', 1)
old = '''        this._emitConfig(next);

        if (
          oldRegion !=='''
assert editor.count(old) == 1
editor = editor.replace(old, '''        if (oldDisplay !== next.display_entity) {
          // Never carry a stale HDMI input across two different display TVs.
          next.display_source = "";
        }
        this._emitConfig(next);
        if (oldDisplay !== next.display_entity) {
          this._syncEditorForm(true);
        }

        if (
          oldRegion !==''', 1)
s = s[:editor_start] + editor
# Update the actual console log as well as the visible version label.
replace_one('"%c STREAMING-BROWSER-CARD %c v0.4.56 "',
            '"%c STREAMING-BROWSER-CARD %c v0.4.59 "')
path.write_text(s, encoding='utf-8')
print('Updated editor in-place, HDMI source dropdown, and version v0.4.59')
