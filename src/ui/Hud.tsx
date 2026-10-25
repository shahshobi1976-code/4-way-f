import { useState, useEffect } from 'react';
import { store, useStore } from '../state/store';
import { bus } from '../game/bus';
import { tr, colorName } from '../i18n';
import { COLORS } from '../game/rules';
import { U } from './kit';
import { multiplayerClient } from '../network/multiplayerClient';
import { CelebrationCanvas } from './CelebrationCanvas';
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
    const seconds = isMultiplayer ? multiplayerClient.turnSecondsLeft : turnSecondsLeft;
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
    return (
        <>
            {/* Top-Left: Royal Watch (Turn Timer) */}
            <div className="absolute top-2.5 left-4 z-20 pointer-events-auto flex items-center gap-2">
                <TurnTimer compact />
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
    const result = useStore((s) => s.result);
    const players = useStore((s) => s.players);
    const wishNums = useStore((s) => s.wishNums);
    const wishUsable = useStore((s) => s.wishUsable);
    const modal = useStore((s) => s.modal);
    const current = useStore((s) => s.current);
    const landscape = useStore((s) => s.landscape);

    const [, setNetTick] = useState(0);
    const [chatOpen, setChatOpen] = useState(false);
    const [copiedCode, setCopiedCode] = useState(false);
    const [customChat, setCustomChat] = useState('');

    useEffect(() => {
        const unsub = multiplayerClient.subscribe(() => setNetTick((t) => t + 1));
        return unsub;
    }, []);

    const isMultiplayer = !!multiplayerClient.roomCode;
    const roomCode = multiplayerClient.roomCode;
    const isMyTurn = isMultiplayer ? multiplayerClient.myPlayerIndex === current : true;
    const secondsLeft = multiplayerClient.turnSecondsLeft;
    const recentChat = multiplayerClient.recentChat;
    const offlineNotice = multiplayerClient.offlineNotice;

    const nm = (i: number) => {
        const n = (players[i]?.name || '').trim();
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

    const sendQuickEmoji = (emoji: string) => {
        multiplayerClient.sendChat('', emoji);
        setChatOpen(false);
    };

    const sendQuickPhrase = (phrase: string) => {
        multiplayerClient.sendChat(phrase);
        setChatOpen(false);
    };

    const sendCustomMessage = () => {
        if (!customChat.trim()) return;
        multiplayerClient.sendChat(customChat.trim());
        setCustomChat('');
        setChatOpen(false);
    };

    const handleRematchClick = async () => {
        if (isMultiplayer) {
            await multiplayerClient.voteRematch();
        } else {
            store.patch({ gameId: store.get().gameId + 1, result: null });
        }
    };

    return (
        <>
            {/* Top HUD */}
            {landscape ? (
                <LandscapeTopHud />
            ) : (
                /* Vertical Top: Progress bar + Centered Timer (no menu button) */
                <div className="absolute top-2.5 inset-x-3 z-20 pointer-events-auto flex flex-col items-center gap-1">
                    <div className="w-full">
                        <JointPercentageBar />
                    </div>
                    <div className="flex justify-center">
                        <TurnTimer compact />
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

            {/* In-Game Floating Chat Bubble Notification */}
            {recentChat && Date.now() - recentChat.time < 5000 && (
                <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-bounce">
                    <div className="bg-slate-900/95 border-2 border-cyan-400/60 shadow-2xl px-4 py-2 rounded-2xl flex items-center gap-2.5 text-white">
                        <span className="text-2xl">{recentChat.avatar}</span>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-cyan-300">{recentChat.name}</div>
                            <div className="text-sm font-extrabold">{recentChat.emoji} {recentChat.text}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Chat (in Multiplayer) */}
            {isMultiplayer && (
                <div className="absolute z-20 pointer-events-auto" style={{ left: U(12), bottom: U(62) }}>
                    <button
                        onClick={() => setChatOpen((o) => !o)}
                        className="rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 border-2 border-cyan-400/50 text-cyan-200 flex items-center justify-center font-bold text-lg transition-all shadow-md active:scale-95"
                        style={{ width: U(40), height: U(40) }}
                        title="Chat & Emoji Reactions"
                    >
                        💬
                    </button>
                </div>
            )}

            {/* Quick Emoji & Chat Popup Menu */}
            {chatOpen && isMultiplayer && (
                <div className="absolute left-4 bottom-24 z-30 bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2 max-w-[280px] sm:max-w-[320px]">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                        <span className="text-xs font-black uppercase text-cyan-400">Quick Banter & Reactions</span>
                        <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-white text-xs font-bold">✕</button>
                    </div>

                    {/* Emoji picker grid */}
                    <div className="flex flex-wrap gap-1.5">
                        {QUICK_EMOJIS.map((em) => (
                            <button
                                key={em}
                                onClick={() => sendQuickEmoji(em)}
                                className="w-9 h-9 text-xl bg-white/5 hover:bg-cyan-500/20 rounded-lg flex items-center justify-center transition-transform active:scale-90"
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
                                onClick={() => sendQuickPhrase(ph)}
                                className="text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-200 transition-all truncate"
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
                            onClick={sendCustomMessage}
                            className="px-2.5 py-1 bg-cyan-500 text-slate-950 rounded-lg font-black text-xs"
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}

            {/* Popup announcements (Penalty on the board, Lucky 7) */}
            {popup && !modal && (
                popup.kind === 'penalty' ? (
                    /* Dramatic Penalty alert placed directly ON the board */
                    <div
                        className={`pointer-events-none absolute z-35 flex items-center justify-center animate-bounce duration-700 ${
                            landscape
                                ? 'top-[36%] left-[30%] -translate-x-1/2 -translate-y-1/2 w-[88vw] max-w-[500px]'
                                : 'top-[26%] inset-x-4 flex justify-center'
                        }`}
                    >
                        <div
                            className="pop pointer-events-auto rounded-3xl border-4 text-center backdrop-blur-xl shadow-[0_0_55px_rgba(239,68,68,0.85)] bg-gradient-to-b from-red-950/98 via-[#1d0615]/98 to-black/98 select-none"
                            style={{
                                padding: `${U(18)} ${U(26)}`,
                                borderColor: '#ff3344',
                                maxWidth: U(560),
                            }}
                        >
                            <div className="flex items-center justify-center gap-2 font-black text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.9)] animate-pulse" style={{ fontSize: U(34) }}>
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
                                    className="rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black shadow-lg active:scale-95 transition-all cursor-pointer"
                                    style={{ padding: `${U(8)} ${U(32)}`, fontSize: U(20) }}
                                >
                                    {tr(lang, 'ok')}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Lucky 7 / Info popup centered on board */
                    <div
                        className={`pointer-events-none absolute z-35 flex items-center justify-center ${
                            landscape
                                ? 'top-[36%] left-[30%] -translate-x-1/2 -translate-y-1/2 w-[88vw] max-w-[500px]'
                                : 'top-[30%] inset-x-4 flex justify-center'
                        }`}
                    >
                        <div
                            className="pop pointer-events-auto rounded-3xl border-3 text-center backdrop-blur-xl shadow-2xl select-none"
                            style={{
                                padding: `${U(16)} ${U(30)}`,
                                maxWidth: U(560),
                                borderColor: popup.kind === 'lucky' ? '#ffc83a' : '#18e0ff',
                                background: 'rgba(8,12,34,0.92)',
                            }}
                        >
                            <div className="font-black" style={{ fontSize: U(38), color: popup.kind === 'lucky' ? '#ffd84a' : '#7fe9ff' }}>
                                {popup.kind === 'lucky' ? '✨7 ' : ''}{popup.title}
                            </div>
                            <div className="text-white/90 font-bold" style={{ fontSize: U(24), marginTop: U(4) }}>
                                {popup.sub}
                            </div>
                            <button
                                onClick={() => store.patch({ popup: null })}
                                className="rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold cursor-pointer"
                                style={{ marginTop: U(10), padding: `${U(6)} ${U(26)}`, fontSize: U(22) }}
                            >
                                {tr(lang, 'ok')}
                            </button>
                        </div>
                    </div>
                )
            )}

            {/* Grand Victory Celebration ("Jashan") and Full Result Window */}
            {result && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md overflow-y-auto p-4 select-none">
                    {/* Festive fireworks & confetti particle celebration */}
                    <CelebrationCanvas />

                    <div
                        className="pop relative z-10 w-full rounded-3xl border-3 border-amber-400/80 bg-gradient-to-b from-[#141b3d]/98 via-[#0c122e]/98 to-[#060817]/98 text-center shadow-[0_0_60px_rgba(245,158,11,0.5)] overflow-hidden"
                        style={{ maxWidth: U(580), padding: `${U(20)} ${U(24)}` }}
                    >
                        {/* Celebration ribbon header */}
                        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500/30 via-yellow-400/40 to-amber-500/30 border border-amber-300/60 text-amber-200 font-black text-sm tracking-widest uppercase mb-2 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse">
                            <span>🎊</span> <span>JASHAN-E-FATEH • VICTORY CELEBRATION</span> <span>🎊</span>
                        </div>

                        {/* Glowing Trophy & Crown */}
                        <div className="relative my-1">
                            <div className="text-6xl sm:text-7xl drop-shadow-[0_0_20px_rgba(250,204,21,0.9)] animate-bounce">
                                🏆
                            </div>
                            <div className="absolute top-0 right-1/2 translate-x-7 -translate-y-2 text-2xl animate-pulse">
                                👑
                            </div>
                        </div>

                        <div className="font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 tracking-wide" style={{ fontSize: U(34) }}>
                            {nm(result[0].idx)} WINS!
                        </div>
                        <div className="text-amber-100/80 font-bold text-sm tracking-wide mt-1">
                            🎉 Congratulations! Grand Champion of the Match 🎉
                        </div>

                        {/* Complete Results Leaderboard Table */}
                        <div className="flex flex-col gap-2.5 my-4">
                            {result.map((r, k) => {
                                const isWinner = k === 0;
                                const medals = ['🥇 1st', '🥈 2nd', '🥉 3rd', '4th'];
                                return (
                                    <div
                                        key={r.idx}
                                        className={`flex items-center justify-between rounded-2xl border transition-all ${
                                            isWinner
                                                ? 'bg-gradient-to-r from-amber-500/25 via-yellow-500/15 to-transparent border-amber-400/70 shadow-[0_0_16px_rgba(245,158,11,0.3)]'
                                                : 'bg-white/5 border-white/10'
                                        }`}
                                        style={{
                                            padding: `${U(10)} ${U(14)}`,
                                            borderLeftWidth: U(6),
                                            borderLeftColor: hex(COLORS[r.idx]),
                                        }}
                                    >
                                        {/* Rank & Player Info */}
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className={`font-black ${isWinner ? 'text-amber-300 text-lg' : 'text-slate-300 text-base'}`}>
                                                {medals[k]}
                                            </span>
                                            <span className="text-2xl">{players[r.idx]?.avatar || '👤'}</span>
                                            <div className="text-left min-w-0">
                                                <div className="font-black text-white text-base truncate flex items-center gap-1.5">
                                                    <span>{nm(r.idx)}</span>
                                                    {isWinner && <span className="text-amber-400 text-xs">👑 Champion</span>}
                                                </div>
                                                <div className="text-xs text-white/60 font-semibold">
                                                    Color: {colorName(lang, r.idx)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Percentage & Progress Bar */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="w-24 sm:w-28 h-3 rounded-full bg-black/60 overflow-hidden border border-white/20">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${r.pct}%`,
                                                        backgroundColor: hex(COLORS[r.idx]),
                                                    }}
                                                />
                                            </div>
                                            <span className={`font-black font-mono text-base ${isWinner ? 'text-amber-300 font-extrabold' : 'text-white/90'}`}>
                                                {r.pct}%
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Action Buttons: Rematch, Jashan Confetti, Main Menu */}
                        <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
                            <button
                                onClick={handleRematchClick}
                                className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 font-black text-slate-950 shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                                style={{ padding: U(12), fontSize: U(20) }}
                            >
                                <span>🔄</span>
                                <span>{isMultiplayer ? 'Play Again (Rematch)' : tr(lang, 'again')}</span>
                            </button>

                            <button
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('launch-jashan'));
                                    sfx.fanfare();
                                }}
                                className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 font-black text-slate-950 shadow-md active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 px-4"
                                style={{ padding: U(12), fontSize: U(18) }}
                                title="Launch more celebration fireworks!"
                            >
                                <span>🎊</span>
                                <span>Jashan!</span>
                            </button>

                            <button
                                onClick={() => {
                                    if (isMultiplayer) multiplayerClient.leaveRoom();
                                    store.patch({ phase: 'menu', result: null });
                                }}
                                className="flex-1 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 font-bold text-white active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                                style={{ padding: U(12), fontSize: U(20) }}
                            >
                                <span>🏠</span>
                                <span>{tr(lang, 'menu')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
