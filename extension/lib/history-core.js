// PURE history model — the append-only inference log (`history.jsonl`).
//
// The log is written oldest-first (one JSON object per line). The visual
// history shows newest-first, so parsing reverses the order and keeps only the
// most recent `limit` entries. `recentClips` is a READ-ONLY projection for the
// "Recentes" view: it orders by timestamp and collapses identical payloads into
// a row with a count, without ever rewriting history.jsonl (CP-06: results are
// never deduplicated in storage). No gi:// imports, no I/O: `node --test`.

export const DEFAULT_HISTORY_LIMIT = 200;

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Sanitize one persisted entry. The HUD assumes `id`/`text`/`ts` have usable
 * types; a single malformed line must not throw inside the compositor.
 */
export function normalizeHistoryEntry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const text = nonEmptyString(raw.text);
    const prompt = nonEmptyString(raw.prompt);
    const hasProvenance = Boolean(nonEmptyString(raw.uuid))
        || (raw.vector && typeof raw.vector === 'object' && !Array.isArray(raw.vector));
    if (!text && !prompt && !hasProvenance)
        return null;

    const entry = {
        id: nonEmptyString(raw.id)?.trim() ?? '',
        ts: Number.isFinite(raw.ts) ? raw.ts : 0,
    };
    if (text !== null)
        entry.text = text;
    if (prompt !== null)
        entry.prompt = prompt;
    const parentId = nonEmptyString(raw.parentId)?.trim();
    if (parentId)
        entry.parentId = parentId;
    const label = nonEmptyString(raw.label)?.trim();
    if (label)
        entry.label = label;
    const mode = nonEmptyString(raw.mode)?.trim();
    if (mode)
        entry.mode = mode;
    if (Number.isFinite(raw.step))
        entry.step = raw.step;

    // Provenance-only entries carry an addressable UUID and a counter vector
    // instead of source text (CP-19). Never preserve free-text fields here.
    if (hasProvenance) {
        const uuid = nonEmptyString(raw.uuid)?.trim();
        const hash = nonEmptyString(raw.hash)?.trim();
        if (uuid)
            entry.uuid = uuid;
        if (hash)
            entry.hash = hash;
        if (raw.vector && typeof raw.vector === 'object' && !Array.isArray(raw.vector))
            entry.vector = Object.fromEntries(
                Object.entries(raw.vector).filter(([, value]) => Number.isFinite(value))
            );
        const origin = nonEmptyString(raw.origin)?.trim();
        if (origin)
            entry.origin = origin;
    }
    return entry;
}

/**
 * Parse JSONL text into newest-first entries. Only the last `limit` non-empty
 * lines are parsed, so a huge log never blows up the HUD.
 */
export function parseHistory(raw, { limit = DEFAULT_HISTORY_LIMIT } = {}) {
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_HISTORY_LIMIT;
    const lines = String(raw ?? '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
    const tail = lines.slice(-max);

    const entries = [];
    for (let i = tail.length - 1; i >= 0; i--) {
        let data;
        try {
            data = JSON.parse(tail[i]);
        } catch (_e) {
            continue;
        }
        const entry = normalizeHistoryEntry(data);
        if (entry)
            entries.push(entry);
    }
    return entries;
}

/**
 * Case-insensitive multi-word search over text, prompt, label, mode and the
 * boundary-safe tokens (uuid/hash). Numeric vectors are deliberately excluded.
 */
export function filterHistory(entries, query) {
    const words = String(query ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0)
        return [...(entries ?? [])];
    return (entries ?? []).filter(entry => {
        const haystack = [
            entry.text ?? '',
            entry.prompt ?? '',
            entry.label ?? '',
            entry.mode ?? '',
            entry.uuid ?? '',
            entry.hash ?? '',
        ].join(' ').toLowerCase();
        return words.every(word => haystack.includes(word));
    });
}

/**
 * "Recentes" projection: newest `ts` first, ties keep the incoming newest-first
 * order. Identical payloads collapse into ONE row carrying `count`, so repeated
 * inference results are visible as repetition instead of flooding the list like
 * browser history. The source array and its entries are never mutated.
 *
 * Cost: O(n log n) for the timestamp sort (comparison sort); grouping via Map is
 * O(n). This is the honest n log n — unlike "iterate until one hypothetical
 * element", there is a real reduction order here.
 */
export function recentClips(entries) {
    const decorated = (entries ?? []).map((entry, index) => ({ entry, index }));
    decorated.sort((a, b) => {
        const ta = Number.isFinite(a.entry.ts) ? a.entry.ts : 0;
        const tb = Number.isFinite(b.entry.ts) ? b.entry.ts : 0;
        return ta === tb ? a.index - b.index : tb - ta;
    });

    const seen = new Map();
    const out = [];
    for (const { entry } of decorated) {
        // Exact payload identity, not a hash: two different prompts producing
        // the same text stay distinct; provenance rows group by UUID only.
        const key = JSON.stringify([
            entry.text ?? null,
            entry.prompt ?? null,
            entry.uuid ?? null,
        ]);
        if (seen.has(key)) {
            seen.get(key).count += 1;
            continue;
        }
        const group = {
            id: entry.id ?? '',
            ts: Number.isFinite(entry.ts) ? entry.ts : 0,
            count: 1,
        };
        for (const field of ['text', 'prompt', 'label', 'mode', 'uuid', 'hash']) {
            if (entry[field] !== undefined)
                group[field] = entry[field];
        }
        seen.set(key, group);
        out.push(group);
    }
    return out;
}