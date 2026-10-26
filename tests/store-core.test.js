import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    emptyState,
    enqueue,
    dequeue,
    normalizeLoaded,
    peek,
    peekFifo,
    pop,
    push,
    pushNode,
    pushResult,
    serializeState,
} from '../extension/lib/store-core.js';

test('emptyState is schemaVersion 1 with no items', () => {
    assert.deepEqual(emptyState(), { schemaVersion: 1, items: [] });
});

test('push is LIFO (newest first) and pop returns the newest', () => {
    let state = emptyState();
    state = push(state, 'A');
    state = push(state, 'B');
    assert.equal(peek(state).text, 'B');
    const first = pop(state);
    assert.equal(first.item.text, 'B');
    assert.equal(peek(first.state).text, 'A');
});

test('push ignores empty text', () => {
    const next = push(emptyState(), '   ');
    assert.equal(next.items.length, 0);
});

test('push deduplicates against the current top only', () => {
    let state = push(emptyState(), 'A');
    state = push(state, 'A');
    assert.equal(state.items.length, 1);

    state = push(state, 'B');
    state = push(state, 'A');
    assert.equal(state.items.length, 3);
    assert.equal(peek(state).text, 'A');
});

test('pushNode returns the reused top when deduped', () => {
    const first = pushNode(emptyState(), 'A');
    const second = pushNode(first.state, 'A');
    assert.equal(second.node.id, first.node.id);
    assert.equal(second.state.items.length, 1);
});

test('pushResult never deduplicates and marks kind/prompt/parent', () => {
    const base = push(emptyState(), 'input');
    const top = peek(base);
    const saved = pushResult(base, 'input', {
        parentId: top.id,
        prompt: 'fix it',
    });

    assert.equal(saved.state.items.length, 2);
    assert.equal(saved.node.kind, 'result');
    assert.equal(saved.node.parentId, top.id);
    assert.equal(saved.node.prompt, 'fix it');
    assert.equal(peek(saved.state).id, saved.node.id);
});

test('input nodes carry kind=input and no prompt', () => {
    const saved = pushNode(emptyState(), 'hello');
    assert.equal(saved.node.kind, 'input');
    assert.equal(saved.node.parentId, null);
    assert.equal('prompt' in saved.node, false);
});

test('maxItems clamps the stack from the oldest side', () => {
    let state = { schemaVersion: 1, items: [], maxItems: 2 };
    state = push(state, 'A');
    state = push(state, 'B');
    state = push(state, 'C');
    assert.deepEqual(state.items.map(item => item.text), ['C', 'B']);
});

test('pop on an empty stack returns null', () => {
    const result = pop(emptyState());
    assert.equal(result.item, null);
    assert.equal(result.state.items.length, 0);
});

test('enqueue/dequeue is FIFO', () => {
    let fifo = emptyState();
    fifo = enqueue(fifo, 'first');
    fifo = enqueue(fifo, 'second');
    assert.equal(peekFifo(fifo).prompt, 'first');

    const first = dequeue(fifo);
    assert.equal(first.item.prompt, 'first');
    assert.equal(peekFifo(first.state).prompt, 'second');
});

test('enqueue ignores an empty prompt', () => {
    const fifo = enqueue(emptyState(), '  ');
    assert.equal(fifo.items.length, 0);
});

test('normalizeLoaded rejects unknown schemas and malformed items', () => {
    assert.deepEqual(normalizeLoaded(null), emptyState());
    assert.deepEqual(normalizeLoaded({ schemaVersion: 2, items: [] }), emptyState());
    assert.deepEqual(normalizeLoaded({ schemaVersion: 1, items: {} }), emptyState());
});

test('normalizeLoaded keeps only usable items with valid ids and content', () => {
    const state = normalizeLoaded({
        schemaVersion: 1,
        items: [
            {
                id: 'res_1',
                parentId: 'item_1',
                text: 'ok',
                kind: 'result',
                prompt: 'fix it',
                ts: 123,
            },
            { id: 'item_2', prompt: 'queued' },
            { id: '', text: 'no id' },
            { id: 'item_3', text: '   ' },
            { id: 'item_4', text: 42 },
            null,
            'not-an-object',
        ],
    });

    assert.deepEqual(state.items.map(item => item.id), ['res_1', 'item_2']);
    assert.equal(state.items[0].kind, 'result');
    assert.equal(state.items[0].parentId, 'item_1');
    assert.equal(state.items[0].prompt, 'fix it');
    assert.equal(state.items[1].prompt, 'queued');
});

test('normalizeLoaded repairs malformed item metadata instead of crashing the HUD', () => {
    const state = normalizeLoaded({
        schemaVersion: 1,
        items: [
            {
                id: 'item_1',
                text: 'ok',
                kind: 'unexpected',
                parentId: 7,
                ts: 'yesterday',
            },
        ],
    });

    assert.equal(state.items[0].kind, 'input');
    assert.equal(state.items[0].parentId, null);
    assert.equal(state.items[0].ts, 0);
});

test('normalizeLoaded clamps to maxItems and preserves the setting', () => {
    const state = normalizeLoaded({
        schemaVersion: 1,
        maxItems: 2,
        items: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
            { id: 'c', text: 'C' },
        ],
    });

    assert.deepEqual(state.items.map(item => item.id), ['a', 'b']);
    assert.equal(state.maxItems, 2);
});

test('serializeState keeps only the persisted fields', () => {
    const serialized = serializeState({
        schemaVersion: 1,
        items: [{ id: 'x', text: 'y' }],
        maxItems: 10,
        dedupe: false,
        transient: true,
    });
    assert.deepEqual(serialized, {
        schemaVersion: 1,
        items: [{ id: 'x', text: 'y' }],
        maxItems: 10,
        dedupe: false,
    });
});
