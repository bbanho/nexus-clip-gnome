// GSettings glue shared by the extension and by prefs. No gi:// imports: it
// only needs the `Gio.Settings` object, which makes it testable with a fake.

import {
    migrateFromPresets,
    parseShortcuts,
    registrationList,
} from './shortcuts.js';
import { normalizeCommandAccel } from './command-keys.js';

/**
 * Read the `shortcuts` JSON array. On the first run after an upgrade the key
 * is empty, so migrate the v1 `presets` object into shortcut entries and
 * persist the result (so prefs and the shell see the same list).
 */
export function loadShortcuts(settings) {
    const raw = settings.get_string('shortcuts');
    let list = parseShortcuts(raw);

    // `''` means "never configured" (first run / upgrade) → migrate. An
    // explicit `[]` means the user removed every shortcut, so respect it.
    const explicitlyEmpty = raw.trim() === '[]';
    if (list.length === 0 && !explicitlyEmpty) {
        list = migrateFromPresets(settings.get_string('presets'));
        settings.set_string('shortcuts', JSON.stringify(list));
    }
    return list;
}

export function saveShortcuts(settings, list) {
    settings.set_string('shortcuts', JSON.stringify(list));
}

/** Re-register keybindings only when ids/accelerators actually change. */
export function shortcutsSignature(list) {
    return JSON.stringify(
        registrationList(list).map(shortcut => [shortcut.id, shortcut.accel])
    );
}

export function readApiConfig(settings) {
    return {
        endpoint: settings.get_string('api-endpoint'),
        model: settings.get_string('model-name'),
        apiKey: settings.get_string('api-key'),
        streaming: settings.get_boolean('stream'),
        timeoutSeconds: settings.get_int('request-timeout'),
    };
}

/** UI/feedback settings: notification policy + transient status chip. */
export function readUiConfig(settings) {
    return {
        notifyLevel: settings.get_string('notify-level'),
        statusChip: settings.get_boolean('status-chip'),
        statusSeconds: settings.get_int('status-seconds'),
        historyLimit: settings.get_int('history-limit'),
        queueBadge: settings.get_boolean('queue-badge'),
    };
}

/** The single Super command leader (normalized so a bad edit cannot drop it). */
export function readCommandAccel(settings) {
    return normalizeCommandAccel(settings.get_string('command-accel'));
}

export function saveCommandAccel(settings, accel) {
    settings.set_string('command-accel', normalizeCommandAccel(accel));
}
