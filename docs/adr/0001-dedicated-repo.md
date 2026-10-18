# ADR-0001: Dedicated repo `nexus-clip-gnome`

## Status
Accepted

## Context
The GNOME clipboard/LLM experiment was prototyped alongside `nexus-plasm` (a KDE/Plasma
extension). The two share an idea but not a runtime: GNOME 45+ requires ESM/GJS with
`gi://` imports and `resource:///` shell modules, while Plasma uses QML. Mixing them in one
repo makes build/install/test ambiguous and risks accidental edits to a reference project.

## Decision
Put the GNOME work in its own repo, `nexus-clip-gnome`, with its own `Makefile`, GSettings
schema, and Node-based pure-logic tests. Treat `nexus-plasm` as a read-only reference.

## Consequences
- Clean separation: no cross-contamination of build systems or install paths.
- Duplication of a few ideas (preset handling, store shape) is accepted for the POC.
- The `/v1` contract remains the shared seam for a future C + llama.cpp implementation.
