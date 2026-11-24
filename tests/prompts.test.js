import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    PROMPT_TEMPLATES,
    searchTemplates,
    templateById,
} from '../extension/lib/prompts.js';

test('every template has a unique id, label and non-empty prompt', () => {
    const ids = new Set();
    for (const template of PROMPT_TEMPLATES) {
        assert.ok(template.id && !ids.has(template.id), `duplicate/empty id ${template.id}`);
        ids.add(template.id);
        assert.ok(template.label.trim());
        assert.ok(template.prompt.trim());
        assert.ok(Array.isArray(template.tags));
    }
});

test('templateById resolves known ids and rejects unknown ones', () => {
    assert.equal(templateById('fix-pt').id, 'fix-pt');
    assert.equal(templateById('nope'), null);
    assert.equal(templateById(''), null);
});

test('searchTemplates matches label, prompt and tags (all words)', () => {
    assert.ok(searchTemplates('traduzir inglês').some(t => t.id === 'translate-en'));
    assert.ok(searchTemplates('código').some(t => t.id === 'explain-code'));
    assert.equal(searchTemplates('zzzz').length, 0);
    assert.equal(searchTemplates('').length, PROMPT_TEMPLATES.length);
});