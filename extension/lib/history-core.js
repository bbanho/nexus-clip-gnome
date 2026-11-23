// PURE history model — the append-only inference log (`history.jsonl`).
//
// The log is written oldest-first (one JSON object per line). The visual
// history shows newest-first, so parsing reverses the order and keeps only the
// most recent `limit` entries. No gi:// imports, no I/O: `node --test`.

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
    if (!text && !prompt)
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

/** Case-insensitive multi-word search over text, prompt, label and mode. */
export function filterHistory(entries, query) {
    const words = String(query ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0)
        return [...(entries ?? [])];
    return (entries ?? []).filter(entry => {
        const haystack = `${entry.text ?? ''} ${entry.prompt ?? ''} ${entry.label ?? ''} ${entry.mode ?? ''}`.toLowerCase();
        return words.every(word => haystack.includes(word));
    });
}