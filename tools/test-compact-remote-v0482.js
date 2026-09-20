const assert = require('node:assert/strict');
const fs = require('node:fs');
const card = fs.readFileSync('custom_components/streaming_browser/frontend/streaming-browser-card.js', 'utf8');
const start = card.indexOf('  async _toggleNuvioRemote() {');
const end = card.indexOf('  _updateNuvioRemoteButton() {', start);
assert(start > 0 && end > start, 'remote method must exist');
const remote = card.slice(start, end);
const compact = remote.slice(remote.indexOf('/* Compact Nuvio-sized remote v0.4.82 */'));
assert(compact.includes('width:176px;max-width:calc(100vw - 20px)'));
assert(compact.includes('width:166px;padding:11px'));
assert(compact.includes('width:132px;max-width:100%'));
assert(compact.includes('width:122px;max-width:100%'));
assert(compact.includes('max-height:calc(100dvh - 20px);overflow-y:auto'));
assert(compact.includes('.sbr-navigation {order:5}') && compact.includes('.sbr-actions {order:4}'));
for(const key of ['WAKE','UP','DOWN','LEFT','RIGHT','ENTER','BACK','HOME','PLAY','PAUSE','MUTE','VOLUME_UP','VOLUME_DOWN']) {
  assert(remote.includes(`data-remote="${key}"`), `${key} remains visible`);
}
assert(remote.includes('[1,2,3,4,5,6,7,8,9,"⌫",0,"↵"]'), 'complete number pad');
assert(remote.includes('portal.querySelectorAll("[data-remote]")'), 'all remote button listeners remain');
assert(remote.includes('await this._prepareDisplayRoute()'), 'HDMI route preparation remains');
assert(remote.includes('await this._ensureTvOn()'), 'Wake command remains');
assert(remote.includes('await this._sendRemoteButton(key)'), 'platform-specific remote dispatch remains');
assert(remote.includes('volumeEntity = this._config.display_entity || this._config.tv_entity'), 'display TV volume routing remains');
assert(card.includes('/* Streaming Browser v0.4.78: room and connection routing.'));
assert(card.includes('/* Streaming Browser v0.4.79: optional per-connection power helper.'));
assert(card.includes('/* Streaming Browser v0.4.80: replace separate power buttons with a single state-driven switch.'));
assert(card.includes('const STREAMING_BROWSER_VERSION = "0.4.82";'));
console.log('PASS Nuvio 176/166px popup and 132/122px D-pad; all controls and existing room/power/volume routes preserved');
