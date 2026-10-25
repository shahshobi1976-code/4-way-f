import { Application, TexturePool, WebGLRenderer, Container } from 'pixi.js';

// PixiJS v8 TexturePool bugfix:
// In PixiJS v8, TexturePoolClass.returnTexture() calls `this._texturePool[key].push(renderTexture)`.
// However, when TexturePool.clear() or GC occurs, `this._texturePool` is reset or uninitialized for that key,
// causing a fatal `TypeError: Cannot read properties of undefined (reading 'push')`.
// This defensive patch ensures the target array exists before calling .push().
try {
    if (TexturePool && typeof (TexturePool as any).returnTexture === 'function') {
        (TexturePool as any).returnTexture = function (renderTexture: any, resetStyle = false) {
            if (!renderTexture) return;
            try {
                const key = this._poolKeyHash?.[renderTexture.uid];
                if (key === undefined || key === null) return;
                if (!this._texturePool) {
                    this._texturePool = {};
                }
                if (!this._texturePool[key]) {
                    this._texturePool[key] = [];
                }
                if (resetStyle && this.textureStyle) {
                    renderTexture.source.style = this.textureStyle;
                }
                this._texturePool[key].push(renderTexture);
            } catch {
                // Absorb any race condition safely without crashing the rendering loop
            }
        };
    }
} catch {
    // Ignore environment variations
}

/** Pixi v8 application factory: DPR cap, autoDensity, transparent canvas that fills `host`. */
export async function createPixiApp(host: HTMLElement): Promise<Application> {
    const app = new Application();
    try {
        await app.init({
            preference: 'webgl',
            resizeTo: host,
            backgroundAlpha: 0,
            antialias: true,
            autoDensity: true,
            // ADAPT: DPR cap (2 keeps phones smooth)
            resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
    } catch (err: any) {
        console.warn('app.init autoDetect fallback to direct WebGLRenderer:', err);
        const renderer = new WebGLRenderer();
        await (renderer as any).init({
            resizeTo: host,
            backgroundAlpha: 0,
            antialias: true,
            autoDensity: true,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
        app.renderer = renderer;
        (app as any).stage = new Container();
        (Application as any)._plugins?.forEach((plugin: any) => {
            try {
                plugin.init?.call(app, {
                    resizeTo: host,
                    autoDensity: true,
                    resolution: Math.min(window.devicePixelRatio || 1, 2),
                });
            } catch {}
        });
    }
    host.appendChild(app.canvas);
    app.canvas.style.display = 'block';
    app.canvas.style.touchAction = 'none';
    return app;
}
