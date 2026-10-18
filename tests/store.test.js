import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  dataDir,
  loadStack,
  saveStack,
  loadFifo,
  saveFifo,
  push,
  pop,
  peek,
  enqueue,
  dequeue,
  peekFifo,
  appendHistory,
} from '../extension/lib/store.js';

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-clip-'));
}

test('dataDir respects env var', () => {
  const prev = process.env.NEXUS_CLIP_DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  try {
    process.env.NEXUS_CLIP_DATA_DIR = dir;
    assert.equal(dataDir(), dir);
  } finally {
    if (prev === undefined) delete process.env.NEXUS_CLIP_DATA_DIR;
    else process.env.NEXUS_CLIP_DATA_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dataDir falls back to home path when not set', () => {
  const prev = process.env.NEXUS_CLIP_DATA_DIR;
  try {
    delete process.env.NEXUS_CLIP_DATA_DIR;
    const d = dataDir();
    assert.equal(d, path.join(os.homedir(), '.local/share/nexus-clip-gnome'));
  } finally {
    if (prev !== undefined) process.env.NEXUS_CLIP_DATA_DIR = prev;
  }
});

test('loadStack returns default when missing', () => {
  const tmp = createTmpDir();
  try {
    const s = loadStack(tmp);
    assert.deepEqual(s, { schemaVersion: 1, items: [] });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('LIFO order (push A,B -> pop returns B)', () => {
  const tmp = createTmpDir();
  try {
    let s = loadStack(tmp);
    s = push(s, 'A');
    s = push(s, 'B');
    const { state, item } = pop(s);
    assert.equal(item.text, 'B');
    const top = peek(state);
    assert.equal(top.text, 'A');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('FIFO order (enqueue A,B -> dequeue returns A)', () => {
  const tmp = createTmpDir();
  try {
    let s = loadFifo(tmp);
    s = enqueue(s, 'A');
    s = enqueue(s, 'B');
    const { state, item } = dequeue(s);
    assert.equal(item.prompt, 'A');
    const top = peekFifo(state);
    assert.equal(top.prompt, 'B');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('persistence roundtrip (saveStack then loadStack)', () => {
  const tmp = createTmpDir();
  try {
    let s = { schemaVersion: 1, items: [] };
    s = push(s, 'hello');
    saveStack(tmp, s);
    const loaded = loadStack(tmp);
    assert.equal(loaded.schemaVersion, 1);
    assert.equal(loaded.items.length, 1);
    assert.equal(loaded.items[0].text, 'hello');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('schemaVersion === 1', () => {
  const tmp = createTmpDir();
  try {
    let s = loadStack(tmp);
    assert.equal(s.schemaVersion, 1);
    let f = loadFifo(tmp);
    assert.equal(f.schemaVersion, 1);
    saveStack(tmp, s);
    assert.equal(loadStack(tmp).schemaVersion, 1);
    saveFifo(tmp, f);
    assert.equal(loadFifo(tmp).schemaVersion, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('parentId linkage when pushing a derived node', () => {
  const tmp = createTmpDir();
  try {
    let s = loadStack(tmp);
    s = push(s, 'root');
    const root = peek(s);
    s = push(s, 'derived', root.id);
    const derived = peek(s);
    assert.equal(derived.parentId, root.id);
    assert.equal(derived.text, 'derived');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('appendHistory writes JSONL', () => {
  const tmp = createTmpDir();
  try {
    let s = loadStack(tmp);
    s = push(s, 'x');
    const node = peek(s);
    appendHistory(tmp, node);
    const hist = fs.readFileSync(path.join(tmp, 'history.jsonl'), 'utf8');
    assert.ok(hist.includes(node.text));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
