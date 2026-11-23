import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_HISTORY_LIMIT,
    filterHistory,
    normalizeHistoryEntry,
    parseHistory,
} from '../extension/lib/history-core.js';

function jsonl(entries) {
    return entries.map(entry => JSON.stringify(entry)).join('\n');
}

test('parseHistory returns newest-first entries', () => {
    const raw = jsonl([
        { id: 'a', text: 'one', ts: 1 },
        { id: 'b', text: 'two', ts: 2 },
    ]);
    assert.deepEqual(parseHistory(raw).map(entry => entry.id), ['b', 'a']);
});

test('parseHistory keeps only the last `limit` lines', () => {
    const raw = jsonl(
        Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, text: `t${i}`, ts: i }))
    );
    const entries = parseHistory(raw, { limit: 3 });
    assert.deepEqual(entries.map(entry => entry.id), ['e9', 'e8', 'e7']);
});

test('parseHistory skips blank and malformed lines', () => {
    const raw = '\n{bad\n' + JSON.stringify({ id: 'ok', text: 'x' }) + '\n\n';
    const entries = parseHistory(raw);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'ok');
});

test('parseHistory handles empty input and a non-positive limit', () => {
    assert.deepEqual(parseHistory(''), []);
    assert.deepEqual(parseHistory(null), []);
    const raw = jsonl([{ id: 'a', text: 'x' }]);
    assert.equal(parseHistory(raw, { limit: 0 }).length, 1); // falls back to default
});

test('normalizeHistoryEntry drops unusable entries and repairs metadata', () => {
    assert.equal(normalizeHistoryEntry(null), null);
    assert.equal(normalizeHistoryEntry({}), null);
    assert.equal(normalizeHistoryEntry({ id: 'x' }), null); // no text/prompt

    const entry = normalizeHistoryEntry({ id: 'x', text: 'hi', ts: 'bad', label: ' L ' });
    assert.equal(entry.ts, 0);
    assert.equal(entry.label, 'L');

    const promptOnly = normalizeHistoryEntry({ prompt: 'p' });
    assert.equal(promptOnly.prompt, 'p');
    assert.equal(promptOnly.id, '');
});

test('filterHistory matches all words across text/prompt/label/mode', () => {
    const entries = [
        { id: 'a', text: 'Hello world', label: 'fix-pt', mode: 'process' },
        { id: 'b', text: 'Outro texto', prompt: 'Resuma', label: 'summarize' },
    ];
    assert.deepEqual(filterHistory(entries, 'hello').map(e => e.id), ['a']);
    assert.deepEqual(filterHistory(entries, 'resuma summarize').map(e => e.id), ['b']);
    assert.deepEqual(filterHistory(entries, '').map(e => e.id), ['a', 'b']);
    assert.deepEqual(filterHistory(entries, 'zzz'), []);
});

test('parseHistory keeps provenance-only entries without text or prompt', () => {
    const line = JSON.stringify({
        id: 'item_1',
        ts: 123,
        mode: 'provenance',
        uuid: 'aaaaaaaa-bbbb-8ccc-8ddd-eeeeeeeeeeee',
        hash: '0123456789abcdef',
        vector: { chars: 4, lines: 1 },
    });
    const entries = parseHistory(line + '\n');

    assert.equal(entries.length, 1);
    assert.equal(entries[0].uuid, 'aaaaaaaa-bbbb-8ccc-8ddd-eeeeeeeeeeee');
    assert.equal(entries[0].hash, '0123456789abcdef');
    assert.equal(entries[0].vector.chars, 4);
    assert.match(filterHistory(entries, 'provenance').map(e => e.id).join(), /item_1/);
    assert.equal(entries[0].origin, undefined);
});

test('parseHistory preserves a string origin on provenance entries only', () => {
    const line = [
        JSON.stringify({ id: 'a', ts: 1, uuid: 'u1', origin: 'item_pai' }),
        JSON.stringify({ id: 'b', ts: 2, uuid: 'u2', origin: { bad: true } }),
    ].join('\n');
    const entries = parseHistory(line);

    // parseHistory is newest-first, so 'b' is index 0.
    assert.equal(entries.find(e => e.id === 'a').origin, 'item_pai');
    assert.equal(entries.find(e => e.id === 'b').origin, undefined);
});

test('DEFAULT_HISTORY_LIMIT is a sane positive number', () => {
    assert.ok(Number.isFinite(DEFAULT_HISTORY_LIMIT) && DEFAULT_HISTORY_LIMIT > 0);
});