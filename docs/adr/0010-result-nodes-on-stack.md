# ADR-0010: Inference results are nodes on the Nexus stack

## Status
Accepted.

## Context
In the first POC, S1/S2/S3 wrote each result to the system clipboard and appended a
history entry. That made the result available for an immediate `Ctrl+V`, but it also:

- overwrote whatever the user had copied;
- created a feedback loop when the result was re-read as the next input;
- made chaining implicit and lossy (the stack did not record what produced what);
- coupled the inference path to the system clipboard, contradicting ADR-0008.

## Decision
1. **Every successful inference pushes a new node** onto the Nexus LIFO stack:
   ```json
   { "id": "res_...", "parentId": "item_...", "text": "...", "ts": 0,
     "kind": "result", "prompt": "..." }
   ```
2. **`kind: "result"` nodes are never de-duplicated.** A model result is always a new
   node, even if its text equals the current top.
3. **`parentId` points at the processed item.** Chaining is explicit: processing a result
   creates a child of that result.
4. **No automatic clipboard write.** The result stays on the stack. Export is the explicit
   `copy-top` action or the HUD `Enter`.
5. **History is an append-only mirror.** `history.jsonl` records each result with
   `parentId`, prompt, mode, label, and optional step, preparing a future tree UI.
6. **Failure leaves state intact.** `run-next` and `drain` consume a FIFO item only after a
   successful inference; a failed step keeps the prompt queued and preserves completed
   steps.

## Consequences
- The Nexus clipboard is a real, inspectable history: the user can undo (`pop`), revisit,
  re-process, or export any node.
- Re-processing the same text is intentional and always creates a new result node; the
  stack can grow, bounded by `maxItems` (default 200).
- The user must take an explicit export step; documented in README and prefs.
- The state shape already supports a branching tree (`id`/`parentId`), so a future UI does
  not require a schema break.
- Tests can assert the invariant in pure code (`pushResult` never dedupes, parent links
  are preserved).
