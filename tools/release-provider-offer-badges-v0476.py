"""Patch provider availability badges without changing source launch actions."""
from pathlib import Path
import json

root = Path('custom_components/streaming_browser')
card = root / 'frontend/streaming-browser-card.js'
src = card.read_text(encoding='utf-8')
old_version = '0.4.75'
new_version = '0.4.76'
assert src.count(f'const STREAMING_BROWSER_VERSION = "{old_version}";') == 1

old_css = '''      .provider-brand {
        display: grid;
        place-items: center;
        flex: 0 0 44px;
        width: 44px;
        min-height: 44px;
      }'''
new_css = '''      .provider-brand {
        display: grid;
        place-items: center;
        flex: 0 0 44px;
        width: 44px;
        min-height: 44px;
        position: relative;
        overflow: visible;
      }
      /* A tiny offer badge floats above the service logo without resizing it. */
      .provider-offer-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        z-index: 1;
        min-width: 21px;
        height: 21px;
        box-sizing: border-box;
        padding: 1px 2px;
        display: inline-flex;
        justify-content: center;
        align-items: center;
        gap: 1px;
        border-radius: 11px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color);
        box-shadow: 0 1px 3px #0006;
        pointer-events: none;
      }
      .provider-offer-badge ha-icon { --mdc-icon-size: 15px; }
      .provider-offer-badge.ads { right: -13px; min-width: 31px; }
      .provider-offer-badge .provider-ad-text {
        font: 700 7px/1 system-ui, sans-serif;
        letter-spacing: -0.02em;
      }'''
assert src.count(old_css) == 1, 'provider logo styling changed'
src = src.replace(old_css, new_css, 1)

anchor = '''  // A title detail and the selected episode use the SAME provider-card layout,
  // but only the matching title/episode link may be opened. Never substitute a
  // whole-series URL for an episode-specific URL.
  _renderProviderCards(detail, providers, isSeries = false) {'''
new_anchor = '''  // TMDB offer types, not provider names or URLs, determine the logo badge.
  // A subscription offer is preferred when one provider lists several ways to watch.
  _providerOffer(groups) {
    const types = new Set((Array.isArray(groups) ? groups : [])
      .map((value) => String(value).toLowerCase()));
    const es = this._locale().startsWith("es");
    if (types.has("flatrate")) {
      return { kind: "included", icon: "mdi:currency-usd-off",
        label: es ? "Incluido con suscripción" : "Included with subscription" };
    }
    if (types.has("ads")) {
      return { kind: "ads", icon: "mdi:play-circle-outline",
        label: es ? "Gratis con anuncios" : "Free with ads" };
    }
    if (types.has("free")) {
      return { kind: "included", icon: "mdi:currency-usd-off",
        label: es ? "Gratis" : "Free" };
    }
    if (types.has("rent") || types.has("buy")) {
      return { kind: "paid", icon: "mdi:currency-usd",
        label: es ? "Alquiler o compra adicional" : "Additional rental or purchase" };
    }
    return null;
  }

  // A title detail and the selected episode use the SAME provider-card layout,
  // but only the matching title/episode link may be opened. Never substitute a
  // whole-series URL for an episode-specific URL.
  _renderProviderCards(detail, providers, isSeries = false) {'''
assert src.count(anchor) == 1, 'provider renderer anchor changed'
src = src.replace(anchor, new_anchor, 1)

old = '''        const groups = Array.isArray(provider.groups) ? provider.groups.join(" · ") : "";
        const sourceStatus = isSeries ? "" : loading
          ? this._t("local_link_loading")
          : !url ? this._t("local_link_missing") : "";
        return `
          <div class="provider-card">
            <span class="provider-brand ${provider.logo_path ? "" : "provider-brand-fallback"}"
              role="img" aria-label="${this._esc(name)}" title="${this._esc(name)}">
              ${provider.logo_path ? this._providerLogo(provider)
                : `<span class="provider-name-fallback">${this._esc(name)}</span>`}
            </span>
            <div class="provider-main">
              ${groups ? `<span class="provider-source">${this._esc(groups)}</span>` : ""}
              ${sourceStatus ? `<span class="provider-source">${this._esc(sourceStatus)}</span>` : ""}'''
new = '''        const offer = this._providerOffer(provider.groups);
        const brandLabel = name + (offer ? ` · ${offer.label}` : "");
        const sourceStatus = isSeries ? "" : loading
          ? this._t("local_link_loading")
          : !url ? this._t("local_link_missing") : "";
        return `
          <div class="provider-card">
            <span class="provider-brand ${provider.logo_path ? "" : "provider-brand-fallback"}"
              role="img" aria-label="${this._esc(brandLabel)}" title="${this._esc(brandLabel)}">
              ${provider.logo_path ? this._providerLogo(provider)
                : `<span class="provider-name-fallback">${this._esc(name)}</span>`}
              ${offer ? `<span class="provider-offer-badge ${offer.kind}" aria-hidden="true"><ha-icon icon="${offer.icon}"></ha-icon>${offer.kind === "ads" ? `<span class="provider-ad-text">AD</span>` : ""}</span>` : ""}
            </span>
            <div class="provider-main">
              ${sourceStatus ? `<span class="provider-source">${this._esc(sourceStatus)}</span>` : ""}'''
assert src.count(old) == 1, 'provider card template changed'
src = src.replace(old, new, 1)
src = src.replace(f'const STREAMING_BROWSER_VERSION = "{old_version}";',
                  f'const STREAMING_BROWSER_VERSION = "{new_version}";', 1)
src = src.replace(' * v0.4.75\n', ' * v0.4.76\n', 1)
src = src.replace('STREAMING-BROWSER-CARD %c v0.4.75', 'STREAMING-BROWSER-CARD %c v0.4.76', 1)
card.write_text(src, encoding='utf-8')
manifest_path = root / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == old_version
manifest['version'] = new_version
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
readme = Path('README.md')
docs = readme.read_text(encoding='utf-8')
marker = '## Recent release highlights\n\n'
assert docs.count(marker) == 1
note = '- **v0.4.76 — Offer badges:** A small corner badge on each streaming-service logo shows included-with-subscription (`mdi:currency-usd-off`), free-with-ads (`mdi:play-circle-outline` + AD), or extra rental/purchase (`mdi:currency-usd`). The raw `flatrate`/`rent`/`buy` text is hidden; offer labels remain available to screen readers and on hover.\n'
docs = docs.replace(marker, marker + note, 1)
readme.write_text(docs, encoding='utf-8')
print('PASS: v0.4.76 provider-logo badges, locale-aware hover labels and preserved source actions patched')
