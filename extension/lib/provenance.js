// PURE provenance model for the "capture invariant" command (ADR-0013).
//
// This is a deterministic fingerprint, not a cryptographic signature and not a
// homomorphic commitment. Whitespace-only changes are collapsed so the same
// text keeps the same identity across cosmetic edits. Only UUIDs, hashes and
// counters may leave this module: prompt and source text never enter the KV.

const SEEDS = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
const TOKEN = /[\p{L}\p{N}]+/gu;

function fnv1a(input, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** 128-bit deterministic fingerprint (four independent FNV-1a lanes). */
export function fingerprint(text) {
    const normalized = normalizeText(text);
    return SEEDS.map(seed => fnv1a(normalized, seed).toString(16).padStart(8, '0')).join('');
}

/** Characteristic vector: counters only, so it can be shared safely. */
export function characteristicVector(text) {
    const source = String(text ?? '');
    const lines = source.replace(/\n$/, '').split('\n');
    const digits = (source.match(/[0-9]/g) ?? []).length;
    return {
        chars: source.length,
        lines: lines.length,
        words: (source.match(TOKEN) ?? []).length,
        headings: lines.filter(line => /^\s{0,3}#{1,6}\s/.test(line)).length,
        fences: lines.filter(line => /^\s*```/.test(line)).length,
        digitRatio: source.length ? Number((digits / source.length).toFixed(4)) : 0,
    };
}

/**
 * Bind content + prompt + operation into one addressable identity.
 * `parentId` is accepted for call-site clarity but deliberately not embedded:
 * it is a local item id, not something to leak through the harness.
 */
export function captureProvenance({ text = '', prompt = '', mode = '', parentId = null } = {}) {
    const hash = fingerprint(text);
    const basis = `${hash}|${fingerprint(prompt)}|${fingerprint(mode)}`;
    const hex = fingerprint(basis);
    const uuid = [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `8${hex.slice(13, 16)}`,
        `a${hex.slice(17, 20)}`,
        hex.slice(20, 32),
    ].join('-');

    return { uuid, hash, vector: characteristicVector(text) };
}

/** The only projection allowed to cross the KV/harness boundary. */
export function kvProjection(provenance) {
    const vector = provenance?.vector ?? {};
    return {
        uuid: String(provenance?.uuid ?? ''),
        hash: String(provenance?.hash ?? ''),
        counts: Object.fromEntries(
            Object.entries(vector).filter(([, value]) => Number.isFinite(value))
        ),
    };
}

/**
 * B-03 / CP-19: "proibido_vibe_origem->destino". Fail loudly if a caller tries
 * to attach free text to a shared projection.
 */
export function assertNoVibeFlow(projection) {
    const allowed = new Set(['uuid', 'hash', 'counts']);
    for (const key of Object.keys(projection ?? {})) {
        if (!allowed.has(key))
            throw new Error(`vibe flow: unexpected field "${key}"`);
        if ((key === 'uuid' || key === 'hash') && !/^[0-9a-f-]+$/.test(String(projection[key])))
            throw new Error(`vibe flow: invalid ${key}`);
    }
    const counts = projection?.counts ?? {};
    for (const [key, value] of Object.entries(counts)) {
        if (!Number.isFinite(value))
            throw new Error(`vibe flow: non-numeric counter "${key}"`);
    }
    return true;
}
