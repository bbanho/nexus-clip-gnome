# EVIDENCE — End-to-end validation (GNOME 50.3 / Wayland)

> Status: **PENDING MANUAL RUN**. The automated parts below are already green; the
> interactive S1→S2→S3 run must be executed in a live GNOME Shell session and the
> command outputs pasted here.

## 0. Automated checks (run, capture output)

```bash
cd /var/home/bruno/repos/nexus-clip-gnome
node --check extension/extension.js && for f in extension/lib/*.js; do node --check "$f"; done && echo "syntax OK"
node --test
glib-compile-schemas extension/schemas && echo "schemas OK"
curl -s -o /dev/null -w 'gateway /health -> %{http_code}\n' http://localhost:8010/health
```

Result:

```
<PASTE OUTPUT HERE>
```

## 1. Install + enable

```bash
cd /var/home/bruno/repos/nexus-clip-gnome
make install
make enable                     # may require a shell reload on Wayland first
gnome-extensions info nexus-clip@bbanho
ls -R ~/.local/share/gnome-shell/extensions/nexus-clip@bbanho
```

Result (expect `State: ENABLED` and `lib/` present in the installed dir):

```
<PASTE OUTPUT HERE>
```

## 2. Configure

```bash
gnome-extensions prefs nexus-clip@bbanho     # set endpoint/model/presets; ensure stream=false first
gsettings --schemadir extension/schemas list-recursively org.gnome.shell.extensions.nexus-clip
```

Result:

```
<PASTE OUTPUT HERE>
```

## 3. S1 — copy / stack / infer

1. Copy some text (e.g. `este texto tem ums erro de portugues`).
2. Press `<Super>c`.

```bash
cat ~/.local/share/nexus-clip-gnome/stack.json
tail -1 ~/.local/share/nexus-clip-gnome/history.jsonl
```

Expected: an item appears in `stack.json`; `history.jsonl` gains a line; the clipboard
now holds the processed text. Result:

```
<PASTE OUTPUT HERE>
```

## 4. S2 — live response + choose prompt → FIFO

1. Press `<Super>x`.
2. The GTK window shows the response (live text if `stream=true`).
3. Pick a preset in the list.

```bash
cat ~/.local/share/nexus-clip-gnome/fifo.json
```

Expected: the current result is on the clipboard; `fifo.json` contains the chosen prompt.
Result:

```
<PASTE OUTPUT HERE>
```

## 5. S3 — stepwise loop with intermediate paste

With several prompts in the FIFO, press `<Super>v>` once per step.

```bash
cat ~/.local/share/nexus-clip-gnome/fifo.json     # shrinks by exactly ONE per press
```

Expected: each press consumes one prompt, writes the result to the clipboard (paste it
somewhere in between), reports the next prompt; when empty it reports the final result and
`fifo.json` becomes `[]`. Result:

```
<PASTE OUTPUT HERE>
```

## 6. Shell log (no exceptions)

```bash
journalctl --user -b -o cat | grep -iE 'nexus-clip|JS ERROR|Gjs-CRITICAL' | tail -40
```

Result (expect no `JS ERROR` / `Gjs-CRITICAL` from the extension):

```
<PASTE OUTPUT HERE>
```
