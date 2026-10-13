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
    return (
        <Modal title="⚙️ Settings" onClose={close}>
            <Toggle on={s.rotate} onChange={(v) => store.patchSettings({ rotate: v })} label="Rotate board to current player" />
            <div className="rounded-xl bg-white/5" style={{ padding: `${U(12)} ${U(16)}`, marginBottom: U(10) }}>
                <div className="flex justify-between font-semibold"><span>Camera tilt</span><span>{s.tilt}°</span></div>
                <input type="range" min={20} max={90} value={s.tilt} onChange={(e) => store.patchSettings({ tilt: Number(e.target.value) })} className="w-full" />
                <div className="flex justify-between text-white/50" style={{ fontSize: U(16) }}><span>low angle</span><span>top view</span></div>
            </div>
            <Toggle on={s.sound} onChange={(v) => store.patchSettings({ sound: v })} label="🔊 Sound effects & voices" />
            <div className="font-bold text-cyan-200" style={{ margin: `${U(14)} 0 ${U(8)}` }}>🌐 Language</div>
            <select value={s.lang} onChange={(e) => store.patchSettings({ lang: e.target.value })} className="w-full rounded-lg border border-cyan-300/50 bg-[#0e1530] text-white" style={{ padding: U(10), fontSize: U(22) }}>
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <div className="font-bold text-cyan-200" style={{ margin: `${U(14)} 0 ${U(8)}` }}>Background</div>
            <div className="grid grid-cols-2" style={{ gap: U(8) }}>
                {BG_NAMES.map((n, i) => <Chip key={n} active={s.bg === i} onClick={() => store.patchSettings({ bg: i })}>{n}</Chip>)}
            </div>
            <div className="font-bold text-cyan-200" style={{ margin: `${U(14)} 0 ${U(8)}` }}>Music</div>
            <MusicPicker />
            {phase === 'playing' && (
                <button onClick={() => { stopMusic(); store.patch({ modal: null, phase: 'menu', result: null, popup: null }); }} className="w-full rounded-xl bg-red-500/20 font-bold text-red-200" style={{ marginTop: U(16), padding: U(12), fontSize: U(24) }}>← Main menu</button>
            )}
        </Modal>
    );
}

function HowTo() {
    const rules = [
        'Two dice are rolled. Each die is its own move: tap a die to choose it, then tap a glowing token.',
        'You need a 6 on a die to bring a token out of the yard.',
        'A double 6, a capture or getting a token home gives you another turn. Double 6s have no limit — keep rolling them.',
        'Lucky Seven: when none of your tokens is on the main track (all in base, home or on your coloured path), a roll of 1+6, 2+5 or 3+4 counts as 6+6.',
        'You need an exact roll to reach home. Start squares and star squares are safe.',
        'Win: get all four tokens onto your coloured path or home, in any mix. 2nd to 4th place follow the progress bar percentages.',
        'Penalty: if you could capture with a die but move another token, the token that could have captured goes back to base.',
        'Computer players gang up on whoever is winning, so do not let the winner win the game!',
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
        <Modal title={`🏆 ${tr(lang, 'tour')}`} onClose={close}>
            <p className="text-center font-black text-amber-300" style={{ fontSize: U(40), padding: U(20) }}>{tr(lang, 'soon')}</p>
        </Modal>
    );
}

function Invite() {
    const code = useRef(Math.random().toString(36).slice(2, 8).toUpperCase()).current;
    const link = `${location.origin}${location.pathname}?room=${code}`;
    const [copied, setCopied] = useState(false);
    const players = useStore((s) => s.players);
    const start = () => {
        // no online rooms yet: empty seats are filled by the computer, you play Cyan
        [0, 1, 2].forEach((i) => store.patchPlayer(i, { ai: true, wish: null }));
        store.patchPlayer(3, { ai: false });
        store.patch({ modal: null, mode: 4, phase: 'playing', active: [true, true, true, true], gameId: store.get().gameId + 1, result: null });
    };
    return (
        <Modal title="🌐 Invite friends" onClose={close}>
            <div className="text-center text-white/70">Room code</div>
            <div className="text-center font-black tracking-[0.3em] text-cyan-300" style={{ fontSize: U(56) }}>{code}</div>
            <div className="break-all rounded-xl bg-white/5 text-cyan-100" style={{ padding: U(10), fontSize: U(18) }}>{link}</div>
            <div className="flex" style={{ gap: U(10), marginTop: U(12) }}>
                <button className="flex-1 rounded-xl bg-cyan-400 font-bold text-black" style={{ padding: U(12) }} onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {}); }}>{copied ? 'Copied ✓' : 'Copy'}</button>
                <button className="flex-1 rounded-xl bg-white/15 font-bold" style={{ padding: U(12) }} onClick={() => { if (navigator.share) void navigator.share({ title: 'Ludo Emperor', text: `Join my Ludo room ${code}`, url: link }).catch(() => {}); }}>Share</button>
            </div>
            <div className="grid grid-cols-2" style={{ gap: U(8), marginTop: U(16) }}>
                {[3, 0, 1, 2].map((c, k) => (
                    <div key={c} className="rounded-xl bg-white/5 text-center" style={{ padding: U(10), borderBottom: `${U(4)} solid ${['#e53935', '#43a047', '#fdd835', '#00bcd4'][c]}` }}>
                        {k === 0 ? `${players[3].avatar} You` : '⏳ Waiting…'}
                    </div>
                ))}
            </div>
            <button onClick={start} className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 font-black text-black" style={{ marginTop: U(16), padding: U(14), fontSize: U(26) }}>Start game</button>
            <p className="text-white/50" style={{ fontSize: U(16), marginTop: U(8) }}>Live multiplayer rooms need an online room service, which is not built yet: empty seats are played by the computer.</p>
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
    if (modal === 'howto') return <HowTo />;
    if (modal === 'invite' || modal === 'multiplayer') return <MultiplayerLobbyModal onClose={close} />;
    if (modal === 'tournament') return <Tournament />;
    if (modal.startsWith('wish:')) return <Wish idx={Number(modal.slice(5))} />;
    if (modal.startsWith('profile:')) return <Profile idx={Number(modal.slice(8))} />;
    return null;
}
