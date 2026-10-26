// In-shell UI built with St/Clutter.
//
// IMPORTANT (see ADR-0009): the shell extension must NEVER instantiate GTK.
// Creating a Gtk.Window inside the compositor process makes GTK open its own
// Wayland connection and roundtrip back to the very compositor that is blocked
// inside the keybinding handler — the classic Super+X freeze. St widgets are
// native shell actors and are safe.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const openOverlays = new Set();

function primaryMonitor() {
    return Main.layoutManager.primaryMonitor;
}

function preview(text, length = 90) {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length > length ? flat.slice(0, length - 1) + '…' : flat;
}

function ageLabel(ts) {
    if (!ts)
        return '';
    const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}min`;
    return `${Math.floor(seconds / 3600)}h`;
}

function closeOverlay(overlay, onClose) {
    if (!overlay)
        return;
    openOverlays.delete(overlay);
    if (onClose)
        onClose();
    if (global.stage.get_key_focus() === overlay)
        global.stage.set_key_focus(null);
    overlay.destroy();
}

export function closeAllOverlays() {
    for (const overlay of [...openOverlays])
        closeOverlay(overlay);
}

/**
 * Keyboard-driven stack/FIFO viewer.
 * ↑/↓ (or j/k) select, Enter copies the selected item, Esc closes.
 */
export function showStackView({ stack, fifo }) {
    const monitor = primaryMonitor();
    if (!monitor)
        return null;

    const overlay = new St.Widget({
        reactive: true,
        can_focus: true,
        visible: true,
        layout_manager: new Clutter.BinLayout(),
        style: 'background-color: rgba(0, 0, 0, 0.55);',
    });
    overlay.set_position(monitor.x, monitor.y);
    overlay.set_size(monitor.width, monitor.height);
    Main.uiGroup.add_child(overlay);
    openOverlays.add(overlay);

    const width = Math.min(760, Math.max(420, Math.floor(monitor.width * 0.6)));
    const height = Math.min(560, Math.max(320, Math.floor(monitor.height * 0.6)));

    const panel = new St.BoxLayout({
        vertical: true,
        spacing: 10,
        style:
            'background-color: #191926; border: 1px solid #3a3a52; ' +
            'border-radius: 14px; padding: 18px;',
    });
    panel.set_size(width, height);

    // BinLayout fills the overlay; St.Bin centers the fixed-size panel.
    const centered = new St.Bin({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        child: panel,
    });
    overlay.add_child(centered);

    const title = new St.Label({
        text: 'Nexus — clipboard próprio (pilha LIFO + fila FIFO)',
        style: 'color: #e8e8f4; font-size: 15px; font-weight: bold;',
    });
    panel.add_child(title);

    const subtitle = new St.Label({
        text: `${stack.items.length} item(ns) no Nexus · ${fifo.items.length} prompt(s) na fila · Enter copia para o sistema · Esc fecha`,
        style: 'color: #9aa0b5; font-size: 11px;',
    });
    panel.add_child(subtitle);

    const scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        x_expand: true,
        y_expand: true,
    });
    panel.add_child(scroll);

    const list = new St.BoxLayout({ vertical: true, spacing: 4 });
    scroll.set_child(list);

    const rows = [];
    const baseStyle =
        'color: #dfe4f2; font-family: monospace; font-size: 12px; ' +
        'padding: 5px 8px; border-radius: 6px;';
    const selectedStyle =
        'background-color: #3a5a8c; color: #ffffff; font-family: monospace; ' +
        'font-size: 12px; padding: 5px 8px; border-radius: 6px;';

    function addRow({ label, text, fullText = null, copyable = false }) {
        const row = new St.BoxLayout({ vertical: true, spacing: 1 });
        row.set_style(baseStyle);
        const head = new St.Label({
            text: label,
            style: 'color: #8fb4ff; font-size: 10px;',
            x_expand: true,
        });
        row.add_child(head);
        const body = new St.Label({
            text: text,
            style: 'color: inherit; font-size: 12px;',
            x_expand: true,
            line_wrap: true,
        });
        row.add_child(body);
        list.add_child(row);
        rows.push({
            row,
            text: copyable ? (fullText ?? text) : null,
            bodyText: text,
        });
    }

    if (stack.items.length === 0) {
        addRow({ label: 'PILHA', text: '(vazia)', copyable: false });
    } else {
        const shown = stack.items.slice(0, 20);
        shown.forEach((item, index) => {
            const kind = item.kind === 'result' ? 'resultado' : 'entrada';
            const parent = item.parentId ? ` ← ${item.parentId.slice(-8)}` : '';
            addRow({
                label: `NEXUS #${index + 1} · ${kind} · ${ageLabel(item.ts)}${parent}`,
                text: preview(item.text, 220),
                fullText: item.text,
                copyable: true,
            });
        });
    }

    if (fifo.items.length > 0) {
        addRow({ label: 'FILA', text: `${fifo.items.length} prompt(s) pendente(s)`, copyable: false });
        fifo.items.slice(0, 10).forEach((item, index) => {
            const name = item.label ? `${item.label}: ` : '';
            addRow({
                label: `FILA #${index + 1}`,
                text: `→ ${name}${preview(item.prompt, 200)}`,
                copyable: false,
            });
        });
    }

    let selected = 0;
    const selectable = () => rows.filter(r => r.text !== null);

    function refreshSelection() {
        const items = selectable();
        if (items.length === 0)
            return;
        if (selected < 0)
            selected = items.length - 1;
        if (selected >= items.length)
            selected = 0;
        for (const row of rows)
            row.row.set_style(baseStyle);
        items[selected].row.set_style(selectedStyle);
    }

    refreshSelection();

    overlay.connect('key-press-event', (_actor, event) => {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape || symbol === Clutter.KEY_q) {
            closeOverlay(overlay);
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Up || symbol === Clutter.KEY_k) {
            selected--;
            refreshSelection();
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_j) {
            selected++;
            refreshSelection();
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            const item = selectable()[selected];
            if (item && item.text) {
                St.Clipboard.get_default().set_text(
                    St.ClipboardType.CLIPBOARD,
                    item.text
                );
                Main.notify('Nexus Clip', 'Item copiado do Nexus para o sistema');
            }
            closeOverlay(overlay);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    global.stage.set_key_focus(overlay);
    return { close: () => closeOverlay(overlay) };
}

/**
 * Non-interactive live panel used by streaming. It never grabs focus, so the
 * user can keep typing in the focused app.
 */
export function createLivePanel({ title = 'Nexus Clip' } = {}) {
    const monitor = primaryMonitor();
    if (!monitor)
        return { append() {}, setMessage() {}, close() {} };

    const width = 460;
    const height = 220;
    const panel = new St.BoxLayout({
        vertical: true,
        reactive: false,
        can_focus: false,
        spacing: 6,
        style:
            'background-color: rgba(20, 20, 32, 0.96); border: 1px solid #3a3a52; ' +
            'border-radius: 10px; padding: 12px;',
    });
    panel.set_size(width, height);
    panel.set_position(
        monitor.x + monitor.width - width - 24,
        monitor.y + monitor.height - height - 24
    );
    Main.uiGroup.add_child(panel);

    const header = new St.Label({
        text: title,
        style: 'color: #8fb4ff; font-size: 11px; font-weight: bold;',
    });
    panel.add_child(header);

    const scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        x_expand: true,
        y_expand: true,
    });
    panel.add_child(scroll);

    const label = new St.Label({
        text: '',
        style: 'color: #dfe4f2; font-family: monospace; font-size: 12px;',
        line_wrap: true,
    });
    label.set_width(width - 30);
    scroll.set_child(label);

    let closed = false;

    function scrollToBottom() {
        const adjustment = scroll.vscroll?.adjustment;
        if (adjustment)
            adjustment.value = Math.max(0, adjustment.upper - adjustment.page_size);
    }

    return {
        append(delta) {
            if (closed)
                return;
            label.set_text(label.get_text() + String(delta ?? ''));
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                scrollToBottom();
                return GLib.SOURCE_REMOVE;
            });
        },
        setMessage(message) {
            if (!closed)
                label.set_text(String(message ?? ''));
        },
        close() {
            if (closed)
                return;
            closed = true;
            panel.destroy();
        },
    };
}
