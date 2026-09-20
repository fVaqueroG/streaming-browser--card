const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const text=fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js','utf8');
const marker='/* Streaming Browser v0.4.88: restored v0.4.82 link handling. */';
class Card {
  constructor(){
    this._config={platform:'android_tv',region:'MX',remote_entity:'remote.android',watchhub_enabled:true,
      manual_profile_selection:true};
    this._watchmodeCache=new Map();this._details=null;this.sent=[];
    this._hass={states:{},callService:async(d,s,a)=>this.sent.push({d,s,a}),
      callWS:async()=>({links:[]})};
  }
  _platform(){return this._config.platform;}
  _watchmodeProviderScore(a,b){return a===b?100:-1;}
  _t(v){return v;}_toast(){}_locale(){return 'en';}
  _sourceForProvider(v){return v;}
  _findProfileAppConfig(){return {};}_profileModeFor(){return 'remember';}
  _isNetflixProvider(v){return v==='Netflix';}_isPrimeProvider(v){return v==='Prime Video';}
  _netflixContentId(url){return /\/watch\/(\d+)/.exec(url)?.[1]||'111';}
  _androidAdbEntity(){return null;}
  _providerDestination(){return {deviceKind:'app',tvCanOpen:false};}
  _renderProviderCards(detail,providers,isSeries){return this._pickWatchmodeSource(
    providers[0].provider_name,detail.episodeSources)?.web_url||'';}
  async _prepareDisplayRoute(){}async _ensureTvOn(){return {attributes:{source:''}};}
  async _sleep(){} _refreshDetailsInPlace(){}_languageCode(){return 'en-US';}
  _withTimeout(p){return p;}_androidActivity(){return '';}
  async _callServiceWithResponse(){return [];}
  _watchhubSourcesFor=async()=>[];
}
vm.runInNewContext(text.slice(text.indexOf(marker)),{StreamingBrowserCard:Card,URL,console});
(async()=>{
  const c=new Card();
  c._details={type:'tv',item:{id:55},selectedSeason:2,
    selectedEpisode:{episode_number:3},episodeSourcesLoading:false,
    episodeSources:[
      {name:'Netflix',source:'watchhub',scope:'episode',season:2,episode:3,web_url:'https://www.netflix.com/watch/333?trackId=14170086'},
      {name:'Netflix',source:'justwatch',scope:'episode',season:2,episode:3,web_url:'https://www.netflix.com/watch/222?trackId=14170031'},
      {name:'Prime Video',source:'watchhub',scope:'episode',season:2,episode:3,web_url:'https://www.primevideo.com/detail/EP999'},
      {name:'Netflix',source:'watchhub',scope:'episode',season:2,episode:3,web_url:'https://www.netflix.com/title/555'}],
    seriesFallbackSources:[
      {name:'Netflix',source:'justwatch',scope:'season',season:2,web_url:'https://www.netflix.com/title/555'},
      {name:'Prime Video',source:'justwatch',scope:'season',season:2,web_url:'https://www.primevideo.com/detail/SEASON'},
      {name:'Netflix',source:'watchmode',scope:'series',web_url:'https://www.netflix.com/title/555'},
      {name:'Prime Video',source:'justwatch',scope:'series',web_url:'https://www.primevideo.com/detail/SERIES'},
      {name:'Crunchyroll',source:'justwatch',scope:'season',season:2,web_url:'https://www.crunchyroll.com/season/season-2'},
      {name:'Crunchyroll',source:'justwatch',scope:'series',web_url:'https://www.crunchyroll.com/series/xyz'},
    ]};
  const all=c._seriesLinksForDetail(c._details);
  assert.equal(c._pickWatchmodeSource('Netflix',all).web_url,'https://www.netflix.com/watch/222?trackId=14170031',
    'JustWatch episode takes precedence over WatchHub episode, season and series');
  assert.equal(c._pickWatchmodeSource('Prime Video',all).web_url,'https://www.primevideo.com/detail/EP999',
    'WatchHub episode takes precedence over any season link for same provider');
  assert.equal(c._pickWatchmodeSource('Crunchyroll',all).scope,'season',
    'When episode absent, prefer season to series');
  assert.equal(all.find(x=>x.name==='Netflix'&&x.source==='watchhub'&&x.web_url.endsWith('/title/555')).scope,'series',
    'Never claim Netflix series title URL is an episode');
  assert.equal(c._providerDestination('Crunchyroll',c._pickWatchmodeSource('Crunchyroll',all),c._details,true).deviceKind,'season',
    'Button caption reflects selected link scope');
  assert.equal(c._renderProviderCards(c._details,[{provider_name:'Netflix'}],true),
    'https://www.netflix.com/watch/222?trackId=14170031',
    'Rendered button and click handler agree about selected URL');
  await c._openExactTitle('Netflix');
  assert.equal(c.sent.at(-1).a.activity,'https://www.netflix.com/watch/222?trackId=14170031',
    'Selected Netflix episode preserves trackId in TV command');
  c._details.episodeSources=[];
  c._details.seriesFallbackSources=[{name:'Prime Video',scope:'series',source:'justwatch',
    web_url:'https://www.primevideo.com/detail/SHOW'}];
  assert.equal(c._pickWatchmodeSource('Prime Video',c._seriesLinksForDetail(c._details)).scope,'series');
  c._config.platform='roku';
  assert.equal(c._providerDestination('Prime Video',c._seriesLinksForDetail(c._details)[0],c._details,true).tvCanOpen,false);
  console.log('PASS per-provider episode > season > series, WatchHub last within scope, Netflix trackId URL, TV-button routing and scope captions');
})().catch(e=>{console.error(e);process.exitCode=1;});
