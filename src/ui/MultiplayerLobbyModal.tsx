import { useState, useEffect } from 'react';
import { multiplayerClient } from '../network/multiplayerClient';
import { Modal } from './kit';
import { safeStorage } from '../state/storage';
import { store } from '../state/store';

const AVATARS = ['👑', '🦁', '⚡', '💎', '🦅', '⚔️', '🔥', '🐉', '🎯', '🛡️'];

const SEAT_COLORS = [
    {
        name: 'Crimson',
        badge: 'bg-red-500/20 text-red-300 border-red-500/40',
        card: 'border-red-500/30 bg-gradient-to-r from-red-950/40 via-slate-900/90 to-slate-950/90',
        glow: 'shadow-[0_0_8px_rgba(239,68,68,0.15)]',
        text: 'text-red-400',
    },
    {
        name: 'Emerald',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        card: 'border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-slate-950/90',
        glow: 'shadow-[0_0_8px_rgba(16,185,129,0.15)]',
        text: 'text-emerald-400',
    },
    {
        name: 'Gold',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        card: 'border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900/90 to-slate-950/90',
        glow: 'shadow-[0_0_8px_rgba(245,158,11,0.15)]',
        text: 'text-amber-400',
    },
    {
        name: 'Sapphire',
        badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        card: 'border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-slate-900/90 to-slate-950/90',
        glow: 'shadow-[0_0_8px_rgba(6,182,212,0.15)]',
        text: 'text-cyan-400',
    },
];

interface Props {
    onClose: () => void;
    initialRoomCode?: string;
}

function extractRoomCode(raw: string): string {
    const text = (raw || '').trim();
    if (text.includes('room=')) {
        try {
            const u = new URL(text);
            const r = u.searchParams.get('room');
            if (r) return r.toUpperCase().trim().slice(0, 8);
        } catch {
            const m = text.match(/room=([a-zA-Z0-9]+)/);
            if (m && m[1]) return m[1].toUpperCase().slice(0, 8);
        }
    }
    return text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
}

function LuckyWishPicker({
    dieA,
    dieB,
    onSave,
    title = "✨ Lucky Wish Numbers",
}: {
    dieA: number;
    dieB: number;
    onSave: (a: number, b: number) => void;
    title?: string;
}) {
    return (
        <div className="bg-slate-900/80 px-2 py-1 rounded-xl border border-amber-500/40 flex items-center justify-between gap-1 shadow">
            <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] font-black text-amber-300">
                    {title}:
                </span>
                <span className="font-mono font-black text-[11px] text-amber-200 bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-400/40 shadow">
                    ({dieA}, {dieB})
                </span>
            </div>

            <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                    <span className="text-[8px] font-bold text-slate-400 mr-0.5">D1:</span>
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                        <button
                            key={num}
                            type="button"
                            onClick={() => onSave(num, dieB)}
                            className={`w-5 h-5 rounded text-[10px] font-black transition-all cursor-pointer ${
                                dieA === num
                                    ? 'bg-amber-400 text-slate-950 shadow ring-1 ring-amber-300 font-black'
                                    : 'bg-slate-950/80 text-white hover:bg-slate-800'
                            }`}
                        >
                            {num}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-0.5">
                    <span className="text-[8px] font-bold text-slate-400 mr-0.5">D2:</span>
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                        <button
                            key={num}
                            type="button"
                            onClick={() => onSave(dieA, num)}
                            className={`w-5 h-5 rounded text-[10px] font-black transition-all cursor-pointer ${
                                dieB === num
                                    ? 'bg-amber-400 text-slate-950 shadow ring-1 ring-amber-300 font-black'
                                    : 'bg-slate-950/80 text-white hover:bg-slate-800'
                            }`}
                        >
                            {num}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function MultiplayerLobbyModal({ onClose, initialRoomCode }: Props) {
    const [, setTick] = useState(0);

    const isDirectGuestInvite = Boolean(initialRoomCode && initialRoomCode.trim());
    const [tab, setTab] = useState<'create' | 'join'>(() => (isDirectGuestInvite ? 'join' : 'create'));
    const [name, setName] = useState(() => safeStorage.getItem('ludo_player_name') || (isDirectGuestInvite ? 'Guest Warrior' : 'King'));
    const [avatar, setAvatar] = useState(() => safeStorage.getItem('ludo_player_avatar') || (isDirectGuestInvite ? '⚔️' : '👑'));
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [timerSec, setTimerSec] = useState<number>(() => {
        const val = safeStorage.getItem('ludo_room_timer');
        return val !== null ? Number(val) : 90;
    });
    const [joinCode, setJoinCode] = useState(() => extractRoomCode(initialRoomCode || ''));
    const [copied, setCopied] = useState(false);
    const [codeCopied, setCodeCopied] = useState(false);
    const [pastedNotice, setPastedNotice] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Wish numbers state for current player (Host or Guest)
    const [wishDieA, setWishDieA] = useState<number>(6);
    const [wishDieB, setWishDieB] = useState<number>(5);

    useEffect(() => {
        const unsub = multiplayerClient.subscribe(() => {
            setTick((t) => t + 1);
        });
        return unsub;
    }, []);

    useEffect(() => {
        safeStorage.setItem('ludo_player_name', name);
    }, [name]);

    useEffect(() => {
        safeStorage.setItem('ludo_player_avatar', avatar);
    }, [avatar]);

    useEffect(() => {
        safeStorage.setItem('ludo_room_timer', String(timerSec));
    }, [timerSec]);

    useEffect(() => {
        if (initialRoomCode) {
            const clean = extractRoomCode(initialRoomCode);
            setJoinCode(clean);
            setTab('join');
        }
    }, [initialRoomCode]);

    const roomState = multiplayerClient.roomState;
    const roomCode = multiplayerClient.roomCode;
    const isHost = multiplayerClient.isHost;
    const myPlayerIndex = multiplayerClient.myPlayerIndex;

    // Sync current player's wish from room state if present
    useEffect(() => {
        if (roomState && myPlayerIndex !== null) {
            const myPlayer = roomState.players[myPlayerIndex];
            if (myPlayer?.wish) {
                setWishDieA(myPlayer.wish[0]);
                setWishDieB(myPlayer.wish[1]);
            }
        }
    }, [roomState, myPlayerIndex]);

    const handleCreateRoom = async () => {
        setLoading(true);
        setErrorMsg(null);
        const res = await multiplayerClient.createRoom(name, avatar, timerSec, 4);
        setLoading(false);
        if (!res.ok) {
            setErrorMsg(res.error || 'Failed to create room.');
        } else {
            // Apply default or selected wish
            multiplayerClient.setWish([wishDieA, wishDieB]);
        }
    };

    const handleJoinRoom = async (codeToUse?: string) => {
        const code = (codeToUse || joinCode).trim();
        if (!code) {
            setErrorMsg('Please enter or paste a valid room code.');
            return;
        }
        setLoading(true);
        setErrorMsg(null);
        const res = await multiplayerClient.joinRoom(code, name, avatar);
        setLoading(false);
        if (!res.ok) {
            setErrorMsg(res.error || 'Could not join room. Check code.');
        } else {
            // Apply default or selected wish
            multiplayerClient.setWish([wishDieA, wishDieB]);
        }
    };

    const handleSaveWish = (a: number, b: number) => {
        if (a === 6 && b === 6) {
            setErrorMsg('6 & 6 is not allowed as a wish pair.');
            return;
        }
        setErrorMsg(null);
        setWishDieA(a);
        setWishDieB(b);
        multiplayerClient.setWish([a, b]);
    };

    const handlePasteFromClipboard = async (autoJoin = false) => {
        setErrorMsg(null);
        try {
            if (navigator.clipboard?.readText) {
                const clipText = await navigator.clipboard.readText();
                const code = extractRoomCode(clipText);
                if (code) {
                    setJoinCode(code);
                    setPastedNotice(true);
                    setTimeout(() => setPastedNotice(false), 2000);
                    if (autoJoin) {
                        void handleJoinRoom(code);
                    }
                } else {
                    setErrorMsg('Clipboard does not contain a valid room code.');
                }
            } else {
                setErrorMsg('Direct clipboard reading unavailable. Please paste manually.');
            }
        } catch {
            setErrorMsg('Clipboard access denied. Please paste manually into the code field.');
        }
    };

    const handleCopyCodeOnly = () => {
        if (!roomCode) return;
        void navigator.clipboard?.writeText(roomCode).then(() => {
            setCodeCopied(true);
            setTimeout(() => setCodeCopied(false), 2000);
        });
    };

    const handleCopyInvite = () => {
        if (!roomCode) return;
        const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
        void navigator.clipboard?.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    };

    const handleShare = () => {
        if (!roomCode) return;
        const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
        if (navigator.share) {
            void navigator.share({
                title: 'Ludo Dethroned Match Invite',
                text: `Join my private Ludo arena match! Code: ${roomCode}`,
                url: link,
            }).catch(() => {});
        } else {
            handleCopyInvite();
        }
    };

    const handleStartGame = async () => {
        setLoading(true);
        setErrorMsg(null);
        const res = await multiplayerClient.startGame();
        setLoading(false);
        if (!res.ok) {
            setErrorMsg(res.error || 'Cannot start match yet.');
        }
    };

    const handleGoBackToMainMenu = () => {
        if (roomCode) {
            multiplayerClient.leaveRoom();
        }
        onClose();
        store.patch({ phase: 'menu', modal: null });
    };

    // Always show all 4 slots for 4-Way Ludo Emperor Arena (unfilled seats auto-fill with AI Bots on start)
    const effectiveMax = 4;
    const visibleSlots = [0, 1, 2, 3];

    return (
        <Modal title={isDirectGuestInvite ? "Arena Match Invite" : (roomCode ? "Host Arena Lobby" : "Multiplayer Arena")} onClose={handleGoBackToMainMenu} slim>
            {!roomCode || !roomState ? (
                isDirectGuestInvite ? (
                    /* SPECIAL CLEAN GUEST JOIN SCREEN: No Create tabs, No Paste buttons! Just Name + Avatar + ENTER THE ARENA */
                    <div className="flex flex-col gap-2.5 text-slate-100">
                        {/* Invitation Header Card */}
                        <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-cyan-500/20 border border-amber-400/40 text-center flex flex-col items-center gap-1 shadow">
                            <span className="text-2xl">⚔️</span>
                            <div className="text-[10px] uppercase font-black text-amber-300 tracking-wider">
                                You Were Invited to Arena Battle
                            </div>
                            <div className="text-xl font-mono font-black text-cyan-300 tracking-widest bg-slate-950/80 px-3 py-1 rounded-lg border border-cyan-400/50">
                                {joinCode}
                            </div>
                        </div>

                        {/* Guest Profile Details */}
                        <div className="flex flex-col gap-1.5 bg-slate-900/90 p-2.5 rounded-xl border border-white/10">
                            <span className="text-[11px] font-bold text-slate-300">Your Name & Character Icon:</span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAvatarPicker((p) => !p)}
                                    title="Choose Icon"
                                    className="w-9 h-9 shrink-0 text-xl bg-slate-950 rounded-lg border border-cyan-400/50 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow"
                                >
                                    {avatar}
                                </button>
                                <input
                                    type="text"
                                    maxLength={16}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter your name"
                                    className="flex-1 min-w-0 bg-slate-950/70 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs outline-none focus:border-cyan-400 placeholder:text-slate-600"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowAvatarPicker((p) => !p)}
                                    className="text-[10px] font-black text-cyan-300 px-2 py-1 rounded-md bg-cyan-400/10 border border-cyan-400/30 hover:bg-cyan-400/20 shrink-0"
                                >
                                    {showAvatarPicker ? 'Done' : 'Change Icon'}
                                </button>
                            </div>

                            {/* Collapsible Avatar Picker row */}
                            {showAvatarPicker && (
                                <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-800">
                                    {AVATARS.map((av) => (
                                        <button
                                            key={av}
                                            type="button"
                                            onClick={() => {
                                                setAvatar(av);
                                                setShowAvatarPicker(false);
                                            }}
                                            className={`w-7 h-7 text-sm rounded-md border flex items-center justify-center transition-all ${
                                                avatar === av
                                                    ? 'border-cyan-400 bg-cyan-500/20 shadow'
                                                    : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800'
                                            }`}
                                        >
                                            {av}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Guest Lucky Wish Selector */}
                        <LuckyWishPicker
                            dieA={wishDieA}
                            dieB={wishDieB}
                            onSave={handleSaveWish}
                            title="✨ Guest Lucky Wish Numbers"
                        />

                        {/* Error Notice */}
                        {errorMsg && (
                            <div className="p-1.5 bg-red-950/60 border border-red-500/40 text-red-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow">
                                <span>⚠️</span>
                                <span className="truncate">{errorMsg}</span>
                            </div>
                        )}

                        {/* Direct Action Button: ENTER THE ARENA */}
                        <button
                            type="button"
                            onClick={() => handleJoinRoom(joinCode)}
                            disabled={loading}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {loading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                    <span>Entering Arena...</span>
                                </>
                            ) : (
                                <>
                                    <span>🚀</span>
                                    <span>ENTER THE ARENA</span>
                                </>
                            )}
                        </button>

                        {/* Option to return to Main Menu */}
                        <button
                            type="button"
                            onClick={handleGoBackToMainMenu}
                            className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white font-bold text-xs transition-colors flex items-center justify-center gap-1"
                        >
                            <span>←</span>
                            <span>Return to Main Window</span>
                        </button>
                    </div>
                ) : (
                    /* NORMAL TAB VIEW: CREATE OR JOIN */
                    <div className="flex flex-col gap-2 text-slate-100">
                        {/* Compact Profile Header Bar */}
                        <div className="flex flex-col gap-1.5 bg-slate-900/90 p-2 rounded-xl border border-white/10">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAvatarPicker((p) => !p)}
                                    title="Click to change icon"
                                    className="w-8 h-8 shrink-0 text-lg bg-slate-950 rounded-lg border border-amber-400/50 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow"
                                >
                                    {avatar}
                                </button>
                                <input
                                    type="text"
                                    maxLength={16}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your name"
                                    className="flex-1 min-w-0 bg-slate-950/70 border border-slate-700/60 rounded-lg px-2.5 py-1 text-white font-bold text-xs outline-none focus:border-cyan-400 placeholder:text-slate-600"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowAvatarPicker((p) => !p)}
                                    className="text-[10px] font-black text-amber-300 px-2 py-1 rounded-md bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/20 shrink-0"
                                >
                                    {showAvatarPicker ? 'Done' : 'Change Icon'}
                                </button>
                            </div>

                            {/* Collapsible Avatar Picker row */}
                            {showAvatarPicker && (
                                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800">
                                    {AVATARS.map((av) => (
                                        <button
                                            key={av}
                                            type="button"
                                            onClick={() => {
                                                setAvatar(av);
                                                setShowAvatarPicker(false);
                                            }}
                                            className={`w-7 h-7 text-sm rounded-md border flex items-center justify-center transition-all ${
                                                avatar === av
                                                    ? 'border-amber-400 bg-amber-500/20 shadow'
                                                    : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800'
                                            }`}
                                        >
                                            {av}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Slim Segmented Navigation Tabs */}
                        <div className="flex rounded-xl bg-slate-950/80 p-0.5 border border-white/10">
                            <button
                                type="button"
                                onClick={() => { setTab('create'); setErrorMsg(null); }}
                                className={`flex-1 py-1.5 px-2 rounded-lg font-black transition-all text-xs tracking-wider uppercase flex items-center justify-center ${
                                    tab === 'create'
                                        ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow font-black'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                <span>Create Arena</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { setTab('join'); setErrorMsg(null); }}
                                className={`flex-1 py-1.5 px-2 rounded-lg font-black transition-all text-xs tracking-wider uppercase flex items-center justify-center ${
                                    tab === 'join'
                                        ? 'bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow font-black'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                <span>Join with Code</span>
                            </button>
                        </div>

                        {/* Error Notice */}
                        {errorMsg && (
                            <div className="p-1.5 bg-red-950/60 border border-red-500/40 text-red-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow">
                                <span>⚠️</span>
                                <span className="truncate">{errorMsg}</span>
                            </div>
                        )}

                        {/* TAB 1: CREATE ARENA */}
                        {tab === 'create' && (
                            <div className="flex flex-col gap-1.5">
                                {/* Mode & Turn Time in one compact bar */}
                                <div className="bg-slate-900/60 px-2 py-1.5 rounded-xl border border-white/10 flex items-center justify-between gap-1 text-[11px]">
                                    <div className="flex items-center gap-1">
                                        <span className="font-bold text-slate-300">Mode:</span>
                                        <span className="text-[10px] font-black text-cyan-300 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-400/40">
                                            4-Way Battle
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="font-bold text-slate-300 text-[10px]">Timer:</span>
                                        <div className="flex gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setTimerSec(0)}
                                                className={`px-1.5 py-0.5 text-[10px] font-black rounded border transition-all cursor-pointer ${
                                                    timerSec === 0
                                                        ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400'
                                                        : 'border-slate-800 bg-slate-950/60 text-slate-400'
                                                }`}
                                            >
                                                Off
                                            </button>
                                            {([60, 90, 120] as const).map((sec) => (
                                                <button
                                                    key={sec}
                                                    type="button"
                                                    onClick={() => setTimerSec(sec)}
                                                    className={`px-1.5 py-0.5 text-[10px] font-black rounded border transition-all cursor-pointer ${
                                                        timerSec === sec
                                                            ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400'
                                                            : 'border-slate-800 bg-slate-950/60 text-slate-400'
                                                    }`}
                                                >
                                                    {sec}s
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Host Lucky Wish Selector */}
                                <LuckyWishPicker
                                    dieA={wishDieA}
                                    dieB={wishDieB}
                                    onSave={handleSaveWish}
                                    title="Host Lucky Wish"
                                />

                                {/* Create Button */}
                                <button
                                    type="button"
                                    onClick={handleCreateRoom}
                                    disabled={loading}
                                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-slate-950 font-black text-xs tracking-wider uppercase shadow hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    {loading ? (
                                        <>
                                            <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                            <span>Creating Arena...</span>
                                        </>
                                    ) : (
                                        <span>Create & Invite Friends (4-Way Arena)</span>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* TAB 2: JOIN ARENA */}
                        {tab === 'join' && (
                            <div className="flex flex-col gap-1.5">
                                <div className="bg-slate-900/60 p-2 rounded-xl border border-white/10 flex flex-col gap-1">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <label className="text-slate-300 font-extrabold">
                                            Arena Room Code
                                        </label>
                                        {pastedNotice && (
                                            <span className="text-emerald-300 font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded text-[10px]">
                                                ✓ Pasted!
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex gap-1.5 items-stretch">
                                        <input
                                            type="text"
                                            maxLength={8}
                                            value={joinCode}
                                            onChange={(e) => setJoinCode(extractRoomCode(e.target.value))}
                                            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                                            placeholder="ROOM CODE"
                                            className="flex-1 min-w-0 bg-slate-950 border border-cyan-500/40 rounded-lg px-2.5 py-1 text-center font-mono font-black text-sm tracking-widest text-cyan-300 uppercase outline-none focus:border-cyan-300 placeholder:text-slate-600"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handlePasteFromClipboard(false)}
                                            className="px-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-1 active:scale-95 shrink-0"
                                            title="Paste from clipboard"
                                        >
                                            <span>📋</span>
                                            <span className="hidden sm:inline">Paste</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Guest Lucky Wish Selector */}
                                <LuckyWishPicker
                                    dieA={wishDieA}
                                    dieB={wishDieB}
                                    onSave={handleSaveWish}
                                    title="Guest Lucky Wish"
                                />

                                {/* Dual Instant Join Action Bar */}
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => handlePasteFromClipboard(true)}
                                        className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-cyan-400/40 text-cyan-200 font-black text-xs uppercase tracking-wider shadow transition-all active:scale-[0.98] flex items-center justify-center gap-1 cursor-pointer"
                                        title="Paste and join in one tap"
                                    >
                                        <span>⚡</span>
                                        <span>Paste & Join</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleJoinRoom()}
                                        disabled={loading || !joinCode.trim()}
                                        className="py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                        {loading ? (
                                            <>
                                                <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                                <span>Joining...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>🚀</span>
                                                <span>Enter Arena</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Prominent Option to Go Back to Main Window */}
                        <div className="pt-1 border-t border-slate-800/80">
                            <button
                                type="button"
                                onClick={handleGoBackToMainMenu}
                                className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-extrabold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            >
                                <span>←</span>
                                <span>Return to Main Window</span>
                            </button>
                        </div>
                    </div>
                )
            ) : (
                /* IN-ROOM TOURNAMENT LOBBY VIEW */
                <div className="flex flex-col gap-1.5 text-slate-100">
                    {/* Slim Arena Code Banner with Copy and Share (No crown icon) */}
                    <div className="flex items-center justify-between gap-1.5 px-2 py-1 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 rounded-lg border border-amber-500/30 shadow">
                        <div className="min-w-0">
                            <div className="text-[8px] uppercase tracking-wider text-amber-400/80 font-black">
                                Arena Code ({effectiveMax} Players)
                            </div>
                            <div className="text-base font-black tracking-widest font-mono text-amber-300 leading-none">
                                {roomCode}
                            </div>
                        </div>

                        {/* Instant Copy and Share Buttons */}
                        <div className="flex gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={handleCopyCodeOnly}
                                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md text-[10px] font-black text-white transition-all flex items-center gap-1 active:scale-95 shadow cursor-pointer"
                                title="Copy room code"
                            >
                                <span>{codeCopied ? '✓' : '📋'}</span>
                                <span className="hidden sm:inline">{codeCopied ? 'Copied' : 'Code'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyInvite}
                                className="px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded-md text-[10px] font-black text-cyan-200 transition-all flex items-center gap-1 active:scale-95 shadow cursor-pointer"
                                title="Copy invite link"
                            >
                                <span>{copied ? '✓' : '🔗'}</span>
                                <span className="hidden sm:inline">{copied ? 'Link Copied' : 'Link'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleShare}
                                className="px-1.5 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 rounded-md text-[10px] font-black text-emerald-200 transition-all flex items-center gap-1 active:scale-95 shadow cursor-pointer"
                                title="Share"
                            >
                                <span>📤</span>
                            </button>
                        </div>
                    </div>

                    {/* Player Seats: 4 seats (2x2 grid) */}
                    <div className="grid grid-cols-2 gap-1">
                        {visibleSlots.map((slotIdx) => {
                            const p = roomState.players[slotIdx];
                            const seat = SEAT_COLORS[slotIdx];
                            const isMe = myPlayerIndex === slotIdx;

                            return (
                                <div
                                    key={slotIdx}
                                    className={`relative p-1.5 rounded-lg border ${seat.card} ${seat.glow} flex flex-col justify-between gap-0.5 backdrop-blur-md transition-all`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1 min-w-0">
                                            <div className="relative shrink-0">
                                                <div className="text-xs w-6 h-6 rounded-md bg-slate-950/80 border border-white/10 flex items-center justify-center">
                                                    {p ? p.avatar : '🤝'}
                                                </div>
                                                <div
                                                    className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-slate-950 ${
                                                        p?.connected
                                                            ? 'bg-emerald-400 animate-pulse'
                                                            : p?.disconnectTime
                                                            ? 'bg-amber-500'
                                                            : 'bg-slate-700'
                                                    }`}
                                                />
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <span className={`text-[8px] font-black uppercase ${seat.text}`}>
                                                        {seat.name}
                                                    </span>
                                                    {isMe && (
                                                        <span className="text-[7px] font-black bg-cyan-400 text-slate-950 px-1 rounded">
                                                            YOU
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="font-black text-[10px] text-white truncate max-w-[65px] sm:max-w-[90px]">
                                                    {p ? p.name : <span className="text-slate-400 font-normal italic">Open (Bot)</span>}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status Badge */}
                                        <div className="shrink-0 text-right">
                                            {p ? (
                                                p.isHost ? (
                                                    <span className="text-[7px] font-extrabold text-amber-300 bg-amber-400/10 px-1 py-0.2 rounded border border-amber-400/30">
                                                        Host
                                                    </span>
                                                ) : p.isAI ? (
                                                    <span className="text-[7px] font-extrabold text-slate-300 bg-slate-800/80 px-1 py-0.2 rounded border border-slate-700">
                                                        AI
                                                    </span>
                                                ) : p.isReady ? (
                                                    <span className="text-[7px] font-black text-emerald-300 bg-emerald-500/20 px-1 py-0.2 rounded border border-emerald-500/40">
                                                        READY ✓
                                                    </span>
                                                ) : (
                                                    <span className="text-[7px] font-bold text-slate-300 bg-slate-800/60 px-1 py-0.2 rounded border border-slate-700">
                                                        Joined
                                                    </span>
                                                )
                                            ) : (
                                                <span className="text-[7px] text-amber-300/80 bg-amber-400/10 px-1 py-0.2 rounded font-extrabold border border-amber-400/20">
                                                    Auto-Bot
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Wish Number display for this player seat */}
                                    <div className="flex items-center justify-between pt-0.5 border-t border-white/5 text-[9px]">
                                        <span className="text-amber-300/80 font-bold flex items-center gap-0.5">
                                            <span>✨ Wish:</span>
                                        </span>
                                        <span className="font-mono font-black text-amber-200">
                                            {p?.wish ? `(${p.wish[0]}, ${p.wish[1]})` : isMe ? `(${wishDieA}, ${wishDieB})` : '(Set)'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Lucky Wish Selector & Editor for Host and Guest */}
                    <LuckyWishPicker
                        dieA={wishDieA}
                        dieB={wishDieB}
                        onSave={handleSaveWish}
                        title="Your Lucky Wish"
                    />

                    {/* Single Clean Turn Timer & Host Settings Bar */}
                    <div className="px-2 py-1 bg-slate-950/80 rounded-lg border border-white/10 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1 text-slate-300 font-bold">
                            <span>⏱️ Timer:</span>
                            <span className="text-cyan-300 font-extrabold">
                                {(roomState.turnTimeSec ?? 90) > 0 ? `${roomState.turnTimeSec ?? 90}s` : 'Off'}
                            </span>
                        </div>
                        {isHost ? (
                            <div className="flex gap-1 items-center">
                                <span className="text-[9px] text-slate-400 mr-0.5">🤖 Bots:</span>
                                <button
                                    type="button"
                                    onClick={() => multiplayerClient.toggleFillBots(!roomState.fillBots)}
                                    className={`px-1.5 py-0.2 text-[9px] font-black rounded border cursor-pointer ${
                                        roomState.fillBots
                                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                                            : 'bg-slate-900 border-slate-800 text-slate-500'
                                    }`}
                                >
                                    {roomState.fillBots ? 'On' : 'Off'}
                                </button>
                            </div>
                        ) : (
                            <span className="text-[9px] text-slate-500">Host controlled</span>
                        )}
                    </div>

                    {/* Error Banner */}
                    {errorMsg && (
                        <div className="p-1 bg-red-950/60 border border-red-500/40 text-red-200 rounded-md text-[10px] font-bold flex items-center gap-1 shadow">
                            <span>⚠️</span>
                            <span className="truncate">{errorMsg}</span>
                        </div>
                    )}

                    {/* Main Arena Action Controls & Option to Go Back */}
                    <div className="flex gap-1 pt-0.5">
                        {!isHost && myPlayerIndex !== null && (
                            <button
                                type="button"
                                onClick={() => multiplayerClient.toggleReady()}
                                className={`flex-1 py-1.5 rounded-lg font-black text-xs uppercase tracking-wider transition-all shadow active:scale-[0.98] cursor-pointer ${
                                    roomState.players[myPlayerIndex]?.isReady
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                        : 'bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 hover:brightness-110 shadow-emerald-500/20'
                                }`}
                            >
                                {roomState.players[myPlayerIndex]?.isReady ? 'Cancel Ready' : '✓ Ready'}
                            </button>
                        )}

                        {isHost && (
                            <button
                                type="button"
                                onClick={handleStartGame}
                                disabled={loading}
                                className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                            >
                                {loading ? (
                                    <>
                                        <span className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                        <span>Launching...</span>
                                    </>
                                ) : (
                                    <span>Launch Arena Match</span>
                                )}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleGoBackToMainMenu}
                            className="px-2.5 py-1.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-300 font-black hover:bg-red-900/50 transition-all text-xs tracking-wider uppercase active:scale-95 shadow cursor-pointer shrink-0"
                            title="Leave and return to Main Menu"
                        >
                            ← Leave
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
