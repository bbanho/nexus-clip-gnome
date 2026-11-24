# 0011 — Visual history, prompt templates, and quiet feedback

Status: Accepted

## Context

The stack viewer was a minimal list with no search and no access to the inference log.
Every action fired a system notification, which became noisy, yet the user still needed to
know *which* operation ran. Prompts had to be typed from scratch, and the pre-enabled
shortcut set had drifted into an inconsistent state (labels not matching modes, several
`copy-top` entries). The reference UX is GNOME's *Clipboard History* (extension 4839): a
searchable, newest-first panel with keyboard navigation.

## Decision

1. **Visual history** (`hud.js`): replace the simple viewer with a searchable, tabbed panel
   — **Pilha / Histórico / Fila / Prompts** — built only with St/Clutter (ADR-0009). The
   append-only `history.jsonl` is read newest-first and sanitized (`history-core.js`),
   clamped to `history-limit`. Export to the system clipboard stays explicit (`Enter` or the
   *Copiar* button), preserving the CP-03 boundary; `Ctrl+Enter` reuses an item as a Nexus
   input, `Del` removes a stack/queue item (`store-core.removeNode`).
2. **Prompt templates** (`prompts.js`): a pure, built-in library. Preferences offers a
   one-click *Modelo de prompt* picker per shortcut; the HUD *Prompts* tab enqueues a
   template into the FIFO.
3. **Quiet feedback** (`notify-policy.js`): a `notify-level` setting (`errors` default,
   `all`, `silent`). Routine successes go to a transient, non-focusable **status chip**
   (`createStatusChip`) and the history log; system notifications fire only per policy. The
   chip never touches the clipboard (CP-15).
4. **Reviewed defaults**: five bound core actions — `V` import+process, `C` process top,
   `X` copy-top, `H` history, `Z` undo — plus `import`/`enqueue`/`run-next`/`drain` as unbound
   templates. New `import` (clipboard → Nexus, no inference) and `history` modes. A
   *Restaurar padrões* button in Preferences re-applies the clean set.

## Consequences

- The user can find and reuse any past item without notification spam, and always sees the
  last operation on the status chip.
- The clipboard boundary is unchanged: inference and import never write the system
  clipboard; only `copy-top` and the HUD export do. New static tests (CP-15/16/17) guard this.
- Existing users keep their `shortcuts` list (migration only runs when empty); the reviewed
  defaults apply to fresh installs or via *Restaurar padrões*.
- The HUD is larger but still GTK-free; runtime widget behavior requires manual/E2E
  validation in a live shell (St/Clutter typelibs are not available to standalone GJS).