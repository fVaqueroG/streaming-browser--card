# Approved Streaming Browser branding — v0.4.127

The GitHub Actions workflow `publish-user-approved-branding-v04127.yml` is ready to import and release the three approved **original, full-resolution, transparent** logos without modifying the images.

To provide the actual image bytes, go to this `branding` folder in the GitHub web interface and select **Add file → Upload files**. Upload the archive `Streaming_Browser_approved_logos_and_installer.zip` from the ChatGPT conversation, and commit it directly to `main`. GitHub Actions will verify the SHA-256 of all three originals, copy each to the integration assets, update the popup and V2 references and version, then publish `v0.4.127` with the ZIP attached.

Only upload the logo archive. Do not upload Home Assistant configuration files, API keys or other personal files. The workflow intentionally refuses different images or multiple ZIPs instead of publishing the wrong artwork.
