// Cross-Browser Microphone Capture, Adaptive RIFF WAV Encoding, and Binary Payload Utilities
import { store, type MicPermissionState } from '../state/store';

export interface AudioCaptureOptions {
    maxBytes: number;
    maxMs: number;
    onAutoStop?: (result: AudioCaptureResult) => void;
    onProgress?: (elapsedMs: number, level: number) => void;
}

export interface AudioCaptureResult {
    ok: boolean;
    bytes?: Uint8Array;
    mimeType?: string;
    durationSec?: number;
    errorCode?: 'NO_SOUND' | 'CANCELLED' | 'MIC_DENIED' | 'EMPTY' | 'TOO_LARGE';
    error?: string;
}

let permissionStatusWatched = false;

export function isMicBlockedByIframePolicy(): boolean {
    if (typeof document === 'undefined') return false;
    try {
        const policy = (document as any).permissionsPolicy || (document as any).featurePolicy;
        if (policy && typeof policy.allowsFeature === 'function') {
            return policy.allowsFeature('microphone') === false;
        }
    } catch {
        /* ignore */
    }
    return false;
}

function isInsideIframe(): boolean {
    try {
        return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
        return true;
    }
}

function formatMicError(err: unknown): { status: MicPermissionState; message: string } {
    const name = String((err as any)?.name || '');
    const msg = String((err as any)?.message || '');

    if (typeof window !== 'undefined' && !window.isSecureContext) {
        return {
            status: 'unsupported',
            message: 'Microphone requires HTTPS (secure context). Open the HTTPS app URL.',
        };
    }

    if (isMicBlockedByIframePolicy() || /permissions policy|feature policy|disallowed by feature/i.test(msg)) {
        return {
            status: 'denied',
            message: 'Microphone is blocked by the preview frame policy. Reload the full browser page or open the app URL in its own browser tab.',
        };
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return { status: 'unsupported', message: 'No microphone hardware found on this device.' };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return { status: 'denied', message: 'Microphone is busy in another app or tab. Close it and retry.' };
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError' || /denied|permission|dismissed/i.test(msg)) {
        if (isInsideIframe()) {
            return {
                status: 'denied',
                message: 'Microphone blocked by browser site settings or preview iframe. Allow Microphone in the address bar (🔒), or open the app URL directly in a new tab.',
            };
        }
        return {
            status: 'denied',
            message: 'Microphone permission denied in browser or device settings. Click the address bar 🔒 icon → Microphone → Allow, then retry.',
        };
    }
    return { status: 'denied', message: msg ? `Microphone unavailable (${msg})` : 'Microphone permission denied or unavailable.' };
}

async function detectConnectedMicLabel(stream?: MediaStream): Promise<string | null> {
    const trackLabel = stream?.getAudioTracks?.()[0]?.label?.trim();
    if (trackLabel) return trackLabel;
    try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioIn = devices.find((d) => d.kind === 'audioinput' && d.label?.trim());
            if (audioIn?.label?.trim()) return audioIn.label.trim();
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * Checks current browser microphone permission & connected device without triggering a prompt.
 */
export async function probeMicrophoneStatus(): Promise<{ status: MicPermissionState; deviceLabel: string | null }> {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
        const msg = 'Microphone requires HTTPS (secure context).';
        store.patch({ micPermission: 'unsupported', micDeviceLabel: null, micError: msg });
        return { status: 'unsupported', deviceLabel: null };
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        store.patch({ micPermission: 'unsupported', micDeviceLabel: null });
        return { status: 'unsupported', deviceLabel: null };
    }

    if (isMicBlockedByIframePolicy()) {
        store.patch({
            micPermission: 'denied',
            micDeviceLabel: null,
            micError: 'Microphone is blocked by the preview frame policy. Reload the full browser page or open the app URL in its own browser tab.',
        });
        return { status: 'denied', deviceLabel: null };
    }

    let status: MicPermissionState = 'prompt';
    try {
        if (navigator.permissions?.query) {
            const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            if (perm.state === 'granted' || perm.state === 'denied' || perm.state === 'prompt') {
                status = perm.state;
            }
            if (!permissionStatusWatched) {
                permissionStatusWatched = true;
                perm.onchange = () => {
                    void probeMicrophoneStatus();
                };
            }
        }
    } catch {
        /* Permissions API for microphone is not supported in Safari/older WebViews */
    }

    const label = await detectConnectedMicLabel();
    if (label && status === 'prompt') {
        // Non-empty device label means permission has already been granted by the browser
        status = 'granted';
    }

    store.patch({
        micPermission: status,
        micDeviceLabel: status === 'granted' ? label || 'Microphone Connected' : label,
        ...(status === 'granted'
            ? { micError: null, micPromptDismissed: true }
            : status === 'denied'
            ? {
                  micError: isInsideIframe()
                      ? 'Microphone blocked by browser site settings or preview iframe. Allow Microphone in the address bar (🔒), or open the app URL in its own browser tab.'
                      : 'Microphone is blocked in browser site settings. Click the address bar 🔒 icon → Microphone → Allow.',
              }
            : {}),
    });
    return { status, deviceLabel: label };
}

/**
 * Requests microphone permission inside a user tap/click gesture, verifies audio track connection,
 * and releases the temporary stream until the user records a voice clip.
 */
export async function requestMicrophonePermission(): Promise<{
    ok: boolean;
    status: MicPermissionState;
    deviceLabel: string | null;
    error?: string;
}> {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
        const msg = 'Microphone requires HTTPS (secure context).';
        store.patch({ micPermission: 'unsupported', micError: msg, micPromptDismissed: true });
        return { ok: false, status: 'unsupported', deviceLabel: null, error: msg };
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        const msg = 'Microphone is not supported in this browser.';
        store.patch({ micPermission: 'unsupported', micError: msg, micPromptDismissed: true });
        return { ok: false, status: 'unsupported', deviceLabel: null, error: msg };
    }

    store.patch({ micPermission: 'checking', micError: null });

    // Unlock WebAudio synchronously while inside user gesture
    try {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (Ctor) {
            const ctx = new Ctor();
            if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
                void ctx.resume().catch(() => {});
            }
            window.setTimeout(() => {
                try { void ctx.close(); } catch {}
            }, 300);
        }
    } catch {
        /* ignore */
    }

    let stream: MediaStream;
    try {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
        } catch (err: any) {
            if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err?.name === 'SecurityError') {
                throw err;
            }
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
    } catch (err) {
        const formatted = formatMicError(err);
        store.patch({
            micPermission: formatted.status,
            micError: formatted.message,
        });
        return { ok: false, status: formatted.status, deviceLabel: null, error: formatted.message };
    }

    const label = (await detectConnectedMicLabel(stream)) || 'Microphone Connected';
    stream.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
    });

    store.patch({
        micPermission: 'granted',
        micDeviceLabel: label,
        micError: null,
        micPromptDismissed: true,
    });
    return { ok: true, status: 'granted', deviceLabel: label };
}

export function normalizeAudioMime(rawMime?: string): string {
    const clean = String(rawMime || '').split(';')[0].trim().toLowerCase();
    if (clean === 'audio/wave' || clean === 'audio/x-wav' || clean === 'audio/wav') return 'audio/wav';
    if (clean === 'audio/webm') return 'audio/webm';
    if (clean === 'audio/mp4' || clean === 'audio/m4a' || clean === 'audio/x-m4a') return 'audio/mp4';
    if (clean === 'audio/aac') return 'audio/aac';
    if (clean === 'audio/ogg') return 'audio/ogg';
    if (clean === 'audio/mpeg' || clean === 'audio/mp3') return 'audio/mpeg';
    return 'audio/wav';
}

export function binaryPayloadToUint8Array(payload: unknown): Uint8Array | null {
    if (!payload) return null;
    if (payload instanceof Uint8Array) return payload;
    if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
    if (ArrayBuffer.isView(payload)) {
        return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    }
    if (
        typeof payload === 'object' &&
        payload !== null &&
        (payload as any).type === 'Buffer' &&
        Array.isArray((payload as any).data)
    ) {
        return new Uint8Array((payload as any).data);
    }
    if (typeof payload === 'string') {
        const match = payload.match(/^data:audio\/[a-z0-9.+-]+(?:;[^,]*)?;base64,(.+)$/i);
        if (match && match[1]) {
            try {
                const bin = atob(match[1]);
                const out = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
                return out;
            } catch {
                return null;
            }
        }
    }
    return null;
}

export function sniffAudioMime(bytes: Uint8Array, fallbackMime = 'audio/wav'): string {
    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
        bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45 // WAVE
    ) {
        return 'audio/wav';
    }
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
        return 'audio/webm';
    }
    if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
        return 'audio/ogg';
    }
    if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return 'audio/mp4';
    }
    if (
        bytes.length >= 3 &&
        ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
            (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
    ) {
        return 'audio/mpeg';
    }
    return normalizeAudioMime(fallbackMime);
}

/**
 * Converts ArrayBuffer, TypedArray, Node serialized Buffer, Blob, or data:audio/ URL
 * into a playable Object URL (with cleanup helper) + sniffed MIME type.
 */
export function binaryPayloadToAudioUrl(
    payload: unknown,
    mimeType?: string,
): { url: string; mimeType: string; isObjectUrl: boolean } | null {
    if (!payload) return null;

    if (typeof Blob !== 'undefined' && payload instanceof Blob) {
        const safeMime = normalizeAudioMime(payload.type || mimeType);
        const blob = payload.type ? payload : new Blob([payload], { type: safeMime });
        return { url: URL.createObjectURL(blob), mimeType: safeMime, isObjectUrl: true };
    }

    if (typeof payload === 'string' && payload.startsWith('data:audio/')) {
        const bytes = binaryPayloadToUint8Array(payload);
        if (bytes) {
            const safeMime = sniffAudioMime(bytes, mimeType || 'audio/wav');
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            const blob = new Blob([copy.buffer], { type: safeMime });
            return { url: URL.createObjectURL(blob), mimeType: safeMime, isObjectUrl: true };
        }
        return { url: payload, mimeType: normalizeAudioMime(mimeType), isObjectUrl: false };
    }

    const bytes = binaryPayloadToUint8Array(payload);
    if (!bytes || bytes.byteLength === 0) return null;

    const safeMime = sniffAudioMime(bytes, mimeType || 'audio/wav');
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: safeMime });
    return { url: URL.createObjectURL(blob), mimeType: safeMime, isObjectUrl: true };
}

export function revokeAudioUrl(entry: { url: string; isObjectUrl?: boolean } | null | undefined) {
    if (!entry?.url) return;
    if (entry.isObjectUrl || entry.url.startsWith('blob:')) {
        try {
            URL.revokeObjectURL(entry.url);
        } catch {
            /* ignore */
        }
    }
}

function downsampleLinear(samples: Float32Array, srcRate: number, dstRate: number): Float32Array {
    if (dstRate >= srcRate) return samples;
    const ratio = srcRate / dstRate;
    const outLen = Math.max(1, Math.floor(samples.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const idx = Math.floor(pos);
        const frac = pos - idx;
        const s0 = samples[idx] ?? 0;
        const s1 = samples[Math.min(samples.length - 1, idx + 1)] ?? s0;
        out[i] = s0 + (s1 - s0) * frac;
    }
    return out;
}

function writeAscii(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

function encodeRiffWav(samples: Float32Array, sampleRate: number, bitsPerSample: 8 | 16): Uint8Array {
    const numChannels = 1;
    const bytesPerSample = bitsPerSample === 16 ? 2 : 1;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);

    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    if (bitsPerSample === 16) {
        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            const clamped = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767), true);
            offset += 2;
        }
    } else {
        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            const clamped = Math.max(-1, Math.min(1, samples[i]));
            view.setUint8(offset, Math.max(0, Math.min(255, Math.round((clamped + 1) * 127.5))));
            offset += 1;
        }
    }

    return new Uint8Array(buf);
}

function encodeAdaptiveWav(
    rawChunks: Float32Array[],
    inputSampleRate: number,
    maxBytes: number,
): { ok: true; bytes: Uint8Array; durationSec: number } | { ok: false; errorCode: 'NO_SOUND' | 'EMPTY'; error: string } {
    let totalLen = 0;
    for (const c of rawChunks) totalLen += c.length;
    if (totalLen === 0) {
        return { ok: false, errorCode: 'EMPTY', error: 'No audio captured' };
    }

    const merged = new Float32Array(totalLen);
    let offset = 0;
    let sum = 0;
    for (const c of rawChunks) {
        merged.set(c, offset);
        for (let i = 0; i < c.length; i++) sum += c[i];
        offset += c.length;
    }

    // Subtract DC offset and measure peak amplitude
    const dc = sum / totalLen;
    let peak = 0;
    for (let i = 0; i < merged.length; i++) {
        const v = merged[i] - dc;
        merged[i] = v;
        const av = Math.abs(v);
        if (av > peak) peak = av;
    }

    if (peak < 0.0005) {
        return { ok: false, errorCode: 'NO_SOUND', error: 'No microphone sound detected' };
    }

    // Peak-normalize to ~0.88 with gentle soft-limiting
    const gain = 0.88 / peak;
    for (let i = 0; i < merged.length; i++) {
        const scaled = merged[i] * gain;
        // Soft limiter near +/- 0.88
        merged[i] = Math.abs(scaled) > 0.88 ? Math.tanh(scaled) * 0.92 : scaled;
    }

    // Adaptive WAV presets: never drop below 8000 Hz
    const presets: { rate: number; bits: 16 | 8 }[] = [
        { rate: 12000, bits: 16 },
        { rate: 8000, bits: 16 },
        { rate: 10000, bits: 8 },
        { rate: 8000, bits: 8 },
    ];

    for (const preset of presets) {
        const resampled = downsampleLinear(merged, inputSampleRate, preset.rate);
        const estimatedBytes = 44 + resampled.length * (preset.bits === 16 ? 2 : 1);
        if (estimatedBytes <= maxBytes) {
            const wav = encodeRiffWav(resampled, preset.rate, preset.bits);
            const durationSec = Math.max(1, Math.round(resampled.length / preset.rate));
            return { ok: true, bytes: wav, durationSec };
        }
    }

    // Final guarantee within maxBytes at 8kHz 8-bit
    const minPreset = presets[presets.length - 1];
    let resampled = downsampleLinear(merged, inputSampleRate, minPreset.rate);
    const maxSamples = Math.max(1, maxBytes - 44);
    if (resampled.length > maxSamples) {
        resampled = resampled.subarray(0, maxSamples);
    }
    const wav = encodeRiffWav(resampled, minPreset.rate, 8);
    const durationSec = Math.max(1, Math.round(resampled.length / minPreset.rate));
    return { ok: true, bytes: wav, durationSec };
}

export class UniversalAudioCapture {
    private readonly maxBytes: number;
    private readonly maxMs: number;
    private readonly onAutoStop?: (result: AudioCaptureResult) => void;
    private readonly onProgress?: (elapsedMs: number, level: number) => void;

    private audioCtx: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private processorNode: ScriptProcessorNode | null = null;
    private muteGain: GainNode | null = null;
    private mediaRecorder: MediaRecorder | null = null;

    private pcmChunks: Float32Array[] = [];
    private fallbackChunks: Blob[] = [];
    private fallbackMime = 'audio/webm';

    private active = false;
    private stopping = false;
    private cancelledBeforeReady = false;
    private startedAt = 0;
    private maxTimer: ReturnType<typeof setTimeout> | null = null;
    private progressTimer: ReturnType<typeof setInterval> | null = null;
    private currentLevel = 0;

    constructor(opts: AudioCaptureOptions) {
        this.maxBytes = opts.maxBytes;
        this.maxMs = opts.maxMs;
        this.onAutoStop = opts.onAutoStop;
        this.onProgress = opts.onProgress;
    }

    public isActive(): boolean {
        return this.active;
    }

    /**
     * MUST be called inside the user tap/click handler so AudioContext can be created/resumed synchronously.
     */
    public async start(): Promise<{ ok: boolean; error?: string }> {
        if (this.active || this.stopping) {
            return { ok: false, error: 'Already recording' };
        }
        this.cancelledBeforeReady = false;
        this.pcmChunks = [];
        this.fallbackChunks = [];
        this.currentLevel = 0;

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            return { ok: false, error: 'Microphone is not supported in this browser' };
        }

        // Synchronously create/resume AudioContext inside tap gesture before awaiting getUserMedia
        try {
            const Ctor = window.AudioContext || (window as any).webkitAudioContext;
            if (Ctor) {
                if (!this.audioCtx || this.audioCtx.state === 'closed') {
                    this.audioCtx = new Ctor();
                }
                if (this.audioCtx.state === 'suspended' || (this.audioCtx.state as string) === 'interrupted') {
                    void this.audioCtx.resume().catch(() => {});
                }
            }
        } catch {
            /* WebAudio unavailable; MediaRecorder fallback will still run */
        }

        let stream: MediaStream;
        try {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });
            } catch (err: any) {
                if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err?.name === 'SecurityError') {
                    throw err;
                }
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
        } catch (err) {
            const formatted = formatMicError(err);
            store.patch({ micPermission: formatted.status, micError: formatted.message });
            return { ok: false, error: formatted.message };
        }

        const label = stream.getAudioTracks?.()[0]?.label?.trim() || store.get().micDeviceLabel || 'Microphone Connected';
        store.patch({
            micPermission: 'granted',
            micDeviceLabel: label,
            micError: null,
            micPromptDismissed: true,
        });

        // If user released/cancelled while permission dialog was open, clean up immediately
        if (this.cancelledBeforeReady) {
            stream.getTracks().forEach((t) => {
                try { t.stop(); } catch {}
            });
            return { ok: false, error: 'Recording cancelled' };
        }

        this.stream = stream;
        this.active = true;
        this.startedAt = Date.now();

        // Start WebAudio Float32 PCM capture
        try {
            if (this.audioCtx) {
                if (this.audioCtx.state === 'suspended' || (this.audioCtx.state as string) === 'interrupted') {
                    void this.audioCtx.resume().catch(() => {});
                }
                this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
                this.processorNode = this.audioCtx.createScriptProcessor(2048, 1, 1);
                this.muteGain = this.audioCtx.createGain();
                this.muteGain.gain.value = 0;

                this.processorNode.onaudioprocess = (ev) => {
                    if (!this.active || this.stopping) return;
                    const input = ev.inputBuffer.getChannelData(0);
                    const copy = new Float32Array(input.length);
                    copy.set(input);
                    this.pcmChunks.push(copy);

                    let peak = 0;
                    for (let i = 0; i < copy.length; i += 8) {
                        const av = Math.abs(copy[i]);
                        if (av > peak) peak = av;
                    }
                    this.currentLevel = Math.min(1, peak * 3.5);
                };

                this.sourceNode.connect(this.processorNode);
                this.processorNode.connect(this.muteGain);
                this.muteGain.connect(this.audioCtx.destination);
            }
        } catch {
            /* Fallback relies on MediaRecorder */
        }

        // Parallel MediaRecorder fallback
        try {
            if (typeof MediaRecorder !== 'undefined') {
                const candidates = [
                    'audio/webm;codecs=opus',
                    'audio/webm',
                    'audio/mp4',
                    'audio/aac',
                    'audio/ogg;codecs=opus',
                    'audio/ogg',
                ];
                let chosen = '';
                for (const mime of candidates) {
                    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime)) {
                        chosen = mime;
                        break;
                    }
                }
                this.mediaRecorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
                this.fallbackMime = normalizeAudioMime(this.mediaRecorder.mimeType || chosen || 'audio/webm');
                this.mediaRecorder.ondataavailable = (ev) => {
                    if (ev.data && ev.data.size > 0) this.fallbackChunks.push(ev.data);
                };
                this.mediaRecorder.start(200);
            }
        } catch {
            this.mediaRecorder = null;
        }

        this.progressTimer = setInterval(() => {
            if (!this.active) return;
            this.onProgress?.(Date.now() - this.startedAt, this.currentLevel);
        }, 80);

        this.maxTimer = setTimeout(() => {
            if (this.active && !this.stopping) {
                void this.stop().then((res) => {
                    this.onAutoStop?.(res);
                });
            }
        }, this.maxMs);

        return { ok: true };
    }

    public cancelPendingOrActive() {
        this.cancelledBeforeReady = true;
        this.cleanupPipeline();
        this.active = false;
        this.stopping = false;
        this.pcmChunks = [];
        this.fallbackChunks = [];
    }

    private cleanupPipeline() {
        if (this.maxTimer) {
            clearTimeout(this.maxTimer);
            this.maxTimer = null;
        }
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
            this.progressTimer = null;
        }
        try { this.processorNode?.disconnect(); } catch {}
        try { this.sourceNode?.disconnect(); } catch {}
        try { this.muteGain?.disconnect(); } catch {}
        this.processorNode = null;
        this.sourceNode = null;
        this.muteGain = null;

        if (this.stream) {
            this.stream.getTracks().forEach((t) => {
                try { t.stop(); } catch {}
            });
            this.stream = null;
        }
    }

    public async stop(cancelled = false): Promise<AudioCaptureResult> {
        if (!this.active && !this.stopping) {
            this.cancelledBeforeReady = true;
            return { ok: false, errorCode: 'CANCELLED', error: 'Recording cancelled' };
        }
        if (this.stopping) {
            return { ok: false, errorCode: 'CANCELLED', error: 'Already stopping' };
        }
        this.stopping = true;
        this.active = false;

        // Wait for MediaRecorder stop event briefly so fallback chunks flush
        const recorderStopped = new Promise<void>((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve();
                return;
            }
            const timer = setTimeout(resolve, 350);
            this.mediaRecorder.onstop = () => {
                clearTimeout(timer);
                resolve();
            };
            try {
                this.mediaRecorder.stop();
            } catch {
                clearTimeout(timer);
                resolve();
            }
        });

        await recorderStopped;
        const sampleRate = this.audioCtx?.sampleRate || 44100;
        const pcmSnapshot = this.pcmChunks.slice();
        const fallbackSnapshot = this.fallbackChunks.slice();
        const fallbackMime = this.fallbackMime;

        this.mediaRecorder = null;
        this.cleanupPipeline();
        this.pcmChunks = [];
        this.fallbackChunks = [];
        this.stopping = false;

        if (cancelled) {
            return { ok: false, errorCode: 'CANCELLED', error: 'Recording cancelled' };
        }

        // Primary path: encode captured Float32 PCM frames as adaptive RIFF WAV
        if (pcmSnapshot.length > 0) {
            const wavRes = encodeAdaptiveWav(pcmSnapshot, sampleRate, this.maxBytes);
            if (!wavRes.ok) {
                return { ok: false, errorCode: wavRes.errorCode, error: wavRes.error };
            }
            return {
                ok: true,
                bytes: wavRes.bytes,
                mimeType: 'audio/wav',
                durationSec: wavRes.durationSec,
            };
        }

        // Fallback path: MediaRecorder blob if WebAudio PCM was unavailable
        if (fallbackSnapshot.length > 0) {
            const blob = new Blob(fallbackSnapshot, { type: fallbackMime });
            const arr = new Uint8Array(await blob.arrayBuffer());
            if (arr.byteLength === 0) {
                return { ok: false, errorCode: 'EMPTY', error: 'No audio captured' };
            }
            if (arr.byteLength > this.maxBytes) {
                return { ok: false, errorCode: 'TOO_LARGE', error: 'Recording exceeded size limit' };
            }
            const dur = Math.max(1, Math.min(7, Math.round(arr.byteLength / 2500)));
            return {
                ok: true,
                bytes: arr,
                mimeType: normalizeAudioMime(blob.type || fallbackMime),
                durationSec: dur,
            };
        }

        return { ok: false, errorCode: 'NO_SOUND', error: 'No microphone sound detected' };
    }
}
