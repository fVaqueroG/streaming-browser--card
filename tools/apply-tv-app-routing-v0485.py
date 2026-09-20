"""Bundle the TV-app compatibility fixes into the active HACS integration."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
base = root / 'custom_components/streaming_browser'
card = base / 'frontend/streaming-browser-card.js'
manifest = base / 'manifest.json'
readme = root / 'README.md'
source = card.read_text(encoding='utf-8')
old_version = 'const STREAMING_BROWSER_VERSION = "0.4.84";'
assert source.count(old_version) == 1, 'Expected the active integration at v0.4.84'
assert '/* Streaming Browser v0.4.85: native Android TV app routing' not in source
start = source.index('  _renderProviderCards(detail, providers, isSeries = false) {')
end = source.index('  _renderEpisodeBrowser(detail) {', start)
block = source[start:end]
old_tv_source = '        const tvSource = this._sourceForProvider(name);'
new_tv_source = '''        const tvSource = this._sourceForProvider(name) ||
          (this._platform() === "android_tv" && /crunchyroll/i.test(name) ? "Crunchyroll" : "");'''
assert block.count(old_tv_source) == 1
block = block.replace(old_tv_source, new_tv_source, 1)
old_destination = '''        const exactKind = !url ? "app" : isSeries
          ? (exact?.scope === "episode" && validEpisodeLink(exact) ? "episode" : "app")
          : "movie";
        const es = this._locale().startsWith("es");
        const captions = es
          ? { episode: "Episodio", season: "Temporada", series: "Serie", movie: "Película", app: "App" }
          : { episode: "Episode", season: "Season", series: "Series", movie: "Movie", app: "App" };
        const exactTv = Boolean(url) && this._platform() !== "roku";
        const tvCaption = captions[exactTv ? exactKind : "app"];
        const deviceCaption = captions[exactKind];'''
new_destination = '''        // The WatchHub/JustWatch episode query does not prove the provider
        // URL itself is episode-specific, or that its TV app accepts the URL.
        const destination = this._providerDestination(name, exact, detail, isSeries);
        const es = this._locale().startsWith("es");
        const captions = es
          ? { episode: "Episodio", season: "Temporada", series: "Serie", movie: "Película", app: "App" }
          : { episode: "Episode", season: "Season", series: "Series", movie: "Movie", app: "App" };
        const exactTv = Boolean(url) && destination.tvCanOpen;
        const tvCaption = captions[exactTv ? destination.deviceKind : "app"];
        const deviceCaption = captions[destination.deviceKind];'''
assert block.count(old_destination) == 1, 'Expected v0.4.84 action caption logic'
block = block.replace(old_destination, new_destination, 1)
source = source[:start] + block + source[end:]
source = source.replace(old_version, 'const STREAMING_BROWSER_VERSION = "0.4.85";', 1)
source = source.replace(' * v0.4.84\n', ' * v0.4.85\n', 1)
source += '\n' + (root / 'tools/streaming-browser-tv-app-routing-v0485.js').read_text(encoding='utf-8') + '\n'
card.write_text(source, encoding='utf-8')
data = json.loads(manifest.read_text(encoding='utf-8'))
assert data['version'] == '0.4.84'
data['version'] = '0.4.85'
manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
with readme.open('a', encoding='utf-8') as file:
    file.write('''\n\n## v0.4.85: TV app routing and optional ADB\n\nAndroid TV: the standard Android TV Remote is the primary path for app launching, navigation and Netflix/Prime supported deep links. Crunchyroll opens its installed Android TV app by package ID rather than sending an unsupported web URL (which produced the system \"no app can handle this\" dialog). An explicitly configured ADB media player is optional and used only when Netflix profile navigation is requested or normal app/deep-link actions explicitly fail. If ADB is not selected, profile selection remains manual. Netflix Android TV receives a `/watch/<id>` episode link rather than a rewritten `netflix://title/<id>` route. Prime episode links are not advertised as exact when their URL only identifies a generic `/detail/` title or series. Netflix LG webOS episode launches no longer reuse the known movie-only launcher format; they fall back to the official app until an episode-compatible TV link is demonstrated. The per-button destination caption describes the supported TV action separately from the external device URL. Existing rooms, HDMI, power switch, compact remote, regional WatchHub, Watchmode and JustWatch are retained. Actual title navigation remains app-version dependent and requires testing on the target TV.\n''')
print('Bundled Streaming Browser v0.4.85 TV-app compatibility and opt-in ADB')
