import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    appendHistory,
    clearHistory,
    dataDir,
    emptyState,
    loadFifo,
    loadHistory,
    loadStack,
    push,
    removeNode,
    saveFifo,
    saveStack,
} from './helpers/store-node.js';

function tmpDir(prefix = 'nexus-clip-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('dataDir respects NEXUS_CLIP_DATA_DIR', () => {
    const previous = process.env.NEXUS_CLIP_DATA_DIR;
    const dir = tmpDir('dc-');
    try {
        process.env.NEXUS_CLIP_DATA_DIR = dir;
        assert.equal(dataDir(), dir);
    } finally {
        if (previous === undefined)
            delete process.env.NEXUS_CLIP_DATA_DIR;
        else
            process.env.NEXUS_CLIP_DATA_DIR = previous;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('missing stack file loads as an empty state', () => {
    const dir = tmpDir();
    try {
        assert.deepEqual(loadStack(dir), emptyState());
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('corrupt stack JSON loads as an empty state', () => {
    const dir = tmpDir();
    try {
        fs.writeFileSync(path.join(dir, 'stack.json'), '{not json', 'utf8');
        assert.deepEqual(loadStack(dir), emptyState());
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('saveStack/loadStack round-trips the LIFO state', () => {
    const dir = tmpDir();
    try {
        let state = emptyState();
        state = push(state, 'A');
        state = push(state, 'B');
        saveStack(dir, state);

        const loaded = loadStack(dir);
        assert.equal(loaded.items.length, 2);
        assert.equal(loaded.items[0].text, 'B');
        assert.equal(loaded.items[1].text, 'A');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('saveFifo/loadFifo round-trips the queue', () => {
    const dir = tmpDir();
    try {
        const fifo = {
            schemaVersion: 1,
            items: [{ id: 'f1', prompt: 'p1', ts: 1 }],
        };
        saveFifo(dir, fifo);
        assert.deepEqual(loadFifo(dir).items, fifo.items);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('appendHistory appends one JSON object per line and clearHistory empties it', () => {
    const dir = tmpDir();
    try {
        appendHistory(dir, { id: 'a', text: 'one' });
        appendHistory(dir, { id: 'b', text: 'two' });

        const lines = fs
            .readFileSync(path.join(dir, 'history.jsonl'), 'utf8')
            .trim()
            .split('\n');
        assert.equal(lines.length, 2);
        assert.deepEqual(JSON.parse(lines[0]), { id: 'a', text: 'one' });

        clearHistory(dir);
        assert.equal(fs.readFileSync(path.join(dir, 'history.jsonl'), 'utf8'), '');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('loadHistory returns newest-first entries and honors the limit', () => {
    const dir = tmpDir();
    try {
        appendHistory(dir, { id: 'a', text: 'one', ts: 1 });
        appendHistory(dir, { id: 'b', text: 'two', ts: 2 });
        appendHistory(dir, { id: 'c', text: 'three', ts: 3 });

        const all = loadHistory(dir);
        assert.deepEqual(all.map(entry => entry.id), ['c', 'b', 'a']);

        const limited = loadHistory(dir, { limit: 2 });
        assert.deepEqual(limited.map(entry => entry.id), ['c', 'b']);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('loadHistory tolerates a missing or corrupt log', () => {
    const dir = tmpDir();
    try {
        assert.deepEqual(loadHistory(dir), []);
        fs.writeFileSync(path.join(dir, 'history.jsonl'), '{bad\n{"id":"ok","text":"x"}\n', 'utf8');
        const entries = loadHistory(dir);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].id, 'ok');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('removeNode deletes a single item by id and leaves the rest intact', () => {
    let state = emptyState();
    state = push(state, 'A');
    state = push(state, 'B');
    const targetId = state.items[1].id; // 'A'

    const removed = removeNode(state, targetId);
    assert.equal(removed.item.text, 'A');
    assert.deepEqual(removed.state.items.map(item => item.text), ['B']);

    const missing = removeNode(state, 'does-not-exist');
    assert.equal(missing.item, null);
    assert.equal(missing.state.items.length, 2);
});
