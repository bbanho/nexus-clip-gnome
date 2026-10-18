# ADR-0003: `data: [DONE]` terminates the stream

## Status
Accepted

## Context
The upstream gateway (`/v1`, Gemini-backed) sends SSE chunks followed by `data: [DONE]`,
but **does not close the socket promptly** afterwards — sometimes for tens of seconds. A
client that waits for EOF appears to hang even though the answer is complete. Measured via
`curl -sN`: responses finish in 200 with `[DONE]` at ~3–13s, while the connection lingers.

## Decision
Treat `data: [DONE]` as the terminal signal for `stream()`: resolve immediately, close the
HTTP stream, and stop reading. Keep EOF handling as a defensive fallback for other
OpenAI-compatible servers that do close on completion.

## Consequences
- No user-visible "hang"; streaming completes as soon as the model is done.
- Correct against this gateway and against standard OpenAI-compatible servers.
- A server that sends neither `[DONE]` nor EOF is bounded by the request timeout and any
  caller-supplied cancellation.
