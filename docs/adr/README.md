# Architecture Decision Records

Short, append-only records of decisions that shape this project. Format: Context →
Decision → Consequences (see `docs/DEVELOPMENT.md` for workflow).

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-dedicated-repo.md) | Dedicated repo `nexus-clip-gnome` | Accepted |
| [0002](0002-gjs-libsoup3-async.md) | GJS / libsoup3 async patterns | Accepted |
| [0003](0003-sse-done-terminator.md) | `data: [DONE]` terminates the stream | Accepted |
| [0004](0004-shortcut-semantics.md) | Shortcut semantics S1 / S2 / S3 | Superseded by 0008 |
| [0005](0005-state-model.md) | State model: LIFO + FIFO + history, tree-ready | Accepted |
| [0006](0006-active-preset-first-key.md) | Active preset = first key | Superseded by 0008 |
| [0007](0007-streaming-default-off.md) | Streaming default off | Accepted |
| [0008](0008-configurable-shortcuts-and-clipboard-boundary.md) | Configurable shortcuts + explicit system-clipboard boundary | Accepted |
| [0009](0009-no-gtk-in-shell.md) | Never create GTK widgets in the shell process | Accepted |
| [0010](0010-result-nodes-on-stack.md) | Inference results are nodes on the Nexus stack | Accepted |
