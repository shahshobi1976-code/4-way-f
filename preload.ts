import { Assets } from 'pixi.js';
import { manifest } from './manifest';

/** Warms the critical bundle (reporting 0..1) and kicks the deferred bundle off in the background. */
export async function warmAssets(onProgress: (p: number) => void): Promise<void> {
    try {
        if (manifest.critical.length) {
            Assets.addBundle('critical', manifest.critical.map((a) => ({ alias: a.alias, src: a.src })));
            await Assets.loadBundle('critical', onProgress);
        }
        if (manifest.deferred.length) {
            Assets.addBundle('deferred', manifest.deferred.map((a) => ({ alias: a.alias, src: a.src })));
            void Assets.loadBundle('deferred').catch(() => {});
        }
    } catch (e) {
        console.warn('asset warm-up failed', e);
    }
    onProgress(1);
}
