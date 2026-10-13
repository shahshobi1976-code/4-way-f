import { useEffect, useState, type CSSProperties } from 'react';
import { store, useStore } from '../state/store';
import { RoundBtn, U } from './kit';

/**
 * Ask the browser to lock the screen to landscape. Browsers refuse unless this is
 * called from a user gesture, and some (notably iOS Safari) refuse outright.
 */
/** 'mobile' build offers landscape/portrait choice; 'web' build offers fullscreen only. */
export const IS_MOBILE = (window as any).__LUDO_TARGET__ === 'mobile';

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

/** Mobile: pick landscape or portrait. Browsers only allow the lock in fullscreen, so landscape enters it. */
export function setOrientation(kind: 'landscape' | 'portrait') {
    const d: any = document;
    const el: any = document.documentElement;
    const inFs = !!(d.fullscreenElement || d.webkitFullscreenElement);
    if (kind === 'landscape') {
        if (!inFs) {
            try {
                const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch { /* ignore */ }
        }
        lockOrientation('landscape');
        if (!orientationRetry) {
            orientationRetry = onFsChangeForOrientation;
            document.addEventListener('fullscreenchange', orientationRetry);
            document.addEventListener('webkitfullscreenchange', orientationRetry);
        }
    } else {
        clearOrientationRetry();
        lockOrientation('portrait');
        // leave fullscreen afterwards so the lock does not trap the player
        setTimeout(() => {
            try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ }
        }, 400);
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

/** Web: one fullscreen button. Mobile: landscape + portrait buttons. */
export function ScreenButtons({ gap = 12 }: { gap?: number }) {
    const fs = useStore((s) => s.fullscreen);
    const landscape = useStore((s) => s.landscape);
    if (!IS_MOBILE) {
        return <RoundBtn label="Fullscreen" onClick={toggleFullscreen}>{fs ? '⤡' : '⛶'}</RoundBtn>;
    }
    const ring = (on: boolean): CSSProperties => (on ? { boxShadow: '0 0 0 3px rgba(24,224,255,0.9)' } : {});
    return (
        <div className="flex" style={{ gap: U(gap) }}>
            <RoundBtn label="Landscape" onClick={() => setOrientation('landscape')} style={ring(landscape)}>↔️</RoundBtn>
            <RoundBtn label="Portrait" onClick={() => setOrientation('portrait')} style={ring(!landscape)}>↕️</RoundBtn>
        </div>
    );
}

/**
 * Portrait hint for phones. The game is fully playable in portrait (the board
 * stacks above the dice), so this only nudges toward the wider view and gets
 * out of the way; it never blocks play. Hidden on pointer-fine devices
 * (desktop/laptop) where rotating is meaningless.
 */
export function RotateHint() {
    const landscape = useStore((s) => s.landscape);
    const [fine, setFine] = useState(true);
    const [dismissed, setDismissed] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(pointer: coarse)');
        const apply = () => setFine(!mq.matches);
        apply();
        mq.addEventListener?.('change', apply);
        return () => mq.removeEventListener?.('change', apply);
    }, []);
    if (!IS_MOBILE || fine || landscape || dismissed) return null;
    return (
        <button
            onClick={() => setDismissed(true)}
            className="pop absolute z-40 flex items-center"
            style={{
                top: U(14),
                left: '50%',
                transform: 'translateX(-50%)',
                gap: U(8),
                padding: `${U(7)}px ${U(14)}px`,
                borderRadius: U(999),
                background: 'rgba(6,10,30,0.88)',
                border: `1px solid rgba(24,224,255,0.5)`,
                color: '#cfefff',
                fontWeight: 700,
                fontSize: U(15),
                whiteSpace: 'nowrap',
            }}
            aria-label="Rotate device for the wide board layout"
        >
            <span style={{ fontSize: U(18) }}>🔄</span>
            Rotate for full board
        </button>
    );
}

/** Menu / setup floating buttons: music + settings bottom-right, fullscreen bottom-left, ☰ toggle top-right. */
export function FloatingControls() {
    const [open, setOpen] = useState(true);
    return (
        <>
            <RoundBtn label="Toggle controls" size={52} onClick={() => setOpen(!open)} className="absolute z-30" style={{ top: U(18), right: U(18) }}>☰</RoundBtn>
            {open && (
                <>
                    <div className="absolute z-30 flex flex-col" style={{ right: U(18), bottom: U(20), gap: U(12) }}>
                        <RoundBtn label="Music" onClick={() => store.patch({ modal: 'music' })}>🎵</RoundBtn>
                        <RoundBtn label="Settings" onClick={() => store.patch({ modal: 'settings' })}>⚙️</RoundBtn>
                    </div>
                    <div className="absolute z-30" style={{ left: U(18), bottom: U(20) }}>
                        <ScreenButtons />
                    </div>
                </>
            )}
        </>
    );
}
