/** Pure model for reusable prompts, independent from shortcut configuration. */
export function normalizePrompts(value) {
    if (!Array.isArray(value))
        return [];

    const prompts = [];
    const seen = new Set();
    value.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            return;
        const text = typeof entry.text === 'string' ? entry.text.trim() : '';
        if (!text)
            return;
        const label = typeof entry.label === 'string' ? entry.label.trim() : '';
        const baseId = typeof entry.id === 'string' ? entry.id.trim() : '';
        const base = baseId || `prompt_${index + 1}`;
        let id = base;
        for (let suffix = 2; seen.has(id); suffix++)
            id = `${base}_${suffix}`;
        seen.add(id);
        prompts.push({
            id,
            label: label || `Prompt ${prompts.length + 1}`,
            text,
        });
    });
    return prompts;
}

export function parsePrompts(raw) {
    try {
        return normalizePrompts(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch (_error) {
        return [];
    }
}

/** Combine instructions in the order selected by the user. */
export function combinePrompts(texts) {
    return (texts ?? [])
        .filter(text => typeof text === 'string')
        .map(text => text.trim())
        .filter(Boolean)
        .join('\n\n');
}
