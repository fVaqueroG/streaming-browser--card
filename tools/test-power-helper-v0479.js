const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('tools/streaming-browser-power-helper-v0479.js', 'utf8');
const statusSource = fs.readFileSync('tools/streaming-browser-power-status-v0479.js', 'utf8');
let confirm = true;
const calls = [];
class Card {
  constructor() {
    this._activeRoomId = 'living';
    this.connection = {id:'android', tv_entity:'media_player.android', power_entity:'switch.tv_plug', power_on_delay_ms:4200};
    this._config = {language:'en-US'};
    this._hass = {states:{
      'switch.tv_plug':{state:'off'},
      'input_boolean.room_power':{state:'off'},
      'media_player.android':{state:'idle'},
    }, callService: async (...args) => calls.push(args)};
    this.waits = [];
  }
  _roomConnection() { return this.connection; }
  _prepareDisplayRoute() { calls.push(['prepare']); }
  _ensureTvOn() { calls.push(['wake']); }
  _render() {}
  async _sleep(ms) { this.waits.push(ms); }
  _toast(message) { this.toast = message; }
}
class Editor { _renderRoomEditor() {} }
vm.runInNewContext(source, { StreamingBrowserCard:Card, StreamingBrowserCardEditor:Editor,
  document:{}, window:{confirm:() => confirm}, Date, Number, Math, String, Object });
(async () => {
  const card = new Card();
  await card._prepareDisplayRoute();
  assert.equal(calls[0][0], 'switch');
  assert.equal(calls[0][1], 'turn_on');
  assert.equal(calls[0][2].entity_id, 'switch.tv_plug');
  assert.equal(calls[1][0], 'prepare');
  assert.deepEqual(card.waits, [4200]);
  await card._ensureTvOn();
  assert.equal(calls.filter(item => item[1] === 'turn_on').length, 1, 'must not repower during wake');
  assert.equal(calls.at(-1)[0], 'wake');
  card._hass.states['switch.tv_plug'].state = 'on';
  card._hass.states['media_player.android'].state = 'playing';
  confirm = false;
  await card._roomSetPower(false);
  assert.equal(calls.filter(item => item[1] === 'turn_off').length, 0, 'cancelled cutoff');
  confirm = true;
  await card._roomSetPower(false);
  assert.equal(calls.at(-1)[0], 'switch');
  assert.equal(calls.at(-1)[1], 'turn_off');
  assert.equal(calls.at(-1)[2].entity_id, 'switch.tv_plug');
  card.connection = {id:'bed', tv_entity:'media_player.android', power_entity:'input_boolean.room_power', power_on_delay_ms:0};
  await card._ensureTvOn();
  assert(calls.some(item => item[0] === 'input_boolean' && item[1] === 'turn_on' &&
    item[2].entity_id === 'input_boolean.room_power'), 'input_boolean should support automations');
  card.connection = {id:'legacy', tv_entity:'media_player.android'};
  const powerCommandsBefore = calls.filter(item => item[1] === 'turn_on' || item[1] === 'turn_off').length;
  await card._ensureTvOn();
  assert.equal(calls.filter(item => item[1] === 'turn_on' || item[1] === 'turn_off').length,
    powerCommandsBefore, 'connections without helper must be unaffected');
  card.connection = {id:'missing', tv_entity:'media_player.android', power_entity:'switch.missing'};
  await assert.rejects(card._ensureTvOn(), /Power helper is unavailable/);
  card.connection = {id:'invalid', tv_entity:'media_player.android', power_entity:'light.kitchen'};
  await assert.rejects(card._ensureTvOn(), /Power helper must be a switch/);
  assert(source.includes('data-field="power_entity"') && source.includes('data-field="power_on_delay_ms"'),
    'visual editor must expose entity and startup delay');
  assert(source.includes('data-power="on"') && source.includes('data-power="off"'),
    'visual card must expose both manual power controls');
  assert(statusSource.includes('_roomPowerRefresh?.()'), 'Home Assistant state must update the controls');
  console.log('PASS smart-plug turn-on before HDMI/wake, startup delay, no duplicate power, confirmed manual off, input_boolean, optional legacy behavior, errors, and power editor controls');
})().catch(error => { console.error(error); process.exitCode = 1; });