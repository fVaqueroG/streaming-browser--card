const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js', 'utf8');
assert(src.includes('const STREAMING_BROWSER_VERSION = "0.4.81";'));
assert.equal(src.split('/* Nuvio-inspired remote layout v0.4.81 */').length - 1, 1);
assert(src.includes('/* Streaming Browser v0.4.80:') || src.includes('/* Streaming Browser v0.4.79:'), 'prior room/power controls remain bundled');
const components = new Map(), actions = new Map();
let portal;
class HTMLElement { attachShadow() { this.shadowRoot = { querySelectorAll: () => [] }; } }
const document = {
  createElement: () => {
    portal = { innerHTML: '', className: '', remove() {},
      querySelector: selector => selector === '[data-close-remote]' ? {addEventListener(){}} : null,
      querySelectorAll: selector => selector === '[data-remote]' ?
        [...portal.innerHTML.matchAll(/<button\b[^>]*data-remote="([A-Z_]+|[0-9])"[^>]*>/g)]
          .map(match => ({dataset:{remote:match[1]}, addEventListener:(_,handler) => actions.set(match[1],handler)})) : []
    }; return portal;
  },
  body: {appendChild(item) {assert.equal(item,portal);}}
};
const window = {customCards:[],confirm:()=>true};
const customElements = {get: name => components.get(name), define: (name,klass) => components.set(name,klass)};
vm.runInNewContext(src, {HTMLElement,document,window,customElements,console,localStorage:{getItem:()=>null,setItem:()=>{}},structuredClone, setTimeout,clearTimeout});
const Card = components.get('streaming-browser-card');
assert(Card, 'card remains registered');
(async () => {
  const card = new Card();
  card._config = {tv_entity:'media_player.player',display_entity:'media_player.display',remote_side:'left',language:'en-US'};
  const pressed = [], services = [], wake = [];
  card._hass = {states:{'media_player.player':{attributes:{friendly_name:'Android TV'}},
    'media_player.display':{attributes:{is_volume_muted:false}}},
    callService:async (...args)=>services.push(args)};
  card._prepareDisplayRoute = async () => {};
  card._updateNuvioRemoteButton = () => {};
  card._ensureTvOn = async () => wake.push(true);
  card._sendRemoteButton = async key => pressed.push(key);
  await card._toggleNuvioRemote();
  assert.equal(card._remoteExpanded,true);
  const html = portal.innerHTML;
  for(const part of ['class="sbr-wake"','class="sbr-pad" role="group"','class="sbr-numbers"','class="sbr-navigation"','class="sbr-actions"']) assert(html.includes(part),`Missing ${part}`);
  const order = ['class="sbr-head"','class="sbr-wake"','class="sbr-pad"','class="sbr-numbers"','class="sbr-navigation"','class="sbr-actions"'].map(part=>html.indexOf(part));
  assert(order.every((value,index)=>value>=0 && (index===0 || value>order[index-1])),'Nuvio-style order');
  for(const key of ['WAKE','UP','DOWN','LEFT','RIGHT','ENTER','BACK','HOME','PLAY','PAUSE','MUTE','VOLUME_UP','VOLUME_DOWN']) {
    assert(html.includes(`data-remote="${key}"`),`Missing ${key}`);
    assert(actions.has(key),`Unwired ${key}`);
  }
  assert(html.includes('"⌫",0,"↵"'), 'backspace, 0 and keypad Enter are preserved');
  assert(html.includes('max-height:calc(100dvh - 20px)') && html.includes('overflow-y:auto'), 'short screen remains scrollable');
  assert(html.includes('role="dialog"') && html.includes('aria-label="Close remote"'));
  await actions.get('WAKE')(); await actions.get('UP')(); await actions.get('ENTER')();
  await actions.get('BACK')(); await actions.get('HOME')(); await actions.get('PLAY')(); await actions.get('PAUSE')();
  assert.deepEqual(wake,[true]);
  assert.deepEqual(pressed,['UP','ENTER','BACK','HOME','PLAY','PAUSE']);
  await actions.get('VOLUME_UP')(); await actions.get('VOLUME_DOWN')(); await actions.get('MUTE')();
  assert.deepEqual(services.map(s=>s[1]),['volume_up','volume_down','volume_mute']);
  assert(services.every(s=>s[2].entity_id==='media_player.display'),'HDMI display remains volume target');
  card._config.display_entity = '';
  card._platform = () => 'roku';
  await actions.get('VOLUME_UP')();
  assert.equal(pressed.at(-1),'VOLUME_UP','Roku without HDMI display retains native volume routing');
  console.log('PASS Nuvio-style layout, all prior buttons, dialog accessibility, short-screen scrolling, and command dispatch');
})().catch(err=>{console.error(err);process.exitCode=1});