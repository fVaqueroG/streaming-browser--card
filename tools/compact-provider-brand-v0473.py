"""Use provider logo as the visible brand in Streaming Browser source cards."""
from pathlib import Path
import json

base = Path('custom_components/streaming_browser')
card = base / 'frontend/streaming-browser-card.js'
src = card.read_text(encoding='utf-8')
assert 'const STREAMING_BROWSER_VERSION = "0.4.72";' in src
old_markup = '''          <div class="provider-card">
            ${this._providerLogo(provider)}
            <div class="provider-main">
              <div class="provider-name">${this._esc(name)}</div>
              ${groups ? `<div class="provider-source">${this._esc(groups)}</div>` : ""}
              ${sourceStatus ? `<div class="provider-source">${this._esc(sourceStatus)}</div>` : ""}
              <div class="provider-actions">'''
new_markup = '''          <div class="provider-card">
            <span class="provider-brand ${provider.logo_path ? "" : "provider-brand-fallback"}"
              role="img" aria-label="${this._esc(name)}" title="${this._esc(name)}">
              ${provider.logo_path ? this._providerLogo(provider)
                : `<span class="provider-name-fallback">${this._esc(name)}</span>`}
            </span>
            <div class="provider-main">
              ${groups ? `<span class="provider-source">${this._esc(groups)}</span>` : ""}
              ${sourceStatus ? `<span class="provider-source">${this._esc(sourceStatus)}</span>` : ""}
              <div class="provider-actions">'''
assert src.count(old_markup) == 1, 'provider markup changed; inspect before patching'
src = src.replace(old_markup, new_markup, 1)
old_styles = '''      .provider-info {
        flex: 1;
        min-width: 0;
      }

      .provider-name {
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .provider-source {
        font-size: 10px;
        opacity: .62;
        margin-top: 2px;
      }

      .provider-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 7px;
      }'''
new_styles = '''      /* Brand logo replaces the redundant visible service name. Preserve the
         name for assistive technology, hover, and services without a logo. */
      .provider-brand {
        display: grid;
        place-items: center;
        flex: 0 0 44px;
        width: 44px;
        min-height: 44px;
      }
      .provider-brand-fallback {
        flex: 0 1 110px;
        width: auto;
        max-width: 110px;
      }
      .provider-name-fallback {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      .provider-main {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 10px;
      }
      .provider-source {
        font-size: 10px;
        opacity: .72;
        margin: 0;
      }
      .provider-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin: 0 0 0 auto;
      }'''
assert src.count(old_styles) == 1, 'provider styling changed; inspect before patching'
src = src.replace(old_styles, new_styles, 1)
assert src.count('const STREAMING_BROWSER_VERSION = "0.4.72";') == 1
src = src.replace('const STREAMING_BROWSER_VERSION = "0.4.72";', 'const STREAMING_BROWSER_VERSION = "0.4.73";', 1)
src = src.replace(' * v0.4.72\n', ' * v0.4.73\n', 1)
src = src.replace('STREAMING-BROWSER-CARD %c v0.4.72', 'STREAMING-BROWSER-CARD %c v0.4.73', 1)
card.write_text(src, encoding='utf-8')
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.72', 'manifest version changed unexpectedly'
manifest['version'] = '0.4.73'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('PASS: compact provider layout with logo, accessible brand, and no duplicate visible name')