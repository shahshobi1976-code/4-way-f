import { store, useStore, DEFAULT_PLAYERS } from '../state/store';
import { LANGS, tr, colorName } from '../i18n';
import { U } from './kit';
import thumbnailImg from '../assets/thumbnail.jpg';

const AVATARS = ['🤴', '👸', '👑', '💎', '🔥', '🏆', '🎩', '🎮', '🌟', '🍀', '🎲'];
const BORDER = ['#e53935', '#43a047', '#fdd835', '#00bcd4'];

export function SetupScreen() {
    const settings = useStore((s) => s.settings);
    const lang = settings.lang;
    const players = useStore((s) => s.players);
    const mode = useStore((s) => s.mode);
    const gender = useStore((s) => s.gender);
    const T = (k: string) => tr(lang, k);
    // 2-player mode: only Green and Cyan sit down
    const seats = mode === 2 ? [1, 3] : [0, 1, 2, 3];

    const setGender = (g: 'male' | 'female') => {
        store.patch({ gender: g });
        players.forEach((p, i) => { if (!p.ai) store.patchPlayer(i, { avatar: g === 'male' ? '🤴' : '👸' }); });
    };

    const start = () => {
        const active = mode === 2 ? [false, true, false, true] : [true, true, true, true];
        // make sure at least one human takes a seat: otherwise the first seat becomes human
        if (!seats.some((i) => !players[i].ai)) store.patchPlayer(seats[seats.length - 1], { ai: false });
        store.patch({ phase: 'playing', active, gameId: store.get().gameId + 1, result: null, popup: null, modal: null });
    };

    return (
        <div className="menu circuit absolute inset-0 overflow-y-auto" style={{ padding: `${U(28)} ${U(24)} ${U(130)}` }}>
            {/* Game artwork badge with coordinated #0a0d26 background */}
            <div className="flex justify-center mb-1">
                <div
                    className="game-image-wrap flex items-center justify-center relative border border-cyan-400/40"
                    style={{ width: U(86), height: U(86), borderRadius: U(18) }}
                >
                    <img src={thumbnailImg} alt="Ludo Emperor Artwork" className="w-full h-full object-cover rounded-[inherit]" />
                    <div className="game-image-vignette" />
                </div>
            </div>

            <h1 className="glow-title text-center font-black text-cyan-300" style={{ fontSize: U(38) }}>{T('setupTitle')}</h1>

            <div className="flex items-center justify-center" style={{ gap: U(12), marginTop: U(14) }}>
                {(['male', 'female'] as const).map((g) => (
                    <button key={g} onClick={() => setGender(g)} className={`rounded-xl font-bold ${gender === g ? 'bg-cyan-400 text-black' : 'bg-white/10 text-white'}`} style={{ padding: `${U(8)} ${U(18)}`, fontSize: U(22) }}>
                        {g === 'male' ? `🤴 ${T('male')}` : `👸 ${T('female')}`}
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-center" style={{ gap: U(12), marginTop: U(12) }}>
                <label className="font-semibold text-white/80" style={{ fontSize: U(20) }}>🌐 {T('language')}</label>
                <select
                    value={lang}
                    onChange={(e) => store.patchSettings({ lang: e.target.value })}
                    className="rounded-lg border border-cyan-300/50 bg-[#0e1530] text-white"
                    style={{ padding: `${U(6)} ${U(10)}`, fontSize: U(20) }}
                >
                    {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
            </div>

            <div className="flex justify-center" style={{ gap: U(10), marginTop: U(12) }}>
                {([4, 2] as const).map((m) => (
                    <button key={m} onClick={() => store.patch({ mode: m })} className={`rounded-xl font-bold ${mode === m ? 'bg-cyan-400 text-black' : 'bg-white/10 text-white'}`} style={{ padding: `${U(6)} ${U(16)}`, fontSize: U(20) }}>
                        {m === 4 ? T('four') : T('two')}
                    </button>
                ))}
            </div>

            {/* Turn Timer Selector (Off, 60s, 90s, 120s) */}
            <div className="flex flex-col items-center justify-center" style={{ gap: U(6), marginTop: U(14) }}>
                <div className="flex items-center gap-2 text-white/80 font-bold" style={{ fontSize: U(19) }}>
                    <span>⏱️ Turn Timer:</span>
                    <span className="text-cyan-300 font-extrabold">
                        {settings.timerEnabled ? `⏳ ${settings.timerSec}s Limit` : '♾️ Off (Unlimited)'}
                    </span>
                </div>
                <div className="flex flex-wrap justify-center" style={{ gap: U(8) }}>
                    <button
                        type="button"
                        onClick={() => store.patchSettings({ timerEnabled: false })}
                        className={`rounded-xl font-bold transition-all ${
                            !settings.timerEnabled ? 'bg-cyan-400 text-black shadow-md' : 'bg-white/10 text-white/80 hover:bg-white/20'
                        }`}
                        style={{ padding: `${U(6)} ${U(14)}`, fontSize: U(17) }}
                    >
                        ♾️ Off
                    </button>
                    {([60, 90, 120] as const).map((sec) => (
                        <button
                            key={sec}
                            type="button"
                            onClick={() => store.patchSettings({ timerEnabled: true, timerSec: sec })}
                            className={`rounded-xl font-bold transition-all ${
                                settings.timerEnabled && settings.timerSec === sec
                                    ? 'bg-cyan-400 text-black shadow-md'
                                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                            }`}
                            style={{ padding: `${U(6)} ${U(14)}`, fontSize: U(17) }}
                        >
                            ⏳ {sec}s
                        </button>
                    ))}
                </div>
            </div>

            <div className="mx-auto flex flex-col" style={{ gap: U(14), marginTop: U(20), maxWidth: U(640) }}>
                {seats.map((i) => {
                    const p = players[i];
                    const def = DEFAULT_PLAYERS[i];
                    return (
                        <div key={i} className="rounded-2xl bg-black/55" style={{ border: `2px solid ${BORDER[i]}`, padding: U(14) }}>
                            <div className="flex items-center" style={{ gap: U(12) }}>
                                <div className="flex shrink-0 items-center justify-center rounded-full" style={{ width: U(56), height: U(56), background: BORDER[i], fontSize: U(32) }}>{p.avatar}</div>
                                <input
                                    value={p.name}
                                    maxLength={14}
                                    placeholder={colorName(lang, i)}
                                    onChange={(e) => store.patchPlayer(i, { name: e.target.value })}
                                    className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 font-bold text-white placeholder-white/40"
                                    style={{ padding: `${U(8)} ${U(12)}`, fontSize: U(26) }}
                                />
                                <label className="flex items-center font-bold text-white" style={{ gap: U(8), fontSize: U(22) }}>
                                    <input type="checkbox" checked={p.ai} onChange={(e) => store.patchPlayer(i, { ai: e.target.checked, wish: e.target.checked ? null : p.wish })} style={{ width: U(30), height: U(30) }} />
                                    {T('ai')}
                                </label>
                            </div>
                            <div className="flex flex-wrap" style={{ gap: U(6), marginTop: U(10) }}>
                                {AVATARS.map((a) => (
                                    <button key={a} onClick={() => store.patchPlayer(i, { avatar: a })} className={`rounded-lg ${p.avatar === a ? 'bg-cyan-400/60' : 'bg-white/10'}`} style={{ width: U(46), height: U(46), fontSize: U(26) }}>{a}</button>
                                ))}
                            </div>
                            {!p.ai && (
                                <button
                                    onClick={() => store.patch({ modal: `wish:${i}` })}
                                    className="mt-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 font-black text-black"
                                    style={{ marginTop: U(10), padding: `${U(10)} ${U(16)}`, fontSize: U(22) }}
                                >
                                    {T('setWish')} {p.wish ? `(${p.wish[0]}, ${p.wish[1]})` : '(6, 5)'}
                                </button>
                            )}
                            {p.name.trim() === '' && <div className="text-white/50" style={{ fontSize: U(18), marginTop: U(6) }}>{def.name}</div>}
                        </div>
                    );
                })}
            </div>

            <div className="mx-auto flex flex-col" style={{ gap: U(12), marginTop: U(24), maxWidth: U(640) }}>
                <button onClick={start} className="rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 font-black text-black active:scale-[0.98]" style={{ padding: U(16), fontSize: U(32) }}>{T('start')}</button>
                <button onClick={() => store.patch({ phase: 'menu' })} className="rounded-2xl bg-white/10 font-bold text-white" style={{ padding: U(14), fontSize: U(24) }}>{T('back')}</button>
            </div>
        </div>
    );
}
