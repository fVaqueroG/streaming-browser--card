/* Streaming Browser v0.4.147: keep catalog pagination reachable on short rows and grids. */
(() => {
  const Card = customElements.get('streaming-browser-card-v2');
  if (!Card) throw new Error('Streaming Browser catalog: V2 card not registered');
  const previousRender = Card.prototype._render;
  const activeSection = card => {
    const search = String(card._query || '').trim().length >= 2;
    const key = search ? 'search' : card._v2CategoryKey;
    return card._sections?.find(section => section.key === key) || null;
  };
  Card.prototype._sb147QueueFill = function() {
    if (this._sb147Filling || !this.isConnected || this._details) return;
    const search = String(this._query || '').trim().length >= 2;
    if (!search && this._v2ShowAll !== true) return;
    const body = this.shadowRoot?.querySelector('.v2-body');
    const section = activeSection(this);
    if (!body || !section || section.loadingMore ||
        this._sectionLoadLocks?.has(section.key) || section.page >= section.totalPages ||
        section.page >= 5 || body.scrollHeight > body.clientHeight + 200) return;
    const key = section.key;
    const generation = this._browseRequest;
    this._sb147Filling = true;
    queueMicrotask(async () => {
      try {
        if (!this.isConnected || this._browseRequest !== generation ||
            activeSection(this) !== section ||
            !(search || this._v2ShowAll === true)) return;
        await this._loadMoreSection(key);
      } finally {
        this._sb147Filling = false;
        this._sb147QueueFill();
      }
    });
  };
  Card.prototype._sb147SyncMoreControls = function() {
    const root = this.shadowRoot;
    const body = root?.querySelector('.v2-body');
    if (!body || !this.isConnected) return;
    const search = String(this._query || '').trim().length >= 2;
    body.querySelectorAll('.catalog-section').forEach(element => {
      const key = element.querySelector('.catalog-row[data-section]')?.dataset.section;
      const section = this._sections?.find(item => item.key === key);
      let button = element.querySelector(':scope > [data-sb147-more]');
      if (!section || !key || Number(section.page) >= Number(section.totalPages) ||
          element.hidden || element.style.display === 'none') {
        button?.remove(); return;
      }
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.sb147More = key;
        button.style.cssText = 'display:block;min-height:40px;max-width:100%;margin:12px auto 8px;padding:8px 16px;border:1px solid var(--divider-color);border-radius:10px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer';
        button.addEventListener('click', () => {
          if (!section.loadingMore && Number(section.page) < Number(section.totalPages))
            void this._loadMoreSection(section.key);
        });
        element.append(button);
      }
      button.disabled = !!section.loadingMore;
      button.textContent = section.loadingMore
        ? (this._locale().startsWith('es') ? 'Cargando más títulos…' : 'Loading more titles…')
        : (this._locale().startsWith('es') ? 'Cargar más títulos' : 'Load more titles') +
          ' · ' + section.items.length + ' ' + (this._locale().startsWith('es') ? 'mostrados' : 'shown');
    });
    if (!body._sb147SearchPaginationBound) {
      body._sb147SearchPaginationBound = true;
      body.addEventListener('scroll', () => {
        if (String(this._query || '').trim().length < 2 || this._details) return;
        if (body.scrollHeight - body.scrollTop - body.clientHeight > 450) return;
        const section = activeSection(this);
        if (section && !section.loadingMore && Number(section.page) < Number(section.totalPages))
          void this._loadMoreSection(section.key);
      }, {passive:true});
    }
    this._sb147QueueFill();
  };
  Card.prototype._render = function(...args) {
    const result = previousRender.apply(this, args);
    this._sb147SyncMoreControls();
    return result;
  };
})();
