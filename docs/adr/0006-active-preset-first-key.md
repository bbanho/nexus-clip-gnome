# ADR-0006: Active preset = first key of the presets object

## Status
Accepted

## Context
`presets` is a JSON object (`name → prompt text`) rendered as the chooser list. S1 (and the
system message of S2) needs a single "default" prompt without asking the user to pick one
every time. JSON objects have insertion order in practice, but there is no explicit
"default" field.

## Decision
The **first key** of the `presets` object is the active preset used by S1 and as the system
message in S2. Reordering the keys changes the default. Documented in README and prefs.

## Consequences
- Zero extra configuration; the chooser order and the default stay visually tied.
- Editing `presets` as a raw JSON blob can unintentionally reorder keys — acceptable for a
  POC. A future schema may add an explicit `activePreset` field.
