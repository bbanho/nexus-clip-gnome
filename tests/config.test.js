import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    loadShortcuts,
    readApiConfig,
    readCommandAccel,
    readUiConfig,
    saveCommandAccel,
    shortcutsSignature,
} from '../extension/lib/config.js';

function fakeSettings(initial = {}) {
    const data = { ...initial };
    return {
        data,
        get_string: key => (typeof data[key] === 'string' ? data[key] : ''),
        get_boolean: key => Boolean(data[key]),
        get_int: key => Number(data[key] ?? 0),
        set_string: (key, value) => {
            data[key] = value;
        },
    };
}

test('loadShortcuts migrates presets when the shortcuts key is empty', () => {
    const settings = fakeSettings({
        shortcuts: '',
        presets: JSON.stringify({ fix: 'Corrija.', summarize: 'Resuma.' }),
    });

    const list = loadShortcuts(settings);
    assert.equal(list.length, 4);
    assert.equal(list[0].mode, 'push-process');
    assert.equal(list[1].mode, 'process');
    assert.ok(settings.data.shortcuts.length > 0);
    assert.deepEqual(
        JSON.parse(settings.data.shortcuts).map(item => item.id),
        list.map(item => item.id)
    );
});

test('loadShortcuts keeps an existing shortcut list untouched', () => {
    const existing = JSON.stringify([
        {
            id: 'custom',
            label: 'Meu atalho',
            accel: '<Alt><Super>z',
            mode: 'process',
            prompt: 'Melhore.',
        },
    ]);
    const settings = fakeSettings({ shortcuts: existing, presets: '{}' });

    const list = loadShortcuts(settings);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'custom');
    assert.equal(settings.data.shortcuts, existing);
});

test('loadShortcuts respects an explicitly empty list', () => {
    const settings = fakeSettings({ shortcuts: '[]', presets: '{}' });
    assert.deepEqual(loadShortcuts(settings), []);
    assert.equal(settings.data.shortcuts, '[]');
});

test('shortcutsSignature ignores prompt/label edits', () => {
    const a = [
        { id: 'x', accel: '<Alt><Super>v', mode: 'process', prompt: 'one' },
    ];
    const b = [
        { id: 'x', accel: '<Alt><Super>v', mode: 'process', prompt: 'two' },
    ];
    assert.equal(shortcutsSignature(a), shortcutsSignature(b));
});

test('shortcutsSignature changes when a key changes', () => {
    const a = [{ id: 'x', accel: '<Alt><Super>v' }];
    const b = [{ id: 'x', accel: '<Alt><Super>c' }];
    assert.notEqual(shortcutsSignature(a), shortcutsSignature(b));
});

test('readApiConfig reads endpoint/model/key/stream/timeout', () => {
    const settings = fakeSettings({
        'api-endpoint': 'http://localhost:8010/v1/chat/completions',
        'model-name': 'gemini-2.5-flash',
        'api-key': 'random',
        stream: true,
        'request-timeout': 42,
    });
    assert.deepEqual(readApiConfig(settings), {
        endpoint: 'http://localhost:8010/v1/chat/completions',
        model: 'gemini-2.5-flash',
        apiKey: 'random',
        streaming: true,
        timeoutSeconds: 42,
    });
});

test('readUiConfig reads the feedback policy and history limit', () => {
    const settings = fakeSettings({
        'notify-level': 'all',
        'status-chip': true,
        'status-seconds': 6,
        'history-limit': 50,
        'queue-badge': false,
        'queue-auto': false,
    });
    assert.deepEqual(readUiConfig(settings), {
        notifyLevel: 'all',
        statusChip: true,
        statusSeconds: 6,
        historyLimit: 50,
        queueBadge: false,
        queueAuto: false,
    });
});

test('command leader is normalized on read and on write', () => {
    const settings = fakeSettings({ 'command-accel': '' });
    assert.equal(readCommandAccel(settings), '<Super>semicolon');

    saveCommandAccel(settings, 'v');
    assert.equal(settings.data['command-accel'], '<Super>semicolon');
    assert.equal(readCommandAccel(settings), '<Super>semicolon');
});
