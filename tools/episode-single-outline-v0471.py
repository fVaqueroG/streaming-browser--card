"""Give the selected episode and its links one continuous, uniform blue outline."""
from pathlib import Path
import json

root = Path('custom_components/streaming_browser')
file = root / 'frontend/streaming-browser-card.js'
src = file.read_text(encoding='utf-8')
assert 'const STREAMING_BROWSER_VERSION = "0.4.70";' in src
old_css = '''      .episode-row.active { border-color:var(--primary-color); border-radius:12px 12px 0 0;
        box-shadow:inset 0 0 0 1px var(--primary-color); }
      .episode-row-container { border-bottom:1px solid var(--divider-color); }
      .episode-inline-actions { padding:12px 14px 16px;background:var(--secondary-background-color);
        border:1px solid var(--primary-color);border-top:0;
        border-radius:0 0 12px 12px;margin:0 0 12px; }'''
new_css = '''      /* The SELECTED EPISODE is one component: row + expanded provider links.
         Put the only accent outline on the shared wrapper, not on its children. */
      .episode-row-container { border-bottom:1px solid var(--divider-color); }
      .episode-row-container.selected {
        border:2px solid var(--primary-color);
        border-radius:12px;
        overflow:hidden;
        background:var(--secondary-background-color);
      }
      .episode-row-container.selected .episode-row.active {
        border:0;
        border-radius:0;
        box-shadow:none;
      }
      .episode-inline-actions {
        padding:12px 14px 16px;
        background:var(--secondary-background-color);
        border:0;
        border-top:1px solid var(--divider-color);
        border-radius:0;
        margin:0;
      }'''
assert src.count(old_css) == 1, 'episode CSS has changed'
src = src.replace(old_css, new_css, 1)
old_row = 'return `<div class="episode-row-container"><button type="button" class="episode-row ${active ? "active" : ""}"'
new_row = 'return `<div class="episode-row-container ${active ? "selected" : ""}"><button type="button" class="episode-row ${active ? "active" : ""}"'
assert src.count(old_row) == 1, 'episode row markup has changed'
src = src.replace(old_row, new_row, 1)
assert src.count('const STREAMING_BROWSER_VERSION = "0.4.70";') == 1
src = src.replace('const STREAMING_BROWSER_VERSION = "0.4.70";', 'const STREAMING_BROWSER_VERSION = "0.4.71";', 1)
src = src.replace(' * v0.4.70\n', ' * v0.4.71\n', 1)
src = src.replace('STREAMING-BROWSER-CARD %c v0.4.70', 'STREAMING-BROWSER-CARD %c v0.4.71', 1)
file.write_text(src, encoding='utf-8')
manifest_file = root / 'manifest.json'
manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.70', 'manifest version changed unexpectedly'
manifest['version'] = '0.4.71'
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('PASS: v0.4.71 single 2px selected-episode outline across episode and sources')
