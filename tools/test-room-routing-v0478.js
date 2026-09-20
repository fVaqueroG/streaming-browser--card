const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('tools/streaming-browser-room-routing-v0478.js', 'utf8');
const store = new Map();
class Card {
  static getConfigForm() { return { schema: [
    { title: 'General', schema: ['tv_entity', 'platform', 'remote_entity', 'adb_entity', 'language'].map(name => ({name})) },
    { title: 'HDMI / remote', schema: ['display_entity', 'display_source', 'display_source_delay_ms', 'remote_side'].map(name => ({name})) },
  ]}; }
  constructor() { this._providers = {movie:[], tv:[]}; this._activeConnections = {}; }
  setConfig(config) { this._config = config; this._render(); }
  _render() { this.renders = (this.renders || 0) + 1; }
}
class Editor { _render() {} _syncEditorForm() {} }
vm.runInNewContext(source, { StreamingBrowserCard: Card, StreamingBrowserCardEditor: Editor,
  localStorage: {getItem: key => store.get(key), setItem:(key,val) => store.set(key,val)},
  structuredClone, document: {}, console, Map, Set, Date, Math, Number, String, Array, Object, JSON });
const rooms = [
  {id:'living', name:'Living Room', default_connection_id:'android', connections:[
    {id:'android', name:'Android TV', platform:'android_tv', tv_entity:'media_player.android', display_entity:'media_player.lg', display_source:'HDMI 1', remote_entity:'remote.android'},
    {id:'roku', name:'Roku', platform:'roku', tv_entity:'media_player.roku', display_entity:'media_player.lg', display_source:'HDMI 2', remote_entity:'remote.roku'},
  ]},
  {id:'bedroom', name:'Bedroom', default_connection_id:'bed', connections:[
    {id:'bed', name:'Bedroom TV', platform:'webos', tv_entity:'media_player.bedroom', display_entity:'', display_source:''}
  ]},
];
const config = {title:'Route Test', tv_entity:'media_player.legacy', rooms};
const card = new Card(); card.setConfig(config);
assert.equal(card._config.tv_entity, 'media_player.android');
assert.equal(card._config.display_source, 'HDMI 1');
card._selectRoomRoute('living', 'roku');
assert.equal(card._config.platform, 'roku');
assert.equal(card._config.display_source, 'HDMI 2');
assert.equal(card._config.remote_entity, 'remote.roku');
card._selectRoomRoute('bedroom', null);
assert.equal(card._config.tv_entity, 'media_player.bedroom');
assert.equal(card._config.display_entity, null);
assert.equal(card._config.display_source, '');
assert.strictEqual(card._roomConfig.rooms, rooms);
const restored = new Card(); restored.setConfig(config);
assert.equal(restored._config.tv_entity, 'media_player.bedroom');
const legacy = new Card(); legacy.setConfig({title:'Legacy Test',tv_entity:'media_player.legacy'});
assert.equal(legacy._config.tv_entity, 'media_player.legacy');
const form = Card.getConfigForm(null, config);
assert(!form.schema[0].schema.some(field => field.name === 'tv_entity'));
assert(form.schema[0].schema.some(field => field.name === 'language'));
assert(Card.getConfigForm(null, {tv_entity:'media_player.legacy'}).schema[0].schema.some(field => field.name === 'tv_entity'));
const editor = new Editor(); editor._hass={states:{'media_player.lg':{attributes:{source_list:['TV','HDMI 1','HDMI2','AV']}}}};
const hdmi = editor._roomHdmiOptions('media_player.lg', 'HDMI 3');
assert(hdmi.includes('HDMI 1') && hdmi.includes('HDMI2') && hdmi.includes('HDMI 3'));
assert(!hdmi.includes('>AV<') && !hdmi.includes('>TV<'));
console.log('PASS room defaults, multi-device routing, HDMI switching config, persistence, legacy compatibility, and editor HDMI options');
