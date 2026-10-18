import { buildPayload, parseCompletion } from './v1core.js';
import { createSseParser, createUtf8Decoder } from './sse.js';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';

function _bodyBytes(payload) {
    return new GLib.Bytes(new TextEncoder().encode(JSON.stringify(payload)));
}

/**
 * Non-streaming chat completion.
 *
 * NOTE: GJS does NOT promisify Soup.Session.send_and_read_async (it requires
 * the callback argument explicitly), so we pass it and bridge to a Promise.
 */
export async function chat({ endpoint, model, apiKey, messages }) {
    const session = new Soup.Session();
    const message = Soup.Message.new('POST', endpoint);
    message.request_headers.append('Content-Type', 'application/json');
    message.request_headers.append('Authorization', 'Bearer ' + apiKey);
    const payload = buildPayload({ model, messages, stream: false });
    message.set_request_body_from_bytes('application/json', _bodyBytes(payload));

    const bytes = await new Promise((resolve, reject) => {
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
            try {
                resolve(sess.send_and_read_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });

    if (message.get_status() !== 200) {
        throw new Error('HTTP ' + message.get_status() + ' ' + message.get_reason_phrase());
    }
    return parseCompletion(new TextDecoder().decode(bytes.get_data()));
}

/**
 * Streaming (SSE) chat completion.
 *
 * libsoup3: `send_finish()` returns the response as a `Gio.InputStream`, which
 * we read incrementally (chunk by chunk) and feed to the SSE parser.
 * (Soup.Session.read_bytes_async / Soup.Message.get_response_body do NOT exist.)
 *
 * IMPORTANT: the gateway keeps the socket open after `data: [DONE]`, so EOF is
 * NOT a reliable terminator. We settle on the SSE `[DONE]` marker (and also on
 * EOF, defensively) and close the stream.
 */
export async function stream({ endpoint, model, apiKey, messages, onDelta, onFinish, onError }) {
    const session = new Soup.Session();
    const message = Soup.Message.new('POST', endpoint);
    message.request_headers.append('Content-Type', 'application/json');
    message.request_headers.append('Authorization', 'Bearer ' + apiKey);
    message.request_headers.append('Accept', 'text/event-stream');
    const payload = buildPayload({ model, messages, stream: true });
    message.set_request_body_from_bytes('application/json', _bodyBytes(payload));

    let finished = false;
    const finishOnce = () => {
        if (finished) return;
        finished = true;
        if (typeof onFinish === 'function') onFinish();
    };

    await new Promise((resolve) => {
        let settled = false;
        let input = null;
        let parser = null;

        const settle = () => {
            if (settled) return;
            settled = true;
            if (input) {
                try { input.close(null); } catch (_e) { /* ignore */ }
            }
            resolve();
        };

        parser = createSseParser({
            onDelta: (d) => { if (typeof onDelta === 'function') onDelta(d); },
            // `[DONE]` is terminal: settle immediately instead of waiting for EOF.
            onDone: () => { finishOnce(); settle(); },
        });

        session.send_async(message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
            try {
                input = sess.send_finish(res);
            } catch (e) {
                if (typeof onError === 'function') onError(e);
                settle();
                return;
            }

            if (message.get_status() !== 200) {
                if (typeof onError === 'function')
                    onError(new Error('HTTP ' + message.get_status()));
                settle();
                return;
            }

            const decoder = createUtf8Decoder();

            const readNext = () => {
                if (settled) return;
                input.read_bytes_async(8192, GLib.PRIORITY_DEFAULT, null, (s, readRes) => {
                    let bytes;
                    try {
                        bytes = s.read_bytes_finish(readRes);
                    } catch (e) {
                        if (!settled && typeof onError === 'function') onError(e);
                        settle();
                        return;
                    }

                    const data = bytes.get_data();
                    if (!data || data.length === 0) {
                        const tail = decoder.flush();
                        if (tail) parser.push(tail);
                        finishOnce();
                        settle();
                        return;
                    }

                    parser.push(decoder.push(data));
                    if (!settled) readNext();
                });
            };

            readNext();
        });
    });
}
