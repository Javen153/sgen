// Осциллограф с триггером по возрастающему нулю — картинка не «плывёт».

const WINDOW = 1024;

function findTrigger(data) {
    const limit = Math.max(1, data.length - WINDOW - 1);
    for (let i = 1; i < limit; i++) {
        if (data[i - 1] <= 0 && data[i] > 0) return i;
    }
    return 0;
}

export class ScopeView {
    constructor(canvas, { frozen = false } = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.frozen = frozen;
        this.analyser = null;
        this.buffer = null;
        this.hold = null;

        this.resize();
        new ResizeObserver(() => {
            this.resize();
            this.draw();
        }).observe(canvas);
        this.draw();
    }

    setAnalyser(analyser) {
        this.analyser = analyser;
        this.buffer = new Float32Array(analyser.fftSize);
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.w = Math.max(120, rect.width);
        this.h = Math.max(60, rect.height);
        this.canvas.width = Math.round(this.w * dpr);
        this.canvas.height = Math.round(this.h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    capture() {
        if (!this.analyser) return false;
        this.analyser.getFloatTimeDomainData(this.buffer);
        this.hold = this.buffer.slice();
        this.draw();
        return true;
    }

    clear() {
        this.hold = null;
        this.draw();
    }

    tick() {
        if (this.frozen || !this.analyser) return;
        this.analyser.getFloatTimeDomainData(this.buffer);
        this.draw(this.buffer);
    }

    draw(source) {
        const ctx = this.ctx;
        const { w, h } = this;
        ctx.clearRect(0, 0, w, h);

        // Сетка
        ctx.strokeStyle = 'rgba(120, 150, 190, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
            const y = (h / 4) * i + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        for (let i = 1; i < 8; i++) {
            const x = (w / 8) * i + 0.5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        ctx.stroke();

        const data = source || this.hold;
        if (!data) {
            ctx.strokeStyle = 'rgba(120, 150, 190, 0.18)';
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();

            if (this.frozen) {
                ctx.fillStyle = 'rgba(107, 122, 143, 0.6)';
                ctx.font = '12px "Segoe UI", system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('нажми «Заморозить»', w / 2, h / 2 - 16);
            }
            return;
        }

        const start = findTrigger(data);
        const count = Math.min(WINDOW, data.length - start);
        if (count < 2) return;

        const mid = h / 2;
        const gain = mid * 0.92;

        ctx.strokeStyle = this.frozen ? '#58a6ff' : '#39d0a4';
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const x = (i / (count - 1)) * w;
            const v = Math.max(-1.2, Math.min(1.2, data[start + i]));
            const y = mid - v * gain;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
}
