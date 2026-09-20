"""Wire the v0.4.82 launcher to the new per-provider scope resolver."""
from pathlib import Path
card = Path(__file__).resolve().parents[1]/'custom_components/streaming_browser/frontend/streaming-browser-card.js'
source = card.read_text(encoding='utf-8')
old = 'isSeries ? sources.filter(validEpisodeLink) : sources'
assert source.count(old)==1, 'Locate exactly one modern provider-button source filter'
source = source.replace(old,'sources',1)
marker = '/* Streaming Browser v0.4.88: series link routing finalization. */'
assert marker not in source
source += '''
/* Streaming Browser v0.4.88: series link routing finalization. */
(() => {
  const Card = StreamingBrowserCard;
  const legacyOpen = Card.prototype._openExactTitle;
  const previousDestination = Card.prototype._providerDestination;

  // v0.4.82 dispatch remains untouched; only its source list is temporarily
  // supplied by the same per-provider priority resolver used by the UI.
  Card.prototype._openExactTitle = async function(provider, autoPlay=false) {
    const detail = this._details;
    if (!detail || detail.type !== 'tv' || !detail.selectedEpisode)
      return legacyOpen.call(this,provider,autoPlay);
    const original = detail.episodeSources;
    detail.episodeSources = this._seriesLinksForDetail(detail);
    try { return await legacyOpen.call(this,provider,autoPlay); }
    finally { detail.episodeSources = original; }
  };
  Card.prototype._providerDestination = function(provider,link,detail,isSeries) {
    const original = previousDestination.call(this,provider,link,detail,isSeries);
    if (!isSeries || !link?.web_url) return original;
    const scope = String(link.scope || 'series').toLowerCase();
    return {...original, deviceKind:['episode','season','series'].includes(scope) ? scope : 'series',
      tvCanOpen:this._platform() !== 'roku' && /^https:\\/\\//i.test(link.web_url)};
  };
})();
'''
card.write_text(source,encoding='utf-8')
print('Matched the historical TV launcher and in-button captions to the same episode/season/series selection')
