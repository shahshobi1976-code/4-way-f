import { useState, useEffect, useRef } from 'react';
import { store, useStore } from '../state/store';
import { bus } from '../game/bus';
import { tr, colorName } from '../i18n';
import { COLORS } from '../game/rules';
import { U } from './kit';
import { multiplayerClient } from '../network/multiplayerClient';
import { WinnerOverlay } from './WinnerOverlay';
import * as sfx from '../game/sfx';
import { UniversalAudioCapture, type AudioCaptureResult } from '../game/audioCapture';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const QUICK_EMOJIS = ['👍', '😂', '🎲', '😡', '🎯', '🔥', '👑', '👋'];
const QUICK_PHRASES = ['Good move!', 'Unlucky!', 'Hurry up! ⏰', 'Nice roll! 🎲', 'GG! 🏆', 'Watch out! 👀'];

/** Live Turn Timer matching the exact screenshot design */
function TurnTimer({ compact = false }: { compact?: boolean }) {
    const turnSecondsLeft = useStore((s) => s.turnSecondsLeft);
    const settings = useStore((s) => s.settings);
    const isMultiplayer = !!multiplayerClient.roomCode;
    const roomTurnTimeSec = multiplayerClient.roomState?.turnTimeSec;

    const timerEnabled = isMultiplayer
        ? (roomTurnTimeSec !== undefined ? roomTurnTimeSec > 0 : true)
        : settings.timerEnabled;

    if (!timerEnabled) {
        return (
            <div
                className="relative overflow-hidden rounded-full border border-cyan-400/40 bg-[#0a0d26]/85 shadow-lg backdrop-blur-md flex items-center justify-center text-xs font-bold text-cyan-200 select-none"
                style={{
                    height: compact ? U(40) : U(38),
                    minWidth: compact ? U(100) : U(120),
                    padding: `0 ${U(12)}`,
                }}
            >
                <div className="flex items-center gap-1.5 font-bold tracking-wide text-cyan-200">
                    <span style={{ fontSize: compact ? U(16) : U(18) }}>♾️</span>
                    <span style={{ fontSize: compact ? U(14) : U(16) }}>No Timer</span>
                </div>
            </div>
        );
    }

    const total = isMultiplayer
        ? (roomTurnTimeSec || 90)
        : (settings.timerSec || 90);
    const seconds = turnSecondsLeft;
    const pct = Math.max(0, Math.min(100, (seconds / Math.max(1, total)) * 100));

    // Dynamic color: green/teal when calm, amber under 25s, pulsing red under 10s
    const isCritical = seconds <= 10;
    const isWarning = seconds <= 25;
    const barGradient = isCritical
        ? 'from-red-600 via-rose-500 to-red-400'
        : isWarning
        ? 'from-amber-600 via-amber-500 to-yellow-400'
        : 'from-emerald-600 via-teal-500 to-emerald-400';

    return (
        <div
            className={`relative overflow-hidden rounded-full border-2 transition-all duration-300 shadow-xl backdrop-blur-md flex items-center justify-center select-none ${
                isCritical
                    ? 'border-red-400/80 bg-red-950/80 shadow-red-500/30'
                    : 'border-emerald-400/60 bg-[#0a0d26]/90 shadow-emerald-500/20'
            }`}
            style={{
                height: U(20),
                minWidth: compact ? U(72) : U(96),
                maxWidth: compact ? U(110) : U(150),
                padding: `0 ${U(8)}`,
            }}
        >
            {/* Smooth animated progress fill */}
            <div
                className={`absolute left-0 top-0 bottom-0 bg-gradient-to-r ${barGradient} opacity-60 transition-[width] duration-300 ease-linear`}
                style={{ width: `${pct}%` }}
            />
            {/* Glowing gold timer text */}
            <div className="relative z-10 flex items-center gap-1 font-black text-amber-300 tracking-wider drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]">
                <span style={{ fontSize: U(11) }}>⏳</span>
                <span
                    className={`font-mono leading-none ${isCritical ? 'text-red-200 animate-pulse' : 'text-amber-200'}`}
                    style={{ fontSize: compact ? U(12) : U(13) }}
                >
                    {seconds}s
                </span>
                {!compact && <span className="text-[9px] text-white/60 font-semibold leading-none">/{total}s</span>}
            </div>
        </div>
    );
}

/** Joint percentage bar where all 4 players are displayed cleanly, sorted by progress % and non-clickable */
function JointPercentageBar({ compact = false }: { compact?: boolean }) {
    const progress = useStore((s) => s.progress);
    const active = useStore((s) => s.active);
    const players = useStore((s) => s.players);
    const lang = useStore((s) => s.settings.lang);
    const current = useStore((s) => s.current);
    const rivalry = useStore((s) => s.rivalry);

    // Show all 4 players sorted by active status first, then descending progress %
    const idxs = [0, 1, 2, 3].sort((a, b) => {
        const activeDiff = (active[b] ? 1 : 0) - (active[a] ? 1 : 0);
        if (activeDiff !== 0) return activeDiff;
        const pctDiff = (progress[b] || 0) - (progress[a] || 0);
        if (pctDiff !== 0) return pctDiff;
        return a - b;
    });

    const nm = (i: number) => {
        const n = (players[i]?.name || '').trim();
        return !n || ['red', 'green', 'yellow', 'cyan', 'blue'].includes(n.toLowerCase()) ? colorName(lang, i) : n;
    };

    // Guarantee balanced minimum segment width so all 4 players and percentages never truncate
    const minShare = 18;
    const totalProgress = idxs.reduce((sum, i) => sum + (active[i] ? (progress[i] || 0) : 0), 0);
    const pool = Math.max(0, 100 - idxs.length * minShare);

    const widths = idxs.map((i) => {
        if (totalProgress === 0) {
            return 100 / idxs.length;
        }
        const val = active[i] ? (progress[i] || 0) : 0;
        const proportionalShare = (val / totalProgress) * pool;
        return minShare + proportionalShare;
    });

    return (
        <div
            id="ai-judge-bar"
            className="pointer-events-none relative flex items-stretch rounded-xl overflow-hidden border-2 border-white/40 shadow-xl backdrop-blur-md bg-black/60 select-none w-full"
            style={{
                height: U(30),
            }}
        >
            {idxs.map((i, index) => {
                const isActive = !!active[i];
                const isTurn = isActive && current === i;
                const widthPct = widths[index];
                const pct = isActive ? (progress[i] || 0) : 0;
                const isDethroneTarget = isActive && rivalry?.tier === 'dethrone' && rivalry.leaderIdx === i;
                return (
                    <div
                        key={i}
                        className={`pointer-events-none relative flex items-center justify-center font-black text-white text-center transition-[width] duration-500 ease-out overflow-hidden ${
                            !isActive
                                ? 'opacity-45 grayscale-[35%]'
                                : isDethroneTarget
                                ? 'brightness-110 z-20'
                                : isTurn
                                ? 'brightness-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10'
                                : 'opacity-95'
                        }`}
                        style={{
                            width: `${widthPct}%`,
                            background: isDethroneTarget
                                ? `linear-gradient(180deg, rgba(255,71,87,0.38) 0%, ${hex(COLORS[i])} 55%, rgba(255,71,87,0.38) 100%)`
                                : hex(COLORS[i]),
                            textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                            borderRight: index < idxs.length - 1 ? '1.5px solid rgba(255,255,255,0.35)' : 'none',
                            boxShadow: isDethroneTarget
                                ? 'inset 0 0 0 2px #ff4757, 0 0 12px rgba(255,71,87,0.85)'
                                : undefined,
                        }}
                    >
                        {/* Glowing active turn indicator atop the segment */}
                        {isTurn && (
                            <div className="absolute inset-x-0 top-0 h-1 bg-white animate-pulse shadow-[0_0_6px_#fff]" />
                        )}
                        {/* Subtle red bottom edge accent on Dethrone target */}
                        {isDethroneTarget && (
                            <div
                                className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse"
                                style={{ backgroundColor: '#ff4757' }}
                            />
                        )}

                        {/* Balanced label with non-truncating percentage */}
                        <div
                            className="px-1 flex items-center justify-center gap-1 min-w-0 font-black tracking-tight"
                            style={{ fontSize: compact ? '12px' : U(12) }}
                        >
                            {isDethroneTarget && (
                                <span className="shrink-0 leading-none" aria-label="Dethrone Target">
                                    🎯
                                </span>
                            )}
                            {widthPct > 23 && (
                                <span className="truncate min-w-0">
                                    {nm(i)}
                                </span>
                            )}
                            {widthPct <= 23 && players[i]?.avatar && (
                                <span className="shrink-0 leading-none text-[11px]">{players[i].avatar}</span>
                            )}
                            <span className="shrink-0 whitespace-nowrap font-mono">{pct}%</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Backward-compatible alias
const PlayerCardsRow = JointPercentageBar;

/** Lucky Wish button component */
function LuckyWishButton({ compact = false }: { compact?: boolean }) {
    const wishNums = useStore((s) => s.wishNums);
    const wishUsable = useStore((s) => s.wishUsable);

    return (
        <button
            onClick={() => bus.wish?.()}
            disabled={!wishUsable}
            aria-label="Lucky wish"
            title={wishUsable ? 'Click to activate Lucky Wish!' : 'Lucky Wish not available'}
            className={`flex items-center rounded-full border-2 font-black transition-all select-none ${
                wishUsable
                    ? 'pulse-wish border-amber-300 bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg scale-105 active:scale-95 cursor-pointer'
                    : 'border-white/20 bg-black/70 text-white/50 cursor-not-allowed'
            }`}
            style={{
                height: compact ? U(40) : U(64),
                padding: compact ? `0 ${U(14)}` : `0 ${U(18)}`,
                gap: compact ? U(6) : U(8),
                fontSize: compact ? U(16) : U(24),
            }}
        >
            <span style={{ fontSize: compact ? U(18) : U(24) }}>✨</span>
            <span>{wishNums ? `${wishNums[0]},${wishNums[1]}` : (compact ? 'Wish' : 'no wish')}</span>
        </button>
    );
}

/** Landscape / Web Top Bar:
 * - Royal Watch (Turn Timer) centered above the board (#turn-timer-container)
 * - Non-clickable Joint Progress Bar (all 4 players) widened at top: 20px; right: 20px (#ai-judge-bar)
 */
function LandscapeTopHud() {
    return (
        <>
            {/* Top-Center Above Board: Royal Watch (Turn Timer) */}
            <div
                id="turn-timer-container"
                className="pointer-events-none absolute top-2.5 -translate-x-1/2 z-20 flex items-center"
                style={{ left: 'var(--board-cx, 30%)' }}
            >
                <TurnTimer compact />
            </div>

            {/* Top-Right: Widened Non-Clickable All-4-Players Joint Progress Bar */}
            <div
                className="pointer-events-none absolute z-20 flex items-center"
                style={{ top: '20px', right: '20px', width: 'min(477px, 44vw)' }}
            >
                <JointPercentageBar compact />
            </div>
        </>
    );
}

const SEAT_BADGE_STYLES = [
    { name: 'Red', ring: 'border-red-400', bg: 'bg-red-500/20', text: 'text-red-300' },
    { name: 'Green', ring: 'border-emerald-400', bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
    { name: 'Yellow', ring: 'border-amber-400', bg: 'bg-amber-500/20', text: 'text-amber-300' },
    { name: 'Blue', ring: 'border-cyan-400', bg: 'bg-cyan-500/20', text: 'text-cyan-300' },
];

/** Projected HTML hit overlays aligned to Pixi's 4-seat nameplates with voice/whisper badges and floating reactions */
function NameplateOverlays() {
    const bounds = useStore((s) => s.nameplateBounds);
    const modal = useStore((s) => s.modal);
    const landscape = useStore((s) => s.landscape);
    const containerRef = useRef<HTMLDivElement>(null);
    const isMultiplayer = !!multiplayerClient.roomCode;
    const mySeat = multiplayerClient.myPlayerIndex;
    const roomPlayers = multiplayerClient.roomState?.players;
    const activeVoiceSeat = multiplayerClient.activeVoiceSeat;
    const activeWhisperBadge = multiplayerClient.activeWhisperBadge;
    const activeReactions = multiplayerClient.activeReactions;
    const localReactions = useStore((s) => s.localReactions);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didLongPressRef = useRef(false);

    if (!bounds.length || modal) return null;

    const frameW =
        containerRef.current?.clientWidth ||
        (landscape ? window.innerWidth : Math.min(window.innerWidth, (window.innerHeight * 9) / 16));

    return (
        <div ref={containerRef} className="pointer-events-none absolute inset-0 z-[25] overflow-hidden">
            {bounds.map((nb) => {
                const isVoice = isMultiplayer && activeVoiceSeat === nb.seatIdx;
                const isWhisper =
                    isMultiplayer &&
                    !!activeWhisperBadge &&
                    (activeWhisperBadge.fromSeat === nb.seatIdx || activeWhisperBadge.toSeats.includes(nb.seatIdx));
                const isMuted = isMultiplayer && multiplayerClient.isSeatMuted(nb.seatIdx);
                const reaction = isMultiplayer ? activeReactions[nb.seatIdx] : localReactions[nb.seatIdx];
                const roomPlayer = roomPlayers?.[nb.seatIdx];
                const canWhisperTarget =
                    isMultiplayer &&
                    nb.seatIdx !== mySeat &&
                    !!roomPlayer &&
                    !roomPlayer.isAI &&
                    roomPlayer.connected;

                const isCompactVertical = !landscape || nb.h < 28;
                const isRightHalf = nb.x + nb.w / 2 > frameW * 0.5;
                const isNearRightEdge = nb.x + nb.w > frameW - 14;
                const whisperPosClass = isCompactVertical
                    ? `top-1/2 -translate-y-1/2 ${isRightHalf ? '-left-2.5' : '-right-2.5'}`
                    : `${nb.y < 14 ? '-bottom-2' : '-top-2'} ${isNearRightEdge ? 'right-0' : '-right-2'}`;
                const statusPosClass = isCompactVertical
                    ? `top-1/2 -translate-y-1/2 ${isRightHalf ? '-left-2.5' : '-right-2.5'}`
                    : `${nb.y < 14 ? '-bottom-2.5' : '-top-2.5'} ${isNearRightEdge ? 'right-0' : '-right-2.5'}`;
                const mutedPosClass = isCompactVertical
                    ? `-bottom-2 ${isRightHalf ? 'left-0' : 'right-0'}`
                    : `-bottom-2 ${isNearRightEdge ? 'right-0' : '-right-2'}`;

                return (
                    <div
                        key={nb.seatIdx}
                        style={{
                            position: 'absolute',
                            left: nb.x,
                            top: nb.y,
                            width: nb.w,
                            height: nb.h,
                            transform: nb.angleDeg ? `rotate(${nb.angleDeg}deg)` : undefined,
                            transformOrigin: 'center center',
                        }}
                    >
                        {/* Floating emoji reaction bubble above (or below if near top) nameplate */}
                        {reaction && (
                            <div
                                key={reaction.key}
                                className={`pointer-events-none absolute ${
                                    nb.y < 52 ? '-bottom-8' : '-top-9'
                                } left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-slate-950/90 border border-amber-300/60 shadow-lg text-xl animate-bounce`}
                            >
                                {reaction.emoji}
                            </div>
                        )}

                        {/* Transparent interactive nameplate hit target (tap = Profile, long-press/double-click = Private Whisper) */}
                        <button
                            type="button"
                            aria-label={`Player ${nb.seatIdx + 1} nameplate`}
                            className={`nameplate-hit-btn pointer-events-auto w-full h-full rounded-lg cursor-pointer transition-all bg-transparent ${
                                isVoice
                                    ? 'ring-2 ring-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.75)]'
                                    : isWhisper
                                    ? 'ring-2 ring-purple-400 shadow-[0_0_14px_rgba(192,132,252,0.75)]'
                                    : ''
                            }`}
                            onPointerDown={() => {
                                didLongPressRef.current = false;
                                if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                                if (canWhisperTarget) {
                                    longPressTimerRef.current = setTimeout(() => {
                                        didLongPressRef.current = true;
                                        bus.openWhisperModal?.([nb.seatIdx]);
                                    }, 450);
                                }
                            }}
                            onPointerUp={() => {
                                if (longPressTimerRef.current) {
                                    clearTimeout(longPressTimerRef.current);
                                    longPressTimerRef.current = null;
                                }
                            }}
                            onPointerCancel={() => {
                                if (longPressTimerRef.current) {
                                    clearTimeout(longPressTimerRef.current);
                                    longPressTimerRef.current = null;
                                }
                            }}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (canWhisperTarget) bus.openWhisperModal?.([nb.seatIdx]);
                            }}
                            onClick={() => {
                                if (didLongPressRef.current) {
                                    didLongPressRef.current = false;
                                    return;
                                }
                                store.patch({ modal: `profile:${nb.seatIdx}` as const });
                            }}
                        />

                        {/* Quick Whisper trigger micro-pill on eligible connected human opponent */}
                        {canWhisperTarget && !isVoice && !isWhisper && !isMuted && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    bus.openWhisperModal?.([nb.seatIdx]);
                                }}
                                title="Send Private Voice Whisper"
                                className={`pointer-events-auto absolute ${whisperPosClass} z-10 w-5 h-5 rounded-full bg-purple-950/90 border border-purple-400/70 text-[10px] flex items-center justify-center shadow hover:scale-110 transition-transform cursor-pointer`}
                            >
                                🤫
                            </button>
                        )}

                        {/* Pulsing Speaking / Whispering / Muted badges */}
                        {isVoice && (
                            <div className={`pointer-events-none absolute ${statusPosClass} z-10 px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black shadow animate-pulse flex items-center gap-0.5`}>
                                <span>🔊</span>
                            </div>
                        )}
                        {!isVoice && isWhisper && (
                            <div className={`pointer-events-none absolute ${statusPosClass} z-10 px-1.5 py-0.5 rounded-full bg-purple-500 text-white text-[10px] font-black shadow animate-pulse flex items-center gap-0.5`}>
                                <span>🤫</span>
                            </div>
                        )}
                        {isMuted && (
                            <div
                                title="Seat muted"
                                className={`pointer-events-none absolute ${mutedPosClass} z-10 px-1 py-0.2 rounded-full bg-red-950/90 border border-red-400/60 text-red-200 text-[9px] font-black shadow`}
                            >
                                🔇
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** Private Targeted Whisper Composer Modal (4-Seat Aware: 3 opponent slots 0..3) */
function WhisperComposerModal({
    open,
    preselectSeats,
    onClose,
}: {
    open: boolean;
    preselectSeats: number[];
    onClose: () => void;
}) {
    const roomState = multiplayerClient.roomState;
    const mySeat = multiplayerClient.myPlayerIndex ?? 0;
    const opponentSeats = [0, 1, 2, 3].filter((s) => s !== mySeat);

    const isEligible = (s: number) => {
        const p = roomState?.players[s];
        return !!p && !p.isAI && p.connected;
    };

    const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
    const [recording, setRecording] = useState(false);
    const [sending, setSending] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [level, setLevel] = useState(0);
    const [localErr, setLocalErr] = useState<string | null>(null);
    const capRef = useRef<UniversalAudioCapture | null>(null);
    const pressAtRef = useRef(0);

    useEffect(() => {
        if (!open) {
            capRef.current?.cancelPendingOrActive();
            capRef.current = null;
            setRecording(false);
            setElapsedMs(0);
            setLevel(0);
            setLocalErr(null);
            return;
        }
        const eligiblePre = preselectSeats.filter((s) => s !== mySeat && isEligible(s));
        if (eligiblePre.length > 0) {
            setSelectedSeats(eligiblePre);
        } else {
            const firstEligible = opponentSeats.find(isEligible);
            setSelectedSeats(firstEligible !== undefined ? [firstEligible] : []);
        }
    }, [open, preselectSeats, mySeat]);

    if (!open || !roomState) return null;

    const eligibleCount = opponentSeats.filter(isEligible).length;
    const secretMode = !!roomState.secretWhispers;

    const toggleSeat = (s: number) => {
        if (!isEligible(s) || recording) return;
        setSelectedSeats((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    };

    const handleFinish = async (res: AudioCaptureResult) => {
        setRecording(false);
        setElapsedMs(0);
        setLevel(0);
        if (!res.ok || !res.bytes) {
            if (res.errorCode === 'NO_SOUND') {
                setLocalErr('No microphone sound detected');
                multiplayerClient.showToast('No microphone sound detected', 'warn');
            } else if (res.errorCode && res.errorCode !== 'CANCELLED') {
                setLocalErr(res.error || 'Could not record whisper');
            }
            return;
        }
        if (selectedSeats.length === 0) {
            setLocalErr('Select at least one opponent');
            return;
        }
        setSending(true);
        const sendRes = await multiplayerClient.sendWhisper(selectedSeats, res.bytes, res.mimeType || 'audio/wav');
        setSending(false);
        if (sendRes.success) {
            onClose();
        } else {
            setLocalErr(sendRes.error || 'Failed to send whisper');
        }
    };

    const startWhisperRec = () => {
        if (recording || sending || selectedSeats.length === 0) return;
        setLocalErr(null);
        const cap = new UniversalAudioCapture({
            maxBytes: 60_000,
            maxMs: 5500,
            onProgress: (ms, lvl) => {
                setElapsedMs(ms);
                setLevel(lvl);
            },
            onAutoStop: (res) => {
                capRef.current = null;
                void handleFinish(res);
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
                    setLocalErr(r.error);
                }
            }
        });
    };

    const stopWhisperRec = (cancel = false) => {
        const cap = capRef.current;
        if (!cap) return;
        capRef.current = null;
        void cap.stop(cancel).then((res) => {
            void handleFinish(res);
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none"
            onClick={onClose}
        >
            <div
                className="w-full max-w-sm rounded-2xl border border-purple-400/50 bg-slate-950/95 p-4 text-slate-100 shadow-[0_0_40px_rgba(168,85,247,0.35)] flex flex-col gap-3"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">🤫</span>
                        <div>
                            <div className="text-sm font-black text-purple-200 tracking-wide">Private Voice Whisper</div>
                            <div className="text-[10px] text-slate-400">
                                {secretMode ? '🕶️ Hidden Mode (Room cannot see whispers)' : '👁️ Transparent Mode (Room sees who whispered)'}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white font-black text-sm cursor-pointer px-1"
                    >
                        ✕
                    </button>
                </div>

                {/* 3 Opponent Targets */}
                <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Select Recipients (1 or more connected players)
                    </div>
                    {eligibleCount === 0 ? (
                        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-amber-200/90 font-semibold text-center">
                            No connected human opponents available right now (AI bots and disconnected seats cannot receive whispers).
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-1.5">
                            {opponentSeats.map((s) => {
                                const p = roomState.players[s];
                                const ok = isEligible(s);
                                const active = selectedSeats.includes(s);
                                const st = SEAT_BADGE_STYLES[s];
                                return (
                                    <button
                                        key={s}
                                        type="button"
                                        disabled={!ok || recording}
                                        onClick={() => toggleSeat(s)}
                                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl border text-left transition-all ${
                                            !ok
                                                ? 'border-slate-800 bg-slate-900/40 opacity-50 cursor-not-allowed'
                                                : active
                                                ? `${st.ring} ${st.bg} text-white shadow cursor-pointer`
                                                : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 cursor-pointer'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-base">{p?.avatar || '👤'}</span>
                                            <div className="min-w-0">
                                                <div className="text-xs font-black truncate">
                                                    {p ? p.name : `${st.name} Seat`}
                                                </div>
                                                <div className={`text-[10px] font-bold ${st.text}`}>
                                                    {!p
                                                        ? 'Empty seat'
                                                        : p.isAI
                                                        ? '🤖 AI Bot (Disabled)'
                                                        : p.connected
                                                        ? `${st.name} • Online`
                                                        : 'Disconnected'}
                                                </div>
                                            </div>
                                        </div>
                                        {ok && (
                                            <span
                                                className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs font-black ${
                                                    active ? 'bg-purple-500 border-purple-300 text-white' : 'border-slate-600 text-transparent'
                                                }`}
                                            >
                                                ✓
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {localErr && (
                    <div className="px-2.5 py-1.5 rounded-lg bg-red-950/70 border border-red-500/40 text-red-200 text-xs font-bold">
                        ⚠️ {localErr}
                    </div>
                )}

                {recording && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-red-950/60 border border-red-400/50">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-ping" />
                            <span className="font-mono text-xs font-black text-red-200">
                                {(elapsedMs / 1000).toFixed(1)}s / 5.5s
                            </span>
                        </div>
                        <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-400 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
                        </div>
                        <button
                            type="button"
                            onClick={() => stopWhisperRec(true)}
                            className="text-xs font-black text-slate-300 hover:text-white cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={eligibleCount === 0 || selectedSeats.length === 0 || sending}
                        onPointerDown={(e) => {
                            e.preventDefault();
                            pressAtRef.current = Date.now();
                            if (recording) stopWhisperRec(false);
                            else startWhisperRec();
                        }}
                        onPointerUp={() => {
                            if (recording && Date.now() - pressAtRef.current > 380) {
                                stopWhisperRec(false);
                            }
                        }}
                        onPointerCancel={() => stopWhisperRec(true)}
                        className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            recording
                                ? 'bg-red-600 text-white ring-2 ring-red-300 animate-pulse'
                                : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:brightness-110'
                        }`}
                    >
                        {sending
                            ? '⏳ Sending Whisper...'
                            : recording
                            ? '⏹ Tap to Send Whisper'
                            : '🎤 Hold or Tap to Whisper (Max 5.5s)'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function Hud() {
    const lang = useStore((s) => s.settings.lang);
    const popup = useStore((s) => s.popup);
    const players = useStore((s) => s.players);
    const wishNums = useStore((s) => s.wishNums);
    const wishUsable = useStore((s) => s.wishUsable);
    const modal = useStore((s) => s.modal);
    const current = useStore((s) => s.current);
    const landscape = useStore((s) => s.landscape);
    const isWaitingRoll = useStore((s) => s.isWaitingRoll);
    const gulPrompt = useStore((s) => s.gulPrompt);
    const activeSpeechBalloon = useStore((s) => s.activeSpeechBalloon);
    const captureNotice = useStore((s) => s.captureNotice);
    const skipCapturePrompt = useStore((s) => s.skipCapturePrompt);
    const rivalryBanner = useStore((s) => s.rivalryBanner);
    const adBannerBound = useStore((s) => s.adBannerBound);

    const [, setNetTick] = useState(0);
    const chatOpen = useStore((s) => s.chatOpen);
    const [copiedCode, setCopiedCode] = useState(false);
    const [customChat, setCustomChat] = useState('');
    const [whisperOpen, setWhisperOpen] = useState(false);
    const [whisperPreselect, setWhisperPreselect] = useState<number[]>([]);

    useEffect(() => {
        const unsub = multiplayerClient.subscribe(() => setNetTick((t) => t + 1));
        return unsub;
    }, []);

    useEffect(() => {
        bus.openWhisperModal = (seats) => {
            setWhisperPreselect(seats || []);
            setWhisperOpen(true);
            store.patch({ chatOpen: false });
        };
        return () => {
            bus.openWhisperModal = undefined;
        };
    }, []);

    const isMultiplayer = !!multiplayerClient.roomCode;
    const roomCode = multiplayerClient.roomCode;
    const isMyTurn = isMultiplayer ? multiplayerClient.myPlayerIndex === current : !players[current]?.ai;
    const secondsLeft = multiplayerClient.turnSecondsLeft;
    const recentChat = multiplayerClient.recentChat;
    const offlineNotice = multiplayerClient.offlineNotice;
    const toastNotice = multiplayerClient.toastNotice;
    const blockedAutoplayClip = multiplayerClient.blockedAutoplayClip;
    const activeVoiceSeat = multiplayerClient.activeVoiceSeat;
    const chatLog = multiplayerClient.chatLog;

    const cleanPlayerName = (raw: string): string => {
        if (!raw) return '';
        return raw.replace(/\s*#[a-zA-Z0-9_-]+$/, '').trim();
    };

    const nm = (i: number) => {
        const raw = (players[i]?.name || '').trim();
        const n = cleanPlayerName(raw);
        return !n || ['red', 'green', 'yellow', 'cyan', 'blue'].includes(n.toLowerCase()) ? colorName(lang, i) : n;
    };

    const handleCopyCode = () => {
        if (!roomCode) return;
        const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
        void navigator.clipboard?.writeText(link).then(() => {
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 2000);
        });
    };

    const myIdx = isMultiplayer ? (multiplayerClient.myPlayerIndex ?? 0) : 0;

    const sendQuickEmoji = (emoji: string) => {
        if (isMultiplayer) {
            void multiplayerClient.sendReaction(emoji);
        } else if (bus.chat) {
            bus.chat(myIdx, emoji, { voice: false });
        }
        store.patch({ chatOpen: false });
    };

    const sendQuickPhrase = (phrase: string) => {
        if (isMultiplayer) {
            void multiplayerClient.sendLudoChat(phrase);
        } else if (bus.chat) {
            bus.chat(myIdx, phrase, { voice: true });
        }
        store.patch({ chatOpen: false });
    };

    const sendCustomMessage = () => {
        if (!customChat.trim()) return;
        const msg = customChat.trim();
        if (isMultiplayer) {
            void multiplayerClient.sendLudoChat(msg);
        } else if (bus.chat) {
            bus.chat(myIdx, msg, { voice: true });
        }
        setCustomChat('');
    };

    return (
        <>
            {/* Top HUD (non-clickable #ai-judge-bar + #turn-timer-container) */}
            {landscape ? (
                <LandscapeTopHud />
            ) : (
                /* Vertical Top: Non-clickable 4-Player Progress bar + Centered Timer above the board */
                <div className="pointer-events-none absolute top-2.5 inset-x-3 z-20 flex flex-col items-stretch gap-1">
                    <div className="w-full">
                        <JointPercentageBar />
                    </div>
                    <div id="turn-timer-container" className="w-full flex items-center justify-center">
                        <TurnTimer compact />
                    </div>
                </div>
            )}

            {/* Policy-Compliant Ad Banner (#ad-banner) with >=150px separation and non-clickable buffer */}
            {adBannerBound && adBannerBound.visible && !modal && (
                <div
                    id="ad-banner"
                    role="region"
                    aria-label="Sponsored advertisement"
                    className={`pointer-events-none absolute z-20 flex flex-col items-center justify-center border-cyan-400/35 bg-[#090f24]/85 backdrop-blur-sm shadow-[0_0_24px_rgba(0,0,0,0.45)] overflow-hidden select-none ${
                        adBannerBound.w > adBannerBound.h ? 'border-y rounded-none' : 'border rounded-xl'
                    }`}
                    style={{
                        left: adBannerBound.w > adBannerBound.h ? 0 : `${adBannerBound.x}px`,
                        right: adBannerBound.w > adBannerBound.h ? 0 : undefined,
                        top: `${adBannerBound.y}px`,
                        width: adBannerBound.w > adBannerBound.h ? '100%' : `${adBannerBound.w}px`,
                        height: `${adBannerBound.h}px`,
                        padding: adBannerBound.w > adBannerBound.h ? '6px 0' : '4px',
                    }}
                >
                    <div
                        className={`w-full h-full border-cyan-400/20 bg-slate-950/65 flex items-center justify-between overflow-hidden ${
                            adBannerBound.w > adBannerBound.h ? 'border-y px-4 py-2 rounded-none' : 'rounded-lg border px-2.5 py-1.5'
                        }`}
                    >
                        {adBannerBound.w > adBannerBound.h ? (
                            <div className="flex items-center justify-between w-full gap-3">
                                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black tracking-wider uppercase shrink-0">
                                    SPONSORED
                                </span>
                                <div className="flex flex-col items-center text-center min-w-0">
                                    <span className="text-xs sm:text-sm font-extrabold text-slate-200/90 tracking-wide truncate">
                                        Partner Placement
                                    </span>
                                    <span className="text-[10px] text-slate-400/80 leading-tight truncate">
                                        Safe Display Zone
                                    </span>
                                </div>
                                <span className="text-[10px] font-semibold text-cyan-300/60 uppercase tracking-widest shrink-0">
                                    AD
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-between w-full h-full py-1.5 text-center">
                                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-black tracking-wider uppercase">
                                    SPONSORED
                                </span>
                                <div className="flex flex-col items-center gap-1 px-2">
                                    <span className="text-xs font-extrabold text-slate-200/85 tracking-wide">
                                        Sponsored Space
                                    </span>
                                    <span className="text-[10px] text-slate-400/80 leading-tight">
                                        Safe Display Zone
                                    </span>
                                </div>
                                <span className="text-[9px] font-semibold text-cyan-300/60 uppercase tracking-widest">
                                    AD
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Projected 4-Corner Nameplate Hit Overlays, Profile/Mute/Whisper Interactions, Reactions & Voice Badges */}
            <NameplateOverlays />

            {/* Live Voice HUD: shifted left of #ai-judge-bar in Landscape so zero overlap with bar or timer */}
            {isMultiplayer && activeVoiceSeat !== null && (
                <div
                    id="live-voice-hud"
                    className="pointer-events-none absolute z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/90 border border-emerald-400/70 text-emerald-200 text-xs font-black shadow-lg"
                    style={
                        landscape
                            ? { top: '20px', right: 'min(508px, 47vw)' }
                            : { top: '72px', left: '50%', transform: 'translateX(-50%)' }
                    }
                >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>🔊 {nm(activeVoiceSeat)}</span>
                </div>
            )}

            {/* Autoplay Blocked Tap-to-Hear Voice Banner */}
            {isMultiplayer && blockedAutoplayClip && (
                <div
                    className="absolute z-40 pointer-events-auto"
                    style={
                        landscape
                            ? { top: '20px', right: 'min(508px, 47vw)' }
                            : { top: '80px', left: '50%', transform: 'translateX(-50%)' }
                    }
                >
                    <button
                        type="button"
                        onClick={() => multiplayerClient.playClipById(blockedAutoplayClip.id)}
                        className="px-3.5 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-xl border border-emerald-200 flex items-center gap-1.5 animate-pulse cursor-pointer"
                    >
                        <span>🔊</span>
                        <span>Tap to hear: {blockedAutoplayClip.label}</span>
                    </button>
                </div>
            )}

            {/* Toast Notification (Mic silence / cooldown / whisper errors) */}
            {toastNotice && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4">
                    <div
                        className={`px-3.5 py-1.5 rounded-full text-xs font-black shadow-xl border backdrop-blur-md flex items-center gap-1.5 ${
                            toastNotice.kind === 'error'
                                ? 'bg-red-950/90 border-red-400/70 text-red-100'
                                : toastNotice.kind === 'warn'
                                ? 'bg-amber-950/90 border-amber-400/70 text-amber-100'
                                : 'bg-slate-900/90 border-cyan-400/70 text-cyan-100'
                        }`}
                    >
                        <span>{toastNotice.kind === 'error' ? '⚠️' : toastNotice.kind === 'warn' ? '🔔' : '💬'}</span>
                        <span>{toastNotice.message}</span>
                    </div>
                </div>
            )}

            {/* Offline / Reconnecting notice in multiplayer */}
            {isMultiplayer && offlineNotice && (
                <div className="absolute top-16 left-0 right-0 z-20 flex flex-col items-center pointer-events-none px-4">
                    <div className="pointer-events-auto mb-2 px-4 py-1.5 rounded-full bg-red-600/90 text-white font-extrabold text-xs sm:text-sm shadow-lg animate-pulse flex items-center gap-2">
                        <span>⚠️</span> <span>{offlineNotice}</span>
                    </div>
                </div>
            )}

            {/* In-Game Floating Chat / Voice Notification (Glass window at .40x scale) */}
            {recentChat && Date.now() - recentChat.time < 5000 && !activeSpeechBalloon && (
                <div
                    className="absolute top-28 left-1/2 z-30 pointer-events-none animate-bounce"
                    style={{
                        transform: 'translateX(-50%) scale(0.40)',
                        transformOrigin: 'center center',
                        width: 'max-content',
                    }}
                >
                    <div className="bg-slate-900/40 backdrop-blur-md border border-cyan-400/50 shadow-xl px-4 py-2 rounded-2xl flex items-center gap-2.5 text-white">
                        <span className="text-2xl">{recentChat.avatar}</span>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-cyan-300">{cleanPlayerName(recentChat.name)}</div>
                            <div className="text-sm font-extrabold">{recentChat.emoji} {recentChat.text}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Emoji, Chat, Voice Log & Private Whisper Menu */}
            {chatOpen && (
                <div
                    className="absolute z-35 bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2 w-[290px] sm:w-[330px] max-h-[75vh] pointer-events-auto"
                    style={{ left: U(12), bottom: U(48) }}
                >
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                        <span className="text-xs font-black uppercase text-cyan-400">
                            {isMultiplayer ? 'Banter, Voice & Whispers' : 'Quick Banter & Reactions'}
                        </span>
                        <div className="flex items-center gap-1.5">
                            {isMultiplayer && (
                                <button
                                    type="button"
                                    onClick={() => bus.openWhisperModal?.([])}
                                    className="px-2 py-0.5 rounded-full bg-purple-500/25 hover:bg-purple-500/40 border border-purple-400/60 text-purple-200 text-[10px] font-black cursor-pointer"
                                    title="Send Private Voice Whisper"
                                >
                                    🤫 Whisper
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => store.patch({ chatOpen: false })}
                                className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Emoji picker grid */}
                    <div className="flex flex-wrap gap-1.5">
                        {QUICK_EMOJIS.map((em) => (
                            <button
                                key={em}
                                type="button"
                                onClick={() => sendQuickEmoji(em)}
                                className="w-8 h-8 text-lg bg-white/5 hover:bg-cyan-500/20 rounded-lg flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
                            >
                                {em}
                            </button>
                        ))}
                    </div>

                    {/* Live Chat & Voice Feed (Online Mode) */}
                    {isMultiplayer && chatLog.length > 0 && (
                        <div className="max-h-32 overflow-y-auto flex flex-col gap-1 pr-1 border-y border-slate-800 py-1.5">
                            {chatLog.slice(-20).map((entry) => {
                                const hasClip =
                                    (entry.kind === 'voice' || entry.kind === 'whisper_in' || entry.kind === 'whisper_out') &&
                                    !!entry.payload;
                                const isWhisperRow = entry.kind === 'whisper_in' || entry.kind === 'whisper_out' || entry.kind === 'whisper_notice';
                                const isSystemRow = entry.kind === 'system';
                                return (
                                    <div
                                        key={entry.id}
                                        className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg text-[11px] ${
                                            isSystemRow
                                                ? 'bg-amber-950/45 border border-amber-400/35 text-amber-100 italic'
                                                : isWhisperRow
                                                ? 'bg-purple-950/50 border border-purple-500/30 text-purple-100'
                                                : 'bg-slate-950/70 text-slate-200'
                                        }`}
                                    >
                                        <div className="min-w-0 truncate">
                                            <span className={`font-black mr-1 ${isSystemRow ? 'text-amber-300' : 'text-cyan-300'}`}>
                                                {isSystemRow ? '🎯' : `${cleanPlayerName(entry.sender)}:`}
                                            </span>
                                            <span>
                                                {entry.emoji ? `${entry.emoji} ` : ''}
                                                {entry.text}
                                            </span>
                                        </div>
                                        {hasClip && (
                                            <button
                                                type="button"
                                                onClick={() => multiplayerClient.playClipById(entry.id)}
                                                className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 text-[10px] font-black cursor-pointer"
                                            >
                                                ▶ {entry.duration || 1}s
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Quick Phrases */}
                    <div className="grid grid-cols-2 gap-1 pt-0.5">
                        {QUICK_PHRASES.map((ph) => (
                            <button
                                key={ph}
                                type="button"
                                onClick={() => sendQuickPhrase(ph)}
                                className="text-left text-[11px] font-semibold px-2 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-200 transition-all truncate cursor-pointer"
                            >
                                {ph}
                            </button>
                        ))}
                    </div>

                    {/* Custom text input */}
                    <div className="flex gap-1.5 pt-1 border-t border-slate-800">
                        <input
                            type="text"
                            maxLength={isMultiplayer ? 120 : 60}
                            value={customChat}
                            onChange={(e) => setCustomChat(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendCustomMessage()}
                            placeholder="Type a message..."
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-cyan-400"
                        />
                        <button
                            type="button"
                            onClick={sendCustomMessage}
                            className="px-2.5 py-1 bg-cyan-500 text-slate-950 rounded-lg font-black text-xs cursor-pointer"
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}

            {/* Private Targeted Whisper Composer Modal */}
            <WhisperComposerModal
                open={whisperOpen}
                preselectSeats={whisperPreselect}
                onClose={() => setWhisperOpen(false)}
            />

            {/* Popup announcements (Penalty on the board, Lucky 7, Info) - Glass window at .40x scale */}
            {popup && !modal && (
                popup.kind === 'penalty' ? (
                    /* Dramatic Penalty alert placed directly ON the board as a translucent glass window (.40x size) */
                    <div
                        className="pointer-events-none absolute z-35 flex items-center justify-center animate-bounce duration-700"
                        style={{
                            top: landscape ? '36%' : '26%',
                            left: landscape ? 'var(--board-cx, 45%)' : '50%',
                            transform: landscape ? 'translate(-50%, -50%) scale(0.40)' : 'translateX(-50%) scale(0.40)',
                            transformOrigin: 'center center',
                            width: 'max-content',
                            maxWidth: '92vw',
                        }}
                    >
                        <div
                            className="pop pointer-events-none rounded-3xl border-2 text-center backdrop-blur-md shadow-[0_8px_32px_0_rgba(239,68,68,0.4)] select-none"
                            style={{
                                padding: `${U(16)} ${U(26)}`,
                                borderColor: 'rgba(248, 113, 113, 0.65)',
                                maxWidth: U(560),
                                background: 'rgba(50, 10, 20, 0.40)',
                            }}
                        >
                            <div className="flex items-center justify-center gap-2 font-black text-red-300 drop-shadow-[0_0_12px_rgba(239,68,68,0.9)] animate-pulse" style={{ fontSize: U(34) }}>
                                <span>🚨</span>
                                <span>⚠️ {popup.title} ⚠️</span>
                                <span>🚨</span>
                            </div>
                            <div className="text-white font-extrabold tracking-wide" style={{ fontSize: U(22), marginTop: U(8) }}>
                                {popup.sub}
                            </div>
                            <div className="inline-block rounded-full bg-red-600/30 border border-red-500/50 text-red-200 font-bold px-3 py-1" style={{ fontSize: U(14), marginTop: U(8) }}>
                                ⚠️ Missed mandatory capture! Token sent back to Base!
                            </div>
                            <div className="flex justify-center" style={{ marginTop: U(12) }}>
                                <button
                                    onClick={() => store.patch({ popup: null })}
                                    className="pointer-events-auto rounded-xl bg-gradient-to-r from-red-600/80 to-rose-600/80 hover:from-red-500 hover:to-rose-500 text-white font-black shadow-lg active:scale-95 transition-all cursor-pointer border border-white/25"
                                    style={{ padding: `${U(8)} ${U(32)}`, fontSize: U(20) }}
                                >
                                    {tr(lang, 'ok')}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Lucky 7 / Info popup centered on board as a translucent glass window (.40x size) */
                    <div
                        className="pointer-events-none absolute z-35 flex items-center justify-center"
                        style={{
                            top: landscape ? '36%' : '30%',
                            left: landscape ? 'var(--board-cx, 45%)' : '50%',
                            transform: landscape ? 'translate(-50%, -50%) scale(0.40)' : 'translateX(-50%) scale(0.40)',
                            transformOrigin: 'center center',
                            width: 'max-content',
                            maxWidth: '92vw',
                        }}
                    >
                        <div
                            className="pop pointer-events-none rounded-3xl border-2 text-center backdrop-blur-md shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] select-none"
                            style={{
                                padding: `${U(16)} ${U(30)}`,
                                maxWidth: U(560),
                                borderColor: popup.kind === 'lucky' ? 'rgba(255, 200, 58, 0.65)' : 'rgba(24, 224, 255, 0.65)',
                                background: popup.kind === 'lucky' ? 'rgba(32, 24, 8, 0.40)' : 'rgba(10, 16, 38, 0.40)',
                            }}
                        >
                            <div className="font-black" style={{ fontSize: U(38), color: popup.kind === 'lucky' ? '#ffd84a' : '#7fe9ff' }}>
                                {popup.kind === 'lucky' ? '✨7 ' : ''}{popup.title}
                            </div>
                            <div className="text-white/95 font-bold" style={{ fontSize: U(24), marginTop: U(4) }}>
                                {popup.sub}
                            </div>
                            <button
                                onClick={() => store.patch({ popup: null })}
                                className="pointer-events-auto rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white font-bold cursor-pointer transition-all active:scale-95"
                                style={{ marginTop: U(10), padding: `${U(6)} ${U(26)}`, fontSize: U(22) }}
                            >
                                {tr(lang, 'ok')}
                            </button>
                        </div>
                    </div>
                )
            )}

            {/* Rivalry Drama Banner (Dethrone Alert / Leader Hit / Grudge Payback) */}
            {rivalryBanner && !modal && !captureNotice && !skipCapturePrompt && (
                <div
                    className="pointer-events-none absolute z-35 flex items-center justify-center transition-all"
                    style={{
                        top: landscape ? U(36) : U(50),
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 'max-content',
                        maxWidth: '92vw',
                    }}
                >
                    <div
                        className={`flex flex-col items-center px-4 py-1.5 rounded-2xl border backdrop-blur-md shadow-xl select-none text-center ${
                            rivalryBanner.kind === 'dethrone_alert'
                                ? 'border-[#ff4757]/80 bg-red-950/90 text-red-100 shadow-[0_0_22px_rgba(255,71,87,0.45)]'
                                : rivalryBanner.kind === 'leader_hit'
                                ? 'border-amber-400/80 bg-slate-950/90 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                                : 'border-purple-400/80 bg-slate-950/90 text-purple-100 shadow-[0_0_20px_rgba(168,85,247,0.35)]'
                        }`}
                    >
                        <div className="flex items-center gap-1.5 text-[11px] font-black tracking-wider uppercase">
                            <span>{rivalryBanner.icon}</span>
                            <span>{rivalryBanner.title}</span>
                        </div>
                        <div className="text-xs font-semibold text-white/90 max-w-[340px] truncate">
                            {rivalryBanner.message}
                        </div>
                    </div>
                </div>
            )}

            {/* Short Note: Capture available (First 3 matches only) */}
            {captureNotice && !modal && !skipCapturePrompt && (
                <div
                    className="pointer-events-none absolute z-35 flex items-center justify-center transition-all animate-fadeIn"
                    style={{
                        top: landscape ? U(36) : U(50),
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 'max-content',
                        maxWidth: '92vw',
                    }}
                >
                    <div
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-400/80 bg-slate-950/90 shadow-[0_0_20px_rgba(245,158,11,0.35)] backdrop-blur-md text-amber-200 select-none text-center"
                    >
                        <span className="text-base animate-pulse">⚠️</span>
                        <span className="text-xs sm:text-sm font-extrabold text-white tracking-wide">
                            {captureNotice}
                        </span>
                    </div>
                </div>
            )}

            {/* Confirmation: Move skips capture (First 3 matches only) */}
            {skipCapturePrompt && !modal && (
                <div className="fixed inset-0 z-45 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 select-none">
                    <div
                        className="pop relative z-10 w-full rounded-3xl border-3 border-amber-400/80 text-center backdrop-blur-xl shadow-[0_0_55px_rgba(234,179,8,0.6)] bg-gradient-to-b from-[#1c121e]/98 via-[#130d1d]/98 to-[#090710]/98 select-none"
                        style={{
                            maxWidth: U(500),
                            padding: `${U(20)} ${U(24)}`,
                        }}
                    >
                        <div className="flex items-center justify-center gap-2 font-black text-amber-300 drop-shadow-[0_0_12px_rgba(234,179,8,0.8)]" style={{ fontSize: U(26) }}>
                            <span>⚠️</span>
                            <span>MISSED CAPTURE WARNING</span>
                            <span>⚠️</span>
                        </div>

                        <div className="text-white font-extrabold tracking-wide" style={{ fontSize: U(18), marginTop: U(12), lineHeight: 1.4 }}>
                            {skipCapturePrompt.message || "This move skips a capture. The token that could have captured will go back to base. Continue anyway?"}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch" style={{ marginTop: U(20) }}>
                            <button
                                type="button"
                                onClick={() => {
                                    bus.onSkipCaptureDecision?.('back');
                                    store.patch({ skipCapturePrompt: null });
                                }}
                                className="flex-1 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 active:scale-95 text-white font-black shadow-[0_0_20px_rgba(6,182,212,0.5)] cursor-pointer flex items-center justify-center transition-all"
                                style={{ padding: `${U(12)} ${U(20)}`, fontSize: U(18) }}
                            >
                                ↩️ Go back
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    bus.onSkipCaptureDecision?.('continue');
                                    store.patch({ skipCapturePrompt: null });
                                }}
                                className="flex-1 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:brightness-110 active:scale-95 text-white font-black shadow-[0_0_20px_rgba(239,68,68,0.5)] cursor-pointer flex items-center justify-center transition-all"
                                style={{ padding: `${U(12)} ${U(20)}`, fontSize: U(18) }}
                            >
                                ⚠️ Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* "Gul or Pass?" Prompt */}
            {gulPrompt && !modal && (
                <div
                    className="fixed inset-0 z-45 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 select-none"
                >
                    <div
                        className="pop relative z-10 w-full rounded-3xl border-4 text-center backdrop-blur-xl shadow-[0_0_65px_rgba(234,179,8,0.75)] bg-gradient-to-b from-[#181c3b]/98 via-[#10142d]/98 to-[#060814]/98 select-none"
                        style={{
                            maxWidth: U(540),
                            padding: `${U(22)} ${U(26)}`,
                            borderColor: '#eab308',
                        }}
                    >
                        <div className="flex items-center justify-center gap-2 font-black text-amber-300 drop-shadow-[0_0_12px_rgba(234,179,8,0.9)]" style={{ fontSize: U(32) }}>
                            <span>🏰</span>
                            <span>GUL OR PASS?</span>
                            <span>🏰</span>
                        </div>
                        
                        <div className="text-white font-extrabold tracking-wide" style={{ fontSize: U(20), marginTop: U(10) }}>
                            Exact roll to enter the Centre (Gul)!
                        </div>

                        <div className="text-white/80 font-medium" style={{ fontSize: U(15), marginTop: U(6) }}>
                            Enter the centre to complete this pawn and earn an extra turn, or pass to stay on the path.
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch" style={{ marginTop: U(18) }}>
                            <button
                                onClick={() => {
                                    bus.onGulDecision?.('gul');
                                    store.patch({ gulPrompt: null });
                                }}
                                className="flex-1 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 active:scale-95 text-slate-950 font-black shadow-[0_0_20px_rgba(250,204,21,0.6)] cursor-pointer flex flex-col items-center justify-center transition-all"
                                style={{ padding: `${U(12)} ${U(20)}` }}
                            >
                                <span className="flex items-center gap-1.5" style={{ fontSize: U(20) }}>
                                    <span>🏆</span> GUL (ENTER)
                                </span>
                                <span className="text-xs font-bold text-slate-800 tracking-normal opacity-90">
                                    +1 Extra Turn & Home
                                </span>
                            </button>

                            <button
                                onClick={() => {
                                    bus.onGulDecision?.('pass');
                                    store.patch({ gulPrompt: null });
                                }}
                                className="flex-1 rounded-2xl bg-white/10 hover:bg-white/20 border-2 border-white/30 active:scale-95 text-white font-black cursor-pointer flex flex-col items-center justify-center transition-all"
                                style={{ padding: `${U(12)} ${U(20)}` }}
                            >
                                <span className="flex items-center gap-1.5" style={{ fontSize: U(20) }}>
                                    <span>🛑</span> PASS
                                </span>
                                <span className="text-xs font-semibold text-slate-300 tracking-normal opacity-80">
                                    Pass turn (stay on path)
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dedicated Winner Celebration & All-4-Players Percentage Overlay */}
            <WinnerOverlay />
        </>
    );
}
