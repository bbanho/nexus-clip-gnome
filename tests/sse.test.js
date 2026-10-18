import { test } from 'node:test';
import assert from 'node:assert';
import { createSseParser, createUtf8Decoder } from '../extension/lib/sse.js';

test('event split between chunks', () => {
    const deltas = [];
    let done = false;
    const parser = createSseParser({
        onDelta: (d) => { deltas.push(d); },
        onDone: () => { done = true; },
    });
    // First chunk has partial event
    parser.push('data: {"choices":[{"delta":{"content":"he"}}]}\n');
    assert.deepStrictEqual(deltas, []);
    // Second chunk completes it
    parser.push('\ndata: {"choices":[{"delta":{"content":"llo"}}]}\n\n');
    assert.deepStrictEqual(deltas, ['he', 'llo']);
    assert.strictEqual(done, false);
});

test('multiple events in one chunk', () => {
    const deltas = [];
    let done = false;
    const parser = createSseParser({
        onDelta: (d) => { deltas.push(d); },
        onDone: () => { done = true; },
    });
    const chunk = 'data: {"choices":[{"delta":{"content":"a"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"b"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"c"}}]}\n\n';
    parser.push(chunk);
    assert.deepStrictEqual(deltas, ['a', 'b', 'c']);
    assert.strictEqual(done, false);
});

test('CRLF line endings', () => {
    const deltas = [];
    let done = false;
    const parser = createSseParser({
        onDelta: (d) => { deltas.push(d); },
        onDone: () => { done = true; },
    });
    // CRLF separated
    parser.push('data: {"choices":[{"delta":{"content":"x"}}]}\r\n\r\n');
    assert.deepStrictEqual(deltas, ['x']);
    assert.strictEqual(done, false);
});

test('[DONE] triggers onDone', () => {
    const deltas = [];
    let done = false;
    const parser = createSseParser({
        onDelta: (d) => { deltas.push(d); },
        onDone: () => { done = true; },
    });
    parser.push('data: [DONE]\n\n');
    assert.deepStrictEqual(deltas, []);
    assert.strictEqual(done, true);
});

test('non-data lines ignored', () => {
    const deltas = [];
    let done = false;
    const parser = createSseParser({
        onDelta: (d) => { deltas.push(d); },
        onDone: () => { done = true; },
    });
    parser.push('event: ping\n');
    parser.push('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');
    assert.deepStrictEqual(deltas, ['hi']);
    assert.strictEqual(done, false);
});

test('malformed JSON skipped (no throw)', () => {
    const deltas = [];
    let done = false;
    const parser = createSseParser({
        onDelta: (d) => { deltas.push(d); },
        onDone: () => { done = true; },
    });
    assert.doesNotThrow(() => {
        parser.push('data: {not valid json\n\n');
        parser.push('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
    });
    assert.deepStrictEqual(deltas, ['ok']);
    assert.strictEqual(done, false);
});

test('utf8 decoder reassembles multibyte split byte-by-byte', () => {
    const dec = createUtf8Decoder();
    const text = 'ação — português ✓ 日本語';
    const bytes = new TextEncoder().encode(text);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += dec.push(bytes.subarray(i, i + 1));
    }
    out += dec.flush();
    assert.strictEqual(out, text);
});

test('utf8 decoder passes ascii through immediately', () => {
    const dec = createUtf8Decoder();
    assert.strictEqual(dec.push(new TextEncoder().encode('data: hi\n\n')), 'data: hi\n\n');
    assert.strictEqual(dec.flush(), '');
});

test('utf8 decoder holds incomplete trailing sequence', () => {
    const dec = createUtf8Decoder();
    const bytes = new TextEncoder().encode('é'); // 0xC3 0xA9
    assert.strictEqual(dec.push(bytes.subarray(0, 1)), ''); // only lead byte
    assert.strictEqual(dec.push(bytes.subarray(1, 2)), 'é'); // continuation completes it
});

test('utf8 decoder + sse parser end to end across chunk boundary', () => {
    const deltas = [];
    const parser = createSseParser({ onDelta: (d) => { deltas.push(d); }, onDone: () => {} });
    const dec = createUtf8Decoder();
    const events = 'data: {"choices":[{"delta":{"content":"Olá ç"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"ão"}}]}\n\n' +
        'data: [DONE]\n\n';
    const bytes = new TextEncoder().encode(events);
    // feed one byte at a time (splits multibyte chars and event boundaries)
    for (let i = 0; i < bytes.length; i++) {
        parser.push(dec.push(bytes.subarray(i, i + 1)));
    }
    parser.push(dec.flush());
    assert.deepStrictEqual(deltas, ['Olá ç', 'ão']);
});
