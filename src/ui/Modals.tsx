import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../state/store';
import { LANGS, tr, colorName } from '../i18n';
import { BGM_TRACKS, DEFAULT_BGM_TRACK, setBgmTrack, setMusicOn, setSong, clearSong, stopMusic } from '../game/music';
import { BG_NAMES } from '../game/draw';
import { BOARD_THEME_LIST, DICE_STYLE_LIST, resolveBoardTheme } from '../game/themes';
import { TOKEN_STYLE_LIST, normalizeTokenStyleId, type HumanGenderMode } from '../game/tokens';
import { REACTIONS, quickPhrases } from '../game/banter';
import { bus } from '../game/bus';
import { Chip, Modal, Toggle, U } from './kit';
import { MultiplayerLobbyModal } from './MultiplayerLobbyModal';
import { TutorialModal } from './TutorialModal';
import { multiplayerClient } from '../network/multiplayerClient';
import {
    UniversalAudioCapture,
    probeMicrophoneStatus,
    requestMicrophonePermission,
    type AudioCaptureResult,
} from '../game/audioCapture';

import * as sfx from '../game/sfx';

const close = () => store.patch({ modal: null });

function MusicPicker() {
    const s = useStore((st) => st.settings);
    const fileRef = useRef<HTMLInputElement>(null);
    const activeTrackId = s.bgmTrack || DEFAULT_BGM_TRACK;
    return (
        <>
            <Toggle on={s.music} onChange={setMusicOn} label="🎵 Music" />
            <div className="text-[11px] font-bold text-cyan-200 mt-1 mb-1">🎶 Soundtracks</div>
            <div className="grid grid-cols-2" style={{ gap: U(6) }}>
                {BGM_TRACKS.map((track) => (
                    <Chip
                        key={track.id}
                        active={activeTrackId === track.id && !s.songName && s.music}
                        onClick={() => setBgmTrack(track.id)}
                    >
                        🎧 {track.label}
                    </Chip>
                ))}
            </div>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSong(f); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl bg-cyan-500/20 font-bold text-cyan-200 cursor-pointer" style={{ marginTop: U(14), padding: U(12), fontSize: U(22) }}>
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
    const activeBoardThemeId = resolveBoardTheme(s.boardTheme).id;
    const activeTokenStyleId = normalizeTokenStyleId(s.tokenStyle);
    const activeGenderMode = s.humanGenderMode || 'auto';
    const previewSeatRef = useRef(0);

    const classicTokens = TOKEN_STYLE_LIST.filter((t) => t.category === 'classic');
    const humanTokens = TOKEN_STYLE_LIST.filter((t) => t.category === 'human');
    const animalTokens = TOKEN_STYLE_LIST.filter((t) => t.category === 'animal');

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

                    <div className="flex flex-col gap-1 pt-1">
                        <span className="font-bold text-cyan-200 text-xs">⚠️ Capture Warning (Compulsory Rule)</span>
                        <select
                            aria-label="Capture Warning (Compulsory Rule)"
                            value={s.captureWarningMode || 'first3'}
                            onChange={(e) => store.patchSettings({ captureWarningMode: e.target.value as 'first3' | 'always' | 'off' })}
                            className="w-full rounded-lg border border-cyan-400/50 bg-[#0e1530] text-white px-2 py-1.5 text-xs outline-none"
                        >
                            <option value="first3">Newcomers (First 3 Matches per Player)</option>
                            <option value="always">Always ON</option>
                            <option value="off">Off</option>
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
                        <span className="font-bold text-cyan-200 text-xs">🏁 Board Theme</span>
                        <div className="grid grid-cols-2 gap-1">
                            {BOARD_THEME_LIST.map((theme) => (
                                <Chip
                                    key={theme.id}
                                    active={activeBoardThemeId === theme.id}
                                    onClick={() => store.patchSettings({ boardTheme: theme.id })}
                                >
                                    {theme.icon} {theme.name}
                                </Chip>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 border border-white/10 p-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-cyan-200 text-xs">🎭 Token Style</span>
                            <button
                                type="button"
                                onClick={() => {
                                    const seat = previewSeatRef.current % 4;
                                    previewSeatRef.current = (previewSeatRef.current + 1) % 4;
                                    sfx.playTokenPreviewSfx(activeTokenStyleId, seat, activeGenderMode);
                                }}
                                className="px-2 py-0.5 rounded-lg bg-amber-400/20 border border-amber-400/60 text-amber-200 font-extrabold text-[10px] hover:bg-amber-400/35 cursor-pointer"
                            >
                                🔊 Preview
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-1">
                            {classicTokens.map((tk) => (
                                <Chip
                                    key={tk.id}
                                    active={activeTokenStyleId === tk.id}
                                    onClick={() => store.patchSettings({ tokenStyle: tk.id })}
                                >
                                    {tk.icon} {tk.name}
                                </Chip>
                            ))}
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-0.5">
                            <span className="text-[10px] font-bold text-cyan-200/90">Human Style</span>
                            <div className="grid grid-cols-3 gap-1">
                                {(['auto', 'girl', 'boy'] as HumanGenderMode[]).map((gm) => (
                                    <Chip
                                        key={gm}
                                        active={activeGenderMode === gm}
                                        onClick={() => store.patchSettings({ humanGenderMode: gm })}
                                    >
                                        {gm === 'auto' ? 'Auto' : gm === 'girl' ? 'Girl' : 'Boy'}
                                    </Chip>
                                ))}
                            </div>
                        </div>

                        <div className="text-[10px] font-bold text-white/60">Human 3D Characters</div>
                        <div className="grid grid-cols-2 gap-1">
                            {humanTokens.map((tk) => (
                                <Chip
                                    key={tk.id}
                                    active={activeTokenStyleId === tk.id}
                                    onClick={() => store.patchSettings({ tokenStyle: tk.id })}
                                >
                                    {tk.icon} {tk.name}
                                </Chip>
                            ))}
                        </div>

                        <div className="text-[10px] font-bold text-white/60 pt-0.5">Articulated 3D Animals</div>
                        <div className="grid grid-cols-2 gap-1">
                            {animalTokens.map((tk) => (
                                <Chip
                                    key={tk.id}
                                    active={activeTokenStyleId === tk.id}
                                    onClick={() => store.patchSettings({ tokenStyle: tk.id })}
                                >
                                    {tk.icon} {tk.name}
                                </Chip>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="font-bold text-cyan-200 text-xs">🎲 Dice Style</span>
                        <div className="grid grid-cols-2 gap-1">
                            {DICE_STYLE_LIST.map((ds) => (
                                <Chip
                                    key={ds.id}
                                    active={(s.diceStyle || 'classic') === ds.id}
                                    onClick={() => store.patchSettings({ diceStyle: ds.id })}
                                >
                                    {ds.name}
                                </Chip>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="font-bold text-cyan-200 text-xs">🎤 Microphone</span>
                        <MicrophoneSettingsRow />
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
        'Coloured Path Win: Move your 4 tokens clockwise around the track and onto your coloured home path (or centre home). The first player to get all 4 tokens onto their coloured home path wins immediately!',
        'Two dice are rolled. Tap a die (or tap a glowing token directly) to move. A 6 brings a token out of base.',
        'Unlimited Double 6s (6+6): Rolling 6+6, capturing an opponent, or entering the centre home (Gul) gives you an extra turn with no consecutive limit.',
        'Pair / Stack Protection: Two or more tokens of the same colour on a non-safe square form a protected stack. A capture only succeeds if your tokens on the landing square equal or outnumber the opponent stack (myCount >= otherCount).',
        'Lone Token Full-Total Rule: When you only have 1 active token out on the board, it can only enter its coloured home path or centre home using the full combined total of both dice (partial single-die entry is blocked while 2 dice remain), and it may move by the combined sum when legal.',
        'Gul or Pass: Prompts "Gul or Pass?" when a lone active token reaches centre home (56) on the combined dice total, OR when your only 2 active tokens are inside the coloured path and both reach 56 on one die each. Choosing Pass stays on the path and passes the turn.',
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
    const [recording, setRecording] = useState(false);
    const [sendingVoice, setSendingVoice] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [err, setErr] = useState('');
    const [, setNetTick] = useState(0);
    const capRef = useRef<UniversalAudioCapture | null>(null);

    useEffect(() => multiplayerClient.subscribe(() => setNetTick((t) => t + 1)), []);
    useEffect(() => {
        return () => {
            capRef.current?.cancelPendingOrActive();
            capRef.current = null;
        };
    }, []);

    const isMultiplayer = !!multiplayerClient.roomCode;
    const mySeat = multiplayerClient.myPlayerIndex ?? 0;
    const roomPlayer = multiplayerClient.roomState?.players[idx];
    const isMe = isMultiplayer ? idx === mySeat : idx === 0;
    const isMuted = isMultiplayer && multiplayerClient.isSeatMuted(idx);
    const canWhisper = isMultiplayer && !isMe && !!roomPlayer && !roomPlayer.isAI && roomPlayer.connected;
    const nm = (p.name || '').trim() || colorName(lang, idx);

    const recentClips = isMultiplayer
        ? multiplayerClient.chatLog
              .filter(
                  (c) =>
                      c.seatIndex === idx &&
                      (c.kind === 'voice' || c.kind === 'whisper_in') &&
                      !!c.payload,
              )
              .slice(-4)
        : [];

    const sendTextOrPhrase = (t: string, voice = true) => {
        const clean = t.trim();
        if (!clean) return;
        if (isMultiplayer) {
            void multiplayerClient.sendLudoChat(clean);
        } else {
            bus.chat?.(idx, clean, { voice });
        }
    };

    const sendReactionEmoji = (em: string) => {
        if (isMultiplayer) {
            void multiplayerClient.sendReaction(em);
        } else {
            bus.chat?.(idx, em, { voice: false });
        }
    };

    const handleCaptureDone = async (res: AudioCaptureResult) => {
        setRecording(false);
        setElapsedMs(0);
        if (!res.ok || !res.bytes) {
            if (res.errorCode === 'NO_SOUND') setErr('No microphone sound detected');
            else if (res.error && res.errorCode !== 'CANCELLED') setErr(res.error);
            return;
        }
        setErr('');
        if (isMultiplayer) {
            setSendingVoice(true);
            const ack = await multiplayerClient.sendVoiceNote(res.bytes, res.mimeType || 'audio/wav');
            setSendingVoice(false);
            if (!ack.success && ack.error) setErr(ack.error);
        } else {
            sfx.playAudioClip(`local_${Date.now()}`, res.bytes, res.mimeType || 'audio/wav');
            bus.chat?.(idx, '🎤 Voice message', { voice: false });
        }
    };

    const toggleRec = () => {
        if (recording) {
            const cap = capRef.current;
            capRef.current = null;
            if (cap) void cap.stop(false).then((res) => void handleCaptureDone(res));
            return;
        }
        if (sendingVoice) return;
        setErr('');
        const cap = new UniversalAudioCapture({
            maxBytes: 80_000,
            maxMs: 6500,
            onProgress: (ms) => setElapsedMs(ms),
            onAutoStop: (res) => {
                capRef.current = null;
                void handleCaptureDone(res);
            },
        });
        capRef.current = cap;
        setRecording(true);
        setElapsedMs(0);
        void cap.start().then((r) => {
            if (!r.ok) {
                if (capRef.current === cap) capRef.current = null;
                setRecording(false);
                if (r.error && r.error !== 'Recording cancelled') setErr(r.error);
            }
        });
    };

    return (
        <Modal title={`${p.avatar} ${nm}`} onClose={close}>
            <div className="flex items-center justify-between gap-2">
                <div className="font-bold" style={{ color: p.ai ? '#9fb0ff' : '#5dff9a' }}>
                    {p.ai ? 'AI • Playing' : roomPlayer && !roomPlayer.connected ? 'Offline • Grace' : '● Online • Playing'}
                </div>

                {isMultiplayer && !isMe && (
                    <div className="flex items-center gap-1.5">
                        {canWhisper && (
                            <button
                                type="button"
                                onClick={() => {
                                    close();
                                    bus.openWhisperModal?.([idx]);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-purple-500/25 hover:bg-purple-500/40 border border-purple-400/60 text-purple-200 font-black text-xs cursor-pointer"
                            >
                                🤫 Whisper
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => multiplayerClient.toggleSeatMute(idx)}
                            className={`px-2.5 py-1 rounded-lg border font-black text-xs cursor-pointer ${
                                isMuted
                                    ? 'bg-red-950/80 border-red-400 text-red-200'
                                    : 'bg-white/10 border-white/20 text-slate-200'
                            }`}
                        >
                            {isMuted ? '🔇 Muted' : '🔊 Sound On'}
                        </button>
                    </div>
                )}
            </div>

            {recentClips.length > 0 && (
                <div className="mt-2 p-2 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-1">
                    <div className="text-[11px] font-black uppercase text-cyan-300">Recent Voice Clips</div>
                    <div className="flex flex-wrap gap-1.5">
                        {recentClips.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => multiplayerClient.playClipById(c.id)}
                                className="px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-bold cursor-pointer"
                            >
                                {c.kind === 'whisper_in' ? '🤫' : '▶'} {c.duration || 1}s
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-4" style={{ gap: U(8), margin: `${U(12)} 0` }}>
                {REACTIONS.map((r) => (
                    <button key={r} onClick={() => sendReactionEmoji(r)} className="rounded-xl bg-white/10 cursor-pointer" style={{ height: U(56), fontSize: U(30) }}>
                        {r}
                    </button>
                ))}
            </div>
            <div className="flex" style={{ gap: U(8) }}>
                <input
                    value={text}
                    maxLength={isMultiplayer ? 120 : 80}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            sendTextOrPhrase(text);
                            setText('');
                        }
                    }}
                    placeholder="Type a message…"
                    className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 text-white"
                    style={{ padding: U(10), fontSize: U(20) }}
                />
                <button
                    onClick={() => {
                        sendTextOrPhrase(text);
                        setText('');
                    }}
                    className="rounded-xl bg-cyan-400 font-black text-black cursor-pointer"
                    style={{ padding: `0 ${U(18)}`, fontSize: U(24) }}
                >
                    ➔
                </button>
            </div>
            <button
                onClick={toggleRec}
                disabled={sendingVoice}
                className={`w-full rounded-xl font-bold cursor-pointer ${recording ? 'bg-red-500 animate-pulse' : 'bg-white/15'}`}
                style={{ marginTop: U(10), padding: U(10), fontSize: U(20) }}
            >
                {sendingVoice
                    ? '⏳ Sending Voice...'
                    : recording
                    ? `⏹ Tap to send (${(elapsedMs / 1000).toFixed(1)}s / 6.5s)`
                    : '🎤 VOICE MSG (Max 6.5s)'}
            </button>
            {err && <div className="text-red-300 text-xs font-bold" style={{ marginTop: U(6) }}>⚠️ {err}</div>}
            <div className="grid grid-cols-2" style={{ gap: U(6), marginTop: U(10) }}>
                {quickPhrases(lang).map((q) => (
                    <button key={q.text} onClick={() => sendTextOrPhrase(q.text)} className="rounded-lg bg-white/10 text-left cursor-pointer" style={{ padding: U(8), fontSize: U(15) }}>
                        {q.icon} {q.text}
                    </button>
                ))}
            </div>
            <button onClick={close} className="w-full rounded-xl bg-white/20 font-bold cursor-pointer" style={{ marginTop: U(12), padding: U(10), fontSize: U(22) }}>CLOSE</button>
        </Modal>
    );
}

function MicrophoneSettingsRow() {
    const micPermission = useStore((s) => s.micPermission);
    const micDeviceLabel = useStore((s) => s.micDeviceLabel);
    const micError = useStore((s) => s.micError);
    const isGranted = micPermission === 'granted';
    const isChecking = micPermission === 'checking';

    return (
        <div className="rounded-xl bg-white/5 border border-white/10 p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className={`text-[11px] font-extrabold truncate ${isGranted ? 'text-emerald-300' : micPermission === 'denied' ? 'text-red-300' : 'text-amber-200'}`}>
                        {isGranted
                            ? `✓ Connected${micDeviceLabel ? `: ${micDeviceLabel}` : ''}`
                            : isChecking
                            ? '⏳ Requesting permission...'
                            : micPermission === 'denied'
                            ? '⚠️ Microphone Blocked'
                            : micPermission === 'unsupported'
                            ? '⚠️ Mic Unavailable'
                            : '🔔 Permission Needed'}
                    </div>
                </div>
                <button
                    type="button"
                    disabled={isChecking || micPermission === 'unsupported'}
                    onClick={() => void requestMicrophonePermission()}
                    className={`shrink-0 px-2.5 py-1 rounded-lg font-black text-[10px] cursor-pointer transition-all disabled:opacity-50 ${
                        isGranted
                            ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/30'
                            : 'bg-cyan-400 text-slate-950 hover:brightness-110'
                    }`}
                >
                    {isChecking ? 'Checking...' : isGranted ? 'Re-test Mic' : 'Connect Mic'}
                </button>
            </div>
            {micError && (
                <div className="text-[10px] text-amber-300 font-semibold leading-snug">
                    {micError}
                </div>
            )}
        </div>
    );
}

function MicPermissionModal({ onDismiss }: { onDismiss: () => void }) {
    const micPermission = useStore((s) => s.micPermission);
    const micDeviceLabel = useStore((s) => s.micDeviceLabel);
    const micError = useStore((s) => s.micError);
    const isChecking = micPermission === 'checking';
    const isGranted = micPermission === 'granted';
    const isDenied = micPermission === 'denied';

    const handleAllow = async () => {
        const res = await requestMicrophonePermission();
        if (res.ok) {
            multiplayerClient.showToast(`🎤 Microphone connected (${res.deviceLabel || 'Ready'})`, 'info');
            onDismiss();
        }
    };

    const handleSkip = () => {
        store.patch({ micPromptDismissed: true });
        onDismiss();
    };

    return (
        <Modal title="🎤 Connect Microphone" onClose={handleSkip} slim>
            <div className="flex flex-col items-center text-center gap-3 py-1">
                <div
                    className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-3xl shadow-lg ${
                        isGranted
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : isDenied
                            ? 'bg-red-500/20 border-red-400 text-red-300'
                            : 'bg-cyan-500/20 border-cyan-400/70 text-cyan-200'
                    }`}
                >
                    {isGranted ? '✅' : isDenied ? '🔇' : '🎤'}
                </div>

                <div className="space-y-1">
                    <div className="font-black text-sm text-white">
                        {isGranted
                            ? 'Microphone Connected!'
                            : isDenied
                            ? 'Microphone Access Needed'
                            : 'Allow Microphone Before Playing'}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-xs">
                        {isGranted
                            ? `Ready for voice notes and whispers (${micDeviceLabel || 'Connected'}).`
                            : 'Connect your microphone now so you can send voice notes and private whispers cleanly during the match without interruptions.'}
                    </p>
                </div>

                {micError && (
                    <div className="w-full rounded-xl bg-red-950/70 border border-red-400/50 px-3 py-2 text-[11px] font-bold text-red-200 text-left">
                        ⚠️ {micError}
                    </div>
                )}

                <div className="w-full flex flex-col gap-2 pt-1">
                    <button
                        type="button"
                        disabled={isChecking}
                        onClick={() => void handleAllow()}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                        {isChecking ? (
                            <>
                                <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                <span>Connecting Microphone...</span>
                            </>
                        ) : isDenied ? (
                            <span>🔄 Retry Microphone Permission</span>
                        ) : (
                            <span>🎤 Allow & Connect Microphone</span>
                        )}
                    </button>

                    <div className="flex gap-2">
                        {isDenied && (
                            <button
                                type="button"
                                onClick={() => void probeMicrophoneStatus()}
                                className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-cyan-200 font-bold text-xs cursor-pointer"
                            >
                                Re-check
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleSkip}
                            className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 font-bold text-xs cursor-pointer"
                        >
                            Continue Without Mic
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export function Modals() {
    const modal = useStore((s) => s.modal);
    const phase = useStore((s) => s.phase);
    const micPermission = useStore((s) => s.micPermission);
    const micPromptDismissed = useStore((s) => s.micPromptDismissed);

    if (modal === 'mic') return <MicPermissionModal onDismiss={close} />;

    // Ask microphone permission automatically before entering a game if not yet granted/dismissed
    if (
        !modal &&
        phase === 'menu' &&
        !micPromptDismissed &&
        micPermission !== 'unknown' &&
        micPermission !== 'granted' &&
        micPermission !== 'unsupported'
    ) {
        return <MicPermissionModal onDismiss={() => store.patch({ micPromptDismissed: true })} />;
    }

    if (!modal) return null;
    if (modal === 'settings') return <Settings />;
    if (modal === 'music') return <Modal title="🎵 Music" onClose={close}><MusicPicker /></Modal>;
    if (modal === 'howto') return <TutorialModal onClose={close} />;
    const urlRoom = (() => {
        if (typeof window === 'undefined') return null;
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('room') || params.get('invite');
        const clean = raw ? raw.trim().toUpperCase() : '';
        return clean || null;
    })();
    if (modal === 'invite' || modal === 'multiplayer') return <MultiplayerLobbyModal onClose={close} initialRoomCode={urlRoom || undefined} />;
    if (modal === 'tournament') return <Tournament />;
    if (modal.startsWith('wish:')) return <Wish idx={Number(modal.slice(5))} />;
    if (modal.startsWith('profile:')) return <Profile idx={Number(modal.slice(8))} />;
    return null;
}
