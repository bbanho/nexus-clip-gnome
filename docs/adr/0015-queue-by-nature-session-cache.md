# 0015 — Queue by nature (opt-out) and a session cache

Status: Accepted.

## Context

The user reads stacks of prompts while operating `Super+C` like an enriched
`Ctrl+C`: copy several times, let inference proceed asynchronously, and treat
the FIFO as the natural behavior rather than an optional extra. Writing back
to the desktop clipboard is the least critical part; reading and preserving
the `(system clipboard, result)` pair is the critical one. Repeated prompts
should produce new abstractions without paying for the same inference again,
and the cache should be ephemeral and protected by simple rotating keypairs in
the GNOME session keyring.

Two constraints shape a first implementable slice:

- Inference must be serialized: a second collection while the first is still
  running must be enqueued, not rejected with "Ocupado".
- The cache must never hold raw text inside the shell; only digests and the
  output needed for a cache hit.

## Decision

1. **No fixed prompt in the initial C/V shortcuts.** `push-process` and
   `process` keep the prompt editor (so a power user can pin one), but the
   defaults ship with an empty prompt. At runtime they borrow the oldest FIFO
   prompt and consume it on success (ADR-0008's FIFO). If the FIFO is empty,
   `C` degrades to an import and `V` asks for a prompt — no silent inference.
2. **Queue by nature, opt-out.** New `queue-auto` (default `true`) setting:
   `push-process`, `process`, `run-next` and `drain` are submitted to an
   in-process serial FIFO (`pipeline.js`) instead of blocking the global
   `busy` flag. Turning it off restores the old "busy" behavior. The persistent
   FIFO (`fifo.json`) is the prompt queue; the serial queue is the execution
   queue — they are distinct objects and the badge reports both (`FILA n ·
   PIPELINE m`).
3. **Session cache.** `pipeline.js` keeps an LRU of `(fingerprint(input,
   prompt), output)` with a session token. A repeated pair is served without a
   network call and marked `cache` in status/history. It is in-memory only: it
   dies with the shell process (the user's "until reboot" lifetime) and never
   stores raw input/prompt. A future version can rotate the session token via
   the GNOME keyring without changing call sites.
4. **Output boundary stays explicit.** No inference writes the desktop
   clipboard; `X` (`copy-top`) remains the only export gesture. The pair
   `(input, result)` lives on the Nexus stack with `parentId`, which is the
   "preserved pair" the operator needs.
5. **Later (deferred).** Keyring-backed keypairs, RPN operator mode, linter/AST
   and Python experiments are deliberately out of this slice. They need a
   stable execution model first.

## Consequences

- The muscle memory C/V/X is preserved while C behaves like a layered
  `Ctrl+C`: repeated copies accumulate on the stack and their prompts in the
  FIFO; processing follows in order.
- A cache hit is visible (status chip, history `cached: true`, `cache N/M` in
  `status`) so the user can tell an abstraction came from the cache.
- Enabling `queue-auto` changes the meaning of a rapid second press from an
  error to queued work; the status chip says "Na fila · … · N pendente(s)".
- `validateShortcuts` no longer errors on an empty prompt for C/V — only
  `enqueue` requires one. Users who relied on an implicit fixed prompt should
  set it explicitly in Preferences.
- The serial queue lives in the shell process; a GNOME Shell restart clears
  pending jobs as well as the cache. Persistent prompts remain in `fifo.json`
  and can be re-run after restart.
