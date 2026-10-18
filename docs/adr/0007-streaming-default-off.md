# ADR-0007: Streaming default off

## Status
Accepted

## Context
Streaming (SSE) gives immediate feedback in the S2 chooser, but adds moving parts: chunked
reads, an incremental UTF-8 decoder, and the `[DONE]` terminator (ADR-0003). For a first
POC the priority is a reliable end-to-end path.

## Decision
Ship with `stream = false` by default. The streaming path is fully implemented and tested,
and can be enabled in prefs (`stream` GSettings key, boolean).

## Consequences
- Default experience is a single request/response — simplest to validate and debug.
- Users opt in to streaming when they want live output in the chooser.
- Both paths share the same payload builder (`v1core.buildPayload`), so behavior stays
  consistent.
