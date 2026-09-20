/* Streaming Browser V2 v0.4.99: independent layout over the original full-featured card. */
(() => {
  const Card = StreamingBrowserV2Card;
  const previousRender = Card.prototype._render;
  const keys = ['provider-popular', 'provider-top-rated', 'provider-recent'];
  const tabLabels = { 'provider-popular': 'popular', 'provider-top-rated': 'top_rated',
                      'provider-recent': 'recent_releases' };
  const tabIcons = { 'provider-popular': 'mdi:star-outline',
                     'provider-top-rated': 'mdi:chart-bar',
                     'provider-recent': 'mdi:clock-outline' };
  const styles = `
    :host { width:100%; min-width:0; display:block; }
    ha-card { width:100%; height: min(1050px, calc(100dvh - 76px));
      min-height:470px; max-width:100%; display:block; overflow:hidden; }
    ha-card > .wrap { padding:0; height:100%; min-height:0; min-width:0;
      display:flex; flex-direction:column; overflow:hidden; }
    .v2-header { position:relative; flex:0 0 auto; z-index:25; min-width:0;
      background:var(--card-background-color); padding:clamp(10px,1.5vw,20px);
      border-bottom:1px solid var(--divider-color); box-shadow:0 4px 14px #0002; }
    .v2-header .top { position:relative; top:auto; display:flex;
      flex-wrap:wrap; align-items:center; gap:9px; margin:0 0 10px; }
    .v2-header .top .title { flex:1 1 190px; font-size:clamp(18px,2.5vw,25px); }
    .v2-header .top .tvstate { min-width:0; font-size:11px; }
    .v2-header .top .search { order:10; flex:1 1 100%; width:100%; min-width:0;
      max-width:none; margin:0; }
    .v2-header .sbr-room-controls { flex:0 1 235px; gap:5px; min-width:120px; }
    .v2-header .sbr-room-controls .sbr-route-label { flex:1 1 100px;
      min-width:100px; font-size:0; }
    .v2-header .sbr-room-controls .sbr-route-label select { font-size:13px;
      border-radius:22px; min-height:36px; padding:7px 12px; }
    .v2-provider-strip { display:flex; align-items:center; min-width:0;
      gap:clamp(10px,2vw,28px); overflow-x:auto; overscroll-behavior-inline:contain;
      scrollbar-width:thin; padding:2px 1px 10px; }
    .v2-provider-strip .switcher { flex:0 0 auto; flex-wrap:nowrap; margin:0; }
    .v2-provider-strip .mode { min-height:62px; min-width:78px; }
    .v2-provider-strip .chips { flex:0 0 auto; overflow:visible;
      padding:0; gap:8px; align-items:center; }
    .v2-provider-strip .chip { width:70px; min-width:70px; height:64px;
      padding:6px; display:flex; align-items:center; justify-content:center;
      gap:3px; border-radius:13px; }
    .v2-provider-strip .chip:not([data-provider="all"]) span { display:none; }
    .v2-provider-strip .chip img { width:38px; height:38px; border-radius:8px; }
    .v2-provider-strip .chip[data-provider="all"] { flex-direction:column; }
    .v2-provider-strip .chip[data-provider="all"] ha-icon { --mdc-icon-size:24px; }
    .v2-provider-strip .chip[data-provider="all"] span { font-size:11px;
      font-weight:650; line-height:1; white-space:nowrap; }
    .v2-categories { display:flex; gap:8px; overflow-x:auto;
      overscroll-behavior-inline:contain; scrollbar-width:thin; padding-top:10px;
      border-top:1px solid var(--divider-color); }
    .v2-category-tab { flex:1 0 max-content; display:flex; align-items:center;
      justify-content:center; gap:9px; padding:10px 14px; min-height:44px;
      border:1px solid var(--divider-color); border-radius:10px;
      background:var(--secondary-background-color); color:var(--primary-text-color);
      cursor:pointer; font:inherit; font-size:13px; font-weight:650; }
    .v2-category-tab.active { border-color:var(--primary-color);
      background:color-mix(in srgb,var(--primary-color) 22%,var(--secondary-background-color)); }
    .v2-category-tab ha-icon { --mdc-icon-size:20px; }
    .v2-body { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain;
      padding:clamp(10px,1.5vw,20px); scrollbar-width:thin; }
    .v2-body .catalog-section { margin:0; min-width:0; }
    .v2-body .catalog-heading { display:none; }
    .v2-body .catalog-row { width:100%; min-width:0; max-width:100%; }
    .v2-see-all { display:flex; align-items:center; justify-content:flex-end;
      gap:6px; margin:18px 0 3px auto; min-height:38px; border:0;
      background:transparent; color:var(--primary-text-color); cursor:pointer;
      font:inherit; font-size:13px; opacity:.88; padding:6px 8px; }
    .v2-see-all ha-icon { --mdc-icon-size:18px; }
    .v2-expanded .catalog-row { display:grid; grid-auto-flow:row;
      grid-auto-columns:auto; grid-template-columns:repeat(auto-fill,minmax(min(155px,38vw),1fr));
      gap:14px; overflow:visible; scroll-snap-type:none; }
    .v2-expanded .catalog-row .poster { width:100%; min-width:0; }
    .v2-expanded .catalog-row .row-loading { width:100%; min-height:110px; }
    @media(max-width:600px) {
      ha-card { height:calc(100dvh - 60px); min-height:430px; }
      .v2-header { padding:9px; }
      .v2-header .top .title { flex:1 1 125px; }
      .v2-header .top .tvstate { display:none; }
      .v2-header .sbr-room-controls { flex:0 1 155px; }
      .v2-provider-strip { gap:9px; }
      .v2-provider-strip .mode { min-height:56px; padding:7px 9px; }
      .v2-provider-strip .genre-select { min-width:110px; max-width:135px; margin:0; }
      .v2-provider-strip .chip { width:59px; min-width:59px; height:57px; }
      .v2-provider-strip .chip img { width:32px; height:32px; }
      .v2-category-tab { padding:9px 12px; min-height:40px; font-size:12px; }
      .v2-body { padding:10px 9px; }
    }
  `;

  // Preserve the original card's room/connection, TV routing, details and editor.
  // Reorganize only this V2 instance's rendered DOM; V1 remains entirely separate.
  Card.prototype._render = function(...args) {
    const previousBody = this.shadowRoot?.querySelector('.v2-body');
    const oldScroll = previousBody?.scrollTop || 0;
    previousRender.apply(this, args);
    const root = this.shadowRoot;
    const wrap = root?.querySelector('ha-card > .wrap');
    if (!wrap) return;
    const top = wrap.querySelector(':scope > .top');
    const switcher = wrap.querySelector(':scope > .switcher');
    const chips = wrap.querySelector(':scope > .chips');
    if (!top || !switcher || !chips) return;

    const style = document.createElement('style');
    style.textContent = styles;
    root.append(style);

    const header = document.createElement('div');
    header.className = 'v2-header';
    const strip = document.createElement('div');
    strip.className = 'v2-provider-strip';
    strip.append(switcher, chips);
    header.append(top, strip);

    // The full 'All' caption belongs INSIDE its own icon-above-label chip.
    const allChip = chips.querySelector('.chip[data-provider="all"]');
    if (allChip) {
      allChip.innerHTML = '<ha-icon icon="mdi:apps" aria-hidden="true"></ha-icon><span>All</span>';
      allChip.setAttribute('aria-label', this._t('all_sources'));
    }
    chips.querySelectorAll('.chip[data-provider]:not([data-provider="all"])').forEach(chip => {
      const name = chip.querySelector('span')?.textContent?.trim() || chip.title || '';
      chip.querySelectorAll(':scope > span').forEach(span => span.remove());
      if (name) { chip.title = name; chip.setAttribute('aria-label', name); }
    });

    const searchActive = String(this._query || '').trim().length >= 2;
    const actualCategories = (this._sections || []).filter(s => keys.includes(s.key));
    if (!keys.includes(this._v2CategoryKey)) this._v2CategoryKey = keys[0];
    if (!searchActive && actualCategories.length &&
        !actualCategories.some(s => s.key === this._v2CategoryKey)) {
      this._v2CategoryKey = actualCategories[0].key;
    }
    if (!searchActive) {
      const nav = document.createElement('nav');
      nav.className = 'v2-categories';
      nav.setAttribute('aria-label', this._locale() === 'es' ? 'Categorías' : 'Categories');
      for (const key of keys) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'v2-category-tab' + (key === this._v2CategoryKey ? ' active' : '');
        tab.dataset.v2Category = key;
        tab.setAttribute('aria-pressed', String(key === this._v2CategoryKey));
        tab.innerHTML = `<ha-icon icon="${tabIcons[key]}" aria-hidden="true"></ha-icon><span>${this._t(tabLabels[key])}</span>`;
        tab.addEventListener('click', () => {
          if (this._v2CategoryKey === key && !this._v2ShowAll) return;
          this._v2CategoryKey = key;
          this._v2ShowAll = false;
          this._v2ResetScroll = true;
          this._render();
        });
        nav.append(tab);
      }
      header.append(nav);
    }

    const body = document.createElement('div');
    body.className = 'v2-body';
    // Keep all existing error states, provider details and actions in the body.
    for (const child of [...wrap.children]) body.append(child);
    wrap.append(header, body);
    const sections = body.querySelectorAll('.catalog-section');
    sections.forEach(sectionElement => {
      const row = sectionElement.querySelector('.catalog-row[data-section]');
      if (!row) return;
      const key = row.dataset.section;
      const selected = searchActive || key === this._v2CategoryKey;
      sectionElement.hidden = !selected;
      sectionElement.style.display = selected ? '' : 'none';
      if (!selected) return;
      if (!searchActive && keys.includes(key)) {
        sectionElement.classList.toggle('v2-expanded', this._v2ShowAll === true);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'v2-see-all';
        const expanded = this._v2ShowAll === true;
        button.setAttribute('aria-expanded', String(expanded));
        button.innerHTML = `<span>${expanded
          ? (this._locale() === 'es' ? 'Volver al carrusel' : 'Back to carousel')
          : (this._locale() === 'es' ? 'Ver todo' : 'See all')}</span><ha-icon icon="mdi:chevron-right" aria-hidden="true"></ha-icon>`;
        button.addEventListener('click', () => {
          this._v2ShowAll = !expanded;
          this._v2ResetScroll = true;
          this._render();
        });
        sectionElement.append(button);
      }
    });
    body.scrollTop = this._v2ResetScroll ? 0 : oldScroll;
    this._v2ResetScroll = false;
    body.addEventListener('scroll', () => {
      if (!this._v2ShowAll || searchActive) return;
      if (body.scrollHeight - body.scrollTop - body.clientHeight > 450) return;
      const category = this._sections?.find(s => s.key === this._v2CategoryKey);
      if (category && !category.loadingMore && Number(category.page) < Number(category.totalPages)) {
        void this._loadMoreSection(category.key);
      }
    }, { passive: true });
  };
})();
