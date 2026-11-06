import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    combinePrompts,
    normalizePrompts,
    parsePrompts,
} from '../extension/lib/prompts.js';

test('parsePrompts accepts a saved prompt library and ignores malformed entries', () => {
    assert.deepEqual(parsePrompts(JSON.stringify([
        { id: 'fix', label: 'Revisar', text: 'Corrija.' },
        null,
        { id: '', label: 'Sem texto', text: '  ' },
    ])), [{ id: 'fix', label: 'Revisar', text: 'Corrija.' }]);
    assert.deepEqual(parsePrompts('{invalid'), []);
});

test('normalizePrompts trims fields and makes duplicate ids unique', () => {
    assert.deepEqual(normalizePrompts([
        { id: 'same', label: ' Um ', text: ' A ' },
        { id: 'same', label: 'Dois', text: 'B' },
    ]), [
        { id: 'same', label: 'Um', text: 'A' },
        { id: 'same_2', label: 'Dois', text: 'B' },
    ]);
});

test('combinePrompts keeps selected order and separates instruction blocks', () => {
    assert.equal(combinePrompts(['  Preserve o tom. ', '', 'Resuma em tópicos.']),
        'Preserve o tom.\n\nResuma em tópicos.');
});

test('combinePrompts returns an empty string when no prompt has content', () => {
    assert.equal(combinePrompts([' ', null, undefined]), '');
});
