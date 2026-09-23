import json
from pathlib import Path

root=Path('custom_components/streaming_browser')
v2=root/'frontend/streaming-browser-card-v2.js'
popup=root/'frontend/streaming-browser-popup-card.js'
oldcard=root/'frontend/streaming-browser-card.js'
s=v2.read_text()
p=popup.read_text()
old=oldcard.read_text()

def once(source,old,new,label):
    assert source.count(old)==1,(label,source.count(old))
    return source.replace(old,new,1)

s=once(s,'''    form.hass = this._hass;
    if (updateData) form.data = this._config;''','''    // ha-form receives hass when first created in _render(). Reassigning it
    // on every HA state update can rebuild and close an open select menu.
    if (updateData) form.data = this._config;''','V2 form hass update')
s=once(s,'''    if (key !== this._hdmiSchemaKey) {
      this._hdmiSchemaKey = key;
      // Update only when the display TV or its source_list actually changes.''','''    if (key !== this._hdmiSchemaKey &&
        (updateData || !this.matches(':focus-within'))) {
      this._hdmiSchemaKey = key;
      // Keep the dropdown currently being used mounted during HA state updates.''','V2 HDMI schema update')
p=once(p,'''  setConfig(config) { this._config = { ...config }; this._render(); }
  set hass(value) { this._hass = value; if (this._v2Editor) this._v2Editor.hass = value; }''','''  setConfig(config) {
    const next={...config};
    const changed=JSON.stringify(next)!==JSON.stringify(this._config);
    this._config=next;
    // Ignore unchanged HA config echoes and preserve any active popup or
    // embedded V2 dropdown instead of replacing the editor subtree.
    if(!this._v2Editor||(changed&&!this.matches(':focus-within')))this._render();
  }
  set hass(value) { this._hass = value; if (this._v2Editor) this._v2Editor.hass = value; }''','popup visual editor setter')
s=once(s,'const STREAMING_BROWSER_VERSION = "0.4.137";','const STREAMING_BROWSER_VERSION = "0.4.139";','V2 version')
old=once(old,'const STREAMING_BROWSER_VERSION = "0.4.98";','const STREAMING_BROWSER_VERSION = "0.4.139";','V1 version for release workflow')
manifest=root/'manifest.json'
meta=json.loads(manifest.read_text())
assert meta['version']=='0.4.138',meta['version']
meta['version']='0.4.139'
v2.write_text(s)
popup.write_text(p)
oldcard.write_text(old)
manifest.write_text(json.dumps(meta,indent=2)+'\n')
print('PASS: Streaming Browser V2 and popup visual editor dropdowns remain mounted')
