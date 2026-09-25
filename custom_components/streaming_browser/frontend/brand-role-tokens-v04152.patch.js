/* Streaming Browser v0.4.152: formal Brand v1.0 palette role tokens. */
(() => {
  'use strict';
  if (window.__streamingBrowserBrandRolesV04152) return;
  window.__streamingBrowserBrandRolesV04152 = true;

  const PALETTE = Object.freeze({
    primaryAccent: '#8B5CF6',
    secondaryAccent: '#6F7DE8',
    softAccent: '#C7B8F8',
    deepBrand: '#182230',
    neutral: '#4B5563',
    lightNeutral: '#E5E7EB',
    background: '#F8F9FC',
    darkMode: '#101218',
    hoverFocus: '#9D78F8',
    pressedActive: '#7144DF',
  });

  function applyRoleTokens(target) {
    if (!target) return;
    const accent = target.style.getPropertyValue('--sb-accent')?.trim() || PALETTE.primaryAccent;

    // Formal palette roles from the finalized guide.
    target.style.setProperty('--sb-primary-accent', accent);
    target.style.setProperty('--sb-secondary-accent', PALETTE.secondaryAccent);
    target.style.setProperty('--sb-soft-accent', PALETTE.softAccent);
    target.style.setProperty('--sb-deep-brand', PALETTE.deepBrand);
    target.style.setProperty('--sb-neutral', PALETTE.neutral);
    target.style.setProperty('--sb-light-neutral', PALETTE.lightNeutral);
    target.style.setProperty('--sb-background', PALETTE.background);
    target.style.setProperty('--sb-dark-mode', PALETTE.darkMode);
    target.style.setProperty('--sb-hover-focus',
      accent === PALETTE.primaryAccent
        ? PALETTE.hoverFocus
        : `color-mix(in srgb, ${accent} 82%, white)`);
    target.style.setProperty('--sb-pressed-active',
      accent === PALETTE.primaryAccent
        ? PALETTE.pressedActive
        : `color-mix(in srgb, ${accent} 80%, ${PALETTE.darkMode})`);

    // Backward-compatible aliases used by v0.4.151 and older styling layers.
    target.style.setProperty('--sb-periwinkle', 'var(--sb-secondary-accent)');
    target.style.setProperty('--sb-lavender-mist', 'var(--sb-soft-accent)');
    target.style.setProperty('--sb-midnight-slate', 'var(--sb-deep-brand)');
    target.style.setProperty('--sb-slate-gray', 'var(--sb-neutral)');
    target.style.setProperty('--sb-cloud-gray', 'var(--sb-light-neutral)');
    target.style.setProperty('--sb-porcelain', 'var(--sb-background)');
    target.style.setProperty('--sb-near-black', 'var(--sb-dark-mode)');
    target.style.setProperty('--sb-accent-hover', 'var(--sb-hover-focus)');
    target.style.setProperty('--sb-accent-pressed', 'var(--sb-pressed-active)');
  }

  const ROLE_CSS = `
    :host {
      --sb-primary-accent: ${PALETTE.primaryAccent};
      --sb-secondary-accent: ${PALETTE.secondaryAccent};
      --sb-soft-accent: ${PALETTE.softAccent};
      --sb-deep-brand: ${PALETTE.deepBrand};
      --sb-neutral: ${PALETTE.neutral};
      --sb-light-neutral: ${PALETTE.lightNeutral};
      --sb-background: ${PALETTE.background};
      --sb-dark-mode: ${PALETTE.darkMode};
      --sb-hover-focus: ${PALETTE.hoverFocus};
      --sb-pressed-active: ${PALETTE.pressedActive};
    }
    .chip.active,.profile-chip.active,.season-tab.active,
    button[aria-pressed='true'] {
      border-color:var(--sb-primary-accent)!important;
      background:color-mix(in srgb,var(--sb-soft-accent) 34%,var(--card-background-color))!important;
    }
    .chip:hover,.profile-chip:hover,.season-tab:hover,.row-nav:hover,
    .provider-card:hover,.episode-row:hover {
      border-color:var(--sb-secondary-accent)!important;
    }
    .mini-btn.title,.mini-btn.play,.action:not(.secondary) {
      background:var(--sb-primary-accent)!important;
      border-color:var(--sb-primary-accent)!important;
    }
    .mini-btn.title:hover,.mini-btn.play:hover,.action:not(.secondary):hover {
      background:var(--sb-hover-focus)!important;
      border-color:var(--sb-hover-focus)!important;
    }
    .mini-btn.title:active,.mini-btn.play:active,.action:not(.secondary):active {
      background:var(--sb-pressed-active)!important;
      border-color:var(--sb-pressed-active)!important;
    }
  `;

  function styleOnce(root,id) {
    if (!root || root.querySelector('#'+id)) return;
    const style=document.createElement('style');
    style.id=id;
    style.textContent=ROLE_CSS;
    root.appendChild(style);
  }
  function apply(element) {
    applyRoleTokens(element);
    styleOnce(element?.shadowRoot,'sb-brand-role-tokens-v04152');
    if (element?._dialog) applyRoleTokens(element._dialog);
    if (element?._innerCard) apply(element._innerCard);
  }
  for (const name of [
    'streaming-browser-card-v2',
    'streaming-browser-popup-card',
    'streaming-browser-card-v2-editor',
    'streaming-browser-popup-card-editor',
  ]) {
    customElements.whenDefined(name).then(() => {
      const K=customElements.get(name);
      if (!K || K.prototype.__sbBrandRolesV04152) return;
      K.prototype.__sbBrandRolesV04152=true;
      const render=K.prototype._render;
      if (typeof render==='function') K.prototype._render=function(...args) {
        const result=render.apply(this,args);
        apply(this);
        return result;
      };
      const desc=Object.getOwnPropertyDescriptor(K.prototype,'hass');
      if (desc?.set) Object.defineProperty(K.prototype,'hass',{
        ...desc,
        set(value){desc.set.call(this,value);apply(this);}
      });
    });
  }

  customElements.whenDefined('streaming-browser-popup-card').then(() => {
    const P=customElements.get('streaming-browser-popup-card');
    if (P.prototype.__sbBrandRolesOpenV04152) return;
    P.prototype.__sbBrandRolesOpenV04152=true;
    const open=P.prototype._open;
    if (typeof open==='function') P.prototype._open=function(...args) {
      const result=open.apply(this,args);
      apply(this);
      return result;
    };
  });
})();
