import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { chat } from './v1client.js';
import { buildMessages } from './v1core.js';
import * as store from './store.js';

// ACTIVE PRESET RULE (explicit assumption):
// `presets` is a JSON OBJECT mapping name -> prompt text; the "active preset"
// is the FIRST key. If absent/empty/invalid, throw (caught by the notify path).
function getActivePreset(settings) {
    let presets;
    try {
        const raw = settings.get_string('presets');
        if (!raw) {
            throw new Error('Nenhum preset configurado');
        }
        presets = JSON.parse(raw);
    } catch (_e) {
        throw new Error('Nenhum preset configurado');
    }
    if (!presets || typeof presets !== 'object' || Array.isArray(presets)) {
        throw new Error('Nenhum preset configurado');
    }
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
                                const result = await chat({
                                    endpoint: settings.get_string('api-endpoint'),
                                    model: settings.get_string('model-name'),
                                    apiKey: settings.get_string('api-key'),
                                    messages,
                                });
                                if (typeof result === 'string' && result.trim()) {
                                    const resultText = result.trim();
                                    clip.set_text(St.ClipboardType.CLIPBOARD, resultText);
                                    store.saveStack(null, nextState);
                                    const newId = Date.now();
                                    store.appendHistory(null, {
                                        id: newId,
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

    function s2Choose() {
        log('S2 TODO');
    }

    function s3Loop() {
        log('S3 TODO');
    }

    return { s1PushProcess, s2Choose, s3Loop };
}
