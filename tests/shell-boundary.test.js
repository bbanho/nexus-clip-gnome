// Static boundary tests for the invariants that are hard to exercise outside the
// shell (CP-01..CP-03 in docs/CRITICAL_POINTS.md).
//
// These are intentionally source-level checks: importing `extension.js` or
// `actions.js` requires GNOME Shell's resource modules and a live compositor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const SHELL_MODULES = [
    'extension/extension.js',
    ...fs
        .readdirSync(path.join(ROOT, 'extension/lib'))
        .filter(name => name.endsWith('.js'))
        .map(name => `extension/lib/${name}`),
];

function functionBody(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `function ${name} not found`);

    // Skip the parameter list: destructured parameters also contain braces.
    const parenStart = source.indexOf('(', start);
    let parenDepth = 0;
    let index = parenStart;
    for (; index < source.length; index++) {
        if (source[index] === '(')
            parenDepth++;
        else if (source[index] === ')') {
            parenDepth--;
            if (parenDepth === 0)
                break;
        }
    }

    const open = source.indexOf('{', index);
    assert.notEqual(open, -1, `function ${name} has no body`);
    let depth = 0;
    for (index = open; index < source.length; index++) {
        if (source[index] === '{')
            depth++;
        else if (source[index] === '}') {
            depth--;
            if (depth === 0)
                return source.slice(open, index + 1);
        }
    }
    throw new Error(`unterminated function ${name}`);
}

test('shell-process modules do not import GTK, Adw, or Node builtins', () => {
    const forbidden = [
        /gi:\/\/Gtk/,
        /gi:\/\/Adw/,
        /from\s+['"]node:/,
        /require\(\s*['"]node:/,
    ];

    for (const file of SHELL_MODULES) {
        const source = read(file);
        for (const pattern of forbidden)
            assert.doesNotMatch(source, pattern, `${file} matches ${pattern}`);
    }
});

test('prefs is the only GTK/Adw consumer', () => {
    const prefs = read('extension/prefs.js');
    assert.match(prefs, /gi:\/\/Gtk/);
    assert.match(prefs, /gi:\/\/Adw/);
});

test('shell-process modules no longer reference the removed GTK selector', () => {
    for (const file of SHELL_MODULES)
        assert.doesNotMatch(read(file), /selector\.js|\bopenSelector\b/);
});

test('inference paths never write the system clipboard', () => {
    const source = read('extension/lib/actions.js');

    for (const name of [
        'doPushProcess',
        'doProcess',
        'doRunNext',
        'doDrain',
        'doPop',
    ]) {
        assert.doesNotMatch(
            functionBody(source, name),
            /writeClipboard\s*\(/,
            `${name} must not write the system clipboard`
        );
    }
});

test('copy-top is the only action-level clipboard export', () => {
    const source = read('extension/lib/actions.js');
    assert.match(functionBody(source, 'doCopyTop'), /writeClipboard\s*\(/);

    // One definition + one call site in doCopyTop.
    assert.equal((source.match(/writeClipboard\s*\(/g) ?? []).length, 2);
});

test('only the HUD viewer exports an item; the live panel does not', () => {
    const hud = read('extension/lib/hud.js');
    assert.match(
        functionBody(hud, 'showStackView'),
        /St\.Clipboard[\s\S]*\.set_text\s*\(/
    );
    assert.doesNotMatch(functionBody(hud, 'createLivePanel'), /St\.Clipboard/);
});
