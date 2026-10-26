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
    loadStack,
    push,
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
