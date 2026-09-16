# Streaming Browser Card

A custom Home Assistant dashboard card for browsing streaming catalogs and launching titles on supported media players.

Current version: **v0.4.50**

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
