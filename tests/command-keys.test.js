import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    COMMAND_ACCEL_DEFAULT,
    COMMAND_KEYS,
    commandForChar,
    formatCommandHeader,
    formatQueueBadge,
    normalizeCommandAccel,
    shortcutForCommand,
    templateCommands,
} from '../extension/lib/command-keys.js';

test('command leader is a single Super chord with a real key', () => {
    assert.equal(COMMAND_ACCEL_DEFAULT, '<Super>semicolon');
    assert.match(COMMAND_ACCEL_DEFAULT, /^<Super>\S+$/);
});

test('command keys cover every action with a unique mnemonic', () => {
    assert.deepEqual(
        COMMAND_KEYS.map(item => item.key),
        ['c', 'v', 'x', 'q', 'n', 'd', 'z', 'h', 'a', 'm', 's', 'u']
    );
    assert.equal(new Set(COMMAND_KEYS.map(item => item.mode)).size, COMMAND_KEYS.length);
    assert.equal(new Set(COMMAND_KEYS.map(item => item.key)).size, COMMAND_KEYS.length);
});

test('normalizeCommandAccel canonicalizes and rejects unusable values', () => {
    assert.equal(normalizeCommandAccel('<semicolon><Super>'), COMMAND_ACCEL_DEFAULT);
    assert.equal(normalizeCommandAccel('v'), COMMAND_ACCEL_DEFAULT);
    assert.equal(normalizeCommandAccel(''), COMMAND_ACCEL_DEFAULT);
    assert.equal(normalizeCommandAccel('<Alt><Super>'), COMMAND_ACCEL_DEFAULT);
    assert.equal(normalizeCommandAccel('<Super>semicolon'), COMMAND_ACCEL_DEFAULT);
});

test('motor-memory mnemonics map C=collect, V=write, X=move', () => {
    assert.equal(commandForChar('C').item.mode, 'push-process');
    assert.equal(commandForChar('v').item.mode, 'process');
    assert.equal(commandForChar('X').item.mode, 'copy-top');
    // The desktop Ctrl+C/V/X muscle memory is never grabbed by the palette.
    assert.ok(COMMAND_KEYS.every(item => !/<Control>/.test(item.key)));
    assert.match(COMMAND_KEYS.find(item => item.key === 'c').hint, /^C ·/);
    assert.match(COMMAND_KEYS.find(item => item.key === 'v').hint, /^V ·/);
    assert.match(COMMAND_KEYS.find(item => item.key === 'x').hint, /^X ·/);
});

test('commandForChar resolves actions and template digits', () => {
    assert.equal(commandForChar('c').item.mode, 'push-process');
    assert.equal(commandForChar('d').item.mode, 'drain');
    assert.equal(commandForChar('3').item.prompt, templateCommands()[2].prompt);
    assert.equal(commandForChar('9'), null);
    assert.equal(commandForChar(''), null);
});

test('commandForChar resolves the audited import, mirror, status and provenance keys', () => {
    assert.equal(commandForChar('A').item.mode, 'audit-import');
    assert.equal(commandForChar('m').item.mode, 'mirror-import');
    assert.equal(commandForChar('s').item.mode, 'status');
    assert.equal(commandForChar('u').item.mode, 'provenance');

    const mnemonics = new Set(COMMAND_KEYS.map(item => item.key));
    for (const key of ['1', '2', '3', '4', '5'])
        assert.equal(mnemonics.has(key), false, `${key} belongs to templates only`);
});

test('template commands are limited to keys 1-5', () => {
    assert.deepEqual(templateCommands().map(item => item.key), ['1', '2', '3', '4', '5']);
    assert.ok(templateCommands().every(item => item.prompt.trim().length > 0));
});

test('synthetic shortcuts inherit a prompt only for prompt modes', () => {
    const enqueue = shortcutForCommand(COMMAND_KEYS.find(item => item.mode === 'enqueue'));
    assert.ok(enqueue.prompt.length > 0);
    assert.equal(enqueue.id, 'sc_cmd_enqueue');

    const copy = shortcutForCommand(COMMAND_KEYS.find(item => item.mode === 'copy-top'));
    assert.equal(copy.prompt, '');

    // C/V are queue-driven: an empty prompt means "use the next FIFO prompt".
    const collect = shortcutForCommand(COMMAND_KEYS.find(item => item.mode === 'push-process'));
    assert.equal(collect.prompt, '');
});

test('queue badge is hidden when the FIFO is empty', () => {
    assert.equal(formatQueueBadge({ stackCount: 4, fifoCount: 0 }), '');
    assert.equal(formatQueueBadge({}), '');
});

test('queue badge exposes depth, next step and running state', () => {
    const idle = formatQueueBadge({
        stackCount: 7,
        fifoCount: 15,
        next: 'Corrigir português, mantendo o sentido e o tom.',
    });
    assert.match(idle, /FILA 15/);
    assert.match(idle, /PRÓX/);
    assert.match(idle, /…/);
    assert.match(idle, /pilha 7/);

    const running = formatQueueBadge({ fifoCount: 14, next: 'Resumir', running: true });
    assert.match(running, /FILA 14/);
    assert.match(running, /PROCESSANDO/);
    assert.doesNotMatch(running, /PRÓX/);
});

test('queue badge counts the serialized inference pipeline independently', () => {
    const badge = formatQueueBadge({
        stackCount: 3,
        fifoCount: 0,
        pipelineCount: 2,
        next: 'Coletar',
        running: true,
    });
    assert.match(badge, /FILA 0/);
    assert.match(badge, /PIPELINE 2/);
    assert.match(badge, /PROCESSANDO/);
    assert.notEqual(badge, '');
});

test('command header reports both stacks without ambiguity', () => {
    assert.equal(formatCommandHeader({ stackCount: 3, fifoCount: 15 }), 'PILHA 3 · FILA 15');
});
