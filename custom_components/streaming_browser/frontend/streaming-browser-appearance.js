/* Streaming Browser v0.4.132 — per-card appearance selector.
 * Loaded after the existing corporate-brand resource. It does not replace
 * approved logo PNGs, modify playback, or mutate Home Assistant's own theme.
 */
(() => {
  'use strict';
  if (window.__streamingBrowserAppearanceV04132) return;
  window.__streamingBrowserAppearanceV04132 = true;

  const MODES = ['light', 'dark', 'system'];
  const ACCENT = '#8B5CF6';
  const LABELS = {light:'Light', dark:'Dark', system:'System'};
  const PROPERTIES = [
    '--card-background-color', '--ha-card-background', '--secondary-background-color',
    '--primary-background-color', '--primary-text-color', '--secondary-text-color',
    '--divider-color', '--text-primary-color', '--mdc-theme-surface'
  ];
  function modeOf(element) {
    const raw = element?._sbAppearancePreview ?? element?._config?.appearance ?? 'system';
    return MODES.includes(raw) ? raw : 'system';
  }
  function haIsDark(hass) {
    if (typeof hass?.themes?.darkMode === 'boolean') return hass.themes.darkMode;
    if (typeof hass?.themes?.dark_mode === 'boolean') return hass.themes.dark_mode;
    // If HA does not expose darkMode yet, retain HA's document appearance.
    return document.documentElement.classList.contains('dark') ||
      document.body?.classList.contains('dark') || false;
  }
  function palette(mode, hass) {
    if (mode === 'system') return {name: haIsDark(hass) ? 'dark' : 'light', values: null};
    if (mode === 'dark') return {name:'dark', values: {
      '--card-background-color':'#151B2A', '--ha-card-background':'#151B2A',
      '--primary-background-color':'#0E1420', '--secondary-background-color':'#232B3C',
      '--primary-text-color':'#F4F4F8', '--secondary-text-color':'#B8C1D1',
      '--divider-color':'#45506A', '--text-primary-color':'#FFFFFF',
      '--mdc-theme-surface':'#151B2A'
    }};
    if (mode === 'light') return {name:'light', values: {
      '--card-background-color':'#FFFFFF', '--ha-card-background':'#FFFFFF',
      '--primary-background-color':'#F6F7FB', '--secondary-background-color':'#F0F2F7',
      '--primary-text-color':'#273244', '--secondary-text-color':'#626E7D',
      '--divider-color':'#D8DDE8', '--text-primary-color':'#FFFFFF',
      '--mdc-theme-surface':'#FFFFFF'
    }};
    // Legacy Original/unknown values follow Home Assistant instead of
  // restoring the removed light corporate theme.
  return {name: haIsDark(hass) ? 'dark' : 'light', values: null};
  }
  function setPalette(target, selected, hass) {
    if (!target) return;
    const colors = palette(selected, hass);
    target.dataset.sbAppearance = selected;
    target.dataset.sbResolvedAppearance = colors.name;
    for (const name of PROPERTIES) target.style.removeProperty(name);
    if (colors.values) for (const [name, value] of Object.entries(colors.values))
      target.style.setProperty(name, value);
    target.style.setProperty('--sb-accent', ACCENT);
    target.style.setProperty('--primary-color', ACCENT);
    target.style.setProperty('--mdc-theme-primary', ACCENT);
  }

  const CARD_CSS = `
    :host { --sb-accent: ${ACCENT}; color: var(--primary-text-color); }
    .sb-v2-header-logo, .provider-card img, .provider-item img,
    .provider-brand img, .chip img, img[src*="/streaming_browser/assets/streaming-browser-"] {
      background: transparent !important; background-color: transparent !important;
      box-shadow: none !important; padding: 0 !important;
    }
    ha-card, .detail, .detail-sticky-header, .top, .provider-card,
    .episode-inline-actions, .episode-row-container, .episode-list,
    .sbr-remote, .remote-panel { color: var(--primary-text-color); }
    ha-card, .detail { background: var(--card-background-color) !important; }
    .top, .detail-sticky-header { background: var(--card-background-color) !important; }
    .search, .genre-select, .chip, .mode, .profile-chip, .season-tab,
    .mini-btn, .provider-card, .episode-row, .row-nav {
      color: var(--primary-text-color);
    }
    .sb-appearance-control {
      box-sizing: border-box; display: inline-flex; align-items: center;
      gap: 6px; flex: 0 0 auto; min-width: 0;
      padding: 5px 8px; border: 1px solid var(--sb-line, var(--divider-color));
      border-radius: 12px; background: var(--secondary-background-color);
      color: var(--primary-text-color); font-size: 12px;
    }
    .sb-appearance-control ha-icon { --mdc-icon-size: 18px; color: var(--sb-accent); }
    .sb-appearance-select {
      width: auto; max-width: 106px; min-width: 75px; min-height: 30px;
      border: 0; border-radius: 8px; background: var(--secondary-background-color);
      color: var(--primary-text-color); font: inherit; cursor: pointer;
    }
    .sb-appearance-select:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
    .sb-appearance-select option { background: var(--card-background-color); color: var(--primary-text-color); }
    :host([data-sb-resolved-appearance='dark']) .hero {
      background-color: var(--secondary-background-color);
    }
    :host([data-sb-resolved-appearance='dark']) .hero-content {
      color: #FFFFFF; /* backdrop overlays must remain legible */
    }
    :host([data-sb-resolved-appearance='dark']) .mini-btn.play,
    :host([data-sb-resolved-appearance='dark']) .action:not(.secondary) {
      color: #FFFFFF !important;
    }
    @media (max-width: 600px) {
      .sb-appearance-control { padding: 3px 5px; }
      .sb-appearance-control ha-icon { --mdc-icon-size: 16px; }
      .sb-appearance-select { min-width: 68px; max-width: 87px; }
    }
  `;
  const POPUP_CSS = `
    :host { --sb-accent: ${ACCENT}; color: var(--primary-text-color); }
    .sb-popup-button-logo, img[src*="/streaming_browser/assets/streaming-browser-"] {
      background: transparent !important; background-color: transparent !important;
      box-shadow: none !important; padding: 0 !important;
    }
    ha-card { background: var(--card-background-color) !important; color: var(--primary-text-color); }
    button, select, input { color: var(--primary-text-color); }
  `;
  const EDITOR_CSS = `
    :host { --sb-accent: ${ACCENT}; }
    select:focus-visible, input:focus-visible { outline: 2px solid var(--sb-accent); }
  `;
  const DIALOG_CSS = `
    .streaming-browser-popup-dialog {
      color: var(--primary-text-color) !important;
      background: var(--card-background-color) !important;
      border: 1px solid color-mix(in srgb, ${ACCENT} 25%, var(--divider-color)) !important;
    }
    .sb-popup-header { color: var(--primary-text-color); background: var(--card-background-color);
      border-bottom-color: var(--divider-color) !important; }
    .sb-popup-close { color: var(--primary-text-color); }
    .sb-popup-close:hover { background: var(--secondary-background-color); }
  `;
  function styleOnce(root, id, css) {
    if (!root || root.querySelector('#' + id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    root.appendChild(style);
  }
  function applyCard(card) {
    setPalette(card, modeOf(card), card._hass);
    styleOnce(card.shadowRoot, 'sb-appearance-v04132', CARD_CSS);
    const top = card.shadowRoot?.querySelector('.top');
    if (!top) return;
    let control = top.querySelector('.sb-appearance-control');
    if (!control) {
      control = document.createElement('label');
      control.className = 'sb-appearance-control';
      control.title = 'Appearance (save the default in Edit card)';
      control.innerHTML = '<ha-icon icon="mdi:theme-light-dark" aria-hidden="true"></ha-icon>' +
        '<select class="sb-appearance-select" aria-label="Streaming Browser appearance">' +
        MODES.map(m => `<option value="${m}">${LABELS[m]}</option>`).join('') +
        '</select>';
      top.insertBefore(control, top.querySelector('.search'));
      control.querySelector('select').addEventListener('change', (event) => {
        card._sbAppearancePreview = event.target.value;
        applyCard(card);
        card.dispatchEvent(new CustomEvent('sb-appearance-changed', {
          bubbles: true, composed: true, detail: {appearance: modeOf(card)}
        }));
      });
    }
    const select = control.querySelector('select');
    if (select && select.value !== modeOf(card)) select.value = modeOf(card);
  }
  function applyPopup(popup) {
    setPalette(popup, modeOf(popup), popup._hass);
    styleOnce(popup.shadowRoot, 'sb-popup-appearance-v04132', POPUP_CSS);
    if (popup._dialog) {
      setPalette(popup._dialog, modeOf(popup), popup._hass);
      styleOnce(popup._dialog, 'sb-popup-dialog-appearance-v04132', DIALOG_CSS);
    }
    if (popup._innerCard && !popup._innerCard._sbAppearancePreview)
      applyCard(popup._innerCard);
  }
  function applyEditor(editor) {
    setPalette(editor, modeOf(editor), editor._hass);
    styleOnce(editor.shadowRoot, 'sb-editor-appearance-v04132', EDITOR_CSS);
  }
  function patchRender(name, apply) {
    customElements.whenDefined(name).then(() => {
      const K = customElements.get(name);
      if (!K || K.prototype.__sbAppearancePatched) return;
      K.prototype.__sbAppearancePatched = true;
      const original = K.prototype._render;
      if (typeof original === 'function') K.prototype._render = function(...args) {
        const result = original.apply(this, args);
        try { apply(this); } catch (error) {
          console.warn('Streaming Browser: optional theme rendering failed', error);
        }
        return result;
      };
      // Home Assistant may already have created the card before this resource loaded.
      function visit(root) {
        if (!root?.querySelectorAll) return;
        for (const node of root.querySelectorAll(name)) apply(node);
        for (const node of root.querySelectorAll('*')) if (node.shadowRoot) visit(node.shadowRoot);
      }
      visit(document);
    });
  }
  patchRender('streaming-browser-card-v2', applyCard);
  patchRender('streaming-browser-popup-card', applyPopup);
  patchRender('streaming-browser-card-v2-editor', applyEditor);
  patchRender('streaming-browser-popup-card-editor', applyEditor);

  customElements.whenDefined('streaming-browser-card-v2').then(() => {
    const K = customElements.get('streaming-browser-card-v2');
    // Add to the existing HA visual editor, not a separate unsaved local control.
    const getForm = K.getConfigForm;
    if (typeof getForm === 'function' && !K.__sbAppearanceFormPatched) {
      K.__sbAppearanceFormPatched = true;
      K.getConfigForm = function(...args) {
        const form = getForm.apply(this, args);
        const groups = form?.schema;
        const general = Array.isArray(groups) && groups.find(x => x.title === 'General');
        if (general?.schema && !general.schema.some(x => x.name === 'appearance')) {
          general.schema.splice(1, 0, {
            name: 'appearance',
            selector: {select: {mode: 'dropdown', options: [
              {value:'light', label:'Light'},
              {value:'dark', label:'Dark'},
              {value:'system', label:'System · Follow Home Assistant'}
            ]}}
          });
        }
        return form;
      };
    }
    // HA hands each card its hass instance on settings/theme changes.
    const desc = Object.getOwnPropertyDescriptor(K.prototype, 'hass');
    if (desc?.set && !K.prototype.__sbAppearanceHassPatched) {
      K.prototype.__sbAppearanceHassPatched = true;
      Object.defineProperty(K.prototype, 'hass', {
        ...desc, set(value) {
        desc.set.call(this, value);
        try { applyCard(this); } catch (error) {
          console.warn('Streaming Browser: optional card theme failed', error);
        }
      }
      });
    }
  });
  customElements.whenDefined('streaming-browser-popup-card').then(() => {
    const K = customElements.get('streaming-browser-popup-card');
    const desc = Object.getOwnPropertyDescriptor(K.prototype, 'hass');
    if (desc?.set && !K.prototype.__sbAppearanceHassPatched) {
      K.prototype.__sbAppearanceHassPatched = true;
      Object.defineProperty(K.prototype, 'hass', {
        ...desc, set(value) {
        desc.set.call(this, value);
        try { applyPopup(this); } catch (error) {
          console.warn('Streaming Browser: optional popup theme failed', error);
        }
      }
      });
    }
    const open = K.prototype._open;
    if (typeof open === 'function' && !K.prototype.__sbAppearanceOpenPatched) {
      K.prototype.__sbAppearanceOpenPatched = true;
      K.prototype._open = function(...args) {
      const result = open.apply(this, args);
      try {
        applyPopup(this);
        if (this._dialog && !this._dialog.__sbThemeListener) {
          this._dialog.__sbThemeListener = true;
          this._dialog.addEventListener('sb-appearance-changed', event => {
            this._sbAppearancePreview = event.detail.appearance;
            try { applyPopup(this); } catch (error) {
              console.warn('Streaming Browser: popup theme preview failed', error);
            }
          });
        }
      } catch (error) {
        console.warn('Streaming Browser: optional popup theme failed', error);
      }
      return result;
    };
    }
  });
})();
