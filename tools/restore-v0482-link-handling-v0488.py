"""Restore exact v0.4.82 link-selection and launch methods on the current card.

Reads the *tagged historical file* instead of approximating an old launcher.
Only source resolution and TV link methods are restored: no rollback of the
rooms, optional ADB remote, compact UI, power control or other features.
"""
from pathlib import Path
import json
import re
import subprocess

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components/streaming_browser'
frontend = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
readme = root / 'README.md'
current = frontend.read_text(encoding='utf-8')
old_version = 'const STREAMING_BROWSER_VERSION = "0.4.87";'
assert current.count(old_version) == 1, 'Expected v0.4.87 frontend'
marker = '/* Streaming Browser v0.4.88: restored v0.4.82 link handling. */'
assert marker not in current, 'Historical link routing already restored'
historical = subprocess.check_output([
    'git', 'show',
    'v0.4.82:custom_components/streaming_browser/frontend/streaming-browser-card.js',
], cwd=root, text=True)

methods = [
    '_watchmodeSourcesForCurrentTitle',
    '_loadIndependentEpisodeLinks',
    '_pickWatchmodeSource',
    '_androidLaunchActivity',
    '_openNetflixExactTitle',
    '_openExactTitle',
]

def extract_method(source: str, name: str) -> str:
    # All of these methods are defined once in the original class, with two
    # spaces of indentation. The subsequent declaration marks their end.
    match = re.search(r'(?m)^  (?:async )?' + re.escape(name) + r'\s*\(', source)
    assert match, f'Missing v0.4.82 method {name}'
    after = source[match.end():]
    next_method = re.search(r'(?m)^  (?:async )?[A-Za-z_$][\w$]*\s*\(', after)
    assert next_method, f'Could not identify end of v0.4.82 method {name}'
    method = source[match.start():match.end() + next_method.start()].rstrip()
    assert method.endswith('}'), f'Incomplete historical method {name}'
    return method

historical_methods = '\n\n'.join(extract_method(historical, name) for name in methods)
addon = r'''
/* Streaming Browser v0.4.88: restored v0.4.82 link handling. */
(() => {
  const Card = StreamingBrowserCard;
  // These method bodies are copied verbatim from the v0.4.82 release tag by
  // the bundler. Installing them LAST removes the v0.4.83–0.4.87 launch and
  // source-order overrides while preserving the newer UI and remote methods.
  const Historical = class {
__HISTORICAL_METHODS__
  };
  for (const name of __NAMES__) {
    Card.prototype[name] = Historical.prototype[name];
  }

  // v0.4.82 Watchmode / JustWatch results always win. Retain optional WatchHub
  // only when the original source has no links; never reorder a working list.
  const oldMovieSources = Card.prototype._watchmodeSourcesForCurrentTitle;
  Card.prototype._watchmodeSourcesForCurrentTitle = async function(options = {}) {
    let old, originalError;
    try { old = await oldMovieSources.call(this, options); }
    catch (err) { originalError = err; }
    if (Array.isArray(old) && old.length) return old;
    if (this._config?.watchhub_enabled !== false &&
        this._details?.type !== 'tv' && this._watchhubSourcesFor) {
      try {
        const fallback = await this._watchhubSourcesFor(this._details);
        if (Array.isArray(fallback) && fallback.length) return fallback;
      } catch (_) { /* The v0.4.82 error remains authoritative. */ }
    }
    if (originalError) throw originalError;
    return old || [];
  };
  const oldEpisodeSources = Card.prototype._loadIndependentEpisodeLinks;
  Card.prototype._loadIndependentEpisodeLinks = async function(detail, episode) {
    const season = Number(detail.selectedSeason);
    await oldEpisodeSources.call(this, detail, episode);
    if (this._details !== detail || detail.selectedEpisode !== episode ||
        Number(detail.selectedSeason) !== season || detail.episodeSources?.length ||
        this._config?.watchhub_enabled === false || !this._watchhubSourcesFor) return;
    try {
      const fallback = await this._watchhubSourcesFor(detail, episode);
      if (this._details !== detail || detail.selectedEpisode !== episode ||
          Number(detail.selectedSeason) !== season || !fallback?.length) return;
      detail.episodeSources = fallback;
      detail.episodeSourcesError = '';
      this._refreshDetailsInPlace(detail);
    } catch (_) { /* Preserve the original source error and card behavior. */ }
  };

  // The new compact TV button must invoke the original v0.4.82 content-link
  // path whenever it has an HTTPS provider URL, not the v0.4.85 App shortcut.
  // Preserve the destination label as descriptive, not proof of playback.
  const newerDestination = Card.prototype._providerDestination;
  Card.prototype._providerDestination = function(provider, match, detail, isSeries) {
    const newer = newerDestination.call(this, provider, match, detail, isSeries);
    const url = String(match?.web_url || '');
    return { ...newer, tvCanOpen: this._platform() !== 'roku' && /^https:\/\//i.test(url) };
  };
})();
'''
addon = addon.replace('__HISTORICAL_METHODS__', historical_methods)
addon = addon.replace('__NAMES__', json.dumps(methods))
current = current.replace(old_version, 'const STREAMING_BROWSER_VERSION = "0.4.88";', 1)
current = current.replace(' * v0.4.87\n', ' * v0.4.88\n', 1)
frontend.write_text(current.rstrip() + '\n\n' + addon.lstrip(), encoding='utf-8')
meta = json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version'] == '0.4.87'
meta['version'] = '0.4.88'
manifest.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as out:
    out.write('\n\n## v0.4.88: restore v0.4.82 TV links\n\nRestores the actual v0.4.82 Watchmode/JustWatch source-selection and Netflix, Prime Video and general TV link-launch methods from the historical release tag. Existing WatchHub remains an optional fallback only when an old source is empty, rather than replacing working links. The compact TV button now attempts the v0.4.82 content route when a valid link exists. Rooms, power helper, compact controls, and optional ADB remote are retained. TV app acceptance of external links still depends on the device and app.\n')
print('Restored six exact v0.4.82 methods and kept WatchHub fallback in v0.4.88')
