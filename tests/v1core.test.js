import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, buildPayload, parseCompletion } from '../extension/lib/v1core.js';

test('buildMessages with system', () => {
  const messages = buildMessages({ system: 'sys', user: 'hi' });
  assert.deepEqual(messages, [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hi' },
  ]);
});

test('buildMessages without system', () => {
  const messages = buildMessages({ system: '', user: 'hi' });
  assert.deepEqual(messages, [{ role: 'user', content: 'hi' }]);
});

test('buildPayload includes stream:false', () => {
  const payload = buildPayload({ model: 'm', messages: [], stream: false });
  assert.equal(payload.stream, false);
});

test('parseCompletion with valid object', () => {
  const input = { choices: [{ message: { content: 'hello' } }] };
  assert.equal(parseCompletion(input), 'hello');
});

test('parseCompletion with JSON string', () => {
  const input = JSON.stringify({ choices: [{ message: { content: 'world' } }] });
  assert.equal(parseCompletion(input), 'world');
});

test('parseCompletion throws on missing choices', () => {
  assert.throws(() => parseCompletion({}), /choices/);
});
