# Nexus Clip GNOME Shell Extension

Clipboard-driven LLM pipeline: a **LIFO stack** of copied inputs, a **FIFO** of chosen
prompts, and inference via an OpenAI-compatible `/v1` endpoint. It reads and writes the
clipboard **only** when you press one of its shortcuts.

> POC (proof of concept). The `/v1` HTTP contract is the intended integration seam for a
> later C + llama.cpp implementation; only OpenAI-compatible `/v1/chat/completions` is
> supported.

## Requirements

- GNOME Shell 45-50 (developed/validated on **50.3 Wayland**).
- A reachable OpenAI-compatible endpoint. Defaults to the local Nexus Gateway:
  `http://localhost:8010/v1/chat/completions`.

## Install

```bash
cd /var/home/bruno/repos/nexus-clip-gnome
make install          # compiles schemas + copies metadata.json, extension.js, prefs.js, lib/, schemas/
make enable
```

On **Wayland** a freshly installed extension is not visible to the running shell until it
is reloaded. Either log out and back in, or on X11 press `Alt+F2` → `r` → Enter. After the
reload, verify with:

```bash
gnome-extensions info nexus-clip@bbanho   # State: ENABLED
```

## Configure

```bash
gnome-extensions prefs nexus-clip@bbanho
```

Groups: **API** (`api-endpoint`, `model-name`, `api-key`, `stream`) and **Presets**
(a JSON object), plus **Atalhos** (three accelerator entries).

- `presets` is a JSON **object** mapping `name -> prompt text`, e.g.
  ```json
  {
    "fix-pt": "Corrija o português, mantendo o sentido e o tom.",
    "summarize": "Resuma em no máximo 2 linhas, em português.",
    "explain-code": "Explique este código de forma concisa, em português.",
    "translate-en": "Traduza para inglês natural, mantendo termos técnicos quando necessário."
  }
  ```
- **The "active preset" used by S1/S2 is the FIRST key of that object.** Reorder the JSON
  to change which prompt is active.
- `stream` (default `false`) turns on SSE streaming; in S2 the response then appears
  live in the selector window.
- `api-key` lives in GSettings/dconf only — never in the repo.

## Shortcuts

| Key | Action | Semantics |
|-----|--------|-----------|
| `<Super>c` | **S1 push+process** | Reads the clipboard → pushes it onto the LIFO stack → runs inference with the active preset → writes the result to the clipboard and appends a history node. |
| `<Super>x` | **S2 choose** | Takes the current item (top of the stack), runs inference (live in a GTK window when `stream=true`), writes the result to the clipboard, and opens a GTK window listing the presets. The prompt you pick is enqueued onto the FIFO. |
| `<Super>v` | **S3 loop** | Pops **one** prompt off the FIFO, applies it to the current item, writes the result to the clipboard (so you can paste in between) and reports the next prompt. When the FIFO empties it reports the final result. Press it again for each step. |

All three are remappable in prefs (avoid `<Ctrl><Super>o` / `<Ctrl><Super>p`, used by the
`llm-text-modifier` extension).

## State (on disk)

```
~/.local/share/nexus-clip-gnome/stack.json      # LIFO of inputs: { schemaVersion, items:[{id,parentId,text,ts}] }
~/.local/share/nexus-clip-gnome/fifo.json       # FIFO of chosen prompts: { schemaVersion, items:[{id,prompt,ts}] }
~/.local/share/nexus-clip-gnome/history.jsonl   # append-only inference history (prepares the future tree)
```

Override the directory with `NEXUS_CLIP_DATA_DIR` (used by the tests). The node shape
already carries `id`/`parentId` so a branching tree can be layered on later without a
schema break.

## Tests

Pure logic (state store, SSE parser, `/v1` payload/parse) runs outside the shell:

```bash
node --test        # 25 tests
```

UI/wiring (keybindings, `St.Clipboard`, GTK windows) is validated manually in the shell —
see `EVIDENCE.md`.

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module map, lifecycle, S1/S2/S3 flow diagrams, state model, HTTP contract, settings. |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Pure/impure split, build/install/reload, tests, live smoke test, debugging. |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Failure modes: enable after install, hotkey conflicts, gateway/model errors, hangs. |
| [`docs/adr/`](docs/adr/README.md) | Decision log (ADR-0001..0007). |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history (Keep a Changelog). |
| [`EVIDENCE.md`](EVIDENCE.md) | E2E validation runbook + recorded evidence. |
| [`llms.txt`](llms.txt) | Compact index for AI agents. |

## Known limitations / notes (POC)

- **Wayland**: `St.Clipboard` only sees clipboard text the shell owns; a shell reload
  (logout/login) is required after install.
- **Active preset = first key** of the `presets` object (see above).
- **S3 is stepwise by design** — one prompt per keypress, to allow manual intermediate
  paste. It never drains the FIFO in a single activation.
- **Gateway note**: the Nexus Gateway keeps the HTTP socket open after sending
  `data: [DONE]`; the client therefore treats `[DONE]` as terminal instead of waiting for
  EOF.
- Non-Goals for the POC: no tree/branching yet, no C++/llama.cpp, no providers other than
  OpenAI-compatible `/v1/chat/completions`, no embeddings/vector store.

## Uninstall

```bash
make uninstall
```
