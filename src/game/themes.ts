// Board and Dice theme definitions ported from LUDO-EMPEROR and adapted for PixiJS rendering.

export type BoardThemeId = 'classic' | 'mirror' | 'neon' | 'wood' | 'led' | 'gold';

export interface BoardThemeConfig {
    id: BoardThemeId;
    name: string;
    slabUnderside: number;
    slabSideLight: number;
    slabSideDark: number;
    surface: number;
    yardInner: number;
    track: number;
    trackBorder: number;
    safe: number;
    starFill: number;
    starStroke: number;
    homeStroke: number;
}

export const BOARD_THEMES: Record<BoardThemeId, BoardThemeConfig> = {
    classic: {
        id: 'classic',
        name: 'Classic Board',
        slabUnderside: 0x24160b,
        slabSideLight: 0x835530,
        slabSideDark: 0x6b4423,
        surface: 0xf4f0e4,
        yardInner: 0xfaf8f0,
        track: 0xffffff,
        trackBorder: 0x8a8f96,
        safe: 0xf0f0f0,
        starFill: 0xe8b923,
        starStroke: 0x9a7408,
        homeStroke: 0x1e293b,
    },
    mirror: {
        id: 'mirror',
        name: 'Mirror Board',
        slabUnderside: 0x1e293b,
        slabSideLight: 0x64748b,
        slabSideDark: 0x475569,
        surface: 0xcbd5e1,
        yardInner: 0xf1f5f9,
        track: 0xbdc3c7,
        trackBorder: 0x2c3e50,
        safe: 0xecf0f1,
        starFill: 0x38bdf8,
        starStroke: 0x0f172a,
        homeStroke: 0x2c3e50,
    },
    neon: {
        id: 'neon',
        name: 'Neon Board',
        slabUnderside: 0x050814,
        slabSideLight: 0x1e293b,
        slabSideDark: 0x0f172a,
        surface: 0x101322,
        yardInner: 0x161b30,
        track: 0x1a1a1a,
        trackBorder: 0x39ff14,
        safe: 0x222222,
        starFill: 0x39ff14,
        starStroke: 0x00f0ff,
        homeStroke: 0x39ff14,
    },
    wood: {
        id: 'wood',
        name: 'Wood Board',
        slabUnderside: 0x2c1a0c,
        slabSideLight: 0x8b5a2b,
        slabSideDark: 0x5d4037,
        surface: 0xd2a679,
        yardInner: 0xf3dfc1,
        track: 0xdeb887,
        trackBorder: 0x5d4037,
        safe: 0xd2b48c,
        starFill: 0xd97706,
        starStroke: 0x3e2723,
        homeStroke: 0x5d4037,
    },
    led: {
        id: 'led',
        name: 'LED Lights Board',
        slabUnderside: 0x020617,
        slabSideLight: 0x0e7490,
        slabSideDark: 0x164e63,
        surface: 0x05050a,
        yardInner: 0x0f172a,
        track: 0x0a0a12,
        trackBorder: 0x00d4ff,
        safe: 0x111827,
        starFill: 0x00d4ff,
        starStroke: 0xf472b6,
        homeStroke: 0x00d4ff,
    },
    gold: {
        id: 'gold',
        name: 'Royal Gold Board',
        slabUnderside: 0x422006,
        slabSideLight: 0xd4af37,
        slabSideDark: 0x854d0e,
        surface: 0xfef3c7,
        yardInner: 0xfffbeb,
        track: 0xfff9e6,
        trackBorder: 0xd4af37,
        safe: 0xfcf3cf,
        starFill: 0xf59e0b,
        starStroke: 0x7d6608,
        homeStroke: 0xd4af37,
    },
};

export type DiceStyleId =
    | 'classic'
    | 'neon'
    | 'gold'
    | 'wood'
    | 'marble'
    | 'galaxy'
    | 'fire'
    | 'ice'
    | 'dark'
    | 'holographic';

export interface DiceStyleConfig {
    id: DiceStyleId;
    name: string;
    face: number;
    pip: number;
    border: number;
    glow: number | null;
    pattern?: 'marble' | 'galaxy' | 'fire' | 'ice' | 'holo';
}

export const DICE_STYLES: Record<DiceStyleId, DiceStyleConfig> = {
    classic: { id: 'classic', name: 'Classic', face: 0xf5f2f5, pip: 0x1e272e, border: 0x94a3b8, glow: null },
    neon: { id: 'neon', name: 'Neon Cyberpunk', face: 0x001464, pip: 0xffffff, border: 0x38bdf8, glow: 0x38bdf8 },
    gold: { id: 'gold', name: 'Royal Gold', face: 0xd4af37, pip: 0x5d4037, border: 0xf1c40f, glow: 0xf1c40f },
    wood: { id: 'wood', name: 'Wooden Carved', face: 0x8b4513, pip: 0xfde68a, border: 0x5d4037, glow: null },
    marble: { id: 'marble', name: 'Marble Stone', face: 0xe0e0e0, pip: 0x262626, border: 0x999999, glow: null, pattern: 'marble' },
    galaxy: { id: 'galaxy', name: 'Cosmic Galaxy', face: 0x0a0a2a, pip: 0xffffff, border: 0x6366f1, glow: 0x818cf8, pattern: 'galaxy' },
    fire: { id: 'fire', name: 'Fire & Magma', face: 0xc80000, pip: 0xffffff, border: 0xfb923c, glow: 0xef4444, pattern: 'fire' },
    ice: { id: 'ice', name: 'Ice Crystal', face: 0xe0ffff, pip: 0x008b8b, border: 0x67e8f9, glow: 0x22d3ee, pattern: 'ice' },
    dark: { id: 'dark', name: 'Minimalist Dark', face: 0x1a1a1a, pip: 0xffffff, border: 0x52525b, glow: null },
    holographic: { id: 'holographic', name: 'Holographic Gem', face: 0xf0f8ff, pip: 0xda70d6, border: 0x87ceeb, glow: 0xf0abfc, pattern: 'holo' },
};

export const BOARD_THEME_LIST: BoardThemeConfig[] = Object.values(BOARD_THEMES);
export const DICE_STYLE_LIST: DiceStyleConfig[] = Object.values(DICE_STYLES);
