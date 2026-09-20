"""Keep V2 Movies/Series/genre and All stationary while provider logos scroll."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
card_path = base / 'frontend' / 'streaming-browser-card-v2.js'
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.100', manifest['version']
source = card_path.read_text(encoding='utf-8')
assert source.count('const STREAMING_BROWSER_VERSION = "0.4.99";') == 1

old = '''    .v2-provider-strip { display:flex; align-items:center; min-width:0;
      gap:clamp(10px,2vw,28px); overflow-x:auto; overscroll-behavior-inline:contain;
      scrollbar-width:thin; padding:2px 1px 10px; }
    .v2-provider-strip .switcher { flex:0 0 auto; flex-wrap:nowrap; margin:0; }
    .v2-provider-strip .mode { min-height:62px; min-width:78px; }
    .v2-provider-strip .chips { flex:0 0 auto; overflow:visible;
      padding:0; gap:8px; align-items:center; }
'''
new = '''    /* Filters and All do not belong to the horizontally scrollable logo track. */
    .v2-provider-strip { display:flex; flex-wrap:wrap; align-items:center; min-width:0;
      gap:clamp(8px,1.2vw,16px); overflow:visible; padding:2px 1px 10px; }
    .v2-provider-strip .switcher { flex:0 0 auto; flex-wrap:nowrap; margin:0;
      max-width:100%; min-width:0; }
    .v2-provider-strip .mode { min-height:62px; min-width:78px; }
    .v2-provider-choice { flex:1 1 250px; min-width:0; max-width:100%;
      display:flex; align-items:center; gap:8px; }
    .v2-provider-choice > .chip[data-provider="all"] { flex:0 0 70px;
      position:relative; z-index:1; }
    .v2-provider-scroll { flex:1 1 auto; min-width:0; max-width:100%;
      overflow-x:auto; overflow-y:hidden; overscroll-behavior-inline:contain;
      touch-action:pan-x; scrollbar-width:thin; padding:1px 1px 8px; }
    .v2-provider-scroll .chips { display:flex; width:max-content; min-width:100%;
      flex-wrap:nowrap; overflow:visible; padding:0; gap:8px; align-items:center; }
'''
assert source.count(old) == 1, 'V2 layout CSS not found; do not modify V1'
source = source.replace(old, new, 1)
old = '''    const previousBody = this.shadowRoot?.querySelector('.v2-body');
    const oldScroll = previousBody?.scrollTop || 0;
    previousRender.apply(this, args);
'''
new = '''    const previousBody = this.shadowRoot?.querySelector('.v2-body');
    const oldScroll = previousBody?.scrollTop || 0;
    const oldProviderScroll = this.shadowRoot?.querySelector('.v2-provider-scroll')?.scrollLeft
      ?? this._v2ProviderScrollLeft ?? 0;
    previousRender.apply(this, args);
'''
assert source.count(old) == 1
source = source.replace(old, new, 1)
old = '''    strip.append(switcher, chips);
    header.append(top, strip);

    // The full 'All' caption belongs INSIDE its own icon-above-label chip.
    const allChip = chips.querySelector('.chip[data-provider="all"]');
    if (allChip) {
      allChip.innerHTML = '<ha-icon icon="mdi:apps" aria-hidden="true"></ha-icon><span>All</span>';
      allChip.setAttribute('aria-label', this._t('all_sources'));
    }
'''
new = '''    // Move All outside the logo scroller; preserve its existing click handler.
    const choiceBar = document.createElement('div');
    choiceBar.className = 'v2-provider-choice';
    const scrollable = document.createElement('div');
    scrollable.className = 'v2-provider-scroll';
    const allChip = chips.querySelector('.chip[data-provider="all"]');
    if (allChip) {
      allChip.innerHTML = '<ha-icon icon="mdi:apps" aria-hidden="true"></ha-icon><span>All</span>';
      allChip.setAttribute('aria-label', this._t('all_sources'));
      choiceBar.append(allChip);
    }
    scrollable.append(chips);
    choiceBar.append(scrollable);
    strip.append(switcher, choiceBar);
    header.append(top, strip);
    // A Home Assistant state update can re-render the header while browsing.
    // Restore logo-only scroll position without moving the fixed filters/All.
    scrollable.scrollLeft = oldProviderScroll;
    scrollable.addEventListener('scroll', () => {
      this._v2ProviderScrollLeft = scrollable.scrollLeft;
    }, { passive: true });
'''
assert source.count(old) == 1
source = source.replace(old, new, 1)
source = source.replace('const STREAMING_BROWSER_VERSION = "0.4.99";',
                        'const STREAMING_BROWSER_VERSION = "0.4.101";', 1)
card_path.write_text(source, encoding='utf-8')
manifest['version'] = '0.4.101'
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with (root / 'README.md').open('a', encoding='utf-8') as readme:
    readme.write('''\n\n## v0.4.101 — V2 fixed source filters\n\nIn the V2 card only, Movies, Series and the genre selector remain fixed in the header, and the grid icon plus **All** label remain inside a separate fixed All provider chip. Only the remaining provider logos scroll horizontally. Scrolling is preserved on refresh/re-render. On narrow devices the fixed filters and provider choices may wrap to two rows. V1 and both TV playback paths remain unchanged.\n''')
print('Patched V2-only fixed filters, fixed All chip and independently scrollable provider logos')
