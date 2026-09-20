const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cardText = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js', 'utf8');
const marker = '/* Streaming Browser v0.4.88: restored v0.4.82 link handling. */';
assert.equal(cardText.split(marker).length, 2, 'Bundle contains one historical-link restoration');
class Card {
  constructor() {
    this._config={platform:'android_tv',region:'MX',remote_entity:'remote.android',
      manual_profile_selection:true,watchhub_enabled:true};
    this._watchmodeCache=new Map();this.events=[];
    this._details={type:'movie',item:{id:321},details:{name:'Example movie'}};
    this._hass={states:{},callService:async (domain,service,args) => {
      this.events.push([domain,service,args]);
    },callWS:async () => ({links:[]})};
  }
  _platform(){return this._config.platform;}
  _watchmodeProviderScore(provider,name){return String(provider).toLowerCase()===String(name).toLowerCase()?100:-1;}
  _t(k){return k;}
  _toast(){}
  _locale(){return 'en';}
  _sourceForProvider(provider){return provider;}
  _findProfileAppConfig(){return {};}
  _profileModeFor(){return 'remember';}
  _isNetflixProvider(provider){return provider==='Netflix';}
  _isPrimeProvider(provider){return provider==='Prime Video';}
  _netflixContentId(){return '12345';}
  _androidAdbEntity(){return null;}
  _watchhubSourcesFor=async()=>[{name:'Netflix',web_url:'https://www.netflix.com/watch/99999',source:'watchhub'}];
  _providerDestination(){return {deviceKind:'series',tvCanOpen:false};}
  async _prepareDisplayRoute(){}
  async _ensureTvOn(){return {attributes:{source:''}};}
  _refreshDetailsInPlace(){}
  _languageCode(){return 'en-US';}
  _withTimeout(p){return p;}
  _androidActivity(){return '';}
  _sendProviderPlay(){this.events.push(['play']);}
  async _sleep(){}
  async _launchProvider(){this.events.push(['app-only']);}
  async _callServiceWithResponse(){return [{name:'Netflix',web_url:'https://www.netflix.com/watch/12345',source:'watchmode'}];}
}
vm.runInNewContext(cardText.slice(cardText.indexOf(marker)),{StreamingBrowserCard:Card,console,URL});
(async()=>{
  const c=new Card();
  const old=await c._watchmodeSourcesForCurrentTitle();
  assert.equal(old.length,1);
  assert.equal(old[0].source,'watchmode','do not replace v0.4.82 links with WatchHub');
  assert.equal(c._pickWatchmodeSource('Netflix',old).web_url,'https://www.netflix.com/watch/12345');
  assert.equal(c._providerDestination('Netflix',old[0],{},true).tvCanOpen,true,
    'TV icon must attempt the historical content route');
  c._details={type:'tv',item:{id:321},selectedEpisode:{episode_number:1},selectedSeason:1,episodeSources:[
    {name:'Netflix',web_url:'https://www.netflix.com/watch/12345',season:1,episode:1,scope:'episode'}],
    episodeSourcesLoading:false};
  await c._openExactTitle('Netflix');
  assert.equal(c.events.some(x=>x[0]==='app-only'),false,'do not silently open Netflix home');
  assert.equal(c.events.at(-1)[0],'remote');
  assert.equal(c.events.at(-1)[2].activity,'netflix://title/12345',
    'v0.4.82 native Netflix route retained when no trackId was supplied');
  c.events=[];
  c._details={type:'tv',item:{id:321},selectedEpisode:{episode_number:1},selectedSeason:1,episodeSources:[
    {name:'Prime Video',web_url:'https://www.primevideo.com/detail/B012345678',season:1,episode:1,scope:'episode'}],
    episodeSourcesLoading:false};
  await c._openExactTitle('Prime Video');
  assert.equal(c.events.at(-1)[2].activity,'https://www.primevideo.com/detail/B012345678',
    'v0.4.82 Prime Video uses the original provider URL unmodified');
  c._details={type:'movie',item:{id:321}};
  c._callServiceWithResponse=async()=>[];
  c._watchmodeCache.clear();
  assert.equal((await c._watchmodeSourcesForCurrentTitle())[0].source,'watchhub',
    'WatchHub can fill a gap when the older lookup has no link');
  c._config.watchhub_enabled=false;c._watchmodeCache.clear();
  assert.equal((await c._watchmodeSourcesForCurrentTitle()).length,0,
    'WatchHub option is respected');
  c._config.platform='roku';
  assert.equal(c._providerDestination('Netflix',old[0],{},true).tvCanOpen,false,
    'Roku still requires a channel-specific content ID');
  console.log('PASS historic Netflix and Prime native launches, previous source priority, WatchHub fallback, Roku guard');
})().catch(err=>{console.error(err);process.exitCode=1;});
