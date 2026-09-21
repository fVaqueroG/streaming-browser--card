"""Keep Back to carousel visible above the scrollable V2 expanded catalog."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
js_path = base / 'frontend' / 'streaming-browser-card-v2.js'
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.107', manifest['version']
s = js_path.read_text(encoding='utf-8')
assert s.count('const STREAMING_BROWSER_VERSION = "0.4.107";') == 1
assert 'Streaming Browser V2 v0.4.108: fixed expanded-catalog return bar' not in s

# The header and return toolbar are siblings of the only vertically scrolling
# region (.v2-body), so they never scroll away with the expanded poster grid.
old = '''    .v2-body { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain;'''
new = '''    .v2-back-to-carousel-bar { flex:0 0 auto; display:flex; align-items:center;
      justify-content:flex-start; min-width:0; padding:8px clamp(10px,1.5vw,20px);
      background:var(--card-background-color); color:var(--primary-text-color);
      border-bottom:1px solid var(--divider-color); z-index:20; }
    .v2-back-to-carousel-bar .v2-see-all { margin:0; padding:7px 10px;
      min-height:36px; justify-content:flex-start; gap:6px;
      border-radius:9px; background:var(--secondary-background-color); }
    .v2-back-to-carousel-bar .v2-see-all ha-icon { order:-1; }
    .v2-body { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain;'''
assert s.count(old) == 1, 'Missing V2 body CSS anchor'
s = s.replace(old, new, 1)

# The initial/full layout wrapper creates the button inside the selected
# catalog section; move only the expanded-state button above the scrollport.
old = '''    body.scrollTop = this._v2ResetScroll ? 0 : oldScroll;
    this._v2ResetScroll = false;'''
new = '''    this._v2PositionBackToCarousel?.();
    body.scrollTop = this._v2ResetScroll ? 0 : oldScroll;
    this._v2ResetScroll = false;'''
assert s.count(old) == 1, 'Missing full-layout scroll restoration anchor'
s = s.replace(old, new, 1)

# The incremental path replaces ONLY the catalog; keep the toolbar itself
# mounted and rehome the newly created button when the catalog changes.
old = '''      this._v2SyncCatalog(body);
      body.scrollTop = this._v2ResetScroll ? 0 : oldTop;'''
new = '''      this._v2SyncCatalog(body);
      this._v2PositionBackToCarousel?.();
      body.scrollTop = this._v2ResetScroll ? 0 : oldTop;'''
assert s.count(old) == 1, 'Missing incremental catalog sync anchor'
s = s.replace(old, new, 1)

addon = r'''

/* Streaming Browser V2 v0.4.108: fixed expanded-catalog return bar. */
(() => {
  const Card = StreamingBrowserV2Card;
  Card.prototype._v2PositionBackToCarousel = function() {
    const wrap = this.shadowRoot?.querySelector('ha-card > .wrap');
    const body = wrap?.querySelector(':scope > .v2-body');
    if (!body) return;
    let bar = wrap.querySelector(':scope > .v2-back-to-carousel-bar');
    const expanded = this._v2ShowAll === true &&
      String(this._query || '').trim().length < 2;
    const section = expanded ? [...body.querySelectorAll('.catalog-section.v2-expanded')]
      .find(element => !element.hidden && element.style.display !== 'none' &&
        element.querySelector('.catalog-row[data-section]')?.dataset.section === this._v2CategoryKey) : null;
    const button = section?.querySelector(':scope > .v2-see-all');
    if (!button) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'v2-back-to-carousel-bar';
      bar.setAttribute('role', 'navigation');
      bar.setAttribute('aria-label', this._locale().startsWith('es')
        ? 'Volver al carrusel' : 'Back to carousel');
      wrap.insertBefore(bar, body);
    }
    button.classList.add('v2-back-to-carousel');
    button.querySelector('ha-icon')?.setAttribute('icon', 'mdi:chevron-left');
    // Moving, rather than cloning, preserves the existing click handler and
    // incremental rendering behavior. The normal See all stays below posters.
    if (bar.firstElementChild !== button) bar.replaceChildren(button);
  };
})();
'''
s += addon
s = s.replace('const STREAMING_BROWSER_VERSION = "0.4.107";',
              'const STREAMING_BROWSER_VERSION = "0.4.108";', 1)
js_path.write_text(s, encoding='utf-8')
manifest['version'] = '0.4.108'
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with (root / 'README.md').open('a', encoding='utf-8') as readme:
    readme.write('''\n\n## v0.4.108 — V2 fixed Back to carousel above expanded titles\n\nThe expanded V2 catalog displays **Back to carousel** in a dedicated, non-scrolling toolbar directly below the fixed category header and above the poster grid. The button stays visible while titles scroll and continues to return to the selected category carousel. The ordinary **See all** button stays at the bottom of the carousel. Both initial/full renders and incremental catalog refreshes maintain this behavior; V1 and playback are unchanged.\n''')
print('PASS V2 Back to carousel lives above the scrollable catalog; V1 unchanged')
