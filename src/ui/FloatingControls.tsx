import { useEffect, useState, type CSSProperties } from 'react';
import { store, useStore } from '../state/store';
import { bus } from '../game/bus';
import { RoundBtn, U } from './kit';

/**
 * Ask the browser to lock the screen to landscape. Browsers refuse unless this is
 * called from a user gesture, and some (notably iOS Safari) refuse outright.
 */
/** 'mobile' build offers landscape/portrait choice; 'web' build offers fullscreen only. */
export const IS_MOBILE =
    typeof window !== 'undefined' &&
    ((window as any).__LUDO_TARGET__ === 'mobile' ||
        /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

function lockOrientation(kind: 'landscape' | 'portrait') {
    try {
        (screen.orientation as any)?.lock?.(kind)?.catch?.(() => {});
    } catch {
        /* refused (e.g. iOS Safari): the player can just turn the phone */
    }
}
function lockLandscape() {
    lockOrientation('landscape');
}

/** Mobile / Web: pick landscape or portrait. */
export function setOrientation(kind: 'landscape' | 'portrait') {
    const d: any = document;
    const el: any = document.documentElement;
    const inFs = !!(d.fullscreenElement || d.webkitFullscreenElement);
    const frame = document.getElementById('app-frame');

    if (kind === 'landscape') {
        try { (window as any).__USER_ORIENTATION__ = 'landscape'; } catch {}
        if (!inFs) {
            try {
                const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch {
                /* ignore */
            }
        }
        lockOrientation('landscape');
        store.patch({ landscape: true });
        if (frame) frame.classList.add('land');
        if (!orientationRetry) {
            orientationRetry = onFsChangeForOrientation;
            document.addEventListener('fullscreenchange', orientationRetry);
            document.addEventListener('webkitfullscreenchange', orientationRetry);
        }
    } else {
        try { (window as any).__USER_ORIENTATION__ = 'portrait'; } catch {}
        clearOrientationRetry();
        lockOrientation('portrait');
        store.patch({ landscape: false });
        if (frame) frame.classList.remove('land');
        setTimeout(() => {
            try {
                (screen.orientation as any)?.unlock?.();
            } catch {
                /* ignore */
            }
        }, 300);
    }
}

// ONE shared listener, so repeatedly toggling fullscreen cannot stack handlers
// (each leaving one behind was part of the fullscreen stall).
let orientationRetry: (() => void) | null = null;

function clearOrientationRetry() {
    if (!orientationRetry) return;
    document.removeEventListener('fullscreenchange', orientationRetry);
    document.removeEventListener('webkitfullscreenchange', orientationRetry);
    orientationRetry = null;
}

function onFsChangeForOrientation() {
    lockLandscape();
    clearOrientationRetry();
}

export function toggleFullscreen() {
    try {
        const d: any = document;
        const el: any = document.documentElement;
        if (d.fullscreenElement || d.webkitFullscreenElement) {
            clearOrientationRetry();
            try {
                const p = (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch { /* ignore */ }
            try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ }
        } else {
            try {
                const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch { /* ignore */ }
            // Ask for landscape SYNCHRONOUSLY, still inside the tap handler: iOS
            // ignores orientation.lock() once the gesture context is gone.
            lockLandscape();
            // Some browsers only honour the lock after fullscreen has landed, so
            // retry once through the shared, self-removing listener.
            if (!orientationRetry) {
                orientationRetry = onFsChangeForOrientation;
                document.addEventListener('fullscreenchange', orientationRetry);
                document.addEventListener('webkitfullscreenchange', orientationRetry);
            }
        }
    } catch {
        /* fullscreen not available */
    }
}

/** Adaptive screen buttons: Fullscreen button + Wish icon (when an active wish exists). Scaled to 0.65x. */
export function ScreenButtons({ gap = 6 }: { gap?: number }) {
    const fs = useStore((s) => s.fullscreen);
    const wishNums = useStore((s) => s.wishNums);
    const wishUsable = useStore((s) => s.wishUsable);
    const phase = useStore((s) => s.phase);

    // Only render wish button if there is a real wish; if no wish, do not render any wish icon
    const hasWish = phase === 'playing' && wishNums && wishNums.length === 2;

    return (
        <div className="flex items-center" style={{ gap: U(gap) }}>
            <RoundBtn
                label="Fullscreen"
                size={42}
                onClick={toggleFullscreen}
                title="Toggle Fullscreen"
            >
                {fs ? '⤡' : '⛶'}
            </RoundBtn>

            {/* When a wish exists, display it right next to the fullscreen icon */}
            {hasWish && (
                <button
                    type="button"
                    onClick={() => bus.wish?.()}
                    disabled={!wishUsable}
                    aria-label="Lucky Wish"
                    title={wishUsable ? `Click to activate Lucky Wish (${wishNums[0]}, ${wishNums[1]})!` : `Lucky Wish (${wishNums[0]}, ${wishNums[1]})`}
                    className={`flex items-center justify-center font-black rounded-full border-2 transition-all select-none shadow-lg ${
                        wishUsable
                            ? 'pulse-wish border-amber-300 bg-gradient-to-r from-amber-400 to-orange-500 text-black scale-105 active:scale-95 cursor-pointer'
                            : 'border-white/30 bg-slate-900/80 text-white/50 cursor-not-allowed opacity-80'
                    }`}
                    style={{
                        height: U(42),
                        padding: `0 ${U(12)}`,
                        gap: U(5),
                        fontSize: U(14),
                    }}
                >
                    <span style={{ fontSize: U(16) }}>✨</span>
                    <span>{wishNums[0]},{wishNums[1]}</span>
                </button>
            )}
        </div>
    );
}

/**
 * RotateHint is removed per user request (no rotate icons on any screen).
 */
export function RotateHint() {
    return null;
}

/** Menu / screen floating buttons: music + settings bottom-right, fullscreen bottom-left (scaled to 0.65x). */
export function FloatingControls() {
    return (
        <>
            <div className="absolute z-30 flex flex-col" style={{ right: U(12), bottom: U(14), gap: U(8) }}>
                <RoundBtn size={42} label="Music" onClick={() => store.patch({ modal: 'music' })}>🎵</RoundBtn>
                <RoundBtn size={42} label="Settings" onClick={() => store.patch({ modal: 'settings' })}>⚙️</RoundBtn>
            </div>
            <div className="absolute z-30" style={{ left: U(12), bottom: U(14) }}>
                <ScreenButtons gap={6} />
            </div>
        </>
    );
}
