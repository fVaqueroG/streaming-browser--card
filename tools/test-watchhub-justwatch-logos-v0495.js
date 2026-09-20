const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js', 'utf8');
const part = (begin,end) => {
  const start = source.indexOf(begin);
  assert(start >= 0, 'Missing '+begin);
  const finish = source.indexOf(end,start+begin.length);
  assert(finish > start,'Missing end of '+begin);
  return source.slice(start,finish);
};
const Card = new Function('return class TestCard {\n'+
  part('  _detailProviders() {','  // ---------------------------------------------------------------------------\n  // Profile config lookup')+
  part('  _renderProviderCards(detail, providers, isSeries = false) {','  _renderEpisodeBrowser(detail) {')+
  '}')();
const card = new Card();
card._config = { watchhub_enabled: true, platform:'android_tv',region:'MX' };
card._providers = {tv:[{provider_id:8,provider_name:'Netflix',logo_path:'/netflix.png'},
 {provider_id:283,provider_name:'Crunchyroll',logo_path:'/cr.png'}],movie:[]};
card._selectedProviderIds = () => new Set(['8']);
card._watchmodeProviderScore = (provider,source) => provider===source ? 100 : -1;
card._seriesLinksForDetail = detail => [...detail.episodeSources];
card._platform = () => 'android_tv';
card._sourceForProvider = () => 'Netflix';
card._providerOffer = () => null;
card._providerLogo = item => '<img src="'+item.logo_path+'">';
card._esc = v => String(v);
card._t = v => v;
card._locale = () => 'en';
card._providerDestination = () => ({ deviceKind: 'episode',tvCanOpen:true });
card._pickWatchmodeSource = (name,links) => links.find(link=>link.name===name) || null;
const watchhub = {name:'Netflix',source:'watchhub',scope:'episode',season:1,episode:2,
 web_url:'https://www.netflix.com/watch/123?trackId=99'};
card._details = {type:'tv',providers:{flatrate:[],free:[],ads:[]},selectedSeason:1,
 selectedEpisode:{episode_number:2},episodeSources:[watchhub],episodeSourcesLoading:false};
const available = card._detailProviders();
assert.equal(available.length,1,'Show a selected provider supplied by WatchHub even if TMDB listing omitted it');
assert.equal(available[0].provider_id,8,'Keep the actual selected TMDB provider identity/logo');
let html=card._renderProviderCards(card._details,available,true);
assert(html.includes('WatchHub'),'Show WatchHub as the chosen source');
assert(html.includes('src="/netflix.png"'),'Keep provider logo for WatchHub offers');
assert(html.includes('https://www.netflix.com/watch/123?trackId=99'),'Keep original device URL and trackId');
card._config.watchhub_enabled=false;
assert.equal(card._detailProviders().length,0,'Respect the user-controlled WatchHub opt-out');
card._config.watchhub_enabled=true;
card._details.episodeSources=[{...watchhub,source:'justwatch',web_url:'https://www.netflix.com/watch/456?trackId=10'},watchhub];
html=card._renderProviderCards(card._details,card._detailProviders(),true);
assert(html.includes('JustWatch'),'Show the actual selected source rather than indiscriminately claiming WatchHub');
assert(!html.includes('provider-link-origin" title="WatchHub"'),'Avoid false WatchHub attribution');
assert(source.includes('width: 48px;\n        height: 48px;'),'Increase provider logos from 40 to 48px');
assert(source.includes('flex: 0 0 52px;\n        width: 52px;'),'Reserve sufficient logo space without resizing action buttons');
assert(source.includes('const STREAMING_BROWSER_VERSION = "0.4.95";'));
console.log('PASS WatchHub-only provider discovery, selected provider filter, source attribution, original episode URL and larger logos');
