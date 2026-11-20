// Спектральный анализатор с логарифмической осью частот и удержанием пиков.

const F_MIN = 20;
const F_MAX = 20000;
const BANDS = 96;

export class SpectrumView {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyser = null;
        this.data = null;
        this.sampleRate = 48000;
        this.values = new Float32Array(BANDS);
        this.peaks = new Float32Array(BANDS);

        this.resize();
        new ResizeObserver(() => {
            this.resize();
            this.draw();
        }).observe(canvas);
        this.draw();
    }

    setAnalyser(analyser, sampleRate) {
        this.analyser = analyser;
        this.sampleRate = sampleRate || 48000;
        this.data = new Uint8Array(analyser.frequencyBinCount);
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.w = Math.max(160, rect.width);
        this.h = Math.max(80, rect.height);
        this.canvas.width = Math.round(this.w * dpr);
        this.canvas.height = Math.round(this.h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    bandRange(index) {
        const ratio = F_MAX / F_MIN;
        const f0 = F_MIN * Math.pow(ratio, index / BANDS);
        const f1 = F_MIN * Math.pow(ratio, (index + 1) / BANDS);
        const nyquist = this.sampleRate / 2;
        const binHz = nyquist / (this.data.length || 1);
        return [Math.max(0, Math.floor(f0 / binHz)), Math.min(this.data.length - 1, Math.ceil(f1 / binHz))];
    }

    tick() {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(this.data);

        for (let i = 0; i < BANDS; i++) {
            const [from, to] = this.bandRange(i);
            let peak = 0;
            for (let b = from; b <= to; b++) {
                if (this.data[b] > peak) peak = this.data[b];
            }
            const value = Math.pow(peak / 255, 1.25);
            this.values[i] = value;
            this.peaks[i] = Math.max(value, this.peaks[i] - 0.006);
        }

        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const { w, h } = this;
        ctx.clearRect(0, 0, w, h);

        // Опорные частоты
        ctx.strokeStyle = 'rgba(120, 150, 190, 0.10)';
        ctx.fillStyle = 'rgba(139, 160, 185, 0.45)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.lineWidth = 1;

        for (const f of [100, 1000, 10000]) {
            const x = (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, h - 14);
            ctx.stroke();
            ctx.fillText(f >= 1000 ? `${f / 1000}к` : String(f), x + 4, h - 3);
        }

        if (!this.analyser) return;

        const gap = 2;
        const barWidth = (w - gap * (BANDS - 1)) / BANDS;

        for (let i = 0; i < BANDS; i++) {
            const x = i * (barWidth + gap);
            const barHeight = this.values[i] * (h - 18);

            if (barHeight > 0.5) {
                const gradient = ctx.createLinearGradient(0, h - 14, 0, h - 14 - barHeight);
                gradient.addColorStop(0, 'rgba(57, 208, 164, 0.85)');
                gradient.addColorStop(1, 'rgba(88, 166, 255, 0.85)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.roundRect(x, h - 14 - barHeight, Math.max(1, barWidth), barHeight, 1.5);
                ctx.fill();
            }

            const peakY = h - 14 - this.peaks[i] * (h - 18);
            if (this.peaks[i] > 0.01) {
                ctx.fillStyle = 'rgba(220, 235, 255, 0.55)';
                ctx.fillRect(x, peakY - 1, Math.max(1, barWidth), 1.5);
            }
        }
    }
}
