const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const text = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js', 'utf8');
const marker = '/* Streaming Browser v0.4.91: Crunchyroll Android TV opens its installed app, never a generic web intent. */';
assert.equal(text.split(marker).length, 2, 'One installed Crunchyroll patch');
class Card {
  constructor() {
    this._config = {platform:'android_tv',remote_entity:'remote.living_room',tv_entity:'media_player.tv'};
    this.sent=[];this.toasts=[];this.failure='';
    this._hass={callService:async(d,s,a)=>{
      this.sent.push([d,s,a]);
      if (this.failure === d+'.'+s) throw Error('Unavailable');
    }};
  }
  _platform(){return this._config.platform;}
  _providerDestination(){return {tvCanOpen:true,deviceKind:'episode'};}
  _androidAdbEntity(){return null;}
  _adbRemoteEntity(){return null;}
  _androidAppIsActive(){return false;}
  _prepareDisplayRoute(){this.sent.push(['display']);}
  _ensureTvOn(){this.sent.push(['power']);}
  _locale(){return 'en';}
  _toast(s){this.toasts.push(s);}
  _openExactTitle(){this.sent.push(['generic-url']);}
  _openOfficialCrunchyrollApp(){this.sent.push(['legacy-app']);}
  _launchProvider(){this.sent.push(['legacy-provider']);}
}
vm.runInNewContext(text.slice(text.indexOf(marker)), {StreamingBrowserCard:Card});
(async()=>{
  const card=new Card();
  const link={scope:'episode',season:1,episode:2,web_url:'https://www.crunchyroll.com/watch/ABC123/episode'};
  assert.equal(card._providerDestination('Crunchyroll',link,{},true).tvCanOpen,false);
  assert.equal(card._providerDestination('Crunchyroll',link,{},true).deviceKind,'episode',
    'Device link classification remains unchanged');
  await card._openExactTitle('Crunchyroll');
  const launch=card.sent.find(x=>x[0]==='remote'&&x[1]==='turn_on');
  assert.equal(launch[2].activity,'com.crunchyroll.crunchyroid');
  assert.equal(launch[2].entity_id,'remote.living_room');
  assert.ok(!card.sent.some(x=>x[0]==='generic-url'||x[0]==='legacy-app'));
  assert.ok(!JSON.stringify(card.sent).includes('crunchyroll.com/watch/'));
  card.sent=[];
  await card._launchProvider('Crunchyroll');
  assert.equal(card.sent.find(x=>x[0]==='remote'&&x[1]==='turn_on')[2].activity,
    'com.crunchyroll.crunchyroid', 'App-labeled button opens installed app');
  card.sent=[];card.failure='remote.turn_on';
  await card._openExactTitle('Crunchyroll');
  assert.equal(card.sent.find(x=>x[0]==='media_player'&&x[1]==='play_media')[2].media_content_type,'app');
  assert.equal(card.sent.find(x=>x[0]==='media_player'&&x[1]==='play_media')[2].media_content_id,
    'com.crunchyroll.crunchyroid', 'Fallback remains package-based');
  card.sent=[];card.failure='';card._config.platform='webos';
  assert.equal(card._providerDestination('Crunchyroll',link,{},true).tvCanOpen,true,
    'Do not modify LG webOS link logic');
  await card._openExactTitle('Crunchyroll');
  assert.ok(card.sent.some(x=>x[0]==='generic-url'));
  card.sent=[];card._config.platform='android_tv';
  await card._openExactTitle('Netflix');
  assert.ok(card.sent.some(x=>x[0]==='generic-url'),'Netflix and other providers unaffected');
  console.log('PASS Crunchyroll package-targeted TV app launch, legacy exact-link guard, honest TV App action, media-player fallback, unchanged device scope, webOS and other providers');
})().catch(e=>{console.error(e);process.exitCode=1;});
