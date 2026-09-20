const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const extension = fs.readFileSync('tools/streaming-browser-watchhub-v0483.js', 'utf8');
const requests = [];
let originalFails = false;
class Card {
  static getConfigForm() { return {schema:[{title:'Exact-title playback',schema:[]}],computeLabel: s=>s.name,computeHelper: s=>s.name}; }
  constructor() {
    this._config = {region:'ES', watchhub_enabled:true};
    this._hass = {callWS:async payload => {
      requests.push(payload);
      if(payload.media_type === 'series') return {links:[
        {name:'Netflix', web_url:'https://www.netflix.com/watch/ep2',source:'watchhub',scope:'episode',season:2,episode:2},
        {name:'Netflix', web_url:'https://www.netflix.com/watch/wrong',source:'watchhub',scope:'episode',season:2,episode:3},
      ]};
      return {links:[{name:'Disney+',web_url:'https://www.disneyplus.com/movies/123',source:'watchhub',scope:'movie'}]};
    }};
  }
  async _watchmodeSourcesForCurrentTitle(){if(originalFails)throw Error('Watchmode offline');return [{name:'Netflix',web_url:'https://www.netflix.com/title/123'}];}
  async _loadIndependentEpisodeLinks(detail,episode){detail.episodeSources = [{name:'Netflix',web_url:'https://www.netflix.com/watch/ep2',scope:'episode',season:2,episode:2}];detail.episodeSourcesLoading=false;}
  async _api(path) {requests.push(path);return {imdb_id:'tt1234567'};}
  _withTimeout(promise){return promise;}
  _refreshDetailsInPlace() {}
}
vm.runInNewContext(extension,{StreamingBrowserCard:Card, console, Map, Set, Promise, Number, String, Object, Array});
(async()=>{
  const form = Card.getConfigForm();
  assert(form.schema[0].schema.some(x=>x.name==='watchhub_enabled'));
  const card=new Card();card._details={item:{id:44},type:'movie'};
  let merged=await card._watchmodeSourcesForCurrentTitle();
  assert.equal(merged.length,2);assert.equal(merged[0].source,'watchhub');
  assert(requests.includes('/movie/44/external_ids'));
  assert(requests.some(x=>x.media_type==='movie'&&x.region==='ES'&&x.imdb_id==='tt1234567'));
  originalFails=true;
  merged=await card._watchmodeSourcesForCurrentTitle();
  assert.equal(merged[0].source,'watchhub','WatchHub works when Watchmode fails');
  originalFails=false;
  const episode={episode_number:2};const detail={item:{id:88},type:'tv',selectedSeason:2,selectedEpisode:episode};
  card._details=detail;
  await card._loadIndependentEpisodeLinks(detail,episode);
  assert.equal(detail.episodeSources.length,1,'only the matching episode and deduped URLs survive');
  assert.equal(detail.episodeSources[0].source,'watchhub');
  assert.equal(detail.episodeSourcesLoading,false);
  assert(requests.includes('/tv/88/external_ids'));
  assert(requests.some(x=>x.media_type==='series'&&x.season===2&&x.episode===2));
  card._config.watchhub_enabled=false;
  card._details={item:{id:44},type:'movie'};
  merged=await card._watchmodeSourcesForCurrentTitle();
  assert.equal(merged.length,1);assert(!merged[0].source,'disabled preserves Watchmode-only behavior');
  console.log('PASS WatchHub toggle, regional IMDb resolution, movie fallback, episode-scoped merge, dedupe, and existing source preservation');
})().catch(error=>{console.error(error);process.exitCode=1;});
