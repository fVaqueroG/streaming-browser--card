"""Make Streaming Browser fill its assigned dashboard area across devices.

Home Assistant owns the width of Masonry columns and section containers. We
request a full-width section cell and use fluid CSS inside the assigned area;
we deliberately do not escape the parent column with viewport-width hacks.
"""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components/streaming_browser'
card = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
readme = root / 'README.md'
text = card.read_text(encoding='utf-8')
old_version = 'const STREAMING_BROWSER_VERSION = "0.4.97";'
assert text.count(old_version) == 1, 'Expected released v0.4.97; inspect newer changes before patching'
old_grid = '''  getGridOptions() {
    return {
      rows: 9,
      columns: 12,
      min_rows: 5,
      min_columns: 6,
    };
  }
'''
new_grid = '''  getGridOptions() {
    // In a Sections view take all columns of the section, at every breakpoint.
    // Height is content-driven: catalog rows and episode lists grow naturally.
    return { columns: "full", min_columns: 12 };
  }
'''
assert text.count(old_grid) == 1, 'Could not uniquely locate original Sections grid sizing'
text = text.replace(old_grid, new_grid, 1)
old_dialog = '''      .detail {
        width: min(860px,96vw);
        max-height: 88vh;
'''
new_dialog = '''      .detail {
        /* Fluid modal: use the available viewport minus overlay padding. */
        width: 100%;
        max-width: 100%;
        min-width: 0;
        max-height: min(92vh, 92dvh);
'''
assert text.count(old_dialog) == 1, 'Could not uniquely locate previous 860px detail cap'
text = text.replace(old_dialog, new_dialog, 1)
old_host = '''        :host {
          display: block;
        }

        ha-card {
          overflow: hidden;
'''
new_host = '''        /* Streaming Browser v0.4.98: container-responsive full-width layout. */
        :host {
          display: block;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }

        ha-card {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
'''
assert text.count(old_host) == 1, 'Could not uniquely locate main card host styles'
text = text.replace(old_host, new_host, 1)
old_wrap = '''        .wrap {
          padding: 18px;
          position: relative;
          min-height: 260px;
        }
'''
new_wrap = '''        .wrap {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          padding: clamp(12px, 1.8vw, 24px);
          position: relative;
          min-height: 260px;
        }
        .catalog, .catalog-section, .catalog-row {
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }
'''
assert text.count(old_wrap) == 1, 'Could not uniquely locate wrapper styles'
text = text.replace(old_wrap, new_wrap, 1)
old_search = '''        .search {
          flex: 1 1 260px;
          max-width: 520px;
'''
new_search = '''        .search {
          flex: 1 1 260px;
          min-width: 0;
          max-width: 100%;
'''
assert text.count(old_search) == 1, 'Could not uniquely locate search width cap'
text = text.replace(old_search, new_search, 1)
old_overlay = '''      .overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
'''
new_overlay = '''      .overlay {
        position: fixed;
        inset: 0;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        z-index: 9999;
'''
assert text.count(old_overlay) == 1, 'Could not uniquely locate detail overlay'
text = text.replace(old_overlay, new_overlay, 1)
text = text.replace(old_version, 'const STREAMING_BROWSER_VERSION = "0.4.98";', 1)
card.write_text(text, encoding='utf-8')
meta = json.loads(manifest.read_text(encoding='utf-8'))
assert meta['version'] == '0.4.97', 'Expected matching v0.4.97 integration manifest'
meta['version'] = '0.4.98'
manifest.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as fh:
    fh.write('\n\n## v0.4.98: adaptive card width on tablets and phones\n\nStreaming Browser requests full section width in Home Assistant Sections views and uses 100% of its allocated container, with a fluid detail popup instead of the former 860px cap. Search, catalog rows, and wrapper fit the available width without causing horizontal page overflow; phone styling, remote and playback integrations are unchanged. Home Assistant Masonry/sidebar/stack layouts still own their parent column width: for true screen-wide viewing, place this card alone in a Panel view, or use a full-width section with the card set to Full width on its Layout tab.\n')
print('Patched v0.4.98: full-width Sections sizing, fluid card and detail popup')
