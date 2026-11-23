// PURE notification policy + status formatting.
//
// The user wants to know *which* operation ran without a system notification
// for every keypress. Successes go to a transient status chip (and the history
// log); system notifications are reserved for errors by default. No gi://
// imports: `node --test`.

export const NOTIFY_LEVELS = ['errors', 'all', 'silent'];
export const DEFAULT_NOTIFY_LEVEL = 'errors';

export const NOTIFY_LEVEL_LABELS = {
    errors: 'Só erros (recomendado)',
    all: 'Todas as operações',
    silent: 'Silencioso (sem notificações)',
};

export function normalizeNotifyLevel(value) {
    const text = String(value ?? '').trim();
    return NOTIFY_LEVELS.includes(text) ? text : DEFAULT_NOTIFY_LEVEL;
}

/**
 * Whether a system notification should fire.
 * kind: 'success' | 'error' | 'info'.
 */
export function shouldNotify(level, kind) {
    const normalized = normalizeNotifyLevel(level);
    if (normalized === 'silent')
        return false;
    if (normalized === 'all')
        return true;
    return kind === 'error';
}

/** Short, single-line description of the operation that just ran. */
export function formatStatus({ ok = true, label = '', detail = '' } = {}) {
    const mark = ok ? '✓' : '✗';
    const name = String(label ?? '').trim();
    const extra = String(detail ?? '').trim();
    return `${mark} ${name}${extra ? ` · ${extra}` : ''}`.trim();
}