/* Validate Home Assistant card-picker and editor contracts with a minimal DOM. */
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js', 'utf8');
const elements = new Map();
const old = {type: 'streaming-browser-card', name: 'Old card', preview: true};
const win = {customCards: [old]};
const doc = {createElement(name) {return {tagName: name.toUpperCase()};}};
vm.runInNewContext(src, {
  HTMLElement: class {},
  customElements: {get(name) {return elements.get(name);}, define(name, cls) {elements.set(name, cls);}},
  window: win, document: doc, console,
});
const Card = elements.get('streaming-browser-card');
const Editor = elements.get('streaming-browser-card-editor');
if (!Card || !Editor) throw Error('Card or visual editor element not registered');
const hits = win.customCards.filter((item) => item.type === 'streaming-browser-card');
if (hits.length !== 1 || hits[0] !== old || hits[0].name !== 'Streaming Browser Card' || hits[0].preview !== false)
  throw Error('Named picker entry is missing, duplicated, or still stale');
const editor = Card.getConfigElement();
if (!editor || typeof editor.then === 'function' || editor.tagName !== 'STREAMING-BROWSER-CARD-EDITOR')
  throw Error('getConfigElement must immediately return the custom editor element');
const stub = Card.getStubConfig();
if (stub.tv_entity !== '' || stub.tmdb_api_key !== '' || Object.hasOwn(stub, 'type'))
  throw Error('New card has an invalid unconfigured stub');
console.log('PASS: named card lookup, synchronous visual editor, nonduplicated current metadata, editable stub');