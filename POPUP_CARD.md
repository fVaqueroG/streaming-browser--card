# Streaming Browser popup button

The integration includes two separate Lovelace card types:

- `custom:streaming-browser-card-v2` — the existing full-sized browsing card.
- `custom:streaming-browser-popup-card` — a compact dashboard button opening that **same V2 card component** in a modal dialog.

## Add using the dashboard visual editor

After updating the integration and restarting Home Assistant, edit your dashboard, choose **Add card**, search for **Streaming Browser Popup Button**, and set the button label, MDI icon, optional label visibility, and popup size (**Normal**, **Wide**, **Full screen**). Below those fields, the same V2 editor lets you configure TV, room connections, streaming services, providers, and other existing settings. The original V2 card is unchanged.

To reuse the exact configuration of an existing V2 card, open its code editor, copy its YAML configuration to the new card, and change only the card `type`. For example:

```yaml
type: custom:streaming-browser-popup-card
button_label: Streaming
button_icon: mdi:movie-open
button_show_label: true
popup_width: wide  # normal, wide, or fullscreen
# Paste the remaining configuration from the full-size V2 card here.
```

The button config and V2 playback/room settings live in a single Lovelace card configuration. Editing one card does not silently change the configuration of another card. The new popup opens only on demand, and Escape, the close icon, and clicking outside the modal close it. The popup resizes to the screen on mobile. Closing the dialog removes its V2 card instance.

## Resources

With the integration installed, the three frontend JavaScript resources are registered automatically in this order: legacy card, V2 card, and popup card. Home Assistant in YAML resource mode also receives them via the integration's frontend registration. After updating HACS, restart Home Assistant and reload the browser to clear old module caches.
