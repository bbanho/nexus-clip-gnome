// PURE model for the Super command bar and the persistent queue badge.
//
// One global chord (Super+;) opens a keyboard-only St panel. Every AI action
// is then a single mnemonic key, so plain Super+letter keeps its natural GNOME
// meaning (typing, copy/paste, overview) and no extra global grabs are needed.
// No gi:// imports, no I/O: exercised by `node --test`.

import { canonicalAccel, isValidAccel, requiresPrompt } from './shortcuts.js';
import { PROMPT_TEMPLATES } from './prompts.js';

export const COMMAND_ACCEL_DEFAULT = '<Super>semicolon';

/** Ordered command palette. `key` is the single key pressed after the leader. */
// Motor-memory map: C collects (system clipboard -> Nexus), V writes (AI on
// the Nexus top), X moves a copy out (Nexus -> system clipboard). Ctrl+C/V/X
// stay with the desktop apps; only the Super leader enters this palette.
export const COMMAND_KEYS = [
    {
        key: 'c',
        mode: 'push-process',
        label: 'Coletar clipboard + processar com IA',
        hint: 'C · traz o clipboard do sistema para o Nexus',
    },
    {
        key: 'v',
        mode: 'process',
        label: 'Escrever no topo com IA',
        hint: 'V · processa o topo, não toca no clipboard do sistema',
    },
    {
        key: 'x',
        mode: 'copy-top',
        label: 'Mover uma cópia do topo para o sistema',
        hint: 'X · saída explícita (CP-03), mantém o item na pilha',
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
        // Only `enqueue` needs a prompt of its own; C/V borrow the FIFO.
        prompt: requiresPrompt(command.mode)
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
    pipelineCount = 0,
    next = '',
    running = false,
} = {}) {
    if (fifoCount <= 0 && pipelineCount <= 0)
        return '';
    const label = preview(next || 'sem rótulo');
    const state = running ? 'PROCESSANDO' : 'PRÓX';
    const pipeline = pipelineCount > 0 ? ` · PIPELINE ${pipelineCount}` : '';
    return `NEXUS · FILA ${fifoCount}${pipeline} · ${state}: ${label}${running ? '' : ` · pilha ${stackCount}`}`;
}
