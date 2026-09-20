"""Fix V2 power-control accumulation and mobile provider-row wrapping.

The legacy power-helper wrapper appended an additional control on each V2
incremental render. The later toggle wrapper only replaced the first control,
leaving orphan power buttons to accumulate in the fixed header. Keep one
stable control and make the mobile layout a single constrained flex row.
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
js = base / 'frontend' / 'streaming-browser-card-v2.js'
manifest = base / 'manifest.json'
data = json.loads(manifest.read_text(encoding='utf-8'))
assert data['version'] == '0.4.106', f"Expected 0.4.106, found {data['version']}"
s = js.read_text(encoding='utf-8')
assert s.count('const STREAMING_BROWSER_VERSION = "0.4.106";') == 1

# The v0.4.79 power-helper wrapper executes after every _render() call, even
# when the V2 incremental update has intentionally preserved .sbr-room-controls.
old = """    const roomBar = this.shadowRoot?.querySelector('.sbr-room-controls');
    if (!roomBar) return;
    const es = locale(this);
    const holder = document.createElement('span');
    holder.className = 'sbr-power-controls';"""
new = """    const roomBar = this.shadowRoot?.querySelector('.sbr-room-controls');
    if (!roomBar) return;
    // V2 keeps this header node across catalog updates. Avoid accumulating
    // extra legacy on/off buttons each time an incremental render runs.
    const existingPower = roomBar.querySelector('.sbr-power-controls');
    if (existingPower) {
      this._roomPowerRefresh();
      return;
    }
    const es = locale(this);
    const holder = document.createElement('span');
    holder.className = 'sbr-power-controls';"""
assert s.count(old) == 1, 'Expected exactly one legacy V2 power-control insertion'
s = s.replace(old, new, 1)

# v0.4.80 replaces the legacy power pair with a toggle. Keep that input
# mounted too, so HA state refreshes and selection changes never steal focus.
old = """    const holder = this.shadowRoot?.querySelector('.sbr-power-controls');
    if (!holder) return;
    const es = isSpanish(this);
    const title = es ? 'Alimentación' : 'Power';"""
new = """    const holder = this.shadowRoot?.querySelector('.sbr-power-controls');
    if (!holder) return;
    if (holder.querySelector('.sbr-power-switch')) {
      this._roomPowerRefresh();
      return;
    }
    const es = isSpanish(this);
    const title = es ? 'Alimentación' : 'Power';"""
assert s.count(old) == 1, 'Expected exactly one V2 power-switch insertion'
s = s.replace(old, new, 1)

# The 0.4.106 mobile breakpoint inherited flex-wrap:wrap and a 250px
# provider-choice basis. On phones, 176px filters + 250px choice cannot fit,
# so the All/provider row wrapped and moved below Movies/Series/Genre. Keep
# one row, explicitly allow the icon scroller to shrink, and use compact
# square dimensions based on the actual height of the two-tier filters.
old = """      .v2-provider-strip { --v2-mode-height:48px; gap:9px; }
      .v2-provider-strip .switcher { flex-basis:min(100%,176px);
        width:min(100%,176px); }
      .v2-provider-strip .switcher .mode { height:var(--v2-mode-height);
        min-height:var(--v2-mode-height); padding:7px 5px; }
      .v2-provider-strip .switcher .genre-select { min-width:0;
        max-width:none; width:100%; margin:0; }
      .v2-provider-strip .chip img { width:48px; height:48px; }"""
new = """      /* Mobile: filters + square All + provider logos share ONE row. */
      .v2-provider-strip { --v2-mode-height:44px; --v2-genre-height:36px;
        --v2-filter-gap:6px; flex-wrap:nowrap; gap:8px; align-items:stretch; }
      .v2-provider-strip .switcher { flex:0 0 clamp(140px,43vw,166px);
        width:clamp(140px,43vw,166px); max-width:47%; min-width:0; }
      .v2-provider-strip .switcher .mode { height:var(--v2-mode-height);
        min-height:var(--v2-mode-height); padding:5px 3px; }
      .v2-provider-strip .switcher .genre-select { min-width:0;
        height:var(--v2-genre-height); min-height:var(--v2-genre-height);
        max-width:none; width:100%; margin:0; }
      .v2-provider-choice { flex:1 1 0; min-width:0; width:0; max-width:none;
        flex-wrap:nowrap; align-items:stretch; gap:7px; }
      .v2-provider-choice > .chip[data-provider=\"all\"] {
        flex:0 0 var(--v2-source-size); }
      .v2-provider-scroll { flex:1 1 0; min-width:0; max-width:none;
        height:var(--v2-source-size); overflow-x:auto; }
      .v2-provider-scroll .chips { min-width:0; }
      .v2-provider-strip .chip img { width:38px; height:38px; }"""
assert s.count(old) == 1, 'Expected exact V2 mobile breakpoint from 0.4.106'
s = s.replace(old, new, 1)

s = s.replace('const STREAMING_BROWSER_VERSION = "0.4.106";',
              'const STREAMING_BROWSER_VERSION = "0.4.107";', 1)
js.write_text(s, encoding='utf-8')
data['version'] = '0.4.107'
manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with (root / 'README.md').open('a', encoding='utf-8') as readme:
    readme.write('''\n\n## v0.4.107 — fix repeated V2 power buttons and mobile header wrapping\n\nV2 reuses the existing per-room power switch instead of appending legacy power on/off buttons on every incremental catalog update. Mobile screens keep Movies/Series over the aligned genre selector, All, and the scrollable provider icons in a single fixed horizontal row. The All/provider squares match the complete filter stack height and provider names remain icon-only. V1 and provider playback/routing remain unchanged. Update through HACS, restart Home Assistant, and reload the V2 card to discard controls that were already duplicated in an older DOM.\n''')
print('PASS V2 power controls are idempotent; compact fixed mobile filters and square sources stay on one row')
