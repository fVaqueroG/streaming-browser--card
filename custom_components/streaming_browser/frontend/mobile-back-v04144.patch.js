/* Streaming Browser v0.4.144: scoped Android Back navigation. */
(() => {
  const Full = customElements.get('streaming-browser-card-v2');
  const Popup = customElements.get('streaming-browser-popup-card');
  if (!Full || !Popup) throw new Error('Streaming Browser mobile Back: cards unavailable');
  const mobile = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  const stack = () => (window.__fvHaCardBackStack ||= []);
  const nested = card => !!card && (!!card._remoteExpanded || !!card._details || !!card._v2ShowAll);
  function step(card) {
    if (!card) return false;
    if (card._remoteExpanded) {
      card._toggleNuvioRemote?.();
      if (card._remoteExpanded) { card._remoteExpanded = false; card._remotePortal?.remove(); card._remotePortal = null; }
      return true;
    }
    if (card._details) { card._details = null; card._render(); return true; }
    if (card._v2ShowAll) { card._v2ShowAll = false; card._v2ResetScroll = true; card._render(); return true; }
    return false;
  }
  function bridge(isOpen, onBack) {
    const id = 'streaming-' + Math.random().toString(36).slice(2);
    let active = false, armed = false, url = '';
    const isTop = () => stack()[stack().length - 1] === api;
    const arm = () => {
      if (!active || armed || !isOpen()) return;
      try { history.pushState({ ...(history.state || {}), __fvHaCardBackId:id }, '', location.href); armed = true; }
      catch (error) { console.warn('Streaming Browser mobile Back history unavailable', error); }
    };
    const pop = event => {
      if (!active || !armed || !isTop() || !isOpen()) return;
      if (history.state?.__fvHaCardBackId === id) return;
      armed = false;
      if (location.href !== url) { api.stop(false); return; }
      event.stopImmediatePropagation();
      onBack();
      if (isOpen()) arm(); else api.stop(false);
    };
    const api = {
      start() {
        if (active || !mobile() || !isOpen()) return;
        active = true; url = location.href;
        stack().push(api);
        window.addEventListener('popstate', pop, true);
        arm();
      },
      stop(rewind = true) {
        if (!active) return;
        active = false;
        window.removeEventListener('popstate', pop, true);
        const owners = stack(), index = owners.indexOf(api);
        if (index >= 0) owners.splice(index,1);
        if (rewind && armed && history.state?.__fvHaCardBackId === id) { armed=false; history.back(); }
        armed = false;
      }
    };
    return api;
  }
  const priorOpen = Popup.prototype._open;
  Popup.prototype._open = function(...args) {
    const result = priorOpen.apply(this,args);
    const dialog = this._dialog;
    if (!dialog || dialog._sbMobileBackBound) return result;
    dialog._sbMobileBackBound = true;
    const back = () => { if (!step(this._innerCard)) dialog.close(); };
    dialog.addEventListener('cancel', event => { event.preventDefault(); back(); });
    this._sbMobileBackBridge = bridge(() => this._dialog === dialog && dialog.open, back);
    this._sbMobileBackBridge.start();
    dialog.addEventListener('close', () => {
      this._sbMobileBackBridge?.stop();
      this._sbMobileBackBridge = null;
    }, {once:true});
    return result;
  };
  const priorClose = Popup.prototype._close;
  Popup.prototype._close = function(...args) {
    this._sbMobileBackBridge?.stop(); this._sbMobileBackBridge=null;
    return priorClose.apply(this,args);
  };
  const priorRender = Full.prototype._render;
  Full.prototype._render = function(...args) {
    const result = priorRender.apply(this,args);
    if (mobile() && this.isConnected && !this.closest('.sb-popup-content')) {
      if (nested(this)) {
        if (!this._sbMobileBackBridge) this._sbMobileBackBridge = bridge(() => this.isConnected && nested(this), () => step(this));
        this._sbMobileBackBridge.start();
      } else { this._sbMobileBackBridge?.stop(); this._sbMobileBackBridge=null; }
    }
    return result;
  };
  const priorDisconnected = Full.prototype.disconnectedCallback;
  Full.prototype.disconnectedCallback = function(...args) {
    this._sbMobileBackBridge?.stop(); this._sbMobileBackBridge=null;
    return priorDisconnected?.apply(this,args);
  };
})();
