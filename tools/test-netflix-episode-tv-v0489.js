const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const addon = fs.readFileSync('tools/streaming-browser-netflix-episode-tv-v0489.js', 'utf8');
class Card {
  constructor(platform = 'android_tv') {
    this._config = {tv_entity: 'media_player.lg', remote_entity: 'remote.android'};
    this._devicePlatform = platform;
    this._details = {type: 'tv', selectedSeason: 2, selectedEpisode: {episode_number: 3}};
    this.calls = [];
    this._hass = {callService: async (domain, service, data) => {
      this.calls.push({domain, service, data});
      if (this.rejectWebos && domain === 'webostv' && data.command === 'com.webos.applicationManager/launch')
        throw new Error('Unsupported webOS contract');
    }};
  }
  _platform() {return this._devicePlatform;}
  _androidAdbEntity(){return this.useAdbPlayer ? 'media_player.android_adb' : null;}
  _adbRemoteEntity(){return this.useAdbRemote ? 'remote.adb_tv' : null;}
  async _androidAdbCommand(command){this.calls.push({domain:'androidtv', service:'adb_command', data:{command}});}
  async _androidLaunchActivity(activity){this.calls.push({domain:'remote',service:'turn_on',data:{activity}});}
  async _openNetflixExactTitle(url){this.calls.push({domain:'legacy',data:{url}});}
}
vm.runInNewContext(addon, {StreamingBrowserCard:Card, URL, console});
(async () => {
  const link='https://www.netflix.com/watch/80200123?trackId=14170031&foo=bar';
  let c=new Card();
  await c._openNetflixExactTitle(link);
  assert.equal(c.calls.length,1);
  assert.equal(c.calls[0].domain,'remote');
  assert.equal(c.calls[0].data.activity,'netflix://title/80200123',
    'Android TV must send a native episode target, not generic Netflix HTTPS URL');

  c=new Card();c.useAdbRemote=true;
  await c._openNetflixExactTitle(link);
  assert.equal(c.calls[0].service,'send_command');
  assert.equal(c.calls[0].data.entity_id,'remote.adb_tv');
  assert.match(c.calls[0].data.command,/\-n com\.netflix\.ninja\/\.MainActivity/);
  assert.match(c.calls[0].data.command,/netflix:\/\/title\/80200123/);

  c=new Card();c.useAdbPlayer=true;
  await c._openNetflixExactTitle(link);
  assert.equal(c.calls[0].service,'adb_command');
  assert.match(c.calls[0].data.command,/netflix:\/\/title\/80200123/);

  c=new Card('webos');
  await c._openNetflixExactTitle(link);
  assert.equal(c.calls[0].data.command,'com.webos.applicationManager/launch');
  assert.equal(c.calls[0].data.payload.id,'netflix');
  assert.equal(c.calls[0].data.payload.params.contentTarget,link,
    'webOS Netflix contentTarget must retain the selected episode ID and trackId');

  c=new Card('webos');c.rejectWebos=true;
  await c._openNetflixExactTitle(link);
  assert.equal(c.calls[1].data.command,'system.launcher/launch');
  assert.match(c.calls[1].data.payload.contentId,/watch\/80200123/);
  assert.doesNotMatch(c.calls[1].data.payload.contentId,/catalog\/titles\/movies/);

  c=new Card();c._details.type='movie';
  await c._openNetflixExactTitle(link);
  assert.equal(c.calls[0].domain,'legacy', 'Netflix movie routing must remain unchanged');
  c=new Card();
  await c._openNetflixExactTitle('https://www.netflix.com/title/100?trackId=14170031');
  assert.equal(c.calls[0].domain,'legacy', 'A Netflix series page cannot be treated as an episode');
  assert.equal(link.includes('trackId=14170031'),true,'Original provider URL remains unchanged');
  console.log('PASS native Android Netflix episode targets, optional ADB routes, exact webOS URL with trackId, episode fallback, and unchanged movie paths');
})().catch(error => {console.error(error);process.exitCode=1;});
