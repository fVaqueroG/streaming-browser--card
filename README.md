# Streaming Browser Card

A custom Home Assistant dashboard card for browsing streaming catalogs and launching titles on supported media players.

Current version: **v0.4.39**

## Features

- Browse and search TMDB movies and TV series
- Categorized horizontal catalog rows (Trending, Popular, Top Rated, releases/airing)
- Infinite/lazy catalog pagination as you scroll each row
- Region-specific streaming providers
- LG webOS source matching and app launching
- Android TV Remote support
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

## Visual editor

v0.4.39 adds a native Home Assistant visual editor using the built-in card form API.

From the dashboard editor you can configure:

- TV media player
- TMDB API key, region and language
- Poster width and catalog lazy-loading threshold
- Rental/purchase provider visibility
- Watchmode script and playback timing
- Profile helper, default profile and profile timing
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
