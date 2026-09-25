/* Streaming Browser v0.4.153: alternative accent palette presets. */
(() => {
  'use strict';
  if (window.__streamingBrowserAccentPresetsV04153) return;
  window.__streamingBrowserAccentPresetsV04153 = true;

  const CORE = Object.freeze({
    neutralGray: '#4B5563',
    lightGray: '#E5E7EB',
    deepBrand: '#182230',
    background: '#F8F9FC',
    darkMode: '#101218',
  });
  const ACCENTS = Object.freeze({
    soft_iris: Object.freeze({label:'Soft Iris', hex:'#8B5CF6'}),
    ocean_blue: Object.freeze({label:'Ocean Blue', hex:'#3B82F6'}),
    teal_aqua: Object.freeze({label:'Teal Aqua', hex:'#14B8A6'}),
    emerald: Object.freeze({label:'Emerald', hex:'#10B981'}),
    coral: Object.freeze({label:'Coral', hex:'#F97366'}),
    amber: Object.freeze({label:'Amber', hex:'#F59E0B'}),
    rose: Object.freeze({label:'Rose', hex:'#EC4899'}),
  });
  const IRIS_COMPANIONS = Object.freeze({
    secondary:'#6F7DE8',
    soft:'#C7B8F8',
    hover:'#9D78F8',
    pressed:'#7144DF',
  });

  const clamp = value => Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  const hex2 = value => clamp(value).toString(16).padStart(2,'0').toUpperCase();
  function normalizeColor(value, fallback='#8B5CF6') {
    if (Array.isArray(value) && value.length >= 3)
      return '#' + hex2(value[0]) + hex2(value[1]) + hex2(value[2]);
    if (value && typeof value === 'object' &&
        ['r','g','b'].every(key => Number.isFinite(Number(value[key]))))
      return '#' + hex2(value.r) + hex2(value.g) + hex2(value.b);
    const text=String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(text))
      return '#' + [...text.slice(1)].map(ch=>ch+ch).join('').toUpperCase();
    return fallback;
  }
  function presetKey(config) {
    const value=String(config?.accent_preset || '').trim();
    return Object.hasOwn(ACCENTS,value) || value === 'custom' ? value : '';
  }
  function selectedAccent(config) {
    const preset=presetKey(config);
    if (preset && preset !== 'custom') return ACCENTS[preset].hex;
    return normalizeColor(config?.accent_color);
  }
  function inferPreset(config) {
    const explicit=presetKey(config);
    if (explicit) return explicit;
    if (config?.accent_color == null) return 'soft_iris';
    const current=normalizeColor(config.accent_color);
    const match=Object.entries(ACCENTS).find(([,entry])=>entry.hex === current);
    return match?.[0] || 'custom';
  }
  function relativeLuminance(hex) {
    const rgb=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255)
      .map(value=>value<=0.04045 ? value/12.92 : Math.pow((value+0.055)/1.055,2.4));
    return 0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2];
  }
  function readableInk(hex) {
    // Pick whichever of the brand dark/light neutrals gives better contrast.
    return relativeLuminance(hex) > 0.179 ? CORE.darkMode : CORE.background;
  }
  function companionColors(accent,preset) {
    if (preset === 'soft_iris') return IRIS_COMPANIONS;
    return {
      secondary:`color-mix(in srgb, ${accent} 78%, white)`,
      soft:`color-mix(in srgb, ${accent} 28%, ${CORE.background})`,
      hover:`color-mix(in srgb, ${accent} 82%, white)`,
      pressed:`color-mix(in srgb, ${accent} 80%, ${CORE.darkMode})`,
    };
  }
  function applyAccent(element, config = element?._config) {
    if (!element?.style) return;
    const preset=inferPreset(config);
    const accent=selectedAccent({...config,accent_preset:preset});
    const companions=companionColors(accent,preset);
    element.dataset.sbAccentPreset=preset;
    element.style.setProperty('--sb-accent',accent);
    element.style.setProperty('--sb-primary-accent',accent);
    element.style.setProperty('--primary-color',accent);
    element.style.setProperty('--mdc-theme-primary',accent);
    element.style.setProperty('--sb-secondary-accent',companions.secondary);
    element.style.setProperty('--sb-soft-accent',companions.soft);
    element.style.setProperty('--sb-hover-focus',companions.hover);
    element.style.setProperty('--sb-pressed-active',companions.pressed);
    element.style.setProperty('--sb-accent-hover','var(--sb-hover-focus)');
    element.style.setProperty('--sb-accent-pressed','var(--sb-pressed-active)');
    element.style.setProperty('--sb-accent-ink',readableInk(accent));

    // Alternative-accent guide keeps these core neutrals identical across presets.
    element.style.setProperty('--sb-neutral',CORE.neutralGray);
    element.style.setProperty('--sb-light-neutral',CORE.lightGray);
    element.style.setProperty('--sb-deep-brand',CORE.deepBrand);
    element.style.setProperty('--sb-background',CORE.background);
    element.style.setProperty('--sb-dark-mode',CORE.darkMode);

    // v0.4.151 aliases continue to resolve for older style layers.
    element.style.setProperty('--sb-periwinkle','var(--sb-secondary-accent)');
    element.style.setProperty('--sb-lavender-mist','var(--sb-soft-accent)');
    element.style.setProperty('--sb-slate-gray','var(--sb-neutral)');
    element.style.setProperty('--sb-cloud-gray','var(--sb-light-neutral)');
    element.style.setProperty('--sb-midnight-slate','var(--sb-deep-brand)');
    element.style.setProperty('--sb-porcelain','var(--sb-background)');
    element.style.setProperty('--sb-near-black','var(--sb-dark-mode)');
  }

  const CSS=`
    :host {
      --sb-ocean-blue:#3B82F6;
      --sb-teal-aqua:#14B8A6;
      --sb-emerald:#10B981;
      --sb-coral:#F97366;
      --sb-amber:#F59E0B;
      --sb-rose:#EC4899;
    }
    .mini-btn.title,.mini-btn.play,.action:not(.secondary) {
      color:var(--sb-accent-ink)!important;
    }
    .chip.active,.profile-chip.active,.season-tab.active,
    button[aria-pressed='true'] {
      border-color:var(--sb-primary-accent)!important;
      background:color-mix(in srgb,var(--sb-soft-accent) 42%,var(--card-background-color))!important;
    }
    .chip:hover,.profile-chip:hover,.season-tab:hover,.row-nav:hover,
    .provider-card:hover,.episode-row:hover {
      border-color:var(--sb-primary-accent)!important;
    }
  `;
  function styleOnce(root) {
    if (!root || root.querySelector('#sb-accent-presets-v04153')) return;
    const style=document.createElement('style');
    style.id='sb-accent-presets-v04153';
    style.textContent=CSS;
    root.appendChild(style);
  }
  function apply(element) {
    applyAccent(element);
    styleOnce(element?.shadowRoot);
    if (element?._dialog) applyAccent(element._dialog, element._config);
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
      if (!K || K.prototype.__sbAccentPresetsV04153) return;
      K.prototype.__sbAccentPresetsV04153=true;
      const render=K.prototype._render;
      if (typeof render==='function') K.prototype._render=function(...args) {
        const result=render.apply(this,args);
        apply(this);
        return result;
      };
      const desc=Object.getOwnPropertyDescriptor(K.prototype,'hass');
      if (desc?.set) Object.defineProperty(K.prototype,'hass',{
        ...desc,set(value){desc.set.call(this,value);apply(this);}
      });
    });
  }

  customElements.whenDefined('streaming-browser-card-v2').then(() => {
    const K=customElements.get('streaming-browser-card-v2');
    if (K.__sbAccentPresetFormV04153) return;
    K.__sbAccentPresetFormV04153=true;
    const getForm=K.getConfigForm;
    K.getConfigForm=function(...args) {
      const form=getForm.apply(this,args);
      const general=Array.isArray(form?.schema)
        ? form.schema.find(item=>item.title==='General') : null;
      if (general?.schema && !general.schema.some(item=>item.name==='accent_preset')) {
        const colorIndex=general.schema.findIndex(item=>item.name==='accent_color');
        general.schema.splice(colorIndex >= 0 ? colorIndex : 2,0,{
          name:'accent_preset',
          selector:{select:{mode:'dropdown',options:[
            {value:'soft_iris',label:'Soft Iris · #8B5CF6'},
            {value:'ocean_blue',label:'Ocean Blue · #3B82F6'},
            {value:'teal_aqua',label:'Teal Aqua · #14B8A6'},
            {value:'emerald',label:'Emerald · #10B981'},
            {value:'coral',label:'Coral · #F97366'},
            {value:'amber',label:'Amber · #F59E0B'},
            {value:'rose',label:'Rose · #EC4899'},
            {value:'custom',label:'Custom color picker'},
          ]}}
        });
      }
      const computeLabel=form?.computeLabel;
      const computeHelper=form?.computeHelper;
      if (typeof computeLabel==='function') form.computeLabel=schema => {
        if (schema?.name==='accent_preset') return 'Accent preset';
        if (schema?.name==='accent_color') return 'Custom accent color';
        return computeLabel(schema);
      };
      if (typeof computeHelper==='function') form.computeHelper=schema => {
        if (schema?.name==='accent_preset')
          return 'Choose one of the approved Streaming Browser accent colors, or Custom.';
        if (schema?.name==='accent_color')
          return 'Used when Accent preset is Custom. Existing custom colors are preserved.';
        return computeHelper(schema);
      };
      return form;
    };
  });

  customElements.whenDefined('streaming-browser-card-v2-editor').then(() => {
    const E=customElements.get('streaming-browser-card-v2-editor');
    if (E.prototype.__sbAccentPresetEditorV04153) return;
    E.prototype.__sbAccentPresetEditorV04153=true;
    const setConfig=E.prototype.setConfig;
    E.prototype.setConfig=function(config) {
      const next={...config};
      if (!presetKey(next)) next.accent_preset=inferPreset(next);
      return setConfig.call(this,next);
    };
  });

  customElements.whenDefined('streaming-browser-popup-card').then(() => {
    const P=customElements.get('streaming-browser-popup-card');
    if (P.prototype.__sbAccentPresetOpenV04153) return;
    P.prototype.__sbAccentPresetOpenV04153=true;
    const open=P.prototype._open;
    if (typeof open==='function') P.prototype._open=function(...args) {
      const result=open.apply(this,args);
      apply(this);
      return result;
    };
  });
})();
