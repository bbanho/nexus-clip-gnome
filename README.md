# Nexus Clip GNOME Shell Extension

Clipboard-driven LLM pipeline: stack + FIFO, inference via an OpenAI-compatible /v1 endpoint. Reads and writes the clipboard only when you press its shortcuts.

## Requirements

- GNOME Shell 45-50 (tested on 50.3 Wayland)

## Install

```bash
cd /var/home/bruno/repos/nexus-clip-gnome
make install
make enable
```

## Enable/Disable Manually

```bash
make enable
make disable
```

## Compile Schemas

```bash
make compile-schemas
```

## Uninstall

```bash
make uninstall
```

## Verify

```bash
gnome-extensions info nexus-clip@bbanho
```

## Shortcuts

- Push: `<Super>c` (hotkey-push)
- Choose: `<Super>x` (hotkey-choose)
- Loop: `<Super>v` (hotkey-loop)
