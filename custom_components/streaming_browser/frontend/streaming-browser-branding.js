/* Streaming Browser Brand v1.0.0 — visual-only theme for V2, popup and editors.
 * This resource is already registered after the two card modules by the
 * Streaming Browser integration. Never change playback or saved card config.
 */
(() => {
  'use strict';
  if (globalThis.__streamingBrowserBrandV100) return;
  globalThis.__streamingBrowserBrandV100 = true;

  const ACCENT = '#8B5CF6';
  const cardTheme = `
    :host {
      --sb-accent: ${ACCENT};
      --sb-ink: #4B5563;
      --sb-line: color-mix(in srgb, var(--sb-accent) 24%, var(--divider-color, #E5E7EB));
      --sb-soft: color-mix(in srgb, var(--sb-accent) 9%, var(--card-background-color, #fff));
      --primary-color: var(--sb-accent);
      --mdc-theme-primary: var(--sb-accent);
      --ha-card-border-radius: 18px;
      font-family: var(--primary-font-family, system-ui, sans-serif);
    }
    ha-card {
      border: 1px solid var(--sb-line) !important;
      border-radius: 18px !important;
      box-shadow: 0 6px 24px rgb(17 24 39 / 7%);
    }
    .top, .detail-sticky-header {
      border-bottom: 1px solid var(--sb-line) !important;
    }
    .top { padding-block: 4px 12px; }
    .search, .profile-chip, .chip, .mini-btn, .action.secondary,
    .provider-card, .season-tab, .row-nav, select, input:not([type='checkbox']) {
      border-color: var(--sb-line) !important;
    }
    .search, select, input:not([type='checkbox']) {
      border-radius: 12px !important;
      accent-color: var(--sb-accent);
    }
    .search:focus-visible, button:focus-visible, a:focus-visible,
    select:focus-visible, input:focus-visible {
      outline: 2px solid var(--sb-accent) !important;
      outline-offset: 2px;
    }
    .chip.active, .profile-chip.active, .season-tab.active,
    button[aria-pressed='true'].row-nav {
      border-color: var(--sb-accent) !important;
      background: var(--sb-soft) !important;
      color: var(--primary-text-color, #4B5563) !important;
      box-shadow: inset 0 -2px 0 var(--sb-accent);
    }
    .mini-btn.title, .action:not(.secondary), .mini-btn.play {
      border-color: var(--sb-accent) !important;
      background: var(--sb-accent) !important;
      color: #fff !important;
    }
    .catalog-heading h3, .provider-title, .detail-sticky-title {
      letter-spacing: -.015em;
      font-weight: 700;
    }
    .poster-img-wrap, .provider-card, .episode-row-container,
    .detail, .poster-img { border-radius: 14px; }
    .poster:focus-visible .poster-img-wrap,
    .poster:hover .poster-img-wrap { outline: 2px solid var(--sb-accent); outline-offset: 2px; }
    .provider-offer-badge { border-color: var(--sb-line) !important; }
    .episode-row-container.selected { border-color: var(--sb-accent) !important; }
    .sbr-power-switch:checked + .sbr-power-track { background: var(--sb-accent) !important; }
    .card-version, .poster-meta { font-variant-numeric: tabular-nums; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
    }
  `;
  const popupTheme = `
    :host {
      --sb-accent: ${ACCENT};
      --sb-line: color-mix(in srgb, var(--sb-accent) 24%, var(--divider-color, #E5E7EB));
      --primary-color: var(--sb-accent);
    }
    ha-card { border: 1px solid var(--sb-line) !important; border-radius: 18px !important;
      box-shadow: 0 6px 24px rgb(17 24 39 / 7%); }
    button { border-radius: 16px !important; }
    button:hover { background: color-mix(in srgb, var(--sb-accent) 8%, var(--card-background-color, #fff)) !important; }
    button:focus-visible, select:focus-visible, input:focus-visible {
      outline: 2px solid var(--sb-accent) !important; outline-offset: -2px; }
    input, select { accent-color: var(--sb-accent); border-color: var(--sb-line) !important; border-radius: 10px !important; }
    .sb-popup-editor h3 { color: var(--primary-text-color, #4B5563); }
  `;
  const editorTheme = `
    :host { --primary-color: ${ACCENT}; --mdc-theme-primary: ${ACCENT};
      --sb-line: color-mix(in srgb, ${ACCENT} 24%, var(--divider-color, #E5E7EB)); }
    .providers { border-top-color: var(--sb-line) !important; }
    button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid ${ACCENT} !important; outline-offset: 2px; }
  `;
  function installStyle(root, id, css) {
    if (!root || root.querySelector(`#${id}`)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    root.append(style);
  }
  function patchElement(name, css) {
    customElements.whenDefined(name).then(() => {
      const Klass = customElements.get(name);
      if (!Klass || Klass.prototype.__sbBrandPatched) return;
      Klass.prototype.__sbBrandPatched = true;
      const original = Klass.prototype._render;
      if (typeof original !== 'function') return;
      Klass.prototype._render = function (...args) {
        const result = original.apply(this, args);
        installStyle(this.shadowRoot, 'sb-brand-v100', css);
        return result;
      };
      // HA may instantiate cards before this final resource finishes loading.
      function retrofit(node) {
        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
        if (node.localName === name) installStyle(node.shadowRoot, 'sb-brand-v100', css);
        if (node.shadowRoot) retrofit(node.shadowRoot);
        node.querySelectorAll?.('*').forEach((child) => {
          if (child.localName === name) installStyle(child.shadowRoot, 'sb-brand-v100', css);
          if (child.shadowRoot) retrofit(child.shadowRoot);
        });
      }
      retrofit(document);
    });
  }
  patchElement('streaming-browser-card-v2', cardTheme);
  patchElement('streaming-browser-popup-card', popupTheme);
  patchElement('streaming-browser-card-v2-editor', editorTheme);
  patchElement('streaming-browser-popup-card-editor', popupTheme);
})();