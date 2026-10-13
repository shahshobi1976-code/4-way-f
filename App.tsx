import { useEffect } from 'react';
import { store, useStore } from '../state/store';
import { GameCanvas } from '../game/GameCanvas';
import { audio } from '../game/sfx';
import { startMusic } from '../game/music';
import { LoadingScreen } from './LoadingScreen';
import { MainMenu } from './MainMenu';
import { SetupScreen } from './SetupScreen';
import { Hud } from './Hud';
import { Modals } from './Modals';
import { FloatingControls, RotateHint } from './FloatingControls';

/** Phase router: loading -> menu -> setup -> playing. React owns screens; Pixi owns the board. */
export function App() {
    const phase = useStore((s) => s.phase);

    // keep the frame's design-unit size (--u), landscape flag and fullscreen class up to date
    useEffect(() => {
        let raf = 0;

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
            // Landscape is driven by the VIEWPORT, not by the frame: a wide screen
            // (desktop window, laptop, tablet, or a phone turned sideways) should
            // use the wide layout instead of sitting in a letterboxed portrait strip.
            //
            // The menu and setup screens are the exception: they were designed as a
            // portrait column, and stretching them across a wide window made the
            // text tiny and the rows span the full width. They keep the original
            // portrait column, so the wide layout only applies while playing.
            const vw = Math.max(1, window.innerWidth);
            const vh = Math.max(1, window.innerHeight);
            const portraitScreen = store.get().phase === 'menu' || store.get().phase === 'setup';
            const land = !portraitScreen && vw > vh * 1.05;
            frame.classList.toggle('fs', fs);
            frame.classList.toggle('land', land);
            frame.style.setProperty('--u', `${land ? vh / 720 : Math.min(vw, (vh * 9) / 16) / 720}px`);
            // only patch when something actually changed -- patching re-renders
            // React, and this function is also a store listener
            if (store.get().fullscreen !== fs || store.get().landscape !== land) store.patch({ fullscreen: fs, landscape: land });
        };

        /**
         * Coalesce bursts into one layout pass per frame. Toggling fullscreen
         * fires resize + fullscreenchange + orientation events together, and this
         * function both listens to the store AND writes to it, so an uncoalesced
         * version re-entered itself and resized the Pixi canvas on every pass --
         * which is what made the game appear to hang when going in and out of
         * fullscreen.
         */
        const sync = () => {
            if (raf) return;
            raf = requestAnimationFrame(apply);
        };

        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('orientationchange', sync);
        document.addEventListener('fullscreenchange', sync);
        document.addEventListener('webkitfullscreenchange', sync);
        // re-evaluate when the phase changes (menu <-> playing), so the frame can
        // swap between the portrait column and the wide board layout
        const unsub = store.subscribe(sync);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            unsub();
            window.removeEventListener('resize', sync);
            window.removeEventListener('orientationchange', sync);
            document.removeEventListener('fullscreenchange', sync);
            document.removeEventListener('webkitfullscreenchange', sync);
        };
    }, []);

    // browsers only allow sound after a tap: unlock audio and start the music on the first one
    useEffect(() => {
        const unlock = () => {
            audio();
            if (store.get().settings.music) startMusic();
            window.removeEventListener('pointerdown', unlock);
        };
        window.addEventListener('pointerdown', unlock);
        return () => window.removeEventListener('pointerdown', unlock);
    }, []);

    return (
        <div id="app-frame" className="safe-top">
            {/* rotate nudge for phones; no-op on desktop and in landscape */}
            <RotateHint />
            {phase === 'loading' && <LoadingScreen />}
            {phase === 'menu' && <MainMenu />}
            {phase === 'setup' && <SetupScreen />}
            {phase === 'playing' && (
                <>
                    <GameCanvas />
                    <Hud />
                </>
            )}
            {(phase === 'menu' || phase === 'setup') && <FloatingControls />}
            <Modals />
        </div>
    );
}
