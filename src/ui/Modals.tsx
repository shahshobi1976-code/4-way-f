import { useRef, useState } from 'react';
import { store, useStore } from '../state/store';
import { LANGS, tr, colorName } from '../i18n';
import { INSTRUMENTS, setInstrument, setMusicOn, setSong, clearSong } from '../game/music';
import { BG_NAMES } from '../game/draw';
import { REACTIONS, quickPhrases } from '../game/banter';
import { bus } from '../game/bus';
import { stopMusic } from '../game/music';
import { Chip, Modal, Toggle, U } from './kit';
import { MultiplayerLobbyModal } from './MultiplayerLobbyModal';
import { TutorialModal } from './TutorialModal';
import { multiplayerClient } from '../network/multiplayerClient';

import * as sfx from '../game/sfx';

const close = () => store.patch({ modal: null });

function MusicPicker() {
    const s = useStore((st) => st.settings);
    const fileRef = useRef<HTMLInputElement>(null);
    return (
        <>
            <Toggle on={s.music} onChange={setMusicOn} label="🎵 Music" />
            <div className="grid grid-cols-2" style={{ gap: U(8) }}>
                {INSTRUMENTS.map((n, i) => (
                    <Chip key={n} active={s.instrument === i && !s.songName && s.music} onClick={() => setInstrument(i)}>🎵 {n}</Chip>
                ))}
            </div>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSong(f); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl bg-cyan-500/20 font-bold text-cyan-200" style={{ marginTop: U(14), padding: U(12), fontSize: U(22) }}>
                📁 Choose a song from my device
            </button>
            {s.songName && (
                <div className="flex items-center justify-between rounded-xl bg-white/5" style={{ marginTop: U(8), padding: U(10), fontSize: U(20) }}>
                    <span className="truncate">🎶 {s.songName}</span>
                    <button onClick={() => clearSong()} className="font-bold text-red-300">Remove my song</button>
                </div>
            )}
            <p className="text-white/50" style={{ fontSize: U(17), marginTop: U(8) }}>Your song is used only while the game is open; it is not uploaded or saved.</p>
        </>
    );
}

function Settings() {
    const s = useStore((st) => st.settings);
    const phase = useStore((st) => st.phase);
    const landscape = useStore((st) => st.landscape);

    return (
        <Modal title="⚙️ Settings" onClose={close} wide={landscape}>
            <div className={`text-xs ${landscape ? 'grid grid-cols-2 gap-3 items-start' : 'flex flex-col gap-2'}`}>
                {/* Column 1: Board, Tilt, Timer, Language */}
                <div className="flex flex-col gap-2">
                    <Toggle on={s.rotate} onChange={(v) => store.patchSettings({ rotate: v })} label="Rotate board to player" />
                    
                    <div className="rounded-xl bg-white/5 p-2 flex flex-col gap-1">
                        <div className="flex justify-between font-bold text-white text-xs">
                            <span>Camera tilt</span>
                            <span className="text-cyan-300">{s.tilt}°</span>
                        </div>
                        <input
                            type="range"
                            min={20}
                            max={90}
                            value={s.tilt}
                            onChange={(e) => store.patchSettings({ tilt: Number(e.target.value) })}
                            className="w-full accent-cyan-400 h-1.5 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-white/50">
                            <span>low angle</span>
                            <span>top view</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-cyan-200">⏱️ Turn Timer</span>
                            <span className="font-bold text-cyan-300 text-[11px]">
                                {s.timerEnabled ? `⏳ ${s.timerSec}s` : '♾️ Off'}
                            </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                            <Chip active={!s.timerEnabled} onClick={() => store.patchSettings({ timerEnabled: false })}>
                                ♾️ Off
                            </Chip>
                            {([60, 90, 120] as const).map((sec) => (
                                <Chip
                                    key={sec}
                                    active={s.timerEnabled && s.timerSec === sec}
                                    onClick={() => store.patchSettings({ timerEnabled: true, timerSec: sec })}
                                >
                                    {sec}s
                                </Chip>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="font-bold text-cyan-200 shrink-0 text-xs">🌐 Language</span>
                        <select
                            value={s.lang}
                            onChange={(e) => store.patchSettings({ lang: e.target.value })}
                            className="flex-1 rounded-lg border border-cyan-400/50 bg-[#0e1530] text-white px-2 py-1 text-xs outline-none"
                        >
                            {LANGS.map((l) => (
                                <option key={l.code} value={l.code}>
                                    {l.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Column 2: Audio, Backgrounds, Music, Return to Menu */}
                <div className="flex flex-col gap-2">
                    <Toggle on={s.sound} onChange={(v) => store.patchSettings({ sound: v })} label="🔊 Sound Effects" />
                    <Toggle
                        on={!s.aiMute}
                        onChange={(v) => {
                            store.patchSettings({ aiMute: !v });
                            if (!v) sfx.stopSpeech();
                        }}
                        label="🎙️ AI Talking (Mute AI Only)"
                    />

                    <div className="flex flex-col gap-1">
                        <span className="font-bold text-cyan-200 text-xs">Background Arena</span>
                        <div className="grid grid-cols-2 gap-1">
                            {BG_NAMES.map((n, i) => (
                                <Chip key={n} active={s.bg === i} onClick={() => store.patchSettings({ bg: i })}>
                                    {n}
                                </Chip>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <MusicPicker />
                    </div>

                    {phase === 'playing' && (
                        <button
                            type="button"
                            onClick={() => {
                                stopMusic();
                                if (multiplayerClient.roomCode) {
                                    multiplayerClient.leaveRoom();
                                }
                                store.patch({ modal: null, phase: 'menu', result: null, popup: null });
                            }}
                            className="w-full py-2 rounded-xl bg-red-500/25 border border-red-500/40 font-extrabold text-red-200 hover:bg-red-500/40 transition-colors text-xs uppercase tracking-wider mt-1 cursor-pointer"
                        >
                            ← Exit to Main Menu
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function HowTo() {
    const rules = [
        'Two dice are rolled. Tap a die (or tap a glowing token directly) to move. A 6 brings a token out of base.',
        'Unlimited Double 6s (6+6): Rolling 6+6, capturing an opponent, or entering the centre home (Gul) gives you an extra turn with no consecutive limit.',
        'Pair / Stack Protection: Two or more tokens of the same colour on a non-safe square form a protected stack. A capture only succeeds if your tokens on the landing square equal or outnumber the opponent stack (myCount >= otherCount).',
        'Lone Token Full-Total Rule: When you only have 1 active token out on the board, it can only enter its coloured home path or centre home using the full combined total of both dice (partial single-die entry is blocked while 2 dice remain), and it may move by the combined sum when legal.',
        'Gul or Pass: Landing directly on the centre home (56) asks "Gul or Pass?" — choose Gul to enter and earn an extra turn, or Pass to consume the die and stay on the path.',
        'Compulsory Capture Penalty: If total (final square) or pair capture options exist, 1 capture is required; otherwise, you must take the maximum independent single-die captures possible. If captures made < required at the end of the turn, every token that had a capture option and did not capture goes back to base. Your first 3 matches warn before skipping.',
        'Lucky 7: Active only when 0 tokens are on the open track and at least 1 token is still in base — rolling 1+6, 2+5, or 3+4 converts to 6+6 and an extra turn.',
        'Optional Turn Timer (60s, 90s, 120s, or Off): Choose your timer before starting; if time expires, the move plays automatically.',
    ];
    return (
        <Modal title="📖 How to play" onClose={close} wide>
            <ol className="list-decimal" style={{ paddingLeft: U(26), display: 'grid', gap: U(10) }}>
                {rules.map((r) => <li key={r}>{r}</li>)}
            </ol>
        </Modal>
    );
}

function Tournament() {
    const lang = useStore((s) => s.settings.lang);
    return (
        <Modal title={`🏆 ${tr(lang, 'tour')}`} onClose={close} slim>
            <div className="flex flex-col items-center justify-center text-center py-2 px-1">
                <span className="text-4xl mb-1">🏆</span>
                <p className="font-black text-amber-300 text-lg sm:text-xl mb-1">{tr(lang, 'soon')}</p>
                <p className="text-white/70 text-xs max-w-xs mb-3">
                    Championship tournament brackets and arena cups are preparing. Check back soon!
                </p>
                <button
                    type="button"
                    onClick={close}
                    className="w-full max-w-xs py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                    <span>←</span>
                    <span>Return to Main Window</span>
                </button>
            </div>
        </Modal>
    );
}



function Wish({ idx }: { idx: number }) {
    const players = useStore((s) => s.players);
    const lang = useStore((s) => s.settings.lang);
    const cur = players[idx].wish;
    const [a, setA] = useState(cur ? cur[0] : 6);
    const [b, setB] = useState(cur ? cur[1] : 5);
    const bad = a === 6 && b === 6;
    const Sel = ({ v, on }: { v: number; on: (n: number) => void }) => (
        <div className="flex" style={{ gap: U(6) }}>
            {[1, 2, 3, 4, 5, 6].map((n) => <Chip key={n} active={v === n} onClick={() => on(n)} style={{ width: U(58), fontSize: U(28) }}>{n}</Chip>)}
        </div>
    );
    return (
        <Modal title={`✨ ${colorName(lang, idx)} – ${tr(lang, 'wishSet')}`} onClose={close}>
            <p className="text-white/70">Pick the two dice numbers. You can use it once in the game (any pair except 6 & 6) and cannot change it after the match starts.</p>
            <div style={{ margin: `${U(14)} 0 ${U(6)}` }}>Die 1</div><Sel v={a} on={setA} />
            <div style={{ margin: `${U(14)} 0 ${U(6)}` }}>Die 2</div><Sel v={b} on={setB} />
            {bad && <div className="font-bold text-red-300" style={{ marginTop: U(10) }}>6 & 6 is not allowed.</div>}
            <div className="flex" style={{ gap: U(10), marginTop: U(18) }}>
                <button disabled={bad} onClick={() => { store.patchPlayer(idx, { wish: [a, b] }); close(); }} className={`flex-1 rounded-xl font-black ${bad ? 'bg-gray-600 text-gray-400' : 'bg-amber-400 text-black'}`} style={{ padding: U(12) }}>Save ({a}, {b})</button>
                <button onClick={() => { store.patchPlayer(idx, { wish: null }); close(); }} className="flex-1 rounded-xl bg-white/15 font-bold" style={{ padding: U(12) }}>No wish</button>
            </div>
        </Modal>
    );
}

function Profile({ idx }: { idx: number }) {
    const players = useStore((s) => s.players);
    const lang = useStore((s) => s.settings.lang);
    const p = players[idx];
    const [text, setText] = useState('');
    const [rec, setRec] = useState<MediaRecorder | null>(null);
    const [err, setErr] = useState('');
    const send = (t: string, voice = true) => { if (t.trim()) bus.chat?.(idx, t.trim(), { voice }); };
    const nm = (p.name || '').trim() || colorName(lang, idx);

    const toggleRec = async () => {
        if (rec) { rec.stop(); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            const chunks: Blob[] = [];
            mr.ondataavailable = (e) => chunks.push(e.data);
            mr.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                setRec(null);
                const url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
                const au = new Audio(url);
                au.onended = () => URL.revokeObjectURL(url);
                void au.play().catch(() => {});
                send('🎤 Voice message', false);
            };
            mr.start();
            setRec(mr);
            setErr('');
            window.setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 8000);
        } catch {
            setErr('Microphone not available');
        }
    };

    return (
        <Modal title={`${p.avatar} ${nm}`} onClose={close}>
            <div className="font-bold" style={{ color: p.ai ? '#9fb0ff' : '#5dff9a' }}>{p.ai ? 'AI • Playing' : '● Online • Playing'}</div>
            <div className="grid grid-cols-4" style={{ gap: U(8), margin: `${U(14)} 0` }}>
                {REACTIONS.map((r) => <button key={r} onClick={() => send(r)} className="rounded-xl bg-white/10" style={{ height: U(64), fontSize: U(36) }}>{r}</button>)}
            </div>
            <div className="flex" style={{ gap: U(8) }}>
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { send(text); setText(''); } }} placeholder="Type a message…" className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 text-white" style={{ padding: U(12), fontSize: U(22) }} />
                <button onClick={() => { send(text); setText(''); }} className="rounded-xl bg-cyan-400 font-black text-black" style={{ padding: `0 ${U(20)}`, fontSize: U(28) }}>➔</button>
            </div>
            <button onClick={() => void toggleRec()} className={`w-full rounded-xl font-bold ${rec ? 'bg-red-500' : 'bg-white/15'}`} style={{ marginTop: U(10), padding: U(12), fontSize: U(22) }}>{rec ? '⏹ Tap to send' : '🎤 VOICE MSG'}</button>
            {err && <div className="text-red-300" style={{ marginTop: U(6) }}>{err}</div>}
            <div className="grid grid-cols-2" style={{ gap: U(6), marginTop: U(12) }}>
                {quickPhrases(lang).map((q) => <button key={q.text} onClick={() => send(q.text)} className="rounded-lg bg-white/10 text-left" style={{ padding: U(8), fontSize: U(16) }}>{q.icon} {q.text}</button>)}
            </div>
            <button onClick={close} className="w-full rounded-xl bg-white/20 font-bold" style={{ marginTop: U(14), padding: U(12), fontSize: U(24) }}>CLOSE</button>
        </Modal>
    );
}

export function Modals() {
    const modal = useStore((s) => s.modal);
    if (!modal) return null;
    if (modal === 'settings') return <Settings />;
    if (modal === 'music') return <Modal title="🎵 Music" onClose={close}><MusicPicker /></Modal>;
    if (modal === 'howto') return <TutorialModal onClose={close} />;
    const urlRoom = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('room') : null;
    if (modal === 'invite' || modal === 'multiplayer') return <MultiplayerLobbyModal onClose={close} initialRoomCode={urlRoom || undefined} />;
    if (modal === 'tournament') return <Tournament />;
    if (modal.startsWith('wish:')) return <Wish idx={Number(modal.slice(5))} />;
    if (modal.startsWith('profile:')) return <Profile idx={Number(modal.slice(8))} />;
    return null;
}
