# ADR-0004: Shortcut semantics S1 / S2 / S3

## Status
Accepted

## Context
The workflow is clipboard-centric and keyboard-first. The user needs to (S1) transform what
is copied, (S2) pick a prompt and see the answer immediately, then queue prompts, and (S3)
run queued prompts step by step with manual pastes in between. Auto-draining the queue
would rob the user of intermediate control.

## Decision
Three global shortcuts with distinct, non-overlapping semantics:

| Signal | Default | Behavior |
|--------|---------|----------|
| S1 | `<Super>c` | Read clipboard → push onto LIFO stack → run active preset → write result to clipboard. |
| S2 | `<Super>x` | Open the GTK chooser with the live response; the activated prompt is **enqueued** onto the FIFO. |
| S3 | `<Super>v` | Consume **exactly one** FIFO item, run it against the current item, write the result to the clipboard, and notify the next step. |

Defaults are remappable in prefs. Known collision risk: `<Super>v` vs. some terminal
paste bindings — change it in prefs if needed.

## Consequences
- Deterministic, one-action-per-key model; easy to reason about and to test.
- S3 requires repeated presses by design — intentional.
- Keybinding registration uses `IGNORE_AUTOREPEAT` in `NORMAL` mode so held keys do not
  fire repeatedly.
