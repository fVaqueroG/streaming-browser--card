"""Bundle versioned Home Assistant-hosted Streaming Browser logos (v0.4.114)."""
from pathlib import Path
import json

ROOT = Path('custom_components/streaming_browser')
BACKEND = ROOT / '__init__.py'
BRANDING = ROOT / 'frontend/streaming-browser-branding.js'
MANIFEST = ROOT / 'manifest.json'
V2 = ROOT / 'frontend/streaming-browser-card-v2.js'
README = Path('README.md')


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding='utf-8')
    assert text.count(old) == 1, f'Unexpected replacement anchor in {path}: {old[:60]!r}'
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


for name in ('horizontal', 'vertical', 'icon'):
    blob = ROOT / 'frontend/assets' / f'streaming-browser-{name}.webp'
    data = blob.read_bytes()
    assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', f'Missing bundled WebP: {blob}'

replace_once(BACKEND,
    '_BRANDING_RESOURCE_URL = f"{_BRANDING_URL}?v={_VERSION}"\n',
    '_BRANDING_RESOURCE_URL = f"{_BRANDING_URL}?v={_VERSION}"\n'
    '_LOGO_FILES = {name: _INTEGRATION_DIR / "frontend" / "assets" / f"streaming-browser-{name}.webp"\n'
    '               for name in ("horizontal", "vertical", "icon")}\n')
replace_once(BACKEND,
    '        if branding_available:\n'
    '            paths.append(StaticPathConfig(_BRANDING_URL, str(_BRANDING_FILE), cache_headers=False))\n'
    '        await hass.http.async_register_static_paths(paths)\n',
    '        if branding_available:\n'
    '            paths.append(StaticPathConfig(_BRANDING_URL, str(_BRANDING_FILE), cache_headers=False))\n'
    '        # Served from this integration, not /local or an external image host.\n'
    '        # Stable versioned URLs allow the browser to cache these tiny assets.\n'
    '        for name, file in _LOGO_FILES.items():\n'
    '            if file.is_file():\n'
    '                paths.append(StaticPathConfig(\n'
    '                    f"/streaming_browser/assets/streaming-browser-{name}.webp",\n'
    '                    str(file), cache_headers=True))\n'
    '            else:\n'
    '                _LOGGER.warning("Missing bundled Streaming Browser logo: %s", file)\n'
    '        await hass.http.async_register_static_paths(paths)\n')
replace_once(BRANDING,
    '/* Streaming Browser branding extension.\n'
    ' * Loaded after the V2 and popup custom elements. The PNG files are user-supplied\n'
    ' * through /local by default, or can be overridden with logo_horizontal_url and\n'
    ' * logo_vertical_url in Lovelace YAML. Missing images fall back to existing text.\n'
    ' */',
    '/* Streaming Browser branding extension.\n'
    ' * Official compact WebP logos ship with the integration and are served locally\n'
    ' * by Home Assistant. Explicit custom logo URLs are still supported.\n'
    ' * Missing images fall back to the existing accessible icon/text.\n'
    ' */')
replace_once(BRANDING,
    "  const HORIZONTAL = '/local/streaming-browser-horizontal.png';\n"
    "  const VERTICAL = '/local/streaming-browser-vertical.png';\n"
    "  const asset = (config, kind) => String(\n"
    "    config?.[kind === 'vertical' ? 'logo_vertical_url' : 'logo_horizontal_url'] ||\n"
    "    (kind === 'vertical' ? VERTICAL : HORIZONTAL)\n"
    "  ).trim();\n",
    "  const HORIZONTAL = '/streaming_browser/assets/streaming-browser-horizontal.webp?v=0.4.114';\n"
    "  const VERTICAL = '/streaming_browser/assets/streaming-browser-vertical.webp?v=0.4.114';\n"
    "  const ICON = '/streaming_browser/assets/streaming-browser-icon.webp?v=0.4.114';\n"
    "  const asset = (config, kind) => {\n"
    "    const name = kind === 'vertical' ? 'vertical' : kind === 'icon' ? 'icon' : 'horizontal';\n"
    "    const defaults = { horizontal: HORIZONTAL, vertical: VERTICAL, icon: ICON };\n"
    "    // Old custom URLs still work, but no URL or /config/www image is required.\n"
    "    return String(config?.[`logo_${name}_url`] || defaults[name]).trim();\n"
    "  };\n")
replace_once(BRANDING,
    "  // Three choices on the compact button: vertical, horizontal, or MDI icon + text.\n",
    "  // Four choices: vertical, horizontal, MDI icon + text, or logo-only mark.\n")
replace_once(BRANDING,
    "    if (mode !== 'vertical' && mode !== 'horizontal') return result;\n",
    "    if (!['vertical', 'horizontal', 'icon_only'].includes(mode)) return result;\n")
replace_once(BRANDING,
    "    const logo = makeImage(this._config, mode, 'sb-popup-button-logo');\n",
    "    const logo = makeImage(this._config, mode === 'icon_only' ? 'icon' : mode, 'sb-popup-button-logo');\n")
replace_once(BRANDING,
    '      button[data-logo-mode="vertical"] .sb-popup-button-logo { width:150px; max-width:100%; height:120px; }\n',
    '      button[data-logo-mode="vertical"] .sb-popup-button-logo { width:150px; max-width:100%; height:120px; }\n'
    '      button[data-logo-mode="icon_only"].sb-popup-logo-ready { min-height:60px; }\n'
    '      button[data-logo-mode="icon_only"] .sb-popup-button-logo { width:105px; max-width:100%; height:50px; }\n')
replace_once(BRANDING,
    "      ['vertical', 'Vertical logo'], ['horizontal', 'Horizontal logo'], ['icon_text', 'Icon + text'],\n",
    "      ['vertical', 'Vertical logo'], ['horizontal', 'Horizontal logo'],\n"
    "      ['icon_only', 'Icon-only logo'], ['icon_text', 'Icon + text'],\n")
replace_once(BRANDING,
    "      ['logo_vertical_url', 'Vertical logo URL', VERTICAL],\n",
    "      ['logo_vertical_url', 'Vertical logo URL', VERTICAL],\n"
    "      ['logo_icon_url', 'Icon-only logo URL', ICON],\n")
replace_once(V2,
    'const STREAMING_BROWSER_VERSION = "0.4.111";',
    'const STREAMING_BROWSER_VERSION = "0.4.114";')
manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
assert manifest['version'] == '0.4.113', 'Expected version 0.4.113 before updating'
manifest['version'] = '0.4.114'
MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
with README.open('a', encoding='utf-8') as f:
    f.write('\n\n### Built-in Streaming Browser logos (v0.4.114)\n\n'
            'Horizontal, vertical, and icon-only WebP logos are included with the HACS '
            'integration and served from `/streaming_browser/assets/`. No manual '
            '`/config/www/` PNG installation or external image download is needed. '
            'The images have cacheable, versioned URLs. The popup card supports '
            '`button_display: horizontal`, `vertical`, `icon_only`, or `icon_text`. '
            'Explicit `logo_*_url` overrides remain optional.\n')
print('PASS: v0.4.114 images, Home Assistant routes, four button modes and versioned cache URLs')