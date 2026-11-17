import { useState, useEffect } from 'react';
import { store, useStore } from '../state/store';
import { bus } from '../game/bus';
import { tr, colorName } from '../i18n';
import { COLORS } from '../game/rules';
import { U } from './kit';
import { multiplayerClient } from '../network/multiplayerClient';
import { WinnerOverlay } from './WinnerOverlay';
import * as sfx from '../game/sfx';

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

/** Joint percentage bar where players are joined into a continuous bar and higher percentage shows bigger segment */
function JointPercentageBar({ compact = false }: { compact?: boolean }) {
    const progress = useStore((s) => s.progress);
    const active = useStore((s) => s.active);
    const players = useStore((s) => s.players);
    const lang = useStore((s) => s.settings.lang);
    const current = useStore((s) => s.current);
    const idxs = [0, 1, 2, 3].filter((i) => active[i]);

    const nm = (i: number) => {
        const n = (players[i]?.name || '').trim();
        return !n || ['red', 'green', 'yellow', 'cyan', 'blue'].includes(n.toLowerCase()) ? colorName(lang, i) : n;
    };

    // Calculate dynamic proportional widths:
    // The player with more percentage shows big, while the player with less shows less color.
    // We guarantee a minimum visible slice (minShare) so names/colors are always readable.
    const minShare = 10;
    const totalProgress = idxs.reduce((sum, i) => sum + (progress[i] || 0), 0);
    const pool = Math.max(0, 100 - idxs.length * minShare);

    const widths = idxs.map((i) => {
        if (totalProgress === 0) {
            return 100 / idxs.length;
        }
        const proportionalShare = ((progress[i] || 0) / totalProgress) * pool;
        return minShare + proportionalShare;
    });

    return (
        <div
            className={`relative flex items-stretch rounded-xl overflow-hidden border-2 border-white/40 shadow-xl backdrop-blur-md bg-black/60 select-none ${
                compact ? 'max-w-[420px]' : 'w-full'
            }`}
            style={{
                height: U(30),
            }}
        >
            {idxs.map((i, index) => {
                const isTurn = current === i;
                const widthPct = widths[index];
                const pct = progress[i] || 0;
                return (
                    <div
                        key={i}
                        className={`relative flex items-center justify-center font-black text-white text-center transition-[width] duration-500 ease-out overflow-hidden ${
                            isTurn
                                ? 'brightness-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10'
                                : 'opacity-95'
                        }`}
                        style={{
                            width: `${widthPct}%`,
                            background: hex(COLORS[i]),
                            textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                            borderRight: index < idxs.length - 1 ? '1.5px solid rgba(255,255,255,0.35)' : 'none',
                        }}
                        title={`${nm(i)}: ${pct}%`}
                    >
                        {/* Glowing active turn indicator atop the segment */}
                        {isTurn && (
                            <div className="absolute inset-x-0 top-0 h-1 bg-white animate-pulse shadow-[0_0_6px_#fff]" />
                        )}

                        {/* Responsive label adapting to dynamic segment width */}
                        <div
                            className="px-1.5 flex items-center justify-center gap-1 truncate font-black tracking-wide"
                            style={{ fontSize: U(13) }}
                        >
                            {widthPct > 24 ? (
                                <span className="truncate">
                                    {nm(i)}: {pct}%
                                </span>
                            ) : widthPct > 15 ? (
                                <span className="truncate">
                                    {players[i]?.avatar || ''} {pct}%
                                </span>
                            ) : (
                                <span>{pct}%</span>
                            )}
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
 * - Royal Watch (Turn Timer) in the TOP-LEFT corner
 * - Joint Progress Bar (all players combined together) in the TOP-RIGHT corner with Settings button
 */
function LandscapeTopHud() {
    const aiMute = useStore((s) => s.settings.aiMute);
    const toggleAiMute = () => {
        const next = !aiMute;
        store.patchSettings({ aiMute: next });
        if (next) sfx.stopSpeech();
    };

    return (
        <>
            {/* Top-Left: Royal Watch (Turn Timer) + AI Voice Mute Quick Button */}
            <div className="absolute top-2.5 left-4 z-20 pointer-events-auto flex items-center gap-2">
                <TurnTimer compact />
                <button
                    type="button"
                    onClick={toggleAiMute}
                    aria-label={aiMute ? 'Unmute AI Voice' : 'Mute AI Voice'}
                    title={aiMute ? 'AI Voice is MUTED (Click to Unmute AI Talk)' : 'AI Voice is ACTIVE (Click to Mute AI Talk Only)'}
                    className={`flex items-center gap-1.5 rounded-full border shadow-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer select-none font-black ${
                        aiMute
                            ? 'bg-red-950/85 border-amber-400 text-amber-200 shadow-red-500/30 ring-1 ring-amber-400/50'
                            : 'bg-[#0a0d26]/85 border-cyan-400/50 text-cyan-200 hover:bg-[#12193b]/90 shadow-cyan-500/20'
                    }`}
                    style={{
                        height: U(20),
                        padding: `0 ${U(10)}`,
                        fontSize: U(11),
                    }}
                >
                    <span style={{ fontSize: U(12) }}>{aiMute ? '🔇' : '🎙️'}</span>
                    <span className="leading-none tracking-wide">
                        {aiMute ? 'AI Muted' : 'AI Voice'}
                    </span>
                </button>
            </div>

            {/* Top-Right: Combined Joint Progress Bar */}
            <div className="absolute top-2.5 right-4 z-20 flex items-center gap-2.5 pointer-events-auto">
                <div style={{ width: U(340), maxWidth: '42vw' }}>
                    <JointPercentageBar compact />
                </div>
            </div>
        </>
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

    const [, setNetTick] = useState(0);
    const chatOpen = useStore((s) => s.chatOpen);
    const [copiedCode, setCopiedCode] = useState(false);
    const [customChat, setCustomChat] = useState('');

    useEffect(() => {
        const unsub = multiplayerClient.subscribe(() => setNetTick((t) => t + 1));
        return unsub;
    }, []);

    const isMultiplayer = !!multiplayerClient.roomCode;
    const roomCode = multiplayerClient.roomCode;
    const isMyTurn = isMultiplayer ? multiplayerClient.myPlayerIndex === current : !players[current]?.ai;
    const secondsLeft = multiplayerClient.turnSecondsLeft;
    const recentChat = multiplayerClient.recentChat;
    const offlineNotice = multiplayerClient.offlineNotice;

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
            multiplayerClient.sendChat('', emoji);
        } else if (bus.chat) {
            bus.chat(myIdx, emoji, { voice: false });
        }
        store.patch({ chatOpen: false });
    };

    const sendQuickPhrase = (phrase: string) => {
        if (isMultiplayer) {
            multiplayerClient.sendChat(phrase);
        } else if (bus.chat) {
            bus.chat(myIdx, phrase, { voice: true });
        }
        store.patch({ chatOpen: false });
    };

    const sendCustomMessage = () => {
        if (!customChat.trim()) return;
        const msg = customChat.trim();
        if (isMultiplayer) {
            multiplayerClient.sendChat(msg);
        } else if (bus.chat) {
            bus.chat(myIdx, msg, { voice: true });
        }
        setCustomChat('');
        store.patch({ chatOpen: false });
    };

    const aiMute = useStore((s) => s.settings.aiMute);
    const toggleAiMute = () => {
        const next = !aiMute;
        store.patchSettings({ aiMute: next });
        if (next) sfx.stopSpeech();
    };

    return (
        <>
            {/* Top HUD */}
            {landscape ? (
                <LandscapeTopHud />
            ) : (
                /* Vertical Top: Progress bar + Centered Timer + AI Voice button */
                <div className="absolute top-2.5 inset-x-3 z-20 pointer-events-auto flex flex-col items-center gap-1">
                    <div className="w-full">
                        <JointPercentageBar />
                    </div>
                    <div className="flex items-center justify-center gap-2">
                        <TurnTimer compact />
                        <button
                            type="button"
                            onClick={toggleAiMute}
                            aria-label={aiMute ? 'Unmute AI Voice' : 'Mute AI Voice'}
                            title={aiMute ? 'AI Voice is MUTED (Click to Unmute AI Talk)' : 'AI Voice is ACTIVE (Click to Mute AI Talk Only)'}
                            className={`flex items-center gap-1.5 rounded-full border shadow-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer select-none font-black ${
                                aiMute
                                    ? 'bg-red-950/85 border-amber-400 text-amber-200 shadow-red-500/30 ring-1 ring-amber-400/50'
                                    : 'bg-[#0a0d26]/85 border-cyan-400/50 text-cyan-200 hover:bg-[#12193b]/90 shadow-cyan-500/20'
                            }`}
                            style={{
                                height: U(20),
                                padding: `0 ${U(9)}`,
                                fontSize: U(11),
                            }}
                        >
                            <span style={{ fontSize: U(12) }}>{aiMute ? '🔇' : '🎙️'}</span>
                            <span className="leading-none tracking-wide">
                                {aiMute ? 'AI Muted' : 'AI Voice'}
                            </span>
                        </button>
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

            {/* In-Game Floating Chat Bubble Notification (Glass window at .40x scale) */}
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

            {/* Quick Emoji & Chat Popup Menu */}
            {chatOpen && (
                <div
                    className="absolute z-35 bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2 max-w-[280px] sm:max-w-[320px] pointer-events-auto"
                    style={{ left: U(12), bottom: U(72) }}
                >
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                        <span className="text-xs font-black uppercase text-cyan-400">Quick Banter & Reactions</span>
                        <button
                            type="button"
                            onClick={() => store.patch({ chatOpen: false })}
                            className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Emoji picker grid */}
                    <div className="flex flex-wrap gap-1.5">
                        {QUICK_EMOJIS.map((em) => (
                            <button
                                key={em}
                                type="button"
                                onClick={() => sendQuickEmoji(em)}
                                className="w-9 h-9 text-xl bg-white/5 hover:bg-cyan-500/20 rounded-lg flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
                            >
                                {em}
                            </button>
                        ))}
                    </div>

                    {/* Quick Phrases */}
                    <div className="flex flex-col gap-1 pt-1">
                        {QUICK_PHRASES.map((ph) => (
                            <button
                                key={ph}
                                type="button"
                                onClick={() => sendQuickPhrase(ph)}
                                className="text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-200 transition-all truncate cursor-pointer"
                            >
                                {ph}
                            </button>
                        ))}
                    </div>

                    {/* Custom text input */}
                    <div className="flex gap-1.5 pt-1 border-t border-slate-800">
                        <input
                            type="text"
                            maxLength={60}
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

            {/* Popup announcements (Penalty on the board, Lucky 7, Info) - Glass window at .40x scale */}
            {popup && !modal && (
                popup.kind === 'penalty' ? (
                    /* Dramatic Penalty alert placed directly ON the board as a translucent glass window (.40x size) */
                    <div
                        className={`pointer-events-none absolute z-35 flex items-center justify-center animate-bounce duration-700 ${
                            landscape
                                ? 'top-[36%] left-[30%]'
                                : 'top-[26%] left-1/2'
                        }`}
                        style={{
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
                        className={`pointer-events-none absolute z-35 flex items-center justify-center ${
                            landscape
                                ? 'top-[36%] left-[30%]'
                                : 'top-[30%] left-1/2'
                        }`}
                        style={{
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
                                    Keep pawn on path
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
