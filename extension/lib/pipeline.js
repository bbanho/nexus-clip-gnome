// PURE serial pipeline + ephemeral session cache.
//
// The pipeline is the "queue by nature" layer: inference jobs are serialized
// (one at a time) instead of blocking the shell with a global `busy` flag. The
// cache keeps the `(input, prompt) -> output` pair for the lifetime of the
// process, so a repeated step is a cache hit rather than another network call.
//
// No gi:// imports and no I/O: exercised by `node --test`.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Stable, non-cryptographic fingerprint for cache keys. It is deliberately
 * lossy: the cache never stores the raw input or prompt, only this digest.
 */
export function fingerprint(...parts) {
    let hash = FNV_OFFSET;
    const text = parts.map(part => String(part ?? '')).join('\u0000');
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/**
 * In-memory LRU cache for processed pairs. `token` scopes the cache to one
 * session: a future keyring-backed implementation can rotate it without
 * changing callers. The cache dies with the process (until reboot), as the
 * user asked.
 */
export function createSessionCache({ limit = 128, token = '' } = {}) {
    const entries = new Map();
    let hits = 0;
    let misses = 0;

    function key(text, prompt) {
        return `${token}:${fingerprint(text, prompt)}`;
    }

    function get(text, prompt) {
        const cacheKey = key(text, prompt);
        const entry = entries.get(cacheKey);
        if (!entry) {
            misses++;
            return null;
        }
        hits++;
        entry.hits++;
        entry.lastHit = Date.now();
        // LRU touch: reinsert as the newest entry.
        entries.delete(cacheKey);
        entries.set(cacheKey, entry);
        return entry;
    }

    function put(text, prompt, output, meta = {}) {
        const cacheKey = key(text, prompt);
        entries.delete(cacheKey);
        const entry = {
            key: cacheKey,
            output: String(output ?? ''),
            hits: 0,
            ts: Date.now(),
            ...meta,
        };
        entries.set(cacheKey, entry);
        while (entries.size > limit) {
            const oldest = entries.keys().next().value;
            entries.delete(oldest);
        }
        return entry;
    }

    function snapshot() {
        return [...entries.values()];
    }

    function stats() {
        return { size: entries.size, hits, misses };
    }

    function clear() {
        entries.clear();
        hits = 0;
        misses = 0;
    }

    return { get, put, snapshot, stats, clear, key };
}

/**
 * Serial FIFO of async jobs: the second submission waits for the first one to
 * settle, preserving the order the operator collected the items in. The
 * returned promise settles with the job's own result/rejection.
 */
export function createSerialQueue() {
    const pending = [];
    let running = false;

    function length() {
        return pending.length + (running ? 1 : 0);
    }

    function pump() {
        if (running || pending.length === 0)
            return;
        const next = pending.shift();
        running = true;
        Promise.resolve()
            .then(() => next.job())
            .then(
                value => next.resolve(value),
                error => next.reject(error)
            )
            .finally(() => {
                running = false;
                pump();
            });
    }

    function enqueue(job) {
        return new Promise((resolve, reject) => {
            pending.push({ job, resolve, reject });
            pump();
        });
    }

    return { enqueue, length };
}
