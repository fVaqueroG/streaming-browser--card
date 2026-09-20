/* Streaming Browser v0.4.78: room and connection routing. Bundled into the card. */
(() => {
  const Card = StreamingBrowserCard;
  const Editor = StreamingBrowserCardEditor;
  const cardSetConfig = Card.prototype.setConfig;
  const cardRender = Card.prototype._render;
  const editorRender = Editor.prototype._render;
  const editorSync = Editor.prototype._syncEditorForm;
  const originalConfigForm = Card.getConfigForm;
  const roomList = (config) => Array.isArray(config?.rooms) ? config.rooms : [];
  const routes = (room) => Array.isArray(room?.connections) ? room.connections : [];
  const choice = (room, id) => routes(room).find((entry) => entry.id === id) ||
    routes(room).find((entry) => entry.id === room.default_connection_id) || routes(room)[0];
  const uniqueId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const escape = (value) => String(value ?? '').replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const strings = (language) => String(language || '').toLowerCase().startsWith('es') ? {
    room: 'Habitación', device: 'Dispositivo', rooms: 'Habitaciones y conexiones',
    addRoom: 'Agregar habitación', addConnection: 'Agregar conexión', remove: 'Eliminar',
    default: 'Predeterminado', makeDefault: 'Usar de forma predeterminada',
    roomName: 'Nombre de la habitación', connectionName: 'Nombre de la conexión',
    player: 'Reproductor', display: 'Televisor / pantalla (opcional)',
    hdmi: 'Entrada HDMI del televisor', remote: 'Control remoto', adb: 'Reproductor ADB (opcional)',
    delay: 'Espera HDMI (ms)', platform: 'Plataforma', noRooms: 'Agrega una habitación para activar el selector.',
    invalid: 'Selecciona un reproductor para esta conexión.',
  } : {
    room: 'Room', device: 'Device', rooms: 'Rooms & connections',
    addRoom: 'Add room', addConnection: 'Add connection', remove: 'Remove',
    default: 'Default', makeDefault: 'Set as default',
    roomName: 'Room name', connectionName: 'Connection name',
    player: 'Playback device', display: 'Display TV (optional)',
    hdmi: 'HDMI input on display TV', remote: 'Remote entity', adb: 'ADB media player (optional)',
    delay: 'HDMI switch delay (ms)', platform: 'Platform', noRooms: 'Add a room to enable room selection.',
    invalid: 'Select a media player for this connection.',
  };

  Card.getConfigForm = function(hass, config = {}) {
    const form = originalConfigForm.call(this, hass, config);
    if (!roomList(config).length) return form;
    for (const section of form.schema) {
      if (section.title === 'General') {
        section.schema = section.schema.filter((item) =>
          !['tv_entity', 'platform', 'remote_entity', 'adb_entity'].includes(item.name));
      } else if (section.title === 'HDMI / remote') {
        section.schema = section.schema.filter((item) =>
          !['display_entity', 'display_source', 'display_source_delay_ms'].includes(item.name));
      }
    }
    return form;
  };

  Card.prototype._roomStored = function() {
    try { return JSON.parse(localStorage.getItem(this._roomStorageKey) || '{}') || {}; }
    catch (_) { return {}; }
  };
  Card.prototype._roomSave = function() {
    try { localStorage.setItem(this._roomStorageKey, JSON.stringify({
      room: this._activeRoomId, connections: this._activeConnections || {},
    })); } catch (_) { /* Private browsing or disabled local storage. */ }
  };
  Card.prototype._roomCurrent = function() {
    return roomList(this._roomConfig).find((room) => room.id === this._activeRoomId) ||
      roomList(this._roomConfig)[0];
  };
  Card.prototype._roomConnection = function(room = this._roomCurrent()) {
    return room && choice(room, this._activeConnections?.[room.id]);
  };
  Card.prototype._roomEffectiveConfig = function() {
    const room = this._roomCurrent();
    const selected = this._roomConnection(room);
    if (!selected) return { ...this._roomConfig };
    return {
      ...this._roomConfig,
      platform: selected.platform || 'webos',
      tv_entity: selected.tv_entity || '',
      display_entity: selected.display_entity || null,
      display_source: selected.display_entity ? (selected.display_source || '') : '',
      display_source_delay_ms: Number(selected.display_source_delay_ms ?? 2500),
      remote_entity: selected.remote_entity || null,
      adb_entity: selected.adb_entity || null,
    };
  };
  Card.prototype.setConfig = function(config) {
    this._roomConfig = { ...config };
    this._roomStorageKey = 'streaming-browser:room:' +
      (config.room_storage_key || config.title || 'default');
    const saved = this._roomStored();
    const available = roomList(config);
    this._activeRoomId = available.some((room) => room.id === this._activeRoomId)
      ? this._activeRoomId : available.some((room) => room.id === saved.room)
        ? saved.room : available[0]?.id;
    this._activeConnections = { ...(saved.connections || {}), ...(this._activeConnections || {}) };
    cardSetConfig.call(this, this._roomEffectiveConfig());
  };
  Card.prototype._selectRoomRoute = function(roomId, connectionId) {
    const selectedRoom = roomList(this._roomConfig).find((room) => room.id === roomId);
    if (!selectedRoom) return;
    const selectedConnection = choice(selectedRoom, connectionId);
    if (!selectedConnection) return;
    if (roomId === this._activeRoomId &&
        selectedConnection.id === this._roomConnection()?.id) return;
    const positions = new Map();
    this.shadowRoot?.querySelectorAll('.catalog-row[data-section]').forEach((row) =>
      positions.set(row.dataset.section, row.scrollLeft));
    const detailTop = this.shadowRoot?.querySelector('.detail')?.scrollTop;
    this._activeRoomId = roomId;
    this._activeConnections[selectedRoom.id] = selectedConnection.id;
    this._roomSave();
    if (this._remoteExpanded) {
      this._remoteExpanded = false;
      this._remotePortal?.remove();
      this._remotePortal = null;
    }
    this._config = { ...this._config, ...this._roomEffectiveConfig() };
    this._lastTvSourcesKey = '';
    if (this._providers.movie.length || this._providers.tv.length) {
      this._matchProvidersToTv();
    }
    this._render();
    this.shadowRoot?.querySelectorAll('.catalog-row[data-section]').forEach((row) => {
      if (positions.has(row.dataset.section)) row.scrollLeft = positions.get(row.dataset.section);
    });
    if (detailTop != null) {
      const pane = this.shadowRoot?.querySelector('.detail');
      if (pane) pane.scrollTop = detailTop;
    }
  };
  Card.prototype._render = function(...args) {
    cardRender.apply(this, args);
    const available = roomList(this._roomConfig);
    const top = this.shadowRoot?.querySelector('.top');
    if (!available.length || !top) return;
    const room = this._roomCurrent();
    if (!room) return;
    const currentConnection = this._roomConnection(room);
    const t = strings(this._config?.language || this._hass?.language);
    const controls = document.createElement('div');
    controls.className = 'sbr-room-controls';
    controls.innerHTML = `
      <label class="sbr-route-label">${escape(t.room)}
        <select class="sbr-room-select" aria-label="${escape(t.room)}">
          ${available.map((item) => `<option value="${escape(item.id)}" ${room.id === item.id ? 'selected' : ''}>${escape(item.name || t.room)}</option>`).join('')}
        </select>
      </label>
      ${routes(room).length > 1 ? `<label class="sbr-route-label">${escape(t.device)}
        <select class="sbr-connection-select" aria-label="${escape(t.device)}">
          ${routes(room).map((item) => `<option value="${escape(item.id)}" ${currentConnection?.id === item.id ? 'selected' : ''}>${escape(item.name || item.tv_entity || t.device)}</option>`).join('')}
        </select></label>` : ''}
      ${currentConnection && !currentConnection.tv_entity ? `<span class="sbr-route-error">${escape(t.invalid)}</span>` : ''}
      <style>
        .sbr-room-controls { display:flex; flex:1 1 220px; min-width:0; align-items:center; gap:8px; flex-wrap:wrap; }
        .sbr-route-label { display:flex; flex:1 1 130px; min-width:110px; flex-direction:column; gap:2px; font-size:11px; opacity:.9; }
        .sbr-route-label select { width:100%; color:var(--primary-text-color); background:var(--card-background-color,var(--secondary-background-color)); border:1px solid var(--divider-color); padding:7px 9px; border-radius:9px; font:inherit; font-size:13px; }
        .sbr-route-error { font-size:12px; color:var(--error-color,#db4437); }
      </style>`;
    top.insertBefore(controls, top.querySelector('.tvstate'));
    controls.querySelector('.sbr-room-select')?.addEventListener('change', (event) =>
      this._selectRoomRoute(event.target.value, null));
    controls.querySelector('.sbr-connection-select')?.addEventListener('change', (event) =>
      this._selectRoomRoute(room.id, event.target.value));
  };

  Editor.prototype._roomMutate = function(mutator) {
    const next = structuredClone(this._config || {});
    next.rooms = roomList(next);
    mutator(next);
    this._emitConfig(next);
    const form = this.shadowRoot?.querySelector('#base ha-form');
    if (form) {
      const schema = Card.getConfigForm(this._hass, next);
      form.schema = schema.schema;
      form.data = next;
    }
    this._renderRoomEditor();
  };
  Editor.prototype._roomEntityOptions = function(domain, selected) {
    const entities = Object.entries(this._hass?.states || {})
      .filter(([id]) => id.startsWith(domain + '.'))
      .sort((a, b) => String(a[1]?.attributes?.friendly_name || a[0])
        .localeCompare(String(b[1]?.attributes?.friendly_name || b[0])));
    const options = [`<option value="">—</option>`];
    if (selected && !entities.some(([id]) => id === selected)) {
      options.push(`<option value="${escape(selected)}" selected>${escape(selected)}</option>`);
    }
    for (const [id, state] of entities) {
      options.push(`<option value="${escape(id)}" ${id === selected ? 'selected' : ''}>${escape(state.attributes?.friendly_name || id)} (${escape(id)})</option>`);
    }
    return options.join('');
  };
  Editor.prototype._roomHdmiOptions = function(entity, selected) {
    const sources = this._hass?.states?.[entity]?.attributes?.source_list;
    const available = Array.isArray(sources) ? sources.filter((source) =>
      typeof source === 'string' && /\bHDMI(?:\b|(?=\d))/i.test(source)) : [];
    if (selected && !available.includes(selected)) available.unshift(selected);
    return [`<option value="">—</option>`, ...[...new Set(available)].map((source) =>
      `<option value="${escape(source)}" ${source === selected ? 'selected' : ''}>${escape(source)}</option>`)].join('');
  };
  Editor.prototype._renderRoomEditor = function() {
    const base = this.shadowRoot?.querySelector('#base');
    if (!base || !this._config) return;
    const previous = this.shadowRoot.querySelector('#sbr-room-editor');
    const expanded = new Set(previous ? [...previous.querySelectorAll('details[open]')].map((item) => item.dataset.key) : []);
    const fresh = !previous;
    const section = document.createElement('section');
    section.id = 'sbr-room-editor';
    const t = strings(this._config.language || this._hass?.language);
    const rooms = roomList(this._config);
    const field = (label, key, value, ri, ci = '') => `<label>${escape(label)}
      <input data-ri="${ri}" data-ci="${ci}" data-field="${escape(key)}" value="${escape(value)}"></label>`;
    const select = (label, key, options, ri, ci) => `<label>${escape(label)}<select data-ri="${ri}" data-ci="${ci}" data-field="${escape(key)}">${options}</select></label>`;
    const platformOptions = (selected) => [['webos','LG webOS'], ['android_tv','Android TV'], ['roku','Roku']]
      .map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
    section.innerHTML = `<style>
      #sbr-room-editor { margin:14px 0; border:1px solid var(--divider-color); border-radius:12px; padding:12px; }
      #sbr-room-editor h3 { margin:0 0 10px; font-size:16px; }
      #sbr-room-editor details { border:1px solid var(--divider-color); border-radius:10px; padding:8px 10px; margin:9px 0; }
      #sbr-room-editor summary { cursor:pointer; padding:4px; font-weight:600; }
      #sbr-room-editor .sbr-route-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; padding:10px 0; }
      #sbr-room-editor label { display:flex; flex-direction:column; gap:5px; font-size:12px; }
      #sbr-room-editor input, #sbr-room-editor select { width:100%; min-width:0; box-sizing:border-box; padding:9px; border-radius:8px; border:1px solid var(--divider-color); background:var(--card-background-color,var(--secondary-background-color)); color:var(--primary-text-color); font:inherit; }
      #sbr-room-editor .sbr-route-actions { display:flex; gap:8px; flex-wrap:wrap; margin:6px 0; }
      #sbr-room-editor button { border:1px solid var(--divider-color); border-radius:9px; padding:8px 10px; background:var(--secondary-background-color); color:var(--primary-text-color); cursor:pointer; }
      #sbr-room-editor .sbr-route-note { font-size:12px; opacity:.7; }
    </style><h3>${escape(t.rooms)}</h3>
    ${rooms.length ? rooms.map((room, ri) => `
      <details data-key="room:${escape(room.id)}" ${fresh && ri === 0 || expanded.has('room:' + room.id) ? 'open' : ''}>
        <summary>${escape(room.name || `${t.room} ${ri + 1}`)} · ${routes(room).length} ${escape(t.device)}</summary>
        <div class="sbr-route-grid">${field(t.roomName, 'name', room.name || '', ri)}</div>
        ${routes(room).map((entry, ci) => `
          <details data-key="connection:${escape(entry.id)}" ${fresh && ci === 0 && ri === 0 || expanded.has('connection:' + entry.id) ? 'open' : ''}>
            <summary>${escape(entry.name || `${t.device} ${ci + 1}`)} ${room.default_connection_id === entry.id ? '★' : ''}</summary>
            <div class="sbr-route-grid">
              ${field(t.connectionName, 'name', entry.name || '', ri, ci)}
              ${select(t.platform, 'platform', platformOptions(entry.platform || 'webos'), ri, ci)}
              ${select(t.player, 'tv_entity', this._roomEntityOptions('media_player', entry.tv_entity), ri, ci)}
              ${select(t.display, 'display_entity', this._roomEntityOptions('media_player', entry.display_entity), ri, ci)}
              ${select(t.hdmi, 'display_source', this._roomHdmiOptions(entry.display_entity, entry.display_source), ri, ci)}
              ${select(t.remote, 'remote_entity', this._roomEntityOptions('remote', entry.remote_entity), ri, ci)}
              ${select(t.adb, 'adb_entity', this._roomEntityOptions('media_player', entry.adb_entity), ri, ci)}
              ${field(t.delay, 'display_source_delay_ms', entry.display_source_delay_ms ?? 2500, ri, ci)}
            </div>
            <div class="sbr-route-actions">
              <button data-action="default" data-ri="${ri}" data-ci="${ci}" ${room.default_connection_id === entry.id ? 'disabled' : ''}>${escape(room.default_connection_id === entry.id ? t.default : t.makeDefault)}</button>
              <button data-action="remove-connection" data-ri="${ri}" data-ci="${ci}">${escape(t.remove)}</button>
            </div>
          </details>`).join('')}
        <div class="sbr-route-actions"><button data-action="add-connection" data-ri="${ri}">+ ${escape(t.addConnection)}</button>
          <button data-action="remove-room" data-ri="${ri}">${escape(t.remove)}</button></div>
      </details>`).join('') : `<p class="sbr-route-note">${escape(t.noRooms)}</p>`}
    <button data-action="add-room">+ ${escape(t.addRoom)}</button>`;
    if (previous) previous.replaceWith(section);
    else base.insertAdjacentElement('afterend', section);
    section.addEventListener('change', (event) => {
      const target = event.target;
      if (!target.matches('[data-field]')) return;
      const ri = Number(target.dataset.ri);
      const ci = target.dataset.ci === '' ? null : Number(target.dataset.ci);
      const fieldName = target.dataset.field;
      this._roomMutate((config) => {
        const item = ci === null ? config.rooms[ri] : config.rooms[ri]?.connections?.[ci];
        if (!item) return;
        item[fieldName] = fieldName === 'display_source_delay_ms' ?
          Math.max(0, Math.min(20000, Number(target.value) || 0)) : target.value;
        if (fieldName === 'display_entity' && ci !== null) item.display_source = '';
      });
    });
    section.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      const ri = Number(button.dataset.ri);
      const ci = Number(button.dataset.ci);
      this._roomMutate((config) => {
        if (action === 'add-room') {
          const id = uniqueId('room');
          const entry = { id: uniqueId('connection'), name: 'TV', platform: config.platform || 'webos',
            tv_entity: config.rooms.length ? '' : (config.tv_entity || ''),
            display_entity: config.rooms.length ? '' : (config.display_entity || ''),
            display_source: config.rooms.length ? '' : (config.display_source || ''),
            remote_entity: config.rooms.length ? '' : (config.remote_entity || ''),
            adb_entity: config.rooms.length ? '' : (config.adb_entity || ''),
            display_source_delay_ms: Number(config.display_source_delay_ms ?? 2500) };
          config.rooms.push({ id, name: `${t.room} ${config.rooms.length + 1}`,
            default_connection_id: entry.id, connections: [entry] });
        } else if (action === 'remove-room') {
          config.rooms.splice(ri, 1);
        } else if (action === 'add-connection') {
          config.rooms[ri]?.connections?.push({ id: uniqueId('connection'), name: `${t.device} ${routes(config.rooms[ri]).length + 1}`,
            platform: 'webos', tv_entity: '', display_entity: '', display_source: '',
            remote_entity: '', adb_entity: '', display_source_delay_ms: 2500 });
        } else if (action === 'remove-connection') {
          const room = config.rooms[ri];
          if (!room) return;
          const removed = room.connections.splice(ci, 1)[0];
          if (removed?.id === room.default_connection_id) room.default_connection_id = room.connections[0]?.id || '';
        } else if (action === 'default') {
          const room = config.rooms[ri];
          if (room?.connections?.[ci]) room.default_connection_id = room.connections[ci].id;
        }
      });
    });
  };
  Editor.prototype._render = function(...args) {
    editorRender.apply(this, args);
    this._renderRoomEditor();
  };
  Editor.prototype._syncEditorForm = function(...args) {
    editorSync.apply(this, args);
    const rooms = roomList(this._config);
    const sourceKey = JSON.stringify(rooms.map((room) => routes(room).map((entry) => [
      entry.display_entity,
      this._hass?.states?.[entry.display_entity]?.attributes?.source_list || [],
    ])));
    if (sourceKey !== this._roomSourceKey) {
      this._roomSourceKey = sourceKey;
      this._renderRoomEditor();
    }
  };
})();