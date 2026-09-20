const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const addon = fs.readFileSync('tools/streaming-browser-optional-adb-remote-v0486.js', 'utf8');
class Card {
  static getConfigForm() { return { schema: [{ title: 'General', schema: [
    {name:'remote_entity'}, {name:'adb_entity'}, {name:'region'}] }],
    computeLabel: field => field.name, computeHelper: field => field.name }; }
  _platform() { return this._config.platform; }
  _androidActivity() { return this.activity || ''; }
  _isNetflixProvider(provider) { return provider === 'Netflix'; }
  _androidAdbEntity() { return this._config.adb_entity || null; }
  _roomConnection() { return this._connection; }
  _roomEffectiveConfig() { return { ...this._roomConfig, platform:'android_tv', remote_entity:'remote.standard' }; }
  async _sendRemoteButton(key) { this.events.push(['standard',key]); if (this.failStandard) throw Error('standard failed'); }
  async _sendNetflixProfileButton(key) { this.events.push(['oldProfileKey',key]); }
  async _applyProfile(provider) { this.events.push(['originalProfile',provider]); return false; }
  _findProfileAppConfig() { return {launch_delay_ms:10000,after_select_delay_ms:2000}; }
  async _openNetflixProfilePickerFromHome() { this.events.push(['picker']); await this._sendNetflixProfileButton('BACK'); }
  async _runNetflixProfilePosition() { this.events.push(['position']); await this._sendNetflixProfileButton('ENTER'); }
  async _sleep(ms) { this.events.push(['sleep',ms]); }
}
class Editor { _renderRoomEditor() { return 'original'; } }
vm.runInNewContext(addon, { StreamingBrowserCard:Card, StreamingBrowserCardEditor:Editor,
  document:{createElement:()=>({})}, console });
const form=Card.getConfigForm();
const names=form.schema[0].schema.map(x=>x.name);
assert.equal(names[names.indexOf('adb_entity')+1],'adb_remote_entity');
assert.equal(form.computeLabel({name:'adb_remote_entity'}),'ADB remote (optional)');
assert.match(form.computeHelper({name:'adb_remote_entity'}),/Netflix-specific keys/);
Card.getConfigForm = Card.getConfigForm; // Ensure room-only schema has no duplicate global setting.
const c=new Card(); c.events=[]; c.activity='com.example.app';
c._config={platform:'android_tv',remote_entity:'remote.standard',adb_entity:null,adb_remote_entity:null,manual_profile_selection:false};
c._hass={states:{'remote.standard':{state:'on'},'remote.adb':{state:'on'}},
  callService:async (domain,service,payload)=>c.events.push([domain,service,payload])};
(async()=>{
  assert.equal(c._adbRemoteEntity(),null,'ADB remote is genuinely optional');
  await c._sendRemoteButton('UP');
  assert.deepEqual(c.events,[['standard','UP']]);
  c.events=[]; c._config.adb_remote_entity='remote.adb';
  await c._sendRemoteButton('RIGHT');
  assert.deepEqual(c.events,[['standard','RIGHT']],'normal controls prefer standard remote');
  c.events=[]; c.activity='com.netflix.ninja';
  await c._sendRemoteButton('UP');
  assert.deepEqual(c.events,[['remote','send_command',{entity_id:'remote.adb',command:'input keyevent 19'}]]);
  c.events=[]; c.activity='com.example.app';c.failStandard=true;
  await c._sendRemoteButton('ENTER');
  assert.equal(c.events[0][0],'standard');
  assert.equal(c.events[1][2].command,'input keyevent 23','ADB remote falls back only after standard key fails');
  c.failStandard=false;c.events=[];
  await c._sendNetflixProfileButton('LEFT');
  assert.equal(c.events[0][2].command,'input keyevent 21','Netflix key goes to selected ADB remote');
  c.events=[];c._selectedProfile='Felipe';
  const auto=await c._applyProfile('Netflix','Netflix',{appJustOpened:false,appReadyWaited:true});
  assert.equal(auto,true,'automatic Netflix profile works with ADB remote alone');
  assert.deepEqual(c.events.filter(x=>x[0]==='remote').map(x=>x[2].command),
    ['input keyevent 4','input keyevent 23']);
  c.events=[];c._config.adb_remote_entity='';
  await c._applyProfile('Netflix','Netflix',{});
  assert.deepEqual(c.events,[['originalProfile','Netflix']],'no ADB remote uses previous behavior');
  c._config.adb_remote_entity='remote.adb';c._hass.states['remote.adb']={state:'unavailable'};
  assert.equal(c._adbRemoteEntity(),null,'unavailable ADB remote ignored');
  c._roomConfig={title:'TV'};c._connection={adb_remote_entity:'remote.adb'};
  assert.equal(c._roomEffectiveConfig().adb_remote_entity,'remote.adb','room connection uses its own ADB remote');
  c._connection={};
  assert.equal(c._roomEffectiveConfig().adb_remote_entity,null,'other room has no inherited remote');
  const single=new Card();single._config={platform:'webos',adb_remote_entity:'remote.adb'};
  single._hass=c._hass;
  assert.equal(single._adbRemoteEntity(),null,'ADB remote disabled on webOS');
  const source=fs.readFileSync('tools/streaming-browser-optional-adb-remote-v0486.js','utf8');
  assert(source.includes("select.dataset.field = 'adb_remote_entity'"));
  assert(source.includes("this._roomEntityOptions('remote', connection.adb_remote_entity)"));
  console.log('PASS optional ADB remote selector, per-room state, standard-first keys, Netflix-specific commands, Netflix auto-profile, and unavailable/legacy paths');
})().catch(error=>{console.error(error);process.exitCode=1;});
