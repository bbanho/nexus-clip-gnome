# Nexus Clip — GNOME Shell extension

A **Nexus clipboard** for GNOME Shell: a LIFO stack of inputs and results, a FIFO of
prompts, and inference through an OpenAI-compatible `/v1` endpoint.

The key design rule: **Nexus has its own clipboard; the system clipboard is separate.**
Nexus never reads or writes the system clipboard behind your back. It only touches it
when *you* invoke an explicit import or export action. Your normal `Ctrl+C` / `Ctrl+V`
keep working exactly as before.

> POC. The `/v1/chat/completions` HTTP contract is the integration seam for a later
> C + llama.cpp implementation. Only OpenAI-compatible endpoints are supported.

## Requirements

- GNOME Shell 45–50 (developed/validated on **50.3 Wayland**).
- A reachable OpenAI-compatible endpoint. Defaults to the local Nexus Gateway:
  `http://localhost:8010/v1/chat/completions`.

## Install

```bash
cd /var/home/bruno/repos/nexus-clip-gnome
make install          # compile schemas + copy extension files to ~/.local/share/gnome-shell/extensions
make enable
```

On **Wayland** the running shell only sees a newly installed extension after a reload:
log out and back in (on X11: `Alt+F2` → `r` → Enter). Then verify:

```bash
gnome-extensions info nexus-clip@bbanho   # State: ENABLED
```

## Default shortcuts

| Key | Name | What it does |
|-----|------|--------------|
| `<Alt><Super>v` | **Importar e processar** | Reads the **system clipboard**, imports the text into Nexus, applies this shortcut's prompt, and pushes the result onto the Nexus stack. The system clipboard is **not** overwritten. |
| `<Alt><Super>c` | **Processar pilha** | Applies this shortcut's prompt to the **top of the Nexus stack** and pushes the result as a new node. |

Results stay in Nexus. To move one back to the system clipboard, use the **Copiar topo
do Nexus para o sistema** action — it ships as an unbound template in Preferências, so
capture a key there once. The stack viewer (action **Mostrar pilha e fila**) also copies
the selected item on `Enter`.

## Configure

```bash
gnome-extensions prefs nexus-clip@bbanho
```

- **API** — endpoint, model, API key, streaming (SSE), request timeout.
- **Atalhos e prompts** — one expander per shortcut:
  - **Nome** — free-form label (shown in notifications and the HUD).
  - **Atalho** — click **Definir…** and press the combination. `Esc` cancels; `Backspace`
    clears the binding. At least one of `Super`, `Alt`, `Ctrl`, or `Hyper` is required.
  - **Ação** — `Importar do sistema + processar`, `Processar topo do Nexus`,
    `Copiar topo do Nexus para o sistema`, `Enfileirar prompt`, `Rodar próximo da fila`,
    `Rodar fila inteira`, `Desfazer (voltar um item)`, `Mostrar pilha e fila`.
  - **Prompt do usuário** — sent as the `system` message; each shortcut has its own
    prompt. Prompt-based actions refuse to run with an empty prompt.
  - **Adicionar / remover** — up to 12 shortcuts.
- **Nexus — pilha, fila e histórico** — item counts, current top, data directory, and
  buttons to clear the stack, the queue, and the history.

Shortcuts are stored as a JSON array in GSettings (`shortcuts`). The extension mirrors
the active bindings into `hotkey-slot-0..11` because `Main.wm.addKeybinding()` needs a
schema key. Editing a prompt or label does not re-grab keys; changing an accelerator does.

### Migration from the old `presets` object

On first enable after upgrading, the legacy `presets` JSON object is converted:
its first prompt feeds the two default shortcuts, and the remaining prompts become
unbound shortcuts (just capture keys for the ones you want). The old `presets` key is
kept for reference only.

## Nexus clipboard model

- `stack.json` is the Nexus clipboard: newest item first (**LIFO**).
- `fifo.json` is a queue of prompts (**FIFO**).
- Every successful inference appends a **result node** whose `parentId` points at the
  item that was processed. A result can be processed again, forming a chain.
- **Desfazer** pops the newest node; the previous node becomes the Nexus clipboard again.
- **Importar do sistema + processar** is the only action that reads the system clipboard.
- **Copiar topo** and the HUD `Enter` are the only actions that write it.
- No action writes results to the system clipboard automatically.

## State (on disk)

```
~/.local/share/nexus-clip-gnome/stack.json      # LIFO nodes: {schemaVersion, items:[...]}
~/.local/share/nexus-clip-gnome/fifo.json       # FIFO prompts: {schemaVersion, items:[...]}
~/.local/share/nexus-clip-gnome/history.jsonl   # append-only inference log
```

A stack node looks like:

```json
{
  "id": "res_...",
  "parentId": "item_...",
  "text": "resultado",
  "ts": 0,
  "kind": "result",
  "prompt": "Corrija o português..."
}
```

Override the directory with `NEXUS_CLIP_DATA_DIR` (used by tests). `schemaVersion: 1`
leaves room for a future branching tree without a shape break.

## Tests

Pure logic runs under Node; the Gio persistence adapter and the live HTTP client have
GJS smoke tests:

```bash
make check   # node --test + node --check on every module + GJS store smoke + schema compile
make smoke   # live gateway: chat() and stream() against :8010
```

`make smoke` requires the gateway. `make check` does not touch the network.

Enable the local gate once per clone:

```bash
make hooks   # core.hooksPath=.githooks; pre-commit and pre-push run make check
```

GitHub Actions runs the same `make check` on every pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). The tests cover the
[critical points](docs/CRITICAL_POINTS.md): no GTK in the shell process, no implicit
clipboard writes, accelerator validation, result-node semantics, and malformed-state
resilience. `make smoke` is intentionally not part of CI because it needs the local
gateway.

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module map, lifecycle, data flows, state model, HTTP contract, settings. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Pure/impure split, build/install/reload, tests, smoke tests, debugging. |
| [`docs/CRITICAL_POINTS.md`](docs/CRITICAL_POINTS.md) | Invariants (freeze, clipboard boundary, state) mapped to tests and enforcement. |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Enable-after-install, the old Super+X freeze, clipboard, gateway/model errors. |
| [`docs/adr/`](docs/adr/README.md) | Decision log (ADR-0001..0010). |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history (Keep a Changelog). |
| [`EVIDENCE.md`](EVIDENCE.md) | E2E validation runbook + recorded evidence. |
| [`llms.txt`](llms.txt) | Compact index for AI agents. |

## Known limitations (POC)

- **Wayland import**: `St.Clipboard` reads the system clipboard at keypress time; copy
  immediately before pressing **Importar e processar**. If the read stalls, a 3 s
  timeout reports an error instead of hanging the action.
- **No automatic export**: by design, results are not copied to the system clipboard.
  Bind **Copiar topo** (or use the HUD `Enter`) when you want to paste elsewhere.
- **Active shortcut prompts are per shortcut**, not a global "active preset".
- **Gateway note**: the Nexus Gateway keeps the HTTP socket open after `data: [DONE]`;
  the client treats `[DONE]` as terminal instead of waiting for EOF.
- Non-goals: no tree/branching UI yet, no C++/llama.cpp, no providers other than
  OpenAI-compatible `/v1/chat/completions`, no embeddings/vector store.

## Uninstall

```bash
make uninstall
```
