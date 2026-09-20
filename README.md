# Streaming Browser — Home Assistant Integration

[![Latest release](https://img.shields.io/github/v/release/fVaqueroG/streaming-browser--card?label=latest%20release)](https://github.com/fVaqueroG/streaming-browser--card/releases/latest) · [Latest release notes](https://github.com/fVaqueroG/streaming-browser--card/releases/latest) · [All releases and changes](https://github.com/fVaqueroG/streaming-browser--card/releases)

Browse TMDB movie and TV catalogs, choose streaming providers, review movie and episode availability, and open supported streaming apps or links from a Home Assistant dashboard. The card has a named entry in **Add card** and a visual editor. It is bundled with the Streaming Browser **HACS Integration**, not a separate HACS Dashboard card.

**The release badge and the linked release notes are the version and change history to consult.** Older change notes below are historical highlights, not a claim about the version installed on your Home Assistant instance. To see your installed version, check **HACS → Integrations → Streaming Browser** and the version label in your dashboard card.

## Recent release highlights

- **v0.4.77 — Genre dropdown:** Beside Movies and Series, choose a TMDB genre such as Horror, Comedy or Drama, or All genres. Movie and TV genre names come from TMDB in the configured language. Genre and streaming-provider filters combine server-side for paginated catalogs; each mode remembers its own genre selection.
- **v0.4.76 — Offer badges:** A small corner badge on each streaming-service logo shows included-with-subscription (`mdi:currency-usd-off`), free-with-ads (`mdi:play-circle-outline` + AD), or extra rental/purchase (`mdi:currency-usd`). The raw `flatrate`/`rent`/`buy` text is hidden; offer labels remain available to screen readers and on hover.
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


## Rooms and HDMI connections (v0.4.78)

Edit a Streaming Browser card and expand **Rooms & connections**. Select **Add room** to migrate the original TV/media-player configuration into the first room; then rename it and add as many rooms and playback connections as needed. Each connection has its own platform (LG webOS, Android TV, Roku), playback `media_player`, optional display TV, HDMI input, optional `remote` and ADB entities, and HDMI switching delay. HDMI options are read from the selected display TV's `source_list`; saved inputs remain selectable while a TV is offline. Choose a default connection in each room. On the card, select a room and, when a room has multiple connections, select a playback device. Device selection reroutes playback and the remote without discarding the current catalog or title view. The last room and connection are saved locally per card title; set `room_storage_key` on cards with identical titles that should keep independent selections. Older single-device cards continue to work unchanged. The existing playback logic turns on the display, switches HDMI if configured and then opens the streaming app on the selected playback device.


## Optional smart-plug / power helper (v0.4.79)

In the card visual editor, expand **Rooms & connections**, then expand the desired playback connection. Choose an optional **Power helper** (`switch.*` smart plug or `input_boolean.*` Home Assistant helper) and a **Power-on delay** in milliseconds (default 5000, max 60000). Leave the field empty for devices that do not need external power. The helper is scoped to the selected connection, not the entire dashboard. When playback or HDMI preparation starts, the card turns on an off helper, waits for the configured boot delay, then uses the existing TV/HDMI/wake/playback routing. The card skips `turn_on` if Home Assistant reports the helper already on and deduplicates commands while Home Assistant is updating. The room selector displays separate power-on and power-off buttons with the current entity status for connections with a helper. Power-off is **manual only**, never triggered by changing rooms or playback devices; shutting off power during playback asks for confirmation. An `input_boolean` must have Home Assistant automations that actually turn the smart plug on/off. If an external smart plug powers a TV or streamer, configure a safe shutdown method where necessary before cutting its mains power. Existing cards and other room connections without a helper are unaffected.


## One power switch (v0.4.80)

For room connections with an optional Power helper, the card displays one accessible On/Off switch instead of two separate power buttons. The switch reflects the Home Assistant `switch.*` or `input_boolean.*` entity state, is disabled when the entity is unavailable or a power command is in progress, and remains unchanged if turning off during playback is cancelled. The existing automatic turn-on, startup delay and manual-off confirmation are preserved. Connections without a Power helper have no power switch.
