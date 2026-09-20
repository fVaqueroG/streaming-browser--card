const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const addon=fs.readFileSync('tools/streaming-browser-prime-disney-v0490.js','utf8');
class Card {
  constructor(platform='android_tv') {
    this.configPlatform=platform;this._config={tv_entity:'media_player.lg'};
    this.calls=[];this._hass={callService:async(d,s,a)=>{
      this.calls.push({d,s,a});
      if(this.failWebos&&a?.command==='com.webos.applicationManager/launch')throw Error('unavailable');
    }};
    this._details={selectedSeason:2,selectedEpisode:{episode_number:3}};
  }
  _platform(){return this.configPlatform;}
  _androidAdbEntity(){return this.useAdbPlayer?'media_player.adb':null;}
  _adbRemoteEntity(){return this.useAdbRemote?'remote.adb':null;}
  async _androidLaunchActivity(activity){this.calls.push({d:'legacy-remote',a:{activity}});}
  async _openPrimeExactTitle(url){this.calls.push({d:'legacy-prime',a:{url}});}
  _seriesLinksForDetail(detail){return [...detail.episodeSources,...detail.seriesFallbackSources];}
}
vm.runInNewContext(addon,{StreamingBrowserCard:Card,URL,console});
(async()=>{
 let c=new Card();let original='https://www.primevideo.com/detail/B0EXACTEP?ref_=abc';
 await c._androidLaunchActivity(original);
 assert.equal(c.calls.length,1);
 assert.equal(c.calls[0].a.activity,'https://app.primevideo.com/detail?gti=B0EXACTEP',
   'Standard Android TV remote uses Prime app target with selected ID, not generic URL');
 c=new Card();c.useAdbRemote=true;
 await c._androidLaunchActivity(original);
 assert.equal(c.calls[0].d,'remote');
 assert.equal(c.calls[0].s,'send_command');
 assert.equal(c.calls[0].a.entity_id,'remote.adb');
 assert.match(c.calls[0].a.command,/\-p com\.amazon\.amazonvideo\.livingroom/);
 assert.match(c.calls[0].a.command,/gti=B0EXACTEP/);
 c=new Card();c.useAdbPlayer=true;
 await c._androidLaunchActivity(original);
 assert.equal(c.calls[0].d,'androidtv');
 assert.equal(c.calls[0].s,'adb_command');
 c=new Card('webos');
 await c._openPrimeExactTitle(original);
 assert.equal(c.calls[0].a.command,'com.webos.applicationManager/launch');
 assert.equal(c.calls[0].a.payload.id,'amazon');
 assert.equal(c.calls[0].a.payload.params.contentTarget,original,
   'webOS passes the ORIGINAL provider URL including its query');
 c=new Card('webos');c.failWebos=true;
 await c._openPrimeExactTitle(original);
 assert.equal(c.calls[1].a.command,'system.launcher/launch');
 assert.equal(c.calls[1].a.payload.params.gti,'B0EXACTEP');
 c=new Card();
 await c._androidLaunchActivity('https://www.netflix.com/watch/12345?trackId=14170031');
 assert.equal(c.calls[0].a.activity,'https://www.netflix.com/watch/12345?trackId=14170031',
    'Prime override never intercepts Netflix or modifies original device links');
 c=new Card();
 c._details.episodeSources=[
  {name:'Disney+',source:'justwatch',scope:'episode',season:2,episode:3,
   web_url:'https://www.disneyplus.com/series/a-show/abcdefg-12345'},
  {name:'Disney+',source:'watchhub',scope:'episode',season:2,episode:3,
   web_url:'https://www.disneyplus.com/play/episode-abc123456'},
  {name:'Prime Video',source:'justwatch',scope:'episode',season:2,episode:3,
   web_url:'https://www.primevideo.com/detail/B0SHOW'},
  {name:'Netflix',source:'justwatch',scope:'episode',season:2,episode:3,
   web_url:'https://www.netflix.com/watch/12345?trackId=14170031'}];
 c._details.seriesFallbackSources=[
  {name:'Prime Video',source:'justwatch',scope:'series',web_url:'https://www.primevideo.com/detail/B0SHOW'},
  {name:'Disney+',source:'justwatch',scope:'series',web_url:'https://www.disneyplus.com/series/a-show/abcdefg-12345'}];
 let resolved=c._seriesLinksForDetail(c._details);
 assert.equal(resolved.find(x=>x.name==='Disney+'&&x.source==='justwatch'&&x.episode===3).scope,'series',
  'Disney+ series link from episode search must be labeled Series');
 assert.equal(resolved.find(x=>x.name==='Disney+'&&x.source==='watchhub').scope,'episode',
  'A distinct Disney+ playable episode URL may still be labeled Episode');
 assert.equal(resolved.find(x=>x.name==='Prime Video'&&x.episode===3).scope,'series',
  'An identical Prime episode and series URL must not be advertised as Episode');
 assert.equal(resolved.find(x=>x.name==='Netflix'&&x.episode===3).scope,'episode',
  'Netflix episode scope and trackId are unchanged');
 assert.equal(original,'https://www.primevideo.com/detail/B0EXACTEP?ref_=abc');
 console.log('PASS Prime Android native GTI target, optional ADB, webOS original link, Disney+ series classification, shared Prime URL, and Netflix isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
