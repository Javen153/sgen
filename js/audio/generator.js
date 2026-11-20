// Модель генератора: параметры, пресеты спектра, связь с процессором.

export const MAX_PARTIALS = 16;

const PRESET_FUNCS = {
    sine: (k) => (k === 1 ? 1 : 0),
    saw: (k) => 1 / k,
    square: (k) => (k % 2 === 1 ? 1 / k : 0),
    triangle: (k) => (k % 2 === 1 ? Math.pow(-1, (k - 1) / 2) / (k * k) : 0),
};

export const PRESETS = [
    { id: 'sine', label: 'Синус' },
    { id: 'saw', label: 'Пила' },
    { id: 'square', label: 'Квадрат' },
    { id: 'triangle', label: 'Треугольник' },
];

export function presetPartials(name) {
    const fn = PRESET_FUNCS[name] || PRESET_FUNCS.sine;
    const out = new Array(MAX_PARTIALS).fill(0);
    let sum = 0;
    for (let k = 1; k <= MAX_PARTIALS; k++) {
        const a = fn(k);
        out[k - 1] = a;
        sum += Math.abs(a);
    }
    // Нормируем по сумме модулей: гарантирует отсутствие клиппинга у пресета
    if (sum > 0) {
        for (let i = 0; i < MAX_PARTIALS; i++) out[i] = Number((out[i] / sum).toFixed(4));
    }
    return out;
}

export function defaultParams(patch = {}) {
    return {
        name: 'Генератор',
        enabled: true,
        freq: 220,
        amp: 0.25,
        phase: 0,
        pan: 0,
        partials: presetPartials('sine'),
        noise: 0,
        noiseType: 0,
        fmRatio: 1,
        fmDepth: 0,
        amRate: 2,
        amDepth: 0,
        ...patch,
    };
}

const SEND_KEYS = [
    'freq', 'amp', 'phase', 'pan', 'partials',
    'noise', 'noiseType', 'fmRatio', 'fmDepth', 'amRate', 'amDepth',
];

export class Generator {
    constructor(engine, params = {}) {
        this.params = defaultParams(params);
        this.node = new AudioWorkletNode(engine.ctx, 'sgen-generator', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        });
        this.node.connect(engine.bus);

        this.send(this.params);
        this.node.port.postMessage({ type: this.params.enabled ? 'start' : 'stop' });
    }

    send(changes) {
        const params = {};
        for (const key of SEND_KEYS) {
            if (changes[key] !== undefined) params[key] = changes[key];
        }
        if (Object.keys(params).length) {
            this.node.port.postMessage({ type: 'params', params });
        }
    }

    update(changes) {
        Object.assign(this.params, changes);
        this.send(changes);
    }

    start() {
        this.node.port.postMessage({ type: 'start' });
    }

    stop() {
        this.node.port.postMessage({ type: 'stop' });
    }

    dispose() {
        this.node.port.postMessage({ type: 'stop' });
        this.node.disconnect();
    }
}
