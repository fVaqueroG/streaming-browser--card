/* Streaming Browser v0.4.80: replace separate power buttons with a single state-driven switch. */
(() => {
  const Card = StreamingBrowserCard;
  const previousRender = Card.prototype._render;
  const previousPowerRefresh = Card.prototype._roomPowerRefresh;
  const isSpanish = (card) => String(card._config?.language || card._hass?.language || 'en')
    .toLowerCase().startsWith('es');
  const validEntity = (entity) => /^(?:switch|input_boolean)\.[a-z0-9_]+$/.test(String(entity || ''));

  // Home Assistant is the source of truth: the switch never assumes that a
  // service call succeeded and remains disabled when the entity is unavailable.
  Card.prototype._roomPowerRefresh = function(...args) {
    const holder = this.shadowRoot?.querySelector('.sbr-power-controls');
    const toggle = holder?.querySelector('.sbr-power-switch');
    if (!toggle) return previousPowerRefresh?.apply(this, args);
    const entity = String(this._roomPowerConnection?.()?.power_entity || '').trim();
    const state = this._hass?.states?.[entity]?.state || 'unavailable';
    const available = validEntity(entity) && ['on', 'off'].includes(state);
    const busy = !!this._roomPowerPending;
    const es = isSpanish(this);
    const label = holder.querySelector('.sbr-power-status');
    toggle.checked = state === 'on';
    toggle.disabled = busy || !available;
    toggle.setAttribute('aria-checked', String(toggle.checked));
    if (label) label.textContent = busy ? (es ? 'Cambiando…' : 'Switching…') :
      state === 'on' ? (es ? 'Encendido' : 'On') :
      state === 'off' ? (es ? 'Apagado' : 'Off') : (es ? 'No disponible' : 'Unavailable');
    holder.setAttribute('data-power-state', available ? state : 'unavailable');
  };

  Card.prototype._render = function(...args) {
    previousRender.apply(this, args);
    const holder = this.shadowRoot?.querySelector('.sbr-power-controls');
    if (!holder) return;
    const es = isSpanish(this);
    const title = es ? 'Alimentación' : 'Power';
    holder.innerHTML = `
      <style>
        .sbr-power-controls { display:inline-flex; align-items:center; gap:7px; white-space:nowrap; }
        .sbr-power-label { display:inline-flex; align-items:center; gap:7px; cursor:pointer; user-select:none; font-size:12px; }
        .sbr-power-switch { position:absolute; width:1px; height:1px; opacity:0; }
        .sbr-power-track { position:relative; display:inline-block; width:38px; height:22px;
          border-radius:999px; background:var(--disabled-text-color,#757575); flex:0 0 38px;
          transition:background .16s ease; }
        .sbr-power-track::after { content:''; position:absolute; top:3px; left:3px;
          width:16px; height:16px; border-radius:50%; background:#fff;
          transition:transform .16s ease; box-shadow:0 1px 3px #0004; }
        .sbr-power-switch:checked + .sbr-power-track { background:var(--success-color,#2e995a); }
        .sbr-power-switch:checked + .sbr-power-track::after { transform:translateX(16px); }
        .sbr-power-switch:focus-visible + .sbr-power-track {
          outline:2px solid var(--primary-color,#03a9f4); outline-offset:3px; }
        .sbr-power-switch:disabled + .sbr-power-track { opacity:.45; }
        .sbr-power-switch:disabled ~ .sbr-power-name { opacity:.65; }
        .sbr-power-status { font-size:11px; opacity:.75; }
      </style>
      <label class="sbr-power-label">
        <input class="sbr-power-switch" type="checkbox" role="switch"
          aria-label="${title}" aria-checked="false">
        <span class="sbr-power-track" aria-hidden="true"></span>
        <span class="sbr-power-name">${title}</span>
      </label>
      <span class="sbr-power-status" aria-live="polite"></span>`;
    const toggle = holder.querySelector('.sbr-power-switch');
    toggle.addEventListener('change', () => {
      const intendedOn = toggle.checked;
      // Revert the optimistic DOM change until HA reports the new state. This
      // also restores the switch if a power-off confirmation is cancelled.
      this._roomPowerRefresh();
      void Promise.resolve().then(() => this._roomSetPower(intendedOn))
        .catch((error) => this._toast(`Power helper: ${error?.message || error}`))
        .finally(() => this._roomPowerRefresh());
    });
    this._roomPowerRefresh();
  };
})();
