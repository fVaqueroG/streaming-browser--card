# Independent episode links — integrated installation

As of **Streaming Browser v0.4.63**, the frontend and episode-link backend are packaged in a single **HACS Integration**. The previous v0.4.62 manual-copy instructions are obsolete.

Follow the installation and one-time migration instructions at the top of [README.md](README.md). After the initial HACS Integration installation, all files update together through HACS. No manual custom-component file copies or YAML integration entry are needed. The optional JustWatch lookup is independent of Nuvio, with no extra JustWatch API key; keep your existing TMDB API key in the card's editor.
