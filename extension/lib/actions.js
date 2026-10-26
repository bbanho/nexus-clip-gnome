import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { readApiConfig } from './config.js';
import { createLivePanel, closeAllOverlays, showStackView } from './hud.js';
import { needsPrompt, parseShortcuts } from './shortcuts.js';
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

    function notify(message) {
        if (!destroyed)
            Main.notify('Nexus Clip', message);
    }

    function findShortcut(id) {
        return parseShortcuts(settings.get_string('shortcuts'))
            .find(shortcut => shortcut.id === id) ?? null;
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
            notify(`"${shortcut.label}" está sem prompt — configure em Preferências`);
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
            notify('Clipboard do sistema vazio');
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
            notify('Resposta vazia');
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
        notify(`✓ ${shortcut.label} · topo do Nexus (pilha ${saved.state.items.length})`);
    }

    async function doProcess(shortcut) {
        const prompt = requirePrompt(shortcut);
        if (!prompt)
            return;

        const state = store.loadStack();
        const top = store.peek(state);
        if (!top) {
            notify('Pilha do Nexus vazia — importe algo com "Importar e processar"');
            return;
        }

        const result = await infer({
            prompt,
            input: top.text,
            label: shortcut.label,
        });
        const output = String(result ?? '').trim();
        if (!output) {
            notify('Resposta vazia');
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
        notify(`✓ ${shortcut.label} · topo do Nexus (pilha ${saved.state.items.length})`);
    }

    function doEnqueue(shortcut) {
        const prompt = requirePrompt(shortcut);
        if (!prompt)
            return;
        const fifo = store.loadFifo();
        const next = store.enqueue(fifo, prompt, { label: shortcut.label });
        store.saveFifo(null, next);
        notify(`Fila += ${shortcut.label} (${next.items.length})`);
    }

    async function doRunNext() {
        const stack = store.loadStack();
        const top = store.peek(stack);
        if (!top) {
            notify('Pilha do Nexus vazia — importe algo com "Importar e processar"');
            return;
        }

        const fifo = store.loadFifo();
        const dequeued = store.dequeue(fifo);
        if (!dequeued.item) {
            notify('Fila vazia — enfileire um prompt');
            return;
        }

        const result = await infer({
            prompt: dequeued.item.prompt,
            input: top.text,
            label: dequeued.item.label ?? 'Fila',
        });
        const output = String(result ?? '').trim();
        if (!output) {
            notify('Resposta vazia — passo mantido na fila');
            return;
        }

        const saved = store.pushResult(stack, output, {
            parentId: top.id,
            prompt: dequeued.item.prompt,
        });
        store.saveStack(null, saved.state);
        // Consume only after success: a failed step can be retried.
        store.saveFifo(null, dequeued.state);
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
            notify('Fila concluída — resultado no topo do Nexus');
        else
            notify(`Passo ok · próximo: ${preview(dequeued.state.items[0].prompt, 48)}`);
    }

    async function doDrain() {
        const stack = store.loadStack();
        const top = store.peek(stack);
        if (!top) {
            notify('Pilha do Nexus vazia — importe algo com "Importar e processar"');
            return;
        }

        let fifo = store.loadFifo();
        if (fifo.items.length === 0) {
            notify('Fila vazia — enfileire um prompt');
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
                notify(`Resposta vazia no passo ${steps + 1} — fila preservada`);
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

        notify(`Fila concluída (${steps} passo(s)) — resultado no topo do Nexus`);
    }

    function doPop() {
        const current = store.loadStack();
        const popped = store.pop(current);
        if (!popped.item) {
            notify('Pilha do Nexus vazia');
            return;
        }
        store.saveStack(null, popped.state);
        const top = store.peek(popped.state);
        if (top)
            notify(`Voltou ao item anterior: ${preview(top.text)}`);
        else
            notify('Último item descartado — pilha do Nexus vazia');
    }

    function doCopyTop() {
        const top = store.peek(store.loadStack());
        if (!top) {
            notify('Pilha do Nexus vazia');
            return;
        }
        writeClipboard(top.text);
        notify(`Topo do Nexus copiado para o sistema · ${preview(top.text)}`);
    }

    async function execute(shortcut) {
        switch (shortcut.mode) {
        case 'push-process':
            return await doPushProcess(shortcut);
        case 'process':
            return await doProcess(shortcut);
        case 'copy-top':
            return doCopyTop();
        case 'enqueue':
            return doEnqueue(shortcut);
        case 'run-next':
            return await doRunNext();
        case 'drain':
            return await doDrain();
        case 'pop':
            return doPop();
        default:
            notify(`Ação desconhecida: ${shortcut.mode}`);
            return undefined;
        }
    }

    function runById(id) {
        if (destroyed)
            return;

        const shortcut = findShortcut(id);
        if (!shortcut)
            return;

        if (shortcut.mode === 'show') {
            showStackView({
                stack: store.loadStack(),
                fifo: store.loadFifo(),
            });
            return;
        }

        if (busy) {
            notify('Ocupado — aguarde a operação atual');
            return;
        }
        if (needsPrompt(shortcut.mode) && !String(shortcut.prompt ?? '').trim()) {
            notify(`"${shortcut.label}" está sem prompt — configure em Preferências`);
            return;
        }

        busy = true;
        Promise.resolve()
            .then(() => execute(shortcut))
            .catch(error => notify(`Erro: ${friendlyError(error)}`))
            .finally(() => {
                busy = false;
                activeCancellable = null;
                if (livePanel) {
                    livePanel.close();
                    livePanel = null;
                }
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
        closeAllOverlays();
    }

    return { runById, destroy };
}
