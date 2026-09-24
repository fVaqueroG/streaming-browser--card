/* Streaming Browser v0.4.145: one active Back owner, safe popup history cleanup. */
(() => {
  const Full = customElements.get('streaming-browser-card-v2');
  const Popup = customElements.get('streaming-browser-popup-card');
  if (!Full || !Popup) throw new Error('Streaming Browser Back: cards unavailable');
  const mobile = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches;
  /* SHARED_BACK_MANAGER */
  const nested = card => !!card && (!!card._remoteExpanded || !!card._details || !!card._v2ShowAll);
  function step(card) {
    if (!card) return false;
    if (card._remoteExpanded) {
      card._toggleNuvioRemote?.();
      if (card._remoteExpanded) {
        card._remoteExpanded = false;
        card._remotePortal?.remove();
        card._remotePortal = null;
      }
      return true;
    }
    if (card._details) { card._details = null; card._render(); return true; }
    if (card._v2ShowAll) { card._v2ShowAll = false; card._v2ResetScroll = true; card._render(); return true; }
    return false;
  }
  const priorOpen = Popup.prototype._open;
  Popup.prototype._open = function (...args) {
    const result = priorOpen.apply(this, args);
    const dialog = this._dialog;
    if (!dialog || this._fvBackOwner) return result;
    const owner = { back: () => {
      if (step(this._innerCard)) return;
      manager.remove(owner);
      if (this._fvBackOwner === owner) this._fvBackOwner = null;
      if (dialog.open) dialog.close();
    } };
    this._fvBackOwner = owner;
    // Native dialog cancellation and Android history navigation must share one action.
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (!manager.request(owner)) owner.back();
    });
    dialog.addEventListener('close', () => {
      manager.remove(owner);
      if (this._fvBackOwner === owner) this._fvBackOwner = null;
    }, { once:true });
    manager.add(owner);
    return result;
  };
  const priorClose = Popup.prototype._close;
  Popup.prototype._close = function (...args) {
    if (this._fvBackOwner) { manager.remove(this._fvBackOwner); this._fvBackOwner = null; }
    return priorClose.apply(this, args);
  };
  const priorRender = Full.prototype._render;
  Full.prototype._render = function (...args) {
    const result = priorRender.apply(this, args);
    if (!mobile() || !this.isConnected || this.closest('.sb-popup-content')) return result;
    if (nested(this)) {
      if (!this._fvBackOwner) this._fvBackOwner = { back: () => step(this) };
      manager.add(this._fvBackOwner);
    } else if (this._fvBackOwner) { manager.remove(this._fvBackOwner); this._fvBackOwner = null; }
    return result;
  };
  const priorDisconnected = Full.prototype.disconnectedCallback;
  Full.prototype.disconnectedCallback = function (...args) {
    if (this._fvBackOwner) { manager.remove(this._fvBackOwner); this._fvBackOwner = null; }
    return priorDisconnected?.apply(this, args);
  };
})();
