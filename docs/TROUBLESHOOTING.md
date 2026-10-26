# Troubleshooting — Nexus Clip GNOME Extension

Symptom → cause → fix. See `docs/DEVELOPMENT.md` for commands.

## The extension is installed but `make enable` says "não existe"

**Cause:** on **Wayland** the running shell cannot see a newly installed extension.
**Fix:** log out and back in (X11: `Alt+F2` → `r`), then `make enable`.

## The shortcut does nothing

1. The shell may not have loaded the extension:
   `gnome-extensions info nexus-clip@bbanho` → expect `State: ENABLED`.
2. The shortcut may be **unbound**. The export template ships without a key. Open prefs
   and check the row subtitle: **Definir…** means no key is assigned.
3. A **hotkey conflict** — another extension/app owns the combination. The bundled
   `llm-text-modifier` uses `<Ctrl><Super>o` / `<Ctrl><Super>p`. GNOME itself owns
   `<Super>v` (message tray), `<Super>a`, `<Super>m`, `<Super>s`, `<Super>n`, and the
   arrow/tab workspace bindings. Prefer `<Alt><Super>…` combinations. Prefs warns about
   duplicates and known GNOME-reserved keys.
4. Check the log for a JS error (see below).

## GNOME froze when I pressed a shortcut (the old Super+X bug)

**Cause (fixed):** the old `selector.js` created a `Gtk.Window` **inside the GNOME Shell
process**. GTK opened its own Wayland connection and round-tripped back to the compositor
that was blocked inside the keybinding handler — a deadlock.

**Fix:** the extension no longer imports or instantiates GTK in the shell process. The
stack viewer and streaming panel are St/Clutter actors (`lib/hud.js`, ADR-0009). Prefs
still use GTK, but they run in a separate process.

If a build still freezes, check `journalctl` for `Gtk` / `selector` and reinstall:

```bash
make check && make install
# Wayland: log out and back in
```

## The result did not go to my system clipboard

That is by design: **Nexus has its own clipboard** (the stack top). Inference never writes
the system clipboard. To export:

- bind the **Copiar topo do Nexus para o sistema** action to a key in prefs, or
- bind **Mostrar pilha e fila**, select an item, and press `Enter`.

The system clipboard is read only by **Importar do sistema + processar**.

## "Clipboard do sistema vazio" when I press Importar e processar

- Copy the text immediately before pressing the shortcut. On Wayland the shell reads the
  clipboard at keypress time.
- If the read stalls, a 3 s guard aborts with **"Tempo esgotado ao ler o clipboard"**
  instead of leaving the action busy.
- Some apps (terminals with bracketed paste, password managers) do not expose plain text;
  copy from a normal text field.

## Nothing happens / "Erro:" notifications

- **Gateway down:** `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8010/health`
  → expect `200`.
- **Wrong model:** the gateway serves **Gemini** (`gemini-2.5-flash`, `gemini-3-flash`, …);
  an unknown id (e.g. `qwen2.5:7b`) returns HTTP 404 → `Endpoint ou modelo não encontrado`.
  Set a valid `model-name` in prefs.
- **Slow responses:** latency is variable (**2–27 s** observed). Streaming shows progress
  live in the bottom-right panel; the request timeout defaults to 90 s.
- **Busy:** a second action while an inference runs notifies "Ocupado — aguarde a
  operação atual". Wait or let it time out.

## "Pilha do Nexus vazia"

There is nothing to process. Use **Importar do sistema + processar** first, or process a
result that is still on the stack. The Nexus stack is independent of the system clipboard;
having text copied does not put it in Nexus.

## Shortcut capture does not work in prefs

- Click **Definir…** first; the button must show "Pressione a combinação…".
- The combination must include at least one of `Super`, `Alt`, `Ctrl`, or `Hyper`.
- `Esc` cancels capture; `Backspace` (with no modifier) clears the binding.
- If the key is captured by GNOME (e.g. `<Super>v`), the shell may win silently. Use a
  different combination; prefs shows a warning for known reserved keys.

## "TextDecoder does not implement the 'stream' option"

Known GJS limitation, already handled: the client uses the pure `createUtf8Decoder()` in
`lib/sse.js`. If you see this, you are on an older build — reinstall.

## Streaming finishes but the promise seems to hang (in a test script)

Not a module bug: a **top-level `await import(...)`** in a `gjs -m` script breaks GJS
promise-job draining while a `GLib.MainLoop` runs. Use a **static import** (ADR-0002 and
`docs/DEVELOPMENT.md`). Use `make smoke` as the reference.

## FIFO seems to stop mid-way

- **Rodar próximo da fila** consumes exactly one prompt per activation, and only after a
  successful inference. Press it repeatedly.
- **Rodar fila inteira** drains the queue, saving after each step. If a step fails, the
  completed steps remain on the stack and the failed/remaining prompts stay in the queue.
- Inspect `fifo.json` to see the remaining items.

## Reading the shell log

```bash
journalctl --user -b -o cat | grep -iE 'nexus-clip|JS ERROR|Gjs-CRITICAL' | tail -40
```

## Schema / settings errors

Recompile and reinstall after editing the gschema:

```bash
glib-compile-schemas extension/schemas
make install
# then reload the shell (Wayland: log out/in)
```

Read current values:

```bash
gsettings --schemadir extension/schemas list-recursively org.gnome.shell.extensions.nexus-clip
```
