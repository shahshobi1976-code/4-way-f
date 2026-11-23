import { store } from '../state/store';
import { removeHahahaOnly } from './banter';
import { binaryPayloadToAudioUrl, binaryPayloadToUint8Array, revokeAudioUrl } from './audioCapture';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let voiceCompressor: DynamicsCompressorNode | null = null;
let voiceGain: GainNode | null = null;

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
        const st = ctx.state as string;
        if (st === 'suspended' || st === 'interrupted') {
            void ctx.resume().catch(() => {});
        }
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

const sfxBuffers = new Map<string, AudioBuffer>();
const sfxLoading = new Map<string, Promise<AudioBuffer | null>>();

const BUNDLED_SFX_URLS: Record<string, string> = {
    click: '/audio/click.mp3',
    dice: '/audio/dice-roll.mp3',
    heartbeat: '/audio/heartbeat.mp3',
    notification: '/audio/notification.mp3',
    pawnMove: '/audio/pawn-move.mp3',
    whoosh: '/audio/whoosh.mp3',
};

async function loadSfxBuffer(key: string): Promise<AudioBuffer | null> {
    if (sfxBuffers.has(key)) return sfxBuffers.get(key)!;
    const inflight = sfxLoading.get(key);
    if (inflight) return inflight;
    const url = BUNDLED_SFX_URLS[key];
    if (!url || typeof fetch === 'undefined') return null;

    const p = (async () => {
        try {
            const a = audio();
            if (!a) return null;
            const res = await fetch(url);
            if (!res.ok) return null;
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('text/html')) return null;
            const decoded = await a.c.decodeAudioData(await res.arrayBuffer());
            sfxBuffers.set(key, decoded);
            return decoded;
        } catch {
            return null;
        } finally {
            sfxLoading.delete(key);
        }
    })();

    sfxLoading.set(key, p);
    return p;
}

function playBufferedSfx(key: string, volume = 0.75, maxSec?: number, onStopRegister?: (src: AudioBufferSourceNode, gain: GainNode) => void): boolean {
    const a = audio();
    if (!a) return false;
    const buf = sfxBuffers.get(key);
    if (!buf) {
        void loadSfxBuffer(key);
        return false;
    }
    try {
        const t0 = a.c.currentTime;
        const src = a.c.createBufferSource();
        src.buffer = buf;
        const g = a.c.createGain();
        const dur = maxSec ? Math.min(buf.duration, maxSec) : buf.duration;
        g.gain.setValueAtTime(volume, t0);
        if (maxSec && buf.duration > maxSec && dur > 0.15) {
            g.gain.setValueAtTime(volume, t0 + dur - 0.12);
            g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        }
        src.connect(g).connect(a.out);
        if (onStopRegister) onStopRegister(src, g);
        src.start(t0, 0, maxSec ? dur : undefined);
        return true;
    } catch {
        return false;
    }
}

/** Wooden dice rattling over a wooden board for `ms` milliseconds, ending with a settling knock. */
export function diceRoll(ms: number) {
    if (!soundOn()) return;
    if (playBufferedSfx('dice', 0.8, Math.max(0.5, ms / 1000))) return;
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

const activeHeartbeatNodes: { o: AudioScheduledSourceNode; g: GainNode }[] = [];
let heartbeatPlaying = false;

export function stopHeartbeat() {
    heartbeatPlaying = false;
    while (activeHeartbeatNodes.length > 0) {
        const node = activeHeartbeatNodes.pop()!;
        try {
            node.o.stop();
        } catch {
            /* already stopped */
        }
        try {
            node.o.disconnect();
            node.g.disconnect();
        } catch {
            /* ignore */
        }
    }
}

export function heartbeat() {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    stopHeartbeat();
    heartbeatPlaying = true;
    if (
        playBufferedSfx('heartbeat', 0.72, 2.6, (src, g) => {
            const entry = { o: src, g };
            activeHeartbeatNodes.push(entry);
            src.onended = () => {
                const idx = activeHeartbeatNodes.indexOf(entry);
                if (idx !== -1) activeHeartbeatNodes.splice(idx, 1);
                if (activeHeartbeatNodes.length === 0) heartbeatPlaying = false;
            };
        })
    ) {
        return;
    }
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
            const entry = { o, g };
            activeHeartbeatNodes.push(entry);
            o.onended = () => {
                const idx = activeHeartbeatNodes.indexOf(entry);
                if (idx !== -1) activeHeartbeatNodes.splice(idx, 1);
                if (activeHeartbeatNodes.length === 0) heartbeatPlaying = false;
            };
        }
    }
}

export function isHeartbeatPlaying(): boolean {
    return heartbeatPlaying;
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
    for (const k of Object.keys(BUNDLED_SFX_URLS)) {
        void loadSfxBuffer(k);
    }
}

const CAR_VOL = 0.5; // half volume, as requested

/** Move sound for a token; uses bundled pawn-move MP3 when loaded, else car clip / synth. */
export function carMove(ms: number) {
    if (!soundOn()) return;
    const dur = Math.min(2.6, Math.max(0.25, ms / 1000));
    if (playBufferedSfx('pawnMove', 0.65, dur)) return;
    const a = audio();
    if (!a) return;
    const t0 = a.c.currentTime;
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
    if (playBufferedSfx('click', 0.6)) return;
    const a = audio();
    if (!a) return;
    clack(a.c, a.out, a.c.currentTime, 0.25, 1800);
}

export function notifySfx() {
    if (!soundOn()) return;
    if (playBufferedSfx('notification', 0.65)) return;
    tap();
}

export function whoosh() {
    if (!soundOn()) return;
    if (playBufferedSfx('whoosh', 0.55)) return;
    tap();
}

/** Subtle clock tick for urgent turn timer warnings (last 5 seconds). */
export function tick() {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    const { c, out } = a;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(440, t + 0.04);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.05);
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
    id: 'id-ID', de: 'de-DE', ja: 'ja-JP', tr: 'tr-TR', vi: 'vi-VN',
    ko: 'ko-KR', it: 'it-IT', fa: 'fa-IR', ta: 'ta-IN', te: 'te-IN',
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

const TTS_LANG: Record<string, string> = {
    zh: 'zh-CN', hi: 'hi', es: 'es', fr: 'fr', ar: 'ar', bn: 'bn', pt: 'pt', ru: 'ru', ur: 'ur',
    id: 'id', de: 'de', ja: 'ja', tr: 'tr', vi: 'vi', ko: 'ko', it: 'it', fa: 'fa', ta: 'ta', te: 'te',
};

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

/** Raw speech synthesizer for an individual sentence. Resolves when audio ends. */
function rawSpeak(o: SpeakOpts): Promise<void> {
    return new Promise<void>((resolve) => {
        const fallbackMs = Math.min(4200, 900 + o.text.length * 55);
        if (!soundOn() || store.get().settings.aiMute) {
            resolve();
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
        text = removeHahahaOnly(clean(text, lang));
        if (!text) {
            resolve();
            return;
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

export interface SpeechQueueItem extends SpeakOpts {
    onComplete?: () => void;
}

/** Immediately clears all previous bubbles from the DOM and state whenever a player speaks or finishes a sentence */
export function _removeAllSpeechBalloons() {
    try {
        if (typeof document !== 'undefined') {
            const externalBubbles = document.querySelectorAll('.external-speech-balloon, [data-external-balloon="true"]');
            externalBubbles.forEach((el) => {
                if (el.parentNode) el.parentNode.removeChild(el);
            });
        }
    } catch {
        /* ignore */
    }
    store.patch({ activeSpeechBalloon: null });
}

// Global speech state and atomic single-speaker lock
if (typeof window !== 'undefined') {
    (window as any)._isSpeaking = false;
    (window as any)._currentSpeakerIdx = null;
    (window as any)._aiSpeechQueue = (window as any)._aiSpeechQueue || [];
    (window as any)._removeAllSpeechBalloons = _removeAllSpeechBalloons;
}

let isProcessingSpeechQueue = false;

async function processSpeechQueue() {
    if (typeof window === 'undefined') return;
    if (isProcessingSpeechQueue) return;
    isProcessingSpeechQueue = true;

    while (Array.isArray((window as any)._aiSpeechQueue) && (window as any)._aiSpeechQueue.length > 0) {
        const item: SpeechQueueItem = (window as any)._aiSpeechQueue.shift();
        if (!item) break;

        // Enforce atomic lock: strict single-speaker turn-taking
        (window as any)._isSpeaking = true;
        (window as any)._currentSpeakerIdx = item.player;

        const cleanedText = removeHahahaOnly(item.text);
        const cleanedAlt = item.altText ? removeHahahaOnly(item.altText) : undefined;

        // Balloon display exclusively for the active speaker: clear previous bubbles first
        _removeAllSpeechBalloons();
        if (cleanedText) {
            store.patch({
                activeSpeechBalloon: {
                    idx: item.player,
                    text: cleanedText,
                },
            });
        }

        // Perform speech synthesis for active speaker
        await rawSpeak({
            ...item,
            text: cleanedText,
            altText: cleanedAlt,
        });

        // Clear speech balloon immediately when sentence completes
        _removeAllSpeechBalloons();

        // Release atomic lock
        (window as any)._isSpeaking = false;
        (window as any)._currentSpeakerIdx = null;

        if (item.onComplete) {
            item.onComplete();
        }

        // Clean natural pause (350ms) as mandated by spec before next AI in queue speaks
        if (Array.isArray((window as any)._aiSpeechQueue) && (window as any)._aiSpeechQueue.length > 0) {
            await new Promise<void>((r) => setTimeout(r, 350));
        }
    }

    (window as any)._isSpeaking = false;
    (window as any)._currentSpeakerIdx = null;
    isProcessingSpeechQueue = false;
}

// ---------------------------------------------------------------- Human Voice Note & Whisper Playback
const clipBufferCache = new Map<string, AudioBuffer>();
const decodingClipPromises = new Map<string, Promise<AudioBuffer | null>>();
let activeHumanClipCount = 0;
let activeHtmlAudio: HTMLAudioElement | null = null;
let activeBufferSrc: AudioBufferSourceNode | null = null;
const humanPlaybackListeners = new Set<(playing: boolean) => void>();

export function getIsHumanAudioPlaying(): boolean {
    return activeHumanClipCount > 0;
}

export function subscribeHumanAudioPlaying(cb: (playing: boolean) => void): () => void {
    humanPlaybackListeners.add(cb);
    return () => humanPlaybackListeners.delete(cb);
}

function setHumanPlayingDelta(delta: number) {
    const prev = activeHumanClipCount > 0;
    activeHumanClipCount = Math.max(0, activeHumanClipCount + delta);
    const next = activeHumanClipCount > 0;
    if (prev !== next) {
        humanPlaybackListeners.forEach((cb) => {
            try { cb(next); } catch {}
        });
    }
}

function ensureVoiceBus(c: AudioContext, out: GainNode): GainNode {
    if (!voiceCompressor || !voiceGain) {
        voiceCompressor = c.createDynamicsCompressor();
        voiceCompressor.threshold.value = -18;
        voiceCompressor.knee.value = 18;
        voiceCompressor.ratio.value = 4;
        voiceCompressor.attack.value = 0.005;
        voiceCompressor.release.value = 0.15;

        voiceGain = c.createGain();
        voiceGain.gain.value = 1.25;
        voiceCompressor.connect(voiceGain);
        voiceGain.connect(out);
    }
    return voiceCompressor as unknown as GainNode;
}

/** Pre-decode an incoming binary voice/whisper clip immediately on receipt for instant playback. */
export function cacheAudioClip(clipId: string, payload: unknown): Promise<AudioBuffer | null> {
    if (!clipId || !payload) return Promise.resolve(null);
    const existing = clipBufferCache.get(clipId);
    if (existing) return Promise.resolve(existing);
    const inflight = decodingClipPromises.get(clipId);
    if (inflight) return inflight;

    const a = audio();
    const bytes = binaryPayloadToUint8Array(payload);
    if (!a || !bytes || bytes.byteLength === 0) return Promise.resolve(null);

    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);

    const p = a.c
        .decodeAudioData(copy)
        .then((decoded) => {
            if (clipBufferCache.size > 60) {
                const oldestKey = clipBufferCache.keys().next().value;
                if (oldestKey) clipBufferCache.delete(oldestKey);
            }
            clipBufferCache.set(clipId, decoded);
            decodingClipPromises.delete(clipId);
            return decoded;
        })
        .catch(() => {
            decodingClipPromises.delete(clipId);
            return null;
        });

    decodingClipPromises.set(clipId, p);
    return p;
}

export function stopHumanAudio() {
    if (activeBufferSrc) {
        try { activeBufferSrc.stop(); } catch {}
        try { activeBufferSrc.disconnect(); } catch {}
        activeBufferSrc = null;
    }
    if (activeHtmlAudio) {
        try {
            activeHtmlAudio.pause();
            activeHtmlAudio.currentTime = 0;
        } catch {}
        activeHtmlAudio = null;
    }
    if (activeHumanClipCount > 0) {
        activeHumanClipCount = 0;
        humanPlaybackListeners.forEach((cb) => {
            try { cb(false); } catch {}
        });
    }
}

/**
 * Play a human voice note or whisper synchronously inside the call/gesture frame (no `await` before start).
 */
export function playAudioClip(
    clipId: string,
    payload: unknown,
    mimeType?: string,
    opts?: { onEnded?: () => void; onAutoplayBlocked?: () => void },
): { ok: boolean; blockedByAutoplay: boolean } {
    if (!soundOn()) {
        opts?.onEnded?.();
        return { ok: false, blockedByAutoplay: false };
    }

    stopHumanAudio();
    const a = audio();
    const cached = clipBufferCache.get(clipId);

    // Pause routine AI speech while human voice/whisper plays
    try { window.speechSynthesis?.cancel(); } catch {}

    if (a && cached && a.c.state === 'running') {
        try {
            const src = a.c.createBufferSource();
            src.buffer = cached;
            const targetBus = ensureVoiceBus(a.c, a.out);
            src.connect(targetBus);
            activeBufferSrc = src;
            setHumanPlayingDelta(1);
            let ended = false;
            const finish = () => {
                if (ended) return;
                ended = true;
                if (activeBufferSrc === src) activeBufferSrc = null;
                setHumanPlayingDelta(-1);
                opts?.onEnded?.();
            };
            src.onended = finish;
            src.start(0);
            return { ok: true, blockedByAutoplay: false };
        } catch {
            /* fall through to synchronous HTMLAudioElement */
        }
    }

    const media = binaryPayloadToAudioUrl(payload, mimeType);
    if (!media) {
        opts?.onEnded?.();
        return { ok: false, blockedByAutoplay: false };
    }

    const el = new Audio(media.url);
    el.preload = 'auto';
    el.volume = 1;
    activeHtmlAudio = el;
    setHumanPlayingDelta(1);

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (activeHtmlAudio === el) activeHtmlAudio = null;
        revokeAudioUrl(media);
        setHumanPlayingDelta(-1);
        opts?.onEnded?.();
    };

    el.onended = cleanup;
    el.onerror = cleanup;

    try {
        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((err: any) => {
                const blocked = err?.name === 'NotAllowedError' || /notallowed|gesture|interact/i.test(String(err?.message || ''));
                cleanup();
                if (blocked) opts?.onAutoplayBlocked?.();
            });
        }
        return { ok: true, blockedByAutoplay: false };
    } catch {
        cleanup();
        opts?.onAutoplayBlocked?.();
        return { ok: false, blockedByAutoplay: true };
    }
}

let seatMuteChecker: ((seatIdx: number) => boolean) | null = null;
export function registerSeatMuteChecker(fn: ((seatIdx: number) => boolean) | null) {
    seatMuteChecker = fn;
}

/** Speak a line; safely queues incoming speech while another AI is speaking, ensuring no overlapping speech. */
export function speak(o: SpeakOpts): Promise<void> {
    return new Promise<void>((resolve) => {
        if (
            typeof window === 'undefined' ||
            store.get().settings.aiMute ||
            (seatMuteChecker && seatMuteChecker(o.player)) ||
            activeHumanClipCount > 0
        ) {
            resolve();
            return;
        }

        if (!Array.isArray((window as any)._aiSpeechQueue)) {
            (window as any)._aiSpeechQueue = [];
        }

        (window as any)._aiSpeechQueue.push({
            ...o,
            onComplete: resolve,
        });

        void processSpeechQueue();
    });
}

export function stopSpeech() {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    if (typeof window !== 'undefined') {
        (window as any)._isSpeaking = false;
        (window as any)._currentSpeakerIdx = null;
        if (Array.isArray((window as any)._aiSpeechQueue)) {
            (window as any)._aiSpeechQueue.length = 0;
        }
    }
    _removeAllSpeechBalloons();
}
