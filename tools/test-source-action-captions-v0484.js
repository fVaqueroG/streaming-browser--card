const assert = require('node:assert/strict');
const fs = require('node:fs');
const card = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js', 'utf8');
const start = card.indexOf('  _renderProviderCards(detail, providers, isSeries = false) {');
const end = card.indexOf('  _renderEpisodeBrowser(detail) {', start);
assert(start > 0 && end > start, 'provider rendering method exists');
const method = card.slice(start, end);
const Fixture = new Function('return class Fixture { ' + method + '\n }')();
const ui = new Fixture();
ui.platform = 'webos';
ui.locale = 'en';
ui._platform = () => ui.platform;
ui._locale = () => ui.locale;
ui._sourceForProvider = () => 'Netflix';
ui._pickWatchmodeSource = (_name, sources) => sources[0] || null;
ui._providerOffer = () => null;
ui._providerLogo = () => '<img alt="">';
ui._esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
ui._t = key => key;
const providers = [{ provider_name: 'Netflix', logo_path: '/brand.png', groups: ['flatrate'] }];
const movie = { type:'movie', item:{ id:45 }, localSourcesLoading:false,
  localSources:[{ name:'Netflix', scope:'movie', web_url:'https://www.netflix.com/watch/45' }] };
const render = (detail, isSeries=false) => ui._renderProviderCards(detail, providers, isSeries);
const count = (text, substring) => text.split(substring).length - 1;
let html = render(movie);
assert.equal(count(html, 'class="provider-action-caption"'), 2, 'captions inside both action elements');
assert.match(html, /data-title-provider="Netflix"[^>]*><ha-icon icon="mdi:television-play"[^>]*><\/ha-icon><span class="provider-action-caption">Movie<\/span><\/button>/);
assert.match(html, /href="https:\/\/www\.netflix\.com\/watch\/45"[^>]*><ha-icon icon="mdi:cellphone-play"[^>]*><\/ha-icon><span class="provider-action-caption">Movie<\/span><\/a>/);
assert(!html.includes('data-open-provider='), 'no redundant Open app button when exact TV link exists');

const episode = { type:'tv', selectedSeason:1, selectedEpisode:{ episode_number:2 },
  episodeSourcesLoading:false, episodeSources:[{name:'Netflix',scope:'episode',season:1,episode:2,
    web_url:'https://www.netflix.com/watch/episode2'}] };
html = render(episode, true);
assert.equal(count(html, 'class="provider-action-caption">Episode</span>'), 2);
assert(!html.includes('data-open-provider='));

const appOnly = {...movie, localSources: []};
html = render(appOnly);
assert.equal(count(html, 'class="provider-action-caption"'), 1, 'no false playable device action without URL');
assert.match(html, /data-open-provider="Netflix"[^>]*><ha-icon icon="mdi:television-play"[^>]*><\/ha-icon><span class="provider-action-caption">App<\/span><\/button>/);
assert(!html.includes('mdi:cellphone-play'), 'do not invent mobile app deep links');
assert(!html.includes('data-title-provider='));

ui.platform = 'roku';
html = render(movie);
assert.match(html, /data-open-provider="Netflix"[^>]*><ha-icon icon="mdi:television-play"[^>]*><\/ha-icon><span class="provider-action-caption">App<\/span>/, 'Roku TV cannot consume a provider web link as a content ID');
assert(html.includes('class="provider-action-caption">Movie</span>'), 'device URL is still a movie link');
assert(!html.includes('data-title-provider='));

ui.platform = 'webos'; ui.locale = 'es-MX';
html = render(episode, true);
assert.equal(count(html, 'class="provider-action-caption">Episodio</span>'), 2);
html = render(movie);
assert.equal(count(html, 'class="provider-action-caption">Película</span>'), 2);

const wrongEpisode = {...episode, episodeSources:[{name:'Netflix', scope:'series', web_url:'https://www.netflix.com/title/series'}]};
html = render(wrongEpisode, true);
assert(!html.includes('mdi:cellphone-play'), 'series link not presented as an episode link');
assert(html.includes('class="provider-action-caption">App</span>'));

ui._sourceForProvider = () => '';
html = render(appOnly);
assert(!html.includes('class="provider-actions"') || !html.includes('provider-action-caption'), 'do not present unusable actions');

assert(card.includes('/* Compact action captions v0.4.84 */'));
assert(card.includes('const STREAMING_BROWSER_VERSION = "0.4.84";'));
assert(card.includes('/* Streaming Browser v0.4.83: optional WatchHub official-app link source. */'));
assert(card.includes('/* Compact Nuvio-sized remote v0.4.82 */'));
assert(card.includes('data-remote="VOLUME_UP"') && card.includes('sbr-power-switch'));
console.log('PASS TV/device in-button Movie/Episode/App captions, Spanish labels, Roku and unavailable-link fallbacks, and retained controls');
