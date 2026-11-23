// PURE model for the Super command bar and the persistent queue badge.
//
// One global chord (Super+;) opens a keyboard-only St panel. Every AI action
// is then a single mnemonic key, so plain Super+letter keeps its natural GNOME
// meaning (typing, copy/paste, overview) and no extra global grabs are needed.
// No gi:// imports, no I/O: exercised by `node --test`.

import { canonicalAccel, isValidAccel, needsPrompt } from './shortcuts.js';
import { PROMPT_TEMPLATES } from './prompts.js';

export const COMMAND_ACCEL_DEFAULT = '<Super>semicolon';

/** Ordered command palette. `key` is the single key pressed after the leader. */
export const COMMAND_KEYS = [
    {
        key: 'v',
        mode: 'push-process',
        label: 'Importar clipboard + processar com IA',
        hint: 'lê o clipboard do sistema',
    },
    {
        key: 'c',
        mode: 'process',
        label: 'Processar topo do Nexus com IA',
        hint: 'não toca no clipboard do sistema',
    },
    {
        key: 'x',
        mode: 'copy-top',
        label: 'Copiar topo do Nexus para o sistema',
        hint: 'saída explícita (CP-03)',
    },
    {
        key: 'q',
        mode: 'enqueue',
        label: 'Enfileirar prompt',
        hint: 'usa o prompt do atalho',
    },
    {
        key: 'n',
        mode: 'run-next',
        label: 'Rodar próximo passo da fila',
        hint: '1 passo, resultado no topo',
    },
    {
        key: 'd',
        mode: 'drain',
        label: 'Rodar a fila inteira',
        hint: 'todos os passos, em ordem',
    },
    {
        key: 'z',
        mode: 'pop',
        label: 'Desfazer (voltar um item)',
        hint: 'pilha LIFO',
    },
    {
        key: 'h',
        mode: 'show',
        label: 'Histórico visual (pilha / fila / prompts)',
        hint: 'painel pesquisável',
    },
    {
        key: 'a',
        mode: 'audit-import',
        label: 'Importar texto auditado',
        hint: 'exige o magic number NEXUS-TEXT-1',
    },
    {
        key: 'm',
        mode: 'mirror-import',
        label: 'Importar + espelhar no sistema',
        hint: 'exportação explícita (CP-03)',
    },
    {
        key: 's',
        mode: 'status',
        label: 'Visão geral pilha / fila / histórico',
        hint: 'contagens, sem conteúdo',
    },
    {
        key: 'u',
        mode: 'provenance',
        label: 'Gravar UUID + vetor característico',
        hint: 'sem texto no KV (CP-04)',
    },
];

const TEMPLATE_KEYS = ['1', '2', '3', '4', '5'];

/** First five prompt templates, addressable with 1–5 inside the command bar. */
export function templateCommands() {
    return PROMPT_TEMPLATES.slice(0, TEMPLATE_KEYS.length).map((template, index) => ({
        key: TEMPLATE_KEYS[index],
        label: template.label,
        prompt: template.prompt,
        template,
    }));
}

/**
 * The command key must be a real accelerator with at least one modifier, so a
 * bad gsettings edit cannot silently disable the only global grab.
 */
export function normalizeCommandAccel(value) {
    const accel = canonicalAccel(value);
    if (!isValidAccel(accel) || !/<(Super|Alt|Control|Shift|Hyper|Meta)>/.test(accel))
        return COMMAND_ACCEL_DEFAULT;
    return accel;
}

/** Resolve a typed character (already lowercased) to a command or template. */
export function commandForChar(char) {
    const key = String(char ?? '').toLowerCase();
    const command = COMMAND_KEYS.find(item => item.key === key);
    if (command)
        return { type: 'command', item: command };
    const template = templateCommands().find(item => item.key === key);
    if (template)
        return { type: 'template', item: template };
    return null;
}

/** Synthetic shortcut for modes the user has not configured in prefs. */
export function shortcutForCommand(command) {
    return {
        id: `sc_cmd_${command.mode}`,
        label: command.label,
        accel: '',
        mode: command.mode,
        prompt: needsPrompt(command.mode)
            ? (PROMPT_TEMPLATES[0]?.prompt ?? '')
            : '',
    };
}

function preview(text, length = 30) {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length > length ? flat.slice(0, length - 1) + '…' : flat;
}

/** Short header shown in the command bar. */
export function formatCommandHeader({ stackCount = 0, fifoCount = 0 } = {}) {
    return `PILHA ${stackCount} · FILA ${fifoCount}`;
}

/**
 * Text for the always-on badge. Empty string means "hidden": the badge only
 * exists while there is queued work, so the user can *feel* a backlog forming.
 */
export function formatQueueBadge({
    stackCount = 0,
    fifoCount = 0,
    next = '',
    running = false,
} = {}) {
    if (fifoCount <= 0)
        return '';
    const label = preview(next || 'sem rótulo');
    const state = running ? 'PROCESSANDO' : 'PRÓX';
    return `NEXUS · FILA ${fifoCount} · ${state}: ${label}${running ? '' : ` · pilha ${stackCount}`}`;
}
