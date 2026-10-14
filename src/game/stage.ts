import { Application, Container } from 'pixi.js';
import { store } from '../state/store';

/** Portrait width in design units. Landscape fixes the HEIGHT at 720 units instead. */
export const DESIGN_WIDTH = 720;

export interface Stage {
    root: Container;
    designWidth(): number;
    designHeight(): number;
    landscape(): boolean;
    /** pixels per design unit */
    unit(): number;
    onResize(cb: () => void): () => void;
    destroy(): void;
}

/**
 * Design-resolution stage. Portrait: width is 720 units, height grows with the screen.
 * Landscape (fullscreen on a wide screen): height is 720 units, width grows with the screen.
 */
export function createStage(app: Application): Stage {
    const root = new Container();
    app.stage.addChild(root);
    const subs = new Set<() => void>();
    let w = DESIGN_WIDTH, h = 1280, land = false, u = 1;

    const layout = () => {
        const sw = Math.max(1, app.screen.width);
        const sh = Math.max(1, app.screen.height);
        land = sw > sh * 1.05;
        if (land) {
            u = sh / 720;
            h = 720;
            w = sw / u;
        } else {
            u = sw / DESIGN_WIDTH;
            w = DESIGN_WIDTH;
            h = sh / u;
        }
        root.scale.set(u);
        const frame = document.getElementById('app-frame');
        frame?.style.setProperty('--u', `${u}px`);
        frame?.classList.toggle('land', land);
        if (store.get().landscape !== land) store.patch({ landscape: land });
        subs.forEach((cb) => cb());
    };
    app.renderer.on('resize', layout);
    layout();

    return {
        root,
        designWidth: () => w,
        designHeight: () => h,
        landscape: () => land,
        unit: () => u,
        onResize(cb) {
            subs.add(cb);
            return () => {
                subs.delete(cb);
            };
        },
        destroy() {
            app.renderer.off('resize', layout);
            subs.clear();
        },
    };
}
