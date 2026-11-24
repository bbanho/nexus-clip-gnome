import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_NOTIFY_LEVEL,
    formatStatus,
    normalizeNotifyLevel,
    shouldNotify,
} from '../extension/lib/notify-policy.js';

test('normalizeNotifyLevel falls back to the default for unknown values', () => {
    assert.equal(normalizeNotifyLevel('all'), 'all');
    assert.equal(normalizeNotifyLevel('silent'), 'silent');
    assert.equal(normalizeNotifyLevel('errors'), 'errors');
    assert.equal(normalizeNotifyLevel('bogus'), DEFAULT_NOTIFY_LEVEL);
    assert.equal(normalizeNotifyLevel(''), DEFAULT_NOTIFY_LEVEL);
});

test('default policy notifies only errors', () => {
    assert.equal(shouldNotify('errors', 'error'), true);
    assert.equal(shouldNotify('errors', 'success'), false);
    assert.equal(shouldNotify('errors', 'info'), false);
});

test('all notifies everything; silent notifies nothing', () => {
    for (const kind of ['success', 'error', 'info']) {
        assert.equal(shouldNotify('all', kind), true);
        assert.equal(shouldNotify('silent', kind), false);
    }
});

test('formatStatus builds a single-line operation summary', () => {
    assert.equal(formatStatus({ label: 'Processar topo', detail: 'pilha 3' }), '✓ Processar topo · pilha 3');
    assert.equal(formatStatus({ ok: false, label: 'Gateway offline' }), '✗ Gateway offline');
    assert.equal(formatStatus({ label: 'Copiar' }), '✓ Copiar');
});