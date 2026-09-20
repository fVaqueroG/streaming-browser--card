# Streaming Browser — Home Assistant Integration

## v0.4.69: Circular remote and volume controls

The floating Streaming Browser remote now has a round, four-way D-pad with centered OK, icon-only Home/Back/Play/Pause/Mute/Wake buttons, `mdi:volume-mute` and `mdi:sleep-off`, plus Volume up/down. When an optional HDMI display entity is configured, volume controls target that TV; otherwise they target the playback media player. Update through HACS Integrations, restart Home Assistant and reload the dashboard; existing cards retain their settings.


## v0.4.68: Fix title detail provider cards

Fix the missing `_renderProviderCards()` method that caused `this._renderProviderCards is not a function` when opening movie or series details. The restored renderer uses TMDB provider availability and the existing TV/app controls, exposes exact provider links on this device when available, and shows episode-specific links only for the selected episode. Update the Streaming Browser HACS **Integration**, restart Home Assistant and fully reload the dashboard; saved card configuration is unaffected.


## v0.4.66: Add card by name with its visual editor

After updating **Streaming Browser** in HACS under **Integrations** and restarting Home Assistant, refresh the dashboard. In **Edit dashboard > Add card**, search for **Streaming Browser Card**, select its named card, and complete the visual editor. Do not select a Manual card or paste YAML. The integration loads the same versioned JavaScript globally for card-picker discovery and as a dashboard resource. Existing dashboard card settings remain intact.


**Current version: v0.4.66.** The dashboard card and independent episode-link backend are now **one HACS Integration**. All runtime files are bundled inside `custom_components/streaming_browser/`; the card's JavaScript is served automatically from `/streaming_browser/streaming-browser-card.js?v=0.4.63`. No manual file copying or `configuration.yaml` entry is required for a new install.

## v0.4.65: Editor setup and automatic resource migration

The card now accepts an empty first-time configuration, allowing you to choose the playback device and enter your existing TMDB API key in the visual card editor. Previously saved dashboard card settings are unchanged.

The **Streaming Browser HACS Integration** registers `/streaming_browser/streaming-browser-card.js?v=0.4.65` and, on Home Assistant startup, updates an existing resource of that URL to the installed version, deduplicates the new resource, and deletes the obsolete `/hacsfiles/streaming-browser--card/streaming-browser-card.js` (or `/local/community/streaming-browser--card/streaming-browser-card.js`) resource left by the old Dashboard-category package. This avoids competing JavaScript versions. After updating the Integration in HACS, restart Home Assistant and reload the browser or mobile companion app. Do not reinstall the former Dashboard-category card; it is a legacy package. For a first-time installation, complete Settings > Devices & services > Add integration > Streaming Browser.

If you manually added a different `/local/...` copy of the card, remove that duplicate resource yourself; the integration intentionally does not delete unrelated user-managed resources. Updating files in HACS alone does not hot-reload a running Python integration or an already loaded browser module.

## One-time migration from the older HACS Dashboard card

1. In HACS, uninstall the **old Streaming Browser Card** from the **Dashboard** category (do **not** delete your existing dashboard cards or their configuration). This prevents loading two copies of the same custom element.
2. Under HACS > Custom repositories, remove the old repository entry if it persists, then add `https://github.com/fVaqueroG/streaming-browser--card` in the **Integration** category. Install **Streaming Browser**.
3. Restart Home Assistant, then go to Settings > Devices & services > Add integration > **Streaming Browser** and confirm its setup form. No API key is needed for its anonymous JustWatch lookup; your existing TMDB key stays in the dashboard card configuration.
4. Refresh the dashboard. Existing `type: custom:streaming-browser-card` cards should be preserved. The card's version label should read **v0.4.64**. If an old HACS dashboard resource remains under Settings > Dashboards > Resources, remove its `/hacsfiles/streaming-browser--card/streaming-browser-card.js` resource; keep the new `/streaming_browser/streaming-browser-card.js?v=0.4.63` module.

**Future updates:** update only **Streaming Browser** in HACS (Integration category), restart Home Assistant, and refresh the dashboard. The backend and card JavaScript update together, and the resource URL changes version automatically to avoid stale caching. No additional Nuvio installation is required.

**Existing legacy YAML:** if you already added `streaming_browser:` to `configuration.yaml` for the older backend, it is safe to leave it temporarily; remove that obsolete line when convenient and restart. The new UI integration does not require it.

**Scope:** TMDB still supplies catalogs and episode metadata; the independent JustWatch GraphQL resolver supplies episode-level provider links. It is an unofficial service and cannot guarantee playback in every native TV app. Movie title URLs may still use your previously configured Watchmode script.

---

## Earlier card release notes (historical)

# Streaming Browser Card

A custom Home Assistant dashboard card for browsing streaming catalogs and launching titles on supported media players.

Current version: **v0.4.56**

## Uniform 10-second app load wait

v0.4.56 standardizes the post-active app load wait at 10 seconds for Netflix, Disney+, and Prime Video before any profile-navigation commands are sent.

The extra 1-second settle window after that wait is unchanged.

## Longer post-active webOS load wait

v0.4.55 moves the full webOS load delay to after the target app becomes active.

- Netflix: 6 seconds after the app becomes active, then a 1 second settle window.
- Disney+: 6 seconds after the app becomes active, then a 1 second settle window.
- Prime Video: 7 seconds after the app becomes active, then a 1 second settle window.
- Profile-session delays were also increased before exact-title/play actions continue.

## App startup wait before profile selection

v0.4.54 waits for LG webOS apps to finish loading before profile selection.

The card now launches the app, waits until Home Assistant reports the target app as the active webOS source, completes the backend per-app minimum startup delay, adds a short settle window, and only then sends profile-navigation commands. The same ordering is used when preparing an app before an exact-title launch.

## Prime Video exact-title launch on LG webOS

v0.4.53 fixes Prime Video exact-title launching on LG webOS.

- Prime no longer uses `system.launcher/open`, which is the webOS browser URL endpoint.
- The card launches the Prime Video app with app id `amazon`.
- The Prime title target is passed as both `contentId` and `params.contentTarget` for compatibility across webOS launcher generations.
- Prime/Amazon detail URLs are normalized to a Prime Video detail target when possible.
- The Netflix exact-title helper is also restored after a regression that left its call site without the helper implementation.

## Selected sources in title details

v0.4.52 filters title details to the selected TMDB providers. The **Where to watch** section now shows only providers whose TMDB provider IDs are present in `selected_provider_ids`, including rent/buy groups when that option is enabled.

## All sources catalog

v0.4.51 adds an **All sources** catalog that combines the providers selected in the card editor.

TMDB's discover API supports pipe-separated watch-provider IDs as OR logic, so the card sends the selected provider IDs as a single `with_watch_providers` query. This produces one deduplicated catalog containing titles available on any of the selected/matched platforms.

- **All sources** is the default provider tab.
- Individual provider tabs remain available.
- Switching Movies/Series returns to **All sources**.
- Popular, Top Rated, and Recent Releases all use the combined provider filter.
- Title details still show the actual provider buttons for launching the correct app.

## TMDB provider selection

v0.4.50 adds a region-aware TMDB provider picker to the visual card editor.

- The provider list is loaded from TMDB's movie and TV watch-provider endpoints for the configured region.
- Movie and TV providers are merged and deduplicated by TMDB provider ID.
- Use the **TMDB Providers** section in the visual editor to choose exactly which providers are shown as app tabs.
- The saved Lovelace config contains only `selected_provider_ids`; provider-specific launch/profile behavior stays internal to the card.
- Changing the TMDB API key, region, or language refreshes the provider list automatically.
- Existing cards default to Netflix (8), Disney Plus (337), and Amazon Prime Video (119) until you save a different selection.

## Backend-managed apps and profiles

v0.4.49 moves app visibility and profile-navigation rules into the card backend.

- The Trending provider chip is removed.
- Only Netflix, Disney+, and Prime Video are shown.
- Netflix, Disney+, and Prime profile-selection steps are internal card rules.
- The visual editor no longer exposes advanced `profiles`, `provider_sources`, `android_app_links`, or profile-navigation timing objects.
- Profile names come from the configured `profile_entity` options when available; otherwise the built-in fallback profiles are Felipe and Guest.
- Existing legacy YAML is still read for compatibility, but app-navigation behavior is controlled by the backend policy.

## Features

- Browse and search TMDB movies and TV series
- Categorized horizontal catalog rows (Trending, Popular, Top Rated, releases/airing)
- Infinite/lazy catalog pagination as you scroll each row
- Region-specific streaming providers
- LG webOS source matching and app launching
- Android TV Remote support
- Netflix default-profile auto-selection on Android TV through the Android Debug Bridge integration
- Netflix default-profile auto-selection on LG webOS through TV remote navigation
- Streaming profile selector
- Per-profile app behavior
- Optional Home Assistant scripts for secure profile PIN entry
- Watchmode exact-title lookup through the Home Assistant backend
- Exact-title launch with optional Play action

## Install with HACS

1. Open **HACS** in Home Assistant.
2. Open the menu and choose **Custom repositories**.
3. Add:
   `https://github.com/fVaqueroG/streaming-browser--card`
4. Select category **Dashboard**.
5. Install **Streaming Browser Card**.
6. Reload the Home Assistant frontend if prompted.

HACS installs `streaming-browser-card.js` from the repository root.

## Screensaver wake handling

v0.4.45 fixes Android TV screensaver wake by checking Android's real Dreaming/Awake state over the configured ADB media-player entity. When a dream/screensaver is active, the card sends Android KEYCODE_WAKEUP, then DPAD_CENTER, and falls back to HOME if the dream is still active.

v0.4.41 adds screensaver-aware wake handling for both **LG webOS** and **Android TV Remote**.

- LG webOS: if the TV is on but the active source/app looks like a screensaver, the card sends **ENTER**, waits, and falls back to **HOME** before launching the requested app or title.
- Android TV: the card uses the configured `remote_entity`, calls `remote.turn_on` when the device is idle/off, then sends **DPAD_CENTER** and falls back to **HOME** if a screensaver/ambient/dream activity is still detected.
- Android exact-title launches use `remote.turn_on` with the title deep link/activity.
- Android Play defaults to `DPAD_CENTER`, which works better than a media PLAY key in many streaming apps.

For Android TV use:

```yaml
platform: android_tv
tv_entity: media_player.mitv_aesp0
remote_entity: remote.mitv_aesp0
screensaver_wake_delay_ms: 1200
android_play_command: DPAD_CENTER
```

## Netflix default profile

v0.4.47 restores explicit Android TV app startup waiting. After launching a streaming app, the card now waits for the target app to become the foreground activity, completes the configured launch delay, gives the app a short settle period, and only then sends Netflix profile-navigation commands. This prevents DPAD/profile commands from being sent while Netflix is still starting.

v0.4.46 fixes Netflix profile selection on Android TV when Netflix hides its UI hierarchy from ADB. The card now sends raw Android DPAD keyevents, and when Netflix is already open it can open Netflix's profile menu before selecting the configured profile position. It also retries once if the picker is still visible after the first selection.

v0.4.43 adds Netflix profile auto-selection for both **Android TV** and **LG webOS**.

v0.4.44 fixes **Open title** and **Title + Play** for Netflix so the Watchmode HTTPS URL is never handed to the TV browser. Android TV targets `com.netflix.ninja` with a Netflix deep link, while LG webOS uses `system.launcher/launch` with Netflix's `contentId` payload.

Android TV needs two integrations for the full experience:

- **Android TV Remote** for app/deep-link launching.
- **Android Debug Bridge** for Netflix D-pad input. Home Assistant documents that Android TV Remote key commands do not work inside Netflix, so the card uses `androidtv.adb_command` only for Netflix profile selection and Netflix Play actions.

Configure the ADB media-player entity and enable Netflix profile selection:

```yaml
platform: android_tv
tv_entity: media_player.android_tv
remote_entity: remote.android_tv
adb_entity: media_player.android_tv_adb

netflix_profile_autoselect: true
netflix_profile_launch_delay_ms: 4500
netflix_profile_navigation_delay_ms: 350
netflix_profile_after_select_delay_ms: 1500
```

Each Streaming Browser profile can map to its Netflix position from left to right:

```yaml
profiles:
  Felipe:
    apps:
      Netflix:
        mode: netflix
        profile_position: 1

  Guest:
    apps:
      Netflix:
        mode: netflix
        profile_position: 2
```

Netflix supports up to five profiles, so `profile_position` is 1 through 5. If it is omitted, the card uses the order of profiles in the `profiles` object.

On Android TV, the card first tries to detect the Netflix profile picker through ADB UI automation. On LG webOS, Netflix does not expose the internal picker state through Home Assistant, so automatic positional selection is performed on a fresh Netflix launch. Existing explicit `navigation` or `command` profile modes are preserved; use those instead if a profile needs a custom PIN sequence.

## Languages

The card UI supports **Spanish (es-MX)** and **English (en-US)**.

Choose the language from the visual editor. The same setting is also sent to TMDB, so catalog titles and metadata use the selected locale when available.

## Home Assistant dashboard resource

When the card is installed with HACS, use the **HACS-managed resource only**:

```text
/hacsfiles/streaming-browser--card/streaming-browser-card.js
```

Resource type: **JavaScript Module**.

Do **not** keep an older manual resource such as:

```text
/local/streaming-browser-card.js
/local/streaming-browser-card.js?v=0437
```

If both the old `/local/` resource and the HACS `/hacsfiles/` resource are configured, Home Assistant can load the older card first. Remove the manual `/local/` entry completely.

HACS downloads dashboard plugins to `www/community/`; the `/hacsfiles/` endpoint serves that HACS-managed copy and is designed to avoid stale browser caching. Once the dashboard resource points to `/hacsfiles/`, future HACS updates replace the file used by the dashboard automatically.

## Visual editor

v0.4.39 adds a native Home Assistant visual editor using the built-in card form API.

From the dashboard editor you can configure:

- TV media player
- TMDB API key, region and language
- Poster width and catalog lazy-loading threshold
- Rental/purchase provider visibility
- Watchmode script and playback timing
- Profile helper, default profile and profile timing
- Android TV ADB entity for Netflix profile control
- Netflix auto-select toggle and profile-picker timing
- Advanced `profiles` and `provider_sources` objects

Existing YAML configuration remains supported.

## Minimal card configuration

```yaml
type: custom:streaming-browser-card
title: Streaming
tv_entity: media_player.lg_webos_tv
tmdb_api_key: YOUR_TMDB_V3_API_KEY
region: MX
language: es-MX
poster_width: 145
max_items: 24
```

See the `examples/` folder for fuller LG webOS and Android TV configurations.

## Exact-title lookup

Exact-title links can use Watchmode through a Home Assistant backend script so the Watchmode API key does not need to be stored in Lovelace JavaScript.

The example backend files are provided in `examples/backend/`.

## Updating

When a new version is committed to this repository, HACS can detect the repository update. Keep the card version string in `streaming-browser-card.js` updated with each release.


## Roku TV and Roku streaming players (v0.4.74)

Install the official **Roku** integration in Home Assistant. Select **Roku TV / Roku player** under the Streaming Browser card's **Platform**, its `media_player` entity as **Playback device**, and the same Roku device's `remote` entity as **Playback device remote**. The TMDB catalogs, installed-source matching, app launching, circular D-pad, volume and playback controls work on Roku TVs. Roku set-top boxes may not support volume control; configure **Display TV** and its HDMI input when using a separate Roku player. When Roku is itself the display for another HDMI player, select the Roku TV as the display device and its HDMI input in that player's card settings. Enable Roku's **Control by mobile apps** / network access if remote keys do not work. TV power-on from full standby depends on the Roku model and its network-standby settings.

**Exact-title limitations:** Roku `media_player.select_source` opens a streaming app, not the selected movie/episode. Roku exact playback requires that streaming app's own app ID and content ID through Roku's `media_player.play_media` app/deep-link interface. Browser URLs from the existing provider lookup cannot be treated as Roku content IDs. Accordingly, Roku provider cards expose **Open app** and **Open on this device** (when a provider URL exists), but do not display a misleading exact-title **Open on TV** action. The Roku Play and Pause remote icons both send Roku's Play/Pause toggle; digit keys enter text only when an on-screen keyboard is active.
