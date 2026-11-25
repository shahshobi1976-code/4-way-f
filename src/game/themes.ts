// Board and Dice theme definitions for 4-Way Ludo.

export type BoardThemeId =
    | 'classic'
    | 'jungle'
    | 'pool'
    | 'dancefloor'
    | 'museum'
    | 'cliff'
    | 'galaxy'
    | 'desert'
    | 'city'
    | 'lava'
    | 'ice';

export interface BoardThemeConfig {
    id: BoardThemeId;
    name: string;
    icon: string;
    isDark: boolean;
    slabUnderside: number;
    slabSideLight: number;
    slabSideDark: number;
    surface: number;
    yardInner: number;
    yardRim: number;
    pawnPadFill: number;
    pawnPadRim: number;
    track: number;
    trackAlt: number;
    trackBorder: number;
    safe: number;
    starFill: number;
    starStroke: number;
    startStarFill: number;
    startStarStroke: number;
    homeStroke: number;
    homeTextFill: number;
    homeTextStroke: number;
}

export const BOARD_THEMES: Record<BoardThemeId, BoardThemeConfig> = {
    classic: {
        id: 'classic',
        name: 'Classic Board',
        icon: '🏁',
        isDark: false,
        slabUnderside: 0x24160b,
        slabSideLight: 0x835530,
        slabSideDark: 0x6b4423,
        surface: 0xf4f0e4,
        yardInner: 0xfaf8f0,
        yardRim: 0x8a8f96,
        pawnPadFill: 0xffffff,
        pawnPadRim: 0x64748b,
        track: 0xffffff,
        trackAlt: 0xffffff,
        trackBorder: 0x8a8f96,
        safe: 0xf0f0f0,
        starFill: 0xe8b923,
        starStroke: 0x9a7408,
        startStarFill: 0xffffff,
        startStarStroke: 0x334155,
        homeStroke: 0x1e293b,
        homeTextFill: 0xffffff,
        homeTextStroke: 0x0f172a,
    },
    jungle: {
        id: 'jungle',
        name: 'Jungle Board',
        icon: '🌿',
        isDark: true,
        slabUnderside: 0x162614,
        slabSideLight: 0x4b6b3a,
        slabSideDark: 0x314a25,
        surface: 0x264124,
        yardInner: 0x1e3a1e,
        yardRim: 0x6aa84f,
        pawnPadFill: 0x8d6748,
        pawnPadRim: 0x4f3622,
        track: 0x9aa88c,
        trackAlt: 0x8b9b7d,
        trackBorder: 0x3d5432,
        safe: 0xb6c7a3,
        starFill: 0xfacc15,
        starStroke: 0x14532d,
        startStarFill: 0xfef9c3,
        startStarStroke: 0x14532d,
        homeStroke: 0x1a2e05,
        homeTextFill: 0xfef08a,
        homeTextStroke: 0x14532d,
    },
    pool: {
        id: 'pool',
        name: 'Swimming Pool',
        icon: '🏊',
        isDark: false,
        slabUnderside: 0x0b4b66,
        slabSideLight: 0x38bdf8,
        slabSideDark: 0x0284c7,
        surface: 0xe0f7fa,
        yardInner: 0x22b8cf,
        yardRim: 0xf8fafc,
        pawnPadFill: 0xfef08a,
        pawnPadRim: 0xf97316,
        track: 0x7dd3fc,
        trackAlt: 0x67e8f9,
        trackBorder: 0x0369a1,
        safe: 0xe0f2fe,
        starFill: 0xff6b4a,
        starStroke: 0xffffff,
        startStarFill: 0xffffff,
        startStarStroke: 0x0369a1,
        homeStroke: 0x0c4a6e,
        homeTextFill: 0xffffff,
        homeTextStroke: 0x075985,
    },
    dancefloor: {
        id: 'dancefloor',
        name: 'Neon Dance Floor',
        icon: '🕺',
        isDark: true,
        slabUnderside: 0x05020f,
        slabSideLight: 0x9333ea,
        slabSideDark: 0x4c1d95,
        surface: 0x0d0a1a,
        yardInner: 0x120d26,
        yardRim: 0xec4899,
        pawnPadFill: 0x1e1b4b,
        pawnPadRim: 0x22d3ee,
        track: 0x19162b,
        trackAlt: 0x221d3b,
        trackBorder: 0x00f0ff,
        safe: 0x2a1b4e,
        starFill: 0x39ff14,
        starStroke: 0x05020f,
        startStarFill: 0xffffff,
        startStarStroke: 0x090517,
        homeStroke: 0x00f0ff,
        homeTextFill: 0xffffff,
        homeTextStroke: 0x701a75,
    },
    museum: {
        id: 'museum',
        name: 'Royal Museum',
        icon: '🏛️',
        isDark: false,
        slabUnderside: 0x3b2314,
        slabSideLight: 0xc59b38,
        slabSideDark: 0x8b6914,
        surface: 0xf3ead8,
        yardInner: 0x7a1c28,
        yardRim: 0xd4af37,
        pawnPadFill: 0xfbf5e6,
        pawnPadRim: 0xb8860b,
        track: 0xfaf6ed,
        trackAlt: 0xf1e8d6,
        trackBorder: 0xb89642,
        safe: 0xfcf4dc,
        starFill: 0xd4af37,
        starStroke: 0x5c3d0e,
        startStarFill: 0xfff8dc,
        startStarStroke: 0x5c3d0e,
        homeStroke: 0x854d0e,
        homeTextFill: 0xfef3c7,
        homeTextStroke: 0x451a03,
    },
    cliff: {
        id: 'cliff',
        name: 'Mountain Cliff',
        icon: '⛰️',
        isDark: true,
        slabUnderside: 0x1c2128,
        slabSideLight: 0x6b7280,
        slabSideDark: 0x374151,
        surface: 0x4b5563,
        yardInner: 0x374151,
        yardRim: 0x9ca3af,
        pawnPadFill: 0x9ca3af,
        pawnPadRim: 0x1f2937,
        track: 0xd1d5db,
        trackAlt: 0x9ca3af,
        trackBorder: 0x374151,
        safe: 0xe5e7eb,
        starFill: 0xf59e0b,
        starStroke: 0x1f2937,
        startStarFill: 0xffffff,
        startStarStroke: 0x1f2937,
        homeStroke: 0x111827,
        homeTextFill: 0xffffff,
        homeTextStroke: 0x111827,
    },
    galaxy: {
        id: 'galaxy',
        name: 'Deep Galaxy',
        icon: '🌌',
        isDark: true,
        slabUnderside: 0x030312,
        slabSideLight: 0x4338ca,
        slabSideDark: 0x1e1b4b,
        surface: 0x0b0b24,
        yardInner: 0x08071b,
        yardRim: 0x818cf8,
        pawnPadFill: 0x1e1b4b,
        pawnPadRim: 0xc084fc,
        track: 0x181b40,
        trackAlt: 0x202354,
        trackBorder: 0x6366f1,
        safe: 0x2b255a,
        starFill: 0xfde047,
        starStroke: 0x312e81,
        startStarFill: 0xe0f2fe,
        startStarStroke: 0x1e1b4b,
        homeStroke: 0xa5b4fc,
        homeTextFill: 0xfef08a,
        homeTextStroke: 0x1e1b4b,
    },
    desert: {
        id: 'desert',
        name: 'Golden Desert',
        icon: '🏜️',
        isDark: false,
        slabUnderside: 0x5c3614,
        slabSideLight: 0xd99b4e,
        slabSideDark: 0x9a6324,
        surface: 0xe8c488,
        yardInner: 0xf3d79e,
        yardRim: 0xb47832,
        pawnPadFill: 0xf6dfad,
        pawnPadRim: 0x92571b,
        track: 0xf7e3b7,
        trackAlt: 0xedd198,
        trackBorder: 0xa67032,
        safe: 0xfdf0d1,
        starFill: 0x06b6d4,
        starStroke: 0x164e63,
        startStarFill: 0xffffff,
        startStarStroke: 0x78350f,
        homeStroke: 0x78350f,
        homeTextFill: 0xffffff,
        homeTextStroke: 0x451a03,
    },
    city: {
        id: 'city',
        name: 'High-Rise City',
        icon: '🏙️',
        isDark: true,
        slabUnderside: 0x0f172a,
        slabSideLight: 0x64748b,
        slabSideDark: 0x334155,
        surface: 0x1e293b,
        yardInner: 0x0f172a,
        yardRim: 0x38bdf8,
        pawnPadFill: 0x334155,
        pawnPadRim: 0xfacc15,
        track: 0x475569,
        trackAlt: 0x334155,
        trackBorder: 0x94a3b8,
        safe: 0x64748b,
        starFill: 0xfacc15,
        starStroke: 0x0f172a,
        startStarFill: 0xffffff,
        startStarStroke: 0x0f172a,
        homeStroke: 0x38bdf8,
        homeTextFill: 0xffffff,
        homeTextStroke: 0x020617,
    },
    lava: {
        id: 'lava',
        name: 'Volcanic Lava',
        icon: '🌋',
        isDark: true,
        slabUnderside: 0x140705,
        slabSideLight: 0x9a3412,
        slabSideDark: 0x431407,
        surface: 0x1c1414,
        yardInner: 0x260c07,
        yardRim: 0xf97316,
        pawnPadFill: 0x292524,
        pawnPadRim: 0xfb923c,
        track: 0x2c2525,
        trackAlt: 0x211b1b,
        trackBorder: 0xea580c,
        safe: 0x3f2419,
        starFill: 0xfde047,
        starStroke: 0x7c2d12,
        startStarFill: 0xfef08a,
        startStarStroke: 0x7c2d12,
        homeStroke: 0xf97316,
        homeTextFill: 0xfef08a,
        homeTextStroke: 0x431407,
    },
    ice: {
        id: 'ice',
        name: 'Arctic Ice',
        icon: '❄️',
        isDark: false,
        slabUnderside: 0x0c4a6e,
        slabSideLight: 0x7dd3fc,
        slabSideDark: 0x38bdf8,
        surface: 0xdbeafe,
        yardInner: 0xe0f2fe,
        yardRim: 0x60a5fa,
        pawnPadFill: 0xf0f9ff,
        pawnPadRim: 0x0284c7,
        track: 0xeff6ff,
        trackAlt: 0xdbeafe,
        trackBorder: 0x60a5fa,
        safe: 0xf8fafc,
        starFill: 0x0284c7,
        starStroke: 0xffffff,
        startStarFill: 0xffffff,
        startStarStroke: 0x0369a1,
        homeStroke: 0x0369a1,
        homeTextFill: 0xffffff,
        homeTextStroke: 0x0c4a6e,
    },
};

const LEGACY_BOARD_THEME_MAP: Record<string, BoardThemeId> = {
    mirror: 'ice',
    neon: 'dancefloor',
    wood: 'desert',
    led: 'city',
    gold: 'museum',
};

export function resolveBoardTheme(id: string | undefined): BoardThemeConfig {
    if (id && id in BOARD_THEMES) {
        return BOARD_THEMES[id as BoardThemeId];
    }
    if (id && id in LEGACY_BOARD_THEME_MAP) {
        return BOARD_THEMES[LEGACY_BOARD_THEME_MAP[id]];
    }
    return BOARD_THEMES.classic;
}

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
