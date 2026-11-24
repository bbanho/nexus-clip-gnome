# Critical Points & Test Map

Invariants that protect the extension from the two failures that matter most:
**freezing GNOME Shell** and **corrupting the user's clipboard/state**. Each point has an
automated test where possible; UI-only behavior is marked as manual/E2E.

| ID | Critical point | Why it matters | Test |
|----|----------------|----------------|------|
| CP-01 | Shell-process modules never import/instantiate GTK, Adw, or Node builtins | A `Gtk.Window` inside the compositor deadlocks Wayland (the old Super+X freeze) | `tests/shell-boundary.test.js` + `rules/no-gtk-in-shell.yml`, `rules/no-node-builtin-in-gjs.yml` |
| CP-02 | Inference paths never write the system clipboard | Nexus must not clobber the user's clipboard or create feedback loops | `tests/shell-boundary.test.js` (static) + E2E |
| CP-03 | Only explicit export paths write the system clipboard | `copy-top`, the opt-in `mirror-import`, and the HUD `Enter`/`Copiar` are the only exports | `tests/shell-boundary.test.js` + `rules/clipboard-write-outside-boundary.yml` |
| CP-04 | Every registered accelerator is structurally valid | An accel with no key (`<Alt><Super>`) is silently unusable or a conflict | `tests/shortcuts.test.js` |
| CP-05 | Duplicate/empty accelerators never reach `addKeybinding` | Duplicate grabs make behavior order-dependent | `tests/shortcuts.test.js` |
| CP-06 | Result nodes are new nodes with `kind=result` and `parentId` | Chaining/undo depend on it; results must never be deduplicated | `tests/store-core.test.js` |
| CP-07 | Malformed persisted state cannot crash the HUD | A hand-edited/corrupt `stack.json` must degrade to a safe subset | `tests/store-core.test.js` |
| CP-08 | The schema exposes exactly 12 slots and the new keys; legacy hotkeys are gone | `Main.wm.addKeybinding` needs a schema key; stale keys cause silent failures | `tests/schema.test.js` |
| CP-09 | Metadata stays compatible with GNOME 45–51 and version 2 | Prevents installing a build the shell rejects | `tests/schema.test.js` |
| CP-10 | Legacy `presets` migration produces the two defaults + unbound extras | Upgrade path must not lose prompts or bind unknown keys | `tests/config.test.js`, `tests/shortcuts.test.js` |
| CP-11 | `[]` shortcuts means "user disabled everything", not "migrate again" | Re-migrating would silently re-enable deleted shortcuts | `tests/config.test.js` |
| CP-12 | FIFO consumes a prompt only after a successful inference | A failed step must stay retryable | `actions.js` + E2E (`EVIDENCE.md` §6) |
| CP-13 | Clipboard read has a timeout | A stuck Wayland read must not leave the action permanently busy | `actions.js` + manual |
| CP-14 | Shortcut capture requires a modifier and accepts arbitrary keys | Prefs must allow free capture without grabbing bare letters | `prefs.js` + manual |
| CP-15 | The status chip and live panel never write the system clipboard | Quiet feedback must not become a hidden export path | `tests/shell-boundary.test.js` (static) |
| CP-16 | Malformed `history.jsonl` lines cannot crash the visual history | A hand-edited/corrupt log must degrade to a safe subset | `tests/history-core.test.js`, `tests/store-node.test.js` |
| CP-17 | `import` reads the clipboard but never writes it or calls the model | Import-without-processing must stay inside the Nexus boundary | `tests/shell-boundary.test.js` (static) |
| CP-18 | Audited import requires one magic number and rejects binary/executable markers | Text-only intake must never auto-execute an imported payload | `tests/text-gate.test.js` |
| CP-19 | Provenance crossing the KV/harness boundary is UUID + hash + counters only | `proibido_vibe_origem->destino`: no prompt/content payload may leak to the harness | `tests/provenance.test.js`, `tests/history-core.test.js` |
| CP-20 | The opt-in mirror is the only new system export; provenance/status never export | New commands must not silently become clipboard writers | `tests/shell-boundary.test.js` |

## Enforcement

- `make check` runs all unit/static tests, schema compilation, `node --check`, the GJS
  store smoke test, and (when ast-grep is installed) `ast-grep scan`.
- `make structural` runs the AST-level invariant gate alone (`rules/`, `sgconfig.yml`).
  It structurally enforces CP-01/CP-03 and the pure/impure split
  (`rules/no-gi-in-pure-modules.yml`) without needing a live shell.
- `.githooks/pre-commit` and `.githooks/pre-push` run `make check` locally (enable once
  with `make hooks`, which sets `core.hooksPath=.githooks`).
- `.github/workflows/ci.yml` runs the same `make check` on every pull request; the `check`
  job must be green before merge. Mark it as a required status check in the `master`
  branch protection rules to make the gate mandatory.
- `make smoke` is the live gateway test and is intentionally not part of CI (it needs the
  local Nexus Gateway).
