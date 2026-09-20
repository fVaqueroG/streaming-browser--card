const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js', 'utf8');
const handlers = new Map();
const definitions = new Map();
let portal;
const customElements = {get: key => definitions.get(key), define: (key, value) => definitions.set(key, value)};
class HTMLElement {
  attachShadow() { this.shadowRoot = {querySelectorAll: () => []}; }
}
const document = {
  createElement: (tag) => {
    if (tag !== 'div') return {tagName: tag};
    portal = {
      innerHTML: '', className: '', remove() {},
      querySelector: selector => selector === '[data-close-remote]'
        ? {addEventListener() {}} : null,
      querySelectorAll: selector => selector === '[data-remote]'
        ? [...portal.innerHTML.matchAll(/data-remote="([^"]+)"/g)].map((match) => ({
            dataset: {remote: match[1]},
            addEventListener: (_event, handler) => handlers.set(match[1], handler),
          })) : [],
    };
    return portal;
  },
  body: {appendChild(element) { assert.equal(element, portal); }},
};
const window = {customCards: []};
vm.runInNewContext(source, {HTMLElement, document, customElements, window, console});
const Card = definitions.get('streaming-browser-card');
assert.ok(Card, 'custom card must be registered');
assert.ok(definitions.get('streaming-browser-card-editor'), 'visual editor must be registered');
assert.equal(window.customCards.find(item => item.type === 'streaming-browser-card')?.name, 'Streaming Browser Card');
assert.match(source, /STREAMING_BROWSER_VERSION = "0\.4\.69"/);

(async () => {
  const card = new Card();
  card._config = {tv_entity: 'media_player.player', display_entity: 'media_player.display', remote_side: 'right'};
  const calls = [], remoteKeys = [], wake = [];
  card._hass = {
    states: {
      'media_player.player': {attributes: {friendly_name: 'Player'}},
      'media_player.display': {attributes: {is_volume_muted: false}},
    },
    callService: async (domain, service, data) => calls.push({domain, service, data}),
  };
  card._prepareDisplayRoute = async () => {};
  card._updateNuvioRemoteButton = () => {};
  card._ensureTvOn = async () => wake.push('wake');
  card._sendRemoteButton = async key => remoteKeys.push(key);
  await card._toggleNuvioRemote();
  assert.equal(card._remoteExpanded, true);
  assert.match(portal.innerHTML, /class="sbr-pad" role="group"/);
  assert.match(portal.innerHTML, /class="sbr-ok" data-remote="ENTER"[^>]*>OK<\/button>/);
  for (const [key, icon] of Object.entries({
    UP: 'mdi:chevron-up', DOWN: 'mdi:chevron-down',
    LEFT: 'mdi:chevron-left', RIGHT: 'mdi:chevron-right',
    WAKE: 'mdi:sleep-off', BACK: 'mdi:arrow-left', HOME: 'mdi:home',
    PLAY: 'mdi:play', PAUSE: 'mdi:pause', MUTE: 'mdi:volume-mute',
    VOLUME_UP: 'mdi:volume-plus', VOLUME_DOWN: 'mdi:volume-minus',
  })) {
    const button = [...portal.innerHTML.matchAll(/<button\b[^>]*data-remote="([^"]+)"[^>]*>[\s\S]*?<\/button>/g)]
      .find(match => match[1] === key)?.[0];
    assert.ok(button, `missing ${key} action`);
    assert.ok(button.includes(`icon="${icon}"`), `wrong icon for ${key}`);
    assert.ok(button.includes('aria-label='), `missing accessible label for ${key}`);
    assert.ok(handlers.has(key), `missing click handler for ${key}`);
    if (['WAKE', 'BACK', 'HOME', 'PLAY', 'PAUSE', 'MUTE', 'VOLUME_UP', 'VOLUME_DOWN'].includes(key))
      assert.ok(/<ha-icon[^>]*><\/ha-icon><\/button>$/.test(button), `${key} must be icon only`);
  }
  assert.match(portal.innerHTML, /class="sbr-numbers"/, 'number pad must remain');
  await handlers.get('UP')();
  await handlers.get('ENTER')();
  await handlers.get('HOME')();
  assert.deepEqual(remoteKeys, ['UP', 'ENTER', 'HOME']);
  await handlers.get('WAKE')();
  assert.deepEqual(wake, ['wake']);
  await handlers.get('VOLUME_UP')();
  await handlers.get('VOLUME_DOWN')();
  await handlers.get('MUTE')();
  assert.deepEqual(calls.map(call => call.service), ['volume_up', 'volume_down', 'volume_mute']);
  assert.ok(calls.every(call => call.data.entity_id === 'media_player.display'), 'HDMI display TV must own volume');
  assert.equal(calls[2].data.is_volume_muted, true, 'mute should toggle on');
  card._hass.states['media_player.display'].attributes.is_volume_muted = true;
  await handlers.get('MUTE')();
  assert.equal(calls.at(-1).data.is_volume_muted, false, 'mute should toggle off');
  card._config.display_entity = null;
  await handlers.get('VOLUME_UP')();
  assert.equal(calls.at(-1).data.entity_id, 'media_player.player', 'playback device fallback');
  console.log('PASS circular D-pad, icon-only actions, requested icons, numeric pad, native direction and volume/mute routing');
})().catch(error => { console.error(error); process.exitCode = 1; });