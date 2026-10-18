export function createSseParser({ onDelta, onDone }) {
    if (typeof onDelta !== 'function') {
        onDelta = () => { };
    }
    if (typeof onDone !== 'function') {
        onDone = () => { };
    }

    let buffer = '';

    function normalizeLineEndings(text) {
        return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    function push(text) {
        if (typeof text !== 'string') {
            text = String(text);
        }
        buffer += text;

        // Split by blank line (event separator); keep trailing partial event in buffer.
        let normalized = normalizeLineEndings(buffer);
        const lastBlank = normalized.lastIndexOf('\n\n');
        if (lastBlank === -1) {
            buffer = normalized;
            return;
        }

        const completeSection = normalized.slice(0, lastBlank);
        const remainder = normalized.slice(lastBlank + 2);
        buffer = remainder;

        const events = completeSection.split('\n\n');
        for (let e = 0; e < events.length; e++) {
            const eventText = events[e];
            if (!eventText) {
                continue;
            }
            parseEvent(eventText);
        }
    }

    function parseEvent(eventText) {
        const lines = eventText.split('\n');
        let dataLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) {
                continue;
            }
            if (line.startsWith('data:')) {
                const idx = line.indexOf(':');
                if (idx >= 0) {
                    let value = line.slice(idx + 1);
                    if (value.startsWith(' ')) {
                        value = value.slice(1);
                    }
                    dataLines.push(value);
                } else {
                    dataLines.push('');
                }
            } else {
                // non-data lines (event:, comments) ignored
                continue;
            }
        }
        if (dataLines.length === 0) {
            return;
        }
        const payload = dataLines.join('\n');
        if (payload === '[DONE]') {
            onDone();
            return;
        }
        try {
            const obj = JSON.parse(payload);
            const delta = obj && obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
            if (typeof delta === 'string' && delta.length > 0) {
                onDelta(delta);
            }
        } catch (err) {
            // malformed JSON in a data: line is skipped WITHOUT throwing
            return;
        }
    }

    return { push };
}

/**
 * Incremental UTF-8 decoder that holds back trailing incomplete multibyte
 * sequences between chunks.
 *
 * Needed because GJS's TextDecoder does NOT implement the `{stream: true}`
 * option ("TextDecoder does not implement the 'stream' option"), so we cannot
 * rely on it to carry a partial codepoint across reads.
 *
 * `push(bytesUint8Array)` returns the newly-decodable text; `flush()` returns
 * any remaining buffered bytes decoded (call once at end of stream).
 */
export function createUtf8Decoder() {
    let pending = new Uint8Array(0);
    const dec = new TextDecoder('utf-8');

    return {
        push(bytes) {
            if (!bytes || bytes.length === 0) {
                return '';
            }
            let buf;
            if (pending.length === 0) {
                buf = bytes;
            } else {
                buf = new Uint8Array(pending.length + bytes.length);
                buf.set(pending, 0);
                buf.set(bytes, pending.length);
            }

            // Find the end of the last COMPLETE UTF-8 sequence.
            let cut = buf.length;
            let i = buf.length - 1;
            let cont = 0;
            while (i >= 0 && (buf[i] & 0xC0) === 0x80 && cont < 3) {
                i--;
                cont++;
            }
            if (i >= 0) {
                const b = buf[i];
                let need;
                if ((b & 0x80) === 0x00) need = 1;
                else if ((b & 0xE0) === 0xC0) need = 2;
                else if ((b & 0xF0) === 0xE0) need = 3;
                else if ((b & 0xF8) === 0xF0) need = 4;
                else need = 1; // invalid lead byte -> best effort
                const have = buf.length - i;
                if (have < need) {
                    cut = i;
                }
            }

            const ready = buf.subarray(0, cut);
            pending = cut < buf.length ? buf.slice(cut) : new Uint8Array(0);
            return ready.length ? dec.decode(ready) : '';
        },
        flush() {
            if (pending.length === 0) {
                return '';
            }
            const out = dec.decode(pending);
            pending = new Uint8Array(0);
            return out;
        },
    };
}
