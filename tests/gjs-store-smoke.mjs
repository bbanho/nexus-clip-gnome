// GJS smoke test for the Gio persistence adapter (runs outside the shell).
//   gjs -m tests/gjs-store-smoke.mjs

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as store from '../extension/lib/store.js';

function assert(condition, message) {
    if (!condition)
        throw new Error('ASSERT: ' + message);
}

const dir = GLib.dir_make_tmp('nexus-clip-gjs-XXXXXX');

try {
    assert(store.loadStack(dir).items.length === 0, 'missing stack is empty');

    let stack = store.push(store.emptyState(), 'A');
    stack = store.push(stack, 'B');
    store.saveStack(dir, stack);

    const loaded = store.loadStack(dir);
    assert(loaded.items.length === 2, 'two items persisted');
    assert(loaded.items[0].text === 'B', 'LIFO top is B');

    const top = store.peek(loaded);
    assert(top && top.id, 'peek returns a node');

    const saved = store.pushResult(loaded, 'B corrigido', {
        parentId: top.id,
        prompt: 'fix',
    });
    store.saveStack(dir, saved.state);

    const after = store.loadStack(dir);
    assert(after.items.length === 3, 'result pushed');
    assert(after.items[0].kind === 'result', 'result kind');
    assert(after.items[0].parentId === top.id, 'result parentId');

    store.saveFifo(dir, store.enqueue(store.emptyState(), 'resuma', { label: 'sum' }));
    const fifo = store.loadFifo(dir);
    assert(fifo.items.length === 1 && fifo.items[0].prompt === 'resuma', 'fifo');

    store.appendHistory(dir, { id: 'h1', text: 'x' });
    store.appendHistory(dir, { id: 'h2', text: 'y' });
    const historyPath = GLib.build_filenamev([dir, 'history.jsonl']);
    const [historyOk, historyBytes] = GLib.file_get_contents(historyPath);
    assert(historyOk, 'history readable');
    assert(
        new TextDecoder().decode(historyBytes).trim().split('\n').length === 2,
        'two history lines'
    );

    store.clearHistory(dir);
    const [clearedOk, clearedBytes] = GLib.file_get_contents(historyPath);
    assert(clearedOk && clearedBytes.length === 0, 'history cleared');

    print('GJS store adapter OK (' + dir + ')');
} finally {
    try {
        Gio.Subprocess.new(['rm', '-rf', dir], Gio.SubprocessFlags.NONE);
    } catch (_e) {
        // best effort
    }
}
