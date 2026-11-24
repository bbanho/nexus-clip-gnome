import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    createSerialQueue,
    createSessionCache,
    fingerprint,
} from '../extension/lib/pipeline.js';

test('fingerprint is deterministic and sensitive to every part', () => {
    assert.equal(fingerprint('alpha', 'beta'), fingerprint('alpha', 'beta'));
    assert.notEqual(fingerprint('alpha', 'beta'), fingerprint('alpha', 'gamma'));
    assert.notEqual(fingerprint('alpha', 'beta'), fingerprint('gamma', 'beta'));
    assert.match(fingerprint('alpha', 'beta'), /^[0-9a-f]{8}$/);
});

test('session cache stores pairs and counts hits and misses', () => {
    const cache = createSessionCache({ token: 'session-1' });
    assert.equal(cache.get('alpha', 'prompt'), null);
    cache.put('alpha', 'prompt', 'result');

    const hit = cache.get('alpha', 'prompt');
    assert.equal(hit.output, 'result');
    assert.equal(hit.hits, 1);
    assert.equal(cache.get('alpha', 'other-prompt'), null);
    assert.deepEqual(cache.stats(), { size: 1, hits: 1, misses: 2 });
});

test('session cache keeps only a digest, never the raw input or prompt', () => {
    const cache = createSessionCache({ token: 'session-1' });
    cache.put('SEGREDO-INPUT', 'SEGREDO-PROMPT', 'result');
    const [entry] = cache.snapshot();

    assert.equal(entry.output, 'result');
    assert.equal(entry.text, undefined);
    assert.equal(entry.prompt, undefined);
    assert.ok(!JSON.stringify(entry).includes('SEGREDO'));
});

test('session cache evicts the least recently used pair', () => {
    const cache = createSessionCache({ limit: 2 });
    cache.put('a', 'p', '1');
    cache.put('b', 'p', '2');
    cache.put('c', 'p', '3');

    assert.equal(cache.stats().size, 2);
    assert.equal(cache.get('a', 'p'), null);
    assert.equal(cache.get('b', 'p').output, '2');
    assert.equal(cache.get('c', 'p').output, '3');
});

test('session cache can be cleared explicitly', () => {
    const cache = createSessionCache();
    cache.put('a', 'p', '1');
    cache.clear();
    assert.deepEqual(cache.stats(), { size: 0, hits: 0, misses: 0 });
});

test('serial queue runs jobs one at a time, in FIFO order', async () => {
    const queue = createSerialQueue();
    const events = [];
    let active = 0;
    let maxActive = 0;

    const job = (id, delay) => async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        events.push(`start${id}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        events.push(`end${id}`);
        active--;
        return id;
    };

    const first = queue.enqueue(job(1, 20));
    const second = queue.enqueue(job(2, 1));
    assert.equal(queue.length(), 2);

    assert.deepEqual(await Promise.all([first, second]), [1, 2]);
    assert.equal(maxActive, 1);
    assert.deepEqual(events, ['start1', 'end1', 'start2', 'end2']);
    assert.equal(queue.length(), 0);
});

test('serial queue rejects a failing job but keeps processing the next', async () => {
    const queue = createSerialQueue();
    const seen = [];

    const failed = queue.enqueue(async () => {
        seen.push('failed');
        throw new Error('boom');
    });
    const ok = queue.enqueue(async () => {
        seen.push('ok');
        return 'ok';
    });

    await assert.rejects(failed, /boom/);
    assert.equal(await ok, 'ok');
    assert.deepEqual(seen, ['failed', 'ok']);
});
