# Constraints

Last reviewed: 2026-11-23 by the agent implementing ADR-0013.

Read this before writing code. Do not weaken it to make a change pass.

## Floor (always enforced, no setup required)

- No new suppression comments: `@ts-ignore`, `eslint-disable`, `# noqa`,
  `# type: ignore`, `istanbul ignore`, `Stryker`, `nosemgrep`, `gitleaks:allow`.
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`,
  placeholder functions.
- No skipped or deleted tests without a reason in the commit message.
- No secrets in source.
- This file does not get weakened to make a change pass.

## Non-negotiable boundaries (the project's "why")

These are the invariants the user called out explicitly. They are checked by commands,
not by good intentions:

| ID | Rule | Checked by | Rationale |
|----|------|-----------|-----------|
| B-01 | Inference and import paths never write the system clipboard | `node --test tests/shell-boundary.test.js`, `ast-grep scan` | Prevents clipboard clobbering and feedback loops on Wayland. |
| B-02 | Only `copy-top`, `mirror-import` (opt-in) and the HUD `Enter`/`Copiar` export to the system clipboard | `node --test tests/shell-boundary.test.js`, `ast-grep scan` | Every export must be a user-visible, explicit action. |
| B-03 | Nothing but UUIDs, hashes and numeric counters crosses the KV/harness boundary | `node --test tests/provenance.test.js`, `ast-grep scan` | `proibido_vibe_origem->destino`: prompts and content payloads must not leak into the main harness. |
| B-04 | Audited import requires the single magic number `NEXUS-TEXT-1\n`; binary/executable markers are rejected | `node --test tests/text-gate.test.js` | Text-only intake with no auto-executable leaks. |
| B-05 | CoW is ephemeral until an explicit action persists it; source items are never mutated | `node --test tests/store-core.test.js`, `tests/shell-boundary.test.js` | Capture is a copy; import/provenance capture is the opt-in. |
| B-06 | Shell modules stay St/Clutter-only — no GTK, Adw or Node builtins | `node --test tests/shell-boundary.test.js`, `ast-grep scan` | GTK in the compositor froze GNOME Shell in the past. |
| B-07 | Compatible with GNOME Shell 50.6 / 51.1 on Wayland; UI strings in Portuguese | `node --test tests/schema.test.js`, manual E2E | The extension must remain installable and active on the user's shells. |

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at | Why this number |
|-----------|------|-----------|---------|-----------------|
| Tests | Zero failures; every new behavior has a test | `make check` (`node --test`) | every edit, CI | A red suite is a broken invariant, not a notification. |
| Syntax | Zero parse errors in shell/prefs/lib JS | `make check` (`node --check`) | every edit, CI | A syntax error inside the shell disables the extension. |
| Schema | Zero errors/warnings from the strict compiler | `make check` (`glib-compile-schemas --strict`) | every edit, CI | External tool (GNOME), not our own assertion. |
| Structure | Zero findings from the AST rules | `make structural` (`ast-grep scan`) | task end, CI | External engine (ast-grep), not our own test suite. |
| GJS adapter | Store smoke exits 0 | `make check` (`gjs -m tests/gjs-store-smoke.mjs`) | every edit, CI | Catches GJS-only import/runtime errors Node cannot see. |
| Task budget | `make check` under 90 s | `time make check` | task end | Longer and the loop stops running it; CI is unlimited. |

Two of these rows are deliberately external (`glib-compile-schemas`, `ast-grep`): a bar made
only of our own tests would prove only that we agree with ourselves.

## Measured, not yet enforced

| Metric | Today | Direction |
|--------|-------|-----------|
| Tests passing | 116 (`make check`, 2026-11-23) | must not fall |
| `make check` wall time | ≈ 1 s (measured 2026-11-23) | must stay under 90 s |
| Project line coverage | not instrumented (`node --test` has no built-in coverage gate here) | must not be claimed as enforced until a command exists |
| Live Shell validation | manual only (`EVIDENCE.md` §12–§13) | required before shipping a shell-facing change |

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|
| — | none | — | — | — | — |

An exception needs an owner and an expiry ≤ 90 days. Deleting a rule is not an exception.
