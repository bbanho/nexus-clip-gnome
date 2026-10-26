# Nexus Clip for GNOME

[![CI](https://github.com/bbanho/nexus-clip-gnome/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/bbanho/nexus-clip-gnome/actions/workflows/ci.yml)

Nexus Clip is a GNOME Shell extension that gives text workflows their **own clipboard**:
a persistent LIFO stack for source text and model results, plus a FIFO queue for prompts.
It connects to an OpenAI-compatible chat-completions endpoint.

> **Clipboard safety:** the Nexus stack is separate from the desktop clipboard. Nexus
> reads the desktop clipboard only when you explicitly import text, and writes to it
> only when you explicitly export an item. Inference never replaces your clipboard.

> **Project status:** proof of concept. See [scope and limitations](#status-and-limitations)
> before relying on it for critical work.

> **Interface language:** the current Preferences and notification labels are in
> Portuguese. This English documentation gives English names first and includes the exact
> Portuguese UI label in code formatting when needed to help locate the control.

## At a glance

- **Import + process** selected/copied text with a shortcut and save both input and result
  in Nexus.
- **Process the Nexus top** repeatedly to create a traceable chain of results.
- **Queue prompts** and run one at a time or drain the queue; failed work stays retryable.
- **Choose your shortcuts and prompts** in Preferences, with up to 12 shortcut entries.
- **Use streaming** to watch a response arrive in a non-focusable shell panel.
- **Inspect and export** items through the stack viewer.

## Requirements

- GNOME Shell 45–50 (developed and validated on GNOME Shell 50.3 / Wayland).
- GJS, `glib-compile-schemas`, and GNOME Shell extension tools.
- An accessible OpenAI-compatible `/v1/chat/completions` endpoint. The default endpoint
  and model can be changed in Preferences; see [Configuration](docs/CONFIGURATION.md).

## Install from a clone

```bash
git clone https://github.com/bbanho/nexus-clip-gnome.git
cd nexus-clip-gnome
make install
```

On Wayland, log out and back in so GNOME Shell discovers a newly installed extension.
Then enable it and open Preferences:

```bash
make enable
gnome-extensions prefs nexus-clip@bbanho
```

Check installation status with:

```bash
gnome-extensions info nexus-clip@bbanho
```

See [Development](docs/DEVELOPMENT.md) for packaging, reinstalling, and reload details.

## First use

1. Open **Preferences → API** and set the endpoint, model, and API key required by your
   provider. The key is stored in GNOME Settings (dconf), not in this repository.
2. Copy some plain text in another application.
3. Press **`Alt` + `Super` + `V`** to import that text into Nexus and process it with the
   shortcut's prompt.
4. Press **`Alt` + `Super` + `C`** to process the current Nexus top again.
5. To paste a result into another application, explicitly export it with **Copy Nexus top
   to system** (UI label: `Copiar topo do Nexus para o sistema`), or open **Show stack and
   queue** (UI label: `Mostrar pilha e fila`), select an item, and press **Enter**.

The defaults are:

| Shortcut | Action | Clipboard behavior |
|---|---|---|
| `Alt` + `Super` + `V` | **Import and process** (`Importar e processar`) | Reads desktop clipboard; stores source and result in Nexus; does not write back. |
| `Alt` + `Super` + `C` | **Process stack** (`Processar pilha`) | Sends the Nexus top for inference and stores the result in Nexus. |
| Unbound template | **Copy Nexus top to system** (`Copiar topo do Nexus para o sistema`) | Explicitly exports the Nexus top to the desktop clipboard. |

See the [User Guide](docs/USER_GUIDE.md) for all actions, queue behavior, and shortcuts.

## How the Nexus clipboard works

- `stack.json` is the Nexus clipboard. The newest item is the top (**LIFO**).
- Successful inferences create new result nodes linked to their source with `parentId`;
  processing a result again extends the chain.
- `fifo.json` stores prompts (**FIFO**). **Run next in queue** (`Rodar próximo da fila`)
  runs one prompt; **Run entire queue** (`Rodar fila inteira`) processes them in order and
  saves each successful step.
- **Undo** (`Desfazer`) removes the newest Nexus item. It does not change the desktop
  clipboard.
- The HUD viewer is built with GNOME Shell St/Clutter widgets. GTK is used only in the
  separate Preferences process, avoiding the old shell-freeze failure mode.

## Development and tests

```bash
make check   # schema validation, Node tests, syntax checks, GJS store smoke test
make smoke   # live HTTP client smoke test; needs a reachable endpoint
```

Enable local commit and push gates once per clone:

```bash
make hooks   # pre-commit and pre-push run make check
```

GitHub Actions also runs `make check` on pull requests. The test suite covers the critical
clipboard, shell-process, shortcut, schema, and state invariants; see
[Critical Points](docs/CRITICAL_POINTS.md). For the code map and data flows, see
[Architecture](docs/ARCHITECTURE.md).

## Documentation

| Guide | What it covers |
|---|---|
| [User Guide](docs/USER_GUIDE.md) | Actions, importing/exporting, prompt queue, HUD, and day-to-day use. |
| [Configuration](docs/CONFIGURATION.md) | API settings, shortcuts, GSettings keys, data files, and migration. |
| [Development](docs/DEVELOPMENT.md) | Build, tests, hooks, CI, install, and debugging. |
| [Architecture](docs/ARCHITECTURE.md) | Modules, lifecycle, data flows, state model, and HTTP contract. |
| [Critical Points](docs/CRITICAL_POINTS.md) | Invariants mapped to automated and manual tests. |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common install, keybinding, clipboard, gateway, and shell issues. |
| [ADRs](docs/adr/README.md) | Accepted and superseded architecture decisions. |
| [E2E Evidence](EVIDENCE.md) | Manual end-to-end validation runbook. |
| [Changelog](CHANGELOG.md) | Release history. |

## Status and limitations

- Supports OpenAI-compatible chat completions only; no embeddings, vector store, or
  branching history UI.
- Data is local, but prompts and imported text are sent to the configured inference
  endpoint when an inference action runs. Review your provider's data handling policy.
- Clipboard import depends on GNOME Shell's Wayland clipboard access at activation time;
  copy text immediately before invoking the import shortcut.
- The extension has not been presented as a GNOME Extensions publication/release. Install
  from source and validate in your own GNOME environment.

## Uninstall

```bash
make uninstall
```

Uninstalling the extension does not remove its data under
`~/.local/share/nexus-clip-gnome/` or its GSettings values. Back up or remove those
separately if desired.
