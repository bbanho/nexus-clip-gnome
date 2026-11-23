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

## Recovering from common issues

- If a shortcut appears to do nothing, confirm the extension is enabled and that the
  shortcut is bound and not owned by GNOME or another application.
- If the stack is empty, importing text is a separate step from copying it to the desktop
  clipboard.
- If a result is not in the desktop clipboard, export it explicitly.
- If an import reports an empty clipboard, copy plain text immediately before invoking
  the action.

See [Troubleshooting](TROUBLESHOOTING.md) for diagnosis steps and logs.
