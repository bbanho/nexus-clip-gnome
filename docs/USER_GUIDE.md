# User Guide

This guide covers everyday use of Nexus Clip. For installation, start at the
[README](../README.md); for the exact settings and storage formats, see
[Configuration](CONFIGURATION.md).

## The two clipboards

Nexus Clip maintains its own clipboard, independent of GNOME's desktop clipboard:

- **Desktop clipboard:** text shared by applications through normal copy/paste.
- **Nexus clipboard:** the top item in a persistent LIFO stack of inputs and results.

The extension does not synchronize them automatically. Import and export are explicit
actions, so an inference result will not silently overwrite text you copied elsewhere.

## The Super command bar (recommended)

Press **`Super` + `;`** once. A small St panel (not a separate app window) opens with the live
stack/FIFO depth and the next queued step. Then press **one key**:

| Key | Action |
|---|---|
| `V` | Import the desktop clipboard and process it with AI |
| `C` | Process the current Nexus top with AI |
| `X` | Copy the Nexus top to the desktop clipboard (explicit export) |
| `Q` | Enqueue the prompt of the configured `enqueue` shortcut |
| `N` | Run the next FIFO step (result goes on top) |
| `D` | Drain the whole FIFO, in order, showing `1/15 … 15/15` progress |
| `Z` | Undo one stack item |
| `H` | Open the visual history / queue / prompt panel |
| `A` | Import audited text (requires the `NEXUS-TEXT-1` magic number; Nexus only) |
| `M` | Import **and mirror** to the desktop clipboard (explicit opt-in) |
| `S` | Show a quiet overview: stack / queue / history counts and next step |
| `U` | Record provenance for the top item (UUID + hash + counters, no text) |
| `1`–`5` | Enqueue one of the first five ready-made prompt templates |
| `Esc` | Close without doing anything |

`C` and `D` are the "process top" and "process all" operations; the queue is drained in
FIFO order and the badge shrinks after each step. `A` is the text-only path: copy text that
starts with a line containing exactly `NEXUS-TEXT-1`, then press `A`. Anything binary,
executable-looking, empty, or larger than 64 KiB is refused before inference. `M` is the only
new action that writes the desktop clipboard; use it only when you want both copies.

This is the natural-behavior path: only one global chord is grabbed, so ordinary
`Super+C`/`Super+V` and typing are untouched. The direct `Alt`+`Super` shortcuts below remain
available for people who prefer one-keystroke actions.

### The queue badge

While the FIFO has items, a purple badge stays at the top-left of the screen:
`NEXUS · FILA 15 · PRÓX: Resumir … · pilha 7`. It updates after every enqueue and every
completed step, and disappears when the queue empties. Disable it in Preferences →
*Notificações e estado* → *Distintivo da fila* if you find it distracting.

## Default shortcuts

| Default | Action | Result |
|---|---|---|
| `Alt` + `Super` + `V` | **Importar e processar** | Reads plain text from the desktop clipboard, adds it to Nexus if it differs from the current top, then runs inference with this shortcut's prompt. |
| `Alt` + `Super` + `C` | **Processar topo** | Runs inference on the current Nexus top and pushes a new result node. |
| `Alt` + `Super` + `X` | **Copiar topo para o sistema** | Explicitly exports the Nexus top to the desktop clipboard. |
| `Alt` + `Super` + `H` | **Histórico visual** | Opens the searchable history panel (see below). |
| `Alt` + `Super` + `Z` | **Desfazer** | Pops the newest Nexus item; the previous item becomes the top. |

`import` (import without processing), `enqueue`, `run-next`, and `drain` ship as **unbound**
templates. Assign a key in Preferences only if you use them.

## Available actions

Open Preferences with:

```bash
gnome-extensions prefs nexus-clip@bbanho
```

Each shortcut entry has a label, accelerator, action, and (where needed) its own prompt.
Add or remove entries in **Atalhos e prompts**; up to 12 entries can be configured.

| Action | Prompt required? | Behavior |
|---|---:|---|
| **Importar do sistema + processar** | Yes | Import desktop text, then infer. The imported input remains on the Nexus stack even if inference fails. |
| **Processar topo do Nexus** | Yes | Infer on the stack top and push a linked result. |
| **Copiar topo do Nexus para o sistema** | No | Explicitly copy the top item to the desktop clipboard. |
| **Enfileirar prompt** | Yes | Append the prompt to the FIFO queue; it is not executed immediately. |
| **Rodar próximo da fila** | No | Run the oldest queued prompt against the current Nexus top. Consume it only after success. |
| **Rodar fila inteira** | No | Process queued prompts in order, saving every successful step. On failure, completed work remains saved and the failed/remaining work stays queued. |
| **Desfazer (voltar um item)** | No | Pop the newest stack item. The previous item becomes the Nexus top. |
| **Importar do sistema (sem processar)** | No | Read the desktop clipboard into the Nexus stack without calling the model. |
| **Mostrar pilha e fila** | No | Open the visual history on the Pilha tab. |
| **Abrir histórico visual** | No | Open the visual history on the Histórico tab. |
| **Importar texto com magic number auditado** | No | Read the desktop clipboard, require `NEXUS-TEXT-1\n`, strip the marker and push the payload to Nexus. Never writes the desktop clipboard. |
| **Importar e espelhar no clipboard do sistema** | No | Read the desktop clipboard, push to Nexus **and** write the same text back to the desktop clipboard. Explicit opt-in export. |
| **Visão geral das pilhas** | No | Status chip with stack / queue / history counts and the next queued label. No content in system notifications. |
| **Gravar UUID e vetor característico** | No | Record a deterministic UUID, content hash and counter vector for the current top. No prompt or text is sent to the KV/harness boundary. |

An action that requires a prompt will not start if its prompt is empty. If an inference is
already running, another action reports that Nexus is busy instead of starting a second
request.

## Visual history

`Alt` + `Super` + `H` (or the **Mostrar pilha e fila** action) opens a searchable panel with
four tabs:

- **Pilha** — the Nexus LIFO stack (inputs and results, newest first).
- **Histórico** — the append-only inference log, newest first.
- **Fila** — the queued prompts.
- **Prompts** — the built-in prompt template library.

Keys: `↑`/`↓` (or `j`/`k`) select · `1`–`4` or `Tab` switch tabs · `/` focuses the search box ·
`Enter` copies the selected item to the **system clipboard** (explicit export) ·
`Ctrl`+`Enter` reuses the selected text as a new Nexus input · `Del` removes a stack/queue
item · `Esc` closes. On the **Prompts** tab, `Enter` enqueues the template into the FIFO
queue. The footer shows the available actions as buttons for mouse use.

## Prompt templates

A library of ready-made prompts (corrigir, resumir, traduzir, explicar código, mensagem de
commit, etc.) is available in two places:

- **Preferences → Atalhos e prompts**: expand a shortcut and pick a *Modelo de prompt* to
  fill its prompt editor in one click.
- **Visual history → Prompts tab**: select a template and press `Enter` to enqueue it.

## Notifications and status

Each operation shows a small, transient **status chip** naming what ran (e.g.
`✓ Processar topo · pilha 3`). System notifications are controlled by
**Preferences → Notificações e estado**:

- **Só erros (recomendado)** — default; routine successes stay on the status chip and in the
  history log, so you always know what happened without notification spam.
- **Todas as operações** — a system notification for every action.
- **Silencioso** — no system notifications (the status chip still shows if enabled).

You can toggle the status chip and set how long it stays visible (1–15 seconds).

## Customize a shortcut

1. Open **Preferences → Atalhos e prompts**.
2. Expand the shortcut row and click **Definir…**.
3. Press the desired key combination. Include at least one modifier (`Super`, `Alt`, `Ctrl`,
   `Shift`, `Hyper`, or `Meta`); a bare letter is rejected. `Esc` cancels capture and
   `Backspace` clears the binding.
4. Choose an action and edit its label and prompt as needed.

The extension supports up to 12 shortcut entries. Duplicate accelerators and known GNOME
reserved combinations are warned about. GNOME or another application may still own a
combination, so choose one that is free on your desktop.

## Streaming

Enable **Stream responses** in **Preferences → API** to show generated text as it arrives
in a small, non-focusable shell panel. Streaming does not export text to the desktop
clipboard. If streaming is disabled, the result appears after the complete response is
received.

## Where data goes

Stack, FIFO, and history are saved locally under
`~/.local/share/nexus-clip-gnome/`. Endpoint settings, shortcut definitions, and the API
key are held in GNOME Settings (dconf). Imported text, prompts, and model responses are
sent to the configured endpoint for inference. See [Configuration](CONFIGURATION.md) for
the file and setting details.

Copy-on-write is ephemeral by default: a clipboard read or an inference step creates a new
node and never mutates its source; importing or capturing provenance is the explicit opt-in
that persists a record. A provenance record stores the local origin item id with a UUID,
a hash and counters — never the source text or prompt. The same rule applies to the main
harness: only UUIDs, hashes and counters may cross that boundary.

## Recovering from common issues

- If a shortcut appears to do nothing, confirm the extension is enabled and that the
  shortcut is bound and not owned by GNOME or another application.
- If the stack is empty, importing text is a separate step from copying it to the desktop
  clipboard.
- If a result is not in the desktop clipboard, export it explicitly.
- If an import reports an empty clipboard, copy plain text immediately before invoking
  the action.

See [Troubleshooting](TROUBLESHOOTING.md) for diagnosis steps and logs.
