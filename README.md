# Streaming Browser — Home Assistant Integration

[![Latest release](https://img.shields.io/github/v/release/fVaqueroG/streaming-browser--card?label=latest%20release)](https://github.com/fVaqueroG/streaming-browser--card/releases/latest) · [Latest release notes](https://github.com/fVaqueroG/streaming-browser--card/releases/latest) · [All releases and changes](https://github.com/fVaqueroG/streaming-browser--card/releases)

Browse TMDB movie and TV catalogs, choose streaming providers, review movie and episode availability, and open supported streaming apps or links from a Home Assistant dashboard. The card has a named entry in **Add card** and a visual editor. It is bundled with the Streaming Browser **HACS Integration**, not a separate HACS Dashboard card.

**The release badge and the linked release notes are the version and change history to consult.** Older change notes below are historical highlights, not a claim about the version installed on your Home Assistant instance. To see your installed version, check **HACS → Integrations → Streaming Browser** and the version label in your dashboard card.

## Recent release highlights

- **v0.4.75 — HACS documentation:** Bring the HACS-facing README, installation instructions and recent changes up to date; link directly to the latest GitHub release notes and use a dynamic release badge instead of an obsolete hard-coded current-version statement. Playback behavior and existing configurations are unchanged.
- **v0.4.74 — Roku TV and Roku streaming players:** Choose Roku in the visual editor, launch installed provider apps using Home Assistant's Roku media player, use the directional remote, and optionally route a separate HDMI-connected Roku through a display TV. Exact-title TV links are deliberately not offered for Roku: the web URLs returned by the link service are not Roku app-specific content IDs.
- **v0.4.73 — Compact provider cards:** Display a streaming service logo rather than repeating its name; fall back to text if no logo exists.
- **v0.4.72 — Icon-only source actions:** `mdi:television-play` opens an available title/episode link on the TV on supported platforms, and `mdi:cellphone-play` opens that link on the current device. These are separate from **Open app**, which launches only the streaming app.
- **v0.4.71 — Episode details:** One uniform accent outline surrounds the selected episode and expanded provider actions, and a compact title/remote/close header remains visible while the episode list scrolls.
- **v0.4.70 — Stable title-details scrolling:** Provider-link updates refresh content inside the existing dialog without resetting its scroll position.
- **v0.4.69 — Remote redesign:** Circular D-pad, icon-only controls, and volume up/down; when a separate display TV is configured, volume targets that display.
- **v0.4.68 — Provider-card fix:** Restore the missing details renderer and keep episode links scoped to the selected episode.
- **v0.4.67–v0.4.65 — Installation and editor:** Repair frontend resource registration, make the named card and visual editor available, and migrate old HACS Dashboard resource URLs.

See [all GitHub releases](https://github.com/fVaqueroG/streaming-browser--card/releases) for the complete changelog, including any releases newer than those listed above.

## Install and update

1. In **HACS → Custom repositories**, add `https://github.com/fVaqueroG/streaming-browser--card` as an **Integration**. Install or update **Streaming Browser** under **HACS → Integrations**. **Do not install the older Dashboard-category package.**
2. Restart Home Assistant. Go to **Settings → Devices & services → Add integration → Streaming Browser** and complete the one-time setup if the integration is not already configured. HACS downloading the files alone does not activate the backend.
3. Open **Edit dashboard → Add card**, search for **Streaming Browser Card**, and configure it in the visual editor. Choose the playback device and enter your TMDB API key. Existing dashboard cards and saved settings can remain in place.
4. Fully reload the dashboard (and the mobile companion app if applicable) after an integration update. The integration registers its bundled JavaScript as a versioned Lovelace **JavaScript module** resource at `/streaming_browser/streaming-browser-card.js?v=<installed-version>`; you should not have to create a Manual card or copy the JavaScript file yourself.

If the card is missing from **Add card**, verify that the integration is configured in **Devices & services**, and that its JavaScript resource opens without a `404` error. Remove any obsolete `/hacsfiles/streaming-browser--card/...` resource left by the old Dashboard-category installation. Do not remove your existing dashboard cards.

## Playback platforms

**LG webOS:** Use the LG webOS media player, available sources, and remote commands. Exact movie/episode app navigation depends on the individual provider app accepting the link.

**Android TV:** Configure the Android TV media player and remote entity. The optional Android Debug Bridge media player supports additional Netflix profile handling. App and exact-title behavior depend on the installed streaming app.

**Roku TV / Roku player:** First configure the official Home Assistant Roku integration, then select Roku and its `media_player` and `remote` entities in the Streaming Browser visual editor. Roku can launch installed apps and accept remote commands. **Open app** opens the provider's app, not an exact title. The TV-play icon is hidden on Roku because generic web provider links cannot be treated as Roku content IDs. If Roku is connected to another TV, configure that display and its HDMI source separately.

**Source buttons:** The TV-play icon attempts a matching title/episode link on supported TV platforms; the phone-play icon opens that provider link on the device displaying Home Assistant; **Open app** launches the selected provider app without selecting a title. The selected episode must have its own matching episode link; a series-level link is not used as a substitute.

Provider availability and catalog metadata come from TMDB. Episode-level link resolution uses an independent, unofficial provider lookup and cannot guarantee playback inside each platform's native app.

## Older documentation

The [historical README at v0.4.73](https://github.com/fVaqueroG/streaming-browser--card/blob/v0.4.73/README.md) preserves prior implementation notes and older installation instructions **for reference only**. Its older Dashboard-category setup and hard-coded version numbers are no longer current; follow the Integration instructions above.
