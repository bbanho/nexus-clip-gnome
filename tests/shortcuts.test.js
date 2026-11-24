import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    MAX_SHORTCUTS,
    canonicalAccel,
    defaultShortcuts,
    isValidAccel,
    migrateFromPresets,
    needsPrompt,
    parseShortcuts,
    promptFromQueue,
    registrationList,
    requiresPrompt,
    validateShortcuts,
} from '../extension/lib/shortcuts.js';
import { COMMAND_KEYS } from '../extension/lib/command-keys.js';

test('canonicalAccel matches GTK modifier ordering', () => {
    assert.equal(canonicalAccel('<Super><Alt>v'), '<Alt><Super>v');
    assert.equal(
        canonicalAccel('<Ctrl><Shift><Alt><Super>x'),
        '<Shift><Control><Alt><Super>x'
    );
    assert.equal(canonicalAccel('<Primary>v'), '<Control>v');
    assert.equal(canonicalAccel('  <Super>Page_Up  '), '<Super>Page_Up');
    assert.equal(canonicalAccel(''), '');
});

test('isValidAccel requires an actual key after the modifiers', () => {
    assert.equal(isValidAccel('<Alt><Super>v'), true);
    assert.equal(isValidAccel('<Super>Page_Up'), true);
    assert.equal(isValidAccel('F9'), true);
    assert.equal(isValidAccel('<Alt><Super>'), false);
    assert.equal(isValidAccel('<Alt>'), false);
    assert.equal(isValidAccel('   '), false);
    assert.equal(isValidAccel(''), false);
    assert.equal(isValidAccel('<Alt><Super>a b'), false);
    assert.equal(isValidAccel('<Alt><Super><'), false);
});

test('parseShortcuts tolerates invalid input', () => {
    assert.deepEqual(parseShortcuts(''), []);
    assert.deepEqual(parseShortcuts('{not json'), []);
    assert.deepEqual(parseShortcuts('{"a":1}'), []);
    assert.deepEqual(parseShortcuts('[1, null, "x"]'), []);
});

test('parseShortcuts sanitizes entries and canonicalizes accelerators', () => {
    const [shortcut] = parseShortcuts(
        JSON.stringify([{ accel: '<Super><Alt>v', prompt: 'p' }])
    );
    assert.equal(shortcut.accel, '<Alt><Super>v');
    assert.equal(shortcut.mode, 'push-process');
    assert.equal(shortcut.label, 'Atalho 1');
    assert.equal(shortcut.prompt, 'p');
    assert.ok(shortcut.id.startsWith('sc_auto_'));
});

test('parseShortcuts generates deterministic ids for missing ids', () => {
    const raw = JSON.stringify([{ accel: '<Super><Alt>v' }]);
    assert.equal(parseShortcuts(raw)[0].id, parseShortcuts(raw)[0].id);
});

test('parseShortcuts de-duplicates ids and caps the list', () => {
    const raw = JSON.stringify([
        { id: 'same', accel: '<Alt><Super>a' },
        { id: 'same', accel: '<Alt><Super>b' },
    ]);
    const list = parseShortcuts(raw);
    assert.notEqual(list[0].id, list[1].id);

    const many = Array.from({ length: MAX_SHORTCUTS + 5 }, (_, index) => ({
        id: `s${index}`,
        accel: `<Alt><Super>${String.fromCharCode(97 + (index % 20))}`,
    }));
    assert.equal(parseShortcuts(JSON.stringify(many)).length, MAX_SHORTCUTS);
});

test('registrationList drops empty, duplicate, and malformed accelerators', () => {
    const list = [
        { id: 'a', accel: '' },
        { id: 'a2', accel: '<Alt><Super>' },
        { id: 'b', accel: '<Alt><Super>v' },
        { id: 'c', accel: '<Alt><Super>v' },
        { id: 'd', accel: '<Alt><Super>c' },
    ];
    assert.deepEqual(
        registrationList(list).map(item => item.id),
        ['b', 'd']
    );
});

test('validateShortcuts reports duplicates and empty mandatory prompts', () => {
    const list = [
        { id: 'a', accel: '<Alt><Super>v', mode: 'process', prompt: 'p' },
        { id: 'b', accel: '<Alt><Super>v', mode: 'process', prompt: 'p' },
        { id: 'c', accel: '<Alt><Super>q', mode: 'enqueue', prompt: '   ' },
        { id: 'd', accel: '', mode: 'copy-top', prompt: '' },
    ];
    const { errors, warnings } = validateShortcuts(list);

    assert.ok(errors.some(item => item.index === 1 && item.field === 'accel'));
    assert.ok(errors.some(item => item.index === 2 && item.field === 'prompt'));
    assert.ok(warnings.some(item => item.index === 3 && item.field === 'accel'));
});

test('process and push-process may borrow the FIFO prompt; enqueue may not', () => {
    assert.equal(needsPrompt('process'), true);
    assert.equal(requiresPrompt('process'), false);
    assert.equal(promptFromQueue('process'), true);
    assert.equal(requiresPrompt('push-process'), false);
    assert.equal(promptFromQueue('push-process'), true);
    assert.equal(requiresPrompt('enqueue'), true);
    assert.equal(promptFromQueue('enqueue'), false);
    assert.equal(requiresPrompt('import'), false);
});

test('validateShortcuts warns about GNOME-reserved combinations', () => {
    const { warnings } = validateShortcuts([
        { id: 'a', accel: '<Super>v', mode: 'process', prompt: 'p' },
    ]);
    assert.ok(warnings.some(item => /reservada/i.test(item.message)));
});

test('validateShortcuts warns about accelerators without a key', () => {
    const { errors, warnings } = validateShortcuts([
        { id: 'a', accel: '<Alt><Super>', mode: 'process', prompt: 'p' },
    ]);
    assert.equal(errors.length, 0);
    assert.ok(warnings.some(item => /sem tecla|inválid/i.test(item.message)));
});

test('copy-top does not require a prompt', () => {
    const { errors } = validateShortcuts([
        { id: 'a', accel: '<Alt><Super>x', mode: 'copy-top', prompt: '' },
    ]);
    assert.equal(errors.length, 0);
});

test('defaultShortcuts binds the five core actions and leaves the rest unbound', () => {
    const list = defaultShortcuts();
    assert.deepEqual(
        registrationList(list).map(item => [item.mode, item.accel]),
        [
            ['push-process', '<Alt><Super>c'],
            ['process', '<Alt><Super>v'],
            ['copy-top', '<Alt><Super>x'],
            ['history', '<Alt><Super>h'],
            ['pop', '<Alt><Super>z'],
        ]
    );
    // import / enqueue / run-next / drain are available but unbound.
    const unbound = list.filter(item => !item.accel).map(item => item.mode);
    assert.deepEqual(unbound, ['import', 'enqueue', 'run-next', 'drain']);
    assert.ok(list.length <= MAX_SHORTCUTS);
});

test('direct defaults and command bar share the same C/V/X mnemonics', () => {
    const direct = new Map(registrationList(defaultShortcuts()).map(item => [item.mode, item.accel]));
    const bar = new Map(COMMAND_KEYS.map(item => [item.mode, item.key]));
    for (const mode of ['push-process', 'process', 'copy-top']) {
        assert.match(direct.get(mode), /^<Alt><Super>\w$/);
        assert.equal(direct.get(mode).slice(-1), bar.get(mode), `${mode} mnemonic diverged`);
    }
});

test('import and history modes do not require a prompt', () => {
    assert.equal(needsPrompt('import'), false);
    assert.equal(needsPrompt('history'), false);
    const { errors } = validateShortcuts([
        { id: 'a', accel: '<Alt><Super>i', mode: 'import', prompt: '' },
        { id: 'b', accel: '<Alt><Super>h', mode: 'history', prompt: '' },
    ]);
    assert.equal(errors.length, 0);
});

test('migrateFromPresets reuses the first preset and keeps the rest unbound', () => {
    const presets = JSON.stringify({
        fix: 'Corrija.',
        summarize: 'Resuma.',
        explain: 'Explique.',
    });
    const list = migrateFromPresets(presets);

    assert.equal(list.length, 5);
    assert.equal(list[0].mode, 'push-process');
    assert.equal(list[1].mode, 'process');
    assert.equal(list[0].prompt, 'Corrija.');
    assert.equal(list[1].prompt, 'Corrija.');
    assert.deepEqual(
        list.slice(2, 4).map(item => [item.label, item.accel, item.prompt]),
        [
            ['summarize', '', 'Resuma.'],
            ['explain', '', 'Explique.'],
        ]
    );
    assert.equal(list[4].mode, 'copy-top');
    assert.equal(list[4].accel, '');
});

test('migrateFromPresets falls back to defaults', () => {
    assert.deepEqual(migrateFromPresets('{bad'), defaultShortcuts());
    assert.deepEqual(migrateFromPresets('[]'), defaultShortcuts());
    assert.deepEqual(migrateFromPresets('{}'), defaultShortcuts());
});
