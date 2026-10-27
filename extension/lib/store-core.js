// PURE state model — LIFO stack + FIFO queue, schemaVersion 1.
//
// No gi:// imports and no I/O: this is exercised by `node --test`.
// The thin persistence adapters are `store.js` (GJS/Gio, used by the shell and
// prefs) and `tests/helpers/store-node.js` (Node fs, used by the tests).

export const SCHEMA_VERSION = 1;
export const DEFAULT_MAX_ITEMS = 200;

export function emptyState() {
    return { schemaVersion: SCHEMA_VERSION, items: [] };
}

export function cloneState(state) {
    return {
        schemaVersion: state?.schemaVersion ?? SCHEMA_VERSION,
        items: Array.isArray(state?.items) ? [...state.items] : [],
        ...(state?.maxItems ? { maxItems: state.maxItems } : {}),
        ...(state?.dedupe !== undefined ? { dedupe: state.dedupe } : {}),
    };
}

export function serializeState(state) {
    const out = {
        schemaVersion: SCHEMA_VERSION,
        items: Array.isArray(state?.items) ? state.items : [],
    };
    if (state?.maxItems)
        out.maxItems = state.maxItems;
    if (state?.dedupe !== undefined)
        out.dedupe = state.dedupe;
    return out;
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Persisted data is user-editable and can be corrupted by old versions or
 * hand edits. The HUD assumes `id`, `parentId` and `kind` have the right
 * types; a single malformed item would otherwise throw inside the compositor.
 * Keep only usable items and repair the metadata we depend on.
 */
function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;

    const id = nonEmptyString(raw.id)?.trim();
    if (!id)
        return null;

    const text = nonEmptyString(raw.text);
    const prompt = nonEmptyString(raw.prompt);
    if (!text && !prompt)
        return null;

    const item = { id };
    if (text !== null) {
        item.parentId = nonEmptyString(raw.parentId)?.trim() ?? null;
        item.text = text;
        item.kind = raw.kind === 'result' ? 'result' : 'input';
    }
    if (prompt !== null)
        item.prompt = prompt;
    const label = nonEmptyString(raw.label)?.trim();
    if (label)
        item.label = label;
    item.ts = Number.isFinite(raw.ts) ? raw.ts : 0;
    return item;
}

export function normalizeLoaded(data) {
    if (!data || data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.items))
        return emptyState();

    const items = data.items.map(normalizeItem).filter(Boolean);
    const maxItems =
        Number.isFinite(data.maxItems) && data.maxItems > 0
            ? Math.floor(data.maxItems)
            : null;
    if (maxItems !== null && items.length > maxItems)
        items.length = maxItems;

    return {
        schemaVersion: SCHEMA_VERSION,
        items,
        ...(maxItems !== null ? { maxItems } : {}),
        ...(typeof data.dedupe === 'boolean' ? { dedupe: data.dedupe } : {}),
    };
}

export function makeId(prefix = 'item') {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

function clamp(next) {
    const maxItems = next.maxItems ?? DEFAULT_MAX_ITEMS;
    if (next.items.length > maxItems)
        next.items.length = maxItems;
    return next;
}

/**
 * Append a node to the LIFO (newest first).
 *
 * Signature stays backward compatible: `push(state, text, parentId)` or
 * `push(state, text, { parentId, kind, prompt, dedupeTop })`.
 * Returns `{ state, node }`; `node` is null when the text was empty or when
 * deduplication kept the current top.
 */
export function pushNode(state, text, options = null) {
    const opts = options && typeof options === 'object' ? options : { parentId: options };
    const next = cloneState(state);
    const trimmed = String(text ?? '').trim();
    if (!trimmed)
        return { state: next, node: null };

    const top = next.items[0] ?? null;
    const dedupeTop = opts.dedupeTop !== false;
    if (dedupeTop && top && top.text === trimmed)
        return { state: next, node: top };

    const node = {
        id: makeId(opts.kind === 'result' ? 'res' : 'item'),
        parentId: opts.parentId ?? null,
        text: trimmed,
        ts: Date.now(),
        kind: opts.kind === 'result' ? 'result' : 'input',
        ...(opts.prompt ? { prompt: String(opts.prompt) } : {}),
    };
    next.items.unshift(node);
    return { state: clamp(next), node };
}

export function push(state, text, options = null) {
    return pushNode(state, text, options).state;
}

/** A model result always becomes a new node (never deduplicated). */
export function pushResult(state, text, { parentId = null, prompt = '' } = {}) {
    return pushNode(state, text, {
        parentId,
        prompt,
        kind: 'result',
        dedupeTop: false,
    });
}

export function pop(state) {
    const next = cloneState(state);
    if (next.items.length === 0)
        return { state: next, item: null };
    const item = next.items.shift();
    return { state: next, item };
}

/** Remove a specific stack item without changing the order of the others. */
export function removeNode(state, id) {
    const next = cloneState(state);
    const index = next.items.findIndex(item => item.id === id);
    if (index < 0)
        return { state: next, item: null };
    const [item] = next.items.splice(index, 1);
    return { state: next, item };
}

export function peek(state) {
    if (!state || !Array.isArray(state.items) || state.items.length === 0)
        return null;
    return state.items[0];
}

export function enqueue(state, prompt, { label = '' } = {}) {
    const next = cloneState(state);
    const p = String(prompt ?? '').trim();
    if (!p)
        return next;
    next.items.push({
        id: makeId('fifo'),
        prompt: p,
        ...(label ? { label: String(label) } : {}),
        ts: Date.now(),
    });
    return next;
}

export function dequeue(state) {
    const next = cloneState(state);
    if (next.items.length === 0)
        return { state: next, item: null };
    const item = next.items.shift();
    return { state: next, item };
}

export function peekFifo(state) {
    if (!state || !Array.isArray(state.items) || state.items.length === 0)
        return null;
    return state.items[0];
}
