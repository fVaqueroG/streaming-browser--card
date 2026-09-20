# Streaming Browser — Home Assistant Integration

[![Latest release](https://img.shields.io/github/v/release/fVaqueroG/streaming-browser--card?label=latest%20release)](https://github.com/fVaqueroG/streaming-browser--card/releases/latest) · [Latest release notes](https://github.com/fVaqueroG/streaming-browser--card/releases/latest) · [All releases and changes](https://github.com/fVaqueroG/streaming-browser--card/releases)

Browse TMDB movie and TV catalogs, choose streaming providers, review movie and episode availability, and open supported streaming apps or links from a Home Assistant dashboard. The card has a named entry in **Add card** and a visual editor. It is bundled with the Streaming Browser **HACS Integration**, not a separate HACS Dashboard card.

**The release badge and the linked release notes are the version and change history to consult.** Older change notes below are historical highlights, not a claim about the version installed on your Home Assistant instance. To see your installed version, check **HACS → Integrations → Streaming Browser** and the version label in your dashboard card.

## Recent release highlights

- **v0.4.93 — Netflix Android TV ADB playback:** For a room with an explicitly configured ADB media player, the TV Play button uses the selected Netflix movie/episode ID with `am start -a android.intent.action.VIEW -d http://www.netflix.com/watch/<id> --es source 30 -n com.netflix.ninja/.MainActivity`. No follow-up keyevent, Play button, restart, or forced profile navigation. Validated /watch/ episode URLs must match the selected episode; movie /title/ URLs (including regional paths) are accepted. Netflix on webOS and other providers are unchanged.

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


## v0.4.81: Nuvio-inspired Streaming Browser remote

The remote keeps the same command dispatch and player selection but now uses a dark, rounded popup with a full-width Wake button, large circular D-pad, 12-key number pad including Backspace and Enter, large Back and Home buttons, and compact Play, Pause, Mute and volume controls. It remains scrollable on short screens and keeps the configured remote position. Update the integration through HACS, restart Home Assistant, and reload the dashboard.


## v0.4.82: Nuvio-size remote

The Streaming Browser remote now matches the compact Nuvio remote size: 176px wide (166px on mobile) with a 132px D-pad (122px on mobile). Wake, the complete 12-key pad, Back/Home, Play/Pause, mute and volume all remain, with the extra controls in a compact secondary grid. The popup scrolls on short screens; playback, HDMI, room, and smart-plug routing are unchanged. Update the HACS integration, restart Home Assistant, and reload the dashboard.


## v0.4.83: Optional WatchHub official-app links

Streaming Browser can now query Stremio WatchHub **externalUrl** provider navigation links as an additional source alongside the existing Watchmode title lookup and JustWatch episode lookup. Enable or disable **Use WatchHub official-app links** in the card visual editor under Exact-title playback (enabled by default). WatchHub requires no streaming account login or Nuvio integration. The card resolves IMDb IDs through its existing TMDB key, requests region-specific WatchHub sources on the Home Assistant backend, and accepts only HTTPS navigation URLs on known official streaming-provider domains. It ignores direct streams/torrents and requires the exact `imdb:season:episode` ID for series. If WatchHub is unavailable, existing links continue working. A provider URL is not proof that the target TV app supports a particular deep-link format or starts playback; the TV app decides how the link is handled. Refresh/restart Home Assistant after HACS update and reload the dashboard.


## v0.4.84: compact playback buttons with destination labels

The provider row now shows up to two icon-only action buttons: television and device. A small Episode, Season, Series, Movie, or App label appears **inside** each actionable button under its icon (localized for Spanish). The separate Open app button is removed; when only an app launch is available, the TV button performs that existing action and says App. When no device URL is available, an unusable device button is not shown. Roku does not receive a fake exact TV deep link. Existing provider badges, WatchHub, Watchmode, JustWatch, room power/HDMI and compact remote commands are preserved.


## v0.4.85: TV app routing and optional ADB

Android TV: the standard Android TV Remote is the primary path for app launching, navigation and Netflix/Prime supported deep links. Crunchyroll opens its installed Android TV app by package ID rather than sending an unsupported web URL (which produced the system "no app can handle this" dialog). An explicitly configured ADB media player is optional and used only when Netflix profile navigation is requested or normal app/deep-link actions explicitly fail. If ADB is not selected, profile selection remains manual. Netflix Android TV receives a `/watch/<id>` episode link rather than a rewritten `netflix://title/<id>` route. Prime episode links are not advertised as exact when their URL only identifies a generic `/detail/` title or series. Netflix LG webOS episode launches no longer reuse the known movie-only launcher format; they fall back to the official app until an episode-compatible TV link is demonstrated. The per-button destination caption describes the supported TV action separately from the external device URL. Existing rooms, HDMI, power switch, compact remote, regional WatchHub, Watchmode and JustWatch are retained. Actual title navigation remains app-version dependent and requires testing on the target TV.


## v0.4.86: optional ADB remote

An Android TV connection can now select a separate optional `remote.*` entity from the Android Debug Bridge integration, as well as the existing optional ADB `media_player.*` entity. Set **ADB remote (optional)** in the single-card editor or in **Rooms & connections** for each Android TV connection. Standard Android TV Remote handles routine commands. The selected ADB remote is used for Netflix-specific keys and only when a standard remote command fails; Netflix auto-profile navigation can use the ADB remote without configuring an ADB media player. Leaving the field blank preserves existing behavior. This does not add universal TV-app episode deep-link support.


## v0.4.87 — link compatibility recovery

Restores attempting existing provider-specific Netflix/Prime TV links that v0.4.85 previously blocked and labeled App, without falsely labeling a generic series destination as Episode. Original Prime Video URLs are tried first rather than unconditionally rewritten to a different host; the alternate is used if Home Assistant rejects the original. Restores the previous Netflix native Android TV movie intent, preserving the episode /watch link as the first episode attempt. Previously used Watchmode and JustWatch links are preferred ahead of new WatchHub fallbacks. Crunchyroll Android TV continues to launch the installed app rather than an unsupported web intent. A TV accepting a command is not confirmation that the provider actually navigated to the title. WatchHub, icon/caption controls, rooms, HDMI, power switch, and optional ADB remote remain available.


## v0.4.88: restore v0.4.82 TV links

Restores the actual v0.4.82 Watchmode/JustWatch source-selection and Netflix, Prime Video and general TV link-launch methods from the historical release tag. Existing WatchHub remains an optional fallback only when an old source is empty, rather than replacing working links. The compact TV button now attempts the v0.4.82 content route when a valid link exists. Rooms, power helper, compact controls, and optional ADB remote are retained. TV app acceptance of external links still depends on the device and app.


## v0.4.89: Netflix episode TV navigation

Netflix episode Play on TV no longer routes the selected `/watch/<episodeId>?trackId=...` HTTPS link through Android TV's generic activity handler (which can merely open Netflix). Android TV uses the Netflix-native episode content ID, via the optional ADB media player/remote if configured or the standard Android TV Remote otherwise. LG webOS sends the original provider episode URL, including its existing trackId, to Netflix `contentTarget` before attempting an episode-specific webOS launch fallback. Play in device retains the unchanged source URL; Watchmode/JustWatch/WatchHub and episode > season > series priority are unchanged. A successful Home Assistant service call does not guarantee that a particular Netflix TV app build supports exact episode navigation.


## v0.4.90: Prime Video TV links and Disney+ destination labels

Prime Video Play on TV translates a provider `/detail/<id>` link to the Prime Android TV app GTI target, explicitly targeting the installed Prime package when an optional ADB media player or ADB remote is configured; the standard remote remains the fallback/default. LG webOS passes the full selected original Prime URL as `amazon` `contentTarget` before a legacy launcher retry on a service error. Play in device stays unchanged. Disney+ `/series/`, `/show/` and `/browse/entity-` links returned from an episode lookup are now **Series**, not **Episode**. Links must identify a distinct playable entity and have matching season/episode metadata before they receive the Episode label. Duplicate Prime episode and series links are downgraded rather than advertised as exact episodes. Netflix v0.4.89 launcher, compact buttons, rooms, ADB remote and episode > season > series / WatchHub last priorities are retained. Exact TV app navigation still depends on installed provider app link support.


## v0.4.91: Crunchyroll Android TV app routing

The Crunchyroll Play on TV button now launches the installed Android TV package directly using the normal Android TV Remote, falling back to the selected TV media player app launcher when needed. It never submits Crunchyroll HTTPS URLs as generic Android VIEW intents, which can show “You don’t have an app that can do this” even with Crunchyroll installed. The TV button correctly says App because an external exact-episode TV handler is not verified. Play in device continues to use its original source URL. ADB remains entirely optional, as a last resort when standard app-launch services explicitly fail. Netflix, Prime Video, Disney+, per-provider episode/season/series ranking, WatchHub-last priority, rooms and remote controls are unchanged.


## v0.4.92: native Crunchyroll Android TV playback (no ADB)

When an exact official Crunchyroll `/watch/{content_id}` source is available for the selected episode or movie, Play on TV extracts its provider-specific ID and sends `crunchyroll://episode/{content_id}` or `crunchyroll://movie/{content_id}` through the selected Android TV Remote. If that remote action raises an error, the configured Android TV media player receives the same URI. Sending the next episode does not restart the app or send extra profile/navigation keys. A missing, show-level or incorrectly scoped link retains the existing app-only action; the card does not invent a Crunchyroll ID from TMDB or substitute another episode. Episode playback and switching have been tested on a TV; movie deep links have been implemented from the APK movie routing but still need an on-device movie test. Existing LG webOS, Roku, Netflix, Prime, Disney, Nuvio, room/HDMI, optional ADB and WatchHub behavior is unchanged.


## v0.4.94 — Prime Video Android TV GTI details (no ADB)

For Android TV, a Prime Video movie/season/episode source with a genuine `amzn1.dv.gti.<UUID>` in `https://app.primevideo.com/detail?gti=...` now opens its details through the configured Android TV Remote entity (`remote.turn_on` with `activity`). No ADB, follow-up Enter, automatic Play, forced profile selection, or app restart is issued by the Prime handler. A matching episode GTI is preferred; when none is provided by the source resolver, the corresponding season GTI or series GTI can open its details for manual episode selection. Alphanumeric ASINs and `primevideo.com/region/.../detail/<ASIN>?autoplay=1` links are not misrepresented as GTIs. This update does not synthesize or discover missing episode GTIs from TMDB episode numbers: exact episode navigation requires a source containing the episode's real GTI. Existing room power/HDMI routing, manual remote, Netflix, Crunchyroll, webOS, and other providers remain unchanged.


## v0.4.95: WatchHub visibility, JustWatch account and larger logos

WatchHub remains an optional official-app link source (enabled by default in the card editor under Exact-title playback). Selected provider cards now identify whether their current link came from WatchHub, JustWatch, or Watchmode. A selected provider with a WatchHub link is shown even when TMDB's separate current-availability endpoint omits it; selected provider filters still apply. Provider logos are 48px instead of 40px while TV/device buttons retain their size. Link selection still prioritizes episode, then season, then series; WatchHub is last within each tier.

For account-authenticated JustWatch links, go to Settings → Devices & services → Streaming Browser → Configure, then choose JustWatch email/password or browser ID token. Email/password is exchanged server-side for a renewable session; the password is not saved in the dashboard or integration settings. A browser-only token cannot refresh automatically. Disconnect is available in the same settings. This uses the same unofficial JustWatch GraphQL/Firebase implementation already included in Streaming Browser and Nuvio, so sign-in depends on those endpoints remaining available. Anonymous JustWatch links continue to work without an account.
