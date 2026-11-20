// SGEN — сборка приложения.

import { Engine } from './audio/engine.js';
import { Generator, defaultParams, presetPartials, MAX_PARTIALS } from './audio/generator.js';
import { createCard } from './ui/card.js';
import { ScopeView } from './visual/scope.js';
import { SpectrumView } from './visual/spectrum.js';
import { collectPatch, readHash, loadLocal, saveLocal, writeHash } from './patch.js';

const $ = (id) => document.getElementById(id);

const engine = new Engine();
const entries = [];
let master = 0.8;
let running = false;
let serial = 1;
let saveTimer = 0;

const cardsHost = $('cards');
const emptyHint = $('empty');
const playBtn = $('play');
const stopBtn = $('stop');
const masterInput = $('master');
const freezeBtn = $('freeze');
const toastBox = $('toast');

let scopeLive = null;
let scopeFrozen = null;
let spectrum = null;

// --------------------------------------------------------------- утилиты

function toast(message) {
    toastBox.textContent = message;
    toastBox.hidden = false;
    clearTimeout(toastBox._timer);
    toastBox._timer = setTimeout(() => { toastBox.hidden = true; }, 3200);
}

function normalizePartials(list) {
    const source = Array.isArray(list) ? list : [];
    const out = new Array(MAX_PARTIALS).fill(0);
    for (let i = 0; i < Math.min(source.length, MAX_PARTIALS); i++) {
        out[i] = Math.max(-1, Math.min(1, Number(source[i]) || 0));
    }
    return out;
}

function patchNow() {
    return collectPatch({
        master,
        generators: entries.map((entry) => entry.params),
    });
}

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLocal(patchNow()), 400);
}

function dropHash() {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function updateStats() {
    const voices = entries.filter((entry) => entry.params.enabled).length;
    $('statVoices').textContent = `голосов: ${voices}`;
    $('statRate').textContent = engine.sampleRate ? `${(engine.sampleRate / 1000).toFixed(1)} кГц` : '—';
    $('statLatency').textContent = engine.latency ? `${(engine.latency * 1000).toFixed(1)} мс` : '—';
}

function updateEmpty() {
    emptyHint.hidden = entries.length > 0;
}

// ------------------------------------------------------------ генераторы

function createEntry(params) {
    const clean = {};
    for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined) clean[key] = value;
    }

    const entry = {
        id: `g${serial++}`,
        params: { ...defaultParams(), ...clean },
        gen: null,
    };
    entry.params.partials = normalizePartials(entry.params.partials);

    entry.card = createCard(entry, {
        onChange: (changes) => {
            Object.assign(entry.params, changes);
            if (entry.gen) entry.gen.update(changes);
            dropHash();
            scheduleSave();
        },
        onRemove: () => removeEntry(entry.id),
        onDuplicate: () => {
            const clone = { ...entry.params, name: `${entry.params.name} +` };
            clone.partials = entry.params.partials.slice();
            addEntry(clone);
        },
        onToggle: (on) => {
            entry.params.enabled = on;
            if (entry.gen) {
                if (on && running) entry.gen.start();
                else entry.gen.stop();
            }
            updateStats();
            dropHash();
            scheduleSave();
        },
    });

    cardsHost.append(entry.card.element);
    entries.push(entry);
    updateEmpty();
    updateStats();

    if (running && engine.ready) {
        entry.gen = new Generator(engine, entry.params);
        if (entry.params.enabled) entry.gen.start();
    }

    return entry;
}

function addEntry(params = {}) {
    const entry = createEntry(params);
    scheduleSave();
    return entry;
}

function removeEntry(id) {
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [entry] = entries.splice(index, 1);
    entry.gen?.dispose();
    entry.card.element.remove();
    updateEmpty();
    updateStats();
    scheduleSave();
}

// --------------------------------------------------------------- запуск

async function start() {
    try {
        await engine.ensure();
        engine.setMaster(master);

        initVisuals();
        attachAnalysers();

        for (const entry of entries) {
            if (!entry.gen) entry.gen = new Generator(engine, entry.params);
            else entry.gen.update(entry.params);

            if (entry.params.enabled) entry.gen.start();
            else entry.gen.stop();
        }

        running = true;
        playBtn.classList.add('active');
        playBtn.textContent = 'Работает';
        updateStats();
    } catch (error) {
        toast(error.message || 'Не удалось запустить аудио');
    }
}

function stop() {
    running = false;
    for (const entry of entries) entry.gen?.stop();
    playBtn.classList.remove('active');
    playBtn.textContent = 'Пуск';
}

// --------------------------------------------------------- визуализация

function initVisuals() {
    if (scopeLive) return;
    scopeLive = new ScopeView($('scopeLive'));
    scopeFrozen = new ScopeView($('scopeFrozen'), { frozen: true });
    spectrum = new SpectrumView($('spectrum'));

    const loop = () => {
        requestAnimationFrame(loop);
        if (!engine.analyser) return;
        scopeLive.tick();
        spectrum.tick();
    };
    loop();
}

function attachAnalysers() {
    if (!engine.analyser) return;
    scopeLive.setAnalyser(engine.analyser);
    scopeFrozen.setAnalyser(engine.analyser);
    spectrum.setAnalyser(engine.analyser, engine.sampleRate);
}

// ---------------------------------------------------------------- старт

function loadInitial() {
    const fromHash = readHash();
    const fromLocal = loadLocal();
    const patch = fromHash || fromLocal;

    if (patch && Array.isArray(patch.generators) && patch.generators.length) {
        if (typeof patch.master === 'number') {
            master = Math.max(0, Math.min(1, patch.master));
            masterInput.value = String(master);
        }
        for (const item of patch.generators) createEntry(item);
    } else {
        // Первый запуск: небольшой демо-патч, чтобы было что послушать
        createEntry({ name: 'Бас', freq: 55, amp: 0.3, partials: presetPartials('saw') });
        createEntry({ name: 'Орган', freq: 220, amp: 0.13, partials: presetPartials('square') });
        createEntry({ name: 'Воздух', freq: 880, amp: 0.05, noise: 0.05, noiseType: 1 });
    }

    // Ссылку на патч сохраняем в адресной строке, пока пользователь ничего не менял.
    if (!fromHash) dropHash();

    updateEmpty();
    updateStats();
}

playBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

masterInput.addEventListener('input', () => {
    master = Number(masterInput.value);
    engine.setMaster(master);
    scheduleSave();
});

freezeBtn.addEventListener('click', () => {
    if (!scopeFrozen || !scopeFrozen.analyser) {
        toast('Сначала запустите звук');
        return;
    }
    if (scopeFrozen.capture()) {
        freezeBtn.textContent = 'Обновить';
        freezeBtn.classList.add('done');
    }
});

$('add').addEventListener('click', () => {
    addEntry({ name: `Генератор ${entries.length + 1}`, freq: 220 });
});

$('save').addEventListener('click', () => {
    if (saveLocal(patchNow())) {
        toast('Патч сохранён в браузере');
        dropHash();
    } else {
        toast('Не удалось сохранить');
    }
});

$('share').addEventListener('click', async () => {
    const url = writeHash(patchNow());
    try {
        await navigator.clipboard.writeText(url);
        toast('Ссылка на патч скопирована');
    } catch {
        toast('Ссылка в адресной строке — скопируй вручную');
    }
});

loadInitial();
initVisuals();

// Отладочная точка входа: удобно смотреть состояние из консоли.
window.sgen = { engine, entries, start, stop, patchNow };
