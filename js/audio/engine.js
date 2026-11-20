// Аудиоядро: контекст, общая шина, мастер-цепочка и анализатор для визуализации.

export class Engine {
    constructor() {
        this.ctx = null;
        this.bus = null;
        this.master = null;
        this.limiter = null;
        this.analyser = null;
    }

    get ready() {
        return Boolean(this.ctx);
    }

    get sampleRate() {
        return this.ctx ? this.ctx.sampleRate : 0;
    }

    get latency() {
        if (!this.ctx) return 0;
        return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
    }

    async ensure() {
        if (!this.ctx) await this.build();
        if (this.ctx.state !== 'running') await this.ctx.resume();
        return this.ctx;
    }

    async build() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new Error('Браузер не поддерживает Web Audio API');

        this.ctx = new Ctx({ latencyHint: 'interactive' });
        if (!this.ctx.audioWorklet) {
            throw new Error('Браузер не поддерживает AudioWorklet');
        }

        await this.ctx.audioWorklet.addModule(
            new URL('./worklet/generator-processor.js', import.meta.url)
        );

        // Все генераторы суммируются в общую шину
        this.bus = this.ctx.createGain();
        this.bus.gain.value = 1;

        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;

        // Мягкий лимитер: много голосов не должны клипповать
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -3;
        this.limiter.knee.value = 0;
        this.limiter.ratio.value = 20;
        this.limiter.attack.value = 0.002;
        this.limiter.release.value = 0.2;

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 8192;
        this.analyser.smoothingTimeConstant = 0.72;

        this.bus.connect(this.master);
        this.master.connect(this.limiter);
        this.limiter.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
    }

    setMaster(value) {
        if (!this.master) return;
        const v = Math.max(0, Math.min(1, value));
        this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
}
