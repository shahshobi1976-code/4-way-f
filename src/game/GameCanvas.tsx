import { useEffect, useRef } from 'react';
import type { Application } from 'pixi.js';
import { createPixiApp } from './pixiApp';
import { createStage } from './stage';
import { createLudoScene } from './ludoScene';
import { store, useStore } from '../state/store';

/** React <-> Pixi boundary. StrictMode-safe: a cancelled mount destroys what it created. */
export function GameCanvas() {
    const hostRef = useRef<HTMLDivElement>(null);
    const gameId = useStore((s) => s.gameId);

    useEffect(() => {
        let cancelled = false;
        let cleanup: (() => void) | null = null;
        void (async () => {
            const host = hostRef.current;
            if (!host) return;
            let app: Application;
            try {
                app = await createPixiApp(host);
            } catch (e) {
                console.error('Pixi failed to start', e);
                return;
            }
            if (cancelled) {
                try {
                    app.destroy(true, { children: false });
                } catch {
                    // Safe cleanup
                }
                return;
            }
            const stage = createStage(app);
            const s = store.get();
            const scene = createLudoScene(app, stage, {
                players: s.players,
                active: s.active.slice(),
                lang: s.settings.lang,
            });

            const syncDimensions = () => {
                if (cancelled || !host || !app.renderer) return;
                const rect = host.getBoundingClientRect();
                const w = Math.round(rect.width || host.clientWidth || window.innerWidth);
                const h = Math.round(rect.height || host.clientHeight || window.innerHeight);
                if (w > 0 && h > 0 && (app.screen.width !== w || app.screen.height !== h)) {
                    app.renderer.resize(w, h);
                }
            };

            const ro = new ResizeObserver(() => {
                syncDimensions();
            });
            ro.observe(host);

            const onOrient = () => {
                syncDimensions();
                window.setTimeout(syncDimensions, 60);
                window.setTimeout(syncDimensions, 180);
                window.setTimeout(syncDimensions, 360);
            };

            window.addEventListener('resize', onOrient);
            window.addEventListener('orientationchange', onOrient);
            window.visualViewport?.addEventListener('resize', onOrient);
            try {
                (screen.orientation as any)?.addEventListener?.('change', onOrient);
            } catch {}

            const unsub = store.subscribe(() => {
                if (store.get().paused) app.ticker.stop();
                else if (!app.ticker.started) app.ticker.start();
            });

            cleanup = () => {
                try { ro.disconnect(); } catch {}
                window.removeEventListener('resize', onOrient);
                window.removeEventListener('orientationchange', onOrient);
                window.visualViewport?.removeEventListener('resize', onOrient);
                try {
                    (screen.orientation as any)?.removeEventListener?.('change', onOrient);
                } catch {}
                try { unsub(); } catch {}
                try { scene.destroy(); } catch {}
                try { stage.destroy(); } catch {}
                try { app.destroy(true, { children: false }); } catch {}
            };
        })();
        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [gameId]);

    return <div ref={hostRef} className="absolute inset-0" />;
}
