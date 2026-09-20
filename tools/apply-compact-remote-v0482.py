"""Resize only the Streaming Browser remote to match Nuvio's 176/166px popup."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'custom_components/streaming_browser'
CARD = BASE / 'frontend/streaming-browser-card.js'
MANIFEST = BASE / 'manifest.json'
source = CARD.read_text(encoding='utf-8')
old_version = 'const STREAMING_BROWSER_VERSION = "0.4.81";'
assert source.count(old_version) == 1, 'Expected v0.4.81 card: rebase compact styles first'
assert '/* Compact Nuvio-sized remote v0.4.82 */' not in source
start = source.index('  async _toggleNuvioRemote() {')
markup_start = source.index('      portal.innerHTML = `', start)
css_end = source.index('        </style>', markup_start)
markup_end = source.index('        </section>`;', markup_start)
assert css_end < markup_end, 'Expected inline styles in the remote popup'
remote_markup = source[markup_start:markup_end]
for key in ('WAKE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ENTER', 'BACK', 'HOME', 'PLAY', 'PAUSE', 'MUTE', 'VOLUME_DOWN', 'VOLUME_UP'):
    assert f'data-remote="{key}"' in remote_markup, f'Preserve existing {key} command'
assert '[1,2,3,4,5,6,7,8,9,"⌫",0,"↵"]' in remote_markup, 'Preserve complete 12-key keypad'

# The last CSS rules override only the popup's dimensions and spacing.
# Do not replace buttons, event listeners, routing, wake-up, or volume handling.
compact = '''          /* Compact Nuvio-sized remote v0.4.82 */
          .sbr-remote {
            top:max(10px,env(safe-area-inset-top));
            width:176px;max-width:calc(100vw - 20px);
            max-height:calc(100dvh - 20px);overflow-y:auto;
            padding:12px;border-radius:24px;font:500 12px/1.25 Roboto,Arial,sans-serif;
          }
          .sbr-head {gap:5px;margin:0 0 10px}
          .sbr-head-title {font-size:13px;line-height:1.2}
          .sbr-head-subtitle {font-size:9px;max-width:104px;margin-top:2px}
          .sbr-x {width:30px;height:30px;min-height:30px!important;font-size:21px!important}
          .sbr-wake {min-height:36px;gap:7px;border-radius:18px!important;font-size:12px!important}
          .sbr-wake ha-icon {--mdc-icon-size:17px}
          .sbr-pad {width:132px;max-width:100%;margin:12px auto;
            background:radial-gradient(circle at center,#2c2c2e 0 34%,#35353a 35% 100%)}
          .sbr-pad .sbr-dir ha-icon {--mdc-icon-size:32px}
          .sbr-pad .sbr-ok {font-size:11px;box-shadow:0 0 0 3px #2b2b3055}
          .sbr-numbers {gap:7px}
          .sbr-numbers button {min-height:36px;border-radius:12px;font-size:16px}
          .sbr-numbers .sbr-key-secondary {font-size:16px}
          .sbr-navigation {gap:8px;margin:10px 0 0}
          .sbr-navigation button {min-height:40px;border-radius:14px;gap:4px;font-size:12px}
          .sbr-navigation ha-icon {--mdc-icon-size:15px}
          .sbr-actions {grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;
            margin:10px 0 0;padding-top:10px}
          .sbr-actions .sbr-icon-btn {min-height:36px;padding:5px 0;border-radius:12px}
          .sbr-actions .sbr-icon-btn ha-icon {--mdc-icon-size:21px}
          /* Back and Home remain at the bottom, after Streaming Browser's extra controls. */
          .sbr-remote {display:flex;flex-direction:column}
          .sbr-navigation {order:5}
          .sbr-actions {order:4}
          @media(max-width:700px) {
            .sbr-remote {width:166px;padding:11px;border-radius:24px}
            .sbr-pad {width:122px;max-width:100%;margin:12px auto}
            .sbr-numbers {gap:7px}
            .sbr-numbers button {min-height:36px}
          }
'''
source = source[:css_end] + compact + source[css_end:]
source = source.replace(old_version, 'const STREAMING_BROWSER_VERSION = "0.4.82";', 1)
source = source.replace(' * v0.4.81\n', ' * v0.4.82\n', 1)
CARD.write_text(source, encoding='utf-8')
data = json.loads(MANIFEST.read_text(encoding='utf-8'))
assert data['version'] == '0.4.81', 'Expected the published v0.4.81 manifest'
data['version'] = '0.4.82'
MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with (ROOT / 'README.md').open('a', encoding='utf-8') as out:
    out.write('\n\n## v0.4.82: Nuvio-size remote\n\nThe Streaming Browser remote now matches the compact Nuvio remote size: 176px wide (166px on mobile) with a 132px D-pad (122px on mobile). Wake, the complete 12-key pad, Back/Home, Play/Pause, mute and volume all remain, with the extra controls in a compact secondary grid. The popup scrolls on short screens; playback, HDMI, room, and smart-plug routing are unchanged. Update the HACS integration, restart Home Assistant, and reload the dashboard.\n')
print('PASS compact Nuvio dimensions applied to v0.4.82 without altering remote command handlers')
