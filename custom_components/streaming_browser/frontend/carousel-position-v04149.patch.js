/* Streaming Browser v0.4.149: preserve horizontal carousel position while appending pages. */
(() => {
  const Card = customElements.get('streaming-browser-card-v2');
  if (!Card) throw new Error('Streaming Browser V2 must be registered before carousel position fix');

  const previousLoadMore = Card.prototype._loadMoreSection;

  Card.prototype._sb149CarouselRow = function(key) {
    if (this._v2ShowAll === true || String(this._query || '').trim().length >= 2) return null;
    const escaped = globalThis.CSS?.escape ? CSS.escape(String(key)) : String(key).replace(/["\\]/g, '\\$&');
    return this.shadowRoot?.querySelector(
      `.catalog-row[data-section="${escaped}"]`
    ) || null;
  };

  Card.prototype._loadMoreSection = async function(key) {
    const row = this._sb149CarouselRow(key);
    const savedLeft = row ? Number(row.scrollLeft || 0) : null;

    // Store the exact pre-request position before any async boundary. The V2
    // incremental renderer already consults this map while rebuilding rows.
    if (Number.isFinite(savedLeft)) {
      this._rowScrollPositions?.set(key, savedLeft);
    }

    await previousLoadMore.call(this, key);

    // A load-more render can replace the catalog row. Restore the captured
    // absolute offset on the replacement before the browser paints the next
    // frame, so new posters append to the right without snapping to the start.
    if (Number.isFinite(savedLeft)) {
      this._rowScrollPositions?.set(key, savedLeft);
      const replacement = this._sb149CarouselRow(key);
      if (replacement && Math.abs(Number(replacement.scrollLeft || 0) - savedLeft) > 1) {
        replacement.scrollLeft = savedLeft;
      }
    }
  };
})();
