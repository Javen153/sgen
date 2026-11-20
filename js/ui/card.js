// Карточка генератора: управление параметрами и редактор гармоник.

import { el, clamp, fmtHz, fmtPct } from './dom.js';
import { PRESETS, presetPartials, MAX_PARTIALS } from '../audio/generator.js';

const FREQ_MIN = 20;
const FREQ_MAX = 8000;
const FREQ_LOG = Math.log(FREQ_MAX / FREQ_MIN);

const freqMap = {
    toPos: (f) => Math.round(1000 * Math.log(clamp(f, FREQ_MIN, FREQ_MAX) / FREQ_MIN) / FREQ_LOG),
    fromPos: (p) => FREQ_MIN * Math.exp((p / 1000) * FREQ_LOG),
};

// ------------------------------------------------------------ гармоники

class HarmonicEditor {
    constructor(values, onChange) {
        this.values = values.slice();
        this.onChange = onChange;
        this.dragIndex = -1;

        this.canvas = el('canvas', { class: 'harmonics', 'aria-label': 'Амплитуды гармоник' });
        this.ctx = this.canvas.getContext('2d');

        this.canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
        this.canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
        this.canvas.addEventListener('pointerup', () => { this.dragIndex = -1; });
        this.canvas.addEventListener('pointercancel', () => { this.dragIndex = -1; });
        this.canvas.addEventListener('dblclick', (event) => this.resetBar(event));

        new ResizeObserver(() => this.resize()).observe(this.canvas);
        this.resize();
    }

    setValues(values) {
        this.values = values.slice();
        this.draw();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.max(80, rect.width);
        const h = Math.max(48, rect.height);
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = w;
        this.height = h;
        this.draw();
    }

    metrics() {
        const pad = 4;
        const gap = 3;
        const barWidth = (this.width - pad * 2 - gap * (MAX_PARTIALS - 1)) / MAX_PARTIALS;
        return { pad, gap, barWidth, centerY: this.height * 0.5, scale: this.height * 0.42 };
    }

    pointerDown(event) {
        const index = this.indexAt(event);
        if (index < 0) return;
        this.dragIndex = index;
        this.canvas.setPointerCapture(event.pointerId);
        this.applyPointer(event, index);
    }

    pointerMove(event) {
        if (this.dragIndex < 0) return;
        this.applyPointer(event, this.dragIndex);
    }

    applyPointer(event, index) {
        const rect = this.canvas.getBoundingClientRect();
        const { centerY, scale } = this.metrics();
        const y = event.clientY - rect.top;
        const value = clamp((centerY - y) / scale, -1, 1);
        this.values[index] = Math.round(value * 100) / 100;
        this.draw();
        this.onChange(this.values.slice());
    }

    resetBar(event) {
        const index = this.indexAt(event);
        if (index < 0) return;
        this.values[index] = 0;
        this.draw();
        this.onChange(this.values.slice());
    }

    indexAt(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const { pad, gap, barWidth } = this.metrics();
        const index = Math.floor((x - pad) / (barWidth + gap));
        return index >= 0 && index < MAX_PARTIALS ? index : -1;
    }

    draw() {
        const { width: w, height: h } = this;
        if (!w || !h) return;
        const ctx = this.ctx;
        const { pad, gap, barWidth, centerY, scale } = this.metrics();

        ctx.clearRect(0, 0, w, h);

        // Сетка
        ctx.strokeStyle = 'rgba(120, 150, 190, 0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY + 0.5);
        ctx.lineTo(w, centerY + 0.5);
        ctx.stroke();

        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';

        for (let i = 0; i < MAX_PARTIALS; i++) {
            const x = pad + i * (barWidth + gap);
            const v = this.values[i] || 0;
            const hAbs = Math.abs(v) * scale;
            const top = v >= 0 ? centerY - hAbs : centerY;

            ctx.fillStyle = v >= 0 ? 'rgba(57, 208, 164, 0.85)' : 'rgba(88, 166, 255, 0.85)';
            if (hAbs > 0.5) {
                ctx.beginPath();
                ctx.roundRect(x, top, barWidth, hAbs, 2);
                ctx.fill();
            }

            ctx.fillStyle = 'rgba(139, 160, 185, 0.55)';
            ctx.fillText(String(i + 1), x + barWidth / 2, h - 2);
        }
    }
}

// --------------------------------------------------------------- поля

function rangeField({ label, value, format, onInput, mapping, min = 0, max = 1 }) {
    const input = el('input', { type: 'range', min: '0', max: '1000', step: '1' });
    const out = el('output', { class: 'val' });

    const toPos = mapping ? mapping.toPos : (v) => Math.round(((v - min) / (max - min)) * 1000);
    const fromPos = mapping ? mapping.fromPos : (p) => min + (p / 1000) * (max - min);

    const set = (v) => {
        input.value = String(toPos(v));
        out.textContent = format(v);
    };
    set(value);

    input.addEventListener('input', () => {
        const v = fromPos(Number(input.value));
        out.textContent = format(v);
        onInput(v);
    });

    const field = el('div', { class: 'field' },
        el('span', { class: 'label' }, label),
        input,
        out,
    );

    return { field, set, input };
}

function selectField({ label, value, options, onChange }) {
    const select = el('select', { class: 'select' });
    for (const option of options) {
        select.append(el('option', { value: String(option.value), selected: option.value === value ? '' : null }, option.label));
    }
    select.addEventListener('change', () => onChange(Number(select.value)));
    return el('label', { class: 'inline-field' }, el('span', { class: 'label' }, label), select);
}

// ------------------------------------------------------------ карточка

export function createCard(entry, { onChange, onRemove, onDuplicate, onToggle }) {
    const p = entry.params;

    const power = el('button', {
        class: 'power', type: 'button',
        'aria-label': 'Включить или выключить генератор',
        title: 'Включить / выключить',
    });
    const setPower = (on) => {
        power.classList.toggle('on', on);
        power.setAttribute('aria-pressed', String(on));
    };
    setPower(p.enabled);

    const nameInput = el('input', {
        class: 'name', type: 'text', value: p.name,
        'aria-label': 'Название генератора', maxlength: '24',
    });
    nameInput.addEventListener('input', () => onChange({ name: nameInput.value }));

    const header = el('header', { class: 'gen-head' },
        power,
        nameInput,
        el('div', { class: 'gen-tools' },
            el('button', { class: 'icon', type: 'button', title: 'Дублировать', text: '⧉', onclick: onDuplicate }),
            el('button', { class: 'icon danger', type: 'button', title: 'Удалить', text: '✕', onclick: onRemove }),
        ),
    );

    // Частота: ползунок + точное числовое поле
    const freqInput = el('input', {
        class: 'num', type: 'number', min: '20', max: '20000', step: '0.1',
        value: p.freq.toFixed(p.freq < 100 ? 1 : 0), 'aria-label': 'Частота в герцах',
    });

    const freq = rangeField({
        label: 'Частота',
        value: p.freq,
        mapping: freqMap,
        format: fmtHz,
        onInput: (v) => {
            freqInput.value = v.toFixed(v < 100 ? 1 : 0);
            onChange({ freq: v });
        },
    });

    freqInput.addEventListener('input', () => {
        const v = clamp(Number(freqInput.value) || FREQ_MIN, FREQ_MIN, 20000);
        freq.set(v);
        onChange({ freq: v });
    });

    const freqField = el('div', { class: 'field' },
        el('span', { class: 'label' }, 'Частота'),
        freq.input,
        el('div', { class: 'num-wrap' }, freqInput, el('span', { class: 'unit' }, 'Гц')),
    );

    const amp = rangeField({
        label: 'Амплитуда', value: p.amp, format: fmtPct,
        onInput: (v) => onChange({ amp: v }),
    });

    const phase = rangeField({
        label: 'Фаза', value: p.phase, format: (v) => `${Math.round(v * 360)}°`,
        onInput: (v) => onChange({ phase: v }),
    });

    const pan = rangeField({
        label: 'Панорама', value: p.pan, min: -1, max: 1,
        format: (v) => (Math.abs(v) < 0.02 ? 'центр' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'L' : 'R'}`),
        onInput: (v) => onChange({ pan: v }),
    });

    // Спектр
    const editor = new HarmonicEditor(p.partials, (values) => {
        markChip(null);
        onChange({ partials: values });
    });

    const chips = el('div', { class: 'chips' });
    const chipNodes = new Map();
    const markChip = (id) => {
        for (const [key, node] of chipNodes) node.classList.toggle('active', key === id);
    };
    for (const preset of PRESETS) {
        const chip = el('button', { class: 'chip', type: 'button' }, preset.label);
        chip.addEventListener('click', () => {
            const values = presetPartials(preset.id);
            editor.setValues(values);
            markChip(preset.id);
            onChange({ partials: values });
        });
        chipNodes.set(preset.id, chip);
        chips.append(chip);
    }

    // Шум и модуляция
    const noise = rangeField({
        label: 'Шум', value: p.noise, format: fmtPct,
        onInput: (v) => onChange({ noise: v }),
    });

    const fmDepth = rangeField({
        label: 'FM глубина', value: p.fmDepth, min: 0, max: 8,
        format: (v) => v.toFixed(2),
        onInput: (v) => onChange({ fmDepth: v }),
    });

    const fmRatio = rangeField({
        label: 'FM отношение', value: p.fmRatio, min: 0.05, max: 16,
        format: (v) => `${v.toFixed(2)}×`,
        onInput: (v) => onChange({ fmRatio: v }),
    });

    const amRate = rangeField({
        label: 'AM частота', value: p.amRate, min: 0.05, max: 30,
        format: (v) => `${v.toFixed(1)} Гц`,
        onInput: (v) => onChange({ amRate: v }),
    });

    const amDepth = rangeField({
        label: 'AM глубина', value: p.amDepth, format: fmtPct,
        onInput: (v) => onChange({ amDepth: v }),
    });

    const noiseType = selectField({
        label: 'Тип шума',
        value: p.noiseType,
        options: [
            { value: 0, label: 'Белый' },
            { value: 1, label: 'Розовый' },
            { value: 2, label: 'Коричневый' },
        ],
        onChange: (v) => onChange({ noiseType: v }),
    });

    const details = el('details', { class: 'more' },
        el('summary', {}, 'Шум и модуляция'),
        el('div', { class: 'more-body' },
            noiseType,
            noise.field,
            fmRatio.field,
            fmDepth.field,
            amRate.field,
            amDepth.field,
        ),
    );

    power.addEventListener('click', () => {
        const on = !power.classList.contains('on');
        setPower(on);
        onToggle(on);
    });

    const element = el('article', { class: 'gen', 'data-id': entry.id },
        header,
        el('div', { class: 'gen-body' },
            freqField,
            amp.field,
            el('div', { class: 'field-row' }, phase.field, pan.field),
            el('div', { class: 'section-label' },
                el('span', {}, 'Спектр · 16 гармоник'),
                el('span', { class: 'hint' }, 'тяни вверх/вниз, двойной клик — сброс'),
            ),
            chips,
            editor.canvas,
            details,
        ),
    );

    return {
        element,
        syncPower: setPower,
    };
}
