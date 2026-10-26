// Live smoke test against the Nexus Gateway (requires it on :8010).
//   gjs -m tests/gjs-client-smoke.mjs
//
// Uses static imports on purpose: a top-level `await import()` breaks GJS
// promise-job draining while a GLib.MainLoop is running (see ADR-0002).

import GLib from 'gi://GLib';
import System from 'system';
import { chat, stream } from '../extension/lib/v1client.js';

const endpoint = GLib.getenv('NEXUS_CLIP_ENDPOINT') ??
    'http://localhost:8010/v1/chat/completions';
const model = GLib.getenv('NEXUS_CLIP_MODEL') ?? 'gemini-2.5-flash';
const apiKey = GLib.getenv('NEXUS_CLIP_API_KEY') ?? 'random';
const messages = [{ role: 'user', content: 'responda apenas: ok' }];

const loop = GLib.MainLoop.new(null, false);
let pending = 2;
let failed = false;

function done() {
    pending--;
    if (pending === 0)
        loop.quit();
}

GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 90, () => {
    print('TIMEOUT');
    failed = true;
    loop.quit();
    return GLib.SOURCE_REMOVE;
});

chat({ endpoint, model, apiKey, messages, timeoutSeconds: 60 })
    .then(text => {
        print('chat => ' + JSON.stringify(text));
    })
    .catch(error => {
        failed = true;
        print('chat ERROR => ' + error.message);
    })
    .finally(done);

let accumulated = '';
stream({
    endpoint,
    model,
    apiKey,
    messages,
    timeoutSeconds: 60,
    onDelta: delta => {
        accumulated += delta;
    },
})
    .then(text => {
        print('stream => ' + JSON.stringify(text) + ' acc=' + JSON.stringify(accumulated));
    })
    .catch(error => {
        failed = true;
        print('stream ERROR => ' + error.message);
    })
    .finally(done);

loop.run();

if (failed)
    System.exit(1);
