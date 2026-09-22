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
  horizontal: '/streaming_browser/assets/streaming-browser-horizontal.png?v=0.4.123',
  vertical: '/streaming_browser/assets/streaming-browser-vertical.png?v=0.4.123',
  icon_only: '/streaming_browser/assets/streaming-browser-icon.png?v=0.4.123',
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
        :host { display: block; }
        ha-card { overflow: hidden; height: 100%; }
        button { width: 100%; min-height: 52px; padding: 8px 14px; display: flex;
          align-items: center; justify-content: center; gap: 10px; cursor: pointer;
          background: transparent; border: 0; color: var(--primary-text-color);
          font: inherit; font-weight: 500; }
        button:hover { background: var(--secondary-background-color); }
        button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
        .sb-popup-button-logo { display:none; max-width:100%; width:330px;
        height:66px; object-fit:contain; object-position:center; }
      button.sb-popup-logo-ready { min-height:78px; padding:5px 10px; gap:0; }
      button.sb-popup-logo-ready .sb-popup-button-logo { display:block; }
      button[data-logo-mode="vertical"].sb-popup-logo-ready { min-height:120px; }
      button[data-logo-mode="vertical"] .sb-popup-button-logo { width:190px; height:110px; }
      button[data-logo-mode="icon_only"].sb-popup-logo-ready { min-height:64px; }
      button[data-logo-mode="icon_only"] .sb-popup-button-logo { width:110px; height:55px; }
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
          box-shadow: 0 16px 60px #0006; width: min(96vw, 1180px);
          max-width: 96vw; height: min(92dvh, 1050px); max-height: 92dvh; }
        .streaming-browser-popup-dialog[data-size="normal"] { width: min(96vw, 850px); }
        .streaming-browser-popup-dialog[data-size="fullscreen"] { width: 100vw;
          max-width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; }
        .streaming-browser-popup-dialog::backdrop { background: #0009; }
        .sb-popup-layout { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .sb-popup-header { display: flex; align-items: center; justify-content: space-between;
          flex: 0 0 auto; padding: 8px 12px 8px 18px; min-height: 40px;
          border-bottom: 1px solid var(--divider-color, #8884); }
        .sb-popup-heading { font: inherit; font-size: 16px; font-weight: 600; }
      .sb-popup-heading-logo { display:block; width:330px; max-width:56vw;
                  height:65px; object-fit:contain; object-position:left center; }
      .sb-popup-heading-logo[hidden], .sb-popup-heading span[hidden] { display:none; }
        .sb-popup-close { width: 40px; height: 40px; display: grid; place-items: center;
          cursor: pointer; border: 0; border-radius: 50%; color: var(--primary-text-color);
          background: transparent; }
        .sb-popup-close:hover { background: var(--secondary-background-color); }
        .sb-popup-close:focus-visible { outline: 2px solid var(--primary-color); }
        .sb-popup-content { flex: 1 1 auto; min-height: 0; overflow: auto;
          overscroll-behavior: contain; }
        .sb-popup-content > streaming-browser-card-v2 { display: block; min-height: 100%; }
        .sb-popup-error { padding: 20px; }
        @media (max-width: 600px) {
          .streaming-browser-popup-dialog { width: 100vw !important; max-width: 100vw;
            height: 100dvh; max-height: 100dvh; border-radius: 0; }
        }
      </style>
      <div class="sb-popup-layout">
        <header class="sb-popup-header"><span class="sb-popup-heading">Streaming Browser</span>
          <button type="button" class="sb-popup-close" aria-label="Close Streaming Browser"
            title="Close"><ha-icon icon="mdi:close"></ha-icon></button></header>
        <main class="sb-popup-content"></main>
      </div>`;
    // The popup heading uses the transparent horizontal logo, independent of
  // when the optional branding frontend resource happens to load.
  const heading = dialog.querySelector('.sb-popup-heading');
  const headingLogo = document.createElement('img');
  const headingFallback = document.createElement('span');
  headingLogo.className = 'sb-popup-heading-logo';
  headingLogo.alt = 'Streaming Browser';
  headingFallback.textContent = this._config.title || 'Streaming Browser';
  headingLogo.addEventListener('load', () => { headingFallback.hidden = true; });
  headingLogo.addEventListener('error', () => { headingLogo.hidden = true; });
  heading.replaceChildren(headingLogo, headingFallback);
  headingLogo.src = String(this._config.logo_horizontal_url || SB_POPUP_LOGOS.horizontal);
  const content = dialog.querySelector('.sb-popup-content');
    const v2Class = customElements.get('streaming-browser-card-v2');
    if (v2Class) {
      const card = document.createElement('streaming-browser-card-v2');
      const cardConfig = { ...this._config, type: SB_V2_TYPE };
      for (const key of SB_POPUP_KEYS) delete cardConfig[key];
      card.setConfig(cardConfig);
      card.hass = this._hass;
      content.appendChild(card);
      this._innerCard = card;
    } else {
      content.innerHTML = '<p class="sb-popup-error">Streaming Browser V2 is not loaded. Reload the Home Assistant dashboard.</p>';
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
  setConfig(config) { this._config = { ...config }; this._render(); }
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
