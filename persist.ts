import { safeStorage } from './storage';

// Settings persistence.
//
// The RUN H5 host serves games from an opaque ("null") origin where direct
// browser storage throws, so the SDK's deviceCache is the real storage layer.
// This game must ALSO boot with no host at all (plain `vite dev` in a normal
// browser), where the SDK is absent and localStorage works fine. So:
//   read  : synchronous localStorage first (cheap, and available before React
//           mounts), then the SDK cache is merged in once it is ready.
//   write : the SDK cache when available, localStorage otherwise.
// Every call is guarded: storage problems must never break boot.

const SETTINGS_KEY = 'ludo-emperor-settings';

/** Cached SDK device cache, or null while the host is unavailable. */
let device: { getItem(k: string): Promise<unknown>; setItem(k: string, v: unknown): Promise<unknown> } | null = null;

/** Called once the SDK is initialised; enables host-backed persistence. */
export function attachDeviceCache(api: unknown): void {
    const dc = (api as { deviceCache?: unknown } | null)?.deviceCache as typeof device;
    if (dc && typeof dc.getItem === 'function' && typeof dc.setItem === 'function') device = dc;
}

export const deviceCacheAvailable = () => device !== null;

/** Synchronous best-effort read from browser storage (standalone play). */
export function readLocal(): string | null {
    return safeStorage.getItem(SETTINGS_KEY);
}

/** Write through to whichever storage layer this environment provides. */
export function write(raw: string): void {
    try {
        if (device) {
            void device.setItem(SETTINGS_KEY, raw);
            return;
        }
        safeStorage.setItem(SETTINGS_KEY, raw);
    } catch {
        /* ignore: settings are a nicety, never a hard requirement */
    }
}

/** Read the host-backed copy once the SDK is ready. */
export async function readDevice(): Promise<string | null> {
    if (!device) return null;
    try {
        const v = await device.getItem(SETTINGS_KEY);
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') return JSON.stringify(v);
    } catch {
        /* ignore: fall back to the local copy */
    }
    return null;
}
