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
| `Alt` + `Super` + `V` | **Import and process** (UI: `Importar e processar`) | Reads plain text from the desktop clipboard, adds it to Nexus if it differs from the current top, then runs inference with this shortcut's prompt. |
| `Alt` + `Super` + `C` | **Process stack** (UI: `Processar pilha`) | Runs inference on the current Nexus top and pushes a new result node. |

The export shortcut is intentionally **unbound** by default. Assign a key to **Copy Nexus
top to system** (UI: `Copiar topo do Nexus para o sistema`) in Preferences, or use the HUD's
explicit export.

## Available actions

Open Preferences with:

```bash
gnome-extensions prefs nexus-clip@bbanho
```

Each shortcut entry has a label, accelerator, action, and (where needed) its own prompt.
Add or remove entries in **Shortcuts and prompts** (UI: `Atalhos e prompts`); up to 12
entries can be configured.

| Action (Preferences label) | Prompt required? | Behavior |
|---|---:|---|
| **Import from system and process** (`Importar do sistema + processar`) | Yes | Import desktop text, then infer. The imported input remains on the Nexus stack even if inference fails. |
| **Process Nexus top** (`Processar topo do Nexus`) | Yes | Infer on the stack top and push a linked result. |
| **Copy Nexus top to system** (`Copiar topo do Nexus para o sistema`) | No | Explicitly copy the top item to the desktop clipboard. |
| **Queue prompt** (`Enfileirar prompt`) | Yes | Append the prompt to the FIFO queue; it is not executed immediately. |
| **Run next in queue** (`Rodar próximo da fila`) | No | Run the oldest queued prompt against the current Nexus top. Consume it only after success. |
| **Run entire queue** (`Rodar fila inteira`) | No | Process queued prompts in order, saving every successful step. On failure, completed work remains saved and the failed/remaining work stays queued. |
| **Undo (pop latest item)** (`Desfazer (voltar um item)`) | No | Pop the newest stack item. The previous item becomes the Nexus top. |
| **Show stack and queue** (`Mostrar pilha e fila`) | No | Open the in-shell viewer. Use `↑`/`↓` or `k`/`j` to select, `Enter` to export the selected stack item, and `Esc`/`q` to close. |

An action that requires a prompt will not start if its prompt is empty. If an inference is
already running, another action reports that Nexus is busy instead of starting a second
request.

## Customize a shortcut

1. Open **Preferences → Shortcuts and prompts** (UI: `Atalhos e prompts`).
2. Expand the shortcut row and click **Set…** (UI: `Definir…`).
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
