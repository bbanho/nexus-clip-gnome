import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';

import { buildPayload, parseCompletion } from './v1core.js';
import { createSseParser, createUtf8Decoder } from './sse.js';

function bodyBytes(payload) {
    return new GLib.Bytes(new TextEncoder().encode(JSON.stringify(payload)));
}

function createSession(timeoutSeconds) {
    const session = new Soup.Session();
    if (timeoutSeconds > 0)
        session.timeout = timeoutSeconds;
    return session;
}

function statusText(message) {
    return `HTTP ${message.get_status()} ${message.get_reason_phrase() ?? ''}`.trim();
}

function errorPreview(text) {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length > 240 ? flat.slice(0, 240) + '…' : flat;
}

/**
 * Non-streaming chat completion.
 *
 * GJS does not promisify `Soup.Session.send_and_read_async`, so the callback is
 * passed explicitly and bridged to a Promise. `sender.read()` in GJS may not
 * implement `Gio.Cancellable`, hence the null fallback.
 */
export async function chat({
    endpoint,
    model,
    apiKey,
    messages,
    cancellable = null,
    timeoutSeconds = 0,
}) {
    const session = createSession(timeoutSeconds);
    const message = Soup.Message.new('POST', endpoint);
    message.request_headers.append('Content-Type', 'application/json');
    message.request_headers.append('Authorization', 'Bearer ' + apiKey);
    const payload = buildPayload({ model, messages, stream: false });
    message.set_request_body_from_bytes('application/json', bodyBytes(payload));

    const bytes = await new Promise((resolve, reject) => {
        session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (sender, result) => {
                try {
                    resolve(sender.send_and_read_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });

    const text = new TextDecoder().decode(bytes.get_data());
    if (message.get_status() !== 200) {
        const detail = errorPreview(text);
        throw new Error(`${statusText(message)}${detail ? ` — ${detail}` : ''}`);
    }
    return parseCompletion(text);
}

/**
 * Streaming (SSE) chat completion.
 *
 * libsoup3: `send_finish()` returns a `Gio.InputStream` read incrementally.
 * The gateway keeps the socket open after `data: [DONE]`, so `[DONE]` (not
 * EOF) is the terminator — see ADR-0003.
 *
 * Resolves with the accumulated text; rejects on HTTP/cancellation errors.
 */
export async function stream({
    endpoint,
    model,
    apiKey,
    messages,
    onDelta,
    onFinish,
    onError,
    cancellable = null,
    timeoutSeconds = 0,
}) {
    const session = createSession(timeoutSeconds);
    const message = Soup.Message.new('POST', endpoint);
    message.request_headers.append('Content-Type', 'application/json');
    message.request_headers.append('Authorization', 'Bearer ' + apiKey);
    message.request_headers.append('Accept', 'text/event-stream');
    const payload = buildPayload({ model, messages, stream: true });
    message.set_request_body_from_bytes('application/json', bodyBytes(payload));

    return await new Promise((resolve, reject) => {
        let settled = false;
        let finished = false;
        let input = null;
        let accumulated = '';

        const finishOnce = () => {
            if (finished)
                return;
            finished = true;
            if (typeof onFinish === 'function')
                onFinish();
        };

        const settleOk = () => {
            if (settled)
                return;
            settled = true;
            finishOnce();
            if (input) {
                try {
                    input.close(null);
                } catch (_e) {
                    // already closed
                }
            }
            resolve(accumulated);
        };

        const settleError = error => {
            if (settled)
                return;
            settled = true;
            if (typeof onError === 'function')
                onError(error);
            if (input) {
                try {
                    input.close(null);
                } catch (_e) {
                    // already closed
                }
            }
            reject(error);
        };

        const parser = createSseParser({
            onDelta: delta => {
                accumulated += delta;
                if (typeof onDelta === 'function')
                    onDelta(delta);
            },
            // `[DONE]` is terminal: settle immediately instead of waiting for EOF.
            onDone: () => settleOk(),
        });

        session.send_async(
            message,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (sender, result) => {
                try {
                    input = sender.send_finish(result);
                } catch (error) {
                    settleError(error);
                    return;
                }

                if (message.get_status() !== 200) {
                    settleError(new Error(statusText(message)));
                    return;
                }

                const decoder = createUtf8Decoder();

                const readNext = () => {
                    if (settled)
                        return;
                    input.read_bytes_async(
                        8192,
                        GLib.PRIORITY_DEFAULT,
                        cancellable,
                        (stream, readResult) => {
                            let bytes;
                            try {
                                bytes = stream.read_bytes_finish(readResult);
                            } catch (error) {
                                settleError(error);
                                return;
                            }

                            const data = bytes.get_data();
                            if (!data || data.length === 0) {
                                const tail = decoder.flush();
                                if (tail)
                                    parser.push(tail);
                                settleOk();
                                return;
                            }

                            parser.push(decoder.push(data));
                            if (!settled)
                                readNext();
                        }
                    );
                };

                readNext();
            }
        );
    });
}
