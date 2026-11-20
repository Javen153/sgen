// Мелкие помощники для построения DOM.

export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            node.setAttribute(key, value);
        }
    }

    for (const child of children.flat()) {
        if (child === null || child === undefined) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }

    return node;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function fmtHz(v) {
    if (v >= 1000) return `${(v / 1000).toFixed(2)} кГц`;
    return `${v.toFixed(v < 100 ? 1 : 0)} Гц`;
}

export function fmtPct(v) {
    return `${Math.round(v * 100)}%`;
}
