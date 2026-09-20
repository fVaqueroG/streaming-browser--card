/* Streaming Browser v0.4.86: optional ADB remote entity (distinct from ADB media player). */
(() => {
  const Card = StreamingBrowserCard;
  const Editor = StreamingBrowserCardEditor;
  const baseForm = Card.getConfigForm;
  const baseRoomConfig = Card.prototype._roomEffectiveConfig;
  const baseRoomEditor = Editor.prototype._renderRoomEditor;
  const baseSendRemote = Card.prototype._sendRemoteButton;
  const baseNetflixKey = Card.prototype._sendNetflixProfileButton;
  const baseApplyProfile = Card.prototype._applyProfile;
  const code = button => {
    const names = { UP: 19, DOWN: 20, LEFT: 21, RIGHT: 22, ENTER: 23, CENTER: 23,
      BACK: 4, HOME: 3, BACKSPACE: 67, PLAY: 126, PAUSE: 127, MUTE: 164,
      VOLUME_UP: 24, VOLUME_DOWN: 25, CHANNEL_UP: 166, CHANNEL_DOWN: 167 };
    const key = String(button || '').trim().toUpperCase();
    if (/^[0-9]$/.test(key)) return 7 + Number(key);
    return Object.hasOwn(names, key) ? names[key] : null;
  };
  const isNetflix = card => /(?:com\.netflix\.ninja|netflix)/i.test(String(card._androidActivity?.() || ''));

  // An ADB remote is a remote.* entity created by HA's Android Debug Bridge
  // integration. It is NOT the adb_entity media_player.* used by adb_command.
  Card.prototype._adbRemoteEntity = function() {
    if (this._platform() !== 'android_tv') return null;
    const entity = String(this._config?.adb_remote_entity || '').trim();
    if (!/^remote\.[a-z0-9_]+$/.test(entity)) return null;
    const state = this._hass?.states?.[entity];
    return state && !['unavailable', 'unknown'].includes(state.state) ? entity : null;
  };
  Card.prototype._adbRemoteKey = async function(button) {
    const entity = this._adbRemoteEntity();
    const key = code(button);
    if (!entity || key === null) throw new Error('Optional ADB remote is unavailable or does not support this key: ' + button);
    await this._hass.callService('remote', 'send_command', {
      entity_id: entity, command: 'input keyevent ' + key,
    });
  };

  // Use the standard remote for ordinary commands. Netflix specifically
  // ignores some standard Android TV Remote key events; only then prefer an
  // explicitly configured ADB remote. A failed standard call may also retry.
  Card.prototype._sendRemoteButton = async function(button) {
    const adb = this._adbRemoteEntity();
    if (adb && isNetflix(this) && code(button) !== null) {
      return this._adbRemoteKey(button);
    }
    try { return await baseSendRemote.call(this, button); }
    catch (error) {
      if (!adb || code(button) === null) throw error;
      return this._adbRemoteKey(button);
    }
  };
  Card.prototype._sendNetflixProfileButton = async function(button) {
    if (this._adbRemoteEntity()) return this._adbRemoteKey(button);
    return baseNetflixKey.call(this, button);
  };

  // The previous Netflix auto-profile guard required an ADB media player.
  // When an ADB remote is explicitly configured, use its documented input
  // keyevent commands for profile navigation without inventing a media player.
  Card.prototype._applyProfile = async function(provider, source, options = {}) {
    if (this._platform() === 'android_tv' && this._isNetflixProvider(provider, source) &&
        this._config?.manual_profile_selection === false && this._adbRemoteEntity() &&
        !this._androidAdbEntity()) {
      if (!this._selectedProfile) return false;
      const rule = this._findProfileAppConfig(provider, source) || {};
      if (!options.appReadyWaited) {
        await this._sleep(Math.max(0, Number(rule.launch_delay_ms ?? 10000)));
      }
      if (!options.appJustOpened || rule.always_select === true) {
        await this._openNetflixProfilePickerFromHome(rule);
      }
      await this._runNetflixProfilePosition(rule);
      await this._sleep(Math.max(0, Number(rule.after_select_delay_ms ?? 2000)));
      return true;
    }
    return baseApplyProfile.call(this, provider, source, options);
  };

  // Keep the new option out of the general schema in rooms mode: each room's
  // connection needs its own independently selectable ADB remote entity.
  Card.getConfigForm = function(...args) {
    const form = baseForm.apply(this, args);
    const general = form?.schema?.find(section => section.title === 'General');
    const fields = general?.schema;
    if (Array.isArray(fields) && fields.some(field => field.name === 'adb_entity') &&
        !fields.some(field => field.name === 'adb_remote_entity')) {
      const index = fields.findIndex(field => field.name === 'adb_entity');
      fields.splice(index + 1, 0, { name: 'adb_remote_entity',
        selector: { entity: { filter: { domain: 'remote' } } } });
    }
    const label = form.computeLabel;
    const helper = form.computeHelper;
    form.computeLabel = field => field.name === 'adb_remote_entity'
      ? 'ADB remote (optional)' : label?.(field);
    form.computeHelper = field => field.name === 'adb_remote_entity'
      ? 'Optional remote entity from the Android Debug Bridge integration. Standard Android TV Remote is used normally; this remote is used for Netflix-specific keys or when the standard command fails. It can replace an ADB media player for automatic Netflix profile keys.'
      : helper?.(field);
    return form;
  };

  if (baseRoomConfig) {
    Card.prototype._roomEffectiveConfig = function() {
      const config = baseRoomConfig.call(this);
      const connection = this._roomConnection?.();
      if (!connection) return config;
      return { ...config, adb_remote_entity: connection.adb_remote_entity || null };
    };
  }
  if (baseRoomEditor) {
    Editor.prototype._renderRoomEditor = function(...args) {
      const result = baseRoomEditor.apply(this, args);
      const section = this.shadowRoot?.querySelector('#sbr-room-editor');
      if (!section) return result;
      const rooms = Array.isArray(this._config?.rooms) ? this._config.rooms : [];
      const es = String(this._config?.language || '').toLowerCase().startsWith('es');
      rooms.forEach((room, ri) => {
        (room.connections || []).forEach((connection, ci) => {
          const route = [...section.querySelectorAll('details[data-key]')]
            .find(node => node.dataset.key === 'connection:' + connection.id);
          const grid = route?.querySelector('.sbr-route-grid');
          if (!grid || grid.querySelector('[data-field="adb_remote_entity"]')) return;
          const label = document.createElement('label');
          label.textContent = es ? 'Control remoto ADB (opcional)' : 'ADB remote (optional)';
          const select = document.createElement('select');
          select.dataset.ri = String(ri);
          select.dataset.ci = String(ci);
          select.dataset.field = 'adb_remote_entity';
          // Reuse the same escaped Home Assistant entity options and delegated
          // change handler as the existing Rooms & connections visual editor.
          select.innerHTML = this._roomEntityOptions('remote', connection.adb_remote_entity);
          label.appendChild(select);
          grid.appendChild(label);
        });
      });
      return result;
    };
  }
})();
