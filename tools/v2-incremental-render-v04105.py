"""Preserve V2 header DOM during ordinary catalog, filter, and state updates."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components' / 'streaming_browser'
js = base / 'frontend' / 'streaming-browser-card-v2.js'
manifest = base / 'manifest.json'
data = json.loads(manifest.read_text())
assert data['version'] == '0.4.104', data['version']
s = js.read_text()
assert s.count('const STREAMING_BROWSER_VERSION = "0.4.104";') == 1
# Replace the expensive, unconditional shadow DOM teardown in the MAIN card
# renderer only; the configuration/error fallback renderers stay intact.
needle = '''    this.shadowRoot.innerHTML = `
      <style>
        /* Streaming Browser v0.4.98: container-responsive full-width layout. */'''
assert s.count(needle) == 1, 'main template start not found'
s = s.replace(needle, '''    this._v2CommitMainMarkup(`
      <style>
        /* Streaming Browser v0.4.98: container-responsive full-width layout. */''', 1)
needle = '''    `;

    if (detailScrollTop !== null) {
      const detailPane = this.shadowRoot.querySelector(".detail");'''
assert s.count(needle) == 1, 'main template end not found'
s = s.replace(needle, '''    `);

    if (detailScrollTop !== null) {
      const detailPane = this.shadowRoot.querySelector(".detail");''', 1)
needle = '''    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Events'''
assert s.count(needle) == 1, 'main template bind not found'
s = s.replace(needle, '''    if (!this._v2PartialRender) this._bindEvents();
    this._v2PartialRender = false;
  }

  // ---------------------------------------------------------------------------
  // Events''', 1)
# The independent V2 layout wrapper must not reparent/recreate a header that
# the new commit path has explicitly preserved.
needle = '''    previousRender.apply(this, args);
    const root = this.shadowRoot;
    const wrap = root?.querySelector('ha-card > .wrap');'''
assert s.count(needle) == 1, 'V2 wrapper start not found'
s = s.replace(needle, '''    previousRender.apply(this, args);
    if (this._v2IncrementalCommitted) {
      this._v2IncrementalCommitted = false;
      return;
    }
    const root = this.shadowRoot;
    const wrap = root?.querySelector('ha-card > .wrap');''', 1)
# Room route changes should refresh their labels; config edits should re-render
# the configured card once, not freeze previous route/setup markup.
addon = r'''

/* Streaming Browser V2 v0.4.105: update affected nodes without replacing the header. */
(() => {
  const Card = StreamingBrowserV2Card;
  const originalSetConfig = Card.prototype.setConfig;
  Card.prototype.setConfig = function(...args) {
    this._v2ForceFullRender = true;
    try { return originalSetConfig.apply(this, args); }
    finally { this._v2ForceFullRender = false; }
  };

  const selectedCategory = card => card._v2CategoryKey || 'provider-popular';
  const catalogStamp = card => JSON.stringify([
    card._browseRequest, card._mode, card._provider, card._query,
    card._genreByMode?.[card._mode], card._loading, card._error,
    selectedCategory(card), Boolean(card._v2ShowAll),
    (card._sections || []).map(section => [section.key, section.items?.length,
      section.page, section.loadingMore, section.items?.[0]?.id,
      section.items?.[section.items.length - 1]?.id]),
  ]);
  const putClass = (element, className, enabled) => {
    if (element) element.classList.toggle(className, Boolean(enabled));
  };
  const syncTabs = card => {
    card.shadowRoot?.querySelectorAll('.v2-category-tab').forEach(tab => {
      const active = tab.dataset.v2Category === selectedCategory(card);
      putClass(tab, 'active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  };

  // Bind just the newly inserted catalog controls. Fixed controls retain their
  // original listeners and DOM identities; NEVER call the global _bindEvents
  // after an incremental update (that would duplicate search/profile handlers).
  Card.prototype._v2BindCatalog = function(body) {
    body.querySelectorAll('.poster[data-index][data-section]').forEach(poster =>
      poster.addEventListener('click', () =>
        this._openDetails(poster.dataset.section, Number(poster.dataset.index))));
    body.querySelectorAll('.catalog-row[data-section]').forEach(row => {
      const key = row.dataset.section;
      const previous = this._rowScrollPositions?.get(key);
      if (Number.isFinite(previous)) row.scrollLeft = previous;
      row.addEventListener('scroll', () => {
        this._rowScrollPositions.set(key, row.scrollLeft);
        const threshold = Number(this._config.catalog_prefetch_threshold_px || 360);
        if (row.scrollWidth - row.scrollLeft - row.clientWidth <= threshold)
          void this._loadMoreSection(key);
      }, {passive:true});
    });
    body.querySelectorAll('[data-scroll-row]').forEach(button =>
      button.addEventListener('click', () => {
        const row = body.querySelector(`.catalog-row[data-section="${button.dataset.scrollRow}"]`);
        if (row) row.scrollBy({left: (Number(button.dataset.direction) || 1) *
          Math.max(320, row.clientWidth * 0.82), behavior:'smooth'});
      }));
  };

  Card.prototype._v2SyncCatalog = function(body) {
    const searchActive = String(this._query || '').trim().length >= 2;
    const categories = ['provider-popular', 'provider-top-rated', 'provider-recent'];
    if (!categories.includes(this._v2CategoryKey)) this._v2CategoryKey = categories[0];
    const actual = (this._sections || []).filter(s => categories.includes(s.key));
    if (!searchActive && actual.length && !actual.some(s => s.key === this._v2CategoryKey))
      this._v2CategoryKey = actual[0].key;
    syncTabs(this);
    body.querySelectorAll('.catalog-section').forEach(section => {
      const row = section.querySelector('.catalog-row[data-section]');
      if (!row) return;
      const key = row.dataset.section;
      const show = searchActive || key === this._v2CategoryKey;
      section.hidden = !show;
      section.style.display = show ? '' : 'none';
      if (!show || searchActive || !categories.includes(key)) return;
      section.classList.toggle('v2-expanded', this._v2ShowAll === true);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'v2-see-all';
      const expanded = this._v2ShowAll === true;
      button.setAttribute('aria-expanded', String(expanded));
      button.innerHTML = `<span>${expanded
        ? (this._locale().startsWith('es') ? 'Volver al carrusel' : 'Back to carousel')
        : (this._locale().startsWith('es') ? 'Ver todo' : 'See all')}
        </span><ha-icon icon="mdi:chevron-right" aria-hidden="true"></ha-icon>`;
      button.addEventListener('click', () => {
        this._v2ShowAll = !expanded;
        this._v2ResetScroll = true;
        this._render();
      });
      section.append(button);
    });
    this._v2BindCatalog(body);
  };

  Card.prototype._v2CommitMainMarkup = function(markup) {
    const root = this.shadowRoot;
    const body = root?.querySelector('.v2-body');
    const header = root?.querySelector('.v2-header');
    if (!body || !header || this._v2ForceFullRender || this._details ||
        body.querySelector('.overlay')) {
      // First render, details dialog or card editor config change still uses
      // existing fully bound render, including all provider/playback behavior.
      this._v2PartialRender = false;
      this._v2IncrementalCommitted = false;
      this._v2CatalogStamp = null;
      root.innerHTML = markup;
      return;
    }
    const t = document.createElement('template');
    t.innerHTML = markup;
    const nextWrap = t.content.querySelector('ha-card > .wrap');
    if (!nextWrap) { this._v2PartialRender = false; root.innerHTML = markup; return; }
    this._v2PartialRender = true;
    this._v2IncrementalCommitted = true;

    // Keep all current header controls (and their pointer/focus/scroll state).
    const mode = this._mode;
    header.querySelectorAll('.mode[data-mode]').forEach(button => {
      const active = button.dataset.mode === mode;
      putClass(button, 'active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const genre = header.querySelector('.genre-select');
    const nextGenre = nextWrap.querySelector('.genre-select');
    if (genre && nextGenre) {
      // Options only change when switching Movies/Series or language.
      if (genre.dataset.v2Mode !== mode || genre.options.length !== nextGenre.options.length) {
        genre.innerHTML = nextGenre.innerHTML;
        genre.dataset.v2Mode = mode;
      }
      const newValue = this._genreByMode?.[mode] || 'all';
      if (genre.value !== newValue) genre.value = newValue;
    }
    const search = header.querySelector('.search');
    if (search && search.value !== this._query) search.value = this._query || '';
    const status = header.querySelector('.tvstate');
    const nextStatus = nextWrap.querySelector('.tvstate');
    if (status && nextStatus && status.innerHTML !== nextStatus.innerHTML)
      status.innerHTML = nextStatus.innerHTML;
    const roomSelect = header.querySelector('.sbr-room-select');
    if (roomSelect && this._activeRoomId) roomSelect.value = this._activeRoomId;
    const connSelect = header.querySelector('.sbr-connection-select');
    if (connSelect && this._roomConnection?.()?.id)
      connSelect.value = this._roomConnection().id;

    const all = header.querySelector('.chip[data-provider="all"]');
    putClass(all, 'active', this._provider === 'all');
    const chips = header.querySelector('.v2-provider-scroll .chips');
    const freshChips = nextWrap.querySelector('.chips');
    if (chips && freshChips) {
      const oldIds = [...chips.querySelectorAll('.chip[data-provider]')]
        .map(chip => chip.dataset.provider).join('|');
      const nextIds = [...freshChips.querySelectorAll('.chip[data-provider]')]
        .filter(chip => chip.dataset.provider !== 'all')
        .map(chip => chip.dataset.provider).join('|');
      if (oldIds !== nextIds) {
        // A media-type/room change can alter available providers. Only in that
        // case replace the icon buttons and attach handlers for the new ones.
        chips.replaceChildren(...[...freshChips.querySelectorAll('.chip[data-provider]')]
          .filter(chip => chip.dataset.provider !== 'all'));
        chips.querySelectorAll('.chip[data-provider]').forEach(chip => {
          const name = chip.querySelector('span')?.textContent?.trim() || chip.title || '';
          chip.querySelectorAll(':scope > span').forEach(span => span.remove());
          if (name) {chip.title = name; chip.setAttribute('aria-label', name);}
          chip.addEventListener('click', async () => {
            this._provider = chip.dataset.provider;
            this._query = '';
            await this._loadBrowse();
          });
        });
      }
      chips.querySelectorAll('.chip[data-provider]').forEach(chip =>
        putClass(chip, 'active', chip.dataset.provider === String(this._provider)));
    }
    syncTabs(this);

    // Repaint titles only if the selected catalog data actually changed.
    const stamp = catalogStamp(this);
    if (this._v2CatalogStamp !== stamp) {
      const oldTop = body.scrollTop;
      const children = [...nextWrap.children].filter(child =>
        !child.matches('.top, .switcher, .chips, .overlay'));
      body.replaceChildren(...children);
      this._v2SyncCatalog(body);
      body.scrollTop = this._v2ResetScroll ? 0 : oldTop;
      this._v2ResetScroll = false;
      this._v2CatalogStamp = catalogStamp(this);
    }
    // Toast messages are siblings of ha-card. Do not rebuild the catalog or
    // header for ephemeral notifications during device/stream actions.
    root.querySelector(':scope > .toast')?.remove();
    const toast = t.content.querySelector('.toast');
    if (toast) root.append(toast);
  };

  // One stable listener on the real body handles See all pagination; unlike a
  // listener on a freshly built body, this survives ordinary catalog updates.
  const previousRender = Card.prototype._render;
  Card.prototype._render = function(...args) {
    const result = previousRender.apply(this, args);
    const body = this.shadowRoot?.querySelector('.v2-body');
    if (body && !body._v2PaginationBound) {
      body._v2PaginationBound = true;
      body.addEventListener('scroll', () => {
        if (!this._v2ShowAll || String(this._query || '').trim().length >= 2) return;
        if (body.scrollHeight - body.scrollTop - body.clientHeight > 450) return;
        const section = this._sections?.find(s => s.key === this._v2CategoryKey);
        if (section && !section.loadingMore && Number(section.page) < Number(section.totalPages))
          void this._loadMoreSection(section.key);
      }, {passive:true});
    }
    return result;
  };
})();
'''
assert 'Streaming Browser V2 v0.4.105' not in s
s += addon
s = s.replace('const STREAMING_BROWSER_VERSION = "0.4.104";',
              'const STREAMING_BROWSER_VERSION = "0.4.105";', 1)
js.write_text(s)
data['version'] = '0.4.105'
manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
with (root / 'README.md').open('a') as readme:
    readme.write('''\n\n## v0.4.105 — V2 incremental card updates\n\nV2 retains the actual header, Movies/Series, genre selector, All and provider scroll nodes during filter/category changes, and updates only changed selection states and catalog titles. Room selectors and search stay mounted and keep their focus/scroll state. Provider buttons are rebuilt only if the available provider list changes. Catalog poster/scroll handlers are bound only on replaced catalog nodes; toast updates do not rebuild the catalog. Detail dialog and card configuration can still take the existing full-render path. V1 is unchanged.\n''')
print('PASS V2 incremental DOM commit installed; V1 untouched; manifest 0.4.105')
