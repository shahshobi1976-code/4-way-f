import { useEffect } from 'react';
import { store, useStore } from '../state/store';
import { GameCanvas } from '../game/GameCanvas';
import { audio } from '../game/sfx';
import { probeMicrophoneStatus } from '../game/audioCapture';
import { startMusic } from '../game/music';
import { BG_BASE } from '../game/draw';
import { LoadingScreen } from './LoadingScreen';
import { MainMenu } from './MainMenu';
import { SetupScreen } from './SetupScreen';
import { Hud } from './Hud';
import { Modals } from './Modals';
import { FloatingControls } from './FloatingControls';

/** Phase router: loading -> menu -> setup -> playing. React owns screens; Pixi owns the board. */
export function App() {
    const phase = useStore((s) => s.phase);
    const bgIdx = useStore((s) => s.settings.bg);
    const currentBgHex = `#${(BG_BASE[bgIdx] ?? 0x0a0d26).toString(16).padStart(6, '0')}`;

    // keep the frame's design-unit size (--u), landscape flag and fullscreen class up to date
    useEffect(() => {
        let raf = 0;
        let t1 = 0;
        let t2 = 0;
        let t3 = 0;

        const apply = () => {
            raf = 0;
            const frame = document.getElementById('app-frame');
            if (!frame) return;
            let fs = false;
            try {
                fs = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
            } catch {
                fs = false;
            }

            const vw = Math.max(1, window.visualViewport?.width || window.innerWidth);
            const vh = Math.max(1, window.visualViewport?.height || window.innerHeight);
            const land = vw >= vh;

            frame.classList.toggle('fs', fs);
            frame.classList.toggle('land', land);

            // Compute frame width for accurate design-unit (--u) scaling in portrait vs landscape
            const frameW = land ? vw : Math.min(vw, (vh * 9) / 16);
            const u = land
                ? Math.min(vh / 680, vw / 960)
                : Math.min(frameW / 420, vh / 740);
            frame.style.setProperty('--u', `${Math.max(0.65, u)}px`);

            // only patch when something actually changed -- patching re-renders React
            if (store.get().fullscreen !== fs || store.get().landscape !== land) {
                store.patch({ fullscreen: fs, landscape: land });
            }
        };

        const sync = () => {
            if (raf) return;
            raf = requestAnimationFrame(apply);
        };

        const syncWithDelays = () => {
            sync();
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
            t1 = window.setTimeout(sync, 60);
            t2 = window.setTimeout(sync, 200);
            t3 = window.setTimeout(sync, 450);
        };

        // When physical orientation changes on mobile, sync
        const onPhysicalOrientationChange = () => {
            syncWithDelays();
        };

        sync();
        window.addEventListener('resize', syncWithDelays);
        window.addEventListener('orientationchange', onPhysicalOrientationChange);
        window.visualViewport?.addEventListener('resize', syncWithDelays);
        document.addEventListener('fullscreenchange', syncWithDelays);
        document.addEventListener('webkitfullscreenchange', syncWithDelays);

        let mql: MediaQueryList | null = null;
        try {
            mql = window.matchMedia('(orientation: landscape)');
            mql.addEventListener?.('change', onPhysicalOrientationChange);
        } catch {
            /* ignore */
        }

        try {
            (screen.orientation as any)?.addEventListener?.('change', onPhysicalOrientationChange);
        } catch {
            /* ignore */
        }

        const unsub = store.subscribe(() => {
            const frame = document.getElementById('app-frame');
            if (frame && store.get().landscape !== frame.classList.contains('land')) {
                sync();
            }
        });

        return () => {
            if (raf) cancelAnimationFrame(raf);
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
            unsub();
            window.removeEventListener('resize', syncWithDelays);
            window.removeEventListener('orientationchange', syncWithDelays);
            window.visualViewport?.removeEventListener('resize', syncWithDelays);
            document.removeEventListener('fullscreenchange', syncWithDelays);
            document.removeEventListener('webkitfullscreenchange', syncWithDelays);
            try {
                mql?.removeEventListener?.('change', syncWithDelays);
            } catch {
                /* ignore */
            }
            try {
                (screen.orientation as any)?.removeEventListener?.('change', syncWithDelays);
            } catch {
                /* ignore */
            }
        };
    }, []);

    // browsers only allow sound after a tap: unlock audio and start the music on the first one
    useEffect(() => {
        void probeMicrophoneStatus();
        const unlock = () => {
            audio();
            if (store.get().settings.music) startMusic();
            window.removeEventListener('pointerdown', unlock);
        };
        window.addEventListener('pointerdown', unlock);
        return () => window.removeEventListener('pointerdown', unlock);
    }, []);

    return (
        <div id="app-frame" className="safe-top" style={{ backgroundColor: currentBgHex }}>
            {phase === 'loading' && <LoadingScreen />}
            {phase === 'menu' && <MainMenu />}
            {phase === 'setup' && <SetupScreen />}
            {phase === 'playing' && (
                <>
                    <GameCanvas />
                    <Hud />
                </>
            )}
            {/* Floating controls (0.65x size) for menu & playing, excluded from setup screen */}
            {phase !== 'setup' && phase !== 'loading' && <FloatingControls />}
            <Modals />
        </div>
    );
}
