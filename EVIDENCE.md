# EVIDENCE — End-to-end validation (GNOME 50.3 / Wayland)

> Status: automated checks green; the interactive run below must be executed in a live
> GNOME Shell session and the outputs pasted here.

## 0. Automated checks

```bash
cd /var/home/bruno/repos/nexus-clip-gnome
make check
make smoke        # requires the gateway on :8010
```

`make check` runs the schema compile, `node --test`, `node --check` on every module, and
the GJS Gio-store smoke test. `make smoke` exercises `chat()` and `stream()` live.

### Recorded (2026-10-26)

```
make check:
  node --test: 68 pass / 0 fail
  node --check: OK for extension.js, prefs.js, lib/*.js
  gjs -m tests/gjs-store-smoke.mjs: GJS store adapter OK
  glib-compile-schemas --strict: OK

make smoke:
  chat   => "ok"
  stream => "ok" acc="ok"
```

## 1. Install + enable

```bash
cd /var/home/bruno/repos/nexus-clip-gnome
make install
# Wayland: log out and back in before enabling
make enable
gnome-extensions info nexus-clip@bbanho
ls -R ~/.local/share/gnome-shell/extensions/nexus-clip@bbanho
```

Expected: `State: ENABLED`; `lib/` present in the installed directory.

```
<PASTE OUTPUT HERE>
```

## 2. Configure

```bash
gnome-extensions prefs nexus-clip@bbanho
gsettings --schemadir extension/schemas list-recursively org.gnome.shell.extensions.nexus-clip
```

Expected: the **Shortcuts and prompts** group (UI: `Atalhos e prompts`) lists three entries — two bound
(`<Alt><Super>v`, `<Alt><Super>c`) and one unbound export template. `shortcuts` is a JSON
array; `hotkey-slot-0`/`-1` mirror the two bound accelerators.

```
<PASTE OUTPUT HERE>
```

## 3. Import + process (no system-clipboard write-back)

1. Copy `This sentense has a grammar error.`
2. Press `<Alt><Super>v`.
3. Paste into a scratch editor (should still be the **original** text, not the result).

```bash
cat ~/.local/share/nexus-clip-gnome/stack.json
tail -1 ~/.local/share/nexus-clip-gnome/history.jsonl
```

Expected: a new `kind: "input"` node followed by a `kind: "result"` node whose `parentId`
is the input's id; the system clipboard still holds the original text; the notification
indicates that the result is now at the top of the Nexus stack.

```
<PASTE OUTPUT HERE>
```

## 4. Process the Nexus top (chaining)

1. Press `<Alt><Super>c`.
2. Press it once more.

```bash
python3 -c 'import json;d=json.load(open("'"$HOME"'/.local/share/nexus-clip-gnome/stack.json"));print([(i["kind"],i["id"][-8:],(i.get("parentId") or "")[-8:]) for i in d["items"][:4]])'
```

Expected: each press pushes a new `result` node; the newest result's `parentId` points at
the previous top. The stack grows by one per press.

```
<PASTE OUTPUT HERE>
```

## 5. Export (explicit only)

1. In Preferences, assign a key to the **Copy Nexus top to system** template (UI:
   `Copiar topo do Nexus para o sistema`).
2. Press it.
3. Paste into the scratch editor.

Expected: the pasted text is the Nexus top. No inference path wrote the clipboard before
this explicit export.

Alternative: bind **Show stack and queue** (UI: `Mostrar pilha e fila`), open the HUD,
select a row, and press `Enter`.

```
<PASTE OUTPUT HERE>
```

## 6. FIFO: enqueue, run-next, drain

1. Bind/trigger **Queue prompt** (UI: `Enfileirar prompt`) for two different prompts.
2. Trigger **Run next in queue** (UI: `Rodar próximo da fila`) once; check `fifo.json`.
3. Trigger **Run entire queue** (UI: `Rodar fila inteira`); check `fifo.json` and `stack.json`.

```bash
cat ~/.local/share/nexus-clip-gnome/fifo.json
cat ~/.local/share/nexus-clip-gnome/stack.json
```

Expected: `run-next` consumes exactly one prompt per activation and only after success;
`drain` empties the queue, chaining each result into the next input.

```
<PASTE OUTPUT HERE>
```

## 7. Freeze regression (the old Super+X bug)

1. Confirm the extension no longer loads GTK:
   ```bash
   grep -rn "gi://Gtk\|gi://Adw\|selector" extension/extension.js extension/lib/
   # expect no matches
   ```
2. Press the old bindings `<Super>x` and `<Super>c` (not bound by this extension).
3. Press `<Alt><Super>v`, `<Alt><Super>c`, and open/close the HUD repeatedly.

Expected: GNOME Shell remains responsive; no freeze; `journalctl` shows no GTK/selector
errors from the extension.

```
<PASTE OUTPUT HERE>
```

## 8. Shell log (no exceptions)

```bash
journalctl --user -b -o cat | grep -iE 'nexus-clip|JS ERROR|Gjs-CRITICAL' | tail -40
```

Expected: no `JS ERROR` / `Gjs-CRITICAL` from the extension.

```
<PASTE OUTPUT HERE>
```
