"""Keep title dialog scroll position and tidy expanded episodes on async updates."""
from pathlib import Path
import json

base = Path('custom_components/streaming_browser')
js_path = base / 'frontend/streaming-browser-card.js'
src = js_path.read_text(encoding='utf-8')
assert 'const STREAMING_BROWSER_VERSION = "0.4.69";' in src
assert '  _refreshDetailsInPlace(detail) {' not in src

# Preserve the real scrollable .detail element: replacing all of shadowRoot
# loses the popup's scroll context even when scrollTop is copied afterward.
anchor = '  async _loadDetailProviders(detail) {'
assert src.count(anchor) == 1
helper = '''  // Link and provider updates reuse the current popup and its scroll container.
  _refreshDetailsInPlace(detail) {
    if (this._details !== detail || detail.loading || detail.error) return;
    const pane = this.shadowRoot?.querySelector(".detail");
    const previousBody = pane?.querySelector(".body");
    if (!previousBody) { this._render(); return; }
    const oldScrollTop = pane.scrollTop;
    const previousActive = previousBody.querySelector(".episode-row.active");
    const activeTop = previousActive?.getBoundingClientRect().top;
    const previousEpisode = previousActive?.dataset.episodeIndex;
    const template = document.createElement("template");
    template.innerHTML = this._renderDetails().trim();
    const updatedBody = template.content.querySelector(".detail .body");
    if (!updatedBody) return;
    previousBody.replaceWith(updatedBody);
    // Preserve the selected episode's location even when its links expand.
    const nextActive = previousEpisode === undefined ? null :
      updatedBody.querySelector(`.episode-row.active[data-episode-index="${previousEpisode}"]`);
    if (nextActive && Number.isFinite(activeTop)) {
      pane.scrollTop = oldScrollTop + nextActive.getBoundingClientRect().top - activeTop;
    } else {
      pane.scrollTop = oldScrollTop;
    }
    this._bindDetailBodyActions(updatedBody);
  }

  _bindDetailBodyActions(root) {
    root.querySelectorAll("[data-open-provider]").forEach((element) =>
      element.addEventListener("click", () =>
        this._launchProvider(element.dataset.openProvider, false)));
    root.querySelectorAll("[data-season]").forEach((element) =>
      element.addEventListener("click", () => {
        const detail = this._details;
        if (detail) void this._loadSeasonEpisodes(detail, Number(element.dataset.season));
      }));
    root.querySelectorAll("[data-episode-index]").forEach((element) =>
      element.addEventListener("click", () => {
        const detail = this._details;
        if (detail) this._selectEpisode(detail, Number(element.dataset.episodeIndex));
      }));
    root.querySelectorAll("[data-title-provider]").forEach((element) =>
      element.addEventListener("click", () =>
        this._openExactTitle(element.dataset.titleProvider, false)));
    root.querySelectorAll("[data-title-play-provider]").forEach((element) =>
      element.addEventListener("click", () =>
        this._openExactTitle(element.dataset.titlePlayProvider, true)));
    const watchPage = root.querySelector("[data-watch-page]");
    if (watchPage) watchPage.addEventListener("click", () => this._openWatchPage());
  }

'''
src = src.replace(anchor, helper + anchor, 1)

# Convert every asynchronous title/season/provider/episode links completion to
# in-place updates, and refresh the clicked episode without recreating dialog.
changes = [
('''      if (this._details === detail) {
        detail.providersLoading = false;
        this._render();
      }
    }
  }

  async _loadSeasonEpisodes''', '''      if (this._details === detail) {
        detail.providersLoading = false;
        this._refreshDetailsInPlace(detail);
      }
    }
  }

  async _loadSeasonEpisodes'''),
('''      if (this._details === detail && request === detail.seasonRequest) {
        detail.episodesLoading = false;
        this._render();
      }
    }
  }

  _selectEpisode''', '''      if (this._details === detail && request === detail.seasonRequest) {
        detail.episodesLoading = false;
        this._refreshDetailsInPlace(detail);
      }
    }
  }

  _selectEpisode'''),
('''    detail.episodeSourcesLoading = true;
    this._render();
    void this._loadIndependentEpisodeLinks(detail, episode);''', '''    detail.episodeSourcesLoading = true;
    this._refreshDetailsInPlace(detail);
    void this._loadIndependentEpisodeLinks(detail, episode);'''),
('''      if (this._details === detail && detail.selectedEpisode === episode) {
        detail.episodeSourcesLoading = false;
        this._render();
      }
    }
  }

  async _primeLocalTitleLinks''', '''      if (this._details === detail && detail.selectedEpisode === episode) {
        detail.episodeSourcesLoading = false;
        this._refreshDetailsInPlace(detail);
      }
    }
  }

  async _primeLocalTitleLinks'''),
('''      // Do not replace a newer title's popup when an older lookup completes.
      if (this._details === detail) this._render();''', '''      // Never replace the scrollable popup when a movie link finishes.
      if (this._details === detail) this._refreshDetailsInPlace(detail);'''),
]
for original, replacement in changes:
    assert src.count(original) == 1, f'Async anchor changed: {original[:75]!r}'
    src = src.replace(original, replacement, 1)

# Reuse the same action handlers on full render and the new in-place updates.
start = src.index('    root\n      .querySelectorAll("[data-open-provider]")', src.index('  _bindEvents() {'))
end = src.index('\n  }\n}\n\n\nclass StreamingBrowserCardEditor', start)
old_bindings = src[start:end]
assert 'data-watch-page' in old_bindings and 'data-episode-index' in old_bindings
src = src[:start] + '    this._bindDetailBodyActions(root);' + src[end:]

# The selected episode's information and platforms form one unified item.
css_changes = [
('''.episode-row.active { border-color:var(--primary-color);
        box-shadow:inset 0 0 0 1px var(--primary-color); }''', '''.episode-row.active { border-color:var(--primary-color); border-radius:12px 12px 0 0;
        box-shadow:inset 0 0 0 1px var(--primary-color); }'''),
('''.episode-inline-actions { padding:12px 12px 17px;background:var(--secondary-background-color);
        border:1px solid var(--primary-color);border-radius:0 0 12px 12px;margin:0 0 9px; }''', '''.episode-inline-actions { padding:12px 14px 16px;background:var(--secondary-background-color);
        border:1px solid var(--primary-color);border-top:0;
        border-radius:0 0 12px 12px;margin:0 0 12px; }
      .episode-inline-actions > strong { display:block; margin-bottom:10px; }
      .episode-inline-actions .provider-card { min-width:0; align-items:flex-start; }
      .episode-inline-actions .provider-main { min-width:0; flex:1; }
      .episode-inline-actions .provider-actions { gap:7px; }'''),
]
for original, replacement in css_changes:
    assert src.count(original) == 1, f'Episode style changed: {original[:40]}'
    src = src.replace(original, replacement, 1)

# Do not repeat "no exact episode link" inside every provider card when the
# inline episode already displays one clear, global availability message.
old_status = '''        const sourceStatus = loading
          ? this._t("local_link_loading")
          : !url ? this._t("local_link_missing") : "";'''
new_status = '''        const sourceStatus = isSeries ? "" : loading
          ? this._t("local_link_loading")
          : !url ? this._t("local_link_missing") : "";'''
assert src.count(old_status) == 1
src = src.replace(old_status, new_status, 1)
# No provider rows without a playable link or an available app on TV.
old_source = '''        const tvSource = this._sourceForProvider(name);
        const groups'''
new_source = '''        const tvSource = this._sourceForProvider(name);
        if (isSeries && !loading && !url && !tvSource) return "";
        const groups'''
assert src.count(old_source) == 1
src = src.replace(old_source, new_source, 1)

src = src.replace(' * v0.4.69\n', ' * v0.4.70\n', 1)
src = src.replace('const STREAMING_BROWSER_VERSION = "0.4.69";', 'const STREAMING_BROWSER_VERSION = "0.4.70";', 1)
src = src.replace('"%c STREAMING-BROWSER-CARD %c v0.4.69 "', '"%c STREAMING-BROWSER-CARD %c v0.4.70 "', 1)
js_path.write_text(src, encoding='utf-8')
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.69'
manifest['version'] = '0.4.70'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('Updated Streaming Browser v0.4.70: in-place link refresh and cohesive episode cards')