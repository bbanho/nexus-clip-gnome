// Contract tests for the installed artifact: GSettings schema + metadata.
// A mismatch here makes the shell silently fail to register shortcuts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const SCHEMA_PATH =
    'extension/schemas/org.gnome.shell.extensions.nexus-clip.gschema.xml';
const schema = read(SCHEMA_PATH);
const metadata = JSON.parse(read('extension/metadata.json'));

test('schema defines exactly the 12 action slots plus the Super command slot', () => {
    for (let index = 0; index < 12; index++)
        assert.match(schema, new RegExp(`name="hotkey-slot-${index}"`));

    assert.doesNotMatch(schema, /name="hotkey-slot-12"/);
    assert.match(schema, /name="hotkey-command"/);
});

test('schema no longer exposes the legacy S1/S2/S3 hotkeys', () => {
    assert.doesNotMatch(schema, /name="hotkey-(push|choose|loop)"/);
});

test('schema exposes the shortcut model and API keys', () => {
    for (const key of [
        'shortcuts',
        'api-endpoint',
        'model-name',
        'api-key',
        'request-timeout',
        'presets',
        'stream',
        'notify-level',
        'status-chip',
        'status-seconds',
        'history-limit',
        'command-accel',
        'hotkey-command',
        'queue-badge',
    ]) {
        assert.match(schema, new RegExp(`name="${key}"`), `missing key ${key}`);
    }
});

test('metadata targets GNOME 45-51 and the current schema', () => {
    assert.equal(metadata.uuid, 'nexus-clip@bbanho');
    assert.equal(metadata['settings-schema'], 'org.gnome.shell.extensions.nexus-clip');
    assert.equal(metadata.version, 3);

    for (const version of ['45', '46', '47', '48', '49', '50', '51'])
        assert.ok(
            metadata['shell-version'].includes(version),
            `missing shell-version ${version}`
        );
});
