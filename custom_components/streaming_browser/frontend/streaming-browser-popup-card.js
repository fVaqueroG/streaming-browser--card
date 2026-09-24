/* Compact launcher for the existing Streaming Browser V2 card.
 * This module deliberately reuses the V2 custom element and editor; playback,
 * room routing, providers and remote controls stay in the original card.
 */
const SB_POPUP_TYPE = 'custom:streaming-browser-popup-card';
const SB_V2_TYPE = 'custom:streaming-browser-card-v2';
const SB_POPUP_KEYS = ['button_label', 'button_icon', 'button_show_label', 'popup_width', 'button_display', 'popup_auto_close_minutes'];
const sbPopupEscape = (value) => String(value ?? '').replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const SB_POPUP_LOGOS = Object.freeze({
  horizontal: '/streaming_browser/assets/streaming-browser-horizontal-v131.png?v=0.4.131',
  vertical: '/streaming_browser/assets/streaming-browser-vertical-v131.png?v=0.4.131',
  icon_only: '/streaming_browser/assets/streaming-browser-icon-v131.png?v=0.4.131',
});
class StreamingBrowserPopupCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._dialog = null;
    this._innerCard = null;
    this._autoCloseTimer = null;
  }

  static getStubConfig() {
    const v2 = customElements.get('streaming-browser-card-v2');
    return {
      ...(v2?.getStubConfig?.() || {}),
      type: SB_POPUP_TYPE,
      button_label: 'Streaming',
      button_icon: 'mdi:movie-open',
      button_show_label: true,
      popup_width: 'wide',
      button_display: 'horizontal',
      popup_auto_close_minutes: 2,
    };
  }

  static getConfigElement() {
    return document.createElement('streaming-browser-popup-card-editor');
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid Streaming Browser popup configuration');
    this._config = { ...config };
    this._render();
  }

  set hass(value) {
    this._hass = value;
    if (this._innerCard) this._innerCard.hass = value;
  }

  getCardSize() { return this._config?.button_display === 'vertical' ? 2 : 1; }
  getGridOptions() {
    const tall = this._config?.button_display === 'vertical';
    return { columns: tall ? 4 : 3, rows: tall ? 2 : 1,
      min_columns: 2, min_rows: tall ? 2 : 1 };
  }

  connectedCallback() { this._render(); }
  disconnectedCallback() { this._close(); }

  _render() {
    if (!this._config) return;
    const icon = String(this._config.button_icon || 'mdi:movie-open');
    const label = String(this._config.button_label ?? 'Streaming');
    const showLabel = this._config.button_show_label !== false;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; --popup-button-height: 120px; }
        ha-card { overflow: hidden; height: var(--popup-button-height); min-height: var(--popup-button-height); box-sizing: border-box; border-radius: var(--ha-card-border-radius, 14px); }
        button { box-sizing: border-box; width: 100%; height: 100%; min-height: var(--popup-button-height); padding: 8px; border-radius: inherit; display: flex;
          align-items: center; justify-content: center; gap: 10px; cursor: pointer;
          background: transparent; border: 0; color: var(--primary-text-color);
          font: inherit; font-weight: 500; }
        button:hover { background: var(--secondary-background-color); }
        button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
        .sb-popup-button-logo { display:none; max-width:100%; width:330px;
        height:66px; object-fit:contain; object-position:center; }
      button.sb-popup-logo-ready { min-height:var(--popup-button-height); padding:8px; gap:0; }
      button.sb-popup-logo-ready .sb-popup-button-logo { display:block; }
      button[data-logo-mode="vertical"].sb-popup-logo-ready { min-height:var(--popup-button-height); }
      button[data-logo-mode="vertical"] .sb-popup-button-logo { width:190px; height:104px; }
      button[data-logo-mode="icon_only"].sb-popup-logo-ready { min-height:var(--popup-button-height); }
      button[data-logo-mode="icon_only"] .sb-popup-button-logo { width:110px; height:104px; }
      ha-icon { color: var(--primary-color); --mdc-icon-size: 24px; }
        span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      </style>
      <ha-card><button type="button" aria-label="${sbPopupEscape(label || 'Open Streaming Browser')}"
        title="${sbPopupEscape(label || 'Open Streaming Browser')}">
        <ha-icon icon="${sbPopupEscape(icon)}"></ha-icon>
        ${showLabel ? `<span>${sbPopupEscape(label)}</span>` : ''}
      </button></ha-card>`;
    const button = this.shadowRoot.querySelector('button');
  button.addEventListener('click', () => this._open());
  // Brand images are bundled locally. Keep icon + label if the image fails.
  const mode = this._config.button_display || 'horizontal';
  if (Object.prototype.hasOwnProperty.call(SB_POPUP_LOGOS, mode)) {
    const image = document.createElement('img');
    image.className = 'sb-popup-button-logo';
    image.alt = '';
    image.addEventListener('load', () => {
      if (!image.isConnected || !button.isConnected) return;
      button.querySelectorAll('ha-icon, span').forEach((node) => node.remove());
      button.classList.add('sb-popup-logo-ready');
    });
    image.addEventListener('error', () => image.remove());
    button.dataset.logoMode = mode;
    button.appendChild(image);
    const overrideKey = mode === 'icon_only' ? 'logo_icon_url' : `logo_${mode}_url`;
    image.src = String(this._config[overrideKey] || SB_POPUP_LOGOS[mode]);
  }
  }

  _clearAutoCloseTimer() {
    if (this._autoCloseTimer !== null) {
      clearTimeout(this._autoCloseTimer);
      this._autoCloseTimer = null;
    }
  }

  _close() {
    this._clearAutoCloseTimer();
    if (this._dialog) {
      const dialog = this._dialog;
      this._dialog = null;
      this._innerCard = null;
      if (dialog.open) dialog.close();
      dialog.remove();
    }
  }

  _open() {
    if (this._dialog) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'streaming-browser-popup-dialog';
    const width = ['normal', 'wide', 'fullscreen'].includes(this._config.popup_width)
      ? this._config.popup_width : 'wide';
    dialog.dataset.size = width;
    dialog.setAttribute('aria-label', this._config.title || 'Streaming Browser');
    dialog.innerHTML = `
      <style>
        .streaming-browser-popup-dialog { box-sizing: border-box; padding: 0; border: 0;
          border-radius: var(--ha-card-border-radius, 16px); overflow: hidden;
          color: var(--primary-text-color); background: var(--card-background-color, #fff);
          box-shadow: 0 16px 60px #0006; width: min(1440px, calc(100vw - 24px));
          max-width: calc(100vw - 24px); height: min(900px, calc(100dvh - 24px)); max-height: calc(100dvh - 24px); }
        .streaming-browser-popup-dialog[data-size="normal"] { width: min(900px, calc(100vw - 24px)); height: min(700px, calc(100dvh - 24px)); }
        .streaming-browser-popup-dialog[data-size="fullscreen"] { width: 100vw;
          max-width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; }
        .streaming-browser-popup-dialog::backdrop { background: #0009; }
        .sb-popup-layout { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .sb-popup-header { display: flex; align-items: center; justify-content: space-between;
          box-sizing: border-box; height: 48px; min-height: 48px; flex: 0 0 48px; padding: 0 12px 0 20px; gap: 12px;
          border-bottom: 1px solid var(--divider-color, #8884); }
        .sb-popup-heading { font: inherit; font-size: 16px; font-weight: 600; }
        .sb-popup-close { box-sizing: border-box; flex: 0 0 36px; width: 36px; height: 36px; padding: 0; display: grid; place-items: center;
          cursor: pointer; border: 0; border-radius: 50%; color: var(--primary-text-color);
          background: var(--secondary-background-color); }
        .sb-popup-close:hover { background: var(--secondary-background-color); }
        .sb-popup-close:focus-visible { outline: 2px solid var(--primary-color); }
        .sb-popup-content { flex: 1 1 auto; min-height: 0; overflow: auto;
          overscroll-behavior: contain; }
        .sb-popup-content > streaming-browser-card-v2 { display: block; min-height: 100%; }
        .sb-popup-error { padding: 20px; }
        @media (max-width: 600px) {
          .streaming-browser-popup-dialog,
          .streaming-browser-popup-dialog[data-size="normal"],
          .streaming-browser-popup-dialog[data-size="wide"],
          .streaming-browser-popup-dialog[data-size="fullscreen"] {
            width: 100vw !important; max-width: 100vw !important;
            height: 100dvh !important; max-height: 100dvh !important;
            border-radius: 0 !important; margin: 0 !important; }
          .sb-popup-header { height: 44px; min-height: 44px; flex-basis: 44px; padding: 0 8px 0 12px; }
        }
      </style>
      <div class="sb-popup-layout">
        <header class="sb-popup-header"><span class="sb-popup-heading">Streaming Browser</span>
          <button type="button" class="sb-popup-close" aria-label="Close Streaming Browser"
            title="Close"><ha-icon icon="mdi:close"></ha-icon></button></header>
        <main class="sb-popup-content"></main>
      </div>`;
    // Keep the modal title plain text; V2 displays the logo below.
    const heading = dialog.querySelector('.sb-popup-heading');
    heading.textContent = String(this._config.button_label || this._config.title || 'Streaming Browser');
  const content = dialog.querySelector('.sb-popup-content');
    const v2Class = customElements.get('streaming-browser-card-v2');
    if (v2Class) {
      try {
        const card = document.createElement('streaming-browser-card-v2');
        const cardConfig = { ...this._config, type: SB_V2_TYPE };
        for (const key of SB_POPUP_KEYS) delete cardConfig[key];
        card.setConfig(cardConfig);
        card.hass = this._hass;
        content.appendChild(card);
        this._innerCard = card;
      } catch (error) {
        this._innerCard = null;
        content.textContent = '';
        const message = document.createElement('p');
        message.className = 'sb-popup-error';
        message.setAttribute('role', 'alert');
        message.textContent = 'Streaming Browser could not load: ' + (error?.message || String(error));
        content.appendChild(message);
        console.error('Streaming Browser popup: child card initialization failed', error);
      }
    } else {
      content.innerHTML = '<p class="sb-popup-error" role="alert">Streaming Browser V2 is not loaded. Reload the Home Assistant dashboard.</p>';
    }
    dialog.querySelector('.sb-popup-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      this._clearAutoCloseTimer();
      if (this._dialog === dialog) { this._dialog = null; this._innerCard = null; }
      dialog.remove();
    }, { once: true });
    document.body.appendChild(dialog);
    this._dialog = dialog;
    try {
      dialog.showModal();
      const configuredMinutes = Number(this._config.popup_auto_close_minutes ?? 2);
      const autoCloseMinutes = Number.isFinite(configuredMinutes) ? Math.max(0, configuredMinutes) : 2;
      if (autoCloseMinutes > 0) {
        const delayMs = Math.min(autoCloseMinutes * 60_000, 2_147_483_647);
        this._autoCloseTimer = window.setTimeout(() => {
          this._autoCloseTimer = null;
          if (this._dialog === dialog && dialog.open) dialog.close();
        }, delayMs);
      }
    } catch (error) { this._close(); console.error('Streaming Browser popup:', error); }
  }
}

class StreamingBrowserPopupCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._v2Editor = null;
  }
  setConfig(config) {
    const next={...config};
    const changed=JSON.stringify(next)!==JSON.stringify(this._config);
    this._config=next;
    // Ignore unchanged HA config echoes and preserve any active popup or
    // embedded V2 dropdown instead of replacing the editor subtree.
    if(!this._v2Editor||(changed&&!this.matches(':focus-within')))this._render();
  }
  set hass(value) { this._hass = value; if (this._v2Editor) this._v2Editor.hass = value; }
  _changed(patch) {
    this._config = { ...this._config, ...patch, type: SB_POPUP_TYPE };
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...this._config } }, bubbles: true, composed: true,
    }));
  }
  _render() {
    if (!this._config) return;
    const config = this._config;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .sb-popup-editor { padding: 12px 0; display: grid; gap: 12px; }
        label { display: grid; gap: 5px; font-size: 14px; color: var(--primary-text-color); }
        input, select { box-sizing: border-box; width: 100%; min-height: 38px;
          border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 9px;
          background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
        .check { display: flex; align-items: center; gap: 8px; }
        .check input { width: auto; min-height: 0; }
        h3 { margin: 12px 0 0; font-size: 15px; }
      </style>
      <div class="sb-popup-editor">
      <label>Popup button appearance <select data-key="button_display">
        <option value="horizontal" ${!config.button_display || config.button_display === 'horizontal' ? 'selected' : ''}>Horizontal logo</option>
        <option value="vertical" ${config.button_display === 'vertical' ? 'selected' : ''}>Vertical logo</option>
        <option value="icon_only" ${config.button_display === 'icon_only' ? 'selected' : ''}>Icon-only logo</option>
        <option value="icon_text" ${config.button_display === 'icon_text' ? 'selected' : ''}>MDI icon + text</option>
      </select></label>
      <label>Button label <input data-key="button_label" value="${sbPopupEscape(config.button_label ?? 'Streaming')}"></label>
        <label>Button icon (MDI) <input data-key="button_icon" value="${sbPopupEscape(config.button_icon || 'mdi:movie-open')}"></label>
        <label class="check"><input type="checkbox" data-key="button_show_label"
          ${config.button_show_label !== false ? 'checked' : ''}>Show button label</label>
        <label>Auto-close after (minutes; 0 = manual close)
          <input type="number" min="0" step="1" data-key="popup_auto_close_minutes"
            value="${sbPopupEscape(config.popup_auto_close_minutes ?? 2)}">
        </label>
        <label>Popup size <select data-key="popup_width">
          <option value="normal" ${config.popup_width === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="wide" ${!config.popup_width || config.popup_width === 'wide' ? 'selected' : ''}>Wide</option>
          <option value="fullscreen" ${config.popup_width === 'fullscreen' ? 'selected' : ''}>Full screen</option>
        </select></label>
        <h3>Streaming Browser V2 settings</h3><div id="v2-editor"></div>
      </div>`;
    for (const input of this.shadowRoot.querySelectorAll('[data-key]')) {
      input.addEventListener('change', () => this._changed({
        [input.dataset.key]: input.type === 'checkbox' ? input.checked
          : input.type === 'number' ? Number(input.value) : input.value,
      }));
    }
    const v2Editor = document.createElement('streaming-browser-card-v2-editor');
    this._v2Editor = v2Editor;
    v2Editor.hass = this._hass;
    v2Editor.setConfig({ ...this._config, type: SB_V2_TYPE });
    v2Editor.addEventListener('config-changed', (event) => {
      event.stopPropagation();
      const next = { ...event.detail.config, type: SB_POPUP_TYPE };
      for (const key of SB_POPUP_KEYS) next[key] = this._config[key];
      this._changed(next);
    });
    this.shadowRoot.getElementById('v2-editor').appendChild(v2Editor);
  }
}

if (!customElements.get('streaming-browser-popup-card'))
  customElements.define('streaming-browser-popup-card', StreamingBrowserPopupCard);
if (!customElements.get('streaming-browser-popup-card-editor'))
  customElements.define('streaming-browser-popup-card-editor', StreamingBrowserPopupCardEditor);
window.customCards = Array.isArray(window.customCards) ? window.customCards : [];
const sbPopupPicker = {
  type: 'streaming-browser-popup-card',
  name: 'Streaming Browser Popup Button',
  description: 'Compact button that opens the full Streaming Browser V2 in a popup.',
  preview: false,
  documentationURL: 'https://github.com/fVaqueroG/streaming-browser--card',
};
const sbPopupExisting = window.customCards.find((entry) => entry?.type === sbPopupPicker.type);
if (sbPopupExisting) Object.assign(sbPopupExisting, sbPopupPicker);
else window.customCards.push(sbPopupPicker);


/* Popup remote foreground bridge v1 */
function sbRemoteForeground(popup) {
  let portal=null, attributes=null, top=null, stopped=false;
  const card=()=>popup._innerCard;
  const find=()=>card()?._remotePortal || null;
  function dismiss() {
    const dialog=top; top=null;
    if (!dialog) return;
    if (portal?.parentNode===dialog && portal.isConnected) document.body.appendChild(portal);
    if (dialog.open) dialog.close();
    dialog.remove();
  }
  function sync() {
    if (stopped) return;
    const found=find();
    if (found!==portal) {
      attributes?.disconnect();
      dismiss();
      portal=found;
      if (portal) {
        attributes=new MutationObserver(sync);
        attributes.observe(portal,{attributes:true,attributeFilter:['hidden','style','class','aria-hidden']});
      }
    }
    if (!portal?.isConnected || portal.hidden || portal.getAttribute('aria-hidden')==='true' || getComputedStyle(portal).display==='none') {
      dismiss(); return;
    }
    if (top) return;
    const dialog=document.createElement('dialog');
    top=dialog;
    dialog.className='sb-remote-front-dialog';
    dialog.style.cssText='position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100dvh;max-width:100vw;max-height:100dvh;overflow:visible;background:transparent;color:inherit;';
    const style=document.createElement('style');
    style.textContent='.sb-remote-front-dialog::backdrop{background:transparent!important;backdrop-filter:none!important}';
    dialog.appendChild(style);
    dialog.addEventListener('cancel',event=>{
      event.preventDefault();
      const close=portal?.shadowRoot?.querySelector('.remote-close,.tp-remote-close,[aria-label="Close remote"],[aria-label="Close"]');
      if(close)close.click();
      else if(card()?._toggleRemote)card()._toggleRemote(false);
      else portal.hidden=true;
      queueMicrotask(sync);
    });
    const children=new MutationObserver(()=>queueMicrotask(sync));
    children.observe(dialog,{childList:true});
    dialog.addEventListener('close',()=>children.disconnect(),{once:true});
    document.body.appendChild(dialog);
    dialog.appendChild(portal);
    try { dialog.showModal(); }
    catch(error) { dismiss(); console.error('Streaming Browser remote foreground:',error); }
  }
  const body=new MutationObserver(sync);
  body.observe(document.body,{childList:true});
  const onClick=()=>queueMicrotask(sync);
  document.addEventListener('click',onClick,true);
  const onClose=()=>cleanup();
  popup._dialog?.addEventListener('close',onClose,{once:true});
  function cleanup() {
    if(stopped)return;
    stopped=true;
    attributes?.disconnect(); body.disconnect();
    document.removeEventListener('click',onClick,true);
    popup._dialog?.removeEventListener('close',onClose);
    dismiss();
  }
  sync();
  return cleanup;
}
const sbPopupOpenForeground=StreamingBrowserPopupCard.prototype._open;
StreamingBrowserPopupCard.prototype._open=function(...args) {
  const result=sbPopupOpenForeground.apply(this,args);
  if(this._dialog?.open && !this._remoteForegroundCleanup)
    this._remoteForegroundCleanup=sbRemoteForeground(this);
  return result;
};
const sbPopupCloseForeground=StreamingBrowserPopupCard.prototype._close;
StreamingBrowserPopupCard.prototype._close=function(...args) {
  this._remoteForegroundCleanup?.();this._remoteForegroundCleanup=null;
  return sbPopupCloseForeground.apply(this,args);
};

/* Streaming Browser v0.4.146: native Back and popup teardown without synthetic navigation. */
(() => {
  const Full = customElements.get('streaming-browser-card-v2');
  const Popup = customElements.get('streaming-browser-popup-card');
  if (!Full || !Popup) throw new Error('Streaming Browser Back: cards unavailable');
  const mobile = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches;
  const manager = window.__fvHaCardBackManagerV3 ||= (() => {
    const owners = [];
    const key = '__fvCardBackV3';
    const token = 'fv-' + Math.random().toString(36).slice(2);
    let page = '', lastPress = 0;
    const stamped = () => history.state?.[key] === token;
    const push = () => history.pushState({ ...(history.state || {}), [key]: token }, '', page);
    // Android can dispatch dialog cancellation instead of browser navigation.
    // Never issue history.back() from cancel or teardown: one press must not
    // become a second, app-exiting navigation.
    function onPop(event) {
      if (!owners.length || location.href !== page) return;
      event.stopImmediatePropagation();
      // Restore the spare same-page entry BEFORE a synchronous re-render can
      // remove the last owner (details, Catalog and remote loading included).
      try { if (stamped()) push(); else { push(); push(); } }
      catch (error) { console.warn('Card Back: could not restore history guard', error); }
      const now = Date.now();
      if (now - lastPress < 180) return;
      lastPress = now;
      owners[owners.length - 1]?.back();
    }
    return {
      add(owner) {
        if (!mobile() || owners.includes(owner)) return;
        if (!owners.length) {
          page = location.href;
          window.addEventListener('popstate', onPop, true);
          try { if (stamped()) push(); else { push(); push(); } }
          catch (error) { console.warn('Card Back: history guard unavailable', error); }
        }
        owners.push(owner);
      },
      remove(owner) {
        const index = owners.indexOf(owner);
        if (index < 0) return;
        owners.splice(index, 1);
        // Do not navigate Home Assistant just to remove our history guard.
        if (!owners.length) window.removeEventListener('popstate', onPop, true);
      },
      request(owner) {
        if (owners[owners.length - 1] !== owner) return false;
        const now = Date.now();
        if (now - lastPress < 180) return true;
        lastPress = now;
        owner.back(); // Native dialog cancellation is already a Back event.
        return true;
      }
    };
  })();
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
