const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
class Card {
  constructor() {
    this._config = {remote_entity: 'remote.android_tv', tv_entity: 'media_player.android_tv'};
    this.platform = 'android_tv'; this.sent = []; this.failRemote = false;
    this._hass = {callService: async (domain, service, data) => {
      this.sent.push([domain, service, data]);
      if (domain === 'remote' && this.failRemote) throw Error('remote unavailable');
    }};
  }
  _platform() {return this.platform;}
  _providerDestination() {return {tvCanOpen: false, deviceKind: 'app'};}
  _openExactTitle() {this.sent.push(['legacy-app']);}
  _prepareDisplayRoute() {this.sent.push(['route']);}
  _ensureTvOn() {this.sent.push(['power']);}
  _pickWatchmodeSource(provider, links) {return links.find(link => link.name === provider) || null;}
  _seriesLinksForDetail(detail) {return detail.episodeSources || [];}
}
vm.runInNewContext(fs.readFileSync(__dirname + '/streaming-browser-crunchyroll-deeplinks-v0492.js','utf8'), {StreamingBrowserCard:Card,URL});
(async () => {
  const c = new Card();
  c._details = {type:'tv',selectedSeason:4,selectedEpisode:{episode_number:23}, episodeSources:[
    {name:'Crunchyroll',scope:'series',web_url:'https://www.crunchyroll.com/series/SERIES'},
    {name:'Crunchyroll',scope:'episode',season:4,episode:23,web_url:'https://www.crunchyroll.com/watch/GE00374423ES419/the-road-to-the-demon-king?utm_source=share'}
  ]};
  const episode = c._details.episodeSources[1];
  assert.equal(c._providerDestination('Crunchyroll',episode,c._details,true).tvCanOpen,true);
  assert.equal(c._providerDestination('Crunchyroll',c._details.episodeSources[0],c._details,true).tvCanOpen,false);
  await c._openExactTitle('Crunchyroll');
  assert.equal(c.sent.find(x=>x[0]==='remote')[2].activity,'crunchyroll://episode/GE00374423ES419');
  assert(!c.sent.some(x=>x[0]==='legacy-app'));
  c.sent=[]; c._details.selectedSeason=1; c._details.selectedEpisode={episode_number:1};
  c._details.episodeSources=[{name:'Crunchyroll',scope:'episode',season:1,episode:1,web_url:'https://www.crunchyroll.com/watch/G2XU0D32Q/i-hate-this-world'}];
  await c._openExactTitle('Crunchyroll');
  assert.equal(c.sent.find(x=>x[0]==='remote')[2].activity,'crunchyroll://episode/G2XU0D32Q');
  assert(!c.sent.some(x=>x[0]==='legacy-app'),'Episode switching never restarts the app');
  c.sent=[]; c.failRemote=true; await c._openExactTitle('Crunchyroll');
  assert.equal(c.sent.find(x=>x[0]==='media_player')[2].media_content_id,'crunchyroll://episode/G2XU0D32Q');
  c.sent=[]; c.failRemote=false;
  c._details={type:'movie',localSources:[{name:'Crunchyroll',scope:'movie',web_url:'https://www.crunchyroll.com/watch/GMEE00351144ES419/demon-slayer-kimetsu-no-yaiba-infinity-castle-i?utm_medium=android'}]};
  assert.equal(c._providerDestination('Crunchyroll',c._details.localSources[0],c._details,false).tvCanOpen,true);
  await c._openExactTitle('Crunchyroll');
  assert.equal(c.sent.find(x=>x[0]==='remote')[2].activity,'crunchyroll://movie/GMEE00351144ES419');
  c.sent=[]; c._details.localSources=[{name:'Crunchyroll',scope:'series',web_url:'https://www.crunchyroll.com/series/XXXX'}];
  await c._openExactTitle('Crunchyroll'); assert(c.sent.some(x=>x[0]==='legacy-app'));
  c.sent=[]; c._details.localSources=[{name:'Crunchyroll',scope:'movie',web_url:'https://attacker.invalid/watch/GMEE00351144ES419'}];
  await c._openExactTitle('Crunchyroll'); assert(c.sent.some(x=>x[0]==='legacy-app'),'Do not route third-party URLs as native links');
  c.sent=[]; await c._openExactTitle('Netflix'); assert(c.sent.some(x=>x[0]==='legacy-app'));
  c.sent=[];c.platform='webos';await c._openExactTitle('Crunchyroll');assert(c.sent.some(x=>x[0]==='legacy-app'));
  console.log('PASS native episodes, episode switching, movie watch ID, non-ADB fallback, exact scope, URL security and provider/platform isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
