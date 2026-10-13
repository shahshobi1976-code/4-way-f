import { useState, useEffect } from 'react';
import { store, useStore } from '../state/store';
import { bus } from '../game/bus';
import { tr, colorName } from '../i18n';
import { COLORS } from '../game/rules';
import { RoundBtn, U } from './kit';
import { ScreenButtons } from './FloatingControls';
import { multiplayerClient } from '../network/multiplayerClient';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const QUICK_EMOJIS = ['👍', '😂', '🎲', '😡', '🎯', '🔥', '👑', '👋'];
const QUICK_PHRASES = ['Good move!', 'Unlucky!', 'Hurry up! ⏰', 'Nice roll! 🎲', 'GG! 🏆', 'Watch out! 👀'];

/** One combined progress bar, split by colour according to each player's share, names underneath. */
function ProgressBar() {
    const progress = useStore((s) => s.progress);
    const active = useStore((s) => s.active);
    const players = useStore((s) => s.players);
    const lang = useStore((s) => s.settings.lang);
    const current = useStore((s) => s.current);
    const idxs = [0, 1, 2, 3].filter((i) => active[i]);
    const total = idxs.reduce((a, i) => a + progress[i], 0);

    const nm = (i: number) => {
        const n = (players[i]?.name || '').trim();
        return !n || ['red', 'green', 'yellow', 'cyan'].includes(n.toLowerCase()) ? colorName(lang, i) : n;
    };

    return (
        <div>
            <div className="flex overflow-hidden rounded-full border-2 border-white/40 bg-black/60 shadow-inner" style={{ height: U(44) }}>
                {idxs.map((i) => (
                    <div
                        key={i}
                        className="flex items-center justify-center font-black text-white transition-[flex-grow] duration-500"
                        style={{
                            flexGrow: total === 0 ? 1 : Math.max(progress[i], 0.001),
                            flexBasis: 0,
                            background: hex(COLORS[i]),
                            fontSize: U(22),
                            textShadow: '0 1px 3px #000',
                        }}
                    >
                        {progress[i] > 0 ? `${progress[i]}%` : ''}
                    </div>
                ))}
            </div>
            <div className="flex" style={{ marginTop: U(4) }}>
                {idxs.map((i) => {
                    const isTurn = current === i;
                    return (
                        <div
                            key={i}
                            className={`truncate text-center font-bold transition-all ${
                                isTurn ? 'scale-105 font-black drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]' : 'opacity-85'
                            }`}
                            style={{
                                flexGrow: total === 0 ? 1 : Math.max(progress[i], 6),
                                flexBasis: 0,
                                color: hex(COLORS[i]),
                                fontSize: U(20),
                                textShadow: '0 1px 3px #000',
                            }}
                        >
                            {players[i]?.avatar} {nm(i)} {isTurn && '✨'}
                        </div>
                    );
                })}
            </div>
        </div>
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
        return !n || ['red', 'green', 'yellow', 'cyan'].includes(n.toLowerCase()) ? colorName(lang, i) : n;
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
            {/* Top HUD: Progress bar */}
            <div className="hud-bar z-20"><ProgressBar /></div>
            <RoundBtn label="Settings" size={46} onClick={() => store.patch({ modal: 'settings' })} className="hud-gear z-20">⚙️</RoundBtn>

            {/* Multiplayer Live Room & Turn Status Overlay */}
            {isMultiplayer && (
                <div className="absolute top-16 left-0 right-0 z-20 flex flex-col items-center pointer-events-none px-4">
                    {/* Offline / Reconnecting notice */}
                    {offlineNotice && (
                        <div className="pointer-events-auto mb-2 px-4 py-1.5 rounded-full bg-red-600/90 text-white font-extrabold text-xs sm:text-sm shadow-lg animate-pulse flex items-center gap-2">
                            <span>⚠️</span> <span>{offlineNotice}</span>
                        </div>
                    )}

                    {/* Room Badge + Turn status indicator */}
                    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 bg-slate-950/85 backdrop-blur-md border border-cyan-500/30 px-3.5 py-1.5 rounded-full shadow-xl">
                        {/* Room code chip */}
                        <button
                            onClick={handleCopyCode}
                            className="flex items-center gap-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 px-2.5 py-1 rounded-full text-xs font-mono font-black transition-all"
                            title="Click to copy invite link"
                        >
                            <span>ROOM: {roomCode}</span>
                            <span>{copiedCode ? '✓' : '📋'}</span>
                        </button>

                        {/* Turn indicator & countdown timer */}
                        <div className="flex items-center gap-2">
                            <span
                                className={`text-xs sm:text-sm font-black px-2.5 py-0.5 rounded-full ${
                                    isMyTurn
                                        ? 'bg-green-500 text-slate-950 animate-pulse'
                                        : 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                                }`}
                            >
                                {isMyTurn ? '🎯 YOUR TURN' : `Waiting for ${nm(current)}`}
                            </span>

                            {/* Live 30s Countdown timer pill */}
                            <div className="flex items-center gap-1 bg-black/50 px-2 py-0.5 rounded-full border border-slate-700">
                                <span className="text-xs">⏱️</span>
                                <span className={`text-xs font-mono font-black ${secondsLeft <= 5 ? 'text-red-400 animate-bounce' : 'text-slate-200'}`}>
                                    {secondsLeft}s
                                </span>
                            </div>
                        </div>
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

            {/* Bottom-left: Lucky Wish + Quick Chat (in Multiplayer) */}
            <div className="absolute z-20 flex items-center gap-2" style={{ left: U(16), bottom: U(18) }}>
                {/* Lucky Wish Button */}
                <button
                    onClick={() => bus.wish?.()}
                    disabled={!wishUsable}
                    aria-label="Lucky wish"
                    className={`flex items-center rounded-full border-2 font-black transition-all ${
                        wishUsable
                            ? 'pulse-wish border-amber-300 bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg scale-105'
                            : 'border-white/20 bg-black/60 text-white/50'
                    }`}
                    style={{ height: U(64), padding: `0 ${U(18)}`, gap: U(8), fontSize: U(24) }}
                >
                    ✨ {wishNums ? `${wishNums[0]},${wishNums[1]}` : 'no wish'}
                </button>

                {/* Quick Chat / Reactions toggle in multiplayer */}
                {isMultiplayer && (
                    <button
                        onClick={() => setChatOpen((o) => !o)}
                        className="rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 border-2 border-cyan-400/50 text-cyan-200 flex items-center justify-center font-bold text-xl transition-all shadow-md active:scale-95"
                        style={{ width: U(64), height: U(64) }}
                        title="Chat & Emoji Reactions"
                    >
                        💬
                    </button>
                )}
            </div>

            {/* Bottom-right: Music + Fullscreen */}
            <div className="absolute z-20 flex" style={{ right: U(16), bottom: U(18), gap: U(12) }}>
                <RoundBtn label="Music" onClick={() => store.patch({ modal: 'music' })}>🎵</RoundBtn>
                <ScreenButtons />
            </div>

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

            {/* Popup announcements (Lucky 7, Penalty) */}
            {popup && !modal && (
                <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ bottom: U(130) }}>
                    <div
                        className="pop pointer-events-auto rounded-2xl border-2 text-center backdrop-blur shadow-2xl"
                        style={{
                            padding: `${U(16)} ${U(30)}`, maxWidth: U(620),
                            borderColor: popup.kind === 'lucky' ? '#ffc83a' : popup.kind === 'penalty' ? '#ff4d4d' : '#18e0ff',
                            background: 'rgba(8,12,34,0.85)',
                        }}
                    >
                        <div className="font-black" style={{ fontSize: U(42), color: popup.kind === 'lucky' ? '#ffd84a' : popup.kind === 'penalty' ? '#ff6b6b' : '#7fe9ff' }}>
                            {popup.kind === 'lucky' ? '✨7 ' : popup.kind === 'penalty' ? '⚠️ ' : ''}{popup.title}
                        </div>
                        <div className="text-white/90" style={{ fontSize: U(26), marginTop: U(4) }}>{popup.sub}</div>
                        <button onClick={() => store.patch({ popup: null })} className="rounded-xl bg-white/15 font-bold" style={{ marginTop: U(10), padding: `${U(6)} ${U(26)}`, fontSize: U(24) }}>{tr(lang, 'ok')}</button>
                    </div>
                </div>
            )}

            {/* Victory Podium Modal */}
            {result && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-sm" style={{ padding: U(20) }}>
                    <div className="pop w-full rounded-2xl border-2 border-amber-300 bg-[#0e1530] text-center shadow-2xl" style={{ maxWidth: U(560), padding: U(24) }}>
                        <div style={{ fontSize: U(70) }}>🏆</div>
                        <div className="font-black text-amber-300" style={{ fontSize: U(40) }}>{tr(lang, 'winT', { n: nm(result[0].idx) })}</div>

                        <div className="flex flex-col" style={{ gap: U(8), marginTop: U(16) }}>
                            {result.map((r, k) => (
                                <div key={r.idx} className="flex items-center justify-between rounded-xl bg-white/5" style={{ padding: `${U(10)} ${U(16)}`, borderLeft: `${U(8)} solid ${hex(COLORS[r.idx])}`, fontSize: U(26) }}>
                                    <span className="font-black">{['🥇', '🥈', '🥉', '4th'][k]} {players[r.idx].avatar} {nm(r.idx)}</span>
                                    <span className="font-bold text-white/80">{r.pct}%</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex" style={{ gap: U(12), marginTop: U(20) }}>
                            <button
                                onClick={handleRematchClick}
                                className="flex-1 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 font-black text-slate-950 shadow-lg hover:brightness-110 active:scale-[0.98] transition-all"
                                style={{ padding: U(14), fontSize: U(26) }}
                            >
                                {isMultiplayer ? '🔄 Play Again (Rematch)' : tr(lang, 'again')}
                            </button>
                            <button
                                onClick={() => {
                                    if (isMultiplayer) multiplayerClient.leaveRoom();
                                    store.patch({ phase: 'menu', result: null });
                                }}
                                className="flex-1 rounded-xl bg-white/10 font-bold text-white hover:bg-white/20 active:scale-[0.98] transition-all"
                                style={{ padding: U(14), fontSize: U(26) }}
                            >
                                {tr(lang, 'menu')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
