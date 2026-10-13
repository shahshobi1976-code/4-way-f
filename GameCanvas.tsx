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
                app.destroy(true, { children: true });
                return;
            }
            const stage = createStage(app);
            const s = store.get();
            const scene = createLudoScene(app, stage, {
                players: s.players,
                active: s.active.slice(),
                lang: s.settings.lang,
            });
            const unsub = store.subscribe(() => {
                if (store.get().paused) app.ticker.stop();
                else if (!app.ticker.started) app.ticker.start();
            });
            cleanup = () => {
                unsub();
                scene.destroy();
                stage.destroy();
                app.destroy(true, { children: true });
            };
        })();
        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [gameId]);

    return <div ref={hostRef} className="absolute inset-0" />;
}
