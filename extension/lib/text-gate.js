// PURE gate for the audited text path (ADR-0013).
//
// A single magic number marks text that may enter the audited Nexus flow. The
// gate rejects binary payloads, executable markers and oversized input before
// any inference happens. No gi:// imports and no I/O: `node --test`.

/** The one and only accepted prefix. Anything else is not audited text. */
export const MAGIC = 'NEXUS-TEXT-1\n';

/** Hard ceiling: an audited import must not become a bulk exfiltration path. */
export const MAX_AUDITED_BYTES = 64 * 1024;

const EXECUTABLE_PREFIX = /^(?:#!|\u007fELF|MZ|\xca\xfe\xba\xbe|<\?php)/;
const CONTROL_CHAR = /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/;

/**
 * @returns {{ok: boolean, reason: string, text: string}}
 *   `text` is the payload *after* the magic number, and is empty on rejection.
 */
export function auditText(raw, { magic = MAGIC, maxBytes = MAX_AUDITED_BYTES } = {}) {
    const source = String(raw ?? '');
    if (!source.startsWith(magic))
        return { ok: false, reason: 'missing-magic', text: '' };

    const text = source.slice(magic.length);
    if (!text.trim())
        return { ok: false, reason: 'empty', text: '' };
    if (text.length > maxBytes)
        return { ok: false, reason: 'too-large', text: '' };
    if (text.includes('\u0000') || text.includes('\u007f'))
        return { ok: false, reason: 'binary', text: '' };
    if (EXECUTABLE_PREFIX.test(text))
        return { ok: false, reason: 'executable-marker', text: '' };
    if (CONTROL_CHAR.test(text))
        return { ok: false, reason: 'control-character', text: '' };

    return { ok: true, reason: '', text };
}
