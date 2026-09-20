/* Streaming Browser v0.4.79: optional per-connection power helper. */
(() => {
  const Card = StreamingBrowserCard;
  const Editor = StreamingBrowserCardEditor;
  const originalPrepareDisplay = Card.prototype._prepareDisplayRoute;
  const originalEnsureTvOn = Card.prototype._ensureTvOn;
  const originalCardRender = Card.prototype._render;
  const originalRoomEditorRender = Editor.prototype._renderRoomEditor;
  const html = (value) => String(value ?? '').replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const locale = (card) => String(card._config?.language || card._hass?.language || 'en')
    .toLowerCase().startsWith('es');
  const clampDelay = (value) => Math.min(60000, Math.max(0, Number(value) || 0));
  const entityDomain = (entity) => String(entity || '').split('.')[0];
  const validEntity = (entity) => /^(?:switch|input_boolean)\.[a-z0-9_]+$/.test(String(entity || ''));

  Card.prototype._roomPowerConnection = function() {
    return typeof this._roomConnection === 'function' ? this._roomConnection() : null;
  };
  Card.prototype._roomPowerKey = function() {
    const connection = this._roomPowerConnection();
    return connection?.power_entity ? `${this._activeRoomId}:${connection.id}:${connection.power_entity}` : '';
  };
  Card.prototype._roomPowerRefresh = function() {
    const root = this.shadowRoot;
    const holder = root?.querySelector('.sbr-power-controls');
    if (!holder) return;
    const connection = this._roomPowerConnection();
    const entity = String(connection?.power_entity || '');
    const state = this._hass?.states?.[entity]?.state || 'unavailable';
    const busy = !!this._roomPowerPending;
    const es = locale(this);
    const status = holder.querySelector('.sbr-power-status');
    if (status) status.textContent = busy ? (es ? 'Iniciando…' : 'Starting…') :
      state === 'on' ? (es ? 'Encendido' : 'On') :
      state === 'off' ? (es ? 'Apagado' : 'Off') : (es ? 'No disponible' : 'Unavailable');
    holder.querySelectorAll('button').forEach((button) => {
      button.disabled = busy || !validEntity(entity) || !this._hass?.states?.[entity] ||
        ['unavailable', 'unknown'].includes(state) ||
        (button.dataset.power === 'on' && state === 'on') ||
        (button.dataset.power === 'off' && state === 'off');
    });
  };
  Card.prototype._roomEnsurePowerOn = async function() {
    const connection = this._roomPowerConnection();
    const entity = String(connection?.power_entity || '').trim();
    if (!entity) return;
    if (!validEntity(entity)) throw new Error('Power helper must be a switch or input_boolean entity.');
    const state = this._hass?.states?.[entity];
    if (!state || ['unavailable', 'unknown'].includes(state.state)) {
      throw new Error(`Power helper is unavailable: ${entity}`);
    }
    if (state.state === 'on') return;
    const key = this._roomPowerKey();
    if (this._roomPowerPending?.key === key) return this._roomPowerPending.promise;
    // Home Assistant may not have received the changed switch state yet. Do not
    // send duplicate turn_on commands while the connected device is booting.
    if (this._roomPowerLastOn?.key === key && Date.now() - this._roomPowerLastOn.at < 20000) return;
    const pending = { key, promise: null };
    this._roomPowerPending = pending;
    pending.promise = (async () => {
      this._roomPowerRefresh();
      await this._hass.callService(entityDomain(entity), 'turn_on', { entity_id: entity });
      this._roomPowerLastOn = { key, at: Date.now() };
      const delay = clampDelay(connection.power_on_delay_ms ?? 5000);
      if (delay) await this._sleep(delay);
    })();
    try {
      await pending.promise;
    } finally {
      if (this._roomPowerPending === pending) this._roomPowerPending = null;
      this._roomPowerRefresh();
    }
  };
  Card.prototype._roomSetPower = async function(on) {
    const connection = this._roomPowerConnection();
    const entity = String(connection?.power_entity || '').trim();
    if (!entity || !validEntity(entity)) return;
    if (on) return this._roomEnsurePowerOn();
    if (this._roomPowerPending) return;
    const state = this._hass?.states?.[entity];
    if (!state || ['unavailable', 'unknown'].includes(state.state)) {
      throw new Error(`Power helper is unavailable: ${entity}`);
    }
    if (state.state === 'off') return;
    const player = this._hass?.states?.[connection.tv_entity];
    if (['playing', 'paused'].includes(player?.state) && typeof window.confirm === 'function' &&
        !window.confirm(locale(this) ? '¿Apagar la alimentación durante la reproducción?' :
          'Turn off power while the device is playing?')) return;
    const pending = { key: this._roomPowerKey(), promise: null };
    this._roomPowerPending = pending;
    this._roomPowerRefresh();
    try {
      await this._hass.callService(entityDomain(entity), 'turn_off', { entity_id: entity });
      this._roomPowerLastOn = null;
    } finally {
      if (this._roomPowerPending === pending) this._roomPowerPending = null;
      this._roomPowerRefresh();
    }
  };
  const beforePlayback = async function(original, args) {
    const key = this._roomPowerKey();
    await this._roomEnsurePowerOn();
    if (key && key !== this._roomPowerKey()) {
      throw new Error('The room or playback device changed during power-on. Please retry playback.');
    }
    return original.apply(this, args);
  };
  Card.prototype._prepareDisplayRoute = function(...args) {
    return beforePlayback.call(this, originalPrepareDisplay, args);
  };
  Card.prototype._ensureTvOn = function(...args) {
    return beforePlayback.call(this, originalEnsureTvOn, args);
  };
  Card.prototype._render = function(...args) {
    originalCardRender.apply(this, args);
    const connection = this._roomPowerConnection();
    if (!connection?.power_entity) return;
    const roomBar = this.shadowRoot?.querySelector('.sbr-room-controls');
    if (!roomBar) return;
    const es = locale(this);
    const holder = document.createElement('span');
    holder.className = 'sbr-power-controls';
    holder.style.cssText = 'display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap';
    holder.innerHTML = `<span class="sbr-power-status" style="font-size:11px;opacity:.75"></span>
      <button type="button" data-power="on" title="${es ? 'Encender alimentación' : 'Turn power on'}"
        aria-label="${es ? 'Encender alimentación' : 'Turn power on'}"
        style="border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);padding:6px;cursor:pointer"><ha-icon icon="mdi:power" style="--mdc-icon-size:19px"></ha-icon></button>
      <button type="button" data-power="off" title="${es ? 'Apagar alimentación' : 'Turn power off'}"
        aria-label="${es ? 'Apagar alimentación' : 'Turn power off'}"
        style="border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);padding:6px;cursor:pointer"><ha-icon icon="mdi:power-off" style="--mdc-icon-size:19px"></ha-icon></button>`;
    roomBar.appendChild(holder);
    holder.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      void this._roomSetPower(button.dataset.power === 'on').catch((error) =>
        this._toast(`Power helper: ${error?.message || error}`));
    }));
    this._roomPowerRefresh();
  };

  Editor.prototype._renderRoomEditor = function(...args) {
    originalRoomEditorRender.apply(this, args);
    const section = this.shadowRoot?.querySelector('#sbr-room-editor');
    if (!section) return;
    const es = locale(this);
    for (const [ri, room] of (this._config?.rooms || []).entries()) {
      for (const [ci, connection] of (room.connections || []).entries()) {
        const reference = section.querySelector(
          `[data-field="tv_entity"][data-ri="${ri}"][data-ci="${ci}"]`);
        const grid = reference?.closest('.sbr-route-grid');
        if (!grid) continue;
        const entity = String(connection.power_entity || '');
        const switchOptions = this._roomEntityOptions('switch', entity.startsWith('switch.') ? entity : '');
        const booleanOptions = this._roomEntityOptions('input_boolean', entity.startsWith('input_boolean.') ? entity : '')
          .replace(/^<option value="">—<\/option>/, '');
        grid.insertAdjacentHTML('beforeend', `
          <label>${es ? 'Ayudante de encendido (opcional)' : 'Power helper (optional)'}
            <select data-ri="${ri}" data-ci="${ci}" data-field="power_entity">
              ${switchOptions}${booleanOptions}
            </select>
          </label>
          <label>${es ? 'Espera tras encender (ms)' : 'Power-on delay (ms)'}
            <input type="number" min="0" max="60000" step="500" data-ri="${ri}" data-ci="${ci}"
              data-field="power_on_delay_ms" value="${html(connection.power_on_delay_ms ?? 5000)}">
          </label>`);
      }
    }
  };
})();