// Сериализация патча: localStorage и ссылка в адресной строке.

const STORAGE_KEY = 'sgen.patch.v1';
const HASH_PREFIX = '#p=';

export function collectPatch({ master, generators }) {
    return {
        version: 1,
        master,
        generators: generators.map((params) => ({ ...params })),
    };
}

function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export function encodePatch(patch) {
    return toBase64Url(JSON.stringify(patch));
}

export function decodePatch(str) {
    try {
        return JSON.parse(fromBase64Url(str));
    } catch {
        return null;
    }
}

export function writeHash(patch) {
    const url = `${location.origin}${location.pathname}${HASH_PREFIX}${encodePatch(patch)}`;
    history.replaceState(null, '', url);
    return url;
}

export function readHash() {
    if (!location.hash.startsWith(HASH_PREFIX)) return null;
    return decodePatch(location.hash.slice(HASH_PREFIX.length));
}

export function saveLocal(patch) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(patch));
        return true;
    } catch {
        return false;
    }
}

export function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}
