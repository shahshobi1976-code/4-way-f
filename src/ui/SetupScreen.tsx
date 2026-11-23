import { store, useStore, DEFAULT_PLAYERS } from '../state/store';
import { createEmptyGrudges } from '../game/rules';
import { LANGS, tr, colorName } from '../i18n';
import { U } from './kit';
import { multiplayerClient } from '../network/multiplayerClient';
import { requestMicrophonePermission } from '../game/audioCapture';
import { AI_PERSONALITIES, getPersonalityForSeat, type AIPersonality } from '../game/banter';

const AVATARS = ['🤴', '👸', '👑', '💎', '🔥', '🏆', '🎩', '🎮', '🌟', '🍀', '🎲'];
const BORDER = ['#e53935', '#43a047', '#fdd835', '#00bcd4'];

export function SetupScreen() {
    const settings = useStore((s) => s.settings);
    const lang = settings.lang;
    const players = useStore((s) => s.players);
    const mode = useStore((s) => s.mode);
    const gender = useStore((s) => s.gender);
    const landscape = useStore((s) => s.landscape);
    const micPermission = useStore((s) => s.micPermission);
    const micDeviceLabel = useStore((s) => s.micDeviceLabel);
    const T = (k: string) => tr(lang, k);
    // 2-player mode: only Green and Cyan sit down
    const seats = mode === 2 ? [1, 3] : [0, 1, 2, 3];

    const micGranted = micPermission === 'granted';
    const micChecking = micPermission === 'checking';
    const connectMic = () => {
        void requestMicrophonePermission().then((res) => {
            if (res.ok) multiplayerClient.showToast(`🎤 Microphone connected`, 'info');
            else if (res.error) multiplayerClient.showToast(res.error, 'warn');
        });
    };

    const setGender = (g: 'male' | 'female') => {
        store.patch({ gender: g });
        players.forEach((p, i) => {
            if (!p.ai) store.patchPlayer(i, { avatar: g === 'male' ? '🤴' : '👸' });
        });
    };

    const start = () => {
        multiplayerClient.leaveRoom();
        const active = mode === 2 ? [false, true, false, true] : [true, true, true, true];
        // make sure at least one human takes a seat: otherwise the first seat becomes human
        if (!seats.some((i) => !players[i].ai)) store.patchPlayer(seats[seats.length - 1], { ai: false });
        store.patch({
            phase: 'playing',
            active,
            gameId: store.get().gameId + 1,
            result: null,
            popup: null,
            modal: null,
            rivalry: null,
            grudges: createEmptyGrudges(),
            rivalryBanner: null,
            localReactions: {},
        });
    };

    const goBackToMainMenu = () => {
        store.patch({ phase: 'menu' });
    };

    if (landscape) {
        /* LANDSCAPE & WEB LAYOUT: Streamlined 2-column layout that fits 100% in one window without scrolling */
        return (
            <div className="menu circuit absolute inset-0 flex flex-col overflow-hidden text-white select-none h-full max-h-full">
                {/* Top Navigation Bar with Return to Main Menu & Start Button */}
                <div className="flex items-center justify-between px-3 sm:px-5 py-1.5 bg-slate-950/85 border-b border-cyan-400/30 backdrop-blur-md shrink-0 z-20">
                    <button
                        type="button"
                        onClick={goBackToMainMenu}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-cyan-300 hover:text-white font-extrabold text-xs transition-colors cursor-pointer active:scale-95"
                        title="Return to Main Menu"
                    >
                        <span>←</span>
                        <span>Main Menu</span>
                    </button>

                    <div className="flex items-center gap-2">
                        <img
                            src="/assets/aistudio/image_745468f3_92e66563.jpg"
                            alt="Logo"
                            className="w-10 h-6 rounded-md object-cover border border-amber-500/50 shadow"
                        />
                        <h1 className="glow-title font-black text-amber-200 text-xs sm:text-sm tracking-wide">
                            {T('setupTitle')} (Pass & Play)
                        </h1>
                    </div>

                    <button
                        type="button"
                        onClick={start}
                        className="px-3.5 py-1 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-black text-xs shadow hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                    >
                        <span>🚀</span>
                        <span>{T('start')}</span>
                    </button>
                </div>

                {/* Main Content Area: 12-col grid that fits within viewport height without any scrolling */}
                <div className="flex-1 p-2 overflow-hidden h-full max-h-[calc(100dvh-40px)]">
                    <div className="mx-auto max-w-5xl grid grid-cols-12 gap-2 h-full items-stretch">
                        {/* Controls Column */}
                        <div className="col-span-4 flex flex-col justify-between bg-slate-900/85 p-2 rounded-xl border border-white/10 backdrop-blur-md h-full overflow-hidden">
                            <div className="flex flex-col gap-1.5">
                                {/* Mode (4P vs 2P) */}
                                <div className="flex items-center justify-between gap-1 bg-slate-950/60 p-1.5 rounded-lg border border-white/5">
                                    <span className="text-[11px] font-bold text-slate-300">👥 Mode:</span>
                                    <div className="flex gap-1">
                                        {([4, 2] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => store.patch({ mode: m })}
                                                className={`px-2.5 py-0.5 rounded text-[11px] font-black transition-all cursor-pointer ${
                                                    mode === m
                                                        ? 'bg-cyan-400 text-black shadow ring-1 ring-cyan-300'
                                                        : 'bg-white/10 text-white hover:bg-white/15'
                                                }`}
                                            >
                                                {m === 4 ? T('four') : T('two')}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Gender / Style */}
                                <div className="flex items-center justify-between gap-1 bg-slate-950/60 p-1.5 rounded-lg border border-white/5">
                                    <span className="text-[11px] font-bold text-slate-300">👑 Style:</span>
                                    <div className="flex gap-1">
                                        {(['male', 'female'] as const).map((g) => (
                                            <button
                                                key={g}
                                                type="button"
                                                onClick={() => setGender(g)}
                                                className={`px-2 py-0.5 rounded text-[11px] font-black transition-all cursor-pointer ${
                                                    gender === g
                                                        ? 'bg-cyan-400 text-black shadow ring-1 ring-cyan-300'
                                                        : 'bg-white/10 text-white hover:bg-white/15'
                                                }`}
                                            >
                                                {g === 'male' ? `🤴 ${T('male')}` : `👸 ${T('female')}`}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Turn Timer Selector */}
                                <div className="flex items-center justify-between gap-1 bg-slate-950/60 p-1.5 rounded-lg border border-white/5">
                                    <span className="text-[11px] font-bold text-slate-300">⏱️ Timer:</span>
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => store.patchSettings({ timerEnabled: false })}
                                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                                                !settings.timerEnabled
                                                    ? 'bg-cyan-400 text-black font-black shadow'
                                                    : 'bg-white/10 text-white/80'
                                            }`}
                                        >
                                            ♾️ Off
                                        </button>
                                        {([60, 90, 120] as const).map((sec) => (
                                            <button
                                                key={sec}
                                                type="button"
                                                onClick={() => store.patchSettings({ timerEnabled: true, timerSec: sec })}
                                                className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                                                    settings.timerEnabled && settings.timerSec === sec
                                                        ? 'bg-cyan-400 text-black font-black shadow'
                                                        : 'bg-white/10 text-white/80'
                                                }`}
                                            >
                                                ⏳ {sec}s
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Language Selector */}
                                <div className="flex items-center justify-between gap-1 bg-slate-950/60 p-1.5 rounded-lg border border-white/5">
                                    <span className="text-[11px] font-bold text-slate-300">🌐 {T('language')}:</span>
                                    <select
                                        value={lang}
                                        onChange={(e) => store.patchSettings({ lang: e.target.value })}
                                        className="rounded border border-cyan-400/50 bg-[#0e1530] text-white px-1.5 py-0.5 text-[11px] font-bold outline-none cursor-pointer"
                                    >
                                        {LANGS.map((l) => (
                                            <option key={l.code} value={l.code}>
                                                {l.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Microphone Permission & Connection */}
                                <div className="flex items-center justify-between gap-1 bg-slate-950/60 p-1.5 rounded-lg border border-white/5">
                                    <span className="text-[11px] font-bold text-slate-300 truncate">
                                        🎤 {micGranted ? (micDeviceLabel || 'Mic Ready') : 'Microphone:'}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={micChecking || micPermission === 'unsupported'}
                                        onClick={connectMic}
                                        className={`px-2 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer shrink-0 ${
                                            micGranted
                                                ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-200'
                                                : micPermission === 'denied'
                                                ? 'bg-red-500/25 border border-red-400/60 text-red-200'
                                                : 'bg-cyan-400 text-slate-950 hover:brightness-110'
                                        }`}
                                    >
                                        {micChecking ? 'Checking...' : micGranted ? '✓ Connected' : micPermission === 'denied' ? 'Retry Mic' : 'Connect Mic'}
                                    </button>
                                </div>
                            </div>

                            {/* Start & Back Controls in left panel */}
                            <div className="flex flex-col gap-1 pt-1.5 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={start}
                                    className="w-full py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 font-black text-slate-950 text-xs tracking-wide uppercase shadow hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                    <span>🚀</span>
                                    <span>{T('start')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={goBackToMainMenu}
                                    className="w-full py-1 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white font-bold text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                >
                                    <span>←</span>
                                    <span>Back to Main Menu</span>
                                </button>
                            </div>
                        </div>

                        {/* Player Setup Cards Column (2x2 Grid) */}
                        <div className="col-span-8 grid grid-cols-2 gap-1.5 h-full overflow-hidden">
                            {seats.map((i) => {
                                const p = players[i];
                                const def = DEFAULT_PLAYERS[i];
                                return (
                                    <div
                                        key={i}
                                        className="rounded-xl bg-slate-950/80 p-2 border flex flex-col justify-between shadow backdrop-blur-md overflow-hidden"
                                        style={{ borderColor: `${BORDER[i]}cc` }}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <div
                                                className="flex shrink-0 items-center justify-center rounded-lg font-bold text-xs w-6 h-6 shadow"
                                                style={{ background: BORDER[i] }}
                                            >
                                                {p.avatar}
                                            </div>
                                            <input
                                                value={p.name}
                                                maxLength={14}
                                                placeholder={colorName(lang, i)}
                                                onChange={(e) => store.patchPlayer(i, { name: e.target.value })}
                                                className="min-w-0 flex-1 rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-bold text-white text-[11px] outline-none placeholder-white/40 focus:border-cyan-400"
                                            />
                                            <label className="flex items-center gap-1 font-bold text-white text-[11px] shrink-0 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={p.ai}
                                                    onChange={(e) =>
                                                        store.patchPlayer(i, {
                                                             ai: e.target.checked,
                                                             wish: e.target.checked ? null : p.wish,
                                                        })
                                                    }
                                                    className="w-3.5 h-3.5 rounded"
                                                />
                                                <span>{T('ai')}</span>
                                            </label>
                                        </div>

                                        {/* Avatar Quick Switch Row */}
                                        <div className="flex gap-1 justify-between my-0.5">
                                            {AVATARS.slice(0, 6).map((a) => (
                                                <button
                                                    key={a}
                                                    type="button"
                                                    onClick={() => store.patchPlayer(i, { avatar: a })}
                                                    className={`w-5 h-5 rounded text-[11px] flex items-center justify-center transition-all cursor-pointer ${
                                                        p.avatar === a ? 'bg-cyan-400 text-black ring-1 ring-cyan-300 font-bold' : 'bg-white/10 hover:bg-white/20'
                                                    }`}
                                                >
                                                    {a}
                                                </button>
                                            ))}
                                        </div>

                                        {!p.ai ? (
                                            <button
                                                type="button"
                                                onClick={() => store.patch({ modal: `wish:${i}` })}
                                                className="py-1 px-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 font-black text-slate-950 text-[10px] shadow hover:brightness-105 active:scale-95 transition-all text-center cursor-pointer truncate"
                                            >
                                                ✨ {T('setWish')} {p.wish ? `(${p.wish[0]}, ${p.wish[1]})` : '(6, 5)'}
                                            </button>
                                        ) : (
                                            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-300 py-0.5">
                                                <span className="truncate italic text-slate-400">🤖 {def.name}</span>
                                                <select
                                                    aria-label={`AI Personality ${def.name}`}
                                                    value={p.personality || getPersonalityForSeat(i)}
                                                    onChange={(e) => store.patchPlayer(i, { personality: e.target.value as AIPersonality })}
                                                    className="rounded border border-cyan-400/40 bg-[#0e1530] text-cyan-200 px-1 py-0.5 text-[10px] font-bold outline-none cursor-pointer"
                                                >
                                                    {AI_PERSONALITIES.map((per) => (
                                                        <option key={per} value={per}>{per}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* VERTICAL (PORTRAIT) CLASSIC STYLE: Fits all in one screen without scrolling, Back button at bottom */
    return (
        <div className="menu circuit absolute inset-0 flex flex-col justify-between p-2 sm:p-2.5 overflow-hidden text-white select-none h-full max-h-full">
            {/* Top Bar Header - Big, bold heading in vertical mobile */}
            <div className="flex items-center justify-between w-full shrink-0 px-2 py-2 border-b border-cyan-400/30 bg-slate-950/60 rounded-xl backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                    <img
                        src="/assets/aistudio/image_745468f3_92e66563.jpg"
                        alt="Logo"
                        className="w-14 h-8 rounded-lg object-cover border-2 border-amber-500/60 shadow-md shadow-amber-950/60"
                    />
                    <div className="flex flex-col justify-center">
                        <h1 className="glow-title font-black text-amber-200 text-base sm:text-xl tracking-tight leading-tight">
                            {T('setupTitle')}
                        </h1>
                        <span className="text-[10px] sm:text-xs font-black text-cyan-400/80 tracking-widest uppercase">
                            Pass & Play Mode
                        </span>
                    </div>
                </div>
                {/* Mode Selector */}
                <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-cyan-400/30 shadow-inner">
                    {([4, 2] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => store.patch({ mode: m })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer transition-all ${
                                mode === m
                                    ? 'bg-gradient-to-r from-cyan-400 to-teal-400 text-black shadow-md'
                                    : 'text-white/70 hover:text-white'
                            }`}
                        >
                            {m === 4 ? T('four') : T('two')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick Settings Bar (Style, Turn Timer, Language) in a neat row */}
            <div className="grid grid-cols-3 gap-1.5 my-1 shrink-0 text-center">
                {/* Gender / Style */}
                <div className="flex items-center justify-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/10">
                    {(['male', 'female'] as const).map((g) => (
                        <button
                            key={g}
                            type="button"
                            onClick={() => setGender(g)}
                            className={`flex-1 py-0.5 px-1 rounded text-[10px] sm:text-xs font-black transition-all cursor-pointer ${
                                gender === g ? 'bg-cyan-400 text-black shadow' : 'text-white/70 hover:bg-white/10'
                            }`}
                        >
                            {g === 'male' ? `🤴 ${T('male')}` : `👸 ${T('female')}`}
                        </button>
                    ))}
                </div>

                {/* Turn Timer */}
                <div className="flex items-center justify-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/10">
                    <span className="text-[10px] text-slate-300 font-bold shrink-0">⏱️</span>
                    <select
                        value={settings.timerEnabled ? settings.timerSec : 0}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v === 0) store.patchSettings({ timerEnabled: false });
                            else store.patchSettings({ timerEnabled: true, timerSec: v as 60 | 90 | 120 });
                        }}
                        className="w-full bg-[#0e1530] border border-cyan-400/30 text-white rounded px-1 py-0.5 text-[10px] sm:text-xs font-bold outline-none cursor-pointer"
                    >
                        <option value={0}>♾️ Timer: Off</option>
                        <option value={60}>⏳ 60s Limit</option>
                        <option value={90}>⏳ 90s Limit</option>
                        <option value={120}>⏳ 120s Limit</option>
                    </select>
                </div>

                {/* Language */}
                <div className="flex items-center justify-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/10">
                    <span className="text-[10px] text-slate-300 font-bold shrink-0">🌐</span>
                    <select
                        value={lang}
                        onChange={(e) => store.patchSettings({ lang: e.target.value })}
                        className="w-full bg-[#0e1530] border border-cyan-400/30 text-white rounded px-1 py-0.5 text-[10px] sm:text-xs font-bold outline-none cursor-pointer"
                    >
                        {LANGS.map((l) => (
                            <option key={l.code} value={l.code}>
                                {l.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Players Setup: 2x2 Grid with Half Size Cards ("make thier size half in verticle") */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 my-auto shrink-0 w-full max-w-[500px] mx-auto">
                {seats.map((i) => {
                    const p = players[i];
                    const def = DEFAULT_PLAYERS[i];
                    return (
                        <div
                            key={i}
                            className="rounded-xl bg-black/75 p-1 sm:p-1.5 border-2 flex flex-col justify-between shadow-md backdrop-blur-sm overflow-hidden h-[86px] sm:h-[94px]"
                            style={{ borderColor: BORDER[i] }}
                        >
                            {/* Player Row: Avatar, Name & AI checkbox */}
                            <div className="flex items-center gap-1">
                                <div
                                    className="flex shrink-0 items-center justify-center rounded-full font-bold text-[11px] sm:text-xs w-5.5 h-5.5 sm:w-6 sm:h-6 shadow"
                                    style={{ background: BORDER[i] }}
                                >
                                    {p.avatar}
                                </div>
                                <input
                                    value={p.name}
                                    maxLength={14}
                                    placeholder={colorName(lang, i)}
                                    onChange={(e) => store.patchPlayer(i, { name: e.target.value })}
                                    className="min-w-0 flex-1 rounded border border-white/20 bg-white/10 px-1 py-0.5 font-bold text-white text-[10px] sm:text-[11px] leading-tight outline-none placeholder-white/40 focus:border-cyan-400"
                                />
                                <label className="flex items-center gap-0.5 font-bold text-white text-[9px] sm:text-[10px] shrink-0 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={p.ai}
                                        onChange={(e) =>
                                            store.patchPlayer(i, {
                                                ai: e.target.checked,
                                                wish: e.target.checked ? null : p.wish,
                                            })
                                        }
                                        className="w-3 h-3 rounded"
                                    />
                                    <span>{T('ai')}</span>
                                </label>
                            </div>

                            {/* Quick Avatar Row */}
                            <div className="flex gap-0.5 justify-between my-0.5">
                                {AVATARS.slice(0, 6).map((a) => (
                                    <button
                                        key={a}
                                        type="button"
                                        onClick={() => store.patchPlayer(i, { avatar: a })}
                                        className={`w-5 h-5 rounded text-[10px] flex items-center justify-center transition-all cursor-pointer ${
                                            p.avatar === a ? 'bg-cyan-400 text-black ring-1 ring-cyan-300 font-bold' : 'bg-white/10 hover:bg-white/20'
                                        }`}
                                    >
                                        {a}
                                    </button>
                                ))}
                            </div>

                            {/* Wish Button or AI status */}
                            {!p.ai ? (
                                <button
                                    type="button"
                                    onClick={() => store.patch({ modal: `wish:${i}` })}
                                    className="w-full py-0.5 px-1 rounded-md bg-gradient-to-r from-amber-400 to-orange-500 font-black text-slate-950 text-[9px] sm:text-[10px] shadow hover:brightness-105 active:scale-95 transition-all text-center cursor-pointer truncate leading-tight"
                                >
                                    ✨ {T('setWish')} {p.wish ? `(${p.wish[0]}, ${p.wish[1]})` : '(6, 5)'}
                                </button>
                            ) : (
                                <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px] text-slate-300 leading-tight">
                                    <span className="truncate italic text-slate-400">🤖 {def.name}</span>
                                    <select
                                        aria-label={`AI Personality ${def.name}`}
                                        value={p.personality || getPersonalityForSeat(i)}
                                        onChange={(e) => store.patchPlayer(i, { personality: e.target.value as AIPersonality })}
                                        className="rounded border border-cyan-400/40 bg-[#0e1530] text-cyan-200 px-1 py-0 text-[9px] font-bold outline-none cursor-pointer shrink-0"
                                    >
                                        {AI_PERSONALITIES.map((per) => (
                                            <option key={per} value={per}>{per}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Bottom Actions: Mic Connection + Start & Back to Main Menu */}
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-cyan-400/20 shrink-0 w-full max-w-[500px] mx-auto">
                <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-slate-950/75 border border-white/10">
                    <span className="text-[11px] font-bold text-slate-200 truncate">
                        🎤 {micGranted ? `Mic Connected (${micDeviceLabel || 'Ready'})` : micPermission === 'denied' ? 'Microphone Blocked' : 'Connect Microphone for Voice'}
                    </span>
                    <button
                        type="button"
                        disabled={micChecking || micPermission === 'unsupported'}
                        onClick={connectMic}
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-black cursor-pointer shrink-0 ${
                            micGranted
                                ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-200'
                                : micPermission === 'denied'
                                ? 'bg-red-500/25 border border-red-400/60 text-red-200'
                                : 'bg-cyan-400 text-slate-950'
                        }`}
                    >
                        {micChecking ? 'Checking...' : micGranted ? '✓ Ready' : micPermission === 'denied' ? 'Retry' : 'Allow Mic'}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={start}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 font-black text-slate-950 text-xs sm:text-sm tracking-wide uppercase shadow-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                    <span>🚀</span>
                    <span>{T('start')}</span>
                </button>
                <button
                    type="button"
                    onClick={goBackToMainMenu}
                    className="w-full py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-extrabold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-white/5 active:scale-95"
                    title="Return to Main Menu"
                >
                    <span>←</span>
                    <span>Back to Main Menu</span>
                </button>
            </div>
        </div>
    );
}
