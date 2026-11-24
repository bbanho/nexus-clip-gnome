import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_HISTORY_LIMIT,
    filterHistory,
    normalizeHistoryEntry,
    parseHistory,
    recentClips,
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

test('filterHistory also matches boundary-safe uuid and hash tokens', () => {
    const entries = [
        { id: 'p', mode: 'provenance', uuid: 'aaaa-bbbb', hash: 'deadbeef' },
        { id: 't', text: 'texto simples' },
    ];
    assert.deepEqual(filterHistory(entries, 'deadbeef').map(e => e.id), ['p']);
    assert.deepEqual(filterHistory(entries, 'aaaa').map(e => e.id), ['p']);
    assert.deepEqual(filterHistory(entries, 'texto').map(e => e.id), ['t']);
});

test('recentClips orders by timestamp, not by file position', () => {
    const entries = [
        { id: 'old-last-line', text: 'a', ts: 10 },
        { id: 'newest', text: 'b', ts: 30 },
        { id: 'middle', text: 'c', ts: 20 },
    ];
    assert.deepEqual(recentClips(entries).map(e => e.id), ['newest', 'middle', 'old-last-line']);
});

test('recentClips collapses identical payloads into one counted row', () => {
    const entries = [
        { id: 'r3', text: 'mesmo texto', ts: 30, label: 'fix' },
        { id: 'r2', text: 'mesmo texto', ts: 20, label: 'fix' },
        { id: 'r1', text: 'mesmo texto', ts: 10, label: 'fix' },
        { id: 'other', text: 'outro', ts: 25 },
    ];
    const rows = recentClips(entries);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'r3');
    assert.equal(rows[0].count, 3);
    assert.equal(rows[0].ts, 30);
    assert.equal(rows[0].label, 'fix');
    assert.equal(rows[1].id, 'other');
});

test('recentClips keeps different prompts with the same text distinct', () => {
    const entries = [
        { id: 'a', text: 'resumo', prompt: 'P1', ts: 2 },
        { id: 'b', text: 'resumo', prompt: 'P2', ts: 1 },
    ];
    const rows = recentClips(entries);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(e => e.id), ['a', 'b']);
});

test('recentClips preserves provenance rows as UUID-only payloads', () => {
    const entries = [{
        id: 'prov',
        ts: 99,
        mode: 'provenance',
        uuid: 'aaaa-bbbb-cccc',
        hash: 'cafe',
        vector: { chars: 1 },
    }];
    const [row] = recentClips(entries);
    assert.equal(row.uuid, 'aaaa-bbbb-cccc');
    assert.equal(row.hash, 'cafe');
    assert.equal(row.text, undefined);
    assert.equal(row.prompt, undefined);
    assert.deepEqual(filterHistory([row], 'cafe').map(e => e.id), ['prov']);
});

test('recentClips never mutates the input array or its entries', () => {
    const entries = [
        { id: 'a', text: 'x', ts: 1 },
        { id: 'b', text: 'x', ts: 2 },
    ];
    const snapshot = JSON.stringify(entries);
    const rows = recentClips(entries);
    rows[0].count = 99;
    assert.equal(JSON.stringify(entries), snapshot);
    assert.equal(entries[0].count, undefined);
});

test('DEFAULT_HISTORY_LIMIT is a sane positive number', () => {
    assert.ok(Number.isFinite(DEFAULT_HISTORY_LIMIT) && DEFAULT_HISTORY_LIMIT > 0);
});