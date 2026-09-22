/* Streaming Browser branding extension.
 * Uses the approved transparent-background PNG logo set created for Streaming Browser.
 * Assets ship with the integration and are served locally by Home Assistant.
 * Explicit custom logo URLs remain supported.
 */
(() => {
  const Card = customElements.get('streaming-browser-card-v2');
  const Popup = customElements.get('streaming-browser-popup-card');
  const Editor = customElements.get('streaming-browser-popup-card-editor');
  if (!Card || !Popup || !Editor || window.__streamingBrowserLogoBranding) return;
  window.__streamingBrowserLogoBranding = true;

  const HORIZONTAL = '/streaming_browser/assets/streaming-browser-horizontal.png?v=0.4.117';
  const VERTICAL = '/streaming_browser/assets/streaming-browser-vertical.png?v=0.4.117';
  const ICON = '/streaming_browser/assets/streaming-browser-icon.png?v=0.4.117';
  const asset = (config, kind) => {
    const name = kind === 'vertical' ? 'vertical' : kind === 'icon' ? 'icon' : 'horizontal';
    const defaults = { horizontal: HORIZONTAL, vertical: VERTICAL, icon: ICON };
    // Old custom URLs still work, but no URL or /config/www image is required.
    return String(config?.[`logo_${name}_url`] || defaults[name]).trim();
  };
  const makeImage = (config, kind, className) => {
    const image = document.createElement('img');
    image.className = className;
    image.src = asset(config, kind);
    image.alt = 'Streaming Browser';
    image.loading = 'eager';
    image.decoding = 'async';
    return image;
  };
  const style = (root, css) => {
    const s = document.createElement('style');
    s.textContent = css;
    root.appendChild(s);
  };

  // This hooks the V2 markup commit, not its catalog, filters, playback or remote.
  // The version badge is preserved; missing logos retain the original title.
  const commit = Card.prototype._v2CommitMainMarkup;
  if (typeof commit === 'function') {
    Card.prototype._v2CommitMainMarkup = function (...args) {
      const result = commit.apply(this, args);
      const heading = this.shadowRoot?.querySelector('.top > .title');
      if (!heading || heading.querySelector('.sb-brand-horizontal')) return result;
      const version = heading.querySelector('.card-version');
      const fallback = document.createElement('span');
      fallback.textContent = this._config?.title || 'Streaming Browser';
      fallback.className = 'sb-brand-fallback';
      const logo = makeImage(this._config, 'horizontal', 'sb-brand-horizontal');
      logo.addEventListener('load', () => { fallback.hidden = true; });
      logo.addEventListener('error', () => { logo.hidden = true; fallback.hidden = false; });
      heading.replaceChildren(logo, fallback);
      if (version) heading.appendChild(version);
      style(this.shadowRoot, `
        .top > .title { display:flex; align-items:center; flex-wrap:nowrap; gap:7px; min-width:0; }
        .top > .title .sb-brand-horizontal { display:block; width:clamp(115px,18vw,230px);
          height:46px; max-width:100%; object-fit:contain; object-position:center; }
        .top > .title .sb-brand-horizontal[hidden],
        .top > .title .sb-brand-fallback[hidden] { display:none; }
        .top > .title .card-version { flex:0 0 auto; }
        @media (max-width:600px) {
          .top > .title .sb-brand-horizontal { width:clamp(95px,30vw,165px); height:38px; }
        }
      `);
      return result;
    };
  }

  // The popup header uses the same horizontal logo as the full-size card.
  const open = Popup.prototype._open;
  Popup.prototype._open = function (...args) {
    const result = open.apply(this, args);
    const dialog = this._dialog;
    const heading = dialog?.querySelector('.sb-popup-heading');
    if (heading && !heading.querySelector('.sb-popup-heading-logo')) {
      const fallback = document.createElement('span');
      fallback.textContent = 'Streaming Browser';
      const logo = makeImage(this._config, 'horizontal', 'sb-popup-heading-logo');
      logo.addEventListener('load', () => { fallback.hidden = true; });
      logo.addEventListener('error', () => { logo.hidden = true; fallback.hidden = false; });
      heading.replaceChildren(logo, fallback);
      style(dialog, `
        .sb-popup-heading { display:flex; align-items:center; min-width:0; }
        .sb-popup-heading-logo { display:block; width:190px; max-width:48vw; height:38px;
          object-fit:contain; object-position:center; }
        .sb-popup-heading-logo[hidden], .sb-popup-heading span[hidden] { display:none; }
      `);
    }
    return result;
  };

  // Four choices: vertical, horizontal, MDI icon + text, or logo-only mark.
  // Keep the original icon+text until an image actually loads, so a missing asset
  // never creates an empty or inaccessible button.
  const render = Popup.prototype._render;
  Popup.prototype._render = function (...args) {
    const result = render.apply(this, args);
    const mode = this._config?.button_display || 'horizontal';
    if (!['vertical', 'horizontal', 'icon_only'].includes(mode)) return result;
    const button = this.shadowRoot?.querySelector('ha-card > button');
    if (!button) return result;
    const logo = makeImage(this._config, mode === 'icon_only' ? 'icon' : mode, 'sb-popup-button-logo');
    logo.addEventListener('load', () => {
      if (!logo.isConnected || !button.isConnected) return;
      button.replaceChildren(logo);
      button.classList.add('sb-popup-logo-ready');
    });
    logo.addEventListener('error', () => { logo.remove(); });
    button.appendChild(logo);
    button.dataset.logoMode = mode;
    style(this.shadowRoot, `
      button[data-logo-mode] { overflow:hidden; position:relative; }
      .sb-popup-button-logo { display:none; width:100%; object-fit:contain; object-position:center; }
      button.sb-popup-logo-ready { padding:4px 9px; }
      button.sb-popup-logo-ready .sb-popup-button-logo { display:block; }
      button[data-logo-mode="horizontal"].sb-popup-logo-ready { min-height:55px; }
      button[data-logo-mode="horizontal"] .sb-popup-button-logo { max-width:290px; height:45px; }
      button[data-logo-mode="vertical"].sb-popup-logo-ready { min-height:130px; }
      button[data-logo-mode="vertical"] .sb-popup-button-logo { width:150px; max-width:100%; height:120px; }
      button[data-logo-mode="icon_only"].sb-popup-logo-ready { min-height:60px; }
      button[data-logo-mode="icon_only"] .sb-popup-button-logo { width:105px; max-width:100%; height:50px; }
    `);
    return result;
  };

  // Additional popup-only controls, without replacing or disrupting the V2 editor.
  const editorRender = Editor.prototype._render;
  Editor.prototype._render = function (...args) {
    const result = editorRender.apply(this, args);
    const layout = this.shadowRoot?.querySelector('.sb-popup-editor');
    if (!layout || layout.querySelector('[data-sb-branding-editor]')) return result;
    const section = document.createElement('div');
    section.dataset.sbBrandingEditor = 'true';
    section.style.cssText = 'display:grid;gap:10px';
    const displayLabel = document.createElement('label');
    displayLabel.textContent = 'Popup button appearance';
    const select = document.createElement('select');
    const mode = this._config?.button_display || 'horizontal';
    for (const [value, name] of [
      ['vertical', 'Vertical logo'], ['horizontal', 'Horizontal logo'],
      ['icon_only', 'Icon-only logo'], ['icon_text', 'Icon + text'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = name;
      option.selected = mode === value;
      select.appendChild(option);
    }
    select.addEventListener('change', () => this._changed({ button_display: select.value }));
    displayLabel.appendChild(select);
    section.appendChild(displayLabel);
    for (const [key, name, placeholder] of [
      ['logo_horizontal_url', 'Horizontal logo URL', HORIZONTAL],
      ['logo_vertical_url', 'Vertical logo URL', VERTICAL],
      ['logo_icon_url', 'Icon-only logo URL', ICON],
    ]) {
      const label = document.createElement('label');
      label.textContent = name;
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = this._config?.[key] || '';
      input.addEventListener('change', () => this._changed({ [key]: input.value.trim() }));
      label.appendChild(input);
      section.appendChild(label);
    }
    layout.insertBefore(section, layout.firstChild);
    return result;
  };
})();
