import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    MAGIC,
    MAX_AUDITED_BYTES,
    auditText,
} from '../extension/lib/text-gate.js';

test('magic number is a single explicit text prefix', () => {
    assert.equal(MAGIC, 'NEXUS-TEXT-1\n');
    assert.ok(MAX_AUDITED_BYTES > 0);
});

test('auditText accepts text carrying the magic number and returns the payload', () => {
    const result = auditText(`${MAGIC}Corrija este parágrafo.`);
    assert.equal(result.ok, true);
    assert.equal(result.text, 'Corrija este parágrafo.');
    assert.equal(result.reason, '');
});

test('auditText rejects text without the magic number', () => {
    const result = auditText('texto sem marcação');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-magic');
    assert.equal(result.text, '');
});

test('auditText rejects binary and executable payloads', () => {
    assert.equal(auditText(`${MAGIC}abc\u0000def`).reason, 'binary');
    assert.equal(auditText(`${MAGIC}#!/bin/sh\necho oi`).reason, 'executable-marker');
    assert.equal(auditText(`${MAGIC}\u007fELF=x`).reason, 'binary');
});

test('auditText enforces the byte ceiling and rejects empty payloads', () => {
    assert.equal(auditText(`${MAGIC}`).reason, 'empty');
    const big = `${MAGIC}${'x'.repeat(MAX_AUDITED_BYTES + 1)}`;
    assert.equal(auditText(big).reason, 'too-large');
});

test('auditText rejects control characters but keeps tabs and newlines', () => {
    assert.equal(auditText(`${MAGIC}linha\u0007`).reason, 'control-character');
    assert.equal(auditText(`${MAGIC}linha 1\n\tlinha 2\r\n`).ok, true);
});
