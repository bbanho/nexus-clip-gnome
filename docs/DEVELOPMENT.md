# Development — Nexus Clip GNOME Extension

## Prerequisites

- GNOME Shell 45–50 (`gnome-extensions 50.3` present on the dev box).
- GJS + libsoup3, `glib-compile-schemas`.
- Node.js **only for the pure-logic tests** (`node --test`) — the extension itself never
  runs under Node.

## Layout & the pure/impure split

All *logic* is pure and runs under `node --test`. GJS/UI modules stay thin.

| Pure (Node-testable) | GJS/UI (manual) |
|----------------------|-----------------|
| `lib/v1core.js`, `lib/sse.js`, `lib/store.js` | `lib/v1client.js`, `lib/selector.js`, `lib/actions.js`, `extension.js`, `prefs.js` |

Keep new logic in the pure column when possible; it is the cheapest thing to verify.

## Test

```bash
node --test            # 25 tests: store, v1core, sse
```

Syntax check every file before committing:

```bash
for f in extension/extension.js extension/lib/*.js; do node --check "$f"; done
```

## Build / install / enable

```bash
make compile-schemas   # glib-compile-schemas extension/schemas
make install           # schemas + metadata.json, extension.js, prefs.js, lib/, schemas/
make enable            # gnome-extensions enable nexus-clip@bbanho
make disable
make uninstall
```

> **Wayland:** a freshly installed extension is invisible to the running shell. Reload it
> by **logging out and back in** before `make enable` (X11: `Alt+F2` → `r`). This is why
> `make enable` can print `A extensão ... não existe` straight after install.

## Live smoke test (against the gateway)

The pure tests do not touch the network. To exercise the real client, use a **static
import** in a `gjs -m` script (a top-level `await import(...)` breaks GJS promise draining
while a `GLib.MainLoop` runs — see `docs/adr/0002`):

```js
// /tmp/smoke.mjs   ->  gjs -m /tmp/smoke.mjs
import GLib from 'gi://GLib';
import { chat, stream } from 'file:///var/home/bruno/repos/nexus-clip-gnome/extension/lib/v1client.js';

const ep = 'http://localhost:8010/v1/chat/completions';
const messages = [{ role: 'user', content: 'diga apenas: ok' }];
const loop = GLib.MainLoop.new(null, false);
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 45, () => { loop.quit(); return false; });

chat({ endpoint: ep, model: 'gemini-2.5-flash', apiKey: 'random', messages })
  .then(r => console.log('chat =>', JSON.stringify(r)));

let acc = '';
stream({ endpoint: ep, model: 'gemini-2.5-flash', apiKey: 'random', messages,
  onDelta: d => { acc += d; }, onFinish: () => console.log('onFinish acc=', JSON.stringify(acc)) })
  .then(() => loop.quit());

loop.run();
```

Expected: `chat => "ok"` and `onFinish acc= "ok"`. Gateways are slow sometimes (2–27s) —
prefer a generous timeout.

## Debugging in the shell

```bash
journalctl --user -b -o cat | grep -iE 'nexus-clip|JS ERROR|Gjs-CRITICAL' | tail -40
gnome-extensions info nexus-clip@bbanho
```

Inspect state directly:

```bash
cat ~/.local/share/nexus-clip-gnome/{stack,fifo}.json
tail -n5 ~/.local/share/nexus-clip-gnome/history.jsonl
```

## Adding / editing a preset

Presets live in the GSettings key `presets` (a JSON **object**). Edit them in prefs, or:

```bash
gsettings --schemadir extension/schemas set org.gnome.shell.extensions.nexus-clip \
  presets '{"my-prompt":"Do something.","summarize":"Resuma."}'
```

The **first key** is the "active preset" used by S1/S2. Reorder to change it.

## Conventions

- No credentials in the repo — `api-key` lives in dconf (GSettings) only.
- `.gitignore` excludes `extension/schemas/gschemas.compiled`.
- Never `imports.gi`/`imports.ui` (legacy); use `import X from 'gi://X'` and
  `resource:///org/gnome/...` ESM modules.
- Commit per logical unit; see `CHANGELOG.md`.
