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

function playBufferedSfx(
    key: string,
    volume = 0.75,
    maxSec?: number,
    onStopRegister?: (src: AudioBufferSourceNode, gain: GainNode) => void,
    offsetSec = 0,
): boolean {
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
        const safeOffset = Math.max(0, Math.min(buf.duration - 0.05, offsetSec));
        const available = Math.max(0.05, buf.duration - safeOffset);
        const dur = maxSec ? Math.min(available, maxSec) : available;
        const g = a.c.createGain();
        g.gain.setValueAtTime(volume, t0);
        if ((maxSec && available > maxSec && dur > 0.15) || dur > 0.25) {
            g.gain.setValueAtTime(volume, t0 + Math.max(0.02, dur - 0.18));
            g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        }
        src.connect(g).connect(a.out);
        if (onStopRegister) onStopRegister(src, g);
        src.start(t0, safeOffset, maxSec || safeOffset > 0 ? dur : undefined);
        return true;
    } catch {
        return false;
    }
}

/** Wooden dice rattling over a wooden board for `ms` milliseconds, ending with a settling knock. */
export function diceRoll(ms: number) {
    if (!soundOn()) return;
    if (playBufferedSfx('dice', 0.85, Math.max(0.45, ms / 1000), undefined, 0.05)) return;
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

/** Tactile wooden-board impact when the dice physically touch/bounce on the board. */
export function diceHit(strength = 1.0) {
    if (!soundOn()) return;
    const a = audio();
    if (!a) return;
    const t0 = a.c.currentTime;
    const s = Math.max(0.15, Math.min(1.2, strength));
    clack(a.c, a.out, t0, 0.72 * s, 980 + Math.random() * 240);
    clack(a.c, a.out, t0 + 0.024, 0.52 * s, 1280 + Math.random() * 280);
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
    if (playBufferedSfx('whoosh', 0.55, 1.15, undefined, 0.48)) return;
    tap();
}

/** Crisp capture impact + knock-back whoosh when sending an opponent token back to base. */
export function capture() {
    if (!soundOn()) return;
    stopHeartbeat();
    const a = audio();
    if (a) {
        const { c, out } = a;
        const now = c.currentTime;

        const osc1 = c.createOscillator();
        const gain1 = c.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(240, now);
        osc1.frequency.exponentialRampToValueAtTime(52, now + 0.28);
        gain1.gain.setValueAtTime(0.45, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.connect(gain1).connect(out);
        osc1.start(now);
        osc1.stop(now + 0.32);

        const osc2 = c.createOscillator();
        const gain2 = c.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(660, now + 0.04);
        osc2.frequency.exponentialRampToValueAtTime(160, now + 0.24);
        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.linearRampToValueAtTime(0.32, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc2.connect(gain2).connect(out);
        osc2.start(now + 0.03);
        osc2.stop(now + 0.28);
    }
    if (!playBufferedSfx('whoosh', 0.85, 1.15, undefined, 0.48)) {
        void loadSfxBuffer('whoosh').then((buf) => {
            if (buf && soundOn()) {
                playBufferedSfx('whoosh', 0.85, 1.15, undefined, 0.48);
            }
        });
    }
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

// Male & female voice pitch/rate styling per seat
const EN_MALE_VOICE: { pitch: number; rate: number }[] = [
    { pitch: 0.88, rate: 0.95 },
    { pitch: 0.94, rate: 0.99 },
    { pitch: 0.82, rate: 0.92 },
    { pitch: 0.91, rate: 0.97 },
];
const EN_FEMALE_VOICE: { pitch: number; rate: number }[] = [
    { pitch: 1.26, rate: 1.0 },
    { pitch: 1.32, rate: 1.04 },
    { pitch: 1.22, rate: 0.98 },
    { pitch: 1.28, rate: 1.02 },
];
// other languages stay closer to natural pitch so pronunciation stays clear while keeping gender distinction
const OTHER_MALE_VOICE: { pitch: number; rate: number }[] = [
    { pitch: 0.92, rate: 0.85 },
    { pitch: 0.96, rate: 0.88 },
    { pitch: 0.88, rate: 0.83 },
    { pitch: 0.94, rate: 0.86 },
];
const OTHER_FEMALE_VOICE: { pitch: number; rate: number }[] = [
    { pitch: 1.14, rate: 0.88 },
    { pitch: 1.18, rate: 0.91 },
    { pitch: 1.12, rate: 0.87 },
    { pitch: 1.16, rate: 0.90 },
];

const FEMALE_VOICE_RE = /female|woman|girl|samantha|victoria|karen|moira|tessa|fiona|veena|lekha|heera|kalpana|zira|hazel|susan|aria|jenny|natasha|sonia|neerja|swara|meera|kyoko|mei|ting|yuna|sora|claire|amelie|alice|paulina|monica|helene|lucia|fatima|salma|laila|zahra/i;
const MALE_VOICE_RE = /male|man|boy|daniel|alex|fred|jorge|thomas|oliver|george|ryan|arthur|david|mark|rishi|prabhat|madhur|otoya|hattori|luca|paolo|diego|carlos|maged|tarik|naayf/i;

function resolveSpeakerGender(playerIdx: number, explicit?: 'male' | 'female'): 'male' | 'female' {
    if (explicit === 'male' || explicit === 'female') return explicit;
    const st = store.get();
    const pl = st.players[playerIdx];
    if (pl?.gender === 'male' || pl?.gender === 'female') return pl.gender;
    if (pl?.avatar === '👸') return 'female';
    if (pl?.avatar === '🤴') return 'male';
    return st.gender || 'male';
}

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

function pickVoiceForGender(
    vs: SpeechSynthesisVoice[],
    gender: 'male' | 'female',
    player: number,
    lang: string,
): SpeechSynthesisVoice | undefined {
    if (!vs.length) return undefined;
    const matched = vs.filter((v) =>
        gender === 'female'
            ? FEMALE_VOICE_RE.test(v.name)
            : MALE_VOICE_RE.test(v.name) && !FEMALE_VOICE_RE.test(v.name),
    );
    const pool = matched.length > 0 ? matched : vs;
    return pool[Math.min(pool.length - 1, player % Math.max(1, lang === 'en' ? pool.length : 1))];
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
    gender?: 'male' | 'female';
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
async function onlineSpeak(text: string, lang: string, player: number, gender: 'male' | 'female' = 'male'): Promise<boolean> {
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
            au.playbackRate = (gender === 'female' ? 1.02 : 0.92) + (player % 4) * 0.03;
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
        const speakerGender = resolveSpeakerGender(o.player, o.gender);
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
            void onlineSpeak(text, lang, o.player, speakerGender).then((ok) => {
                if (!ok) talkBleep(fallbackMs);
                resolve();
            });
            return;
        }
        const u = new SpeechSynthesisUtterance(text);
        const pickedVoice = pickVoiceForGender(vs, speakerGender, o.player, lang);
        if (pickedVoice) u.voice = pickedVoice;
        u.lang = LANG_CODE[lang] || 'en-US';
        const prof = (
            lang === 'en'
                ? (speakerGender === 'female' ? EN_FEMALE_VOICE : EN_MALE_VOICE)
                : (speakerGender === 'female' ? OTHER_FEMALE_VOICE : OTHER_MALE_VOICE)
        )[o.player % 4];
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

// ---------------------------------------------------------------- Procedural Animal Voices & Character SFX
import {
    isAnimalTokenKind,
    isHumanTokenKind,
    resolveSeatTokenKind,
    type AnimalTokenKind,
    type HumanGenderMode,
    type HumanTokenKind,
    type ResolvedTokenKind,
    type TokenStyleId,
} from './tokens';

function characterDuckGain(base = 1): number {
    // Duck routine character/animal SFX cleanly while human voice notes or whispers play
    return (activeHumanClipCount > 0 ? 0.24 : 1.0) * base;
}

function playFilteredNoiseBurst(
    c: AudioContext,
    out: AudioNode,
    t0: number,
    dur: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    vol: number,
) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, dur + 0.04);
    const flt = c.createBiquadFilter();
    flt.type = filterType;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) flt.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.03, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(flt).connect(g).connect(out);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
}

function playAnimalVoice(kind: AnimalTokenKind, mode: 'full' | 'step', volScale: number) {
    const a = audio();
    if (!a) return;
    const { c, out } = a;
    const t0 = c.currentTime;
    const v = characterDuckGain(volScale);
    if (v <= 0.01) return;

    switch (kind) {
        case 'lion': {
            if (mode === 'step') {
                clack(c, out, t0, 0.22 * v, 420);
                return;
            }
            const o = c.createOscillator();
            const sub = c.createOscillator();
            const lfo = c.createOscillator();
            const lfoG = c.createGain();
            const lp = c.createBiquadFilter();
            const g = c.createGain();
            o.type = 'sawtooth';
            sub.type = 'triangle';
            o.frequency.setValueAtTime(135, t0);
            o.frequency.exponentialRampToValueAtTime(68, t0 + 0.65);
            sub.frequency.setValueAtTime(72, t0);
            sub.frequency.exponentialRampToValueAtTime(42, t0 + 0.65);
            lfo.frequency.value = 22;
            lfoG.gain.value = 18;
            lfo.connect(lfoG).connect(o.frequency);
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(620, t0);
            lp.frequency.exponentialRampToValueAtTime(240, t0 + 0.65);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.38 * v, t0 + 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
            o.connect(lp);
            sub.connect(lp);
            lp.connect(g).connect(out);
            lfo.start(t0); o.start(t0); sub.start(t0);
            lfo.stop(t0 + 0.72); o.stop(t0 + 0.72); sub.stop(t0 + 0.72);
            playFilteredNoiseBurst(c, out, t0 + 0.04, 0.55, 'bandpass', 420, 190, 2.2, 0.24 * v);
            break;
        }
        case 'elephant': {
            if (mode === 'step') {
                const o = c.createOscillator();
                const g = c.createGain();
                o.type = 'sine';
                o.frequency.setValueAtTime(86, t0);
                o.frequency.exponentialRampToValueAtTime(42, t0 + 0.14);
                g.gain.setValueAtTime(0.32 * v, t0);
                g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
                o.connect(g).connect(out);
                o.start(t0); o.stop(t0 + 0.16);
                return;
            }
            const o = c.createOscillator();
            const lfo = c.createOscillator();
            const lfoG = c.createGain();
            const bp = c.createBiquadFilter();
            const g = c.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(270, t0);
            o.frequency.exponentialRampToValueAtTime(660, t0 + 0.18);
            o.frequency.exponentialRampToValueAtTime(410, t0 + 0.62);
            lfo.frequency.value = 16;
            lfoG.gain.value = 26;
            lfo.connect(lfoG).connect(o.frequency);
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(900, t0);
            bp.Q.value = 2.4;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.4 * v, t0 + 0.07);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.66);
            o.connect(bp).connect(g).connect(out);
            lfo.start(t0); o.start(t0);
            lfo.stop(t0 + 0.68); o.stop(t0 + 0.68);
            break;
        }
        case 'eagle': {
            if (mode === 'step') {
                playFilteredNoiseBurst(c, out, t0, 0.09, 'bandpass', 720, 420, 1.5, 0.18 * v);
                return;
            }
            const o = c.createOscillator();
            const lfo = c.createOscillator();
            const lfoG = c.createGain();
            const g = c.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(2250, t0);
            o.frequency.exponentialRampToValueAtTime(1180, t0 + 0.45);
            lfo.frequency.value = 28;
            lfoG.gain.value = 95;
            lfo.connect(lfoG).connect(o.frequency);
            const bp = c.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 2100;
            bp.Q.value = 3.2;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.32 * v, t0 + 0.03);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.48);
            o.connect(bp).connect(g).connect(out);
            lfo.start(t0); o.start(t0);
            lfo.stop(t0 + 0.5); o.stop(t0 + 0.5);
            break;
        }
        case 'horse': {
            // Double hoof clop
            clack(c, out, t0, 0.28 * v, 1150);
            clack(c, out, t0 + 0.065, 0.22 * v, 1420);
            if (mode === 'step') return;
            const o = c.createOscillator();
            const lfo = c.createOscillator();
            const lfoG = c.createGain();
            const bp = c.createBiquadFilter();
            const g = c.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(760, t0 + 0.04);
            o.frequency.exponentialRampToValueAtTime(340, t0 + 0.56);
            lfo.frequency.value = 19;
            lfoG.gain.value = 55;
            lfo.connect(lfoG).connect(o.frequency);
            bp.type = 'bandpass';
            bp.frequency.value = 1100;
            bp.Q.value = 2.0;
            g.gain.setValueAtTime(0.0001, t0 + 0.04);
            g.gain.linearRampToValueAtTime(0.32 * v, t0 + 0.09);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.58);
            o.connect(bp).connect(g).connect(out);
            lfo.start(t0 + 0.04); o.start(t0 + 0.04);
            lfo.stop(t0 + 0.6); o.stop(t0 + 0.6);
            break;
        }
        case 'wolf': {
            if (mode === 'step') {
                clack(c, out, t0, 0.2 * v, 680);
                return;
            }
            const o = c.createOscillator();
            const lfo = c.createOscillator();
            const lfoG = c.createGain();
            const g = c.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(260, t0);
            o.frequency.exponentialRampToValueAtTime(495, t0 + 0.22);
            o.frequency.exponentialRampToValueAtTime(335, t0 + 0.78);
            lfo.frequency.value = 6.5;
            lfoG.gain.value = 14;
            lfo.connect(lfoG).connect(o.frequency);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.34 * v, t0 + 0.12);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.8);
            o.connect(g).connect(out);
            lfo.start(t0); o.start(t0);
            lfo.stop(t0 + 0.82); o.stop(t0 + 0.82);
            break;
        }
        case 'frog': {
            const pulses = mode === 'step' ? 1 : 2;
            for (let p = 0; p < pulses; p++) {
                const pt = t0 + p * 0.115;
                const o = c.createOscillator();
                const bp = c.createBiquadFilter();
                const g = c.createGain();
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(p === 0 ? 190 : 225, pt);
                o.frequency.exponentialRampToValueAtTime(p === 0 ? 330 : 440, pt + 0.075);
                bp.type = 'bandpass';
                bp.frequency.value = 780;
                bp.Q.value = 3.5;
                g.gain.setValueAtTime(0.0001, pt);
                g.gain.linearRampToValueAtTime(0.32 * v, pt + 0.015);
                g.gain.exponentialRampToValueAtTime(0.001, pt + 0.085);
                o.connect(bp).connect(g).connect(out);
                o.start(pt); o.stop(pt + 0.095);
            }
            break;
        }
        case 'cobra': {
            const bursts = mode === 'step' ? 1 : 3;
            for (let b = 0; b < bursts; b++) {
                playFilteredNoiseBurst(
                    c,
                    out,
                    t0 + b * 0.14,
                    mode === 'step' ? 0.08 : 0.11,
                    'bandpass',
                    4400,
                    3200,
                    2.6,
                    0.26 * v,
                );
            }
            break;
        }
        case 'gorilla': {
            const beats = mode === 'step' ? 1 : 3;
            for (let b = 0; b < beats; b++) {
                const bt = t0 + b * 0.11;
                const o = c.createOscillator();
                const g = c.createGain();
                o.type = 'sine';
                o.frequency.setValueAtTime(105, bt);
                o.frequency.exponentialRampToValueAtTime(48, bt + 0.09);
                g.gain.setValueAtTime(0.38 * v, bt);
                g.gain.exponentialRampToValueAtTime(0.001, bt + 0.1);
                o.connect(g).connect(out);
                o.start(bt); o.stop(bt + 0.11);
            }
            if (mode === 'full') {
                const gr = c.createOscillator();
                const gg = c.createGain();
                gr.type = 'sawtooth';
                gr.frequency.setValueAtTime(118, t0 + 0.34);
                gr.frequency.exponentialRampToValueAtTime(76, t0 + 0.54);
                gg.gain.setValueAtTime(0.22 * v, t0 + 0.34);
                gg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.56);
                gr.connect(gg).connect(out);
                gr.start(t0 + 0.34); gr.stop(t0 + 0.58);
            }
            break;
        }
        case 'kangaroo': {
            const o = c.createOscillator();
            const g = c.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(145, t0);
            o.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);
            g.gain.setValueAtTime(0.34 * v, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
            o.connect(g).connect(out);
            o.start(t0); o.stop(t0 + 0.14);
            if (mode === 'full') {
                const c2 = c.createOscillator();
                const g2 = c.createGain();
                c2.type = 'sawtooth';
                c2.frequency.setValueAtTime(360, t0 + 0.12);
                c2.frequency.exponentialRampToValueAtTime(220, t0 + 0.28);
                g2.gain.setValueAtTime(0.24 * v, t0 + 0.12);
                g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
                c2.connect(g2).connect(out);
                c2.start(t0 + 0.12); c2.stop(t0 + 0.32);
            }
            break;
        }
        case 'rooster': {
            if (mode === 'step') {
                clack(c, out, t0, 0.2 * v, 1950);
                return;
            }
            // 4-syllable "cock-a-doodle-doo!"
            const notes = [
                { off: 0, f0: 660, f1: 760, d: 0.08 },
                { off: 0.11, f0: 780, f1: 920, d: 0.08 },
                { off: 0.22, f0: 840, f1: 1020, d: 0.09 },
                { off: 0.35, f0: 1060, f1: 720, d: 0.34 },
            ];
            for (const n of notes) {
                const nt = t0 + n.off;
                const o = c.createOscillator();
                const bp = c.createBiquadFilter();
                const g = c.createGain();
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(n.f0, nt);
                o.frequency.exponentialRampToValueAtTime(n.f1, nt + n.d);
                bp.type = 'bandpass';
                bp.frequency.value = 1450;
                bp.Q.value = 2.6;
                g.gain.setValueAtTime(0.0001, nt);
                g.gain.linearRampToValueAtTime(0.32 * v, nt + 0.02);
                g.gain.exponentialRampToValueAtTime(0.001, nt + n.d);
                o.connect(bp).connect(g).connect(out);
                o.start(nt); o.stop(nt + n.d + 0.02);
            }
            break;
        }
    }
}

function playHumanSfx(kind: HumanTokenKind, mode: 'full' | 'step', volScale: number) {
    const a = audio();
    if (!a) return;
    const { c, out } = a;
    const t0 = c.currentTime;
    const v = characterDuckGain(volScale);
    if (v <= 0.01) return;

    const chime = (freq: number, off: number, dur: number, type: OscillatorType = 'sine', amp = 0.24) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t0 + off);
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.linearRampToValueAtTime(amp * v, t0 + off + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + off + dur);
        o.connect(g).connect(out);
        o.start(t0 + off); o.stop(t0 + off + dur + 0.02);
    };

    switch (kind) {
        case 'belly_dancer':
            chime(2180, 0, 0.14, 'sine', 0.22);
            if (mode === 'full') {
                chime(2640, 0.09, 0.16, 'sine', 0.2);
                clack(c, out, t0 + 0.16, 0.22 * v, 1500);
            }
            break;
        case 'sprinter':
            clack(c, out, t0, 0.24 * v, 950);
            if (mode === 'full') playFilteredNoiseBurst(c, out, t0 + 0.03, 0.22, 'bandpass', 600, 1800, 1.8, 0.26 * v);
            break;
        case 'model':
            clack(c, out, t0, 0.28 * v, 2400);
            if (mode === 'full') {
                chime(523.25, 0.07, 0.24, 'triangle', 0.2);
                chime(659.25, 0.11, 0.24, 'triangle', 0.18);
                chime(783.99, 0.15, 0.28, 'triangle', 0.18);
            }
            break;
        case 'gymnast':
            chime(mode === 'step' ? 540 : 480, 0, 0.14, 'triangle', 0.24);
            if (mode === 'full') chime(880, 0.09, 0.22, 'sine', 0.24);
            break;
        case 'wrestler': {
            const o = c.createOscillator();
            const g = c.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(120, t0);
            o.frequency.exponentialRampToValueAtTime(42, t0 + (mode === 'full' ? 0.22 : 0.1));
            g.gain.setValueAtTime(0.42 * v, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + (mode === 'full' ? 0.24 : 0.12));
            o.connect(g).connect(out);
            o.start(t0); o.stop(t0 + 0.26);
            break;
        }
        case 'climber':
            chime(587.33, 0, 0.11, 'triangle', 0.22);
            if (mode === 'full') {
                chime(739.99, 0.08, 0.11, 'triangle', 0.22);
                chime(987.77, 0.16, 0.2, 'triangle', 0.24);
            }
            break;
        case 'ninja':
            playFilteredNoiseBurst(c, out, t0, mode === 'step' ? 0.08 : 0.18, 'highpass', 1800, 4800, 2.2, 0.28 * v);
            break;
        case 'skateboarder':
            playFilteredNoiseBurst(c, out, t0, 0.09, 'bandpass', 500, 900, 2.0, 0.2 * v);
            if (mode === 'full') clack(c, out, t0 + 0.08, 0.34 * v, 1750);
            break;
        case 'breakdancer':
            chime(95, 0, 0.1, 'sine', 0.34);
            if (mode === 'full') {
                playFilteredNoiseBurst(c, out, t0 + 0.11, 0.06, 'highpass', 5500, 6000, 1.0, 0.18 * v);
                chime(140, t0 + 0.2, 0.12, 'triangle', 0.3);
            }
            break;
        case 'weightlifter':
            chime(mode === 'step' ? 420 : 520, 0, 0.08, 'square', 0.14);
            clack(c, out, t0 + 0.02, 0.32 * v, 680);
            if (mode === 'full') clack(c, out, t0 + 0.14, 0.38 * v, 440);
            break;
    }
}

export function playTokenStepSfx(kind: ResolvedTokenKind, stepIdx: number, totalSteps: number) {
    if (!soundOn() || kind === 'default') return;
    // Taper rapid footsteps on multi-tile moves to avoid ear fatigue
    if (totalSteps > 4 && stepIdx > 3 && stepIdx % 2 === 1) return;
    const taper = Math.max(0.28, 1 - stepIdx * 0.12);
    if (isAnimalTokenKind(kind)) {
        playAnimalVoice(kind, stepIdx === 0 ? 'full' : 'step', (stepIdx === 0 ? 0.85 : 0.55) * taper);
    } else if (isHumanTokenKind(kind)) {
        playHumanSfx(kind, stepIdx === 0 ? 'full' : 'step', (stepIdx === 0 ? 0.82 : 0.5) * taper);
    }
}

export function playTokenEventSfx(kind: ResolvedTokenKind, event: 'capture' | 'home_stretch' | 'home') {
    if (!soundOn() || kind === 'default') return;
    const vol = event === 'home' ? 1.0 : event === 'capture' ? 0.95 : 0.82;
    if (isAnimalTokenKind(kind)) {
        playAnimalVoice(kind, 'full', vol);
    } else if (isHumanTokenKind(kind)) {
        playHumanSfx(kind, 'full', vol);
    }
}

export function playTokenPreviewSfx(styleId: TokenStyleId, seatIdx = 0, _genderMode: HumanGenderMode = 'auto') {
    if (!soundOn()) return;
    const kind = resolveSeatTokenKind(styleId, seatIdx);
    if (kind === 'default') {
        tap();
        return;
    }
    if (isAnimalTokenKind(kind)) {
        playAnimalVoice(kind, 'full', 1.0);
    } else if (isHumanTokenKind(kind)) {
        playHumanSfx(kind, 'full', 1.0);
    }
}

