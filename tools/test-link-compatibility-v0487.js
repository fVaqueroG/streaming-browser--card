const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const frontend = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js','utf8');
const addon = fs.readFileSync('tools/streaming-browser-link-compatibility-v0487.js','utf8');
class Card {
  constructor() { this.platform='android_tv'; this.calls=[]; this._config={remote_entity:'remote.tv',region:'MX'}; this._hass={callService:async(...args)=>this.calls.push(args)}; this._details={type:'tv',selectedSeason:1,selectedEpisode:{episode_number:2}}; }
  _platform(){return this.platform;}
  _isNetflixProvider(name){return /netflix/i.test(String(name));}
  _providerDestination(provider,match,detail,isSeries){
    if (!isSeries) return {deviceKind:'movie',tvCanOpen:true};
    return {deviceKind:/\/watch\//.test(match?.web_url||'')?'episode':'series',tvCanOpen:false};
  }
  _pickWatchmodeSource(provider,sources){return (sources||[]).find(x => String(x.name||'').toLowerCase().includes(String(provider||'').toLowerCase())) || null;}
  async _watchmodeSourcesForCurrentTitle(){return this.movieSources;}
  async _loadIndependentEpisodeLinks(detail){detail.episodeSources=this.episodeSources;}
  async _androidLaunchActivity(activity){this.calls.push(['previousLaunch',activity]);return 'previous';}
  _androidAdbEntity(){return this.adbMedia||null;}
  async _androidAdbCommand(command){this.calls.push(['adb',command]);}
  _netflixContentId(url){return (String(url).match(/\/(?:title|watch)\/(\d+)/)||[])[1];}
  async _openNetflixExactTitle(url){this.calls.push(['previousNetflix',url]);return 'previousNetflix';}
  _refreshDetailsInPlace(){this.calls.push(['refresh']);}
}
vm.runInNewContext(addon,{StreamingBrowserCard:Card,URL,console});
const card=new Card();
const ep={scope:'episode',season:1,episode:2};
const netflixSeries={...ep,name:'Netflix',source:'watchhub',web_url:'https://www.netflix.com/title/80111111'};
const netflixWatch={...ep,name:'Netflix',source:'justwatch',web_url:'https://www.netflix.com/watch/80222222'};
const primeSeries={...ep,name:'Prime Video',source:'watchhub',web_url:'https://www.primevideo.com/detail/B09900000'};
assert.equal(card._providerDestination('Netflix',netflixSeries,card._details,true).tvCanOpen,true,'restore Netflix TV link attempt');
assert.equal(card._providerDestination('Netflix',netflixSeries,card._details,true).deviceKind,'series','do not promise an episode');
assert.equal(card._providerDestination('Prime Video',primeSeries,card._details,true).tvCanOpen,true,'restore Prime detail URL attempt');
assert.equal(card._providerDestination('Prime Video',{...primeSeries,web_url:'https://evil.example/detail/B09900000'},card._details,true).tvCanOpen,false,'do not allow unrelated URL');
card.platform='roku';
assert.equal(card._providerDestination('Netflix',netflixWatch,card._details,true).tvCanOpen,false,'no unsupported Roku web URL launch');
card.platform='android_tv';
assert.equal(card._pickWatchmodeSource('Netflix',[netflixSeries,netflixWatch]).web_url,netflixWatch.web_url,'prefer explicit episode /watch/');
card.movieSources=[{source:'watchhub',name:'Netflix',web_url:'https://www.netflix.com/title/1'},
  {source:'watchmode',name:'Netflix',web_url:'https://www.netflix.com/title/2'}];
(async()=>{
  const movie=await card._watchmodeSourcesForCurrentTitle();
  assert.equal(movie[0].source,'watchmode','previous movie source first');
  const detail={type:'tv',selectedEpisode:card._details.selectedEpisode};card._details=detail;
  card.episodeSources=[primeSeries,{...primeSeries,source:'justwatch',web_url:'https://www.primevideo.com/detail/B08800000'}];
  await card._loadIndependentEpisodeLinks(detail,detail.selectedEpisode);
  assert.equal(detail.episodeSources[0].source,'justwatch','previous episode source first');
  card.calls=[];
  await card._androidLaunchActivity('https://www.primevideo.com/detail/B09900000?episode=22');
  assert.equal(card.calls[0][0],'remote','restore original Prime host first');
  assert.equal(card.calls[0][2].activity,'https://www.primevideo.com/detail/B09900000?episode=22');
  card.calls=[];card._hass.callService=async()=>{throw Error('remote rejected');};
  await card._androidLaunchActivity('https://www.primevideo.com/detail/B09900000');
  assert.equal(card.calls[0][0],'previousLaunch','alternate Prime host only after failure');
  card.calls=[];card._details={type:'movie'};
  await card._openNetflixExactTitle('https://www.netflix.com/title/80111111');
  assert.deepEqual(card.calls[0],['previousLaunch','netflix://title/80111111'],'restore Netflix movie native intent');
  card.calls=[];card._details={type:'tv'};
  await card._openNetflixExactTitle('https://www.netflix.com/watch/80222222');
  assert.equal(card.calls[0][0],'previousNetflix','episode /watch attempt stays first');
  const start=frontend.indexOf('  _renderProviderCards(detail, providers, isSeries = false) {');
  const end=frontend.indexOf('  _renderEpisodeBrowser(detail) {',start);
  assert(start>0 && end>start && frontend.slice(start,end).includes('this._providerDestination('));
  assert(frontend.includes('/* Streaming Browser v0.4.86: optional ADB remote entity'));
  assert(frontend.includes('/* Streaming Browser v0.4.83: optional WatchHub official-app link source.'));
  assert(frontend.includes('/* Compact action captions v0.4.84 */'));
  assert(frontend.includes('sbr-power-switch'));
  console.log('PASS restored Netflix/Prime links, stable source priority, honest episode labels, optional ADB, WatchHub and existing controls');
})().catch(e=>{console.error(e);process.exitCode=1;});
