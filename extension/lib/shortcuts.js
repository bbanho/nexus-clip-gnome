// PURE config model for user-defined shortcuts.
//
// A shortcut is `{ id, label, accel, mode, prompt }`. The list is stored as a
// JSON array in GSettings (`shortcuts`). Everything in this module runs under
// Node (`node --test`) — no gi:// imports, no I/O.

export const MAX_SHORTCUTS = 12;

export const MODES = [
    'push-process',
    'process',
    'copy-top',
    'enqueue',
    'run-next',
    'drain',
    'pop',
    'show',
    'import',
    'history',
    'audit-import',
    'mirror-import',
    'status',
    'provenance',
];

export const MODE_LABELS = {
    'push-process': 'Importar do sistema + processar',
    'process': 'Processar topo do Nexus',
    'copy-top': 'Copiar topo do Nexus para o sistema',
    'enqueue': 'Enfileirar prompt',
    'run-next': 'Rodar próximo da fila',
    'drain': 'Rodar fila inteira',
    'pop': 'Desfazer (voltar um item)',
    'show': 'Mostrar pilha e fila',
    'import': 'Importar do sistema (sem processar)',
    'history': 'Abrir histórico visual',
    'audit-import': 'Importar texto com magic number auditado',
    'mirror-import': 'Importar e espelhar no clipboard do sistema',
    'status': 'Visão geral das pilhas',
    'provenance': 'Gravar UUID e vetor característico',
};

const MODE_SET = new Set(MODES);
const PROMPT_MODES = new Set(['push-process', 'process', 'enqueue']);

export const DEFAULT_PROMPT =
    'Corrija o português, mantendo o sentido e o tom.';

const MODIFIER_ORDER = ['Shift', 'Control', 'Alt', 'Super', 'Hyper', 'Meta'];
const MODIFIER_ALIASES = {
    shift: 'Shift',
    control: 'Control',
    ctrl: 'Control',
    primary: 'Control',
    alt: 'Alt',
    super: 'Super',
    hyper: 'Hyper',
    meta: 'Meta',
};

// Accelerators already owned by GNOME Shell on a default GNOME 45-51 setup.
// Kept as warnings (the shell wins silently otherwise).
const GNOME_RESERVED = [
    '<Super>v',
    '<Super>m',
    '<Super>a',
    '<Super>s',
    '<Super>n',
    '<Super>Tab',
    '<Super>Up',
    '<Super>Down',
    '<Super>Left',
    '<Super>Right',
    '<Super><Alt>Up',
    '<Super><Alt>Down',
    '<Super><Alt>Left',
    '<Super><Alt>Right',
    '<Control><Alt>Left',
    '<Control><Alt>Right',
].map(canonicalAccel);

export function modeLabel(mode) {
    return MODE_LABELS[mode] ?? mode;
}

export function needsPrompt(mode) {
    return PROMPT_MODES.has(mode);
}

export function makeId(prefix = 'sc') {
    const rand = Math.floor(Math.random() * 1e9).toString(36);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/**
 * Normalize an accelerator into GTK's canonical form so that
 * `<Super><Alt>v` and `<Alt><Super>v` compare equal.
 * GTK orders modifiers as: Shift, Control, Alt, Super, Hyper, Meta.
 */
export function canonicalAccel(accel) {
    let rest = String(accel ?? '').trim();
    if (!rest)
        return '';
    const mods = [];
    const unknown = [];
    for (;;) {
        const match = /^<([^>]+)>/.exec(rest);
        if (!match)
            break;
        const raw = match[1].trim();
        const name = MODIFIER_ALIASES[raw.toLowerCase()] ?? null;
        if (name)
            mods.push(name);
        else
            unknown.push(raw);
        rest = rest.slice(match[0].length);
    }
    const ordered = MODIFIER_ORDER.filter(name => mods.includes(name));
    const tokens = [...ordered, ...unknown];
    return tokens.map(name => `<${name}>`).join('') + rest.trim();
}

/**
 * Structural accelerator validation.
 *
 * GTK requires an actual key after the modifier tokens. `<Alt><Super>` parses
 * as no accelerator and `addKeybinding` silently does nothing, so entries like
 * that must never reach the registration list. This is intentionally
 * conservative: it checks shape, not GTK key names (prefs capture is the
 * authority for those).
 */
export function isValidAccel(accel) {
    const text = String(accel ?? '').trim();
    if (!text)
        return false;
    const key = text.replace(/^(<[^>]+>)+/, '').trim();
    if (!key)
        return false;
    return !/[<>]/.test(key) && !/\s/.test(key);
}

function asString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function autoId(index, accel) {
    const suffix = canonicalAccel(accel).replace(/[^a-zA-Z0-9]+/g, '') || 'none';
    return `sc_auto_${index}_${suffix}`;
}

export function normalizeShortcut(raw, index = 0) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const mode = MODE_SET.has(raw.mode) ? raw.mode : 'push-process';
    const accel = canonicalAccel(asString(raw.accel));
    const id = asString(raw.id).trim() || autoId(index, accel);
    return {
        id,
        label: asString(raw.label).trim() || `Atalho ${index + 1}`,
        accel,
        mode,
        prompt: asString(raw.prompt),
    };
}

export function parseShortcuts(raw) {
    let data;
    try {
        data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_e) {
        return [];
    }
    if (!Array.isArray(data))
        return [];

    const out = [];
    for (let i = 0; i < data.length && out.length < MAX_SHORTCUTS; i++) {
        const shortcut = normalizeShortcut(data[i], i);
        if (shortcut)
            out.push(shortcut);
    }

    // Deterministic de-duplication of ids (hand-edited configs).
    const seen = new Set();
    for (const shortcut of out) {
        let id = shortcut.id;
        let n = 2;
        while (seen.has(id)) {
            id = `${shortcut.id}_${n}`;
            n++;
        }
        shortcut.id = id;
        seen.add(id);
    }
    return out;
}

/** Entries that can actually be grabbed: non-empty, unique accelerators. */
export function registrationList(list) {
    const seen = new Set();
    const result = [];
    for (const shortcut of list ?? []) {
        if (!shortcut || !isValidAccel(shortcut.accel))
            continue;
        if (seen.has(shortcut.accel))
            continue;
        seen.add(shortcut.accel);
        result.push(shortcut);
    }
    return result;
}

export function validateShortcuts(list) {
    const errors = [];
    const warnings = [];
    const byAccel = new Map();

    (list ?? []).forEach((shortcut, index) => {
        if (!shortcut.accel) {
            warnings.push({
                index,
                field: 'accel',
                message: 'Sem atalho (não será acionado)',
            });
        } else if (!isValidAccel(shortcut.accel)) {
            warnings.push({
                index,
                field: 'accel',
                message: 'Atalho inválido (sem tecla após os modificadores)',
            });
        } else {
            if (!/<(Super|Alt|Control|Shift|Hyper|Meta)>/.test(shortcut.accel)) {
                warnings.push({
                    index,
                    field: 'accel',
                    message: 'Use ao menos um modificador (Super, Alt ou Ctrl)',
                });
            }
            if (GNOME_RESERVED.includes(shortcut.accel)) {
                warnings.push({
                    index,
                    field: 'accel',
                    message: 'Combinação reservada pelo GNOME',
                });
            }
            const previous = byAccel.get(shortcut.accel);
            if (previous !== undefined) {
                errors.push({
                    index,
                    field: 'accel',
                    message: `Duplicado com o atalho ${previous + 1}`,
                });
            } else {
                byAccel.set(shortcut.accel, index);
            }
        }

        if (needsPrompt(shortcut.mode) && !String(shortcut.prompt || '').trim()) {
            errors.push({ index, field: 'prompt', message: 'Prompt vazio' });
        }
    });

    return { errors, warnings };
}

export function defaultShortcuts() {
    return [
        {
            id: 'sc_default_push_process',
            label: 'Importar e processar',
            accel: '<Alt><Super>v',
            mode: 'push-process',
            prompt: DEFAULT_PROMPT,
        },
        {
            id: 'sc_default_process',
            label: 'Processar topo',
            accel: '<Alt><Super>c',
            mode: 'process',
            prompt: DEFAULT_PROMPT,
        },
        {
            id: 'sc_default_copy_top',
            label: 'Copiar topo para o sistema',
            accel: '<Alt><Super>x',
            mode: 'copy-top',
            prompt: '',
        },
        {
            id: 'sc_default_history',
            label: 'Histórico visual',
            accel: '<Alt><Super>h',
            mode: 'history',
            prompt: '',
        },
        {
            id: 'sc_default_pop',
            label: 'Desfazer (voltar um item)',
            accel: '<Alt><Super>z',
            mode: 'pop',
            prompt: '',
        },
        // Available but unbound: capture a key in prefs only if you use them.
        {
            id: 'sc_default_import',
            label: 'Importar sem processar',
            accel: '',
            mode: 'import',
            prompt: '',
        },
        {
            id: 'sc_default_enqueue',
            label: 'Enfileirar prompt',
            accel: '',
            mode: 'enqueue',
            prompt: DEFAULT_PROMPT,
        },
        {
            id: 'sc_default_run_next',
            label: 'Rodar próximo da fila',
            accel: '',
            mode: 'run-next',
            prompt: '',
        },
        {
            id: 'sc_default_drain',
            label: 'Rodar fila inteira',
            accel: '',
            mode: 'drain',
            prompt: '',
        },
    ];
}

/**
 * Upgrade path from the v1 `presets` JSON object:
 * - the first preset feeds the two default shortcuts (push-process + process);
 * - the remaining presets become extra shortcuts with no key assigned, so the
 *   user only has to capture accelerators in prefs.
 */
export function migrateFromPresets(rawPresets) {
    let presets;
    try {
        presets = typeof rawPresets === 'string' ? JSON.parse(rawPresets) : rawPresets;
    } catch (_e) {
        presets = null;
    }
    if (!presets || typeof presets !== 'object' || Array.isArray(presets))
        return defaultShortcuts();

    const entries = Object.entries(presets)
        .filter(([, prompt]) => typeof prompt === 'string' && prompt.trim());
    if (entries.length === 0)
        return defaultShortcuts();

    const firstPrompt = entries[0][1];
    const list = [
        {
            id: 'sc_migrated_push_process',
            label: 'Importar e processar',
            accel: '<Alt><Super>v',
            mode: 'push-process',
            prompt: firstPrompt,
        },
        {
            id: 'sc_migrated_process',
            label: 'Processar pilha',
            accel: '<Alt><Super>c',
            mode: 'process',
            prompt: firstPrompt,
        },
    ];

    for (let i = 1; i < entries.length && list.length < MAX_SHORTCUTS - 1; i++) {
        const [name, prompt] = entries[i];
        list.push({
            id: `sc_preset_${i}`,
            label: name,
            accel: '',
            mode: 'push-process',
            prompt,
        });
    }

    list.push({
        id: 'sc_default_copy_top',
        label: 'Copiar topo para o sistema',
        accel: '',
        mode: 'copy-top',
        prompt: '',
    });
    return list.slice(0, MAX_SHORTCUTS);
}
