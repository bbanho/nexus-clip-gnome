# 0013 — Audited text intake, explicit mirroring, and leak-free provenance

Status: Accepted

## Context

The Super command bar (ADR-0012) made the existing actions reachable with one key after
`Super+;`, but the requested flow still lacked four things:

1. A way to bring text into Nexus **only after an audit**, with one unmistakable magic number
   and no chance of importing an executable/binary payload by accident.
2. An **opt-in mirror**: copy a selection into Nexus *and* back to the system clipboard when
   the user explicitly wants both, without making mirroring the default for inference.
3. A **stack overview** notification that reports depths and the next step without exposing
   content in a system notification.
4. A **provenance record** binding content + prompt + operation into an addressable identity
   and a characteristic vector, while obeying `proibido_vibe_origem->destino`: no prompt or
   content payload may cross the KV/harness boundary.

The phrase "homomorphic invariants" is a research direction (Laplace / laplacian /
hamiltonian / non-Euclidean persistence), not an implemented cryptographic scheme. This ADR
deliberately implements deterministic provenance only and does not claim homomorphism.

## Decision

1. **Single magic number, pure gate** (`text-gate.js`, `a` mnemonic): `NEXUS-TEXT-1\n` is the
   only accepted prefix. The gate rejects empty payloads, > 64 KiB, NUL/DEL binary markers,
   executable prefixes (`#!`, ELF, MZ, PHP open tag) and other control characters. The
   payload after the prefix is what enters the stack. Existing `V` (push-process) stays
   unmarked so the previous workflow is not broken.
2. **Explicit mirror** (`m` mnemonic): reads the system clipboard, pushes to the Nexus stack
   and writes the same text back to the system clipboard. This is the only new action that
   exports to the system; `copy-top` and the HUD `Enter` remain the other two explicit
   exports (CP-03). CoW stays ephemeral until this or another explicit action persists it.
3. **Quiet overview** (`s` mnemonic): a status chip with `pilha n · fila m · histórico k ·
   próximo: …`, containing counts and a short label preview, never full content.
4. **Provenance only as safe projections** (`provenance.js`, `u` mnemonic): a deterministic
   128-bit UUID binds the content fingerprint, the prompt fingerprint and the operation
   fingerprint. The characteristic vector is counters only (chars, lines, words, headings,
   fences, digitRatio). `kvProjection()` returns exactly `{ uuid, hash, counts }`;
   `assertNoVibeFlow()` throws on any other field. A provenance-only `history.jsonl` entry
   carries the local origin item id plus UUID/hash/vector — never source text.
5. **Scope**: four new mnemonics (`A/M/S/U`) join `V/C/X/Q/N/D/Z/H`; `1`–`5` remain templates.
   No new global accelerator is grabbed. No GTK, no new service, no DB/KV write from the
   extension.

## Consequences

- Text-only imports are explicit and auditable; a pasted shell script is rejected before any
  inference. The 64 KiB ceiling also prevents the clipboard from becoming a bulk
  exfiltration path.
- Users who want a two-way copy must press `m` deliberately. Nothing in inference, enqueue,
  status or provenance touches the desktop clipboard.
- KV/signal/memory consumers receive only UUIDs, hashes and counters. Source text, prompts
  and local item ids stay in `stack.json` / `history.jsonl` on the user's machine.
- Determinism is cosmetic-edit tolerant (whitespace collapsed) but is **not** a signature or
  a homomorphic commitment. Do not use it for authenticity; use it for correlation only.
- All pure logic is covered by `node --test` (`text-gate`, `provenance`, `history-core`,
  `command-keys`, `shell-boundary`). Shell-visible widget behavior still needs the manual E2E
  in `EVIDENCE.md` §13.
