# Configuration Reference

This page documents the settings and persistent data used by Nexus Clip. The Preferences
window is the recommended way to configure the extension; direct `gsettings` edits are
intended for scripting and troubleshooting.

## Preferences sections

### API

| Setting | GSettings key | Default | Description |
|---|---|---|---|
| Endpoint | `api-endpoint` | `http://localhost:8010/v1/chat/completions` | Full OpenAI-compatible chat-completions URL. |
| Model | `model-name` | `gemini-2.5-flash` | Model identifier sent in the request body. |
| API key | `api-key` | `random` | Sent as a bearer token. Use the value required by your endpoint. |
| Request timeout | `request-timeout` | `90` seconds | HTTP request timeout. |
| Stream responses | `stream` | `false` | Use Server-Sent Events for incremental output. |

The endpoint and model defaults are examples for a local Nexus Gateway setup; they are
not a hosted service guarantee. Change them to match your provider. Credentials are stored
in GSettings/dconf rather than in this repository, but they are not encrypted by this
extension. Treat local account access accordingly.

Requests use the `/v1/chat/completions` format. The selected shortcut prompt is sent as a
system message and the input text as a user message. Do not use a provider or endpoint
unless its data-handling policy is appropriate for the text you process.

### Shortcuts

The `shortcuts` setting is a JSON array. Each object has this shape:

```json
{
  "id": "sc_rewrite",
  "label": "Revisar texto",
  "accel": "<Alt><Super>r",
  "mode": "process",
  "prompt": "Revise a gramática sem mudar o sentido."
}
```

| Field | Required | Meaning |
|---|---:|---|
| `id` | Yes | Stable identifier used to resolve the action. |
| `label` | Yes | Human-readable name shown in Preferences and notifications. |
| `accel` | No | GTK accelerator syntax; empty means unbound. |
| `mode` | Yes | Action identifier listed below. |
| `prompt` | Depends | Prompt for prompt-based actions; empty for other actions. |

Supported `mode` values:

| Mode | Prompt required |
|---|---:|
| `push-process` | Yes |
| `process` | Yes |
| `copy-top` | No |
| `enqueue` | Yes |
| `run-next` | No |
| `drain` | No |
| `pop` | No |
| `show` | No |

There can be at most 12 entries. Accelerators are canonicalized; duplicate and structurally
invalid combinations are not registered. Preferences also warns about known GNOME-reserved
combinations. The shell mirrors active accelerator values to internal GSettings keys
`hotkey-slot-0` through `hotkey-slot-11`; do not edit those internal keys directly.

To inspect settings using the repository schema:

```bash
gsettings --schemadir extension/schemas \
  list-recursively org.gnome.shell.extensions.nexus-clip
```

To set a shortcut list from a shell, ensure JSON and GVariant quoting are correct. Prefer
the Preferences UI to avoid quoting errors. An explicit `[]` disables all shortcuts; an
empty string means first-run/upgrade migration may run.

### Legacy migration

If `shortcuts` is unset/empty on first initialization, Nexus migrates the legacy `presets`
object. The first valid prompt is assigned to the two default bound actions; later prompts
become unbound shortcut entries. An explicit `[]` is respected and does not trigger
migration. The legacy `presets` key remains in the schema for migration compatibility.

## Persistent data

Default directory:

```text
~/.local/share/nexus-clip-gnome/
```

Set `NEXUS_CLIP_DATA_DIR` to override this directory for a process or test environment.
The extension stores:

| File | Contents |
|---|---|
| `stack.json` | Nexus clipboard, newest item first (LIFO). |
| `fifo.json` | Queued prompts, oldest first (FIFO). |
| `history.jsonl` | Append-only record of completed inference results. |

Both JSON state files have `schemaVersion: 1` and an `items` array. Stack items contain an
`id`, `text`, timestamp (`ts`), `kind` (`input` or `result`), and optional `parentId` and
`prompt`. FIFO items contain an `id`, `prompt`, timestamp, and optional `label`. Invalid
items are discarded or repaired during load; the stack is clamped to its `maxItems` value
when one is present.

The data directory is separate from GSettings. Uninstalling the extension does not delete
either. Back up or remove the directory explicitly if needed. The extension's Preferences
provides controls to clear the stack, queue, and history.

## Development settings and tests

`make check` is offline and validates the schema, unit/static tests, syntax, and GJS store
adapter. `make smoke` sends live requests and requires a reachable compatible endpoint.
See [Development](DEVELOPMENT.md) for prerequisites and the full workflow.
