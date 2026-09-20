# Independent episode links — Streaming Browser Card

Streaming Browser Card v0.4.62 and later can look up **episode-level streaming-provider links without installing or calling Nuvio**. The card continues to use your TMDB API key for series, seasons, episode information and available providers. A small *separate* Home Assistant custom component performs the JustWatch lookup on the Home Assistant server, where browser CORS restrictions do not apply.

## Install

1. Update the **Streaming Browser Card** frontend from HACS and reload your dashboard. Confirm the card header says `v0.4.62` or newer.
2. In your Home Assistant configuration directory, create `/config/custom_components/streaming_browser/`.
3. Copy these **four files** from this repository's [`custom_components/streaming_browser/`](custom_components/streaming_browser/) folder into the folder you created: `__init__.py`, `manifest.json`, `justwatch.py`, `providers.py`. Do not copy the `nuvio` integration or its configuration. (The optional backend is a separate Home Assistant integration, not a Lovelace JS resource; HACS's card/frontend update alone cannot install it.)
4. Add this top-level line to `/config/configuration.yaml` (do not duplicate it if already present):
   ```yaml
   streaming_browser:
   ```
5. Check the Home Assistant configuration, then **restart Home Assistant** to load the component and register its `streaming_browser/episode_links` WebSocket endpoint. Refresh the dashboard.

The backend does not require any Nuvio installation, Nuvio account, or Nuvio API call. It uses an **anonymous, unofficial JustWatch GraphQL lookup** to find provider links for the exact TMDB series, season and episode. An additional JustWatch API key is not required. Continue to use your existing TMDB key in the card. You still need a valid streaming subscription/login where the provider requires one.

## What you should see

Open a series, select a season and then an episode. Provider buttons should expand **immediately under that episode row**, not at the end of the season list. The card looks up links with the series TMDB ID and the selected season/episode, then makes `Open on TV` and `Open on this device` available for matched provider URLs. `Open on TV` uses your existing configured player/HDMI route; `Open on this device` follows the provider URL on the phone, tablet, or browser viewing the dashboard. The remote controls the selected Home Assistant playback device without importing Nuvio's frontend or calling Nuvio services.

If a provider does not return an episode-level URL for your region, the card does **not** quietly substitute a series-homepage URL and present it as an exact episode link. The relevant buttons remain unavailable. Even when an episode-level provider offer URL is returned, the native streaming app may redirect to its profile picker or landing page; direct episode playback is not guaranteed on every app/device.

## Troubleshooting

- If the popup says the episode backend is unavailable, confirm all four Python/JSON files are installed at the exact path above, confirm `streaming_browser:` is in `configuration.yaml`, and restart Home Assistant. The Lovelace frontend update does not install the backend.
- If you see no exact episode links but the episode list loads, the separate lookup may be unavailable for that episode/region/provider. TMDB episode metadata and direct-link availability are different services.
- JustWatch's GraphQL endpoint is unofficial and may change or block requests without warning; availability and provider URLs vary by region. This backend currently does not use a TheTVDB key, a paid Watchmode key, or provider-specific developer APIs. No extra API credentials are needed for the implemented anonymous JustWatch lookup.
