import { test } from 'node:test';
import assert from 'node:assert/strict';

import { middlePreview } from '../extension/lib/text-preview.js';

test('middlePreview leaves short text unchanged and flattens whitespace', () => {
    assert.equal(middlePreview('  short\n text  ', 20), 'short text');
});

test('middlePreview preserves the head and tail of long text', () => {
    const result = middlePreview('ABCDEFGHIJKLMN', 9);
    assert.equal(result, 'ABCD…KLMN');
    assert.equal(result.length, 9);
});

test('middlePreview handles tiny limits and empty input', () => {
    assert.equal(middlePreview('abcdef', 1), '…');
    assert.equal(middlePreview('', 10), '');
});
