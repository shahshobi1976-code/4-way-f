import { useEffect, useState } from 'react';
import { store, useStore } from '../state/store';
import { colorName, tr } from '../i18n';
import { COLORS, createEmptyGrudges } from '../game/rules';
import { multiplayerClient } from '../network/multiplayerClient';
import { CelebrationCanvas } from './CelebrationCanvas';
import { U } from './kit';
import * as sfx from '../game/sfx';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function cleanPlayerName(raw: string): string {
    if (!raw) return '';
    return raw.replace(/\s*#[a-zA-Z0-9_-]+$/, '').trim();
}

export function WinnerOverlay() {
    const result = useStore((s) => s.result);
    const players = useStore((s) => s.players);
    const active = useStore((s) => s.active);
    const progress = useStore((s) => s.progress);
    const lang = useStore((s) => s.settings.lang);
    const [celebrating, setCelebrating] = useState(true);

    const winnerKey = result?.[0]?.idx ?? -1;

    useEffect(() => {
        if (!result || result.length === 0) return;
        setCelebrating(true);
        const timer = window.setTimeout(() => {
            setCelebrating(false);
        }, 3200);
        return () => window.clearTimeout(timer);
    }, [winnerKey, result?.length]);

    if (!result || result.length === 0) return null;

    const isMultiplayer = !!multiplayerClient.roomCode;

    const nm = (i: number) => {
        const raw = (players[i]?.name || '').trim();
        const n = cleanPlayerName(raw);
        return !n || ['red', 'green', 'yellow', 'cyan', 'blue'].includes(n.toLowerCase()) ? colorName(lang, i) : n;
    };

    const handleBackToMenu = () => {
        if (isMultiplayer) multiplayerClient.leaveRoom();
        store.patch({
            phase: 'menu',
            result: null,
            popup: null,
            modal: null,
            rivalry: null,
            grudges: createEmptyGrudges(),
            rivalryBanner: null,
            localReactions: {},
        });
    };

    const handleRematchClick = async () => {
        if (isMultiplayer) {
            await multiplayerClient.voteRematch();
        } else {
            store.patch({
                gameId: store.get().gameId + 1,
                result: null,
                rivalry: null,
                grudges: createEmptyGrudges(),
                rivalryBanner: null,
                localReactions: {},
            });
        }
    };

    // Build all 4 player seats (0..3): active ranked seats first, remaining inactive seats after at 0%
    const seen = new Set(result.map((r) => r.idx));
    const allFourRows = [
        ...result.map((r, rankIdx) => ({
            idx: r.idx,
            pct: rankIdx === 0 ? 100 : Math.max(0, Math.min(100, Math.round(r.pct ?? progress[r.idx] ?? 0))),
            captures: r.captures ?? 0,
            penalties: r.penalties ?? 0,
            isActive: active[r.idx] ?? true,
            rankIdx,
        })),
        ...[0, 1, 2, 3]
            .filter((idx) => !seen.has(idx))
            .map((idx, offset) => ({
                idx,
                pct: 0,
                captures: 0,
                penalties: 0,
                isActive: false,
                rankIdx: result.length + offset,
            })),
    ];

    const winnerIdx = allFourRows[0].idx;
    const medals = ['🥇 1st', '🥈 2nd', '🥉 3rd', '4th'];

    if (celebrating) {
        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-4 select-none"
                role="dialog"
                aria-modal="true"
                aria-label="Winner celebration"
            >
                <CelebrationCanvas />

                <div
                    className="winner-card-enter relative z-10 flex flex-col items-center text-center rounded-3xl border-2 border-amber-400/80 bg-gradient-to-b from-[#151d42]/92 via-[#0b112c]/92 to-[#060817]/92 shadow-[0_0_75px_rgba(245,158,11,0.65)]"
                    style={{ maxWidth: U(480), width: '100%', padding: `${U(26)} ${U(28)}` }}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500/35 via-yellow-400/45 to-amber-500/35 border border-amber-300/75 text-amber-200 font-black text-xs sm:text-sm tracking-widest uppercase mb-3">
                        <span className="winner-sparkle inline-block">✨</span>
                        <span>Victory Celebration</span>
                        <span className="winner-sparkle inline-block">✨</span>
                    </div>

                    <div className="relative my-2 flex items-center justify-center">
                        <span className="winner-sparkle text-3xl sm:text-4xl mr-4 text-amber-300">🌟</span>
                        <div className="relative winner-trophy-float">
                            <div className="text-7xl sm:text-8xl drop-shadow-[0_0_28px_rgba(250,204,21,0.95)]">🏆</div>
                            <div className="absolute -top-2 -right-3 text-3xl">👑</div>
                        </div>
                        <span className="winner-sparkle text-3xl sm:text-4xl ml-4 text-amber-300">🌟</span>
                    </div>

                    <div className="flex items-center justify-center gap-2 mt-2">
                        <span className="text-3xl">{players[winnerIdx]?.avatar || '👑'}</span>
                        <span
                            className="inline-block w-3.5 h-3.5 rounded-full border border-white/60"
                            style={{ backgroundColor: hex(COLORS[winnerIdx]) }}
                        />
                    </div>

                    <div
                        className="winner-title-pop font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 tracking-wide mt-1 drop-shadow-[0_2px_16px_rgba(250,204,21,0.55)]"
                        style={{ fontSize: U(36) }}
                    >
                        {nm(winnerIdx)} Wins!
                    </div>
                    <div className="text-amber-100/85 font-bold text-sm mt-1">
                        🎉 Grand Champion of 4-Way Ludo 🎉
                    </div>

                    <button
                        type="button"
                        onClick={() => setCelebrating(false)}
                        className="mt-5 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-110 active:scale-[0.98] text-slate-950 font-black text-sm shadow-[0_0_20px_rgba(251,191,36,0.45)] transition-all cursor-pointer"
                    >
                        View Rankings →
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md overflow-y-auto p-4 select-none"
            role="dialog"
            aria-modal="true"
            aria-label="Winner rankings modal"
        >
            {/* Fireworks & confetti particle background */}
            <CelebrationCanvas />

            <div
                className="winner-card-enter relative z-10 w-full rounded-3xl border-3 border-amber-400/85 bg-gradient-to-b from-[#141b3d]/98 via-[#0c122e]/98 to-[#060817]/98 text-center shadow-[0_0_65px_rgba(245,158,11,0.55)] overflow-hidden"
                style={{ maxWidth: U(600), padding: `${U(20)} ${U(24)}` }}
            >
                {/* Rotating CSS-transform radial sunburst behind Winner banner */}
                <div
                    className="winner-sunburst pointer-events-none absolute top-[110px] left-1/2 w-[420px] h-[420px] rounded-full opacity-20"
                    style={{
                        background:
                            'repeating-conic-gradient(from 0deg, rgba(251, 191, 36, 0.55) 0deg 12deg, transparent 12deg 24deg)',
                        maskImage: 'radial-gradient(circle, black 10%, transparent 68%)',
                        WebkitMaskImage: 'radial-gradient(circle, black 10%, transparent 68%)',
                    }}
                />

                {/* Top "Winner Rankings" Ribbon */}
                <div className="relative inline-flex items-center gap-2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500/30 via-yellow-400/45 to-amber-500/30 border border-amber-300/70 text-amber-200 font-black text-xs sm:text-sm tracking-widest uppercase mb-2 shadow-[0_0_18px_rgba(245,158,11,0.35)]">
                    <span className="winner-sparkle inline-block">🏆</span>
                    <span>Winner Rankings</span>
                    <span className="winner-sparkle inline-block">👑</span>
                </div>

                {/* Champion Headline */}
                <div
                    className="winner-title-pop relative font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 tracking-wide drop-shadow-[0_2px_14px_rgba(250,204,21,0.5)]"
                    style={{ fontSize: U(30) }}
                >
                    👑 {nm(winnerIdx)} — Champion!
                </div>
                <div className="relative text-amber-100/80 font-bold text-xs sm:text-sm tracking-wide mt-0.5">
                    Final Match Standings, Captures &amp; Penalties
                </div>

                {/* All Four Players Winner Rankings Leaderboard */}
                <div className="relative flex flex-col gap-2.5 my-4">
                    {allFourRows.map((r, k) => {
                        const isWinner = k === 0;
                        return (
                            <div
                                key={r.idx}
                                className={`flex items-center justify-between gap-2 rounded-2xl border transition-transform duration-300 ${
                                    isWinner
                                        ? 'bg-gradient-to-r from-amber-500/25 via-yellow-500/15 to-transparent border-amber-400/75 shadow-[0_0_18px_rgba(245,158,11,0.35)] scale-[1.01]'
                                        : r.isActive
                                        ? 'bg-white/5 border-white/10'
                                        : 'bg-white/[0.02] border-white/5 opacity-60'
                                }`}
                                style={{
                                    padding: `${U(10)} ${U(14)}`,
                                    borderLeftWidth: U(6),
                                    borderLeftColor: hex(COLORS[r.idx]),
                                }}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className={`font-black shrink-0 ${isWinner ? 'text-amber-300 text-base sm:text-lg' : 'text-slate-300 text-sm sm:text-base'}`}>
                                        {medals[k] || `${k + 1}th`}
                                    </span>
                                    <span className="text-2xl shrink-0">{players[r.idx]?.avatar || '👤'}</span>
                                    <div className="text-left min-w-0">
                                        <div className="font-black text-white text-sm sm:text-base truncate flex items-center gap-1.5">
                                            <span>{nm(r.idx)}</span>
                                            {isWinner && <span className="text-amber-400 text-xs">👑 Champion</span>}
                                            {!r.isActive && <span className="text-slate-400 text-xs font-semibold">(Inactive)</span>}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-white/70 font-semibold mt-0.5">
                                            <span>{colorName(lang, r.idx)}</span>
                                            {r.isActive && (
                                                <>
                                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 font-bold" title="Captures made">
                                                        ⚔️ {r.captures}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-400/30 text-rose-300 font-bold" title="Capture penalties">
                                                        ⚠️ {r.penalties}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2.5 shrink-0">
                                    <div className="w-20 sm:w-28 h-3 rounded-full bg-black/60 overflow-hidden border border-white/20">
                                        <div
                                            className="h-full rounded-full transition-[width] duration-700 ease-out"
                                            style={{
                                                width: `${r.pct}%`,
                                                backgroundColor: hex(COLORS[r.idx]),
                                            }}
                                        />
                                    </div>
                                    <span
                                        className={`font-black font-mono text-sm sm:text-base w-11 text-right ${
                                            isWinner ? 'text-amber-300 font-extrabold' : 'text-white/90'
                                        }`}
                                    >
                                        {r.pct}%
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Action Buttons: Back to Menu, Play Again, Celebration Burst */}
                <div className="relative flex flex-col sm:flex-row gap-2.5 mt-4">
                    <button
                        type="button"
                        onClick={handleBackToMenu}
                        className="flex-1 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 active:scale-[0.98] text-white font-black shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all cursor-pointer flex items-center justify-center gap-2"
                        style={{ padding: U(12), fontSize: U(17) }}
                    >
                        <span>🏠</span>
                        <span>Back to Menu</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleRematchClick}
                        className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 font-black text-slate-950 shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                        style={{ padding: U(12), fontSize: U(17) }}
                    >
                        <span>🔄</span>
                        <span>{isMultiplayer ? 'Play Again (Rematch)' : tr(lang, 'again')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('launch-jashan'));
                            sfx.fanfare();
                        }}
                        className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 font-black text-slate-950 shadow-md active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 px-4"
                        style={{ padding: U(12), fontSize: U(17) }}
                        title="Launch more celebration fireworks!"
                    >
                        <span>🎊</span>
                        <span>Celebrate!</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

