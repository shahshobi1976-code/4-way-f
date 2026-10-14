// Light generative background music with 10 synthesised instruments, plus optional user-chosen song.
import { audio } from './sfx';
import { store } from '../state/store';

export const INSTRUMENTS = [
    'Piano', 'Music box', 'Flute', 'Harp', 'Marimba',
    'Guitar', 'Bells', 'Strings', 'Kalimba', 'Dream pad',
];

interface Cfg {
    w: OscillatorType;
    parts: [number, number][]; // [frequency ratio, gain]
    a: number; // attack s
    d: number; // decay/length multiplier
    lp?: number;
    vib?: number;
    oct?: number; // octave shift
}

const CFG: Cfg[] = [
    { w: 'triangle', parts: [[1, 1], [2, 0.3], [3, 0.12]], a: 0.01, d: 1.6 },
    { w: 'sine', parts: [[1, 1], [2.76, 0.25], [5.4, 0.08]], a: 0.005, d: 1.2, oct: 2 },
    { w: 'sine', parts: [[1, 1], [2, 0.12]], a: 0.12, d: 1.0, vib: 5.5, oct: 1 },
    { w: 'triangle', parts: [[1, 1], [2, 0.4], [4, 0.1]], a: 0.004, d: 1.9 },
    { w: 'sine', parts: [[1, 1], [4, 0.35], [10, 0.08]], a: 0.004, d: 0.55 },
    { w: 'sawtooth', parts: [[1, 0.7], [2, 0.2]], a: 0.006, d: 1.1, lp: 1500 },
    { w: 'sine', parts: [[1, 1], [2.4, 0.4], [5.95, 0.2]], a: 0.004, d: 2.8, oct: 1 },
    { w: 'sawtooth', parts: [[1, 0.5], [1.005, 0.5]], a: 0.35, d: 2.2, lp: 1100, vib: 4.5 },
    { w: 'sine', parts: [[1, 1], [6, 0.18]], a: 0.004, d: 0.7, oct: 1 },
    { w: 'sine', parts: [[1, 0.8], [1.5, 0.35], [2, 0.3]], a: 0.9, d: 3.2 },
];

// C major pentatonic over a gentle C - Am - F - G loop
const CHORDS = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
];
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

let timer: number | null = null;
let nextT = 0;
let step = 0;
let inst = 0;
let bus: GainNode | null = null;
let echoOut: GainNode | null = null;
let file: HTMLAudioElement | null = null;
let fileUrl: string | null = null;

function ensureBus(c: AudioContext, out: AudioNode): GainNode {
    if (bus) return bus;
    bus = c.createGain();
    bus.gain.value = 0.0001;
    bus.connect(out);
    // soft echo
    const d = c.createDelay(1);
    d.delayTime.value = 0.38;
    const fb = c.createGain();
    fb.gain.value = 0.3;
    echoOut = c.createGain();
    echoOut.gain.value = 0.35;
    bus.connect(d);
    d.connect(fb).connect(d);
    d.connect(echoOut).connect(out);
    return bus;
}

function note(c: AudioContext, dest: AudioNode, f: number, t: number, len: number, cfg: Cfg, vol: number) {
    const freq = f * Math.pow(2, cfg.oct || 0);
    const g = c.createGain();
    const total = len * cfg.d;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + cfg.a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + cfg.a + total);
    let tail: AudioNode = g;
    if (cfg.lp) {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = cfg.lp;
        g.connect(lp);
        tail = lp;
    }
    tail.connect(dest);
    for (const [ratio, gain] of cfg.parts) {
        const o = c.createOscillator();
        const og = c.createGain();
        o.type = cfg.w;
        o.frequency.value = freq * ratio;
        og.gain.value = gain;
        if (cfg.vib) {
            const l = c.createOscillator();
            const lg = c.createGain();
            l.frequency.value = cfg.vib;
            lg.gain.value = freq * ratio * 0.006;
            l.connect(lg).connect(o.frequency);
            l.start(t);
            l.stop(t + cfg.a + total + 0.1);
        }
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + cfg.a + total + 0.1);
    }
}

function tick() {
    const a = audio();
    if (!a || !bus) return;
    const cfg = CFG[inst];
    const beat = 60 / 76; // seconds per quarter note
    while (nextT < a.c.currentTime + 1.2) {
        const eighth = step % 8;
        const bar = Math.floor(step / 8) % 4;
        if (nextT < a.c.currentTime) nextT = a.c.currentTime + 0.05;
        if (eighth === 0) {
            // soft chord under the melody
            CHORDS[bar].forEach((f, i) => note(a.c, bus!, f / 2, nextT + i * 0.03, beat * 3, CFG[9], 0.05));
        }
        if (Math.random() < (eighth % 2 === 0 ? 0.8 : 0.45)) {
            const chord = CHORDS[bar];
            const useChord = Math.random() < 0.55;
            const f = useChord ? chord[Math.floor(Math.random() * 3)] * (Math.random() < 0.5 ? 2 : 1) : SCALE[Math.floor(Math.random() * SCALE.length)];
            note(a.c, bus!, f, nextT, beat * 0.9, cfg, 0.1);
        }
        nextT += beat / 2;
        step++;
    }
}

export function startMusic() {
    stopMusic();
    const s = store.get().settings;
    if (!s.music) return;
    const a = audio();
    if (!a) return;
    inst = s.instrument;
    if (file) {
        file.volume = 0.6;
        void file.play().catch(() => {});
        return;
    }
    const b = ensureBus(a.c, a.out);
    b.gain.cancelScheduledValues(a.c.currentTime);
    b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), a.c.currentTime);
    b.gain.exponentialRampToValueAtTime(0.7, a.c.currentTime + 2);
    nextT = a.c.currentTime + 0.1;
    step = 0;
    timer = window.setInterval(tick, 250);
    tick();
}

export function stopMusic() {
    if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
    }
    if (bus && audio()) {
        const c = audio()!.c;
        bus.gain.cancelScheduledValues(c.currentTime);
        bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), c.currentTime);
        bus.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4);
    }
    file?.pause();
}

export function setInstrument(i: number) {
    inst = i;
    if (file) clearSong(false);
    store.patchSettings({ instrument: i, music: true, songName: null });
    startMusic();
}

export function setSong(f: File) {
    clearSong(false);
    fileUrl = URL.createObjectURL(f);
    file = new Audio(fileUrl);
    file.loop = true;
    file.volume = 0.6;
    store.patchSettings({ songName: f.name, music: true });
    startMusic();
}

export function clearSong(restart = true) {
    file?.pause();
    file = null;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = null;
    store.patchSettings({ songName: null });
    if (restart) startMusic();
}

export function setMusicOn(on: boolean) {
    store.patchSettings({ music: on });
    if (on) startMusic();
    else stopMusic();
}
