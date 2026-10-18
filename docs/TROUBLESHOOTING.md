# Troubleshooting — Nexus Clip GNOME Extension

Symptom → cause → fix. See `docs/DEVELOPMENT.md` for commands.

## The extension is installed but `make enable` says "não existe"

**Cause:** on **Wayland** the running shell cannot see a newly installed extension.
**Fix:** log out and back in (X11: `Alt+F2` → `r`), then `make enable`.

## The shortcut does nothing

1. The shell may not have loaded the extension:
   `gnome-extensions info nexus-clip@bbanho` → expect `State: ENABLED`.
2. A **hotkey conflict** — another extension/app owns the combination. The bundled
   `llm-text-modifier` uses `<Ctrl><Super>o` / `<Ctrl><Super>p`; `<Super>v` can collide
   with paste-to-terminal in some setups. Remap in prefs and re-check.
3. Check the log for a JS error (see below).

## Nothing happens / "Erro:" notifications

- **Gateway down:** `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8010/health`
  → expect `200`. Bring the gateway up per its own docs.
- **Wrong model:** the gateway serves **Gemini** (`gemini-2.5-flash`, `gemini-3-flash`, …);
  an unknown id (e.g. `qwen2.5:7b`) returns HTTP 404 → the action notifies `Erro: HTTP 404`.
  Set a valid `model-name` in prefs.
- **Slow responses:** latency is variable (**2–27s** observed). Wait — streaming (S2 with
  `stream=true`) shows progress live.

## Clipboard appears empty after S1

- On Wayland `St.Clipboard` only sees text the shell owns. Copy again just before pressing
  the shortcut.
- If the clipboard is genuinely empty, S1 notifies "Clipboard vazio".

## S3 seems to stop mid-way

By design S3 consumes **one** FIFO item per keypress (to allow manual intermediate paste).
Press `<Super>v` repeatedly. When the FIFO is empty it notifies "resultado final no
clipboard". Inspect `fifo.json` to see the remaining items.

## "TextDecoder does not implement the 'stream' option"

This is a **known GJS limitation**, already handled: the client uses the pure
`createUtf8Decoder()` in `lib/sse.js` instead of `TextDecoder({stream:true})`. If you see
this, you are on an older build — reinstall.

## Streaming finishes but the promise seems to hang (in a test script)

Not a module bug: a **top-level `await import(...)`** in a `gjs -m` script breaks GJS
promise-job draining while a `GLib.MainLoop` runs. Use a **static import** (see
`docs/adr/0002` and `docs/DEVELOPMENT.md`). In the real shell the loop always iterates, so
`onDelta`/`onFinish` and the awaited promise behave normally.

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
