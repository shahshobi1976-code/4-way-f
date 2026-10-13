// Sound effects (all synthesised with WebAudio) and spoken lines (browser speech synthesis).
import { store } from '../state/store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audio(): { c: AudioContext; out: GainNode } | null {
    try {
        if (!ctx) {
            const C = window.AudioContext || (window as any).webkitAudioContext;
            if (!C) return null;
            ctx = new C();
            master = ctx.createGain();
            master.gain.value = 0.9;
            master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') void ctx.resume();
        return { c: ctx, out: master! };
    } catch {
        return null;
    }
}

const soundOn = () => store.get().settings.sound;

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
    const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
}

function clack(c: AudioContext, out: AudioNode, t: number, vol: number, freq: number) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.05);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(bp).connect(g).connect(out);
    src.start(t);
    // low wooden "tok"
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 0.22, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.12, t + 0.05);
    og.gain.setValueAtTime(vol * 0.7, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.08);
}

/** Wooden dice rattling over a wooden board for `ms` milliseconds, ending with a settling knock. */
export function diceRoll(ms: number) {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    const t0 = a.c.currentTime;
    const dur = ms / 1000;
    let t = 0;
    let gap = 0.035;
    while (t < dur * 0.9) {
        clack(a.c, a.out, t0 + t, 0.55 * (1 - t / dur) + 0.12, 1100 + Math.random() * 900);
        t += gap * (0.8 + Math.random() * 0.5);
        gap *= 1.07;
    }
    clack(a.c, a.out, t0 + dur * 0.97, 0.7, 900);
    clack(a.c, a.out, t0 + dur * 0.97 + 0.07, 0.4, 1300);
}

export function heartbeat() {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    const t0 = a.c.currentTime;
    for (let beat = 0; beat < 3; beat++) {
        for (const [off, f, v] of [[0, 62, 0.9], [0.2, 52, 0.65]] as const) {
            const t = t0 + beat * 0.85 + off;
            const o = a.c.createOscillator();
            const g = a.c.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(f * 1.6, t);
            o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(v, t + 0.015);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            o.connect(g).connect(a.out);
            o.start(t);
            o.stop(t + 0.25);
        }
    }
}

let carBuf: AudioBuffer | null = null;
let carTried = false;
async function loadCarFile() {
    if (carTried) return;
    carTried = true;
    try {
        const a = audio();
        if (!a) return;
        // Optional: drop your own clip at public/audio/car.mp3 and it is used instead of the synth engine.
        const res = await fetch('./audio/car.mp3');
        if (!res.ok) return;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html')) return;
        carBuf = await a.c.decodeAudioData(await res.arrayBuffer());
    } catch {
        /* no custom clip: synth engine stays */
    }
}
export function preloadSounds() {
    void loadCarFile();
}

const CAR_VOL = 0.5; // half volume, as requested

/** Race-car rev for a token move; `ms` is how long the move takes. */
export function carMove(ms: number) {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    const t0 = a.c.currentTime;
    const dur = Math.min(2.6, ms / 1000);
    if (carBuf) {
        const s = a.c.createBufferSource();
        s.buffer = carBuf;
        s.playbackRate.value = 0.8;
        const g = a.c.createGain();
        g.gain.setValueAtTime(CAR_VOL, t0);
        g.gain.setValueAtTime(CAR_VOL, t0 + Math.max(0, dur - 0.3));
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        s.connect(g).connect(a.out);
        s.start(t0, 0, dur);
        return;
    }
    const o = a.c.createOscillator();
    const o2 = a.c.createOscillator();
    const lp = a.c.createBiquadFilter();
    const g = a.c.createGain();
    o.type = 'sawtooth';
    o2.type = 'square';
    o.frequency.setValueAtTime(60, t0);
    o.frequency.exponentialRampToValueAtTime(190, t0 + dur * 0.7);
    o.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    o2.frequency.setValueAtTime(30, t0);
    o2.frequency.exponentialRampToValueAtTime(95, t0 + dur * 0.7);
    o2.frequency.exponentialRampToValueAtTime(60, t0 + dur);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(380, t0);
    lp.frequency.exponentialRampToValueAtTime(1500, t0 + dur * 0.7);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18 * CAR_VOL * 2, t0 + 0.12);
    g.gain.setValueAtTime(0.18 * CAR_VOL * 2, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(a.out);
    o.start(t0);
    o2.start(t0);
    o.stop(t0 + dur + 0.05);
    o2.stop(t0 + dur + 0.05);
}

export function fanfare() {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    const t0 = a.c.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => {
        const t = t0 + i * 0.11;
        const o = a.c.createOscillator();
        const g = a.c.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + (i > 3 ? 0.5 : 0.2));
        o.connect(g).connect(a.out);
        o.start(t);
        o.stop(t + 0.6);
    });
}

export function buzzer() {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    const t0 = a.c.currentTime;
    [0, 0.32].forEach((off, i) => {
        const o = a.c.createOscillator();
        const g = a.c.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(i ? 82 : 110, t0 + off);
        g.gain.setValueAtTime(0.22, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + off + 0.3);
        o.connect(g).connect(a.out);
        o.start(t0 + off);
        o.stop(t0 + off + 0.32);
    });
}

export function tap() {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    clack(a.c, a.out, a.c.currentTime, 0.25, 1800);
}

function talkBleep(ms: number) {
    const a = audio();
    if (!a) return;
    const t0 = a.c.currentTime;
    const n = Math.max(2, Math.floor(ms / 110));
    for (let i = 0; i < n; i++) {
        const o = a.c.createOscillator();
        const g = a.c.createGain();
        o.type = 'triangle';
        o.frequency.value = 280 + Math.random() * 260;
        const t = t0 + i * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g).connect(a.out);
        o.start(t);
        o.stop(t + 0.12);
    }
}

// ---------------------------------------------------------------- speech

const LANG_CODE: Record<string, string> = {
    en: 'en-US', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', fr: 'fr-FR',
    ar: 'ar-SA', bn: 'bn-IN', pt: 'pt-BR', ru: 'ru-RU', ur: 'ur-PK',
};

// per player (colour) pitch and speed for English; red is a little slower than the rest
const EN_VOICE: { pitch: number; rate: number }[] = [
    { pitch: 1.0, rate: 0.95 },
    { pitch: 1.25, rate: 1.05 },
    { pitch: 0.8, rate: 0.9 },
    { pitch: 1.1, rate: 1.0 },
];
// other languages stay near natural pitch so they stay clear
const OTHER_VOICE: { pitch: number; rate: number }[] = [
    { pitch: 1.0, rate: 0.85 },
    { pitch: 1.06, rate: 0.88 },
    { pitch: 0.96, rate: 0.84 },
    { pitch: 1.03, rate: 0.86 },
];

function voices(): SpeechSynthesisVoice[] {
    try {
        return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    } catch {
        return [];
    }
}

function findVoices(lang: string): SpeechSynthesisVoice[] {
    const code = (LANG_CODE[lang] || 'en-US').toLowerCase();
    const base = code.slice(0, 2);
    const vs = voices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base));
    // prefer natural / network voices, then the exact region
    return vs.sort((a, b) => {
        const sa = (/natural|google|online|neural/i.test(a.name) ? 2 : 0) + (a.lang.toLowerCase() === code ? 1 : 0);
        const sb = (/natural|google|online|neural/i.test(b.name) ? 2 : 0) + (b.lang.toLowerCase() === code ? 1 : 0);
        return sb - sa;
    });
}

export function hasVoice(lang: string): boolean {
    return findVoices(lang).length > 0;
}

export interface SpeakOpts {
    text: string;
    /** Alternative text read when the device has no voice for `lang` (Urdu falls back to Hindi script). */
    altText?: string;
    altLang?: string;
    lang: string;
    player: number;
    slow?: boolean;
    cancelCurrent?: boolean;
}

function clean(text: string, lang: string): string {
    let t = text.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
    if (lang !== 'en') t = t.replace(/[…—–]+/g, ', ').replace(/\.\.\./g, ', ');
    return t;
}

const TTS_LANG: Record<string, string> = { zh: 'zh-CN', hi: 'hi', es: 'es', fr: 'fr', ar: 'ar', bn: 'bn', pt: 'pt', ru: 'ru', ur: 'ur' };

/** Unofficial online text-to-speech fallback (Google Translate voice). May be blocked or stop working. */
async function onlineSpeak(text: string, lang: string, player: number): Promise<boolean> {
    const tl = TTS_LANG[lang];
    if (!tl) return false;
    const parts = (text.match(/[^.!?,;।۔]+[.!?,;।۔]*/g) || [text]).map((x) => x.trim()).filter(Boolean);
    const chunks: string[] = [];
    for (const part of parts) {
        if (part.length <= 170) chunks.push(part);
        else for (let i = 0; i < part.length; i += 170) chunks.push(part.slice(i, i + 170));
    }
    let played = false;
    for (const c of chunks) {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(c)}`;
        const ok = await new Promise<boolean>((res) => {
            const au = new Audio(url);
            au.playbackRate = 0.92 + (player % 4) * 0.04;
            const guard = window.setTimeout(() => res(false), 9000);
            au.onended = () => { window.clearTimeout(guard); res(true); };
            au.onerror = () => { window.clearTimeout(guard); res(false); };
            au.play().catch(() => { window.clearTimeout(guard); res(false); });
        });
        if (!ok) return played;
        played = true;
    }
    return played;
}

/** Speak a line; resolves when it ends (or after a safety timeout). Never rejects. */
export function speak(o: SpeakOpts): Promise<void> {
    return new Promise<void>((resolve) => {
        const fallbackMs = Math.min(4200, 900 + o.text.length * 55);
        if (!soundOn()) {
            window.setTimeout(resolve, Math.min(2200, fallbackMs));
            return;
        }
        const synth = (() => {
            try { return window.speechSynthesis; } catch { return undefined; }
        })();
        if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
            talkBleep(fallbackMs);
            window.setTimeout(resolve, fallbackMs);
            return;
        }
        let lang = o.lang;
        let text = o.text;
        if (!hasVoice(lang) && o.altText && o.altLang && hasVoice(o.altLang)) {
            lang = o.altLang;
            text = o.altText;
        }
        text = clean(text, lang);
        if (!text) {
            // emoji-only laughter
            text = lang === 'en' ? 'Ha ha ha ha!' : 'ha ha ha';
        }
        if (o.cancelCurrent) {
            try { synth.cancel(); } catch { /* ignore */ }
        }
        const vs = findVoices(lang);
        if (!vs.length && lang !== 'en') {
            // this device has no voice for the language: use an online voice instead (needs internet)
            void onlineSpeak(text, lang, o.player).then((ok) => {
                if (!ok) talkBleep(fallbackMs);
                resolve();
            });
            return;
        }
        const u = new SpeechSynthesisUtterance(text);
        if (vs.length) u.voice = vs[Math.min(vs.length - 1, o.player % Math.max(1, lang === 'en' ? vs.length : 1))];
        u.lang = LANG_CODE[lang] || 'en-US';
        const prof = (lang === 'en' ? EN_VOICE : OTHER_VOICE)[o.player % 4];
        u.pitch = prof.pitch;
        u.rate = prof.rate * (o.slow ? 0.9 : 1);
        u.volume = 1;
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            window.clearTimeout(guard);
            resolve();
        };
        u.onend = finish;
        u.onerror = () => {
            if (!vs.length) talkBleep(fallbackMs);
            finish();
        };
        const guard = window.setTimeout(finish, 9000);
        try {
            synth.speak(u);
        } catch {
            finish();
        }
    });
}

export function stopSpeech() {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
