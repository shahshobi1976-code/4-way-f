import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { store, useStore } from '../state/store';
import { bus } from '../game/bus';
import { RoundBtn, U } from './kit';
import { UniversalAudioCapture, type AudioCaptureResult } from '../game/audioCapture';

/**
 * Ask the browser to lock the screen to landscape. Browsers refuse unless this is
 * called from a user gesture, and some (notably iOS Safari) refuse outright.
 */
/** 'mobile' build offers landscape/portrait choice; 'web' build offers fullscreen only. */
export const IS_MOBILE =
    typeof window !== 'undefined' &&
    ((window as any).__LUDO_TARGET__ === 'mobile' ||
        /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

function lockOrientation(kind: 'landscape' | 'portrait') {
    try {
        (screen.orientation as any)?.lock?.(kind)?.catch?.(() => {});
    } catch {
        /* refused (e.g. iOS Safari): the player can just turn the phone */
    }
}
function lockLandscape() {
    lockOrientation('landscape');
}

/** Mobile / Web: pick landscape or portrait. */
export function setOrientation(kind: 'landscape' | 'portrait') {
    const d: any = document;
    const el: any = document.documentElement;
    const inFs = !!(d.fullscreenElement || d.webkitFullscreenElement);
    const frame = document.getElementById('app-frame');

    if (kind === 'landscape') {
        try { (window as any).__USER_ORIENTATION__ = 'landscape'; } catch {}
        if (!inFs) {
            try {
                const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch {
                /* ignore */
            }
        }
        lockOrientation('landscape');
        store.patch({ landscape: true });
        if (frame) frame.classList.add('land');
        if (!orientationRetry) {
            orientationRetry = onFsChangeForOrientation;
            document.addEventListener('fullscreenchange', orientationRetry);
            document.addEventListener('webkitfullscreenchange', orientationRetry);
        }
    } else {
        try { (window as any).__USER_ORIENTATION__ = 'portrait'; } catch {}
        clearOrientationRetry();
        lockOrientation('portrait');
        store.patch({ landscape: false });
        if (frame) frame.classList.remove('land');
        setTimeout(() => {
            try {
                (screen.orientation as any)?.unlock?.();
            } catch {
                /* ignore */
            }
        }, 300);
    }
}

// ONE shared listener, so repeatedly toggling fullscreen cannot stack handlers
// (each leaving one behind was part of the fullscreen stall).
let orientationRetry: (() => void) | null = null;

function clearOrientationRetry() {
    if (!orientationRetry) return;
    document.removeEventListener('fullscreenchange', orientationRetry);
    document.removeEventListener('webkitfullscreenchange', orientationRetry);
    orientationRetry = null;
}

function onFsChangeForOrientation() {
    lockLandscape();
    clearOrientationRetry();
}

export function toggleFullscreen() {
    try {
        const d: any = document;
        const el: any = document.documentElement;
        if (d.fullscreenElement || d.webkitFullscreenElement) {
            clearOrientationRetry();
            try {
                const p = (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch { /* ignore */ }
            try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ }
        } else {
            try {
                const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch { /* ignore */ }
            // Ask for landscape SYNCHRONOUSLY, still inside the tap handler: iOS
            // ignores orientation.lock() once the gesture context is gone.
            lockLandscape();
            // Some browsers only honour the lock after fullscreen has landed, so
            // retry once through the shared, self-removing listener.
            if (!orientationRetry) {
                orientationRetry = onFsChangeForOrientation;
                document.addEventListener('fullscreenchange', orientationRetry);
                document.addEventListener('webkitfullscreenchange', orientationRetry);
            }
        }
    } catch {
        /* fullscreen not available */
    }
}

import { multiplayerClient } from '../network/multiplayerClient';

/** Adaptive screen buttons: Fullscreen button + Chat/Emoji reaction (in vertical mobile) + Wish icon. Scaled to half size (size 24). */
export function ScreenButtons({ gap = 6 }: { gap?: number }) {
    const fs = useStore((s) => s.fullscreen);
    const wishNums = useStore((s) => s.wishNums);
    const wishUsable = useStore((s) => s.wishUsable);
    const phase = useStore((s) => s.phase);
    const chatOpen = useStore((s) => s.chatOpen);
    const isMultiplayer = !!multiplayerClient.roomCode;

    // Show chat / message & emoji reaction button during play or in multiplayer
    const showChat = phase === 'playing' || isMultiplayer;

    // Only render wish button if there is a real wish; if no wish, do not render any wish icon
    const hasWish = phase === 'playing' && wishNums && wishNums.length === 2;

    const toggleChat = () => {
        store.patch({ chatOpen: !chatOpen });
    };

    return (
        <div id="bottom-left-actions" className="flex items-center" style={{ gap: U(gap) }}>
            <RoundBtn
                id="ratio-toggle-btn"
                label="Fullscreen"
                size={24}
                onClick={toggleFullscreen}
                title="Toggle Fullscreen"
            >
                {fs ? '⤡' : '⛶'}
            </RoundBtn>

            {showChat && (
                <RoundBtn
                    id="quick-msg-btn"
                    label="Chat & Emoji Reactions"
                    size={24}
                    onClick={toggleChat}
                    title="Chat & Emoji Reactions"
                    className={chatOpen ? "!border-cyan-400 !bg-cyan-500/30 text-cyan-200 ring-2 ring-cyan-400/50" : ""}
                >
                    💬
                </RoundBtn>
            )}

            {hasWish && (
                <button
                    id="wish-btn"
                    type="button"
                    onClick={() => bus.wish?.()}
                    disabled={!wishUsable}
                    aria-label="Lucky Wish"
                    title={wishUsable ? `Click to activate Lucky Wish (${wishNums[0]}, ${wishNums[1]})!` : `Lucky Wish (${wishNums[0]}, ${wishNums[1]})`}
                    className={`flex items-center justify-center font-black rounded-full border-2 transition-all select-none shadow-lg ${
                        wishUsable
                            ? 'pulse-wish border-amber-300 bg-gradient-to-r from-amber-400 to-orange-500 text-black scale-105 active:scale-95 cursor-pointer'
                            : 'border-white/30 bg-slate-900/80 text-white/50 cursor-not-allowed opacity-80'
                    }`}
                    style={{
                        height: U(24),
                        padding: `0 ${U(9)}`,
                        gap: U(4),
                        fontSize: U(11),
                    }}
                >
                    <span style={{ fontSize: U(12) }}>✨</span>
                    <span>{wishNums[0]},{wishNums[1]}</span>
                </button>
            )}
        </div>
    );
}

/**
 * RotateHint is removed per user request (no rotate icons on any screen).
 */
export function RotateHint() {
    return null;
}

import * as sfx from '../game/sfx';

/** Bottom-right online Voice Note capture button: supports tap-to-start/stop OR hold-to-talk with 6.5s / 80KB WAV pipeline */
function VoiceNoteButton() {
    const [recording, setRecording] = useState(false);
    const [sending, setSending] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [level, setLevel] = useState(0);
    const capRef = useRef<UniversalAudioCapture | null>(null);
    const pressDownAtRef = useRef<number>(0);

    const micPermission = useStore((s) => s.micPermission);
    const isMultiplayer = !!multiplayerClient.roomCode;

    useEffect(() => {
        return () => {
            capRef.current?.cancelPendingOrActive();
            capRef.current = null;
        };
    }, []);

    const handleCaptureResult = async (res: AudioCaptureResult) => {
        setRecording(false);
        setElapsedMs(0);
        setLevel(0);
        if (!res.ok || !res.bytes) {
            if (res.errorCode === 'NO_SOUND') {
                multiplayerClient.showToast('No microphone sound detected', 'warn');
            } else if (res.errorCode && res.errorCode !== 'CANCELLED') {
                multiplayerClient.showToast(res.error || 'Voice note could not be recorded', 'warn');
            }
            return;
        }
        if (multiplayerClient.roomCode) {
            setSending(true);
            await multiplayerClient.sendVoiceNote(res.bytes, res.mimeType || 'audio/wav');
            setSending(false);
        } else {
            const st = store.get();
            const cur = st.current;
            const localSeat = !st.players[cur]?.ai ? cur : Math.max(0, st.players.findIndex((p) => !p.ai));
            sfx.playAudioClip(`local_voice_${Date.now()}`, res.bytes, res.mimeType || 'audio/wav');
            bus.chat?.(localSeat, `🎤 Voice (${res.durationSec || 1}s)`, { voice: false });
        }
    };

    const startRec = () => {
        if (recording || sending) return;
        const cap = new UniversalAudioCapture({
            maxBytes: 80_000,
            maxMs: 6500,
            onProgress: (ms, lvl) => {
                setElapsedMs(ms);
                setLevel(lvl);
            },
            onAutoStop: (res) => {
                capRef.current = null;
                void handleCaptureResult(res);
            },
        });
        capRef.current = cap;
        setRecording(true);
        setElapsedMs(0);
        void cap.start().then((r) => {
            if (!r.ok) {
                if (capRef.current === cap) capRef.current = null;
                setRecording(false);
                if (r.error && r.error !== 'Recording cancelled') {
                    multiplayerClient.showToast(r.error, 'error');
                }
            }
        });
    };

    const stopRec = (cancel = false) => {
        const cap = capRef.current;
        if (!cap) return;
        capRef.current = null;
        void cap.stop(cancel).then((res) => {
            void handleCaptureResult(res);
        });
    };

    const onPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        pressDownAtRef.current = Date.now();
        if (recording) {
            stopRec(false);
        } else {
            startRec();
        }
    };

    const onPointerUp = () => {
        // Hold-to-talk: if user held > 380ms before releasing, stop & send immediately; quick tap keeps recording until second tap
        if (recording && pressDownAtRef.current > 0 && Date.now() - pressDownAtRef.current > 380) {
            stopRec(false);
        }
    };

    const secText = (elapsedMs / 1000).toFixed(1);

    return (
        <div className="relative flex items-center">
            {recording && (
                <div
                    className="absolute bottom-full right-0 mb-2 px-2.5 py-1 rounded-full bg-red-950/95 border border-red-400 text-white shadow-xl flex items-center gap-1.5 whitespace-nowrap select-none"
                    style={{ fontSize: U(11) }}
                >
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                    <span className="font-mono font-black text-red-200">{secText}s / 6.5s</span>
                    <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
                    </div>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            stopRec(true);
                        }}
                        className="ml-0.5 text-slate-300 hover:text-white font-black cursor-pointer"
                        title="Cancel voice note"
                    >
                        ✕
                    </button>
                </div>
            )}
            <RoundBtn
                size={24}
                label={recording ? 'Stop & Send Voice Note' : 'Record Voice Note'}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={() => stopRec(true)}
                title={
                    recording
                        ? 'Tap to Send Voice Note (Max 6.5s)'
                        : micPermission === 'granted'
                        ? isMultiplayer
                            ? 'Mic Connected • Tap or Hold to Send Voice Note'
                            : 'Mic Connected • Tap or Hold to Record Voice Message'
                        : 'Tap to Connect Microphone & Record Voice'
                }
                className={
                    recording
                        ? '!border-red-400 !bg-red-600/90 text-white ring-2 ring-red-400/70 animate-pulse'
                        : sending
                        ? '!border-amber-400 !bg-amber-500/30 text-amber-200 opacity-80'
                        : micPermission === 'granted'
                        ? 'text-emerald-200 !border-emerald-400/60'
                        : micPermission === 'denied'
                        ? 'text-red-300 !border-red-400/60'
                        : 'text-cyan-200'
                }
            >
                {sending ? '⏳' : recording ? '⏹' : '🎤'}
            </RoundBtn>
            {!recording && !sending && (
                <span
                    className={`pointer-events-none absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${
                        micPermission === 'granted'
                            ? 'bg-emerald-400'
                            : micPermission === 'denied'
                            ? 'bg-red-500'
                            : 'bg-amber-400 animate-pulse'
                    }`}
                />
            )}
        </div>
    );
}

/** Menu / screen floating buttons: AI Voice Mute + music + settings bottom-right, fullscreen + chat bottom-left (scaled to 0.75x). */
export function FloatingControls() {
    const phase = useStore((s) => s.phase);
    const aiMute = useStore((s) => s.settings.aiMute);
    const landscape = useStore((s) => s.landscape);
    const [, setNetTick] = useState(0);
    useEffect(() => multiplayerClient.subscribe(() => setNetTick((t) => t + 1)), []);

    const showVoiceMic = phase === 'playing';

    const toggleAiMute = () => {
        const next = !aiMute;
        store.patchSettings({ aiMute: next });
        if (next) {
            sfx.stopSpeech();
        }
    };

    return (
        <>
            {/* Bottom-Right Controls: Halved to size 24 */}
            <div
                className="absolute z-30 flex items-center"
                style={{ right: U(12), bottom: U(14), gap: U(6) }}
            >
                {!landscape ? (
                    /* In mobile vertical: [Voice Mic (online)] [Music] [AI Mute] [Settings] */
                    <div className="flex items-center" style={{ gap: U(6) }}>
                        {showVoiceMic && <VoiceNoteButton />}
                        <RoundBtn size={24} label="Music" onClick={() => store.patch({ modal: 'music' })}>🎵</RoundBtn>
                        {phase === 'playing' && (
                            <RoundBtn
                                size={24}
                                label={aiMute ? "Unmute AI Voice" : "Mute AI Voice"}
                                onClick={toggleAiMute}
                                title={aiMute ? "AI Voice is MUTED (Click to Unmute AI Talk)" : "AI Voice is ACTIVE (Click to Mute AI Talk Only)"}
                                className={aiMute ? "!border-amber-400 !bg-red-950/85 text-amber-300 ring-2 ring-amber-400/50" : ""}
                            >
                                {aiMute ? '🔇' : '🎙️'}
                            </RoundBtn>
                        )}
                        <RoundBtn size={24} label="Settings" onClick={() => store.patch({ modal: 'settings' })}>⚙️</RoundBtn>
                    </div>
                ) : (
                    <div className="flex flex-col items-end" style={{ gap: U(6) }}>
                        <div className="flex items-center" style={{ gap: U(6) }}>
                            {showVoiceMic && <VoiceNoteButton />}
                            <RoundBtn size={24} label="Music" onClick={() => store.patch({ modal: 'music' })}>🎵</RoundBtn>
                        </div>
                        <div className="flex items-center" style={{ gap: U(6) }}>
                            {phase === 'playing' && (
                                <RoundBtn
                                    size={24}
                                    label={aiMute ? "Unmute AI Voice" : "Mute AI Voice"}
                                    onClick={toggleAiMute}
                                    title={aiMute ? "AI Voice is MUTED (Click to Unmute AI Talk)" : "AI Voice is ACTIVE (Click to Mute AI Talk Only)"}
                                    className={aiMute ? "!border-amber-400 !bg-red-950/85 text-amber-300 ring-2 ring-amber-400/50" : ""}
                                >
                                    {aiMute ? '🔇' : '🎙️'}
                                </RoundBtn>
                            )}
                            <RoundBtn size={24} label="Settings" onClick={() => store.patch({ modal: 'settings' })}>⚙️</RoundBtn>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom-Left Controls: #ratio-toggle-btn + #quick-msg-btn + #wish-btn */}
            <div className="absolute z-30" style={{ left: U(12), bottom: U(14) }}>
                <ScreenButtons gap={6} />
            </div>
        </>
    );
}
