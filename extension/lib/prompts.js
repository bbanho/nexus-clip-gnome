// PURE prompt template library.
//
// Ready-made prompts the user can drop into a shortcut (prefs) or enqueue
// straight from the HUD's "Prompts" tab. No gi:// imports, no I/O: exercised
// by `node --test`.

export const PROMPT_TEMPLATES = [
    {
        id: 'fix-pt',
        label: 'Corrigir português',
        tags: ['texto'],
        prompt: 'Corrija o português, mantendo o sentido e o tom.',
    },
    {
        id: 'summarize',
        label: 'Resumir (2 linhas)',
        tags: ['texto'],
        prompt: 'Resuma em no máximo 2 linhas, em português.',
    },
    {
        id: 'bullets',
        label: 'Transformar em tópicos',
        tags: ['texto'],
        prompt: 'Transforme em tópicos curtos (no máximo 6), em português.',
    },
    {
        id: 'explain-code',
        label: 'Explicar código',
        tags: ['código'],
        prompt: 'Explique este código de forma concisa, em português.',
    },
    {
        id: 'translate-en',
        label: 'Traduzir para inglês',
        tags: ['tradução'],
        prompt:
            'Traduza para inglês natural, mantendo termos técnicos quando necessário.',
    },
    {
        id: 'translate-pt',
        label: 'Traduzir para português',
        tags: ['tradução'],
        prompt:
            'Traduza para português natural, mantendo termos técnicos quando necessário.',
    },
    {
        id: 'formal',
        label: 'Reescrever formal',
        tags: ['texto'],
        prompt:
            'Reescreva em tom formal e profissional, em português, sem alterar o conteúdo.',
    },
    {
        id: 'casual',
        label: 'Reescrever informal',
        tags: ['texto'],
        prompt: 'Reescreva em tom informal e direto, em português.',
    },
    {
        id: 'commit',
        label: 'Mensagem de commit',
        tags: ['código'],
        prompt:
            'Escreva uma mensagem de commit no formato conventional (tipo: descrição) em inglês, a partir desta descrição.',
    },
    {
        id: 'reply-email',
        label: 'Responder a email',
        tags: ['texto'],
        prompt: 'Escreva uma resposta curta e educada a este email, em português.',
    },
    {
        id: 'expand',
        label: 'Desenvolver ideias',
        tags: ['texto'],
        prompt: 'Desenvolva estas ideias em 2–3 parágrafos claros, em português.',
    },
    {
        id: 'titles',
        label: 'Sugerir títulos',
        tags: ['texto'],
        prompt: 'Proponha 3 títulos curtos para este texto, em português.',
    },
];

const BY_ID = new Map(PROMPT_TEMPLATES.map(template => [template.id, template]));

export function templateById(id) {
    return BY_ID.get(String(id ?? '')) ?? null;
}

/** Case-insensitive search over label, prompt and tags; all words must match. */
export function searchTemplates(query) {
    const words = String(query ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0)
        return [...PROMPT_TEMPLATES];
    return PROMPT_TEMPLATES.filter(template => {
        const haystack = `${template.label} ${template.prompt} ${template.tags.join(' ')}`.toLowerCase();
        return words.every(word => haystack.includes(word));
    });
}