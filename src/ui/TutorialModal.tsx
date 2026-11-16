import { useState, useEffect, useRef } from 'react';
import { useStore } from '../state/store';

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

export const HOW_TO_PLAY_CARDS: GuideCard[] = [
    // ----------------------------------------------------
    // PART 1: 5 Step-by-Step Walkthrough Cards (Step 1 to Step 5)
    // ----------------------------------------------------
    {
        part: 'walkthrough',
        stepNumber: 1,
        icon: '⚡',
        badge: 'STEP 1 OF 5 • QUICK SUMMARY',
        title: 'STEP 1 — The Game in 30 Seconds',
        content:
            'Play in 4-Way or 2-Way mode with 4 tokens and 2 dice per player. A single 6 brings a token out of base onto the track. Rolling double 6 (6 and 6) awards an extra turn. Capturing opponent tokens on the open track rewards a reroll, but capturing is compulsory—missing an available capture penalizes your token back to base. Star squares and coloured home paths are safe. The first player to bring all 4 tokens onto their coloured home path wins and immediately concludes the match!',
        accentColor: '#00f0ff',
    },
    {
        part: 'walkthrough',
        stepNumber: 2,
        icon: '⚙️',
        badge: 'STEP 2 OF 5 • MATCH PREPARATION',
        title: 'STEP 2 — Before the Match',
        content:
            'Before the match begins, choose your Lucky Wish numbers (any two dice numbers except 6 and 6) to use once per match. The room host also sets the turn timer (60s, 90s, 120s, or disabled/off). Ensure your audio and board preferences are ready before hitting start.',
        accentColor: '#38bdf8',
    },
    {
        part: 'walkthrough',
        stepNumber: 3,
        icon: '🔄',
        badge: 'STEP 3 OF 5 • TURN SEQUENCE',
        title: 'STEP 3 — Your Turn, Step by Step',
        content:
            'Follow these 6 steps on every turn:',
        bullets: [
            '1. Roll both dice on your turn.',
            '2. Check for captures first—capturing on the open track is compulsory.',
            '3. Choose whether to move one token by the total of both dice or split across two tokens.',
            '4. Make your move (if no legal move exists, your turn passes).',
            '5. Take an extra turn on a double 6, capture, centre home, or Lucky 7.',
            '6. Otherwise, play passes clockwise to the next player.',
        ],
        accentColor: '#a855f7',
    },
    {
        part: 'walkthrough',
        stepNumber: 4,
        icon: '🎯',
        badge: 'STEP 4 OF 5 • EXAMPLE TURNS',
        title: 'STEP 4 — Four Example Turns',
        content:
            'See how real game situations play out:',
        bullets: [
            '• Capture & Reroll: Roll 5 and 2, move 7 to capture a lone opponent token, send them to base, and get an immediate reroll.',
            '• Missed Capture Penalty: Roll 4 and 2 with an available capture; moving another token instead sends the capturing token back to base.',
            '• Lucky 7 Bonus: With no tokens on open track, rolling 4 + 3 = 7 converts into 6 + 6 with an extra turn.',
            '• Exit Base: Roll 6 and 2, bring a token out with 6, move 2 spaces, then play passes to the next player.',
        ],
        accentColor: '#f59e0b',
    },
    {
        part: 'walkthrough',
        stepNumber: 5,
        icon: '✅',
        badge: 'STEP 5 OF 5 • FIRST-MATCH CHECKLIST',
        title: 'STEP 5 — First-Match Checklist',
        content:
            'Keep these 5 key tactical rules in mind during play:',
        bullets: [
            '✓ Locate your base, coloured home path, and star safe squares.',
            '✓ Always inspect the board for compulsory captures before touching a token.',
            '✓ Pair up tokens of the same colour on a square to create an invincible block.',
            '✓ Use star squares for sanctuary when opponents close in.',
            '✓ Keep an eye on rival progress bars and cooperate to stop the leader from winning!',
        ],
        accentColor: '#10b981',
    },

    // ----------------------------------------------------
    // PART 2: 12 Play Guide Cards (Guide 1 to Guide 12)
    // ----------------------------------------------------
    {
        part: 'rules',
        guideNumber: 1,
        icon: '🏆',
        badge: 'GUIDE 1 OF 12 • THE GOAL',
        title: 'GUIDE 1 — The Goal',
        content:
            'The first player to get all four of their tokens onto their coloured home path wins. A token does not need to reach the centre home. A token that reaches the centre home also counts.',
        accentColor: '#10b981',
    },
    {
        part: 'rules',
        guideNumber: 2,
        icon: '🎲🎲',
        badge: 'GUIDE 2 OF 12 • TWO DICE',
        title: 'GUIDE 2 — Two Dice',
        content:
            'On your turn you roll two dice. You can use both dice on one token, which moves the total of the two dice, or use one die on each of two different tokens. Tokens and turns move clockwise around the board.',
        accentColor: '#00f0ff',
    },
    {
        part: 'rules',
        guideNumber: 3,
        icon: '🎲',
        badge: 'GUIDE 3 OF 12 • SIXES & LEAVING BASE',
        title: 'GUIDE 3 — Sixes and Leaving Base',
        content:
            'All four tokens start in base. A single 6 brings one token out of base onto the open track. Rolling a double 6 (6 and 6) awards an extra turn, while a single 6 does not award an extra turn.',
        accentColor: '#eab308',
    },
    {
        part: 'rules',
        guideNumber: 4,
        icon: '⚔️',
        badge: 'GUIDE 4 OF 12 • CAPTURING & REROLL',
        title: 'GUIDE 4 — Capturing and the Reroll',
        content:
            'If your token lands on a square where a single opponent token stands on the open track, that token is captured and returns to its base. A capture can be made with one die or the total of both dice. Every capture gives you a reroll.',
        accentColor: '#f43f5e',
    },
    {
        part: 'rules',
        guideNumber: 5,
        icon: '⭐',
        badge: 'GUIDE 5 OF 12 • SAFE PLACES',
        title: 'GUIDE 5 — Safe Places',
        content:
            'A token cannot be captured when it is on a star square, on its coloured home path, or in base. Star squares are safe for every player on the board.',
        accentColor: '#ffd84a',
    },
    {
        part: 'rules',
        guideNumber: 6,
        icon: '🛡️',
        badge: 'GUIDE 6 OF 12 • PAIRS & BLOCKS',
        title: 'GUIDE 6 — Pairs',
        content:
            'Two tokens of the same colour on the same square form a pair. A single token cannot capture a pair. A pair is only captured when two opponent tokens land on that square together, one with each die, giving one reroll. Pairs on star squares are always safe, and you can split your pair freely.',
        accentColor: '#38bdf8',
    },
    {
        part: 'rules',
        guideNumber: 7,
        icon: '⚠️',
        badge: 'GUIDE 7 OF 12 • MISSED CAPTURE PENALTY',
        title: 'GUIDE 7 — The Missed Capture Penalty',
        content:
            'Capturing is compulsory. If one of your tokens could capture an opponent’s token on the open track and you finish your move without capturing, the token that could have captured is sent back to its base.',
        accentColor: '#ef4444',
    },
    {
        part: 'rules',
        guideNumber: 8,
        icon: '👑',
        badge: 'GUIDE 8 OF 12 • CENTRE HOME BONUS',
        title: 'GUIDE 8 — Centre Home Bonus',
        content:
            'Moving a token into the centre home requires an exact roll and rewards you with an extra turn. Reaching the centre home counts toward victory, though reaching the coloured home path is already enough to win.',
        accentColor: '#ec4899',
    },
    {
        part: 'rules',
        guideNumber: 9,
        icon: '✨7',
        badge: 'GUIDE 9 OF 12 • LUCKY 7',
        title: 'GUIDE 9 — Lucky 7',
        content:
            'If none of your tokens are on the open track (all are in base, on your coloured home path, or in centre home), rolling a total of 7 counts as 6+6 and gives you an extra turn so two tokens can leave base together.',
        accentColor: '#ffd84a',
    },
    {
        part: 'rules',
        guideNumber: 10,
        icon: '🌟',
        badge: 'GUIDE 10 OF 12 • LUCKY WISH',
        title: 'GUIDE 10 — Lucky Wish',
        content:
            'Before the match, choose two dice numbers (6 and 6 is not allowed). Once per match on any turn, tap the Golden Star to roll those exact two numbers instead of a random roll.',
        accentColor: '#f59e0b',
    },
    {
        part: 'rules',
        guideNumber: 11,
        icon: '⏳',
        badge: 'GUIDE 11 OF 12 • TURN TIMER',
        title: 'GUIDE 11 — Turn Timer',
        content:
            'The room host chooses the optional turn timer before play: 60, 90, or 120 seconds, or turns it off completely. When the timer is active and runs out, your turn automatically passes to the next player.',
        accentColor: '#a855f7',
    },
    {
        part: 'rules',
        guideNumber: 12,
        icon: '🏁',
        badge: 'GUIDE 12 OF 12 • HOW MATCH ENDS',
        title: 'GUIDE 12 — How the Match Ends',
        content:
            'The match ends immediately as soon as one player wins. Remaining players are ranked by the percentage on the progress bar. Because play stops the instant someone wins, every rival fights to win or stop the leader.',
        accentColor: '#10b981',
    },
];

export function TutorialModal({ onClose }: { onClose: () => void }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    const totalSlides = HOW_TO_PLAY_CARDS.length;
    const isLastSlide = currentSlide === totalSlides - 1;
    const card = HOW_TO_PLAY_CARDS[currentSlide];

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
                            How to Play Guide (4-Way Rules)
                        </h2>
                    </div>

                    <button
                        id="guide-skip-btn"
                        onClick={onClose}
                        className="rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-all px-2.5 py-0.5 text-[11px] tracking-wider cursor-pointer"
                    >
                        SKIP
                    </button>
                </div>

                {/* Section Filter Pills: Walkthrough (1-5) vs Rules (1-12) */}
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
                        Walkthrough (Steps 1–5)
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
                        Rules Guide (1–12)
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
                        aria-label="Previous Slide"
                    >
                        ←
                    </button>

                    <div id="tutorial-dots" className="tutorial-dots flex items-center gap-1 overflow-x-auto max-w-[220px] px-1 py-1">
                        {HOW_TO_PLAY_CARDS.map((_, idx) => (
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
                        aria-label="Next Slide"
                    >
                        →
                    </button>
                </div>

                {/* Bottom Close / Next (X/17) Action Button */}
                <button
                    id="guide-close-btn"
                    onClick={nextSlide}
                    className="w-full mt-2.5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 font-black text-slate-950 text-xs sm:text-sm shadow-[0_0_20px_rgba(0,240,255,0.3)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                    {isLastSlide ? (
                        <>
                            <span>🚀</span>
                            <span>LET'S PLAY!</span>
                        </>
                    ) : (
                        <>
                            <span>NEXT ({currentSlide + 1}/{totalSlides})</span>
                            <span>→</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
