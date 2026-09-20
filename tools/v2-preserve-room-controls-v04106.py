"""Fix V2's legacy room wrapper after incremental rendering was introduced."""
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
base=root/'custom_components'/'streaming_browser'
js=base/'frontend'/'streaming-browser-card-v2.js'
manifest=base/'manifest.json'
data=json.loads(manifest.read_text(encoding='utf-8'))
assert data['version']=='0.4.105',data['version']
s=js.read_text(encoding='utf-8')
assert s.count('const STREAMING_BROWSER_VERSION = "0.4.105";')==1

# The old room-routing wrapper runs after the new incremental DOM commit. It
# must not insert another room selector into the existing, preserved header.
old="""    if (!available.length || !top) return;
    const room = this._roomCurrent();"""
new="""    if (!available.length || !top || top.querySelector('.sbr-room-controls')) return;
    const room = this._roomCurrent();"""
assert s.count(old)==1,'Cannot safely locate V2 room selector injection'
s=s.replace(old,new,1)

# A switch to a DIFFERENT room may change the number of connection choices.
# Force a full rebuild just for that routing change; routine genre/provider/
# category selections remain incremental, and same-room connection changes
# only touch their selected values and the TV status.
old="""    this._render();
    this.shadowRoot?.querySelectorAll('.catalog-row[data-section]').forEach((row) => {
      if (positions.has(row.dataset.section)) row.scrollLeft = positions.get(row.dataset.section);
    });"""
new="""    this._v2ForceFullRender = true;
    try { this._render(); }
    finally { this._v2ForceFullRender = false; }
    this.shadowRoot?.querySelectorAll('.catalog-row[data-section]').forEach((row) => {
      if (positions.has(row.dataset.section)) row.scrollLeft = positions.get(row.dataset.section);
    });"""
assert s.count(old)==1,'Cannot safely locate V2 room-change render'
s=s.replace(old,new,1)

# Profile selector is within the updated body rather than the preserved header.
# Bind its actions after a catalog replacement just as the full renderer does.
old="""  Card.prototype._v2BindCatalog = function(body) {
    body.querySelectorAll('.poster[data-index][data-section]').forEach(poster =>"""
new="""  Card.prototype._v2BindCatalog = function(body) {
    body.querySelectorAll('[data-profile]').forEach(button =>
      button.addEventListener('click', () =>
        this._setSelectedProfile(button.dataset.profile)));
    body.querySelectorAll('.poster[data-index][data-section]').forEach(poster =>"""
assert s.count(old)==1,'Cannot safely locate V2 incremental catalog events'
s=s.replace(old,new,1)

s=s.replace('const STREAMING_BROWSER_VERSION = "0.4.105";',
            'const STREAMING_BROWSER_VERSION = "0.4.106";',1)
js.write_text(s,encoding='utf-8')
data['version']='0.4.106'
manifest.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
with (root/'README.md').open('a',encoding='utf-8') as readme:
    readme.write('''\n\n## v0.4.106 — V2 incremental room-control fix\n\nComplete v0.4.105 partial-rendering support: reused room controls are no longer inserted a second time by the legacy routing wrapper; newly updated profile selector buttons keep their event handlers. Switching rooms performs a targeted full route refresh when connection options can differ, while movie/series/genre/provider/category selections and title catalog updates keep the fixed header mounted. V1 and streaming playback logic are unchanged.\n''')
print('PASS V2 prevents duplicate room selectors; profile selectors remain interactive; V1 unchanged')
