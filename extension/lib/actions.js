import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { readApiConfig, readUiConfig } from './config.js';
import {
    createLivePanel,
    createStatusChip,
    closeAllOverlays,
    getQueueBadge,
    showCommandBar,
    showStackView,
} from './hud.js';
import {
    COMMAND_KEYS,
    formatQueueBadge,
    shortcutForCommand,
    templateCommands,
} from './command-keys.js';
import { needsPrompt, parseShortcuts } from './shortcuts.js';
import { PROMPT_TEMPLATES } from './prompts.js';
import { formatStatus, shouldNotify } from './notify-policy.js';
import { auditText } from './text-gate.js';
import {
    assertNoVibeFlow,
    captureProvenance,
    kvProjection,
} from './provenance.js';
import { buildMessages } from './v1core.js';
import { chat, stream } from './v1client.js';
import * as store from './store.js';

function preview(text, length = 64) {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length > length ? flat.slice(0, length - 1) + '…' : flat;
}

function friendlyError(error) {
    const message = String(error?.message ?? error);
    if (/cancell?ed|Operation was cancelled/i.test(message))
        return 'Cancelado';
    if (/Connection refused|Could not connect|Network is unreachable/i.test(message))
        return 'Gateway offline (conexão recusada)';
    if (/HTTP 40[13]/.test(message))
        return `Credenciais recusadas (${message})`;
    if (/HTTP 404/.test(message))
        return `Endpoint ou modelo não encontrado (${message})`;
    if (/HTTP 5\d\d/.test(message))
        return `Gateway com erro (${message})`;
    if (/timed? ?out|Timeout/i.test(message))
        return 'Tempo esgotado';
    return message;
}

function writeClipboard(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
}

function readClipboard() {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            3,
            () => {
                if (!settled) {
                    settled = true;
                    reject(new Error('Tempo esgotado ao ler o clipboard'));
                }
                return GLib.SOURCE_REMOVE;
            }
        );

        try {
            St.Clipboard.get_default().get_text(
                St.ClipboardType.CLIPBOARD,
                (_clipboard, text) => {
                    if (settled)
                        return;
                    settled = true;
                    GLib.source_remove(timer);
                    resolve(text ?? '');
                }
            );
        } catch (error) {
            if (!settled) {
                settled = true;
                GLib.source_remove(timer);
                reject(error);
            }
        }
    });
}

/**
 * Orchestrates the user-defined shortcuts. It never creates GTK widgets (see
 * ADR-0009) and never lets an exception escape into the shell's key handler.
 */
export function createActions({ settings }) {
    let destroyed = false;
    let busy = false;
    let activeCancellable = null;
    let livePanel = null;
    let lastStatus = '';
    let commandBar = null;
    let queueBadge = null;

    // The FIFO is a first-class, always-visible object: the badge appears as
    // soon as work is queued and updates after every state change, so a
    // backlog of 15 steps is felt instead of discovered by accident.
    function syncQueueBadge({ running = false } = {}) {
        const ui = readUiConfig(settings);
        if (!ui.queueBadge) {
            queueBadge?.close();
            queueBadge = null;
            return;
        }
        if (!queueBadge)
            queueBadge = getQueueBadge();
        try {
            const stack = store.loadStack();
            const fifo = store.loadFifo();
            queueBadge.update({
                text: formatQueueBadge({
                    stackCount: stack.items.length,
                    fifoCount: fifo.items.length,
                    next: fifo.items[0]?.label || fifo.items[0]?.prompt || '',
                    running,
                }),
            });
        } catch (error) {
            // A malformed persisted FIFO must never take down the shell.
            queueBadge.update({ text: '' });
        }
    }

    // Quiet feedback: routine successes go to a transient status chip (and the
    // history log); system notifications fire only per the user's policy
    // (default: errors only). The user always sees *which* operation ran.
    function report(kind, message) {
        if (destroyed)
            return;
        lastStatus = message;
        const ui = readUiConfig(settings);
        if (ui.statusChip)
            createStatusChip({ text: message, seconds: ui.statusSeconds });
        if (shouldNotify(ui.notifyLevel, kind))
            Main.notify('Nexus Clip', message);
    }

    function success(label, detail = '') {
        report('success', formatStatus({ ok: true, label, detail }));
    }

    function fail(message) {
        report('error', formatStatus({ ok: false, label: message }));
    }

    function findShortcut(id) {
        return parseShortcuts(settings.get_string('shortcuts'))
            .find(shortcut => shortcut.id === id) ?? null;
    }

    function hudData() {
        const ui = readUiConfig(settings);
        return {
            stack: store.loadStack(),
            fifo: store.loadFifo(),
            history: store.loadHistory(null, { limit: ui.historyLimit }),
        };
    }

    function openHud(initialTab) {
        showStackView({
            ...hudData(),
            templates: PROMPT_TEMPLATES,
            initialTab,
            lastStatus,
            refresh: hudData,
            onCopied: text => success('Copiado para o sistema', preview(text)),
            onUseAsInput: text => {
                const pushed = store.pushNode(store.loadStack(), text, { kind: 'input' });
                store.saveStack(null, pushed.state);
                syncQueueBadge();
                success('Entrada no Nexus', `pilha ${pushed.state.items.length}`);
            },
            onRemove: (tab, id) => {
                if (tab === 'fifo') {
                    const removed = store.removeNode(store.loadFifo(), id);
                    store.saveFifo(null, removed.state);
                    syncQueueBadge();
                    success('Passo removido da fila', `${removed.state.items.length} restante(s)`);
                } else {
                    const removed = store.removeNode(store.loadStack(), id);
                    store.saveStack(null, removed.state);
                    syncQueueBadge();
                    success('Item removido do Nexus', `pilha ${removed.state.items.length}`);
                }
            },
            onEnqueue: (prompt, label) => {
                const next = store.enqueue(store.loadFifo(), prompt, { label });
                store.saveFifo(null, next);
                syncQueueBadge();
                success('Prompt enfileirado', `fila ${next.items.length}`);
            },
        });
    }

    async function infer({ prompt, input, label }) {
        const cfg = readApiConfig(settings);
        const messages = buildMessages({ system: prompt, user: input });
        const cancellable = new Gio.Cancellable();
        activeCancellable = cancellable;

        if (!cfg.streaming) {
            return await chat({
                endpoint: cfg.endpoint,
                model: cfg.model,
                apiKey: cfg.apiKey,
                messages,
                cancellable,
                timeoutSeconds: cfg.timeoutSeconds,
            });
        }

        const panel = createLivePanel({ title: label });
        livePanel = panel;
        try {
            return await stream({
                endpoint: cfg.endpoint,
                model: cfg.model,
                apiKey: cfg.apiKey,
                messages,
                cancellable,
                timeoutSeconds: cfg.timeoutSeconds,
                onDelta: delta => panel.append(delta),
            });
        } finally {
            panel.close();
            if (livePanel === panel)
                livePanel = null;
        }
    }

    function requirePrompt(shortcut) {
        const prompt = String(shortcut.prompt ?? '').trim();
        if (!prompt) {
            fail(`"${shortcut.label}" está sem prompt — configure em Preferências`);
            return null;
        }
        return prompt;
    }

    async function doPushProcess(shortcut) {
        const prompt = requirePrompt(shortcut);
        if (!prompt)
            return;

        const clipboard = await readClipboard();
        if (!clipboard || !clipboard.trim()) {
            fail('Clipboard do sistema vazio');
            return;
        }

        const text = clipboard.trim();
        let state = store.loadStack();
        const previousTop = store.peek(state);
        let inputNode;

        if (previousTop && previousTop.text === text) {
            // The clipboard already holds the current top (usually the last
            // result): reuse it instead of duplicating the node.
            inputNode = previousTop;
        } else {
            const pushed = store.pushNode(state, text, { kind: 'input' });
            state = pushed.state;
            inputNode = pushed.node;
            store.saveStack(null, state);
        }

        const result = await infer({
            prompt,
            input: inputNode.text,
            label: shortcut.label,
        });
        const output = String(result ?? '').trim();
        if (!output) {
            fail('Resposta vazia');
            return;
        }

        const saved = store.pushResult(state, output, {
            parentId: inputNode.id,
            prompt,
        });
        store.saveStack(null, saved.state);
        // The system clipboard is intentionally NOT touched here: Nexus has its
        // own clipboard (the stack top). Export is an explicit action.
        store.appendHistory(null, {
            id: saved.node.id,
            parentId: inputNode.id,
            text: output,
            ts: Date.now(),
            prompt,
            mode: shortcut.mode,
            label: shortcut.label,
        });
        syncQueueBadge();
        success(shortcut.label, `pilha ${saved.state.items.length}`);
    }

    async function doProcess(shortcut) {
        const prompt = requirePrompt(shortcut);
        if (!prompt)
            return;

        const state = store.loadStack();
        const top = store.peek(state);
        if (!top) {
            fail('Pilha do Nexus vazia — importe algo');
            return;
        }

        const result = await infer({
            prompt,
            input: top.text,
            label: shortcut.label,
        });
        const output = String(result ?? '').trim();
        if (!output) {
            fail('Resposta vazia');
            return;
        }

        const saved = store.pushResult(state, output, {
            parentId: top.id,
            prompt,
        });
        store.saveStack(null, saved.state);
        // Result stays in the Nexus stack; use "Copiar topo" to export.
        store.appendHistory(null, {
            id: saved.node.id,
            parentId: top.id,
            text: output,
            ts: Date.now(),
            prompt,
            mode: shortcut.mode,
            label: shortcut.label,
        });
        syncQueueBadge();
        success(shortcut.label, `pilha ${saved.state.items.length}`);
    }

    function doEnqueue(shortcut) {
        const prompt = requirePrompt(shortcut);
        if (!prompt)
            return;
        const fifo = store.loadFifo();
        const next = store.enqueue(fifo, prompt, { label: shortcut.label });
        store.saveFifo(null, next);
        syncQueueBadge();
        success('Prompt enfileirado', `${shortcut.label} · fila ${next.items.length}`);
    }

    async function doRunNext() {
        const stack = store.loadStack();
        const top = store.peek(stack);
        if (!top) {
            fail('Pilha do Nexus vazia — importe algo');
            return;
        }

        const fifo = store.loadFifo();
        const dequeued = store.dequeue(fifo);
        if (!dequeued.item) {
            fail('Fila vazia — enfileire um prompt');
            return;
        }

        const result = await infer({
            prompt: dequeued.item.prompt,
            input: top.text,
            label: dequeued.item.label ?? 'Fila',
        });
        const output = String(result ?? '').trim();
        if (!output) {
            fail('Resposta vazia — passo mantido na fila');
            return;
        }

        const saved = store.pushResult(stack, output, {
            parentId: top.id,
            prompt: dequeued.item.prompt,
        });
        store.saveStack(null, saved.state);
        // Consume only after success: a failed step can be retried.
        store.saveFifo(null, dequeued.state);
        syncQueueBadge();
        store.appendHistory(null, {
            id: saved.node.id,
            parentId: top.id,
            text: output,
            ts: Date.now(),
            prompt: dequeued.item.prompt,
            mode: 'run-next',
            label: dequeued.item.label ?? 'Fila',
        });

        if (dequeued.state.items.length === 0)
            success('Fila concluída', 'resultado no topo do Nexus');
        else
            success('Passo ok', `fila ${dequeued.state.items.length} · próximo: ${preview(dequeued.state.items[0].prompt, 48)}`);
    }

    async function doDrain() {
        const stack = store.loadStack();
        const top = store.peek(stack);
        if (!top) {
            fail('Pilha do Nexus vazia — importe algo');
            return;
        }

        let fifo = store.loadFifo();
        if (fifo.items.length === 0) {
            fail('Fila vazia — enfileire um prompt');
            return;
        }

        const total = fifo.items.length;
        let state = stack;
        let parent = top;
        let currentText = top.text;
        let steps = 0;

        while (fifo.items.length > 0) {
            const dequeued = store.dequeue(fifo);
            if (!dequeued.item)
                break;

            const result = await infer({
                prompt: dequeued.item.prompt,
                input: currentText,
                label: `Fila ${steps + 1}/${total}`,
            });
            const output = String(result ?? '').trim();
            if (!output) {
                fail(`Resposta vazia no passo ${steps + 1} — fila preservada`);
                return;
            }

            const saved = store.pushResult(state, output, {
                parentId: parent.id,
                prompt: dequeued.item.prompt,
            });
            state = saved.state;
            parent = saved.node;
            currentText = output;
            fifo = dequeued.state;
            steps++;

            store.saveStack(null, state);
            store.saveFifo(null, fifo);
            syncQueueBadge({ running: true });
            store.appendHistory(null, {
                id: saved.node.id,
                parentId: saved.node.parentId,
                text: output,
                ts: Date.now(),
                prompt: dequeued.item.prompt,
                mode: 'drain',
                step: steps,
            });
        }

        success('Fila concluída', `${steps} passo(s) · resultado no topo do Nexus`);
    }

    function doPop() {
        const current = store.loadStack();
        const popped = store.pop(current);
        if (!popped.item) {
            fail('Pilha do Nexus vazia');
            return;
        }
        store.saveStack(null, popped.state);
        syncQueueBadge();
        const top = store.peek(popped.state);
        if (top)
            success('Desfazer', preview(top.text));
        else
            success('Desfazer', 'pilha do Nexus vazia');
    }

    function doCopyTop() {
        const top = store.peek(store.loadStack());
        if (!top) {
            fail('Pilha do Nexus vazia');
            return;
        }
        writeClipboard(top.text);
        success('Copiado para o sistema', preview(top.text));
    }

    async function doImport() {
        const clipboard = await readClipboard();
        if (!clipboard || !clipboard.trim()) {
            fail('Clipboard do sistema vazio');
            return;
        }
        const pushed = store.pushNode(store.loadStack(), clipboard.trim(), { kind: 'input' });
        store.saveStack(null, pushed.state);
        syncQueueBadge();
        success('Importado para o Nexus', `pilha ${pushed.state.items.length}`);
    }

    /** Only text carrying the single magic number may enter the audited path. */
    async function doAuditImport() {
        const clipboard = await readClipboard();
        if (!clipboard) {
            fail('Clipboard do sistema vazio');
            return;
        }

        const audit = auditText(clipboard);
        if (!audit.ok) {
            const reasons = {
                'missing-magic': 'sem o magic number NEXUS-TEXT-1',
                'empty': 'conteúdo vazio após o magic number',
                'too-large': 'acima do limite de 64 KiB',
                'binary': 'binário ou marcador de executável',
                'executable-marker': 'marker executável recusado',
                'control-character': 'caractere de controle recusado',
            };
            fail(`Importação auditada recusada: ${reasons[audit.reason] ?? audit.reason}`);
            return;
        }

        const pushed = store.pushNode(store.loadStack(), audit.text, { kind: 'input' });
        store.saveStack(null, pushed.state);
        syncQueueBadge();
        success('Importado (auditado)', `pilha ${pushed.state.items.length}`);
    }

    /**
     * OPT-IN mirror: the user explicitly asked for "copia seleção para sistema
     * + copia para". This is the only new path that writes the system clipboard.
     */
    async function doMirrorImport() {
        const clipboard = await readClipboard();
        if (!clipboard || !clipboard.trim()) {
            fail('Clipboard do sistema vazio');
            return;
        }

        const text = clipboard.trim();
        const pushed = store.pushNode(store.loadStack(), text, { kind: 'input' });
        store.saveStack(null, pushed.state);
        writeClipboard(text);
        syncQueueBadge();
        success('Espelhado no sistema', `pilha ${pushed.state.items.length}`);
    }

    function doStatus() {
        const stack = store.loadStack();
        const fifo = store.loadFifo();
        const history = store.loadHistory(null, {
            limit: readUiConfig(settings).historyLimit,
        });
        const next = fifo.items[0]?.label || fifo.items[0]?.prompt || '—';
        success(
            'Visão geral',
            `pilha ${stack.items.length} · fila ${fifo.items.length} · ` +
            `histórico ${history.length} · próximo: ${preview(next, 32)}`
        );
    }

    /** CP-04: only UUID/hash/counters leave this function; never source text. */
    function doProvenance(shortcut) {
        const top = store.peek(store.loadStack());
        if (!top) {
            fail('Pilha do Nexus vazia');
            return;
        }

        // The command-bar key has no prompt of its own: bind the UUID to the
        // prompt that produced the item we are recording (local metadata only).
        const prompt = String(top.prompt ?? shortcut?.prompt ?? '');
        const provenance = captureProvenance({
            text: top.text,
            prompt,
            mode: 'provenance',
        });
        const projection = kvProjection(provenance);
        assertNoVibeFlow(projection);

        store.appendHistory(null, {
            id: top.id,
            ts: Date.now(),
            mode: 'provenance',
            origin: top.parentId ?? top.id,
            uuid: projection.uuid,
            hash: projection.hash,
            vector: projection.counts,
        });
        success(
            'Proveniência gravada',
            `${projection.uuid} · ${projection.counts.chars} chars`
        );
    }

    async function execute(shortcut) {
        switch (shortcut.mode) {
        case 'push-process':
            return await doPushProcess(shortcut);
        case 'process':
            return await doProcess(shortcut);
        case 'copy-top':
            return doCopyTop();
        case 'import':
            return await doImport();
        case 'enqueue':
            return doEnqueue(shortcut);
        case 'run-next':
            return await doRunNext();
        case 'drain':
            return await doDrain();
        case 'pop':
            return doPop();
        case 'audit-import':
            return await doAuditImport();
        case 'mirror-import':
            return await doMirrorImport();
        case 'status':
            return doStatus();
        case 'provenance':
            return doProvenance(shortcut);
        default:
            fail(`Ação desconhecida: ${shortcut.mode}`);
            return undefined;
        }
    }

    function runShortcut(shortcut) {
        if (destroyed || !shortcut)
            return;

        if (shortcut.mode === 'show') {
            openHud('stack');
            return;
        }
        if (shortcut.mode === 'history') {
            openHud('history');
            return;
        }

        if (busy) {
            report('info', 'Ocupado — aguarde a operação atual');
            return;
        }
        if (needsPrompt(shortcut.mode) && !String(shortcut.prompt ?? '').trim()) {
            fail(`"${shortcut.label}" está sem prompt — configure em Preferências`);
            return;
        }

        busy = true;
        syncQueueBadge({ running: true });
        Promise.resolve()
            .then(() => execute(shortcut))
            .catch(error => fail(friendlyError(error)))
            .finally(() => {
                busy = false;
                activeCancellable = null;
                if (livePanel) {
                    livePanel.close();
                    livePanel = null;
                }
                syncQueueBadge();
            });
    }

    function runById(id) {
        if (destroyed)
            return;
        const shortcut = findShortcut(id);
        if (shortcut)
            runShortcut(shortcut);
    }

    /**
     * Single-key dispatch behind the Super leader. Configured shortcuts win;
     * unconfigured modes get a safe synthetic entry so the palette always works
     * out of the box (no extra global key grabs).
     */
    function openCommandBar() {
        if (destroyed)
            return;
        if (commandBar) {
            commandBar.close();
            commandBar = null;
        }

        const configured = parseShortcuts(settings.get_string('shortcuts'));
        const commands = COMMAND_KEYS.map(command => ({
            ...command,
            shortcut: configured.find(item => item.mode === command.mode)
                ?? shortcutForCommand(command),
        }));

        commandBar = showCommandBar({
            stack: store.loadStack(),
            fifo: store.loadFifo(),
            commands,
            templates: templateCommands(),
            onCommand: command => {
                commandBar?.close();
                commandBar = null;
                runShortcut(command.shortcut);
            },
            onTemplate: template => {
                commandBar?.close();
                commandBar = null;
                const next = store.enqueue(store.loadFifo(), template.prompt, {
                    label: template.label,
                });
                store.saveFifo(null, next);
                syncQueueBadge();
                success('Prompt enfileirado', `${template.label} · fila ${next.items.length}`);
            },
            onClose: () => {
                commandBar = null;
            },
        });
    }

    function destroy() {
        destroyed = true;
        busy = false;
        if (activeCancellable) {
            try {
                activeCancellable.cancel();
            } catch (_e) {
                // already cancelled
            }
            activeCancellable = null;
        }
        if (livePanel) {
            livePanel.close();
            livePanel = null;
        }
        if (commandBar) {
            commandBar.close();
            commandBar = null;
        }
        if (queueBadge) {
            queueBadge.close();
            queueBadge = null;
        }
        closeAllOverlays();
    }

    syncQueueBadge();

    return {
        runById,
        runShortcut,
        openCommandBar,
        refreshQueueBadge: syncQueueBadge,
        destroy,
    };
}
