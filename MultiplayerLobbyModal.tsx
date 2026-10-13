import { useState, useEffect } from 'react';
import { multiplayerClient } from '../network/multiplayerClient';
import { COLOR_NAMES } from '../game/rules';
import { Modal, U } from './kit';
import { safeStorage } from '../state/storage';

const AVATARS = ['🤴', '👑', '🔥', '🌟', '🍀', '⚡', '🦁', '🐯', '💎', '🚀'];
const SEAT_COLORS = [
    { name: 'Red', hex: '#ef4444', border: 'border-red-500', bg: 'bg-red-500/20', text: 'text-red-400' },
    { name: 'Green', hex: '#22c55e', border: 'border-green-500', bg: 'bg-green-500/20', text: 'text-green-400' },
    { name: 'Yellow', hex: '#eab308', border: 'border-yellow-500', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    { name: 'Cyan', hex: '#06b6d4', border: 'border-cyan-500', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
];

interface Props {
    onClose: () => void;
    initialRoomCode?: string;
}

export function MultiplayerLobbyModal({ onClose, initialRoomCode }: Props) {
    const [, setTick] = useState(0);

    const [tab, setTab] = useState<'create' | 'join'>('create');
    const [name, setName] = useState(() => safeStorage.getItem('ludo_player_name') || 'Player');
    const [avatar, setAvatar] = useState(() => safeStorage.getItem('ludo_player_avatar') || '🤴');
    const [joinCode, setJoinCode] = useState(initialRoomCode || '');
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

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
        if (initialRoomCode) {
            setJoinCode(initialRoomCode);
            setTab('join');
        }
    }, [initialRoomCode]);

    const roomState = multiplayerClient.roomState;
    const roomCode = multiplayerClient.roomCode;
    const isHost = multiplayerClient.isHost;
    const myPlayerIndex = multiplayerClient.myPlayerIndex;

    const handleCreateRoom = async () => {
        setLoading(true);
        setErrorMsg(null);
        const res = await multiplayerClient.createRoom(name, avatar);
        setLoading(false);
        if (!res.ok) {
            setErrorMsg(res.error || 'Failed to create room');
        }
    };

    const handleJoinRoom = async () => {
        if (!joinCode.trim()) {
            setErrorMsg('Please enter a 6-character room code');
            return;
        }
        setLoading(true);
        setErrorMsg(null);
        const res = await multiplayerClient.joinRoom(joinCode.trim(), name, avatar);
        setLoading(false);
        if (!res.ok) {
            setErrorMsg(res.error || 'Failed to join room');
        }
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
                title: 'Join my Ludo Emperor Room',
                text: `Join my 4-way Ludo match with room code ${roomCode}!`,
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
            setErrorMsg(res.error || 'Cannot start game yet');
        }
    };

    return (
        <Modal title="🌐 Online Multiplayer Rooms" onClose={onClose} wide>
            {/* If not in a room yet, show tabs to Create or Join */}
            {!roomCode || !roomState ? (
                <div className="flex flex-col gap-4 text-white">
                    {/* Tabs */}
                    <div className="flex rounded-xl bg-slate-900/80 p-1 border border-cyan-500/20">
                        <button
                            onClick={() => { setTab('create'); setErrorMsg(null); }}
                            className={`flex-1 py-2.5 font-bold rounded-lg transition-all text-sm sm:text-base ${
                                tab === 'create'
                                    ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold'
                                    : 'text-slate-300 hover:text-white'
                            }`}
                        >
                            👑 Create Private Room
                        </button>
                        <button
                            onClick={() => { setTab('join'); setErrorMsg(null); }}
                            className={`flex-1 py-2.5 font-bold rounded-lg transition-all text-sm sm:text-base ${
                                tab === 'join'
                                    ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold'
                                    : 'text-slate-300 hover:text-white'
                            }`}
                        >
                            🔑 Join with Code
                        </button>
                    </div>

                    {/* Nickname & Avatar config */}
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 flex flex-col gap-3">
                        <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Your Profile</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="text"
                                maxLength={16}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your nickname"
                                className="flex-1 bg-slate-950/90 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold outline-none focus:border-cyan-400"
                            />
                            <div className="text-2xl sm:text-3xl bg-slate-800/80 w-12 h-12 flex items-center justify-center rounded-xl border border-slate-600">
                                {avatar}
                            </div>
                        </div>

                        {/* Avatar Picker */}
                        <div className="flex flex-wrap gap-2 pt-1">
                            {AVATARS.map((av) => (
                                <button
                                    key={av}
                                    type="button"
                                    onClick={() => setAvatar(av)}
                                    className={`w-9 h-9 sm:w-10 sm:h-10 text-xl rounded-lg border flex items-center justify-center transition-transform active:scale-95 ${
                                        avatar === av
                                            ? 'border-cyan-400 bg-cyan-500/20 ring-2 ring-cyan-400/50'
                                            : 'border-slate-700 bg-slate-800/50 hover:bg-slate-700'
                                    }`}
                                >
                                    {av}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error display */}
                    {errorMsg && (
                        <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-xl text-sm font-semibold flex items-center gap-2">
                            <span>⚠️</span> <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Tab 1: Create Room */}
                    {tab === 'create' && (
                        <div className="flex flex-col gap-3">
                            <p className="text-sm text-slate-300">
                                Create an online room, share the 6-character code with friends, and battle in real time!
                            </p>
                            <button
                                onClick={handleCreateRoom}
                                disabled={loading}
                                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400 text-slate-950 font-black text-lg shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {loading ? 'Creating Room...' : '🎲 Generate Room & Become Host'}
                            </button>
                        </div>
                    )}

                    {/* Tab 2: Join Room */}
                    {tab === 'join' && (
                        <div className="flex flex-col gap-3">
                            <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Room Code (6 Characters)</label>
                            <input
                                type="text"
                                maxLength={6}
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="e.g. LUDO4X"
                                className="w-full text-center tracking-[0.3em] font-mono text-2xl font-black bg-slate-950/90 border border-cyan-500/40 rounded-xl py-3 text-cyan-300 uppercase outline-none focus:border-cyan-400"
                            />
                            <button
                                onClick={handleJoinRoom}
                                disabled={loading || !joinCode.trim()}
                                className="w-full py-3.5 rounded-xl bg-cyan-400 text-slate-950 font-black text-lg shadow-lg hover:bg-cyan-300 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {loading ? 'Joining Room...' : '🚀 Join Room'}
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                /* IN-ROOM LOBBY VIEW */
                <div className="flex flex-col gap-4 text-white">
                    {/* Header info */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-slate-900/80 rounded-xl border border-cyan-500/30">
                        <div>
                            <div className="text-xs uppercase tracking-widest text-slate-400 font-bold">Room Code</div>
                            <div className="text-3xl font-black tracking-[0.25em] font-mono text-cyan-300">{roomCode}</div>
                        </div>

                        <div className="flex gap-2 w-full sm:w-auto">
                            <button
                                onClick={handleCopyInvite}
                                className="flex-1 sm:flex-none px-4 py-2 bg-cyan-500/20 border border-cyan-500/50 hover:bg-cyan-500/30 rounded-lg text-sm font-bold text-cyan-200 transition-all flex items-center justify-center gap-1.5"
                            >
                                📋 {copied ? 'Copied Link!' : 'Copy Link'}
                            </button>
                            <button
                                onClick={handleShare}
                                className="flex-1 sm:flex-none px-4 py-2 bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500/30 rounded-lg text-sm font-bold text-emerald-200 transition-all flex items-center justify-center gap-1.5"
                            >
                                🔗 Share
                            </button>
                        </div>
                    </div>

                    {/* 4 Player Slots Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[0, 1, 2, 3].map((slotIdx) => {
                            const p = roomState.players[slotIdx];
                            const seat = SEAT_COLORS[slotIdx];
                            const isMe = myPlayerIndex === slotIdx;

                            return (
                                <div
                                    key={slotIdx}
                                    className={`relative p-3.5 rounded-xl border ${seat.border} ${seat.bg} flex items-center justify-between backdrop-blur-sm transition-all`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="text-3xl sm:text-4xl w-12 h-12 rounded-xl bg-slate-950/60 border border-slate-700/80 flex items-center justify-center">
                                                {p ? p.avatar : '👤'}
                                            </div>
                                            {/* Connection dot */}
                                            <div
                                                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-950 ${
                                                    p?.connected
                                                        ? 'bg-green-500 animate-pulse'
                                                        : p?.disconnectTime
                                                        ? 'bg-amber-500'
                                                        : 'bg-slate-600'
                                                }`}
                                            />
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-black uppercase tracking-wider ${seat.text}`}>
                                                    {seat.name}
                                                </span>
                                                {p?.isHost && (
                                                    <span className="text-[10px] font-black bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded">
                                                        HOST
                                                    </span>
                                                )}
                                                {isMe && (
                                                    <span className="text-[10px] font-black bg-cyan-400 text-slate-950 px-1.5 py-0.5 rounded">
                                                        YOU
                                                    </span>
                                                )}
                                            </div>
                                            <div className="font-extrabold text-base text-white truncate max-w-[140px] sm:max-w-[160px]">
                                                {p ? p.name : <span className="text-slate-400 italic">Open Seat</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status Indicator */}
                                    <div>
                                        {p ? (
                                            p.isHost ? (
                                                <span className="text-xs font-bold text-amber-300 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/30">
                                                    Host
                                                </span>
                                            ) : p.isAI ? (
                                                <span className="text-xs font-bold text-slate-300 bg-slate-700/40 px-2.5 py-1 rounded-full border border-slate-600">
                                                    🤖 AI Bot
                                                </span>
                                            ) : p.isReady ? (
                                                <span className="text-xs font-black text-green-300 bg-green-500/20 px-2.5 py-1 rounded-full border border-green-500/40">
                                                    READY ✓
                                                </span>
                                            ) : (
                                                <span className="text-xs font-bold text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/40">
                                                    Waiting...
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-xs font-bold text-slate-500">
                                                {roomState.fillBots ? 'Bot will fill' : 'Empty'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Host Settings */}
                    {isHost && (
                        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/60 flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-300">
                                🤖 Fill empty slots with AI Bots
                            </span>
                            <button
                                type="button"
                                onClick={() => multiplayerClient.toggleFillBots(!roomState.fillBots)}
                                className={`w-12 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                                    roomState.fillBots ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'
                                }`}
                            >
                                <span className="w-5 h-5 bg-white rounded-full shadow-md" />
                            </button>
                        </div>
                    )}

                    {/* Error display */}
                    {errorMsg && (
                        <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-xl text-sm font-semibold">
                            ⚠️ {errorMsg}
                        </div>
                    )}

                    {/* Controls Row */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        {/* Guest Ready Button */}
                        {!isHost && myPlayerIndex !== null && (
                            <button
                                onClick={() => multiplayerClient.toggleReady()}
                                className={`flex-1 py-3.5 rounded-xl font-black text-lg transition-all ${
                                    roomState.players[myPlayerIndex]?.isReady
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                        : 'bg-green-500 text-slate-950 hover:bg-green-400'
                                }`}
                            >
                                {roomState.players[myPlayerIndex]?.isReady ? 'Cancel Ready' : 'I am Ready! ✓'}
                            </button>
                        )}

                        {/* Host Start Game Button */}
                        {isHost && (
                            <button
                                onClick={handleStartGame}
                                disabled={loading}
                                className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-black text-lg shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {loading ? 'Launching Match...' : '🚀 Start Game Now'}
                            </button>
                        )}

                        {/* Leave Room Button */}
                        <button
                            onClick={() => {
                                multiplayerClient.leaveRoom();
                                onClose();
                            }}
                            className="px-5 py-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 font-bold hover:bg-red-500/25 transition-all text-sm sm:text-base"
                        >
                            Leave Room
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
