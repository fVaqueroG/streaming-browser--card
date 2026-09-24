/* Streaming Browser v0.4.148: automatically paginate the visible expanded catalog/search. */
(() => {
  const Card = customElements.get('streaming-browser-card-v2');
  if (!Card) throw new Error('Streaming Browser V2 must be registered before catalog pagination');
  const previousRender = Card.prototype._render;
  const active = card => {
    const searching = String(card._query || '').trim().length >= 2;
    return card._sections?.find(section => section.key === (searching ? 'search' : card._v2CategoryKey));
  };
  const nearBottom = element => element && element.clientHeight > 0 &&
    element.scrollHeight - element.scrollTop - element.clientHeight <=
      Math.max(420, element.clientHeight * 0.45);

  Card.prototype._sb148MaybeLoad = function() {
    if (this._sb148Busy || !this.isConnected || this._loading || this._details) return;
    const searching = String(this._query || '').trim().length >= 2;
    if (!searching && this._v2ShowAll !== true) return;
    const body = this.shadowRoot?.querySelector('.v2-body');
    const catalog = body?.querySelector('.catalog');
    const section = active(this);
    if (!body || !catalog || !section || section.loadingMore ||
        this._sectionLoadLocks?.has(section.key) ||
        Number(section.page) >= Number(section.totalPages)) return;
    // The nested .catalog has its own max-height and overflow-y:auto. Watch
    // that real scrolling element, falling back to the outer body only when
    // the catalog is too short to have a scrollbar.
    const scroller = catalog.scrollHeight > catalog.clientHeight + 8 ? catalog : body;
    if (!nearBottom(scroller)) return;
    const generation = this._browseRequest;
    const key = section.key;
    const page = Number(section.page);
    const stalledKey = `${generation}:${key}:${page}`;
    if (this._sb148Stalled === stalledKey) return;
    this._sb148Busy = true;
    Promise.resolve().then(async () => {
      if (!this.isConnected || this._browseRequest !== generation ||
          active(this) !== section ||
          !(searching || this._v2ShowAll === true)) return;
      await this._loadMoreSection(key);
      // _loadMoreSection reports network errors via its existing toast, then
      // returns without advancing. Do not continuously retry a failed page.
      if (this._browseRequest === generation && active(this) === section &&
          Number(section.page) === page) this._sb148Stalled = stalledKey;
    }).catch(error => {
      this._sb148Stalled = stalledKey;
      console.error('Streaming Browser automatic catalog pagination:', error);
    }).finally(() => {
      this._sb148Busy = false;
      // If the new results still do not fill the viewport, load another page.
      // No arbitrary fifth-page cutoff; the TMDB total_pages is the limit.
      if (this._browseRequest === generation && active(this) === section &&
          Number(section.page) > page) queueMicrotask(() => this._sb148MaybeLoad());
    });
  };

  Card.prototype._sb148SyncPagination = function() {
    const body = this.shadowRoot?.querySelector('.v2-body');
    const catalog = body?.querySelector('.catalog');
    if (!body || !catalog) return;
    // The v0.4.147 button is no longer required or rendered; remove a stale
    // button if the dashboard reused nodes from an older card instance.
    body.querySelectorAll('[data-sb147-more]').forEach(button => button.remove());
    for (const element of [body, catalog]) {
      if (element._sb148Bound) continue;
      element._sb148Bound = true;
      element.addEventListener('scroll', () => this._sb148MaybeLoad(), {passive:true});
    }
    // A page with only a few posters might have no scroll event at all.
    // Recheck after the DOM has completed its current render.
    if (!this._sb148CheckQueued) {
      this._sb148CheckQueued = true;
      queueMicrotask(() => {
        this._sb148CheckQueued = false;
        this._sb148MaybeLoad();
      });
    }
  };

  Card.prototype._render = function(...args) {
    const result = previousRender.apply(this, args);
    this._sb148SyncPagination();
    return result;
  };
})();
