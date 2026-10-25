import { useState, useEffect, useRef } from 'react';
import { store, useStore } from '../state/store';
import { U } from './kit';

export interface TutorialSlide {
    icon: string;
    titleKey: string;
    descKey: string;
    titleEn: string;
    descEn: string;
    titleUr: string;
    descUr: string;
    badge?: string;
    accentColor: string;
}

export const TUTORIAL_SLIDES: TutorialSlide[] = [
    {
        icon: '🎲🎲',
        titleKey: 'dual_dice_title',
        descKey: 'dual_dice_desc',
        titleEn: 'Dual Dice Strategy',
        descEn: 'Roll two dice every turn! Tap a die result to select it, then tap a pawn to move. You can use both dice on one pawn or split them between two.',
        titleUr: 'ڈوئل ڈائس حکمت عملی',
        descUr: 'ہر باری میں 2 دانے رول کریں۔ ایک پاون پر دونوں استعمال کر سکتے ہیں یا دو الگ پاونز میں بانٹ سکتے ہیں۔',
        badge: 'CORE MECHANIC',
        accentColor: '#00f0ff',
    },
    {
        icon: '🖐️',
        titleKey: 'five_player_title',
        descKey: 'five_player_desc',
        titleEn: '5-Player Chaos',
        descEn: 'Pentagonal board with 5 wings! More rivals means more strategy.',
        titleUr: '5 کھلاڑیوں کا سنسنی خیز مقابلہ',
        descUr: '5 کونوں والا پینٹاگون بورڈ جس میں کھلاڑی ایک ساتھ بھرپور حکمت عملی سے مقابلہ کرتے ہیں۔',
        badge: 'EPIC BOARD',
        accentColor: '#ec4899',
    },
    {
        icon: '🎲🎲',
        titleKey: 'double_six_title',
        descKey: 'double_six_desc',
        titleEn: 'Double-Six Power',
        descEn: 'No 3-six limit here! Keep rolling as long as you hit those sixes.',
        titleUr: 'ڈبل چھکّہ پاور',
        descUr: 'عام لوڈو کی طرح 3 دفعہ 6 آنے پر باری کینسل نہیں ہوتی، جب تک چھکے آتے رہیں چلتے رہیں۔',
        badge: 'UNLIMITED SIXES',
        accentColor: '#eab308',
    },
    {
        icon: '✨7',
        titleKey: 'lucky_seven_title',
        descKey: 'lucky_seven_desc',
        titleEn: 'Lucky 7 Bonus',
        descEn: 'Roll any total of 7 (including 4+3, 5+2, 6+1) to instantly trigger a massive 6-6 boost with an extra turn!',
        titleUr: 'لکی 7 بونس',
        descUr: 'دونوں دانوں کا جوڑ 7 بننے پر فوراً ڈبل چھکّہ (6+6) اور ایکسٹرا باری ملتی ہے۔',
        badge: 'INSTANT 6+6',
        accentColor: '#ffd84a',
    },
    {
        icon: '⚔️',
        titleKey: 'missed_capture_title',
        descKey: 'missed_capture_desc',
        titleEn: 'Missed Capture Penalty',
        descEn: 'Strategic slip? Miss a capture and your token is sent back home!',
        titleUr: 'مسڈ کیپچر جرمانہ',
        descUr: 'اگر کسی دشمن کی گوٹی کاٹنے کا موقع چھوڑ دیں تو وہ گوٹی سزا کے طور پر گھر واپس بھیج دی جاتی ہے۔',
        badge: 'MANDATORY ATTACK',
        accentColor: '#ef4444',
    },
    {
        icon: '🏆',
        titleKey: 'victory_cond_title',
        descKey: 'victory_cond_desc',
        titleEn: 'Victory condition',
        descEn: 'Be the first to get all 4 tokens to the home stretch to win the round! The first player to finish is the sole winner.',
        titleUr: 'فتح کا اصول',
        descUr: 'جو کھلاڑی سب سے پہلے اپنی تمام گوٹیاں سینٹر/ہوم پہنچائے گا وہی اکیلا فاتح بنے گا۔',
        badge: 'CHAMPION',
        accentColor: '#10b981',
    },
    {
        icon: '✨',
        titleKey: 'lucky_wish_guide_title',
        descKey: 'lucky_wish_guide_desc',
        titleEn: 'Lucky Wish',
        descEn: 'Tap the golden star to use your one-time "Wish Roll" (set during setup) for a guaranteed boost!',
        titleUr: 'لکی وش (خواہش)',
        descUr: 'گیم سیٹ اپ میں سیٹ کیے گئے دو من پسند نمبرز کا گولڈن اسٹار وش رول استعمال کریں۔',
        badge: 'ONE-TIME PERK',
        accentColor: '#f59e0b',
    },
    {
        icon: '👇',
        titleKey: 'hand_pointer_title',
        descKey: 'hand_pointer_desc',
        titleEn: 'Interactive Guidance',
        descEn: 'The magic hand (👇) guides you! It points to the dice when it\'s time to roll, or highlights all your valid move options, letting you choose your strategy freely.',
        titleUr: 'جادوئی رہنمائی',
        descUr: 'جادوئی ہاتھ کا نشان باری کے وقت ڈائس یا چلنے والی گوٹیوں کی رہنمائی کرتا ہے۔',
        badge: 'SMART HINTS',
        accentColor: '#38bdf8',
    },
    {
        icon: '⏳',
        titleKey: 'turn_timer_title',
        descKey: 'turn_timer_desc',
        titleEn: 'Royal Clock',
        descEn: 'Keep the race moving! The 90-second turn timer ensures fast gameplay. If the bar runs out, your turn automatically passes to the next player.',
        titleUr: 'شاہی گھڑی (ٹرن ٹائمر)',
        descUr: '90 سیکنڈز کا ٹرن ٹائمر، وقت ختم ہونے پر باری خود بخود اگلے کھلاڑی کو چلی جاتی ہے۔',
        badge: 'FAST PACED',
        accentColor: '#a855f7',
    },
    {
        icon: '💬',
        titleKey: 'social_features_title',
        descKey: 'social_features_desc',
        titleEn: 'Connect & React',
        descEn: 'Tap a player\'s name plate to send voice messages or custom chats. Use the emoji tray on the status bar to react in real-time to every roll and capture!',
        titleUr: 'بات چیت اور ری ایکشنز',
        descUr: 'کھلاڑیوں کے نیم پلیٹس پر ٹیپ کر کے وائس میسج یا چیٹ بھیجیں اور ایموجی ٹرے سے لائیو ری ایکشنز دیں۔',
        badge: 'VOICE & BANTER',
        accentColor: '#06b6d4',
    },
];

export function TutorialModal({ onClose }: { onClose: () => void }) {
    const lang = useStore((s) => s.settings.lang);
    const isUrdu = lang === 'ur';
    const [currentSlide, setCurrentSlide] = useState(0);
    const touchStartX = useRef<number | null>(null);

    const totalSlides = TUTORIAL_SLIDES.length;
    const isLastSlide = currentSlide === totalSlides - 1;
    const slide = TUTORIAL_SLIDES[currentSlide];

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

    // Keyboard navigation (Left / Right / Escape / Space)
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
    const title = isUrdu ? slide.titleUr : slide.titleEn;
    const desc = isUrdu ? slide.descUr : slide.descEn;

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
                className="relative flex w-full max-h-[96vh] max-h-[96dvh] flex-col overflow-hidden rounded-2xl border-2 border-cyan-400/60 bg-gradient-to-b from-[#111936] via-[#0b1026] to-[#070a1a] shadow-[0_0_40px_rgba(0,240,255,0.35)] p-2.5 sm:p-4"
                style={{
                    maxWidth: landscape ? 'min(96vw, 680px)' : 'min(94vw, 440px)',
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
                {/* Header bar: Skip button + Title */}
                <div className="flex items-center justify-between pb-1.5 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-base sm:text-lg">📖</span>
                        <h2
                            id="guide-main-title"
                            className="font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-indigo-300 text-xs sm:text-sm"
                        >
                            {isUrdu ? 'کھیلنے کا طریقہ • اہم اصول' : 'Quick Start for Ludo King Pros'}
                        </h2>
                    </div>

                    <button
                        id="guide-skip-btn"
                        onClick={onClose}
                        className="rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-all px-2.5 py-0.5 text-[11px] tracking-wider cursor-pointer"
                    >
                        {isUrdu ? 'چھوڑیں (SKIP)' : 'SKIP'}
                    </button>
                </div>

                {/* Dynamic Slider Container */}
                {landscape ? (
                    <div id="tutorial-slider" className="my-2 grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-4 flex flex-col items-center justify-center text-center p-2 rounded-xl bg-slate-950/60 border border-white/10">
                            <div
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase mb-1 shadow"
                                style={{
                                    backgroundColor: `${slide.accentColor}25`,
                                    color: slide.accentColor,
                                    border: `1px solid ${slide.accentColor}60`,
                                }}
                            >
                                <span>★</span>
                                <span>{slide.badge || `RULE ${currentSlide + 1}`}</span>
                                <span>★</span>
                            </div>
                            <div className="slide-icon text-4xl sm:text-5xl my-1 drop-shadow-[0_0_16px_rgba(255,255,255,0.4)]">
                                {slide.icon}
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold">
                                {currentSlide + 1} / {totalSlides}
                            </span>
                        </div>
                        <div className="col-span-8 flex flex-col justify-center">
                            <h3
                                className="slide-title font-black tracking-wide text-sm sm:text-base leading-tight"
                                style={{
                                    color: slide.accentColor,
                                    textShadow: `0 0 12px ${slide.accentColor}80`,
                                }}
                            >
                                {title}
                            </h3>
                            <p className="slide-desc text-slate-200 font-semibold leading-relaxed text-xs mt-1">
                                {desc}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div id="tutorial-slider" className="my-2.5 flex flex-col items-center justify-center text-center">
                        <div
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase mb-1.5 shadow"
                            style={{
                                backgroundColor: `${slide.accentColor}25`,
                                color: slide.accentColor,
                                border: `1px solid ${slide.accentColor}60`,
                            }}
                        >
                            <span>★</span>
                            <span>{slide.badge || `RULE ${currentSlide + 1}`}</span>
                            <span>★</span>
                        </div>
                        <div className="slide-icon text-5xl my-1 drop-shadow-[0_0_16px_rgba(255,255,255,0.4)]">
                            {slide.icon}
                        </div>
                        <h3
                            className="slide-title font-black tracking-wide text-sm sm:text-base mt-1"
                            style={{
                                color: slide.accentColor,
                                textShadow: `0 0 12px ${slide.accentColor}80`,
                            }}
                        >
                            {title}
                        </h3>
                        <p className="slide-desc text-slate-200 font-semibold leading-relaxed text-xs max-w-sm mt-1 px-1">
                            {desc}
                        </p>
                    </div>
                )}

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

                    <div id="tutorial-dots" className="tutorial-dots flex items-center gap-1.5">
                        {TUTORIAL_SLIDES.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentSlide(idx)}
                                aria-label={`Slide ${idx + 1}`}
                                className={`dot transition-all duration-300 rounded-full cursor-pointer ${
                                    idx === currentSlide
                                        ? 'w-5 h-2 bg-gradient-to-r from-cyan-400 to-indigo-400 shadow-[0_0_6px_rgba(0,240,255,0.8)]'
                                        : 'w-2 h-2 bg-white/25 hover:bg-white/45'
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

                {/* Bottom Close / Play Button */}
                <button
                    id="guide-close-btn"
                    onClick={nextSlide}
                    className="w-full mt-2.5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:from-cyan-300 hover:to-indigo-400 font-black text-slate-950 text-xs sm:text-sm shadow active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                    {isLastSlide ? (
                        <>
                            <span>🚀</span>
                            <span>{isUrdu ? 'اب کھیلیں! (LET\'S PLAY!)' : "LET'S PLAY!"}</span>
                        </>
                    ) : (
                        <>
                            <span>{isUrdu ? 'اگلا اصول' : 'READY'}</span>
                            <span className="text-slate-800 font-extrabold">({currentSlide + 1}/{totalSlides})</span>
                            <span>→</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
