/* Streaming Browser v0.4.151: corporate secondary palette + per-card accent picker. */
(() => {
  'use strict';
  if (window.__streamingBrowserCorporateV04151) return;
  window.__streamingBrowserCorporateV04151 = true;

  const BRAND = Object.freeze({
    accent: '#8B5CF6',
    accentHover: '#9D78F8',
    accentPressed: '#7144DF',
    periwinkle: '#6F7DE8',
    lavenderMist: '#C7B8F8',
    midnightSlate: '#182230',
    slateGray: '#4B5563',
    cloudGray: '#E5E7EB',
    porcelain: '#F8F9FC',
    nearBlack: '#101218',
  });
  const DEFAULT_RGB = Object.freeze([139, 92, 246]);
  const BASE_PROPERTIES = [
    '--card-background-color','--ha-card-background','--primary-background-color',
    '--secondary-background-color','--primary-text-color','--secondary-text-color',
    '--divider-color','--text-primary-color','--mdc-theme-surface'
  ];

  const clamp = value => Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  const hex2 = value => clamp(value).toString(16).padStart(2, '0').toUpperCase();
  function normalizeAccent(value) {
    if (Array.isArray(value) && value.length >= 3)
      return '#' + hex2(value[0]) + hex2(value[1]) + hex2(value[2]);
    if (value && typeof value === 'object' &&
        ['r','g','b'].every(key => Number.isFinite(Number(value[key]))))
      return '#' + hex2(value.r) + hex2(value.g) + hex2(value.b);
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(text))
      return '#' + [...text.slice(1)].map(ch => ch + ch).join('').toUpperCase();
    return BRAND.accent;
  }
  function accentRgb(value) {
    const hex = normalizeAccent(value);
    return [1,3,5].map(index => parseInt(hex.slice(index, index + 2), 16));
  }
  function accentInk(accent) {
    const rgb = accentRgb(accent).map(value => {
      const n = value / 255;
      return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return luminance > 0.52 ? BRAND.nearBlack : BRAND.porcelain;
  }
  function appearanceOf(element) {
    const value = element?._sbAppearancePreview ?? element?._config?.appearance ?? 'system';
    return ['light','dark','system'].includes(value) ? value : 'system';
  }
  function isDark(element) {
    const hass = element?._hass;
    if (typeof hass?.themes?.darkMode === 'boolean') return hass.themes.darkMode;
    if (typeof hass?.themes?.dark_mode === 'boolean') return hass.themes.dark_mode;
    return document.documentElement.classList.contains('dark') ||
      document.body?.classList.contains('dark') || false;
  }
  function resolvedMode(element) {
    const mode = appearanceOf(element);
    return mode === 'system' ? (isDark(element) ? 'dark' : 'light') : mode;
  }
  function accentOf(element) {
    return normalizeAccent(element?._config?.accent_color ?? element?._sbAccentPreview);
  }
  function setCorporateVariables(target, element = target) {
    if (!target) return;
    const accent = accentOf(element);
    const resolved = resolvedMode(element);
    const customAccent = accent !== BRAND.accent;
    const surfaces = resolved === 'dark' ? {
      '--card-background-color': BRAND.nearBlack,
      '--ha-card-background': BRAND.nearBlack,
      '--primary-background-color': BRAND.nearBlack,
      '--secondary-background-color': BRAND.midnightSlate,
      '--primary-text-color': BRAND.porcelain,
      '--secondary-text-color': BRAND.cloudGray,
      '--divider-color': BRAND.slateGray,
      '--text-primary-color': BRAND.porcelain,
      '--mdc-theme-surface': BRAND.nearBlack,
    } : {
      '--card-background-color': BRAND.porcelain,
      '--ha-card-background': BRAND.porcelain,
      '--primary-background-color': '#FFFFFF',
      '--secondary-background-color': `color-mix(in srgb, ${BRAND.lavenderMist} 18%, ${BRAND.porcelain})`,
      '--primary-text-color': BRAND.nearBlack,
      '--secondary-text-color': BRAND.slateGray,
      '--divider-color': BRAND.cloudGray,
      '--text-primary-color': BRAND.nearBlack,
      '--mdc-theme-surface': BRAND.porcelain,
    };

    // System keeps Home Assistant's own surfaces; explicit Light/Dark use the
    // corporate surface palette. Brand tokens and the chosen accent apply in all modes.
    if (appearanceOf(element) !== 'system')
      for (const [name,value] of Object.entries(surfaces)) target.style.setProperty(name,value);

    target.dataset.sbResolvedAppearance = resolved;
    target.style.setProperty('--sb-accent', accent);
    target.style.setProperty('--primary-color', accent);
    target.style.setProperty('--mdc-theme-primary', accent);
    target.style.setProperty('--sb-accent-hover', customAccent
      ? `color-mix(in srgb, ${accent} 82%, white)` : BRAND.accentHover);
    target.style.setProperty('--sb-accent-pressed', customAccent
      ? `color-mix(in srgb, ${accent} 80%, ${BRAND.nearBlack})` : BRAND.accentPressed);
    target.style.setProperty('--sb-accent-ink', accentInk(accent));
    target.style.setProperty('--sb-periwinkle', BRAND.periwinkle);
    target.style.setProperty('--sb-lavender-mist', BRAND.lavenderMist);
    target.style.setProperty('--sb-midnight-slate', BRAND.midnightSlate);
    target.style.setProperty('--sb-slate-gray', BRAND.slateGray);
    target.style.setProperty('--sb-cloud-gray', BRAND.cloudGray);
    target.style.setProperty('--sb-porcelain', BRAND.porcelain);
    target.style.setProperty('--sb-near-black', BRAND.nearBlack);
    target.style.setProperty('--sb-line',
      `color-mix(in srgb, ${BRAND.periwinkle} 30%, var(--divider-color, ${BRAND.cloudGray}))`);
    target.style.setProperty('--sb-soft',
      `color-mix(in srgb, ${BRAND.lavenderMist} 34%, var(--card-background-color, ${BRAND.porcelain}))`);
  }

  const CARD_CSS = `
    :host {
      --sb-accent: ${BRAND.accent};
      --sb-periwinkle: ${BRAND.periwinkle};
      --sb-lavender-mist: ${BRAND.lavenderMist};
      --sb-midnight-slate: ${BRAND.midnightSlate};
      --sb-slate-gray: ${BRAND.slateGray};
      --sb-cloud-gray: ${BRAND.cloudGray};
      --sb-porcelain: ${BRAND.porcelain};
      --sb-near-black: ${BRAND.nearBlack};
    }
    ha-card { border-color:var(--sb-line)!important; }
    .top,.detail-sticky-header,.provider-card,.episode-row-container,.season-tab,
    .chip,.profile-chip,.row-nav,.search,.genre-select,.mini-btn,.action {
      border-color:var(--sb-line)!important;
    }
    .chip.active,.profile-chip.active,.season-tab.active,
    button[aria-pressed='true'] {
      background:var(--sb-soft)!important;
      border-color:var(--sb-accent)!important;
    }
    .chip:hover,.profile-chip:hover,.season-tab:hover,.row-nav:hover,
    .provider-card:hover,.episode-row:hover {
      border-color:var(--sb-periwinkle)!important;
    }
    .mini-btn.title,.mini-btn.play,.action:not(.secondary) {
      background:var(--sb-accent)!important;
      border-color:var(--sb-accent)!important;
      color:var(--sb-accent-ink)!important;
    }
    .mini-btn.title:hover,.mini-btn.play:hover,.action:not(.secondary):hover {
      background:var(--sb-accent-hover)!important;
      border-color:var(--sb-accent-hover)!important;
    }
    .mini-btn.title:active,.mini-btn.play:active,.action:not(.secondary):active {
      background:var(--sb-accent-pressed)!important;
      border-color:var(--sb-accent-pressed)!important;
    }
    .poster:focus-visible .poster-img-wrap,.poster:hover .poster-img-wrap {
      outline-color:var(--sb-periwinkle)!important;
    }
    .provider-offer-badge { border-color:var(--sb-lavender-mist)!important; }
    .sbr-remote {
      background:var(--sb-near-black)!important;
      color:var(--sb-porcelain)!important;
      border-color:var(--sb-slate-gray)!important;
    }
    .sbr-remote button { color:var(--sb-porcelain)!important; }
    .sbr-pad {
      background:radial-gradient(circle at center,
        var(--sb-midnight-slate) 0 34%,var(--sb-near-black) 35% 100%)!important;
      box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--sb-periwinkle) 35%,transparent)!important;
    }
    .sbr-pad .sbr-ok {
      background:color-mix(in srgb,var(--sb-accent) 14%,var(--sb-midnight-slate))!important;
    }
  `;
  const POPUP_CSS = `
    ha-card { border-color:var(--sb-line)!important; }
    button:hover { background:var(--sb-soft)!important; }
    button:focus-visible { outline-color:var(--sb-accent)!important; }
    ha-icon { color:var(--sb-accent)!important; }
  `;
  const EDITOR_CSS = `
    :host { --primary-color:var(--sb-accent,${BRAND.accent})!important;
      --mdc-theme-primary:var(--sb-accent,${BRAND.accent})!important; }
    input,select,button { accent-color:var(--sb-accent,${BRAND.accent}); }
    input:focus-visible,select:focus-visible,button:focus-visible {
      outline:2px solid var(--sb-accent,${BRAND.accent})!important;
      outline-offset:2px;
    }
  `;
  const DIALOG_CSS = `
    .streaming-browser-popup-dialog {
      border:1px solid var(--sb-line)!important;
      background:var(--card-background-color)!important;
    }
    .sb-popup-header { border-bottom-color:var(--sb-line)!important; }
    .sb-popup-close:hover { background:var(--sb-soft)!important; }
    .sb-popup-close:focus-visible { outline-color:var(--sb-accent)!important; }
  `;
  function styleOnce(root,id,css) {
    if (!root || root.querySelector('#'+id)) return;
    const style=document.createElement('style');style.id=id;style.textContent=css;root.appendChild(style);
  }
  function applyCard(card) {
    setCorporateVariables(card,card);
    styleOnce(card.shadowRoot,'sb-corporate-v04151',CARD_CSS);
  }
  function applyPopup(popup) {
    setCorporateVariables(popup,popup);
    styleOnce(popup.shadowRoot,'sb-corporate-popup-v04151',POPUP_CSS);
    if (popup._innerCard) applyCard(popup._innerCard);
    if (popup._dialog) {
      setCorporateVariables(popup._dialog,popup);
      styleOnce(popup._dialog,'sb-corporate-dialog-v04151',DIALOG_CSS);
    }
  }
  function applyEditor(editor) {
    setCorporateVariables(editor,editor);
    styleOnce(editor.shadowRoot,'sb-corporate-editor-v04151',EDITOR_CSS);
  }
  function patchRender(name,apply) {
    customElements.whenDefined(name).then(() => {
      const K=customElements.get(name);
      if (!K || K.prototype.__sbCorporateV04151) return;
      K.prototype.__sbCorporateV04151=true;
      const render=K.prototype._render;
      if (typeof render==='function') K.prototype._render=function(...args) {
        const result=render.apply(this,args);apply(this);return result;
      };
      const desc=Object.getOwnPropertyDescriptor(K.prototype,'hass');
      if (desc?.set) Object.defineProperty(K.prototype,'hass',{
        ...desc,set(value){desc.set.call(this,value);apply(this);}
      });
    });
  }
  patchRender('streaming-browser-card-v2',applyCard);
  patchRender('streaming-browser-popup-card',applyPopup);
  patchRender('streaming-browser-card-v2-editor',applyEditor);
  patchRender('streaming-browser-popup-card-editor',applyEditor);

  customElements.whenDefined('streaming-browser-card-v2').then(() => {
    const K=customElements.get('streaming-browser-card-v2');
    if (!K.__sbAccentFormV04151) {
      K.__sbAccentFormV04151=true;
      const getForm=K.getConfigForm;
      K.getConfigForm=function(...args) {
        const form=getForm.apply(this,args);
        const general=Array.isArray(form?.schema)
          ? form.schema.find(item => item.title==='General') : null;
        if (general?.schema && !general.schema.some(item => item.name==='accent_color')) {
          const appearanceIndex=general.schema.findIndex(item => item.name==='appearance');
          general.schema.splice(appearanceIndex >= 0 ? appearanceIndex + 1 : 1,0,{
            name:'accent_color',
            selector:{color_rgb:{}}
          });
        }
        const computeLabel=form?.computeLabel;
        const computeHelper=form?.computeHelper;
        if (typeof computeLabel==='function') form.computeLabel=schema =>
          schema?.name==='accent_color' ? 'Accent color' : computeLabel(schema);
        if (typeof computeHelper==='function') form.computeHelper=schema =>
          schema?.name==='accent_color'
            ? 'Soft Iris is the brand default. This changes the card accent only.'
            : computeHelper(schema);
        return form;
      };
    }
  });

  customElements.whenDefined('streaming-browser-card-v2-editor').then(() => {
    const E=customElements.get('streaming-browser-card-v2-editor');
    if (!E.prototype.__sbAccentDefaultV04151) {
      E.prototype.__sbAccentDefaultV04151=true;
      const setConfig=E.prototype.setConfig;
      E.prototype.setConfig=function(config) {
        const next={...config};
        if (next.accent_color == null) next.accent_color=[...DEFAULT_RGB];
        return setConfig.call(this,next);
      };
    }
  });

  customElements.whenDefined('streaming-browser-popup-card').then(() => {
    const P=customElements.get('streaming-browser-popup-card');
    if (!P.prototype.__sbCorporateOpenV04151) {
      P.prototype.__sbCorporateOpenV04151=true;
      const open=P.prototype._open;
      P.prototype._open=function(...args) {
        const result=open.apply(this,args);
        applyPopup(this);
        return result;
      };
    }
  });
})();
