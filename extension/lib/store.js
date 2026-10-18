import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function dataDir(dir) {
  if (dir) return dir;
  const envDir = process.env.NEXUS_CLIP_DATA_DIR;
  if (envDir) return envDir;
  return path.join(os.homedir(), '.local/share/nexus-clip-gnome');
}

function ensureDirSync(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function cloneState(state) {
  return {
    schemaVersion: state.schemaVersion ?? 1,
    items: Array.isArray(state.items) ? [...state.items] : [],
    ...(state.maxItems ? { maxItems: state.maxItems } : {}),
    ...(state.dedupe !== undefined ? { dedupe: state.dedupe } : {}),
  };
}

function makeId() {
  return `item_${Date.now()}_${Math.floor(Math.random() * 1000000000)}`;
}

export function loadStack(dir) {
  const filePath = path.join(dataDir(dir), 'stack.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.items)) {
      return { schemaVersion: 1, items: [] };
    }
    return cloneState(data);
  } catch (_e) {
    return { schemaVersion: 1, items: [] };
  }
}

export function saveStack(dir, state) {
  const baseDir = dataDir(dir);
  ensureDirSync(baseDir);
  const filePath = path.join(baseDir, 'stack.json');
  const toWrite = {
    schemaVersion: 1,
    items: Array.isArray(state.items) ? state.items : [],
    ...(state.maxItems ? { maxItems: state.maxItems } : {}),
    ...(state.dedupe !== undefined ? { dedupe: state.dedupe } : {}),
  };
  fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2), 'utf8');
  return cloneState(toWrite);
}

export function loadFifo(dir) {
  const filePath = path.join(dataDir(dir), 'fifo.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.items)) {
      return { schemaVersion: 1, items: [] };
    }
    return cloneState(data);
  } catch (_e) {
    return { schemaVersion: 1, items: [] };
  }
}

export function saveFifo(dir, state) {
  const baseDir = dataDir(dir);
  ensureDirSync(baseDir);
  const filePath = path.join(baseDir, 'fifo.json');
  const toWrite = {
    schemaVersion: 1,
    items: Array.isArray(state.items) ? state.items : [],
    ...(state.maxItems ? { maxItems: state.maxItems } : {}),
    ...(state.dedupe !== undefined ? { dedupe: state.dedupe } : {}),
  };
  fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2), 'utf8');
  return cloneState(toWrite);
}

export function push(state, text, parentId = null) {
  const next = cloneState(state);
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return next;

  const dedupe = next.dedupe !== false;
  if (dedupe && next.items.length > 0) {
    const top = next.items[0];
    if (top && top.text === trimmed) {
      return next;
    }
  }

  const node = {
    id: makeId(),
    parentId: parentId || null,
    text: trimmed,
    ts: Date.now(),
  };
  next.items.unshift(node);
  const maxItems = next.maxItems ?? 200;
  if (next.items.length > maxItems) {
    next.items.length = maxItems;
  }
  return next;
}

export function pop(state) {
  const next = cloneState(state);
  if (next.items.length === 0) return { state: next, item: null };
  const item = next.items.shift();
  return { state: next, item };
}

export function peek(state) {
  if (!state || !Array.isArray(state.items) || state.items.length === 0) return null;
  return state.items[0];
}

export function enqueue(state, prompt) {
  const next = cloneState(state);
  const p = String(prompt ?? '').trim();
  const node = {
    id: makeId(),
    prompt: p,
    ts: Date.now(),
  };
  next.items.push(node);
  return next;
}

export function dequeue(state) {
  const next = cloneState(state);
  if (next.items.length === 0) return { state: next, item: null };
  const item = next.items.shift();
  return { state: next, item };
}

export function peekFifo(state) {
  if (!state || !Array.isArray(state.items) || state.items.length === 0) return null;
  return state.items[0];
}

export function appendHistory(dir, node) {
  const baseDir = dataDir(dir);
  ensureDirSync(baseDir);
  const filePath = path.join(baseDir, 'history.jsonl');
  const line = JSON.stringify(node) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');
  return true;
}
