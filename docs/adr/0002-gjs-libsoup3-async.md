# ADR-0002: GJS / libsoup3 async patterns

## Status
Accepted

## Context
The client must do HTTP + SSE streaming under GJS (GNOME 50). Several assumptions that hold
in Node do **not** hold in GJS. These were established empirically:

1. `Soup.Session.send_and_read_async` is **not promisified** by GJS. Calling it with 3 args
   throws `At least 4 arguments required, but only 3 passed`.
2. `Soup.Session.read_bytes_async` / `Soup.Message.get_response_body` **do not exist** in the
   libsoup3 GJS bindings. Streaming requires: `send_async` → `send_finish(res)` (yields a
   `Gio.InputStream`) → loop `read_bytes_async(8192, …)`.
3. Subclassing `Gio.OutputStream` + `send_and_splice_async` **segfaults** the shell (exit
   139). Avoided.
4. GJS `TextDecoder` does **not** implement `{stream:true}`.
5. `GLib.timeout_add_seconds` takes **3** args in GJS `(priority, seconds, callback)`.
6. A top-level `await import(...)` in a `gjs -m` script breaks GJS promise-job draining
   while a `GLib.MainLoop` runs (promises resolve only after `loop.quit()`). Use a
   **static import**.

## Decision
Encapsulate all network I/O in `lib/v1client.js` with:
- explicit callback arguments for every `_async` call, wrapped in manual `new Promise`;
- chunked `read_bytes_async` reading via the `Gio.InputStream` from `send_finish`;
- an incremental UTF-8 decoder (`createUtf8Decoder()` in `lib/sse.js`) instead of
  `TextDecoder({stream:true})`;
- static ESM imports (never dynamic top-level import inside a running MainLoop).

## Consequences
- Portable, restart-safe, no segfault path.
- Slightly more boilerplate than Node's `await fetch`.
- Test scripts must import statically; documented in `docs/DEVELOPMENT.md` and
  `docs/TROUBLESHOOTING.md`.
