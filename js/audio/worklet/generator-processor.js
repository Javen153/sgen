// Аддитивный генератор SGEN.
// Один процессор = один независимый голос: гармоники, шум, FM, AM, панорама.

const TWO_PI = Math.PI * 2;
const MAX_PARTIALS = 16;

// Синус по таблице с линейной интерполяцией: заметно дешевле Math.sin
// в горячем цикле (16 гармоник × 128 сэмплов на блок).
const TABLE_SIZE = 4096;
const SIN = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) SIN[i] = Math.sin((i / TABLE_SIZE) * TWO_PI);
const SIN_SCALE = TABLE_SIZE / TWO_PI;

function sinLUT(x) {
    let t = x * SIN_SCALE;
    t -= Math.floor(t / TABLE_SIZE) * TABLE_SIZE;
    const i = t | 0;
    const f = t - i;
    return SIN[i] + (SIN[i + 1] - SIN[i]) * f;
}

class SgenGenerator extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sr = sampleRate;

        // Параметры и их сглаженные значения
        this.freq = 220;
        this.freqTarget = 220;
        this.amp = 0.25;
        this.ampTarget = 0.25;
        this.noise = 0;
        this.noiseTarget = 0;
        this.noiseType = 0;

        this.partials = new Float32Array(MAX_PARTIALS);
        this.partials[0] = 1;
        this.partialsNow = new Float32Array(MAX_PARTIALS);
        this.partialsNow[0] = 1;

        this.phaseOffset = 0;
        this.pan = 0;

        this.fmRatio = 1;
        this.fmDepth = 0;
        this.amRate = 2;
        this.amDepth = 0;

        this.basePhase = 0;
        this.fmPhase = 0;
        this.amPhase = 0;

        this.env = 0;
        this.envTarget = 0;

        // Цветной шум
        this.pink0 = 0;
        this.pink1 = 0;
        this.pink2 = 0;
        this.brown = 0;

        // Коэффициенты сглаживания (на сэмпл)
        this.kAmp = 1 - Math.exp(-1 / (0.012 * this.sr));
        this.kFreq = 1 - Math.exp(-1 / (0.02 * this.sr));
        this.kPart = 1 - Math.exp(-1 / (0.015 * this.sr));
        this.kAttack = 1 - Math.exp(-1 / (0.008 * this.sr));
        this.kRelease = 1 - Math.exp(-1 / (0.08 * this.sr));

        this.port.onmessage = (event) => this.handle(event.data);
    }

    handle(msg) {
        switch (msg.type) {
            case 'params':
                this.setParams(msg.params);
                break;
            case 'start':
                this.envTarget = 1;
                break;
            case 'stop':
                this.envTarget = 0;
                break;
            default:
                break;
        }
    }

    setParams(p) {
        if (p.freq !== undefined) this.freqTarget = Math.max(0.01, p.freq);
        if (p.amp !== undefined) this.ampTarget = Math.max(0, Math.min(1, p.amp));
        if (p.phase !== undefined) this.phaseOffset = p.phase * TWO_PI;
        if (p.pan !== undefined) this.pan = Math.max(-1, Math.min(1, p.pan));
        if (p.partials) {
            const n = Math.min(p.partials.length, MAX_PARTIALS);
            this.partials.fill(0);
            for (let i = 0; i < n; i++) {
                // Знак гармоники — это её фаза (0 или π), поэтому допускаем -1..1
                this.partials[i] = Math.max(-1, Math.min(1, p.partials[i]));
            }
        }
        if (p.noise !== undefined) this.noiseTarget = Math.max(0, Math.min(1, p.noise));
        if (p.noiseType !== undefined) this.noiseType = p.noiseType | 0;
        if (p.fmRatio !== undefined) this.fmRatio = Math.max(0.01, p.fmRatio);
        if (p.fmDepth !== undefined) this.fmDepth = Math.max(0, p.fmDepth);
        if (p.amRate !== undefined) this.amRate = Math.max(0.01, p.amRate);
        if (p.amDepth !== undefined) this.amDepth = Math.max(0, Math.min(1, p.amDepth));
    }

    process(_inputs, outputs) {
        const out = outputs[0];
        const left = out[0];
        const right = out[1] || out[0];
        const n = left.length;

        // Полная тишина — не тратим CPU
        if (this.envTarget === 0 && this.env < 1e-4) {
            left.fill(0);
            if (right !== left) right.fill(0);
            return true;
        }

        const sr = this.sr;
        const kAmp = this.kAmp;
        const kFreq = this.kFreq;
        const kPart = this.kPart;
        const kEnv = this.envTarget > this.env ? this.kAttack : this.kRelease;

        // Панорама: equal-power
        const panL = Math.cos((this.pan + 1) * Math.PI / 4);
        const panR = Math.sin((this.pan + 1) * Math.PI / 4);

        for (let i = 0; i < n; i++) {
            this.freq += (this.freqTarget - this.freq) * kFreq;
            this.amp += (this.ampTarget - this.amp) * kAmp;
            this.noise += (this.noiseTarget - this.noise) * kAmp;
            this.env += (this.envTarget - this.env) * kEnv;

            for (let k = 0; k < MAX_PARTIALS; k++) {
                this.partialsNow[k] += (this.partials[k] - this.partialsNow[k]) * kPart;
            }

            const inc = TWO_PI * this.freq / sr;

            this.basePhase += inc;
            if (this.basePhase >= TWO_PI) this.basePhase -= TWO_PI;

            let fm = 0;
            if (this.fmDepth > 0) {
                this.fmPhase += inc * this.fmRatio;
                if (this.fmPhase >= TWO_PI) this.fmPhase -= TWO_PI;
                fm = sinLUT(this.fmPhase) * this.fmDepth;
            }

            const p = this.basePhase + this.phaseOffset + fm;

            let sample = 0;
            for (let k = 0; k < MAX_PARTIALS; k++) {
                const a = this.partialsNow[k];
                if (a > 1e-5 || a < -1e-5) sample += a * sinLUT(p * (k + 1));
            }

            if (this.noise > 1e-5) {
                sample += this.noiseSample() * this.noise;
            }

            if (this.amDepth > 0) {
                this.amPhase += TWO_PI * this.amRate / sr;
                if (this.amPhase >= TWO_PI) this.amPhase -= TWO_PI;
                const lfo = 0.5 + 0.5 * sinLUT(this.amPhase);
                sample *= 1 - this.amDepth + this.amDepth * lfo;
            }

            const v = sample * this.env * this.amp;
            left[i] = v * panL;
            if (right !== left) right[i] = v * panR;
        }

        return true;
    }

    noiseSample() {
        const w = Math.random() * 2 - 1;
        if (this.noiseType === 1) {
            // Розовый шум (Пол Келлет)
            this.pink0 = 0.99765 * this.pink0 + w * 0.0990460;
            this.pink1 = 0.96300 * this.pink1 + w * 0.2965164;
            this.pink2 = 0.57000 * this.pink2 + w * 1.0526913;
            return (this.pink0 + this.pink1 + this.pink2 + w * 0.1848) * 0.22;
        }
        if (this.noiseType === 2) {
            // Коричневый шум — интегратор с утечкой
            this.brown = (this.brown + 0.02 * w) / 1.02;
            return this.brown * 3.2;
        }
        return w * 0.7;
    }
}

registerProcessor('sgen-generator', SgenGenerator);
