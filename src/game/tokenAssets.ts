// ============================================================================
// 4-WAY LUDO TOKENS BUNDLE (EXCLUDING ORANGE)
// ============================================================================
import { Texture } from 'pixi.js';

export const LUDO_4WAY_TOKEN_ASSETS = {
    // 1. Blue Token (Player 3)
    pawn_blue: {
        name: 'Blue Token',
        color: '#2980b9',
        url: 'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_blue_new_034e5f7e-6288-4623-ab27-bfea929ce511.webp',
        aspect_ratio: [207, 449] as [number, number],
    },

    // 2. Green Token (Player 1)
    pawn_green: {
        name: 'Green Token',
        color: '#27ae60',
        url: 'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_green_new_9e1c7486-5fd9-4cd0-8c64-dacf0f14650f.webp',
        aspect_ratio: [216, 465] as [number, number],
    },

    // 3. Red Token (Player 0)
    pawn_red: {
        name: 'Red Token',
        color: '#c0392b',
        url: 'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_red_new_3f7aebf7-05e8-40cf-8524-7715fc45f59b.webp',
        aspect_ratio: [200, 435] as [number, number],
    },

    // 4. Yellow Token (Player 2)
    pawn_yellow: {
        name: 'Yellow Token',
        color: '#f1c40f',
        url: 'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_yellow_new_b842d639-1ad7-4099-aadd-55acb56d3d9f.webp',
        aspect_ratio: [193, 420] as [number, number],
    },
};

/**
 * In our 4-player Ludo board:
 * Player 0 = Red
 * Player 1 = Green
 * Player 2 = Yellow
 * Player 3 = Blue
 */
export const TOKEN_URLS_BY_PLAYER: string[] = [
    LUDO_4WAY_TOKEN_ASSETS.pawn_red.url,    // Player 0 (Red)
    LUDO_4WAY_TOKEN_ASSETS.pawn_green.url,  // Player 1 (Green)
    LUDO_4WAY_TOKEN_ASSETS.pawn_yellow.url, // Player 2 (Yellow)
    LUDO_4WAY_TOKEN_ASSETS.pawn_blue.url,   // Player 3 (Blue)
];

const pawnImageCache = new Map<string, HTMLImageElement>();
const pawnTextureCache = new Map<string, Texture>();

// Preload token images in browser
export function preloadPawnTextures(): void {
    if (typeof window === 'undefined') return;
    TOKEN_URLS_BY_PLAYER.forEach((url) => {
        if (!pawnImageCache.has(url)) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = url;
            img.onload = () => {
                try {
                    const tex = Texture.from(img);
                    pawnTextureCache.set(url, tex);
                } catch {
                    // Safe fallback
                }
            };
            pawnImageCache.set(url, img);
        }
    });
}

// Initiate preload safely in browser environment
if (typeof window !== 'undefined') {
    preloadPawnTextures();
}

export function getCachedPawnTexture(url: string): Texture | undefined {
    if (pawnTextureCache.has(url)) return pawnTextureCache.get(url);
    const img = pawnImageCache.get(url);
    if (img && img.complete && img.naturalWidth > 0) {
        try {
            const tex = Texture.from(img);
            pawnTextureCache.set(url, tex);
            return tex;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

export function loadPawnTexture(url: string): Promise<Texture> {
    const cached = getCachedPawnTexture(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
        let img = pawnImageCache.get(url);
        if (!img) {
            img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = url;
            pawnImageCache.set(url, img);
        }
        if (img.complete && img.naturalWidth > 0) {
            try {
                const tex = Texture.from(img);
                pawnTextureCache.set(url, tex);
                resolve(tex);
                return;
            } catch (e) {
                reject(e);
                return;
            }
        }
        img.addEventListener('load', () => {
            try {
                const tex = Texture.from(img!);
                pawnTextureCache.set(url, tex);
                resolve(tex);
            } catch (e) {
                reject(e);
            }
        }, { once: true });
        img.addEventListener('error', (e) => reject(e), { once: true });
    });
}
