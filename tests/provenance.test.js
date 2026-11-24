import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertNoVibeFlow,
    captureProvenance,
    characteristicVector,
    fingerprint,
    kvProjection,
} from '../extension/lib/provenance.js';

test('fingerprint is deterministic and whitespace-insensitive', () => {
    const a = fingerprint('Corrija   o português\n mantendo o tom.');
    const b = fingerprint('Corrija o português mantendo o tom.');
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.notEqual(a, fingerprint('Texto diferente'));
});

test('characteristicVector contains counters only, never source text', () => {
    const vector = characteristicVector('# Título\n\nlinha um\nlinha dois\n');
    assert.deepEqual(
        Object.keys(vector).sort(),
        ['chars', 'digitRatio', 'fences', 'headings', 'lines', 'words'].sort()
    );
    assert.equal(vector.headings, 1);
    assert.equal(vector.lines, 4);
    assert.equal(vector.words, 5);
    assert.ok(vector.chars > 0);
    assert.ok(vector.digitRatio >= 0 && vector.digitRatio <= 1);
});

test('captureProvenance binds content, prompt and operation into the uuid', () => {
    const base = captureProvenance({
        text: 'algum texto',
        prompt: 'Resuma.',
        mode: 'process',
    });
    assert.match(base.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(base.hash, fingerprint('algum texto'));

    const same = captureProvenance({ text: 'algum  texto', prompt: 'Resuma.', mode: 'process' });
    assert.equal(same.uuid, base.uuid);

    const otherPrompt = captureProvenance({ text: 'algum texto', prompt: 'Corrija.', mode: 'process' });
    const otherMode = captureProvenance({ text: 'algum texto', prompt: 'Resuma.', mode: 'enqueue' });
    assert.notEqual(otherPrompt.uuid, base.uuid);
    assert.notEqual(otherMode.uuid, base.uuid);
});

test('kvProjection carries only uuid, hash and counters', () => {
    const provenance = captureProvenance({
        text: 'segredo do usuario',
        prompt: 'prompt confidencial',
        mode: 'process',
        parentId: 'item_pai',
    });
    const projection = kvProjection(provenance);

    assert.deepEqual(Object.keys(projection).sort(), ['counts', 'hash', 'uuid']);
    assert.doesNotMatch(JSON.stringify(projection), /segredo|confidencial|item_pai/);
    assert.equal(assertNoVibeFlow(projection), true);
});

test('assertNoVibeFlow rejects any free-text payload', () => {
    assert.throws(
        () => assertNoVibeFlow({ uuid: 'x', payload: 'vibe_origem' }),
        /vibe flow/
    );
    assert.throws(
        () => assertNoVibeFlow({ uuid: 'x', text: 'conteudo' }),
        /vibe flow/
    );
});
