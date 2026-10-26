// Node fs persistence adapter — same surface as `store.js` (GJS/Gio).
// Used by `node --test` and by small CLI helpers; never imported by the shell.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createStoreIo } from '../../extension/lib/store-io.js';

function resolveDataDir(dir) {
    if (dir)
        return dir;
    const envDir = process.env.NEXUS_CLIP_DATA_DIR;
    if (envDir)
        return envDir;
    return path.join(os.homedir(), '.local', 'share', 'nexus-clip-gnome');
}

const io = createStoreIo({
    dataDir: resolveDataDir,
    join: path.join,
    readText: filePath => fs.readFileSync(filePath, 'utf8'),
    writeText: (filePath, data) => fs.writeFileSync(filePath, data, 'utf8'),
    appendText: (filePath, data) => fs.appendFileSync(filePath, data, 'utf8'),
    mkdirp: dir => fs.mkdirSync(dir, { recursive: true }),
});

export const dataDir = dir => resolveDataDir(dir);
export const loadStack = dir => io.loadStack(dir);
export const saveStack = (dir, state) => io.saveStack(dir, state);
export const loadFifo = dir => io.loadFifo(dir);
export const saveFifo = (dir, state) => io.saveFifo(dir, state);
export const appendHistory = (dir, node) => io.appendHistory(dir, node);
export const clearHistory = dir => io.clearHistory(dir);

export {
    DEFAULT_MAX_ITEMS,
    SCHEMA_VERSION,
    cloneState,
    dequeue,
    emptyState,
    enqueue,
    makeId,
    normalizeLoaded,
    peek,
    peekFifo,
    pop,
    push,
    pushNode,
    pushResult,
    serializeState,
} from '../../extension/lib/store-core.js';
