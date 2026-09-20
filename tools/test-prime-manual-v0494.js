const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const addon = fs.readFileSync('tools/streaming-browser-prime-manual-v0494.js', 'utf8');
const movie='amzn1.dv.gti.9414153b-f775-48f2-a56a-1174ca458d0b';
const episode='amzn1.dv.gti.d62095f9-f33c-429b-a8a6-fd74c0461704';
const season='amzn1.dv.gti.c7ecfe2d-1504-42b3-b44f-b06128ba30c6';
const url=id=>'https://app.primevideo.com/detail?gti='+id;
class Card {
  constructor() {
    this.calls=[];
    this._config={remote_entity:'remote.android_tv',tv_entity:'media_player.android_tv',region:'MX',adb_entity:'media_player.adb'};
    this._hass={callService:async (domain,service,data)=>this.calls.push({domain,service,data})};
    this._details={type:'tv', selectedSeason:1,selectedEpisode:{episode_number:2},episodeSourcesLoading:false,episodeSources:[],seriesFallbackSources:[]};
  }
  _platform(){return this.platform || 'android_tv';}
  _locale(){return 'en-US';}
  _providerDestination(){return {deviceKind:'app',tvCanOpen:false};}
  async _openExactTitle(provider,autoPlay){this.calls.push({domain:'prior-exact',provider,autoPlay});}
  async _launchProvider(provider,autoPlay){this.calls.push({domain:'prior-app',provider,autoPlay});}
  async _applyProfile(provider){this.calls.push({domain:'prior-profile',provider});}
  async _androidLaunchActivity(activity){this.calls.push({domain:'prior-activity',activity});}
  async _prepareDisplayRoute(){this.calls.push({domain:'route'});}
  async _ensureTvOn(){this.calls.push({domain:'power'});}
  _toast(text){this.message=text;}
  _formatError(e){return e.message;}
  _seriesLinksForDetail(detail){return [...detail.episodeSources,...detail.seriesFallbackSources];}
  _pickWatchmodeSource(provider,links){return links.find(l=>/prime/i.test(l.name||'')) || null;}
}
vm.runInNewContext(addon,{StreamingBrowserCard:Card,URL,console});
const src=(gti,scope,extra={})=>({name:'Prime Video',web_url:url(gti),scope,...extra});
(async()=>{
  let c=new Card();
  c._details.episodeSources=[src(episode,'episode',{season:1,episode:2})];
  await c._openExactTitle('Prime Video',true);
  assert.deepEqual(c.calls.map(x=>x.domain),['route','power','remote']);
  assert.equal(c.calls[2].service,'turn_on');
  assert.equal(c.calls[2].data.activity,url(episode));
  assert.equal(c.calls[2].data.entity_id,'remote.android_tv');
  assert.equal(c._providerDestination('Prime Video',c._details.episodeSources[0],c._details,true).deviceKind,'episode');
  c=new Card(); c._details={type:'movie',localSourcesLoading:false,localSources:[src(movie,'movie')]};
  await c._openExactTitle('Prime Video',true);
  assert.equal(c.calls[2].data.activity,url(movie));
  assert.equal(c.calls.filter(x=>['remote','androidtv','play','prior-profile'].includes(x.domain)).length,1);
  c=new Card();c._details.episodeSources=[src(episode,'episode',{season:1,episode:1})];
  c._details.seriesFallbackSources=[src(season,'season',{season:1})];
  await c._openExactTitle('Prime Video',true);
  assert.equal(c.calls[2].data.activity,url(season),'Wrong episode GTI must not be used; season fallback is allowed');
  assert.match(c.message,/manual episode selection/);
  c=new Card();c._details.episodeSources=[{name:'Prime Video',scope:'episode',season:1,episode:2,
    web_url:'https://www.primevideo.com/region/na/detail/0RHJ71XZ2H2VHGFNQ68UEVFXEK?autoplay=1'}];
  await c._openExactTitle('Prime Video',true);
  assert.equal(c.calls.length,0,'Invalid ASIN must never launch the app home screen');
  assert.equal(c._providerDestination('Prime Video',c._details.episodeSources[0],c._details,true).tvCanOpen,false);
  c=new Card();await c._androidLaunchActivity('https://app.primevideo.com/detail?gti=0RHJ71XZ2H2VHGFNQ68UEVFXEK');
  assert.fail('Invalid GTI substitution was accepted');
})().catch(async error=>{
  if (error.message==='Invalid GTI substitution was accepted') return console.error(error), process.exitCode=1;
  if (!/Unsupported Prime Video title ID/.test(error.message)) return console.error(error),process.exitCode=1;
  // Negative direct-launch test is expected to throw. Verify normal controls separately.
  const c=new Card();
  await c._androidLaunchActivity('https://www.netflix.com/watch/1234');
  assert.equal(c.calls[0].domain,'prior-activity');
  await c._launchProvider('Prime Video',true);
  assert.equal(c.calls[1].autoPlay,false);
  await c._applyProfile('Prime Video','Prime Video');
  assert.equal(c.calls.length,2);
  console.log('PASS Prime movie/episode remote GTIs, exact scope, season fallback, invalid-ASIN guard, manual profile/play, and Netflix isolation');
});
