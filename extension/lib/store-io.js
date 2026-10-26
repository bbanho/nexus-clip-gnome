// Persistence layer shared by the GJS adapter (`store.js`) and the Node adapter
// (`tests/helpers/store-node.js`). The adapter only provides primitive file
// operations, so the serialization rules live in exactly one place.

import {
    emptyState,
    normalizeLoaded,
    serializeState,
} from './store-core.js';

export function createStoreIo(adapter) {
    const {
        dataDir,
        join,
        readText,
        writeText,
        appendText,
        mkdirp,
    } = adapter;

    function resolveDir(dir) {
        return dataDir(dir);
    }

    function loadJson(name, dir) {
        try {
            const raw = readText(join(resolveDir(dir), name));
            return normalizeLoaded(JSON.parse(raw));
        } catch (_e) {
            return emptyState();
        }
    }

    function saveJson(name, dir, state) {
        const baseDir = resolveDir(dir);
        mkdirp(baseDir);
        writeText(join(baseDir, name), JSON.stringify(serializeState(state), null, 2));
        return normalizeLoaded(serializeState(state));
    }

    function loadStack(dir) {
        return loadJson('stack.json', dir);
    }

    function saveStack(dir, state) {
        return saveJson('stack.json', dir, state);
    }

    function loadFifo(dir) {
        return loadJson('fifo.json', dir);
    }

    function saveFifo(dir, state) {
        return saveJson('fifo.json', dir, state);
    }

    function appendHistory(dir, node) {
        const baseDir = resolveDir(dir);
        mkdirp(baseDir);
        appendText(join(baseDir, 'history.jsonl'), JSON.stringify(node) + '\n');
        return true;
    }

    function clearHistory(dir) {
        const baseDir = resolveDir(dir);
        mkdirp(baseDir);
        writeText(join(baseDir, 'history.jsonl'), '');
        return true;
    }

    return {
        dataDir,
        loadStack,
        saveStack,
        loadFifo,
        saveFifo,
        appendHistory,
        clearHistory,
    };
}
