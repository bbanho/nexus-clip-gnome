# EVIDENCE — End-to-end validation (GNOME 50.3 / Wayland)

> Status: automated checks green; the interactive run below must be executed in a live
> GNOME Shell session and the outputs pasted here.

## 0. Automated checks

```bash
cd /var/home/bruno/_dev/repo/nexus-clip-gnome
make check
make smoke        # requires the gateway on :8010
```

`make check` runs the schema compile, `node --test`, `node --check` on every module, and
the GJS Gio-store smoke test. `make smoke` exercises `chat()` and `stream()` live.

### Recorded (2026-10-26)

```
make check:
  node --test: 53 pass / 0 fail
  node --check: OK for extension.js, prefs.js, lib/*.js
  gjs -m tests/gjs-store-smoke.mjs: GJS store adapter OK
  glib-compile-schemas --strict: OK

make smoke:
  chat   => "ok"
  stream => "ok" acc="ok"
```

### Recorded (2026-11-23)

```
make check:
  node --test: 87 pass / 0 fail
  node --check: OK for extension.js, prefs.js, lib/*.js
  gjs -m tests/gjs-store-smoke.mjs: GJS store adapter OK
  glib-compile-schemas --strict: OK

make smoke:
  chat   => "ok"
  stream => "ok" acc="ok"

gnome-extensions info nexus-clip@bbanho: State ACTIVE, error '' (first reload)
```

> Note: on Wayland, after a *second* reinstall in the same session the running shell keeps
> the previously loaded build until logout/login (`State: INACTIVE`). This is expected shell
> behavior, not an extension error.

## 1. Install + enable

```bash
cd /var/home/bruno/_dev/repo/nexus-clip-gnome
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

Expected: the **Atalhos e prompts** group lists nine entries — five bound
(`<Alt><Super>v`, `<Alt><Super>c`, `<Alt><Super>x`, `<Alt><Super>h`, `<Alt><Super>z`) and four
unbound templates (`import`, `enqueue`, `run-next`, `drain`). `shortcuts` is a JSON array;
`hotkey-slot-0..4` mirror the five bound accelerators.

```
<PASTE OUTPUT HERE>
```

## 3. Import + process (no system-clipboard write-back)

1. Copy `este texto tem ums erro de portugues`.
2. Press `<Alt><Super>v`.
3. Paste into a scratch editor (should still be the **original** text, not the result).

```bash
cat ~/.local/share/nexus-clip-gnome/stack.json
tail -1 ~/.local/share/nexus-clip-gnome/history.jsonl
```

Expected: a new `kind: "input"` node followed by a `kind: "result"` node whose `parentId`
is the input's id; the system clipboard still holds the original text; the notification
mentions "topo do Nexus".

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

1. Press **`Alt` + `Super` + `X`** (**Copiar topo do Nexus para o sistema**, bound by default).
2. Paste into the scratch editor.

Expected: the pasted text is the Nexus top. No inference path wrote the clipboard before
this explicit export.

Alternative: press **`Alt` + `Super` + `H`** to open the visual history, select a row, press
`Enter`.

```
<PASTE OUTPUT HERE>
```

## 6. FIFO: enqueue, run-next, drain

1. Bind/trigger **Enfileirar prompt** for two different prompts.
2. Trigger **Rodar próximo da fila** once; check `fifo.json`.
3. Trigger **Rodar fila inteira**; check `fifo.json` and `stack.json`.

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

## 9. Visual history (search / reuse / delete)

1. Press `<Alt><Super>h` to open the panel on the **Histórico** tab.
2. Type in the search box (`/` focuses it); confirm the list filters.
3. Press `1`/`2`/`3`/`4` (or `Tab`) to switch Pilha / Histórico / Fila / Prompts.
4. Select a stack item, press `Ctrl+Enter` → it is pushed as a new Nexus input.
5. Select a stack item, press `Del` → it is removed from `stack.json`.
6. Select any item, press `Enter` → it is copied to the system clipboard (explicit export).
7. Press `Esc` to close.

```bash
cat ~/.local/share/nexus-clip-gnome/stack.json
```

Expected: navigation and search work without freezing the shell; `Ctrl+Enter` adds an
`input` node; `Del` removes exactly one node; only `Enter` writes the system clipboard.

```
<PASTE OUTPUT HERE>
```

## 10. Prompt templates

1. In prefs, expand a shortcut and pick a **Modelo de prompt** → the prompt editor fills.
2. In the HUD **Prompts** tab, select a template and press `Enter` → it is enqueued.

```bash
cat ~/.local/share/nexus-clip-gnome/fifo.json
```

Expected: the chosen template text appears in the shortcut prompt / FIFO. No inference runs
from merely picking a template.

```
<PASTE OUTPUT HERE>
```

## 11. Quiet feedback (status chip + notification policy)

1. With defaults (`notify-level=errors`, `status-chip=true`), run `<Alt><Super>c`.
   Expect a transient status chip (`✓ …`) and **no** system notification.
2. Set `notify-level` to `all`; run again → a system notification fires.
3. Set `notify-level` to `silent`; run again → no notification (chip still shows).
4. Force an error (stop the gateway) and run `<Alt><Super>c` → an error notification fires
   under the default `errors` policy.

```bash
SD=~/.local/share/gnome-shell/extensions/nexus-clip@bbanho/schemas
gsettings --schemadir "$SD" set org.gnome.shell.extensions.nexus-clip notify-level all
```

Expected: the chip always names the operation; system notifications follow the policy; the
history log records completed inferences regardless of the policy.

```
<PASTE OUTPUT HERE>
```

## 12. Super leader + visible FIFO (ADR-0012)

> **Reload caveat:** GNOME Shell 51 caches extension JS/metadata for the session. After
> `make install`, `gnome-extensions disable/enable` can leave the old code loaded (the
> extension still reports the previous version and `hotkey-command` stays `[]`). Restart the
> shell / log out and back in before running this section. Verify with:
>
> ```bash
> SD=~/.local/share/gnome-shell/extensions/nexus-clip@bbanho/schemas
> gsettings --schemadir "$SD" get org.gnome.shell.extensions.nexus-clip hotkey-command
> # expected: ['<Super>semicolon']
> ```

1. Press `Super+;`. Expect the **NEXUS · SUPER COMANDOS** St panel with
   `PILHA n · FILA m` and the mnemonic list. Plain `Super+C` / `Super+V` in an app must keep
   their normal copy/paste behavior (only one global chord is grabbed).
2. With the command bar open, press `1` → `NEXUS · FILA 1 · PRÓX: …` badge appears at the top.
   Repeat with `2`, `3` → badge shows `FILA 3`. `Esc` closes without side effects.
3. With a non-empty Nexus stack, press `Super+;` then `n`. Expect exactly one inference step,
   a `Passo ok · fila 2 · próximo: …` status chip, and badge `FILA 2`.
4. Press `Super+;` then `d`. Expect the FIFO depth decreasing in the badge after each step
   (the streaming panel, when enabled, labels steps `Fila 1/2 … 2/2`), a final
   `Fila concluída` chip, and the badge disappearing when the FIFO empties.
5. Press `Super+;` then `x` → Nexus top copied to the system clipboard (explicit export only).
   Inference/enqueue paths must never change the system clipboard (CP-03).
6. In Preferences, change *Tecla de comandos Super* and confirm the new chord opens the bar;
   toggle *Distintivo da fila* off → badge hides on the next refresh.

```
<PASTE OUTPUT HERE>
```

## 13. Audited text, mirror, overview, and provenance (ADR-0013)

Run after a shell restart (see the reload caveat in §12) with a non-empty Nexus stack.

1. Copy plain text **without** the marker, press `Super+;` then `a`. Expect
   `Importação auditada recusada: sem o magic number NEXUS-TEXT-1` and an unchanged stack.
2. Copy `NEXUS-TEXT-1` on its own line followed by ordinary text, press `Super+;` then `a`.
   Expect `Importado (auditado) · pilha n+1`, the marker stripped from the top item, and the
   **desktop clipboard unchanged** (paste elsewhere to confirm).
3. Copy a line starting with `#!/bin/sh`, press `Super+;` then `a`. Expect refusal with
   `marker executável recusado`. Repeat with a >64 KiB payload → `acima do limite de 64 KiB`.
4. Copy ordinary text, press `Super+;` then `m`. Expect the text on both the Nexus stack and
   the desktop clipboard (paste elsewhere to confirm). This is the only new export path.
5. With prompts queued, press `Super+;` then `s`. Expect a chip such as
   `pilha 4 · fila 2 · histórico 9 · próximo: Resumir …` and **no** system notification when
   `notify-level=errors`.
6. Press `Super+;` then `u`. Expect `Proveniência gravada · <uuid> · N chars`. Open the HUD
   (`h`, Histórico tab) and confirm a `provenance` row whose subtitle is the UUID. Confirm
   `history.jsonl` has a `mode:"provenance"` record with `uuid`/`hash`/`vector` and **no**
   `text` or `prompt` field.
7. Confirm inference/enqueue paths still leave the desktop clipboard untouched (CP-02/CP-03).

```
<PASTE OUTPUT HERE>
```
