// RUN.game SDK glue. Every call is guarded: the game must boot and play in a plain browser without the host.
import { attachDeviceCache } from '../state/persist';

let api: any = null;
let ready = false;

/**
 * How long to wait for the SDK before giving up. The SDK's own module body
 * awaits a host handshake at top level, so where there is no RUN host the
 * dynamic import below never settles. On its own that would stall the whole
 * boot forever, so every step here is raced against a timeout.
 */
const hasRunHost = typeof window !== 'undefined' && (!!(window as any).__rundotConfig || !!(globalThis as any).RundotGameAPI);
const HANDSHAKE_MS = hasRunHost ? 4000 : 150;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`RUN SDK timed out after ${ms}ms`)), ms);
        p.then(
            (v) => {
                clearTimeout(t);
                resolve(v);
            },
            (e) => {
                clearTimeout(t);
                reject(e);
            },
        );
    });
}

export async function initSdk(): Promise<void> {
    // The module may be imported but never finish evaluating. It does assign
    // window.RundotGameAPI before its own await, so that global is a usable
    // fallback while the import promise is still pending.
    const globalApi = (): any => (globalThis as any).RundotGameAPI ?? null;

    try {
        const mod: any = await withTimeout(import('@series-inc/rundot-game-sdk'), HANDSHAKE_MS);
        api = mod.default ?? mod.RundotGameAPI ?? mod;
    } catch (e) {
        api = globalApi();
        console.warn('RUN SDK import did not settle, running stand-alone', e);
    }

    // @deprecated in the SDK (calls itself on import) but still the documented
    // readiness barrier, so wait for it — with the same timeout guarantee.
    if (api && typeof api.initializeAsync === 'function' && !api.__initialized) {
        try {
            await withTimeout(Promise.resolve(api.initializeAsync()), HANDSHAKE_MS);
            api.__initialized = true;
        } catch (e) {
            console.warn('RUN SDK not ready, running stand-alone', e);
        }
    }

    try {
        // enables host-backed settings storage, replacing the browser fallback
        attachDeviceCache(api);
    } catch {
        /* ignore: persistence falls back to browser storage */
    }
    // Boot proceeds either way; this only reports whether the host answered.
    ready = !!api;
}

export const sdkReady = () => ready;

export function log(...args: unknown[]) {
    try {
        if (api && typeof api.log === 'function') api.log(...args);
        else console.log(...args);
    } catch {
        /* ignore */
    }
}

export interface Lifecycles {
    onPause?: () => void;
    onResume?: () => void;
    onSleep?: () => void;
    onAwake?: () => void;
    onQuit?: () => void;
    onShow?: () => void;
}

/** Registers every host hook the SDK exposes. Never fire fresh SDK RPCs from sleep/quit handlers. */
export function registerLifecycles(h: Lifecycles) {
    try {
        const lc = api?.lifecycles;
        if (!lc) return;
        (Object.keys(h) as (keyof Lifecycles)[]).forEach((k) => {
            const fn = h[k];
            if (fn && typeof lc[k] === 'function') lc[k](fn);
        });
    } catch (e) {
        console.warn('lifecycle registration failed', e);
    }
}
