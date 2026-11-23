// In-shell UI built with St/Clutter.
//
// IMPORTANT (see ADR-0009): the shell extension must NEVER instantiate GTK.
// Creating a Gtk.Window inside the compositor process makes GTK open its own
// Wayland connection and roundtrip back to the very compositor that is blocked
// inside the keybinding handler — the classic Super+X freeze. St widgets are
// native shell actors and are safe.
//
// The visual history (showStackView) adapts the Clipboard History UX — a
// searchable, newest-first panel with keyboard navigation — to Nexus's own
// clipboard: tabs for the LIFO stack, the inference history, the FIFO queue and
// the prompt library. Export to the system clipboard stays explicit (Enter or
// the "Copiar" button), preserving the CP-03 boundary.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { filterHistory } from './history-core.js';
import { searchTemplates } from './prompts.js';
import {
    commandForChar,
    formatCommandHeader,
    formatQueueBadge,
} from './command-keys.js';

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
    if (!overlay || overlay._nexusClosed)
        return;
    overlay._nexusClosed = true;
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

const PANEL_STYLE =
    'background-color: #191926; border: 1px solid #3a3a52; ' +
    'border-radius: 14px; padding: 18px;';
const ROW_STYLE =
    'color: #dfe4f2; font-family: monospace; font-size: 12px; ' +
    'padding: 6px 9px; border-radius: 7px;';
const ROW_SELECTED_STYLE =
    'background-color: #3a5a8c; color: #ffffff; font-family: monospace; ' +
    'font-size: 12px; padding: 6px 9px; border-radius: 7px;';
const HEAD_STYLE = 'color: #8fb4ff; font-size: 10px;';
const DIM_STYLE = 'color: #9aa0b5; font-size: 11px;';

/**
 * Transient, non-focusable status chip. Replaces a system notification for
 * routine successes so the user still sees *which* operation ran without
 * notification spam. Auto-hides after `seconds`. Never touches the clipboard.
 */
export function createStatusChip({ text = '', seconds = 4 } = {}) {
    const monitor = primaryMonitor();
    if (!monitor)
        return { close() {} };

    const chip = new St.BoxLayout({
        vertical: false,
        reactive: false,
        can_focus: false,
        style:
            'background-color: rgba(20, 20, 32, 0.95); border: 1px solid #3a3a52; ' +
            'border-radius: 10px; padding: 8px 14px;',
    });
    const label = new St.Label({
        text: String(text ?? ''),
        style: 'color: #dfe4f2; font-size: 12px;',
    });
    chip.add_child(label);
    Main.uiGroup.add_child(chip);
    openOverlays.add(chip);

    // Bottom-left, clear of the streaming panel (bottom-right).
    const width = Math.min(560, Math.max(220, Math.floor(monitor.width * 0.4)));
    chip.set_width(width);
    chip.set_position(
        monitor.x + 24,
        monitor.y + monitor.height - 72
    );

    let closed = false;
    let timer = 0;
    const close = () => {
        if (closed)
            return;
        closed = true;
        if (timer) {
            GLib.source_remove(timer);
            timer = 0;
        }
        closeOverlay(chip);
    };

    const delay = Math.max(1, Math.floor(seconds));
    timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
        timer = 0;
        close();
        return GLib.SOURCE_REMOVE;
    });

    return { close };
}

const TABS = [
    { key: 'stack', label: 'Pilha' },
    { key: 'history', label: 'Histórico' },
    { key: 'fifo', label: 'Fila' },
    { key: 'prompts', label: 'Prompts' },
];

/**
 * Keyboard-driven visual history.
 * ↑/↓ (ou j/k) navegam, Enter copia para o sistema, Ctrl+Enter reutiliza como
 * entrada do Nexus, Del remove, 1–4 mudam de separador, / foca a pesquisa,
 * Esc fecha. `refresh()` devolve dados atualizados após uma mutação.
 */
export function showStackView({
    stack,
    fifo,
    history = [],
    templates = [],
    initialTab = 'stack',
    lastStatus = '',
    refresh = null,
    onCopied = null,
    onUseAsInput = null,
    onRemove = null,
    onEnqueue = null,
}) {
    const monitor = primaryMonitor();
    if (!monitor)
        return null;

    let data = { stack, fifo, history };
    let tab = TABS.some(t => t.key === initialTab) ? initialTab : 'stack';
    let query = '';
    let selected = 0;
    let rows = [];

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

    const width = Math.min(860, Math.max(460, Math.floor(monitor.width * 0.66)));
    const height = Math.min(620, Math.max(360, Math.floor(monitor.height * 0.66)));

    const panel = new St.BoxLayout({ vertical: true, spacing: 10, style: PANEL_STYLE });
    panel.set_size(width, height);
    const centered = new St.Bin({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        child: panel,
    });
    overlay.add_child(centered);

    // Header: title + last operation status.
    const header = new St.BoxLayout({ vertical: false, spacing: 12 });
    const title = new St.Label({
        text: 'Nexus Clip',
        style: 'color: #e8e8f4; font-size: 15px; font-weight: bold;',
    });
    const status = new St.Label({
        text: lastStatus,
        style: `${DIM_STYLE} font-size: 11px;`,
        x_expand: true,
        x_align: Clutter.ActorAlign.END,
    });
    header.add_child(title);
    header.add_child(status);
    panel.add_child(header);

    // Tab bar.
    const tabBar = new St.BoxLayout({ vertical: false, spacing: 6 });
    panel.add_child(tabBar);
    const tabButtons = new Map();
    for (const t of TABS) {
        const button = new St.Button({
            label: t.label,
            can_focus: false,
            reactive: true,
            style:
                'color: #9aa0b5; background-color: #23233a; border-radius: 8px; ' +
                'padding: 5px 12px; font-size: 12px;',
        });
        button.connect('clicked', () => switchTab(t.key));
        tabBar.add_child(button);
        tabButtons.set(t.key, button);
    }

    // Search.
    const entry = new St.Entry({
        hint_text: 'Filtrar por texto, prompt ou nome…  ( / )',
        text: '',
        can_focus: true,
        x_expand: true,
        style:
            'color: #dfe4f2; background-color: #23233a; border-radius: 8px; ' +
            'padding: 6px 10px; font-size: 12px;',
    });
    panel.add_child(entry);
    entry.connect('notify::text', () => {
        query = entry.get_text();
        selected = 0;
        rebuild();
    });

    // List.
    const scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        x_expand: true,
        y_expand: true,
    });
    panel.add_child(scroll);
    const list = new St.BoxLayout({ vertical: true, spacing: 4 });
    scroll.set_child(list);

    // Footer: hint + contextual actions.
    const footer = new St.BoxLayout({ vertical: false, spacing: 8 });
    const hint = new St.Label({ text: '', style: DIM_STYLE, x_expand: true });
    footer.add_child(hint);
    const actions = new St.BoxLayout({ vertical: false, spacing: 6 });
    footer.add_child(actions);
    panel.add_child(footer);

    function tabCount(key) {
        if (key === 'stack')
            return data.stack.items.length;
        if (key === 'history')
            return data.history.length;
        if (key === 'fifo')
            return data.fifo.items.length;
        return templates.length;
    }

    function refreshTabLabels() {
        for (const t of TABS) {
            const button = tabButtons.get(t.key);
            button.set_label(`${t.label} (${tabCount(t.key)})`);
            button.set_style(
                t.key === tab
                    ? 'color: #ffffff; background-color: #3a5a8c; border-radius: 8px; padding: 5px 12px; font-size: 12px;'
                    : 'color: #9aa0b5; background-color: #23233a; border-radius: 8px; padding: 5px 12px; font-size: 12px;'
            );
        }
    }

    function matchesQuery(haystack) {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length === 0)
            return true;
        const text = String(haystack ?? '').toLowerCase();
        return words.every(word => text.includes(word));
    }

    function buildRows() {
        const out = [];
        if (tab === 'stack') {
            data.stack.items.forEach((item, index) => {
                const kind = item.kind === 'result' ? 'resultado' : 'entrada';
                if (!matchesQuery(`${item.text} ${item.prompt ?? ''} ${item.label ?? ''} ${kind}`))
                    return;
                out.push({
                    head: `#${index + 1} · ${kind} · ${ageLabel(item.ts)}`,
                    sub: preview(item.text, 220),
                    payload: { tab: 'stack', id: item.id, text: item.text },
                });
            });
        } else if (tab === 'history') {
            filterHistory(data.history, query).forEach(entry => {
                const name = entry.label || entry.mode || 'inferência';
                const body = entry.text ?? entry.prompt ?? entry.uuid ?? '';
                out.push({
                    head: `${name} · ${ageLabel(entry.ts)}`,
                    sub: preview(body, 220),
                    // Explicit export only: a provenance row copies its UUID,
                    // never the source text (which is not stored there anyway).
                    payload: { tab: 'history', id: entry.id, text: body },
                });
            });
        } else if (tab === 'fifo') {
            data.fifo.items.forEach((item, index) => {
                if (!matchesQuery(`${item.prompt} ${item.label ?? ''}`))
                    return;
                out.push({
                    head: `FILA #${index + 1}${item.label ? ` · ${item.label}` : ''}`,
                    sub: preview(item.prompt, 200),
                    payload: { tab: 'fifo', id: item.id, text: item.prompt },
                });
            });
        } else {
            searchTemplates(query).forEach(template => {
                out.push({
                    head: template.label,
                    sub: preview(template.prompt, 200),
                    payload: {
                        tab: 'prompts',
                        id: template.id,
                        text: template.prompt,
                        label: template.label,
                    },
                });
            });
        }
        return out;
    }

    function refreshSelection() {
        if (rows.length === 0)
            return;
        if (selected < 0)
            selected = rows.length - 1;
        if (selected >= rows.length)
            selected = 0;
        rows.forEach((row, index) => {
            row.actor.set_style(index === selected ? ROW_SELECTED_STYLE : ROW_STYLE);
        });
    }

    function rebuild() {
        list.destroy_all_children();
        rows = [];
        const built = buildRows();
        if (built.length === 0) {
            const empty = new St.Label({
                text: query ? 'Nada corresponde ao filtro.' : '(vazio)',
                style: `${ROW_STYLE} color: #9aa0b5;`,
            });
            list.add_child(empty);
        }
        built.forEach((row, index) => {
            const actor = new St.BoxLayout({
                vertical: true,
                spacing: 2,
                reactive: true,
                style: ROW_STYLE,
            });
            const head = new St.Label({ text: row.head, style: HEAD_STYLE, x_expand: true });
            const body = new St.Label({
                text: row.sub,
                style: 'color: inherit; font-size: 12px;',
                x_expand: true,
                line_wrap: true,
            });
            actor.add_child(head);
            actor.add_child(body);
            actor.connect('button-press-event', () => {
                selected = index;
                refreshSelection();
                return Clutter.EVENT_STOP;
            });
            list.add_child(actor);
            rows.push({ actor, payload: row.payload });
        });
        refreshSelection();
        refreshTabLabels();
        refreshFooter();
    }

    function selectedPayload() {
        return rows[selected]?.payload ?? null;
    }

    function copySelected() {
        const payload = selectedPayload();
        if (!payload || !payload.text)
            return;
        // Explicit export (CP-03): the only place the HUD writes the system
        // clipboard.
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, payload.text);
        if (onCopied)
            onCopied(payload.text);
    }

    function useSelected() {
        const payload = selectedPayload();
        if (!payload || !payload.text || !onUseAsInput)
            return;
        onUseAsInput(payload.text);
        reloadData();
    }

    function removeSelected() {
        const payload = selectedPayload();
        if (!payload || !onRemove)
            return;
        onRemove(payload.tab, payload.id);
        reloadData();
    }

    function enqueueSelected() {
        const payload = selectedPayload();
        if (!payload || !onEnqueue)
            return;
        onEnqueue(payload.text, payload.label ?? '');
        reloadData();
    }

    function reloadData() {
        if (refresh)
            data = refresh();
        rebuild();
    }

    function makeButton(label, handler) {
        const button = new St.Button({
            label,
            can_focus: false,
            reactive: true,
            style:
                'color: #dfe4f2; background-color: #23233a; border-radius: 8px; ' +
                'padding: 5px 12px; font-size: 12px;',
        });
        button.connect('clicked', handler);
        return button;
    }

    function refreshFooter() {
        actions.destroy_all_children();
        if (tab === 'prompts') {
            hint.set_text('↑↓ escolher · Enter enfileirar na fila · Esc fechar');
            actions.add_child(makeButton('Enfileirar', enqueueSelected));
        } else if (tab === 'fifo') {
            hint.set_text('↑↓ escolher · Enter copiar prompt · Del remover passo · Esc fechar');
            actions.add_child(makeButton('Copiar', copySelected));
            actions.add_child(makeButton('Remover', removeSelected));
        } else {
            hint.set_text('↑↓ · Enter copiar p/ sistema · Ctrl+Enter usar no Nexus · Del remover · Esc fechar');
            actions.add_child(makeButton('Copiar', copySelected));
            if (onUseAsInput)
                actions.add_child(makeButton('Usar no Nexus', useSelected));
            if (tab === 'stack' && onRemove)
                actions.add_child(makeButton('Remover', removeSelected));
        }
    }

    function switchTab(key) {
        tab = key;
        selected = 0;
        rebuild();
    }

    function nextTab(delta) {
        const index = TABS.findIndex(t => t.key === tab);
        const next = (index + delta + TABS.length) % TABS.length;
        switchTab(TABS[next].key);
    }

    function handleNav(symbol, state) {
        if (symbol === Clutter.KEY_Escape) {
            closeOverlay(overlay);
            return true;
        }
        if (symbol === Clutter.KEY_Up || symbol === Clutter.KEY_k) {
            selected--;
            refreshSelection();
            return true;
        }
        if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_j) {
            selected++;
            refreshSelection();
            return true;
        }
        if (symbol === Clutter.KEY_Tab) {
            nextTab(state & Clutter.ModifierType.SHIFT_MASK ? -1 : 1);
            return true;
        }
        if (symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_4) {
            switchTab(TABS[symbol - Clutter.KEY_1].key);
            return true;
        }
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            if (state & Clutter.ModifierType.CONTROL_MASK)
                useSelected();
            else if (tab === 'prompts')
                enqueueSelected();
            else
                copySelected();
            return true;
        }
        if (symbol === Clutter.KEY_Delete || symbol === Clutter.KEY_BackSpace) {
            if (tab === 'stack' || tab === 'fifo')
                removeSelected();
            return true;
        }
        return false;
    }

    overlay.connect('key-press-event', (_actor, event) => {
        const symbol = event.get_key_symbol();
        const state = event.get_state();
        if (symbol === Clutter.KEY_q) {
            closeOverlay(overlay);
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_slash) {
            global.stage.set_key_focus(entry);
            return Clutter.EVENT_STOP;
        }
        return handleNav(symbol, state) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    });

    // When the search entry has focus it must still allow navigation/action
    // keys, while letting ordinary typing through to filter the list.
    entry.connect('key-press-event', (_actor, event) => {
        const symbol = event.get_key_symbol();
        const state = event.get_state();
        if (
            symbol === Clutter.KEY_Escape ||
            symbol === Clutter.KEY_Up ||
            symbol === Clutter.KEY_Down ||
            symbol === Clutter.KEY_Tab ||
            symbol === Clutter.KEY_Return ||
            symbol === Clutter.KEY_KP_Enter
        ) {
            if (symbol === Clutter.KEY_Escape) {
                global.stage.set_key_focus(overlay);
                return Clutter.EVENT_STOP;
            }
            return handleNav(symbol, state) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    rebuild();
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

let queueBadge = null;

/**
 * Always-on (non-interactive) FIFO badge. It is visible only while there is
 * queued work: a backlog of 15 prompts is impossible to miss, and disappears
 * when the queue drains. Never grabs focus and never touches the clipboard.
 */
export function getQueueBadge() {
    if (queueBadge)
        return queueBadge;

    const monitor = primaryMonitor();
    if (!monitor)
        return { update() {}, close() {} };

    const width = Math.min(620, Math.max(280, Math.floor(monitor.width * 0.4)));
    const badge = new St.BoxLayout({
        vertical: false,
        reactive: false,
        can_focus: false,
        visible: false,
        style:
            'background-color: rgba(36, 24, 56, 0.95); ' +
            'border: 1px solid #a06bd8; border-radius: 10px; padding: 7px 14px;',
    });
    const label = new St.Label({
        text: '',
        style: 'color: #f0dcff; font-size: 12px; font-weight: bold;',
        x_expand: true,
        line_wrap: true,
    });
    badge.add_child(label);
    badge.set_width(width);
    // Top-left, below the panel: avoids the GNOME clock/notification area and
    // the bottom-left status chip.
    badge.set_position(monitor.x + 24, monitor.y + 42);
    Main.uiGroup.add_child(badge);

    queueBadge = {
        update({ text = '' } = {}) {
            label.set_text(String(text ?? ''));
            badge.visible = !!label.get_text();
        },
        close() {
            if (queueBadge && queueBadge.close === this)
                queueBadge = null;
            badge.destroy();
        },
    };
    return queueBadge;
}

let commandBar = null;

/**
 * Keyboard-only command bar opened by the single Super leader key.
 *
 * It is an St actor inside the shell (not a GTK window — see ADR-0009). It
 * shows the live stack/FIFO depth and dispatches one mnemonic key per action,
 * including 1–5 to enqueue ready-made prompt templates. Pressing a command
 * closes the bar first, so streaming/live feedback stays visible afterwards.
 */
export function showCommandBar({
    stack,
    fifo,
    commands = [],
    templates = [],
    onCommand,
    onTemplate,
    onClose,
} = {}) {
    if (commandBar)
        commandBar.close();

    const monitor = primaryMonitor();
    if (!monitor)
        return { close() {} };

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

    const width = Math.min(600, Math.max(360, Math.floor(monitor.width * 0.5)));
    const panel = new St.BoxLayout({
        vertical: true,
        spacing: 8,
        style:
            'background-color: #191926; border: 1px solid #a06bd8; ' +
            'border-radius: 14px; padding: 18px;',
    });
    panel.set_size(width, 480);
    overlay.add_child(new St.Bin({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        child: panel,
    }));

    panel.add_child(new St.Label({
        text: 'NEXUS · SUPER COMANDOS',
        style: 'color: #e8d8ff; font-size: 15px; font-weight: bold;',
    }));
    const stackCount = stack?.items?.length ?? 0;
    const fifoCount = fifo?.items?.length ?? 0;
    panel.add_child(new St.Label({
        text: formatCommandHeader({ stackCount, fifoCount }),
        style: 'color: #f0c8ff; font-size: 12px;',
    }));
    const next = fifo?.items?.[0];
    panel.add_child(new St.Label({
        text: next
            ? `PRÓXIMO: ${preview(next.label || next.prompt, 68)}`
            : 'FILA VAZIA · 1–5 enfileira um modelo de prompt',
        style: DIM_STYLE,
        line_wrap: true,
    }));

    const scroll = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        x_expand: true,
        y_expand: true,
    });
    panel.add_child(scroll);
    const list = new St.BoxLayout({ vertical: true, spacing: 3 });
    scroll.set_child(list);

    function addRow(key, text, dim = false) {
        const row = new St.BoxLayout({ vertical: false, spacing: 10 });
        row.add_child(new St.Label({
            text: key.toUpperCase(),
            style:
                'color: #c89bff; font-family: monospace; font-size: 13px; ' +
                'font-weight: bold; min-width: 28px;',
        }));
        row.add_child(new St.Label({
            text,
            style: dim
                ? DIM_STYLE
                : 'color: #dfe4f2; font-size: 12px;',
            x_expand: true,
            line_wrap: true,
        }));
        list.add_child(row);
    }

    for (const command of commands)
        addRow(command.key, command.label);
    for (const template of templates)
        addRow(template.key, `Enfileirar: ${template.label}`, true);

    panel.add_child(new St.Label({
        text: 'Esc fecha · V C X Q N D Z H A M S U executa · 1–5 enfileira',
        style: DIM_STYLE,
    }));

    let closed = false;
    const close = () => {
        if (closed)
            return;
        closed = true;
        closeOverlay(overlay, onClose);
        if (commandBar && commandBar.close === close)
            commandBar = null;
    };

    overlay.connect('key-press-event', (_actor, event) => {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            close();
            return Clutter.EVENT_STOP;
        }
        const char = String.fromCharCode(symbol);
        if (!/^[a-zA-Z0-9]$/.test(char))
            return Clutter.EVENT_PROPAGATE;
        const match = commandForChar(char);
        if (!match)
            return Clutter.EVENT_STOP;
        close();
        if (match.type === 'command')
            onCommand?.(match.item);
        else
            onTemplate?.(match.item);
        return Clutter.EVENT_STOP;
    });

    global.stage.set_key_focus(overlay);
    commandBar = { close };
    return commandBar;
}