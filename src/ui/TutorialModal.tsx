import { useState, useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { tr } from '../i18n';
import { TUTORIAL_TRANSLATIONS, type TutorialCardKey } from './tutorialTranslations';

export interface GuideCard {
    part: 'walkthrough' | 'rules';
    stepNumber?: number;
    guideNumber?: number;
    icon: string;
    badge: string;
    title: string;
    content: string;
    bullets?: string[];
    accentColor: string;
}

export function buildHowToPlayCards(lang = 'en'): GuideCard[] {
    const loc = TUTORIAL_TRANSLATIONS[lang] || {};
    const applyLoc = (key: TutorialCardKey, card: GuideCard): GuideCard => {
        const t = loc[key];
        if (!t) return card;
        return {
            ...card,
            badge: t.badge || card.badge,
            title: t.title || card.title,
            content: t.content || card.content,
            bullets: t.bullets && t.bullets.length > 0 ? t.bullets : card.bullets,
        };
    };

    return [
        // ----------------------------------------------------
        // PART 1: 5 Step-by-Step Walkthrough Cards (Step 1 to Step 5)
        // ----------------------------------------------------
        applyLoc('w1', {
            part: 'walkthrough',
            stepNumber: 1,
            icon: '⚡',
            badge: 'STEP 1 OF 5 • QUICK SUMMARY',
            title: 'STEP 1 — The Game in 30 Seconds',
            content:
                'Play in 4-Way or 2-Way mode with 4 tokens and 2 dice per player. A single 6 brings a token out of base. Rolling double 6 (6+6) awards an extra turn with no consecutive limit. Capturing on the open track awards a reroll and is compulsory (1 required if a total/pair option exists, else the max independent single-die captures; failing sends every non-capturing option token to base). Star squares, home paths, and equal/larger stacks are protected. First player to get all 4 tokens onto their coloured home path wins immediately!',
            accentColor: '#00f0ff',
        }),
        applyLoc('w2', {
            part: 'walkthrough',
            stepNumber: 2,
            icon: '⚙️',
            badge: 'STEP 2 OF 5 • MATCH PREPARATION',
            title: 'STEP 2 — Before the Match',
            content:
                'Before the match begins, choose your Lucky Wish numbers (any two dice numbers except 6 and 6) to use once per match. The room host also sets the optional turn timer (60s, 90s, 120s, or Off). Ensure your audio and board preferences are ready before hitting start.',
            accentColor: '#38bdf8',
        }),
        applyLoc('w3', {
            part: 'walkthrough',
            stepNumber: 3,
            icon: '🔄',
            badge: 'STEP 3 OF 5 • TURN SEQUENCE',
            title: 'STEP 3 — Your Turn, Step by Step',
            content:
                'Follow these 6 steps on every turn:',
            bullets: [
                '1. Roll both dice on your turn.',
                '2. Check for captures first—capturing on non-safe open squares is compulsory.',
                '3. Split dice across two tokens, or move a lone active token by the combined sum of both dice.',
                '4. Landing on Centre (56) prompts "Gul or Pass?" to enter for an extra turn or pass.',
                '5. Earn an extra turn on unlimited 6+6, capture, entering Gul, or Lucky 7.',
                '6. Otherwise, play passes clockwise to the next player.',
            ],
            accentColor: '#a855f7',
        }),
        applyLoc('w4', {
            part: 'walkthrough',
            stepNumber: 4,
            icon: '🎯',
            badge: 'STEP 4 OF 5 • EXAMPLE TURNS',
            title: 'STEP 4 — Four Example Turns',
            content:
                'See how real game situations play out:',
            bullets: [
                '• Capture & Reroll: Roll 5 and 2, take a capture on an open square, send the opponent back to base, and get an extra turn.',
                '• Lone Token Full-Total: With 1 active token near your coloured path and 2 dice left, enter using the full combined sum of both dice.',
                '• Lucky 7 Bonus: With 0 tokens on the open track and at least 1 token in base, rolling 4 + 3 = 7 converts into 6 + 6 with an extra turn.',
                '• Exit Base: Roll 6 and 2, bring a token out with 6, move 2 spaces, then play passes clockwise.',
            ],
            accentColor: '#f59e0b',
        }),
        applyLoc('w5', {
            part: 'walkthrough',
            stepNumber: 5,
            icon: '✅',
            badge: 'STEP 5 OF 5 • FIRST-MATCH CHECKLIST',
            title: 'STEP 5 — First-Match Checklist',
            content:
                'Keep these 5 key tactical rules in mind during play:',
            bullets: [
                '✓ Locate your base, coloured home path, and star safe squares.',
                '✓ Always inspect the board for compulsory captures (your first 3 matches show a confirmation warning if you skip one).',
                '✓ Stack tokens of the same colour on a square—a single opponent token cannot capture a stack of 2+.',
                '✓ Use star squares for sanctuary when opponents close in.',
                '✓ Watch rival progress bars and stop the leader from getting all 4 tokens onto their coloured home path!',
            ],
            accentColor: '#10b981',
        }),

        // ----------------------------------------------------
        // PART 2: 13 Play Guide Cards (Guide 1 to Guide 13)
        // ----------------------------------------------------
        applyLoc('g1', {
            part: 'rules',
            guideNumber: 1,
            icon: '🏆',
            badge: 'GUIDE 1 OF 13 • THE GOAL',
            title: 'GUIDE 1 — The Goal (Coloured Path Win)',
            content:
                'Move all four of your tokens clockwise around the track and onto your coloured home path (or into the centre home). The first player to get all 4 tokens onto their coloured home path wins immediately!',
            accentColor: '#10b981',
        }),
        applyLoc('g2', {
            part: 'rules',
            guideNumber: 2,
            icon: '🎲🎲',
            badge: 'GUIDE 2 OF 13 • TWO DICE & LONE TOKEN',
            title: 'GUIDE 2 — Two Dice & Lone Token Sum',
            content:
                'Roll two dice each turn and use them across two tokens or together. When you have only 1 active token out on the board, it may move by the combined sum of both dice and can only enter your coloured home path or centre home using the full combined total while 2 dice remain.',
            accentColor: '#00f0ff',
        }),
        applyLoc('g3', {
            part: 'rules',
            guideNumber: 3,
            icon: '🎲',
            badge: 'GUIDE 3 OF 13 • UNLIMITED SIXES',
            title: 'GUIDE 3 — Sixes & Unlimited Double 6s',
            content:
                'A single 6 brings one token out of base onto your start square. Rolling a double 6 (6 and 6) awards an extra turn—with no consecutive limit! A single 6 does not award an extra turn.',
            accentColor: '#eab308',
        }),
        applyLoc('g4', {
            part: 'rules',
            guideNumber: 4,
            icon: '⚔️',
            badge: 'GUIDE 4 OF 13 • CAPTURING & REROLL',
            title: 'GUIDE 4 — Capturing and the Reroll',
            content:
                'Landing on a non-safe open square captures opponent tokens there when your tokens on that square equal or outnumber theirs (myCount >= otherCount). Every capture sends opponents back to base and grants you an extra turn.',
            accentColor: '#f43f5e',
        }),
        applyLoc('g5', {
            part: 'rules',
            guideNumber: 5,
            icon: '⭐',
            badge: 'GUIDE 5 OF 13 • SAFE PLACES',
            title: 'GUIDE 5 — Safe Places',
            content:
                'A token cannot be captured when it is on a start square, on a star square, on its coloured home path, or in base. Star squares are safe for every player on the board.',
            accentColor: '#ffd84a',
        }),
        {
            part: 'rules',
            guideNumber: 6,
            icon: '🛡️',
            badge: tr(lang, 'guideDoubleBadge'),
            title: tr(lang, 'guideDoubleTitle'),
            content: tr(lang, 'guideDoubleContent'),
            accentColor: '#38bdf8',
        },
        {
            part: 'rules',
            guideNumber: 7,
            icon: '🤝',
            badge: tr(lang, 'guideSacrificeBadge'),
            title: tr(lang, 'guideSacrificeTitle'),
            content: tr(lang, 'guideSacrificeContent'),
            accentColor: '#fb7185',
        },
        applyLoc('g8', {
            part: 'rules',
            guideNumber: 8,
            icon: '⚠️',
            badge: 'GUIDE 8 OF 13 • MISSED CAPTURE PENALTY',
            title: 'GUIDE 8 — Compulsory Capture Penalty',
            content:
                'Capturing on non-safe open squares is compulsory. Options include single-die captures, 2-die total captures (final square only), and 2-token pair captures. If a total or pair option exists, 1 capture is required; otherwise you must achieve the most independent single-die captures possible (each die used once). If captures made < required after your move, every token that had an option and did not capture goes back to base. You can adjust Capture Warning mode in Settings.',
            accentColor: '#ef4444',
        }),
        applyLoc('g9', {
            part: 'rules',
            guideNumber: 9,
            icon: '👑',
            badge: 'GUIDE 9 OF 13 • GUL OR PASS?',
            title: 'GUIDE 9 — Centre Home (Gul or Pass?)',
            content:
                'Reaching the centre home (Gul) requires an exact roll (or the full combined total for a lone active token). When your move reaches the centre, a "Gul or Pass?" prompt lets you enter for an extra turn or pass to stay on the path.',
            accentColor: '#ec4899',
        }),
        applyLoc('g10', {
            part: 'rules',
            guideNumber: 10,
            icon: '✨7',
            badge: 'GUIDE 10 OF 13 • LUCKY 7',
            title: 'GUIDE 10 — Lucky 7',
            content:
                'When zero tokens are on the open track AND at least 1 token is still in base (1–4 in base, remaining tokens on the coloured home path or in centre home), rolling 1+6, 2+5, or 3+4 converts to 6+6 with an extra turn.',
            accentColor: '#ffd84a',
        }),
        applyLoc('g11', {
            part: 'rules',
            guideNumber: 11,
            icon: '🌟',
            badge: 'GUIDE 11 OF 13 • LUCKY WISH',
            title: 'GUIDE 11 — Lucky Wish',
            content:
                'Before the match, choose two dice numbers (6 and 6 is not allowed). Once per match on any turn, tap the Golden Star to roll those exact two numbers instead of a random roll.',
            accentColor: '#f59e0b',
        }),
        applyLoc('g12', {
            part: 'rules',
            guideNumber: 12,
            icon: '⏳',
            badge: 'GUIDE 12 OF 13 • TURN TIMER',
            title: 'GUIDE 12 — Optional Turn Timer',
            content:
                'Choose an optional turn timer before play: 60s, 90s, 120s, or Off. When the timer is active and reaches 0, the game automatically plays the turn to keep the match moving.',
            accentColor: '#a855f7',
        }),
        applyLoc('g13', {
            part: 'rules',
            guideNumber: 13,
            icon: '🏁',
            badge: 'GUIDE 13 OF 13 • HOW MATCH ENDS',
            title: 'GUIDE 13 — How the Match Ends',
            content:
                'The match ends immediately as soon as one player gets all 4 tokens onto their coloured home path (or centre home). Remaining players are ranked by their progress percentage.',
            accentColor: '#10b981',
        }),
    ];
}

export const HOW_TO_PLAY_CARDS: GuideCard[] = buildHowToPlayCards('en');

export function TutorialModal({ onClose }: { onClose: () => void }) {
    const lang = useStore((s) => s.settings.lang);
    const cards = buildHowToPlayCards(lang);
    const [currentSlide, setCurrentSlide] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    const totalSlides = cards.length;
    const isLastSlide = currentSlide === totalSlides - 1;
    const card = cards[currentSlide];

    const nextSlide = () => {
        if (isLastSlide) {
            onClose();
        } else {
            setCurrentSlide((prev) => Math.min(totalSlides - 1, prev + 1));
        }
    };

    const prevSlide = () => {
        setCurrentSlide((prev) => Math.max(0, prev - 1));
    };

    // Scroll to top of card container whenever slide changes
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [currentSlide]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'Space') {
                e.preventDefault();
                nextSlide();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevSlide();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSlide, isLastSlide]);

    const landscape = useStore((s) => s.landscape);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-3 select-none"
            onPointerDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* Main Modal Box corresponding to #guide-popup */}
            <div
                id="guide-popup"
                className="relative flex w-full max-h-[94vh] max-h-[94dvh] flex-col overflow-hidden rounded-2xl border-2 border-cyan-400/60 bg-gradient-to-b from-[#111936] via-[#0b1026] to-[#070a1a] shadow-[0_0_40px_rgba(0,240,255,0.35)] p-3 sm:p-4.5"
                style={{
                    maxWidth: landscape ? 'min(96vw, 680px)' : 'min(94vw, 450px)',
                }}
                onTouchStart={(e) => {
                    touchStartX.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                    if (touchStartX.current === null) return;
                    const diff = e.changedTouches[0].clientX - touchStartX.current;
                    if (diff > 50) prevSlide();
                    else if (diff < -50) nextSlide();
                    touchStartX.current = null;
                }}
            >
                {/* Header bar: Title + Skip */}
                <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-base sm:text-lg">📖</span>
                        <h2
                            id="guide-main-title"
                            className="font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-indigo-300 to-amber-300 text-xs sm:text-sm"
                        >
                            {tr(lang, 'guideTitle')}
                        </h2>
                    </div>

                    <button
                        id="guide-skip-btn"
                        onClick={onClose}
                        className="rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-all px-2.5 py-0.5 text-[11px] tracking-wider cursor-pointer"
                    >
                        {tr(lang, 'guideSkip')}
                    </button>
                </div>

                {/* Section Filter Pills: Walkthrough (1-5) vs Rules (1-13) */}
                <div className="flex items-center gap-1.5 py-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setCurrentSlide(0)}
                        className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-black tracking-wide transition-all cursor-pointer text-center ${
                            card.part === 'walkthrough'
                                ? 'bg-cyan-500/25 border border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                                : 'bg-slate-900/60 border border-white/10 text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        {tr(lang, 'guideTabWalkthrough')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrentSlide(5)}
                        className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-black tracking-wide transition-all cursor-pointer text-center ${
                            card.part === 'rules'
                                ? 'bg-indigo-500/25 border border-indigo-400 text-indigo-200 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                                : 'bg-slate-900/60 border border-white/10 text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        {tr(lang, 'guideTabRules')}
                    </button>
                </div>

                {/* Scrollable Card Container */}
                <div
                    ref={scrollContainerRef}
                    id="tutorial-slider"
                    className="flex-1 overflow-y-auto overscroll-contain pr-1 my-1 scrollbar-thin scrollbar-thumb-cyan-500/30"
                    style={{ minHeight: '180px', maxHeight: landscape ? '42vh' : '52vh' }}
                >
                    <div className="flex flex-col items-center text-center py-1">
                        {/* Category Badge */}
                        <div
                            className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black tracking-widest uppercase mb-2 shadow"
                            style={{
                                backgroundColor: `${card.accentColor}20`,
                                color: card.accentColor,
                                border: `1px solid ${card.accentColor}60`,
                            }}
                        >
                            <span>★</span>
                            <span>{card.badge}</span>
                            <span>★</span>
                        </div>

                        {/* Slide Icon */}
                        <div className="slide-icon text-4xl sm:text-5xl my-1 drop-shadow-[0_0_16px_rgba(255,255,255,0.4)]">
                            {card.icon}
                        </div>

                        {/* Title */}
                        <h3
                            className="slide-title font-black tracking-wide text-sm sm:text-base mt-1"
                            style={{
                                color: card.accentColor,
                                textShadow: `0 0 12px ${card.accentColor}80`,
                            }}
                        >
                            {card.title}
                        </h3>

                        {/* Main Description Text */}
                        <p className="slide-desc text-slate-200 font-medium leading-relaxed text-xs sm:text-[13px] max-w-lg mt-1.5 px-2 text-center sm:text-left">
                            {card.content}
                        </p>

                        {/* Optional Bullets / Steps list */}
                        {card.bullets && card.bullets.length > 0 && (
                            <div className="mt-2.5 w-full max-w-lg bg-slate-950/70 border border-white/10 rounded-xl p-2.5 text-left flex flex-col gap-1.5">
                                {card.bullets.map((b, idx) => (
                                    <div key={idx} className="text-[11px] sm:text-xs text-slate-200 leading-snug font-medium flex items-start gap-1.5">
                                        <span className="text-cyan-400 font-bold shrink-0">•</span>
                                        <span>{b.replace(/^[•✓\d.]\s*/, '')}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Slider Navigation (Previous, Dots Indicators, Next) */}
                <div className="tutorial-nav flex items-center justify-between pt-2 border-t border-white/10 shrink-0">
                    <button
                        id="tutorial-prev"
                        className="nav-btn rounded-xl bg-white/10 hover:bg-white/20 text-white font-black transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer w-8 h-8 text-sm"
                        onClick={prevSlide}
                        disabled={currentSlide === 0}
                        aria-label={tr(lang, 'guidePrev')}
                    >
                        ←
                    </button>

                    <div id="tutorial-dots" className="tutorial-dots flex items-center gap-1 overflow-x-auto max-w-[220px] px-1 py-1">
                        {cards.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentSlide(idx)}
                                aria-label={`Card ${idx + 1}`}
                                className={`dot transition-all duration-300 rounded-full cursor-pointer shrink-0 ${
                                    idx === currentSlide
                                        ? 'w-4 h-2 bg-gradient-to-r from-cyan-400 to-indigo-400 shadow-[0_0_6px_rgba(0,240,255,0.8)]'
                                        : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/45'
                                }`}
                            />
                        ))}
                    </div>

                    <button
                        id="tutorial-next"
                        className="nav-btn rounded-xl bg-white/10 hover:bg-white/20 text-white font-black transition-all flex items-center justify-center cursor-pointer w-8 h-8 text-sm"
                        onClick={nextSlide}
                        aria-label={tr(lang, 'guideNext')}
                    >
                        →
                    </button>
                </div>

                {/* Bottom Close / Next (X/18) Action Button */}
                <button
                    id="guide-close-btn"
                    onClick={nextSlide}
                    className="w-full mt-2.5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 font-black text-slate-950 text-xs sm:text-sm shadow-[0_0_20px_rgba(0,240,255,0.3)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                    {isLastSlide ? (
                        <>
                            <span>🚀</span>
                            <span>{tr(lang, 'guideLetsPlay')}</span>
                        </>
                    ) : (
                        <>
                            <span>{tr(lang, 'guideNextBtn', { n: String(currentSlide + 1), total: String(totalSlides) })}</span>
                            <span>→</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
