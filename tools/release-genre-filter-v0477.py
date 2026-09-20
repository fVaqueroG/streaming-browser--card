"""Add a mode-aware TMDB genre selector beside Movies / Series."""
from pathlib import Path
import json

root = Path('custom_components/streaming_browser')
card = root / 'frontend/streaming-browser-card.js'
src = card.read_text(encoding='utf-8')
old_version, new_version = '0.4.76', '0.4.77'

def replace_once(old, new, title):
    global src
    count = src.count(old)
    assert count == 1, f'{title}: expected one anchor, found {count}'
    src = src.replace(old, new, 1)

replace_once('    this._mode = "movie";\n    this._provider = "all";', '''    this._mode = "movie";
    // Genres are fetched from TMDB for each media type and language.
    // Keep separate selections when switching Movies / Series.
    this._genres = { movie: [], tv: [] };
    this._genreByMode = { movie: "all", tv: "all" };
    this._browseRequest = 0;
    this._provider = "all";''', 'constructor genre state')
replace_once('      await this._loadProviderLists();\n      this._matchProvidersToTv();', '''      await Promise.all([this._loadProviderLists(), this._loadGenreLists()]);
      this._matchProvidersToTv();''', 'initialize genre request')
replace_once('            "all_sources": "All sources",', '''            "all_sources": "All sources",
            "genre": "Genre",
            "all_genres": "All genres",''', 'English genre labels')
replace_once('            "all_sources": "Todas las fuentes",', '''            "all_sources": "Todas las fuentes",
            "genre": "Género",
            "all_genres": "Todos los géneros",''', 'Spanish genre labels')
replace_once('  // ---------------------------------------------------------------------------\n  // Provider / LG source matching\n  // ---------------------------------------------------------------------------', '''  // Pull localized genre names from TMDB; film and television IDs differ.
  // A failure here must never prevent the selected provider catalog from loading.
  async _loadGenreLists() {
    const modes = ["movie", "tv"];
    const results = await Promise.allSettled(
      modes.map((mode) => this._apiWithTimeout(`/genre/${mode}/list`, {}, 8000))
    );
    modes.forEach((mode, index) => {
      if (results[index].status !== "fulfilled") return;
      const list = results[index].value?.genres;
      if (!Array.isArray(list)) return;
      this._genres[mode] = list.filter((genre) =>
        Number.isInteger(Number(genre.id)) && Number(genre.id) > 0 &&
        typeof genre.name === "string" && genre.name.trim()
      ).map((genre) => ({ id: String(genre.id), name: genre.name.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name, this._languageCode()));
    });
  }

  // ---------------------------------------------------------------------------
  // Provider / LG source matching
  // ---------------------------------------------------------------------------''', 'genre API helper')
replace_once('      include_adult: "false",\n    };\n\n    const recentDateField', '''      include_adult: "false",
      // TMDB applies this genre server-side before paginating the catalog.
      ...(this._genreByMode[mode] !== "all"
        ? { with_genres: this._genreByMode[mode] } : {}),
    };

    const recentDateField''', 'discover with_genres')
replace_once('''        if (section.search) {
          return ["movie", "tv"].includes(item.media_type);
        }

        return true;''', '''        if (section.search) {
          if (!["movie", "tv"].includes(item.media_type)) return false;
          const genre = this._genreByMode[section.mediaType || this._mode] || "all";
          if (genre === "all") return true; // Keep the existing global search.
          return item.media_type === (section.mediaType || this._mode) &&
            Array.isArray(item.genre_ids) &&
            item.genre_ids.some((id) => String(id) === genre);
        }

        return true;''', 'search genre matching')
replace_once('''  async _loadBrowse() {
    if (!this._config || !this._hass) return;

    this._loading = true;''', '''  async _loadBrowse() {
    if (!this._config || !this._hass) return;
    const request = ++this._browseRequest;

    this._loading = true;''', 'new browse request')
replace_once('''      this._sections = results
        .filter((result) => result.status === "fulfilled")''', '''      if (request !== this._browseRequest) return;
      this._sections = results
        .filter((result) => result.status === "fulfilled")''', 'ignore old browse results')
replace_once('''    } catch (err) {
      this._error = this._formatError(err);
      this._sections = [];
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _loadMoreSection''', '''    } catch (err) {
      if (request !== this._browseRequest) return;
      this._error = this._formatError(err);
      this._sections = [];
    } finally {
      if (request === this._browseRequest) {
        this._loading = false;
        this._render();
      }
    }
  }

  async _loadMoreSection''', 'guard stale browse finalization')
replace_once('''    if (q.length < 2) {
      await this._loadBrowse();
      return;
    }

    this._loading = true;''', '''    if (q.length < 2) {
      await this._loadBrowse();
      return;
    }
    const request = ++this._browseRequest;

    this._loading = true;''', 'new search request')
replace_once('''      const section = await this._fetchSection(definition, 1);
      this._sections = section.items.length ? [section] : [];
    } catch (err) {
      this._error = this._formatError(err);
      this._sections = [];
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _mediaType''', '''      const section = await this._fetchSection(definition, 1);
      if (request !== this._browseRequest) return;
      this._sections = section.items.length ? [section] : [];
    } catch (err) {
      if (request !== this._browseRequest) return;
      this._error = this._formatError(err);
      this._sections = [];
    } finally {
      if (request === this._browseRequest) {
        this._loading = false;
        this._render();
      }
    }
  }

  _mediaType''', 'guard stale search finalization')
replace_once('''    const providers = previousSelection ? [...availableProviders, previousSelection] : availableProviders;

    const tv = this._tvState();''', '''    const providers = previousSelection ? [...availableProviders, previousSelection] : availableProviders;
    const activeGenre = this._genreByMode[this._mode] || "all";
    const genreOptions = [
      `<option value="all" ${activeGenre === "all" ? "selected" : ""}>${this._esc(this._t("all_genres"))}</option>`,
      ...(this._genres[this._mode] || []).map((genre) =>
        `<option value="${this._esc(genre.id)}" ${activeGenre === genre.id ? "selected" : ""}>${this._esc(genre.name)}</option>`),
    ].join("");

    const tv = this._tvState();''', 'genre dropdown options')
replace_once('''        .switcher {
          display: flex;
          gap: 6px;
          margin: 2px 0 12px;
        }''', '''        .switcher {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin: 2px 0 12px;
        }
        .genre-select {
          min-width: 132px;
          max-width: min(225px, 50vw);
          min-height: 38px;
          margin-left: 4px;
          padding: 7px 9px;
          border: 1px solid var(--divider-color);
          border-radius: 16px;
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
        }
        .genre-select:focus-visible { outline: 2px solid var(--primary-color); }''', 'genre dropdown style')
replace_once('''              ${this._t("tv_series")}
            </button>
          </div>

          <div class="chips">''', '''              ${this._t("tv_series")}
            </button>
            <select class="genre-select" aria-label="${this._esc(this._t("genre"))}"
              title="${this._esc(this._t("genre"))}">${genreOptions}</select>
          </div>

          <div class="chips">''', 'genre dropdown next to mode buttons')
replace_once('''          this._mode = element.dataset.mode;
          this._ensureSelectedProvider();
          this._query = "";
          await this._loadBrowse();''', '''          this._mode = element.dataset.mode;
          this._ensureSelectedProvider();
          this._rowScrollPositions.clear();
          this._query = "";
          await this._loadBrowse();''', 'switch modes reset row scroll')
replace_once('''    root
      .querySelectorAll("[data-provider]")
      .forEach((element) =>''', '''    root.querySelector(".genre-select")?.addEventListener("change", async (event) => {
      const genre = String(event.target.value);
      if (genre !== "all" && !(this._genres[this._mode] || []).some((g) => g.id === genre)) return;
      if (this._genreByMode[this._mode] === genre) return;
      this._genreByMode[this._mode] = genre;
      this._query = "";
      this._rowScrollPositions.clear();
      await this._loadBrowse();
    });

    root
      .querySelectorAll("[data-provider]")
      .forEach((element) =>''', 'genre change event')
replace_once(f'const STREAMING_BROWSER_VERSION = "{old_version}";', f'const STREAMING_BROWSER_VERSION = "{new_version}";', 'JS version')
src = src.replace(' * v0.4.76\n', ' * v0.4.77\n', 1)
src = src.replace('STREAMING-BROWSER-CARD %c v0.4.76', 'STREAMING-BROWSER-CARD %c v0.4.77', 1)
card.write_text(src, encoding='utf-8')
manifest_path = root / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['version'] == old_version
manifest['version'] = new_version
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
readme = Path('README.md')
docs = readme.read_text(encoding='utf-8')
marker = '## Recent release highlights\n\n'
assert docs.count(marker) == 1
note = '- **v0.4.77 — Genre dropdown:** Beside Movies and Series, choose a TMDB genre such as Horror, Comedy or Drama, or All genres. Movie and TV genre names come from TMDB in the configured language. Genre and streaming-provider filters combine server-side for paginated catalogs; each mode remembers its own genre selection.\n'
readme.write_text(docs.replace(marker, marker + note, 1), encoding='utf-8')
print('PASS: v0.4.77 per-mode TMDB genre dropdown and discovery filtering patched')
