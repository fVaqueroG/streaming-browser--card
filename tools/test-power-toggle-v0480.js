const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tools/streaming-browser-power-toggle-v0480.js', 'utf8');
class Holder {
  constructor() { this.attributes = {}; this.toggle = null; this.status = null; }
  set innerHTML(value) {
    this.html = value;
    this.toggle = {checked:false, disabled:false, attrs:{}, listeners:{},
      setAttribute(key,value) { this.attrs[key]=value; },
      addEventListener(name, callback) { this.listeners[name]=callback; }};
    this.status = {textContent:''};
  }
  querySelector(selector) {
    if (selector === '.sbr-power-switch') return this.toggle;
    if (selector === '.sbr-power-status') return this.status;
    return null;
  }
  setAttribute(key,value) { this.attributes[key]=value; }
}
class Card {
  constructor() {
    this.holder = new Holder();
    this.shadowRoot = {querySelector: (selector) => selector === '.sbr-power-controls' ? this.holder : null};
    this._config = {language:'en-US'};
    this._hass = {states:{'switch.media_plug':{state:'off'}}};
    this.connection = {power_entity:'switch.media_plug'};
    this.calls = []; this.toasts = [];
  }
  _render() { this.holder = new Holder(); }
  _roomPowerRefresh() { this.oldRefresh = (this.oldRefresh || 0) + 1; }
  _roomPowerConnection() { return this.connection; }
  async _roomSetPower(value) { this.calls.push(value); }
  _toast(value) { this.toasts.push(value); }
}
vm.runInNewContext(source, {StreamingBrowserCard:Card, Object, String, Promise});
(async () => {
  const card = new Card();
  card._render();
  let toggle = card.holder.toggle;
  assert(card.holder.html.includes('role="switch"'));
  assert(!card.holder.html.includes('data-power="on"') && !card.holder.html.includes('data-power="off"'));
  assert.equal(toggle.checked, false);
  assert.equal(toggle.attrs['aria-checked'], 'false');
  assert.equal(card.holder.status.textContent, 'Off');
  toggle.checked = true;
  toggle.listeners.change();
  assert.equal(toggle.checked, false, 'no optimistic power state');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(card.calls, [true]);
  card._hass.states['switch.media_plug'].state = 'on';
  card._roomPowerRefresh();
  assert.equal(toggle.checked, true);
  assert.equal(toggle.attrs['aria-checked'], 'true');
  assert.equal(card.holder.status.textContent, 'On');
  card._roomPowerPending = {key:'test'};
  card._roomPowerRefresh();
  assert.equal(toggle.disabled, true);
  card._roomPowerPending = null;
  card._hass.states['switch.media_plug'].state = 'unavailable';
  card._roomPowerRefresh();
  assert.equal(toggle.disabled, true);
  assert.equal(card.holder.status.textContent, 'Unavailable');
  card._hass.states['switch.media_plug'].state = 'on';
  card._roomPowerRefresh();
  toggle.checked = false;
  toggle.listeners.change();
  assert.equal(toggle.checked, true, 'a cancelled shutdown leaves the switch on');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(card.calls, [true, false]);
  card._config.language = 'es-MX';
  card._roomPowerRefresh();
  assert.equal(card.holder.status.textContent, 'Encendido');
  card._render();
  assert(card.holder.html.includes('Alimentación'));
  console.log('PASS one accessible power toggle, state sync, no optimistic state, pending/unavailable handling, on/off commands, English/Spanish labels');
})().catch(error => { console.error(error); process.exitCode = 1; });
