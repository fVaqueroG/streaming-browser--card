"""Give selected episodes one uniform accent outline and keep the title header visible."""
from pathlib import Path
import json

root = Path('custom_components/streaming_browser')
file = root / 'frontend/streaming-browser-card.js'
src = file.read_text(encoding='utf-8')
assert 'const STREAMING_BROWSER_VERSION = "0.4.70";' in src
old_css = '''      .episode-row.active { border-color:var(--primary-color); border-radius:12px 12px 0 0;
        box-shadow:inset 0 0 0 1px var(--primary-color); }
      .episode-row-container { border-bottom:1px solid var(--divider-color); }
      .episode-inline-actions { padding:12px 14px 16px;background:var(--secondary-background-color);
        border:1px solid var(--primary-color);border-top:0;
        border-radius:0 0 12px 12px;margin:0 0 12px; }'''
new_css = '''      /* One accent outline on the shared episode + sources wrapper. */
      .episode-row-container { border-bottom:1px solid var(--divider-color); }
      .episode-row-container.selected {
        border:2px solid var(--primary-color);
        border-radius:12px;
        overflow:hidden;
        background:var(--secondary-background-color);
      }
      .episode-row-container.selected .episode-row.active {
        border:0;
        border-radius:0;
        box-shadow:none;
      }
      .episode-inline-actions {
        padding:12px 14px 16px;
        background:var(--secondary-background-color);
        border:0;
        border-top:1px solid var(--divider-color);
        border-radius:0;
        margin:0;
      }'''
assert src.count(old_css) == 1, 'episode CSS changed unexpectedly'
src = src.replace(old_css, new_css, 1)
old_row = 'return `<div class="episode-row-container"><button type="button" class="episode-row ${active ? "active" : ""}"'
new_row = 'return `<div class="episode-row-container ${active ? "selected" : ""}"><button type="button" class="episode-row ${active ? "active" : ""}"'
assert src.count(old_row) == 1, 'episode markup changed unexpectedly'
src = src.replace(old_row, new_row, 1)
# The whole .detail element scrolls. A compact header inside it must be sticky;
# keeping the large poster hero sticky would hide the episode list on phones.
css_anchor = '      .detail-loading-panel { padding: 64px 28px 32px; min-height: 180px; }'
header_css = '''      /* Title and close/remote buttons remain visible while episodes scroll. */
      .detail-sticky-header {
        position:sticky; top:0; z-index:8;
        display:flex; align-items:center; gap:8px;
        padding:8px 12px; min-height:52px;
        color:var(--primary-text-color);
        background:var(--card-background-color);
        border-bottom:1px solid var(--divider-color);
      }
      .detail-sticky-title {
        flex:1; min-width:0; overflow:hidden;
        white-space:nowrap; text-overflow:ellipsis;
        font-size:15px; font-weight:700;
      }
      .detail-sticky-header .detail-remote-button,
      .detail-sticky-header .close {
        position:static; flex:0 0 36px;
        width:36px; height:36px; min-height:36px;
        border-radius:50%; background:var(--secondary-background-color);
        color:var(--primary-text-color); display:grid;place-items:center;
      }
'''
assert src.count(css_anchor) == 1, 'detail CSS injection point changed'
src = src.replace(css_anchor, header_css + css_anchor, 1)
old_header = '''    return `
      <div class="overlay" data-overlay>
        <div class="detail">
          <button class="close" data-close>×</button>
          <button class="detail-remote-button streaming-remote-toggle"
            type="button" title="TV remote" aria-label="TV remote"
            aria-pressed="${this._remoteExpanded ? "true" : "false"}">
            <ha-icon icon="mdi:remote-tv"></ha-icon>
          </button>

          <div
            class="hero"'''
new_header = '''    return `
      <div class="overlay" data-overlay>
        <div class="detail">
          <header class="detail-sticky-header">
            <span class="detail-sticky-title" title="${this._esc(title)}">${this._esc(title)}</span>
            <button class="detail-remote-button streaming-remote-toggle"
              type="button" title="TV remote" aria-label="TV remote"
              aria-pressed="${this._remoteExpanded ? "true" : "false"}">
              <ha-icon icon="mdi:remote-tv"></ha-icon>
            </button>
            <button class="close" type="button" data-close aria-label="Close title details">×</button>
          </header>

          <div
            class="hero"'''
assert src.count(old_header) == 1, 'loaded detail header markup changed unexpectedly'
src = src.replace(old_header, new_header, 1)
src = src.replace('const STREAMING_BROWSER_VERSION = "0.4.70";', 'const STREAMING_BROWSER_VERSION = "0.4.71";', 1)
src = src.replace(' * v0.4.70\n', ' * v0.4.71\n', 1)
src = src.replace('STREAMING-BROWSER-CARD %c v0.4.70', 'STREAMING-BROWSER-CARD %c v0.4.71', 1)
file.write_text(src, encoding='utf-8')
manifest_file = root / 'manifest.json'
manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.70', 'unexpected current manifest version'
manifest['version'] = '0.4.71'
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('PASS: v0.4.71 uniform selected-episode outline and sticky compact title header')
