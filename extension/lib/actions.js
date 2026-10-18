import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { chat, stream } from './v1client.js';
import { buildMessages } from './v1core.js';
import { openSelector } from './selector.js';
import * as store from './store.js';

// PRESETS RULE (explicit assumption):
// `presets` is a JSON OBJECT mapping name -> prompt text; the "active preset"
// is the FIRST key. If absent/empty/invalid, presets is {}.
function parsePresets(settings) {
    let presets;
    try {
        const raw = settings.get_string('presets');
        presets = JSON.parse(raw);
    } catch (_e) {
        return {};
    }
    if (!presets || typeof presets !== 'object' || Array.isArray(presets)) {
        return {};
    }
    return presets;
}

function getActivePreset(settings) {
    const presets = parsePresets(settings);
    const keys = Object.keys(presets);
    if (keys.length === 0) {
        throw new Error('Nenhum preset configurado');
    }
    const name = keys[0];
    const prompt = presets[name];
    if (typeof prompt !== 'string') {
        throw new Error('Nenhum preset configurado');
    }
    return { name, prompt };
}

function readSettings(settings) {
    return {
        endpoint: settings.get_string('api-endpoint'),
        model: settings.get_string('model-name'),
        apiKey: settings.get_string('api-key'),
        streaming: settings.get_boolean('stream'),
    };
}

function currentItem() {
    const state = store.loadStack();
    return store.peek(state);
}

function writeClipboard(text) {
    const clip = St.Clipboard.get_default();
    clip.set_text(St.ClipboardType.CLIPBOARD, text);
}

export function createActions({ settings }) {
    async function s1PushProcess() {
        try {
            const clip = St.Clipboard.get_default();
            clip.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
                if (!text || !text.trim()) {
                    Main.notify('Nexus Clip', 'Clipboard vazio');
                    return;
                }
                const trimmed = text.trim();
                const state = store.loadStack();
                const nextState = store.push(state, trimmed);
                const pushedNode = store.peek(nextState);
                if (!pushedNode || !pushedNode.id) {
                    Main.notify('Nexus Clip', 'Erro: push failed');
                    return;
                }
                try {
                    const preset = getActivePreset(settings);
                    const messages = buildMessages({ system: preset.prompt, user: trimmed });
                    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                        (async () => {
                            try {
                                const cfg = readSettings(settings);
                                const result = await chat({
                                    endpoint: cfg.endpoint,
                                    model: cfg.model,
                                    apiKey: cfg.apiKey,
                                    messages,
                                });
                                if (typeof result === 'string' && result.trim()) {
                                    const resultText = result.trim();
                                    clip.set_text(St.ClipboardType.CLIPBOARD, resultText);
                                    store.saveStack(null, nextState);
                                    store.appendHistory(null, {
                                        id: Date.now(),
                                        parentId: pushedNode.id,
                                        text: resultText,
                                        ts: Date.now(),
                                    });
                                    Main.notify('Nexus Clip', 'S1 ok');
                                } else {
                                    Main.notify('Nexus Clip', 'Erro: resposta vazia');
                                }
                            } catch (e) {
                                Main.notify('Nexus Clip', 'Erro: ' + e.message);
                            }
                        })();
                        return GLib.SOURCE_REMOVE;
                    });
                } catch (e) {
                    Main.notify('Nexus Clip', 'Erro: ' + e.message);
                }
            });
        } catch (e) {
            Main.notify('Nexus Clip', 'Erro: ' + e.message);
        }
    }

    // S2: run inference on the current item (active preset), show it live in a
    // GTK window, and let the user pick a prompt that is enqueued onto the FIFO.
    async function s2Choose() {
        try {
            const item = currentItem();
            if (!item || !item.text) {
                Main.notify('Nexus Clip', 'Pilha vazia: use S1 primeiro');
                return;
            }

            let preset;
            try {
                preset = getActivePreset(settings);
            } catch (e) {
                Main.notify('Nexus Clip', e.message);
                return;
            }

            const cfg = readSettings(settings);
            const messages = buildMessages({ system: preset.prompt, user: item.text });
            const presets = parsePresets(settings);

            let selectWindow = null;
            selectWindow = openSelector({
                presets,
                withResponse: true,
                onChoose: (name, text) => {
                    const fifo = store.loadFifo();
                    const next = store.enqueue(fifo, text);
                    store.saveFifo(null, next);
                    Main.notify('Nexus Clip', `FIFO += ${name} (${next.items.length})`);
                },
            });

            const append = (d) => {
                if (!selectWindow) return;
                try {
                    selectWindow.appendResponse(d);
                } catch (_e) { /* window may have been closed */ }
            };
            const setResp = (t) => {
                if (!selectWindow) return;
                try {
                    selectWindow.setResponse(t);
                } catch (_e) { /* window may have been closed */ }
            };

            let resultText = '';
            if (cfg.streaming) {
                resultText = await stream({
                    endpoint: cfg.endpoint,
                    model: cfg.model,
                    apiKey: cfg.apiKey,
                    messages,
                    onDelta: (d) => { resultText += d; append(d); },
                    onError: (e) => Main.notify('Nexus Clip', 'Erro: ' + e.message),
                });
            } else {
                resultText = await chat({
                    endpoint: cfg.endpoint,
                    model: cfg.model,
                    apiKey: cfg.apiKey,
                    messages,
                });
                setResp(resultText);
            }

            if (typeof resultText === 'string' && resultText.trim()) {
                const finalText = resultText.trim();
                // never discard the result without writing it to the clipboard
                writeClipboard(finalText);
                store.appendHistory(null, {
                    id: Date.now(),
                    parentId: item.id,
                    text: finalText,
                    ts: Date.now(),
                });
            } else {
                Main.notify('Nexus Clip', 'Erro: resposta vazia');
            }
        } catch (e) {
            Main.notify('Nexus Clip', 'Erro: ' + e.message);
        }
    }

    // S3: pop ONE prompt off the FIFO, apply it to the current item, write the
    // result to the clipboard (enables manual intermediate paste) and report the
    // next prompt. Must NOT drain the whole FIFO in a single activation.
    async function s3Loop() {
        try {
            const item = currentItem();
            if (!item || !item.text) {
                Main.notify('Nexus Clip', 'Pilha vazia: use S1 primeiro');
                return;
            }

            const fifo = store.loadFifo();
            const { state: nextFifo, item: step } = store.dequeue(fifo);
            if (!step) {
                Main.notify('Nexus Clip', 'FIFO vazia (nada a processar)');
                return;
            }
            // consume exactly one step, persist immediately
            store.saveFifo(null, nextFifo);

            const cfg = readSettings(settings);
            const messages = buildMessages({ system: step.prompt, user: item.text });

            const result = await chat({
                endpoint: cfg.endpoint,
                model: cfg.model,
                apiKey: cfg.apiKey,
                messages,
            });

            if (typeof result !== 'string' || !result.trim()) {
                Main.notify('Nexus Clip', 'Erro: resposta vazia');
                return;
            }
            const resultText = result.trim();
            writeClipboard(resultText);
            store.appendHistory(null, {
                id: Date.now(),
                parentId: item.id,
                text: resultText,
                ts: Date.now(),
                prompt: step.prompt,
            });

            const remaining = nextFifo.items.length;
            if (remaining === 0) {
                Main.notify('Nexus Clip', 'Loop concluído — resultado final no clipboard');
            } else {
                const nextPrompt = String(nextFifo.items[0].prompt || '').slice(0, 40);
                Main.notify('Nexus Clip', `Passo ok. Próximo: ${nextPrompt}`);
            }
        } catch (e) {
            Main.notify('Nexus Clip', 'Erro: ' + e.message);
        }
    }

    return { s1PushProcess, s2Choose, s3Loop };
}
