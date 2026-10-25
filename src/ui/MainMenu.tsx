import { store, useStore } from '../state/store';
import { tr } from '../i18n';
import { U } from './kit';

export function MainMenu() {
    const lang = useStore((s) => s.settings.lang);
    const mode = useStore((s) => s.mode);
    const landscape = useStore((s) => s.landscape);
    const T = (k: string) => tr(lang, k);

    const items: { label: string; sub: string; on: () => void }[] = [
        { label: T('pass'), sub: T('passD'), on: () => store.patch({ phase: 'setup' }) },
        { label: T('tour'), sub: T('tourD'), on: () => store.patch({ modal: 'tournament' }) },
        { label: T('invite'), sub: T('inviteD'), on: () => store.patch({ modal: 'invite' }) },
        { label: T('how'), sub: T('howD'), on: () => store.patch({ modal: 'howto' }) },
        { label: T('settings'), sub: T('settingsD'), on: () => store.patch({ modal: 'settings' }) },
    ];

    if (landscape) {
        /* LANDSCAPE MOBILE & WEB SCREEN ADJUSTMENT: Fits perfectly without crawling */
        return (
            <div className="menu circuit absolute inset-0 flex items-center justify-center p-3 sm:p-6 overflow-hidden select-none">
                <div className="w-full max-w-5xl h-full max-h-[96dvh] grid grid-cols-12 gap-3 sm:gap-6 items-center">
                    {/* Left Column: Branding, Thumbnail, Title & Mode */}
                    <div className="col-span-5 flex flex-col items-center justify-between text-center p-2.5 sm:p-3 bg-slate-950/60 rounded-2xl border border-cyan-400/30 backdrop-blur-md h-full max-h-[92dvh] overflow-hidden">
                        <div
                            className="flex items-center justify-center relative mb-2 shrink-0 w-full max-w-[190px] aspect-[16/9] rounded-xl overflow-hidden border border-amber-500/50 shadow-lg shadow-amber-950/60"
                        >
                            <img
                                src="/assets/aistudio/image_745468f3_92e66563.jpg"
                                alt="Ludo Dethroned Logo"
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <h1 className="glow-title font-black leading-none text-amber-300 text-xl sm:text-2xl tracking-tight">
                            LUDO DETHRONED
                        </h1>
                        <div className="font-black tracking-[0.3em] text-cyan-300 text-[11px] sm:text-xs mt-0.5">
                            3D • 4 WAY
                        </div>

                        <div className="font-semibold text-cyan-100/90 text-[10px] sm:text-xs mt-0.5 line-clamp-1">
                            {T('subtitle')}
                        </div>
                        <div className="font-black text-red-500 text-[10px] sm:text-xs mt-0.5 line-clamp-1" style={{ textShadow: '0 0 10px rgba(255,40,40,0.8)' }}>
                            {T('tagline')}
                        </div>

                        {/* Mode Selector */}
                        <div className="flex gap-2 mt-1.5">
                            {([4, 2] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => store.patch({ mode: m })}
                                    className={`px-3 py-0.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                        mode === m ? 'bg-cyan-400 text-black shadow ring-1 ring-cyan-300 font-black' : 'bg-white/10 text-white hover:bg-white/15'
                                    }`}
                                >
                                    {m === 4 ? T('four') : T('two')}
                                </button>
                            ))}
                        </div>

                        {/* Feature Badges */}
                        <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                            {[`🎲🎲 ${T('badge2')}`, `👥 ${T('badge4')}`, `✨7 ${T('badge7')}`].map((b) => (
                                <span
                                    key={b}
                                    className="rounded-full border border-cyan-300/40 bg-cyan-400/10 font-bold text-cyan-200 text-[9px] px-2 py-0.5"
                                >
                                    {b}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Right Column: Menu Navigation Items (No Icons, Clean & Responsive) */}
                    <div className="col-span-7 flex flex-col justify-evenly gap-1.5 h-full max-h-[92dvh] overflow-hidden pr-0.5">
                        {items.map((it) => (
                            <button
                                key={it.label}
                                type="button"
                                onClick={it.on}
                                className="flex items-center justify-between rounded-xl border border-cyan-300/30 bg-black/65 hover:bg-slate-900/80 hover:border-cyan-400/60 px-4 py-2 sm:py-2.5 text-left backdrop-blur transition-all active:scale-[0.98] shadow cursor-pointer group"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="font-black tracking-wide text-white group-hover:text-cyan-200 text-xs sm:text-sm truncate">
                                        {it.label}
                                    </div>
                                    <div className="text-white/60 text-[10px] sm:text-xs truncate">
                                        {it.sub}
                                    </div>
                                </div>
                                <span className="text-cyan-400 font-bold text-xs opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-3">
                                    →
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    /* PORTRAIT PHONE / VERTICAL SCREEN: Fits all elements cleanly in one screen without scrolling, zero wide gaps */
    return (
        <div className="menu circuit absolute inset-0 flex flex-col justify-between p-2.5 sm:p-4 overflow-hidden select-none h-full max-h-full">
            {/* Top Branding Section */}
            <div className="flex flex-col items-center text-center shrink-0 pt-1">
                <div className="flex flex-col items-center text-center gap-1.5">
                    <div className="flex items-center justify-center relative shrink-0 w-full max-w-[230px] aspect-[16/9] rounded-2xl overflow-hidden border-2 border-amber-500/60 shadow-xl shadow-amber-950/70">
                        <img
                            src="/assets/aistudio/image_745468f3_92e66563.jpg"
                            alt="Ludo Dethroned Logo"
                            className="w-full h-full object-cover"
                        />
                    </div>

                    <div className="text-center">
                        <h1 className="glow-title font-black leading-none text-amber-300 text-2xl sm:text-3xl tracking-tight">
                            LUDO DETHRONED
                        </h1>
                        <div className="font-black tracking-[0.28em] text-cyan-300 text-xs mt-1">
                            3D • 4 WAY
                        </div>
                    </div>
                </div>

                <div className="font-semibold text-cyan-100/90 text-xs mt-1.5 line-clamp-1">
                    {T('subtitle')}
                </div>
                <div
                    className="font-black text-[10px] sm:text-xs mt-0.5 line-clamp-1"
                    style={{ color: '#ed74de', textShadow: '0 0 10px rgba(237,116,222,0.8)' }}
                >
                    {T('tagline')}
                </div>

                {/* Mode Selector & Badges Row */}
                <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                    <div className="flex gap-1 bg-slate-950/70 p-0.5 rounded-xl border border-white/10 shadow-inner">
                        {([4, 2] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => store.patch({ mode: m })}
                                className={`px-2.5 py-1 rounded-lg font-black text-xs transition-all cursor-pointer ${
                                    mode === m
                                        ? 'bg-cyan-400 text-black shadow ring-1 ring-cyan-300'
                                        : 'text-white/70 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                {m === 4 ? T('four') : T('two')}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-1">
                        {[`🎲🎲 ${T('badge2')}`, `👥 ${T('badge4')}`, `✨7 ${T('badge7')}`].map((b) => (
                            <span
                                key={b}
                                className="rounded-full border border-cyan-300/40 bg-cyan-400/10 font-bold text-cyan-200 text-[9px] px-2 py-0.5"
                            >
                                {b}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Menu Items: Space removed between them, tightly grouped and centered, NO icons */}
            <div className="flex-1 flex flex-col justify-center gap-1 sm:gap-1.5 my-auto w-full max-w-[430px] mx-auto min-h-0">
                {items.map((it) => (
                    <button
                        key={it.label}
                        type="button"
                        onClick={it.on}
                        className="flex items-center justify-between rounded-xl border border-cyan-300/30 bg-black/75 hover:bg-slate-900/90 hover:border-cyan-400/60 px-4 py-2 text-left backdrop-blur transition-all active:scale-[0.98] shadow cursor-pointer group"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="font-black tracking-wide text-white group-hover:text-cyan-200 text-xs sm:text-sm truncate">
                                {it.label}
                            </div>
                            <div className="text-white/60 text-[10px] sm:text-xs truncate">
                                {it.sub}
                            </div>
                        </div>
                        <span className="text-cyan-400 font-bold text-xs opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-3">
                            →
                        </span>
                    </button>
                ))}
            </div>

            {/* Bottom subtle status line */}
            <div className="text-center text-[10px] text-white/40 pb-0.5 shrink-0">
                Ludo Dethroned 3D • Ready to Play
            </div>
        </div>
    );
}
