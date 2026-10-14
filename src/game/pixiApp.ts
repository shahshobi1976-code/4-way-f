import { Application } from 'pixi.js';

/** Pixi v8 application factory: DPR cap, autoDensity, transparent canvas that fills `host`. */
export async function createPixiApp(host: HTMLElement): Promise<Application> {
    const app = new Application();
    await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        // ADAPT: DPR cap (2 keeps phones smooth)
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        // ADAPT: pixel-art games would set roundPixels: true and texture scaleMode 'nearest'
    });
    host.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    app.canvas.style.touchAction = 'none';
    return app;
}
