# Development — Nexus Clip GNOME Extension

## Prerequisites

- GNOME Shell 45–50 (`gnome-extensions` 50.x on the dev box).
- GJS + libsoup3, `glib-compile-schemas`.
- Node.js **only for the pure-logic tests** (`node --test`) — the extension itself never
  runs under Node.

## Layout & the pure/impure split

All *logic* is pure and runs under `node --test`. GJS/UI modules stay thin.

| Pure (Node-testable) | GJS/UI (smoke/manual) |
|----------------------|------------------------|
| `lib/shortcuts.js`, `lib/config.js` | `lib/v1client.js`, `lib/hud.js`, `lib/actions.js` |
| `lib/store-core.js`, `lib/store-io.js`, `tests/helpers/store-node.js` | `lib/store.js`, `extension.js`, `prefs.js` |
| `lib/v1core.js`, `lib/sse.js` | |

Keep new logic in the pure column when possible; it is the cheapest thing to verify.

## Test

```bash
make check
```

`make check` runs:

1. `glib-compile-schemas --strict extension/schemas`
2. `node --test` — shortcut model, config migration, LIFO/FIFO, SSE, `/v1` helpers,
   malformed-state recovery, shell/clipboard boundary invariants, and the schema contract
3. `node --check` on `extension.js`, `prefs.js`, and every `lib/*.js`
4. `gjs -m tests/gjs-store-smoke.mjs` — the real Gio persistence adapter

The live network smoke test is separate:

```bash
make smoke   # requires the gateway on :8010
```

It exercises both `chat()` and `stream()` and exits non-zero on failure.

## Hooks & CI (required before merge)

Enable the local gate once per clone:

```bash
make hooks   # chmod +x .githooks/*; git config core.hooksPath .githooks
```

`.githooks/pre-commit` and `.githooks/pre-push` both run `make check`. Do not bypass
them with `--no-verify`; if a test is wrong, fix the test in the same PR.

Every pull request also runs `make check` in GitHub Actions
(`.github/workflows/ci.yml`). The `check` job must be green before merge. If you have
admin access, mark it as a required status check in the branch protection rules for
`master`. `make smoke` is not in CI because it needs the local Nexus Gateway.

The invariants behind these gates are listed in
[`CRITICAL_POINTS.md`](CRITICAL_POINTS.md), including which ones are covered by unit tests
and which require the manual/E2E runbook.

### Why static imports in GJS smoke scripts

A top-level `await import(...)` in a `gjs -m` script breaks GJS promise-job draining
while a `GLib.MainLoop` runs (ADR-0002). The smoke scripts therefore use static imports.

## Build / install / enable

```bash
make compile-schemas   # glib-compile-schemas extension/schemas
make hooks             # enable .githooks (pre-commit/pre-push -> make check)
make install           # schemas + metadata.json, extension.js, prefs.js, lib/, schemas/
make pack              # dist/nexus-clip@bbanho.shell-extension.zip (includes lib/)
make enable            # gnome-extensions enable nexus-clip@bbanho
make disable
make uninstall
```

> **Wayland:** a freshly installed extension is invisible to the running shell. Reload it
> by **logging out and back in** before `make enable` (X11: `Alt+F2` → `r`). This is why
> `make enable` may report that the extension does not exist immediately after install
> (Portuguese UI: `A extensão ... não existe`).

> **Never create GTK widgets in the shell process.** That was the cause of the old
> Super+X freeze (ADR-0009). In-shell UI belongs in `hud.js` and must use St/Clutter.
> Prefs are the exception: they run in a separate process.

## Adding or editing a shortcut

1. Open prefs:
   ```bash
   gnome-extensions prefs nexus-clip@bbanho
   ```
2. Expand a shortcut (or click **Add**; UI: `Adicionar`).
3. Click **Set…** (UI: `Definir…`) and press the combination. `Esc` cancels;
   `Backspace` clears it.
   At least one of `Super`, `Alt`, `Ctrl`, `Hyper` is required.
4. Choose the **Action** (UI: `Ação`), edit the **Prompt** for prompt-based actions, and
   give the shortcut a name.

Under the hood the list is a JSON array in the `shortcuts` key:

```json
[
  {
    "id": "sc_default_push_process",
    "label": "Import and process",
    "accel": "<Alt><Super>v",
    "mode": "push-process",
    "prompt": "Correct the grammar while preserving the meaning and tone."
  }
]
```

The extension mirrors registered bindings into `hotkey-slot-0..11`; do not edit those
directly. Changing a prompt/label does not re-grab keys. Changing an accelerator does.

To script a change:

```bash
gsettings --schemadir extension/schemas set org.gnome.shell.extensions.nexus-clip \
  shortcuts '[{"id":"mine","label":"Summarize","accel":"<Alt><Super>r","mode":"push-process","prompt":"Summarize in two lines."}]'
```

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

Open the stack viewer by binding an action to **Show stack and queue** (UI label:
`Mostrar pilha e fila`). `Enter` copies the selected item to the system clipboard; `Esc`
closes the viewer.

## Conventions

- No credentials in the repo — `api-key` lives in dconf (GSettings) only.
- `.gitignore` excludes `extension/schemas/gschemas.compiled`.
- Never `imports.gi`/`imports.ui` (legacy); use `import X from 'gi://X'` and
  `resource:///org/gnome/...` ESM modules.
- No GTK in shell-process modules; use St/Clutter.
- Never write to the system clipboard from an inference path; export is explicit.
- Commit per logical unit; see `CHANGELOG.md`.
