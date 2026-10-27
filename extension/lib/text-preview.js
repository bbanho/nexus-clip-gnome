/** Flatten text and truncate it around the middle, keeping its beginning/end. */
export function middlePreview(text, length = 120) {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    const limit = Math.max(0, Math.floor(Number(length) || 0));
    if (flat.length <= limit)
        return flat;
    if (limit === 0)
        return '';
    if (limit === 1)
        return '…';

    const headLength = Math.ceil((limit - 1) / 2);
    const tailLength = Math.floor((limit - 1) / 2);
    return `${flat.slice(0, headLength)}…${tailLength ? flat.slice(-tailLength) : ''}`;
}
