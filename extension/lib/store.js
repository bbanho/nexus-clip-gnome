// GJS/Gio persistence adapter used by the shell extension and by prefs.
// Pure state semantics live in `store-core.js`; serialization lives in
// `store-io.js`.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { createStoreIo } from './store-io.js';

function pathJoin(...parts) {
    return GLib.build_filenamev(parts);
}

function mkdirp(dir) {
    GLib.mkdir_with_parents(dir, 0o755);
}

function readText(filePath) {
    const [ok, bytes] = GLib.file_get_contents(filePath);
    if (!ok)
        throw new Error(`Cannot read: ${filePath}`);
    return new TextDecoder().decode(bytes);
}

function writeText(filePath, data) {
    if (!GLib.file_set_contents(filePath, data))
        throw new Error(`Cannot write: ${filePath}`);
}

function appendText(filePath, data) {
    const file = Gio.File.new_for_path(filePath);
    const stream = file.append_to(Gio.FileCreateFlags.NONE, null);
    const bytes = new TextEncoder().encode(data);
    stream.write_all(bytes, null);
    stream.close(null);
}

function resolveDataDir(dir) {
    if (dir)
        return dir;
    const envDir = GLib.getenv('NEXUS_CLIP_DATA_DIR');
    if (envDir)
        return envDir;
    return pathJoin(GLib.get_home_dir(), '.local', 'share', 'nexus-clip-gnome');
}

const io = createStoreIo({
    dataDir: resolveDataDir,
    join: pathJoin,
    readText,
    writeText,
    appendText,
    mkdirp,
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
    removeNode,
    serializeState,
} from './store-core.js';
