# ADR-0005: State model — LIFO + FIFO + history, tree-ready

## Status
Accepted

## Context
Inputs (what the user copied) and prompts (what the user chose) have different natural
orders: inputs behave like a **stack** (most-recent-first), while queued prompts behave like
a **queue** (first-chosen-first-run). The roadmap also anticipates a branching "tree" of
prompts. State must live outside the repo, without credentials, and be forward-migratable.

## Decision
Persist three artifacts under `~/.local/share/nexus-clip-gnome/` (override with
`NEXUS_CLIP_DATA_DIR`), managed by the pure `lib/store.js`:

- `stack.json` — `{ schemaVersion: 1, items: [ {id, parentId, text, ts} ] }`; `push` =
  `unshift` (newest first); optional `maxItems` and `dedupe`.
- `fifo.json` — `{ schemaVersion: 1, items: [ {id, prompt, ts} ] }`; `enqueue` = append,
  `dequeue` = shift.
- `history.jsonl` — append-only inference log, one JSON object per line.

Store APIs are **directory-first** (`saveStack(dir, state)`, `loadStack(dir)`,
`appendHistory(dir, node)`); pass `null` for the dir to use the default. Every node carries
`id` + `parentId`, so a branching tree can be added later **without a schema break**.

## Consequences
- Stack/queue semantics are explicit and unit-tested in Node.
- Tree feature is a non-breaking future addition via `parentId` + `schemaVersion`.
- Credentials never touch disk in the repo; only dconf holds the API key.
