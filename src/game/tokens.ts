// 3D Token Styles: Classic Pawns, 10 Human Action Characters (+ 4-Player Mix),
// and 10 Articulated 3D Wild Animals (+ Wild Animal Mix).
import { Graphics } from 'pixi.js';
import { mix, shade } from './draw';

export type HumanTokenKind =
    | 'belly_dancer'
    | 'sprinter'
    | 'model'
    | 'gymnast'
    | 'wrestler'
    | 'climber'
    | 'ninja'
    | 'skateboarder'
    | 'breakdancer'
    | 'weightlifter';

export type AnimalTokenKind =
    | 'lion'
    | 'elephant'
    | 'eagle'
    | 'horse'
    | 'wolf'
    | 'frog'
    | 'cobra'
    | 'gorilla'
    | 'kangaroo'
    | 'rooster';

export type ResolvedTokenKind = 'default' | HumanTokenKind | AnimalTokenKind;

export type TokenStyleId =
    | 'default'
    | 'human_mix'
    | HumanTokenKind
    | 'animal_mix'
    | AnimalTokenKind;

export type HumanGenderMode = 'auto' | 'girl' | 'boy';

export interface TokenStyleMeta {
    id: TokenStyleId;
    name: string;
    icon: string;
    category: 'classic' | 'human' | 'animal';
}

export const HUMAN_KINDS: HumanTokenKind[] = [
    'belly_dancer',
    'sprinter',
    'model',
    'gymnast',
    'wrestler',
    'climber',
    'ninja',
    'skateboarder',
    'breakdancer',
    'weightlifter',
];

export const ANIMAL_KINDS: AnimalTokenKind[] = [
    'lion',
    'elephant',
    'eagle',
    'horse',
    'wolf',
    'frog',
    'cobra',
    'gorilla',
    'kangaroo',
    'rooster',
];

const HUMAN_MIX_ROSTER: [HumanTokenKind, HumanTokenKind, HumanTokenKind, HumanTokenKind] = [
    'weightlifter',
    'ninja',
    'belly_dancer',
    'breakdancer',
];

const ANIMAL_MIX_ROSTER: [AnimalTokenKind, AnimalTokenKind, AnimalTokenKind, AnimalTokenKind] = [
    'lion',
    'elephant',
    'eagle',
    'horse',
];

export const TOKEN_STYLE_LIST: TokenStyleMeta[] = [
    { id: 'default', name: 'Default (Classic)', icon: '♟️', category: 'classic' },
    { id: 'human_mix', name: '4-Player Mix Roster', icon: '🎭', category: 'human' },
    { id: 'belly_dancer', name: 'Belly Dancer', icon: '💃', category: 'human' },
    { id: 'sprinter', name: '100m Sprinter', icon: '🏃', category: 'human' },
    { id: 'model', name: 'Runway Model', icon: '👠', category: 'human' },
    { id: 'gymnast', name: 'Gymnast', icon: '🤸', category: 'human' },
    { id: 'wrestler', name: 'Wrestler', icon: '🤼', category: 'human' },
    { id: 'climber', name: '3D Climber & Jumper', icon: '🧗', category: 'human' },
    { id: 'ninja', name: 'Ninja Fighter', icon: '🥷', category: 'human' },
    { id: 'skateboarder', name: '3D Skateboarder', icon: '🛹', category: 'human' },
    { id: 'breakdancer', name: 'Breakdancer', icon: '🕺', category: 'human' },
    { id: 'weightlifter', name: 'Weightlifter', icon: '🏋️', category: 'human' },
    { id: 'animal_mix', name: 'Wild Animal Mix', icon: '🐾', category: 'animal' },
    { id: 'lion', name: 'Wild Lion', icon: '🦁', category: 'animal' },
    { id: 'elephant', name: 'Royal Elephant', icon: '🐘', category: 'animal' },
    { id: 'eagle', name: 'Golden Eagle', icon: '🦅', category: 'animal' },
    { id: 'horse', name: 'Wild Stallion', icon: '🐎', category: 'animal' },
    { id: 'wolf', name: 'Alpha Wolf', icon: '🐺', category: 'animal' },
    { id: 'frog', name: 'Tree Frog', icon: '🐸', category: 'animal' },
    { id: 'cobra', name: 'King Cobra', icon: '🐍', category: 'animal' },
    { id: 'gorilla', name: 'Silverback Gorilla', icon: '🦍', category: 'animal' },
    { id: 'kangaroo', name: 'Red Kangaroo', icon: '🦘', category: 'animal' },
    { id: 'rooster', name: 'Fighting Rooster', icon: '🐓', category: 'animal' },
];

export const VALID_TOKEN_STYLE_IDS = new Set<string>(TOKEN_STYLE_LIST.map((t) => t.id));

export function normalizeTokenStyleId(id: string | undefined): TokenStyleId {
    if (id && VALID_TOKEN_STYLE_IDS.has(id)) return id as TokenStyleId;
    return 'default';
}

export function resolveSeatTokenKind(styleId: TokenStyleId | string | undefined, seatIdx: number): ResolvedTokenKind {
    const safeId = normalizeTokenStyleId(styleId);
    const s = ((seatIdx % 4) + 4) % 4;
    if (safeId === 'human_mix') return HUMAN_MIX_ROSTER[s];
    if (safeId === 'animal_mix') return ANIMAL_MIX_ROSTER[s];
    return safeId;
}

function deterministicShuffle<T>(items: readonly T[], seed: number): T[] {
    const arr = items.slice();
    let s = ((seed + 1) * 2654435761) >>> 0;
    for (let i = arr.length - 1; i > 0; i--) {
        s = (Math.imul(s ^ (s >>> 15), 2246822519) + 3266489917) >>> 0;
        const j = s % (i + 1);
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

/**
 * Resolves each seat's token kind for a match (`gameId`).
 * In Pass & Play with AI seats, each AI seat is assigned a distinct character/animal
 * from the active family and rotated every match (`gameId`) so AIs do not repeat
 * or use the same token every game.
 */
export function resolveMatchSeatTokenKind(
    styleId: TokenStyleId | string | undefined,
    seatIdx: number,
    isAiSeat: readonly boolean[] = [],
    gameId = 0,
): ResolvedTokenKind {
    const safeId = normalizeTokenStyleId(styleId);
    const s = ((seatIdx % 4) + 4) % 4;
    if (safeId === 'default') return 'default';

    const hasAi = isAiSeat.some(Boolean);
    if (!hasAi) return resolveSeatTokenKind(safeId, s);

    const isAnimalFamily = safeId === 'animal_mix' || isAnimalTokenKind(safeId);
    const pool: readonly ResolvedTokenKind[] = isAnimalFamily ? ANIMAL_KINDS : HUMAN_KINDS;
    const shuffled = deterministicShuffle(pool, gameId + (isAnimalFamily ? 17 : 53));

    const assigned: (ResolvedTokenKind | null)[] = [null, null, null, null];
    const used = new Set<ResolvedTokenKind>();

    // First assign human seats so they keep their chosen style (or varied mix)
    for (let i = 0; i < 4; i++) {
        if (!isAiSeat[i]) {
            const pick =
                safeId === 'human_mix' || safeId === 'animal_mix'
                    ? shuffled.find((k) => !used.has(k)) || resolveSeatTokenKind(safeId, i)
                    : safeId;
            assigned[i] = pick;
            used.add(pick);
        }
    }

    // Then assign AI seats distinct tokens from the shuffled pool (rotated by gameId)
    for (let i = 0; i < 4; i++) {
        if (assigned[i] === null) {
            const pick = shuffled.find((k) => !used.has(k)) || pool[(i + gameId) % pool.length];
            assigned[i] = pick;
            used.add(pick);
        }
    }

    return assigned[s] || resolveSeatTokenKind(safeId, s);
}

export function isHumanTokenKind(kind: TokenStyleId | ResolvedTokenKind): kind is HumanTokenKind {
    return (HUMAN_KINDS as string[]).includes(kind);
}

export function isAnimalTokenKind(kind: TokenStyleId | ResolvedTokenKind): kind is AnimalTokenKind {
    return (ANIMAL_KINDS as string[]).includes(kind);
}

export interface TokenRenderOpts {
    timeSec: number;
    travelPhase: number;
    speedNorm: number; // 0 = stationary, 0..1 = moving / settling
    hopZ: number; // board jump height (>= 0)
    facingRad: number; // projected 2D facing angle on screen
    gender: 'girl' | 'boy';
    animState: 'idle' | 'move' | 'celebrate';
    celebratePhase: number; // 0..1
}

export type LocomotionMode = 'slither' | 'fly' | 'hop' | 'walk';

export interface LocomotionProfile {
    mode: LocomotionMode;
    hop: number;
    stepMs: number;
    movableBounce: number;
}

export function getTokenLocomotion(kind: ResolvedTokenKind, fromBase = false): LocomotionProfile {
    if (kind === 'cobra') {
        // Slithers smoothly on the board surface with zero vertical jump
        return { mode: 'slither', hop: 0, stepMs: 250, movableBounce: 0 };
    }
    if (kind === 'eagle') {
        // Soars continuously through the air across all tiles in a move
        return { mode: 'fly', hop: 1.05, stepMs: 230, movableBounce: 0.16 };
    }
    if (kind === 'frog') {
        return { mode: 'hop', hop: 0.72, stepMs: 280, movableBounce: 0.28 };
    }
    if (kind === 'kangaroo') {
        return { mode: 'hop', hop: 0.68, stepMs: 270, movableBounce: 0.25 };
    }
    if (kind === 'climber' || kind === 'gymnast') {
        return { mode: 'hop', hop: 0.58, stepMs: 275, movableBounce: 0.24 };
    }
    if (kind === 'default') {
        return { mode: 'hop', hop: 0.55, stepMs: 280, movableBounce: 0.32 };
    }
    // Walking quadrupeds (lion, elephant, horse, wolf, gorilla), strutting rooster, & grounded humans
    const stepMs =
        kind === 'elephant' || kind === 'weightlifter'
            ? 300
            : kind === 'horse' || kind === 'sprinter' || kind === 'ninja'
                ? 225
                : 265;
    return {
        mode: 'walk',
        hop: fromBase ? 0.22 : 0,
        stepMs,
        movableBounce: kind === 'elephant' ? 0.04 : 0.08,
    };
}

// ---------------------------------------------------------------- 3D Projected Rig & Geometry Helpers

function createRig3D(g: Graphics, facingRad: number) {
    const ux = Math.cos(facingRad);
    const uy = Math.sin(facingRad);
    let seq = 0;
    const cmds: { depth: number; seq: number; draw: () => void }[] = [];

    const proj = (f: number, l: number, u: number) => {
        const sx = f * ux - l * uy;
        const gy = f * uy + l * ux;
        const sy = gy * 0.42 - u;
        return { x: sx, y: sy, d: gy };
    };

    const push = (depth: number, draw: () => void) => {
        cmds.push({ depth, seq: seq++, draw });
    };

    const sphere = (
        f: number,
        l: number,
        u: number,
        r: number,
        fill: number,
        stroke?: { width: number; color: number; alpha?: number },
        depthBias = 0,
        alpha = 1,
    ) => {
        const p = proj(f, l, u);
        push(p.d + depthBias, () => {
            g.circle(p.x, p.y, r).fill({ color: fill, alpha });
            if (stroke) g.stroke({ width: stroke.width, color: stroke.color, alpha: stroke.alpha ?? 1 });
        });
    };

    const oval = (
        f: number,
        l: number,
        u: number,
        rf: number,
        rl: number,
        ru: number,
        fill: number,
        stroke?: { width: number; color: number },
        depthBias = 0,
        alpha = 1,
    ) => {
        const p = proj(f, l, u);
        const rx = Math.max(0.012, Math.hypot(rf * ux, rl * uy));
        const ry = Math.max(0.012, Math.hypot(ru, Math.hypot(rf * uy, rl * ux) * 0.42));
        push(p.d + depthBias, () => {
            g.ellipse(p.x, p.y, rx, ry).fill({ color: fill, alpha });
            if (stroke) g.stroke(stroke);
        });
    };

    const capsule = (
        f1: number,
        l1: number,
        u1: number,
        f2: number,
        l2: number,
        u2: number,
        width: number,
        col: number,
        outlineCol?: number,
        outlineExtra = 0.024,
        depthBias = 0,
        alpha = 1,
    ) => {
        const p1 = proj(f1, l1, u1);
        const p2 = proj(f2, l2, u2);
        push((p1.d + p2.d) * 0.5 + depthBias, () => {
            if (outlineCol !== undefined) {
                g.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ width: width + outlineExtra, color: outlineCol, cap: 'round', alpha });
            }
            g.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ width, color: col, cap: 'round', alpha });
        });
    };

    const poly3 = (
        pts3: [number, number, number][],
        fill: number,
        stroke?: { width: number; color: number },
        depthBias = 0,
        alpha = 1,
    ) => {
        let sumD = 0;
        const flat: number[] = [];
        for (const [f, l, u] of pts3) {
            const p = proj(f, l, u);
            sumD += p.d;
            flat.push(p.x, p.y);
        }
        push(sumD / Math.max(1, pts3.length) + depthBias, () => {
            g.poly(flat).fill({ color: fill, alpha });
            if (stroke) g.stroke(stroke);
        });
    };

    const limb = (
        f0: number,
        l0: number,
        u0: number,
        a1: number,
        len1: number,
        a2: number,
        len2: number,
        w1: number,
        w2: number,
        colUpper: number,
        colLower: number,
        outline: number,
        footCol?: number,
        footRadius = 0.04,
        lat1 = 0,
        lat2 = 0,
    ) => {
        const f1 = f0 + Math.sin(a1) * len1;
        const l1 = l0 + lat1;
        const u1 = u0 - Math.cos(a1) * len1;
        const f2 = f1 + Math.sin(a1 + a2) * len2;
        const l2 = l1 + lat2;
        const u2 = u1 - Math.cos(a1 + a2) * len2;

        capsule(f0, l0, u0, f1, l1, u1, w1, colUpper, outline, 0.024);
        capsule(f1, l1, u1, f2, l2, u2, w2, colLower, outline, 0.024);
        sphere(f1, l1, u1, w1 * 0.45, colUpper);
        if (footCol !== undefined) {
            sphere(f2, l2, u2, footRadius, footCol, { width: 0.015, color: outline }, 0.005);
        }
        return { f: f2, l: l2, u: u2 };
    };

    const leg3 = (
        hipF: number,
        hipL: number,
        hipU: number,
        swing: number,
        isFront: boolean,
        isHorseOrKanga: boolean,
        len1: number,
        len2: number,
        len3: number,
        w1: number,
        w2: number,
        colMain: number,
        colLower: number,
        colHoof: number,
        outline: number,
    ) => {
        const lift = Math.max(0, Math.sin(swing * Math.PI * 0.5)) * 0.35;
        const shoulderAng = swing * 0.52 + (isFront ? 0.14 : -0.18);
        const kneeAng = isFront ? (-0.15 - lift * 0.9) : (0.28 + lift * 0.75);
        const fetlockAng = isHorseOrKanga ? (-kneeAng * 0.7 + swing * 0.18) : (-kneeAng * 0.5);

        const f1 = hipF + Math.sin(shoulderAng) * len1;
        const u1 = hipU - Math.cos(shoulderAng) * len1;
        const f2 = f1 + Math.sin(shoulderAng + kneeAng) * len2;
        const u2 = u1 - Math.cos(shoulderAng + kneeAng) * len2;
        const f3 = f2 + Math.sin(shoulderAng + kneeAng + fetlockAng) * len3;
        const u3 = u2 - Math.cos(shoulderAng + kneeAng + fetlockAng) * len3;

        capsule(hipF, hipL, hipU, f1, hipL, u1, w1, colMain, outline, 0.022);
        capsule(f1, hipL, u1, f2, hipL, u2, w2, colLower, outline, 0.02);
        capsule(f2, hipL, u2, f3, hipL, u3, w2 * 0.85, colLower, outline, 0.018);
        sphere(f1, hipL, u1, w1 * 0.42, colMain);
        sphere(f2, hipL, u2, w2 * 0.42, colLower);
        oval(f3, hipL, u3, w2 * 0.65, w2 * 0.52, w2 * 0.45, colHoof, { width: 0.014, color: outline }, 0.004);
    };

    const flush = () => {
        cmds.sort((a, b) => (a.depth - b.depth) || (a.seq - b.seq));
        for (let i = 0; i < cmds.length; i++) cmds[i].draw();
    };

    return { ux, uy, proj, sphere, oval, capsule, poly3, limb, leg3, flush };
}

type Rig3D = ReturnType<typeof createRig3D>;

function drawPedestal(g: Graphics, seatColor: number, radius = 0.34) {
    const dark = shade(seatColor, 0.52);
    const light = mix(seatColor, 0xffffff, 0.32);
    g.ellipse(0, -0.02, radius, radius * 0.38).fill(dark).stroke({ width: 0.02, color: shade(seatColor, 0.32) });
    g.ellipse(0, -0.06, radius * 0.88, radius * 0.32).fill(seatColor);
    g.ellipse(-radius * 0.16, -0.07, radius * 0.46, radius * 0.14).fill({ color: light, alpha: 0.42 });
}

function drawHumanHead3D(
    rig: Rig3D,
    hf: number,
    hl: number,
    hu: number,
    r: number,
    skin: number,
    hair: number,
    seatColor: number,
    gender: 'girl' | 'boy',
    style: 'bun' | 'ponytail' | 'short' | 'headband' | 'hood' | 'cap' | 'afro' = 'short',
) {
    const outline = 0x1e293b;
    if (gender === 'girl' && style !== 'hood' && style !== 'cap') {
        rig.oval(hf - r * 0.52, hl, hu - r * 0.2, r * 0.56, r * 0.92, r * 1.02, hair, { width: 0.018, color: outline });
    }
    if (style === 'afro') {
        rig.sphere(hf - r * 0.08, hl, hu + r * 0.14, r * 1.32, hair, { width: 0.02, color: outline });
    }
    if (style === 'hood') {
        rig.sphere(hf, hl, hu, r * 1.08, shade(seatColor, 0.38), { width: 0.022, color: 0x0f172a });
        // Skin eye visor strictly on the front hemisphere so walking away hides face cleanly
        rig.capsule(hf + r * 0.76, hl - r * 0.36, hu + r * 0.1, hf + r * 0.76, hl + r * 0.36, hu + r * 0.1, r * 0.38, skin, 0x0f172a, 0.01, 0.008);
        rig.sphere(hf + r * 0.88, hl - r * 0.24, hu + r * 0.12, r * 0.14, 0x0f172a, undefined, 0.014);
        rig.sphere(hf + r * 0.88, hl + r * 0.24, hu + r * 0.12, r * 0.14, 0x0f172a, undefined, 0.014);
        // Trailing ninja bandana behind head (-fwd)
        rig.capsule(hf - r * 0.88, hl, hu + r * 0.08, hf - r * 1.85, hl - r * 0.18, hu + r * 0.22, r * 0.34, seatColor, 0x0f172a, 0.014);
        rig.capsule(hf - r * 0.88, hl, hu + r * 0.04, hf - r * 1.65, hl + r * 0.22, hu - r * 0.08, r * 0.28, shade(seatColor, 0.8), 0x0f172a, 0.012);
        return;
    }

    // Head sphere
    rig.sphere(hf, hl, hu, r, skin, { width: 0.022, color: outline });
    // Soft highlight & dual front eyes (occluded cleanly behind head sphere when facing away!)
    rig.sphere(hf + r * 0.35, hl - r * 0.2, hu + r * 0.32, r * 0.28, 0xffffff, undefined, 0.002, 0.2);
    rig.sphere(hf + r * 0.84, hl - r * 0.34, hu + r * 0.08, r * 0.145, 0x0f172a, undefined, 0.008);
    rig.sphere(hf + r * 0.84, hl + r * 0.34, hu + r * 0.08, r * 0.145, 0x0f172a, undefined, 0.008);

    if (style === 'cap') {
        rig.oval(hf - r * 0.05, hl, hu + r * 0.5, r * 1.02, r * 1.02, r * 0.54, seatColor, { width: 0.02, color: outline }, 0.004);
        // Forward-pointing cap brim strictly along +fwd
        rig.capsule(hf + r * 0.45, hl, hu + r * 0.22, hf + r * 1.36, hl, hu + r * 0.12, r * 0.68, shade(seatColor, 0.72), outline, 0.016, 0.012);
    } else if (style === 'bun') {
        rig.sphere(hf - r * 0.65, hl, hu + r * 0.84, r * 0.54, hair, { width: 0.018, color: outline }, 0.003);
        rig.oval(hf - r * 0.14, hl, hu + r * 0.55, r * 0.96, r * 0.96, r * 0.48, hair, undefined, 0.002);
    } else if (style === 'ponytail') {
        rig.capsule(hf - r * 0.55, hl, hu + r * 0.35, hf - r * 1.18, hl, hu - r * 0.38, r * 0.72, hair, outline, 0.016);
        rig.oval(hf - r * 0.14, hl, hu + r * 0.56, r * 0.96, r * 0.96, r * 0.46, hair, undefined, 0.002);
    } else if (style !== 'afro') {
        rig.oval(hf - r * 0.15, hl, hu + r * 0.52, r * 0.96, r * 0.96, r * 0.48, hair, undefined, 0.002);
    }

    if (style === 'headband') {
        rig.oval(hf, hl, hu + r * 0.34, r * 1.04, r * 1.04, r * 0.22, seatColor, undefined, 0.006);
        rig.capsule(hf - r * 0.9, hl, hu + r * 0.32, hf - r * 1.45, hl + r * 0.2, hu + r * 0.16, r * 0.22, seatColor);
    }
    if (gender === 'girl' && style === 'short') {
        rig.sphere(hf - r * 0.72, hl, hu + r * 0.45, r * 0.38, hair, undefined, 0.002);
    }
}

// ---------------------------------------------------------------- Human Characters (10)

function drawHumanToken(g: Graphics, kind: HumanTokenKind, seatColor: number, opts: TokenRenderOpts) {
    drawPedestal(g, seatColor, 0.33);

    const rig = createRig3D(g, opts.facingRad);
    const isMoving = opts.speedNorm > 0.05;
    const isCel = opts.animState === 'celebrate';
    const spd = Math.min(1, opts.speedNorm);
    const phase = opts.travelPhase;
    const t = opts.timeSec;

    const dark = shade(seatColor, 0.55);
    const light = mix(seatColor, 0xffffff, 0.34);
    const accent = mix(seatColor, 0xfef08a, 0.55);
    const outline = 0x1e293b;
    const skin = 0xf2b88f;
    const hair = opts.gender === 'girl' ? 0x2c1b18 : 0x1f2937;

    // ------------------------------------------------------------ WEIGHTLIFTER (DUAL INDEPENDENT DUMBBELLS hL & hR)
    if (kind === 'weightlifter') {
        const stride = isMoving ? Math.sin(phase * 1.15) * spd : 0;
        const bob = isMoving ? Math.abs(Math.sin(phase * 1.15)) * 0.05 : Math.sin(t * 2.2) * 0.02;
        const hipU = 0.36 + bob;
        const torsoU = 0.58 + bob;

        // Braced stance legs (left & right laterally separated, striding along +fwd)
        rig.limb(0, -0.11, hipU, stride * 0.38, 0.2, -0.12, 0.18, 0.09, 0.08, dark, shade(seatColor, 0.42), outline, 0x111827, 0.055);
        rig.limb(0, 0.11, hipU, -stride * 0.38, 0.2, -0.12, 0.18, 0.09, 0.08, seatColor, dark, outline, 0x111827, 0.055);

        // Muscular singlet torso + championship belt
        rig.oval(0, 0, torsoU, 0.11, 0.18, 0.19, seatColor, { width: 0.024, color: outline });
        rig.oval(0, 0, hipU + 0.04, 0.115, 0.145, 0.055, 0x1e293b, { width: 0.015, color: 0xfacc15 }, 0.004);

        drawHumanHead3D(rig, 0.02, 0, torsoU + 0.30, 0.13, skin, hair, seatColor, opts.gender, 'headband');

        // Helper for drawing a distinct 3D iron dumbbell held directly by a hand
        const drawDumbbell = (hf: number, hl: number, hu: number, tiltF: number) => {
            const df = 0.12;
            const du = tiltF;
            rig.capsule(hf - df, hl, hu - du, hf + df, hl, hu + du, 0.035, 0xcbd5e1, 0x0f172a, 0.01);
            for (const sgn of [-1, 1] as const) {
                const pf = hf + df * sgn;
                const pu = hu + du * sgn;
                rig.sphere(pf, hl, pu, 0.076, 0x334155, { width: 0.018, color: 0x0f172a }, 0.004);
                rig.sphere(pf + 0.015, hl - 0.015, pu + 0.02, 0.028, 0x94a3b8, undefined, 0.006, 0.7);
            }
        };

        // TWO SEPARATE INDEPENDENT DUMBBELLS:
        // Walking -> alternating independent bicep curls between left arm (hL) and right arm (hR)
        // Idle / Celebrate -> overhead twin dumbbell press!
        let leftSh: number, leftEl: number, rightSh: number, rightEl: number;
        let latSpread1 = 0, latSpread2 = 0;

        if (isMoving) {
            const curlL = 0.5 + 0.5 * Math.sin(phase * 1.15);
            const curlR = 0.5 - 0.5 * Math.sin(phase * 1.15);
            leftSh = 0.25 + curlL * 0.25;
            leftEl = 1.25 + curlL * 0.95;
            rightSh = 0.25 + curlR * 0.25;
            rightEl = 1.25 + curlR * 0.95;
            latSpread1 = 0.04;
            latSpread2 = 0.02;
        } else {
            const pressWave = isCel ? 0.5 + 0.5 * Math.sin(t * 9) : 0.45 + 0.45 * Math.sin(t * 2.4);
            leftSh = 2.65 + pressWave * 0.42;
            leftEl = -0.35;
            rightSh = 2.65 + pressWave * 0.42;
            rightEl = -0.35;
            latSpread1 = 0.06;
            latSpread2 = -0.02;
        }

        const hL = rig.limb(0, -0.19, torsoU + 0.12, leftSh, 0.17, leftEl, 0.16, 0.075, 0.065, skin, skin, outline, skin, 0.04, -latSpread1, -latSpread2);
        drawDumbbell(hL.f, hL.l, hL.u, isMoving ? 0.04 : 0.01);

        const hR = rig.limb(0, 0.19, torsoU + 0.12, rightSh, 0.17, rightEl, 0.16, 0.075, 0.065, skin, skin, outline, skin, 0.04, latSpread1, latSpread2);
        drawDumbbell(hR.f, hR.l, hR.u, isMoving ? -0.04 : -0.01);

        rig.flush();
        return;
    }

    // ------------------------------------------------------------ 3D SKATEBOARDER (board + wheels + ollie hop)
    if (kind === 'skateboarder') {
        const crouch = isMoving ? 0.05 + opts.hopZ * 0.12 : 0.03;
        const deckTilt = isMoving ? Math.sin(phase * 0.9) * 0.12 - opts.hopZ * 0.25 : Math.sin(t * 2.5) * 0.04;
        const deckU = 0.15 + (isMoving ? Math.abs(Math.sin(phase * 0.9)) * 0.05 : 0);

        // Skateboard deck & spinning wheels aligned along path (+fwd)
        const du1 = Math.sin(deckTilt) * 0.32;
        const du2 = -Math.sin(deckTilt) * 0.32;
        rig.capsule(-0.35, 0, deckU + du1 + 0.04, -0.30, 0, deckU + du1, 0.055, dark, outline, 0.012);
        rig.capsule(-0.30, 0, deckU + du1, 0.30, 0, deckU + du2, 0.08, seatColor, dark, 0.022);
        rig.capsule(0.30, 0, deckU + du2, 0.35, 0, deckU + du2 + 0.04, 0.055, dark, outline, 0.012);
        for (const wf of [-0.21, 0.21] as const) {
            const wu = deckU + (wf / 0.32) * (-Math.sin(deckTilt) * 0.32) - 0.055;
            for (const wl of [-0.065, 0.065] as const) {
                rig.sphere(wf, wl, wu, 0.044, 0xfef08a, { width: 0.015, color: outline });
                rig.sphere(wf, wl, wu, 0.015, 0x1e293b, undefined, 0.002);
            }
        }

        const hipU = deckU + 0.30 - crouch;
        const torsoU = hipU + 0.22;
        rig.limb(-0.06, -0.08, hipU, -0.32, 0.18, 0.36, 0.17, 0.068, 0.058, dark, dark, outline, 0xffffff, 0.042);
        rig.limb(0.06, 0.08, hipU, 0.34, 0.18, -0.34, 0.17, 0.068, 0.058, seatColor, seatColor, outline, 0xffffff, 0.042);

        rig.oval(0, 0, torsoU, 0.09, 0.13, 0.16, seatColor, { width: 0.022, color: outline });
        drawHumanHead3D(rig, 0.03, 0, torsoU + 0.26, 0.12, skin, hair, seatColor, opts.gender, 'cap');

        const armBal = Math.sin(isMoving ? phase * 0.9 : t * 3.1) * 0.32;
        rig.limb(0, -0.12, torsoU + 0.11, -0.7 + armBal, 0.16, -0.25, 0.14, 0.055, 0.045, light, skin, outline, skin, 0.032, -0.07, -0.04);
        rig.limb(0, 0.12, torsoU + 0.11, 0.7 + armBal, 0.16, 0.25, 0.14, 0.055, 0.045, light, skin, outline, skin, 0.032, 0.07, 0.04);

        rig.flush();
        return;
    }

    // ------------------------------------------------------------ GYMNAST (acrobatic flip when hopping / celebrating)
    if (kind === 'gymnast') {
        const flipAngle = isCel
            ? opts.celebratePhase * Math.PI * 2
            : opts.hopZ > 0.06
                ? Math.min(1, opts.hopZ / 0.55) * Math.PI * 2
                : 0;
        const pivotU = 0.58;
        const rotFU = (f: number, u: number): [number, number] => {
            if (flipAngle === 0) return [f, u];
            const du = u - pivotU;
            const c = Math.cos(flipAngle), s = Math.sin(flipAngle);
            return [f * c - du * s, pivotU + f * s + du * c];
        };

        const stride = isMoving ? Math.sin(phase * 1.2) * spd : 0;
        const legOff = isCel ? 0.3 : 0;
        const [hfL, huL] = rotFU(0, 0.40);
        const [hfR, huR] = rotFU(0, 0.40);
        rig.limb(hfL, -0.07, huL, flipAngle + stride * 0.45 - legOff, 0.19, 0.15, 0.18, 0.055, 0.045, skin, skin, outline, accent, 0.034);
        rig.limb(hfR, 0.07, huR, flipAngle - stride * 0.45 + legOff, 0.19, -0.1, 0.18, 0.055, 0.045, skin, skin, outline, accent, 0.034);

        const [tf0, tu0] = rotFU(0, 0.40);
        const [tf1, tu1] = rotFU(0, 0.68);
        rig.capsule(tf0, 0, tu0, tf1, 0, tu1, 0.18, seatColor, outline, 0.022);

        const [headF, headU] = rotFU(0.01, 0.82);
        drawHumanHead3D(rig, headF, 0, headU, 0.12, skin, hair, seatColor, opts.gender, 'bun');

        const armUp = isCel ? 2.6 : 2.15 + Math.sin(t * 2.5) * 0.25;
        const [afL, auL] = rotFU(0, 0.65);
        const [afR, auR] = rotFU(0, 0.65);
        rig.limb(afL, -0.11, auL, flipAngle + armUp, 0.16, -0.2, 0.14, 0.048, 0.04, skin, skin, outline, accent, 0.03, -0.04, -0.03);
        rig.limb(afR, 0.11, auR, flipAngle + armUp, 0.16, -0.2, 0.14, 0.048, 0.04, skin, skin, outline, accent, 0.03, 0.04, 0.03);

        rig.flush();
        return;
    }

    // ------------------------------------------------------------ BREAKDANCER (top-rock groove & spin/freeze)
    if (kind === 'breakdancer') {
        const groove = isMoving ? Math.sin(phase * 1.4) * spd : Math.sin(t * 4.8) * 0.35;
        const freezeInvert = isCel && Math.sin(opts.celebratePhase * Math.PI) > 0.2;
        if (freezeInvert) {
            rig.limb(0, 0, 0.45, 0.05, 0.16, 0.05, 0.16, 0.065, 0.055, light, skin, outline, 0xffffff, 0.04);
            rig.oval(0, 0, 0.56, 0.10, 0.14, 0.14, seatColor, { width: 0.022, color: outline });
            drawHumanHead3D(rig, 0.06, 0, 0.34, 0.11, skin, hair, seatColor, opts.gender, 'cap');
            rig.limb(0, -0.08, 0.70, 2.55, 0.2, -0.4, 0.2, 0.065, 0.055, dark, dark, outline, 0xffffff, 0.042, -0.06, -0.06);
            rig.limb(0, 0.08, 0.70, -2.25, 0.2, 0.4, 0.2, 0.065, 0.055, seatColor, seatColor, outline, 0xffffff, 0.042, 0.06, 0.06);
            rig.flush();
            return;
        }
        const bob = Math.abs(Math.sin(isMoving ? phase * 1.4 : t * 4.8)) * 0.06;
        const hipU = 0.38 + bob;
        const torsoU = hipU + 0.24;
        rig.limb(0, -0.09, hipU, -0.25 + groove * 0.45, 0.19, 0.25, 0.18, 0.072, 0.062, dark, dark, outline, 0xffffff, 0.045);
        rig.limb(0, 0.09, hipU, 0.25 - groove * 0.45, 0.19, -0.15, 0.18, 0.072, 0.062, seatColor, seatColor, outline, 0xffffff, 0.045);
        rig.oval(0, groove * 0.03, torsoU, 0.10, 0.14, 0.15, seatColor, { width: 0.022, color: outline });
        drawHumanHead3D(rig, 0.02, groove * 0.05, torsoU + 0.26, 0.12, skin, hair, seatColor, opts.gender, 'cap');
        rig.limb(0, -0.12, torsoU + 0.1, -0.6 + groove * 0.7, 0.16, 0.6, 0.14, 0.055, 0.045, light, skin, outline, skin, 0.034, -0.05, -0.03);
        rig.limb(0, 0.12, torsoU + 0.1, 0.6 + groove * 0.7, 0.16, -0.6, 0.14, 0.055, 0.045, light, skin, outline, skin, 0.034, 0.05, 0.03);
        rig.flush();
        return;
    }

    // ------------------------------------------------------------ Standard Dynamic Articulated Human Rig for remaining 6 styles
    const stride = isMoving ? Math.sin(phase * 1.35) * spd : 0;
    const idlePulse = Math.sin(t * 2.8);

    const leanFwd = kind === 'sprinter' ? 0.24 : kind === 'ninja' ? 0.20 : kind === 'climber' ? 0.13 : 0.02;
    const swayLat = kind === 'belly_dancer' ? Math.sin(isMoving ? phase * 1.2 : t * 4.2) * 0.075 : 0;
    const crouchU = kind === 'wrestler' || kind === 'ninja' ? 0.07 : kind === 'climber' ? Math.max(0, 0.08 - opts.hopZ * 0.14) : 0;
    const bob = isMoving
        ? Math.abs(Math.sin(phase * 1.35)) * (kind === 'climber' ? 0.11 : 0.055)
        : Math.sin(t * 2.6) * 0.018;

    const hipU = 0.40 - crouchU + bob;
    const torsoH = 0.28 - crouchU * 0.35;
    const torsoTopU = hipU + torsoH;
    const shoulderF = leanFwd * 0.52;
    const headF = shoulderF + leanFwd * 0.36;
    const headU = torsoTopU + 0.13;

    // Legs striding along path direction (+fwd)
    const legStrideScale = kind === 'sprinter' || kind === 'ninja' ? 0.72 : kind === 'model' ? 0.52 : 0.45;
    const kneeFlex = kind === 'wrestler' || kind === 'ninja' ? -0.34 : -0.14;
    const legCol = kind === 'belly_dancer' ? mix(seatColor, 0xfef08a, 0.35) : dark;
    const legW = kind === 'wrestler' ? 0.082 : kind === 'model' ? 0.05 : 0.064;

    rig.limb(
        0,
        -0.085 + swayLat * 0.5,
        hipU,
        stride * legStrideScale,
        0.19,
        kneeFlex - Math.max(0, stride) * 0.32,
        0.18,
        legW,
        legW * 0.84,
        legCol,
        kind === 'belly_dancer' ? skin : shade(legCol, 0.8),
        outline,
        kind === 'model' ? accent : 0x1e293b,
        0.036,
    );
    rig.limb(
        0,
        0.085 + swayLat * 0.5,
        hipU,
        -stride * legStrideScale,
        0.19,
        kneeFlex - Math.max(0, -stride) * 0.32,
        0.18,
        legW,
        legW * 0.84,
        seatColor,
        kind === 'belly_dancer' ? skin : dark,
        outline,
        kind === 'model' ? accent : 0x1e293b,
        0.036,
    );

    // Torso capsule & flared shoulders
    const wLat = kind === 'wrestler' ? 0.17 : kind === 'model' ? 0.11 : 0.135;
    rig.capsule(0, swayLat, hipU + 0.04, shoulderF, swayLat, torsoTopU - 0.03, wLat * 1.4, seatColor, outline, 0.022);
    rig.oval(shoulderF, swayLat, torsoTopU - 0.05, 0.09, wLat, 0.09, seatColor, { width: 0.018, color: outline }, 0.002);

    // Character flair (belly dancer gold coin belt + trailing veil; wrestler belt; model trailing sash)
    if (kind === 'belly_dancer') {
        rig.oval(0.01, swayLat, hipU - 0.01, 0.11, 0.16, 0.055, 0xfacc15, { width: 0.015, color: 0x92400e }, 0.004);
        rig.capsule(shoulderF - 0.08, swayLat - 0.08, torsoTopU - 0.05, -0.24, swayLat - 0.14 - swayLat * 0.5, hipU - 0.16, 0.14, accent, undefined, 0, -0.01, 0.72);
    } else if (kind === 'wrestler') {
        rig.oval(0.02, swayLat, hipU + 0.04, 0.11, 0.14, 0.065, 0xfacc15, { width: 0.015, color: 0x78350f }, 0.004);
    } else if (kind === 'model') {
        rig.capsule(shoulderF + 0.04, swayLat + 0.08, torsoTopU - 0.04, -0.20, swayLat + 0.13, hipU - 0.08, 0.065, accent);
    }

    const headStyle =
        kind === 'ninja'
            ? 'hood'
            : kind === 'belly_dancer' || kind === 'model'
                ? 'ponytail'
                : kind === 'sprinter' || kind === 'climber'
                    ? 'headband'
                    : 'short';
    drawHumanHead3D(rig, headF, swayLat, headU, 0.118, skin, hair, seatColor, opts.gender, headStyle);

    // Arms per character
    const armW = kind === 'wrestler' ? 0.072 : 0.05;
    let shL = -stride * 0.55;
    let shR = stride * 0.55;
    let elL = 0.45;
    let elR = 0.45;
    let armSpread = 0.02;

    if (kind === 'belly_dancer') {
        const wv = Math.sin(isMoving ? phase * 1.2 : t * 4.2);
        shL = 1.65 + wv * 0.45;
        elL = 0.55 + wv * 0.25;
        shR = 1.65 - wv * 0.45;
        elR = 0.55 - wv * 0.25;
        armSpread = 0.09;
    } else if (kind === 'climber') {
        const reach = isMoving ? Math.sin(phase * 1.6) * 0.6 : Math.sin(t * 3.5) * 0.25;
        shL = 2.35 + reach;
        elL = 0.35;
        shR = 2.35 - reach;
        elR = 0.35;
        armSpread = 0.05;
    } else if (kind === 'model') {
        shL = -stride * 0.35;
        elL = isMoving ? 0.2 : 1.15;
        shR = stride * 0.35;
        elR = isCel ? 1.8 : 0.25;
        armSpread = 0.04;
    } else if (kind === 'wrestler') {
        const grap = isCel ? 2.2 : 0.9 + idlePulse * 0.15;
        shL = grap;
        elL = 0.65;
        shR = grap;
        elR = 0.65;
        armSpread = 0.06;
    } else if (kind === 'ninja') {
        if (isCel) {
            shL = 1.9; elL = -0.15;
            shR = -1.2; elR = 0.7;
        } else {
            // Swept-back ninja run arms trailing behind (-fwd) while leaping forward
            shL = -0.95 - stride * 0.3;
            elL = -0.35;
            shR = -0.75 + stride * 0.3;
            elR = -0.35;
        }
        armSpread = 0.04;
    } else if (kind === 'sprinter') {
        shL = 0.45 - stride * 0.85;
        elL = 1.15;
        shR = 0.45 + stride * 0.85;
        elR = 1.15;
    }

    rig.limb(shoulderF, swayLat - wLat * 0.92, torsoTopU - 0.04, shL, 0.15, elL, 0.14, armW, armW * 0.82, light, skin, outline, skin, 0.032, -armSpread, -armSpread * 0.5);
    rig.limb(shoulderF, swayLat + wLat * 0.92, torsoTopU - 0.04, shR, 0.15, elR, 0.14, armW, armW * 0.82, light, skin, outline, skin, 0.032, armSpread, armSpread * 0.5);

    rig.flush();
}

// ---------------------------------------------------------------- Articulated 3D Wild Animals (10)

function drawAnimalToken(g: Graphics, kind: AnimalTokenKind, seatColor: number, opts: TokenRenderOpts) {
    // Ground color identity for animals is rendered via the wide colored shadow/spotlight ring on shadowLayer
    const rig = createRig3D(g, opts.facingRad);
    const isMoving = opts.speedNorm > 0.05;
    const isCel = opts.animState === 'celebrate';
    const spd = Math.min(1, opts.speedNorm);
    const phase = opts.travelPhase;
    const t = opts.timeSec;
    const outline = 0x1e293b;

    // ------------------------------------------------------------ 1. KING COBRA (ground S-wave slither + raised swaying hood + flickering forked tongue)
    if (kind === 'cobra') {
        const coat = mix(0x7c2d12, seatColor, 0.38);
        const belly = mix(0xfde047, seatColor, 0.2);
        const slitherFreq = isMoving ? phase * 2.2 : t * 2.6;
        const slitherAmp = isMoving ? 0.17 * spd : 0.045;
        const stretchBack = isMoving ? 0.44 : 0.28;
        const hoodRise = isMoving ? 0.34 : 0.58;

        const segPts: [number, number, number][] = [];
        const segCount = 11;
        for (let i = 0; i < segCount; i++) {
            const frac = i / (segCount - 1);
            const sf = -stretchBack + frac * (stretchBack + 0.08);
            const sl = Math.sin(slitherFreq - frac * 5.6) * slitherAmp * (1 - frac * 0.45);
            const groundRipple = isMoving ? Math.sin(slitherFreq * 1.4 - frac * 6.0) * 0.025 * (1 - frac) : 0;
            const su = 0.07 - groundRipple + Math.pow(frac, isMoving ? 2.4 : 1.65) * hoodRise;
            segPts.push([sf, sl, su]);
        }
        for (let i = 0; i < segPts.length - 1; i++) {
            const pA = segPts[i], pB = segPts[i + 1];
            const w = 0.048 + (i / segPts.length) * 0.082;
            rig.capsule(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], w, i % 2 === 0 ? coat : shade(coat, 0.78), outline, 0.025);
        }

        // Raised swaying hood (wide laterally, thin front-to-back!)
        const top = segPts[segPts.length - 1];
        const hoodSway = Math.sin(isMoving ? phase * 1.4 : t * 3.4) * (isCel ? 0.1 : 0.05);
        const hf = top[0] + 0.02;
        const hl = top[1] + hoodSway;
        const hu = top[2] + 0.10 + (isCel ? Math.abs(Math.sin(t * 7)) * 0.08 : 0);

        rig.oval(hf, hl, hu - 0.06, 0.075, isMoving ? 0.18 : 0.21, isMoving ? 0.2 : 0.24, coat, { width: 0.024, color: outline });
        rig.oval(hf + 0.035, hl, hu - 0.07, 0.04, 0.11, isMoving ? 0.15 : 0.18, belly, undefined, 0.004);
        // Spectacle marks on hood back (-fwd)
        rig.sphere(hf - 0.05, hl - 0.065, hu - 0.06, 0.028, 0xfef08a, { width: 0.014, color: 0x0f172a }, 0.006);
        rig.sphere(hf - 0.05, hl + 0.065, hu - 0.06, 0.028, 0xfef08a, { width: 0.014, color: 0x0f172a }, 0.006);

        // Cobra head extending forward (+fwd) + eyes + flickering forked tongue
        rig.oval(hf + 0.09, hl, hu + 0.10, 0.13, 0.09, 0.08, coat, { width: 0.022, color: outline }, 0.005);
        rig.sphere(hf + 0.15, hl - 0.05, hu + 0.12, 0.024, 0xfef08a, { width: 0.01, color: 0x0f172a }, 0.012);
        rig.sphere(hf + 0.15, hl + 0.05, hu + 0.12, 0.024, 0xfef08a, { width: 0.01, color: 0x0f172a }, 0.012);
        if (Math.sin(t * 14) > -0.2) {
            const tf = hf + 0.21;
            const tu = hu + 0.09;
            const tLen = 0.09 + 0.04 * Math.sin(t * 28);
            rig.capsule(tf, hl, tu, tf + tLen, hl, tu - 0.01, 0.018, 0xef4444, undefined, 0, 0.01);
            rig.capsule(tf + tLen, hl, tu - 0.01, tf + tLen + 0.045, hl - 0.03, tu + 0.02, 0.013, 0xef4444, undefined, 0, 0.01);
            rig.capsule(tf + tLen, hl, tu - 0.01, tf + tLen + 0.045, hl + 0.03, tu - 0.03, 0.013, 0xef4444, undefined, 0, 0.01);
        }
        rig.flush();
        return;
    }

    // ------------------------------------------------------------ 2. GOLDEN EAGLE & FIGHTING ROOSTER (layered feather plumes + fanned tail)
    if (kind === 'eagle' || kind === 'rooster') {
        const isEagle = kind === 'eagle';
        const bodyCol = isEagle ? mix(0x78350f, seatColor, 0.28) : mix(0xdc2626, seatColor, 0.35);
        const wingCol = isEagle ? mix(0x92400e, seatColor, 0.25) : mix(0xf59e0b, seatColor, 0.35);
        const headCol = isEagle ? 0xf8fafc : mix(0xfef3c7, seatColor, 0.25);

        const flapFreq = isMoving ? phase * 1.65 : t * (isCel ? 11 : 4.2);
        const strut = isMoving ? Math.sin(phase * 1.45) * spd : 0;
        const bob = isMoving ? Math.abs(Math.sin(phase * 1.45)) * 0.06 : Math.sin(t * 2.5) * 0.02;
        const bodyU = (isEagle ? 0.62 : 0.46) + bob;

        // Articulated bird legs
        if (isEagle) {
            const talonSwing = isMoving ? -0.45 : Math.sin(t * 2) * 0.1;
            rig.limb(-0.02, -0.065, bodyU - 0.12, talonSwing, 0.14, 0.25, 0.11, 0.04, 0.03, 0xfacc15, 0xf59e0b, outline, 0x0f172a, 0.026);
            rig.limb(-0.02, 0.065, bodyU - 0.12, talonSwing, 0.14, 0.25, 0.11, 0.04, 0.03, 0xfacc15, 0xf59e0b, outline, 0x0f172a, 0.026);
        } else {
            rig.limb(0, -0.065, bodyU - 0.10, strut * 0.55, 0.15, -0.22, 0.14, 0.038, 0.028, 0xf59e0b, 0xfacc15, outline, 0xf59e0b, 0.032);
            rig.limb(0, 0.065, bodyU - 0.10, -strut * 0.55, 0.15, -0.22, 0.14, 0.038, 0.028, 0xd97706, 0xfacc15, outline, 0xf59e0b, 0.032);
        }

        // Fanned articulated tail feathers extending BACKWARD (-fwd)
        const tailPlumes = isEagle ? 5 : 6;
        for (let k = 0; k < tailPlumes; k++) {
            const frac = k / (tailPlumes - 1) - 0.5;
            const tLen = isEagle ? 0.26 : 0.32;
            const tf = -0.14 - Math.cos(frac * 0.8) * tLen;
            const tl = frac * (isEagle ? 0.22 : 0.26);
            const tu = bodyU + (isEagle ? 0.06 : 0.14) + Math.sin(flapFreq) * 0.04;
            const pCol = isEagle ? (k % 2 ? 0xf8fafc : bodyCol) : (k % 2 ? 0x0f172a : seatColor);
            rig.capsule(-0.10, tl * 0.2, bodyU, tf, tl, tu, 0.055, pCol, outline, 0.012);
        }

        // Left & Right feathered wings spreading laterally (-lat & +lat) with smooth phase lag!
        const drawFeatheredWing = (sideSign: -1 | 1, phaseOffset: number, col: number) => {
            const flapVal = Math.sin(flapFreq + phaseOffset) * (isMoving || isCel ? 0.72 : 0.22);
            const plumeCount = 5;
            for (let i = 0; i < plumeCount; i++) {
                const frac = i / (plumeCount - 1);
                const pLen = 0.38 - frac * 0.13;
                const wl = sideSign * (0.10 + Math.cos(flapVal) * pLen);
                const wf = 0.06 - frac * 0.16;
                const wu = bodyU + 0.06 + Math.sin(flapVal) * pLen - frac * 0.06;
                rig.capsule(0.02, sideSign * 0.09, bodyU + 0.05, wf, wl, wu, 0.064, i === 0 ? shade(col, 0.75) : col, outline, 0.012);
            }
        };
        drawFeatheredWing(-1, 0.35, wingCol);
        drawFeatheredWing(1, 0, wingCol);

        // Bird torso capsule along fwd
        rig.oval(0, 0, bodyU, 0.19, 0.13, 0.14, bodyCol, { width: 0.022, color: outline });

        // Neck + head + beak ahead (+fwd)
        const headBob = Math.sin(flapFreq * 2) * 0.025;
        const hf = 0.16;
        const hu = bodyU + 0.15 - headBob;
        rig.sphere(hf, 0, hu, 0.105, headCol, { width: 0.02, color: outline }, 0.004);
        if (!isEagle) {
            for (let c = 0; c < 3; c++) {
                rig.sphere(hf - 0.04 + c * 0.045, 0, hu + 0.105 - Math.abs(c - 1) * 0.01, 0.036, 0xef4444, undefined, 0.006);
            }
            rig.oval(hf + 0.06, 0, hu - 0.085, 0.03, 0.025, 0.045, 0xdc2626, undefined, 0.006);
        }
        // Golden pointed beak extending straight forward (+fwd)
        rig.capsule(hf + 0.07, 0, hu, hf + 0.21, 0, hu - 0.025, 0.05, 0xfacc15, outline, 0.012, 0.01);
        rig.sphere(hf + 0.06, -0.075, hu + 0.02, 0.022, 0x0f172a, undefined, 0.012);
        rig.sphere(hf + 0.06, 0.075, hu + 0.02, 0.022, 0x0f172a, undefined, 0.012);

        rig.flush();
        return;
    }

    // ------------------------------------------------------------ 3. TREE FROG (crouched 4-limb launch + extended mid-air leap + vocal sac)
    if (kind === 'frog') {
        const frogGreen = mix(0x22c55e, seatColor, 0.24);
        const belly = 0xd9f99d;
        const leapExtend = isMoving ? Math.min(1, opts.hopZ * 1.7 + Math.max(0, Math.sin(phase * 1.4)) * 0.7) : (isCel ? Math.abs(Math.sin(t * 7)) * 0.7 : 0);
        const bodyU = 0.24 + leapExtend * 0.14;

        // Articulated hind legs tucked at sides or extending backward (-fwd) mid-air
        const h1 = -0.45 - leapExtend * 0.8;
        const h2 = 1.55 - leapExtend * 1.35;
        rig.limb(-0.08, -0.10, bodyU - 0.05, h1, 0.16, h2, 0.15, 0.065, 0.048, shade(frogGreen, 0.75), frogGreen, outline, belly, 0.036);
        rig.limb(-0.08, 0.10, bodyU - 0.05, h1 * 0.92, 0.16, h2 * 0.92, 0.15, 0.065, 0.048, frogGreen, frogGreen, outline, belly, 0.036);

        // Sleek amphibian torso + front vocal sac (+fwd)
        rig.oval(0, 0, bodyU, 0.20, 0.15, 0.135, frogGreen, { width: 0.022, color: outline });
        const sacPulse = 0.045 + Math.max(0, Math.sin(t * 4.5)) * (isCel ? 0.08 : 0.05);
        rig.sphere(0.15, 0, bodyU - 0.04, sacPulse, belly, { width: 0.014, color: outline }, 0.008);

        // Front legs reaching forward (+fwd)
        rig.limb(0.11, -0.09, bodyU - 0.04, 0.35 + leapExtend * 0.4, 0.12, -0.25, 0.11, 0.045, 0.036, frogGreen, belly, outline, belly, 0.03);
        rig.limb(0.11, 0.09, bodyU - 0.04, 0.35 + leapExtend * 0.4, 0.12, -0.25, 0.11, 0.045, 0.036, frogGreen, belly, outline, belly, 0.03);

        // Twin perched frog eyes looking ahead (+fwd)
        for (const el of [-0.07, 0.07] as const) {
            rig.sphere(0.12, el, bodyU + 0.11, 0.056, 0xfef08a, { width: 0.016, color: outline }, 0.008);
            rig.sphere(0.15, el, bodyU + 0.11, 0.026, 0x0f172a, undefined, 0.014);
        }
        rig.flush();
        return;
    }

    // ------------------------------------------------------------ 4. RED KANGAROO (3-joint articulated hind legs + balancing tail)
    if (kind === 'kangaroo') {
        const fur = mix(0xc2410c, seatColor, 0.26);
        const belly = 0xfef3c7;
        const bound = isMoving ? Math.sin(phase * 1.35) * spd : 0;
        const bob = isMoving ? Math.abs(Math.sin(phase * 1.35)) * 0.14 : (isCel ? Math.abs(Math.sin(t * 6)) * 0.1 : Math.sin(t * 2.5) * 0.02);
        const hipU = 0.38 + bob;
        const pitch = -0.18 + bound * 0.14;

        // Balancing tail behind (-fwd)
        rig.capsule(-0.08, 0, hipU - 0.04, -0.28, 0, hipU - 0.11, 0.07, shade(fur, 0.8), outline, 0.022);
        rig.capsule(-0.28, 0, hipU - 0.11, -0.45, 0, hipU + 0.04 + bound * 0.08, 0.055, shade(fur, 0.8), outline, 0.02);

        // 3-joint hind legs
        rig.leg3(-0.04, -0.075, hipU - 0.04, bound, false, true, 0.16, 0.15, 0.12, 0.08, 0.05, shade(fur, 0.76), belly, 0x78350f, outline);
        rig.leg3(-0.04, 0.075, hipU - 0.04, bound * 0.92, false, true, 0.16, 0.15, 0.12, 0.08, 0.05, fur, belly, 0x78350f, outline);

        // Upright torso leaning slightly forward (+fwd) + chest pouch
        const shF = 0.12 + pitch * 0.12;
        const shU = hipU + 0.26;
        rig.capsule(0, 0, hipU, shF, 0, shU, 0.18, fur, outline, 0.024);
        rig.oval(shF * 0.65 + 0.06, 0, (hipU + shU) * 0.5, 0.06, 0.075, 0.11, belly, undefined, 0.004);

        // Tucked boxing forepaws (+fwd)
        rig.limb(shF + 0.04, -0.075, shU - 0.05, 0.65 + Math.sin(t * 5) * 0.15, 0.1, -0.9, 0.09, 0.042, 0.032, fur, belly, outline, 0x78350f, 0.025);
        rig.limb(shF + 0.04, 0.075, shU - 0.05, 0.65 - Math.sin(t * 5) * 0.15, 0.1, -0.9, 0.09, 0.042, 0.032, fur, belly, outline, 0x78350f, 0.025);

        // Head + muzzle (+fwd) + tall alert ears
        const hf = shF + 0.09;
        const hu = shU + 0.11;
        rig.capsule(hf - 0.03, -0.045, hu + 0.04, hf - 0.06, -0.06, hu + 0.22, 0.044, fur, outline, 0.015);
        rig.capsule(hf - 0.03, 0.045, hu + 0.04, hf - 0.06, 0.06, hu + 0.22, 0.044, fur, outline, 0.015);
        rig.oval(hf + 0.05, 0, hu, 0.12, 0.075, 0.075, fur, { width: 0.02, color: outline }, 0.004);
        rig.sphere(hf + 0.08, -0.055, hu + 0.02, 0.02, 0x0f172a, undefined, 0.01);
        rig.sphere(hf + 0.08, 0.055, hu + 0.02, 0.02, 0x0f172a, undefined, 0.01);

        rig.flush();
        return;
    }

    // ------------------------------------------------------------ 5. QUADRUPEDS (Wild Lion, Royal Elephant, Wild Stallion, Alpha Wolf, Silverback Gorilla)
    const isEleph = kind === 'elephant';
    const isHorse = kind === 'horse';
    const isLion = kind === 'lion';
    const isWolf = kind === 'wolf';
    const isGorilla = kind === 'gorilla';

    const coat =
        kind === 'lion' ? mix(0xd97706, seatColor, 0.25) :
        kind === 'elephant' ? mix(0x94a3b8, seatColor, 0.22) :
        kind === 'horse' ? mix(0x92400e, seatColor, 0.24) :
        kind === 'wolf' ? mix(0x64748b, seatColor, 0.22) :
        mix(0x334155, seatColor, 0.22);
    const under =
        kind === 'lion' ? 0xfde68a :
        kind === 'elephant' ? 0xcbd5e1 :
        kind === 'horse' ? 0x451a03 :
        kind === 'wolf' ? 0xe2e8f0 :
        0x94a3b8;
    const hoofCol = isHorse || isEleph ? 0x1e293b : 0x0f172a;

    const gFreq = isMoving ? phase * 1.45 : 0;
    const fL = isMoving ? Math.sin(gFreq) * spd : 0;
    const rR = isMoving ? Math.sin(gFreq + (isHorse ? 0.55 : 0.15)) * spd : 0;
    const fR = isMoving ? Math.sin(gFreq + Math.PI) * spd : 0;
    const rL = isMoving ? Math.sin(gFreq + Math.PI + (isHorse ? 0.55 : 0.15)) * spd : 0;
    const bodyBob = isMoving ? Math.abs(Math.sin(gFreq)) * 0.055 : (isCel ? Math.abs(Math.sin(t * 7)) * 0.06 : Math.sin(t * 2.2) * 0.015);
    const bodyPitch = isMoving ? Math.cos(gFreq) * 0.04 : (isCel ? -0.14 : 0);

    const torsoU = (isEleph ? 0.50 : isHorse ? 0.50 : 0.44) + bodyBob;
    const rearF = -(isEleph ? 0.18 : 0.19);
    const frontF = isEleph ? 0.17 : 0.18;
    const legLat = isEleph ? 0.11 : 0.085;
    const legW = isEleph ? 0.088 : isGorilla ? 0.08 : 0.054;
    const segL = isEleph ? 0.15 : isHorse ? 0.155 : 0.135;

    // 4 articulated 3-joint legs (Left & Right separated laterally so depth sort swaps automatically!)
    rig.leg3(rearF, -legLat, torsoU - 0.08 - bodyPitch * 0.2, rL, false, isHorse, segL, segL, segL * 0.72, legW, legW * 0.78, shade(coat, 0.8), shade(under, 0.8), hoofCol, outline);
    rig.leg3(frontF, -legLat, torsoU - 0.08 + bodyPitch * 0.2, fL, true, isHorse, segL, segL, segL * 0.72, legW, legW * 0.78, shade(coat, 0.8), shade(under, 0.8), hoofCol, outline);
    rig.leg3(rearF, legLat, torsoU - 0.08 - bodyPitch * 0.2, rR, false, isHorse, segL, segL, segL * 0.72, legW, legW * 0.78, coat, under, hoofCol, outline);
    rig.leg3(frontF, legLat, torsoU - 0.08 + bodyPitch * 0.2, fR, true, isHorse, segL, segL, segL * 0.72, legW, legW * 0.78, coat, under, hoofCol, outline);

    // Swishing tail at -fwd
    if (!isGorilla) {
        const tailWave = Math.sin(t * 4 + phase) * 0.06;
        const tfEnd = rearF - (isHorse ? 0.24 : 0.22);
        const tuEnd = torsoU - (isHorse ? 0.14 : 0.06);
        rig.capsule(rearF - 0.05, 0, torsoU + 0.02, tfEnd, tailWave, tuEnd, isHorse ? 0.06 : 0.036, isLion ? coat : isHorse ? under : coat, outline, 0.012);
        if (isLion) rig.sphere(tfEnd, tailWave, tuEnd, 0.045, 0x78350f, undefined, 0.002);
    }

    // Weighted quadruped 3D torso capsule
    if (isGorilla) {
        rig.capsule(rearF - 0.02, 0, torsoU - 0.03, frontF + 0.04, 0, torsoU + 0.07, 0.26, coat, outline, 0.024);
        rig.oval(-0.02, 0, torsoU + 0.08, 0.13, 0.12, 0.06, under, undefined, 0.004);
    } else {
        rig.oval(0, 0, torsoU - 0.02, isEleph ? 0.28 : 0.25, isEleph ? 0.16 : 0.125, isEleph ? 0.19 : 0.135, coat, { width: 0.024, color: outline });
        if (isEleph) {
            rig.oval(0, 0, torsoU + 0.06, 0.15, 0.17, 0.12, seatColor, { width: 0.02, color: 0xfacc15 }, 0.003);
        }
    }

    // Gorilla chest-beat celebration arms
    if (isGorilla && isCel) {
        const beat = Math.sin(t * 16) * 0.35;
        rig.limb(frontF + 0.04, -0.11, torsoU + 0.06, 0.7 - beat, 0.14, 1.2, 0.12, 0.07, 0.06, coat, coat, outline, 0x0f172a, 0.038);
        rig.limb(frontF + 0.04, 0.11, torsoU + 0.06, 0.7 + beat, 0.14, 1.2, 0.12, 0.07, 0.06, coat, coat, outline, 0x0f172a, 0.038);
    }

    // Head strictly ahead (+fwd)
    const hf = frontF + (isHorse ? 0.14 : isEleph ? 0.12 : 0.10);
    const hu = torsoU + (isHorse ? 0.24 : isGorilla ? 0.18 : 0.15) + bodyPitch * 0.3;

    if (isLion) {
        // Radial 3D mane ring in (lat, up)
        for (let k = 0; k < 10; k++) {
            const ang = (k / 10) * Math.PI * 2;
            rig.sphere(hf - 0.03, Math.cos(ang) * 0.105, hu + Math.sin(ang) * 0.105, 0.066, 0x78350f);
        }
        rig.sphere(hf + 0.04, 0, hu, 0.11, coat, { width: 0.02, color: outline }, 0.004);
        rig.oval(hf + 0.13, 0, hu - 0.03, 0.055, 0.055, 0.04, under, undefined, 0.008);
        rig.sphere(hf + 0.11, -0.05, hu + 0.03, 0.02, 0x0f172a, undefined, 0.012);
        rig.sphere(hf + 0.11, 0.05, hu + 0.03, 0.02, 0x0f172a, undefined, 0.012);
    } else if (isEleph) {
        // Broad floppy ears at left & right + curved tusks + forward swinging trunk!
        rig.oval(hf - 0.04, -0.13, hu, 0.04, 0.10, 0.135, shade(coat, 0.85), { width: 0.02, color: outline });
        rig.oval(hf - 0.04, 0.13, hu, 0.04, 0.10, 0.135, shade(coat, 0.85), { width: 0.02, color: outline });
        rig.sphere(hf + 0.05, 0, hu + 0.02, 0.13, coat, { width: 0.022, color: outline }, 0.004);
        const trunkLift = isCel ? 0.25 : Math.sin(t * 3 + phase) * 0.08;
        rig.capsule(hf + 0.13, 0, hu - 0.02, hf + 0.26, 0, hu - 0.12 + trunkLift, 0.068, coat, outline, 0.016, 0.008);
        rig.capsule(hf + 0.26, 0, hu - 0.12 + trunkLift, hf + 0.22, 0, hu - 0.27 + trunkLift * 1.4, 0.054, coat, outline, 0.014, 0.008);
        // Twin ivory tusks pointing forward (+fwd)
        rig.capsule(hf + 0.10, -0.06, hu - 0.06, hf + 0.23, -0.075, hu - 0.03, 0.032, 0xfefce8, outline, 0.01, 0.01);
        rig.capsule(hf + 0.10, 0.06, hu - 0.06, hf + 0.23, 0.075, hu - 0.03, 0.032, 0xfefce8, outline, 0.01, 0.01);
        rig.sphere(hf + 0.12, -0.065, hu + 0.04, 0.022, 0x0f172a, undefined, 0.014);
        rig.sphere(hf + 0.12, 0.065, hu + 0.04, 0.022, 0x0f172a, undefined, 0.014);
    } else if (isHorse) {
        rig.capsule(frontF, 0, torsoU + 0.02, hf - 0.03, 0, hu - 0.04, 0.15, coat, outline, 0.02);
        rig.capsule(frontF - 0.06, 0, torsoU + 0.06, hf - 0.09, 0, hu + 0.02, 0.065, under, undefined, 0, 0.002);
        rig.capsule(hf - 0.04, -0.045, hu + 0.05, hf - 0.07, -0.055, hu + 0.17, 0.038, coat, outline, 0.01);
        rig.capsule(hf - 0.04, 0.045, hu + 0.05, hf - 0.07, 0.055, hu + 0.17, 0.038, coat, outline, 0.01);
        rig.oval(hf + 0.07, 0, hu, 0.12, 0.075, 0.068, coat, { width: 0.02, color: outline }, 0.005);
        rig.sphere(hf + 0.09, -0.05, hu + 0.02, 0.02, 0x0f172a, undefined, 0.012);
        rig.sphere(hf + 0.09, 0.05, hu + 0.02, 0.02, 0x0f172a, undefined, 0.012);
    } else if (isWolf) {
        const howlLift = isCel ? 0.14 : 0;
        rig.capsule(hf - 0.03, -0.05, hu + 0.05 + howlLift, hf - 0.06, -0.065, hu + 0.18 + howlLift, 0.038, coat, outline, 0.01);
        rig.capsule(hf - 0.03, 0.05, hu + 0.05 + howlLift, hf - 0.06, 0.065, hu + 0.18 + howlLift, 0.038, coat, outline, 0.01);
        rig.oval(hf + 0.03, 0, hu + howlLift, 0.11, 0.085, 0.08, coat, { width: 0.02, color: outline }, 0.004);
        rig.capsule(hf + 0.09, 0, hu - 0.01 + howlLift, hf + 0.21, 0, hu - 0.02 + howlLift * 1.4, 0.068, under, outline, 0.014, 0.008);
        rig.sphere(hf + 0.09, -0.055, hu + 0.02 + howlLift, 0.022, 0xfacc15, undefined, 0.012);
        rig.sphere(hf + 0.09, 0.055, hu + 0.02 + howlLift, 0.022, 0xfacc15, undefined, 0.012);
    } else {
        // Silverback gorilla crest + broad face
        rig.sphere(hf - 0.01, 0, hu + 0.06, 0.07, coat);
        rig.sphere(hf + 0.02, 0, hu, 0.115, coat, { width: 0.02, color: outline }, 0.004);
        rig.oval(hf + 0.08, 0, hu - 0.02, 0.055, 0.07, 0.058, 0x475569, undefined, 0.008);
        rig.sphere(hf + 0.10, -0.045, hu + 0.02, 0.02, 0x0f172a, undefined, 0.012);
        rig.sphere(hf + 0.10, 0.045, hu + 0.02, 0.02, 0x0f172a, undefined, 0.012);
    }

    rig.flush();
}

// ---------------------------------------------------------------- Public Draw API

export function drawToken3D(
    g: Graphics,
    kind: ResolvedTokenKind,
    seatColor: number,
    opts: TokenRenderOpts,
) {
    g.clear();
    if (isHumanTokenKind(kind)) {
        drawHumanToken(g, kind, seatColor, opts);
        return;
    }
    if (isAnimalTokenKind(kind)) {
        drawAnimalToken(g, kind, seatColor, opts);
        return;
    }
    // Fallback classic pawn shape (normally sprite or drawPawn handles 'default')
    const dark = shade(seatColor, 0.6);
    const light = mix(seatColor, 0xffffff, 0.35);
    g.ellipse(0, -0.03, 0.34, 0.13).fill(dark);
    g.ellipse(0, -0.07, 0.31, 0.11).fill(seatColor);
    g.poly([-0.27, -0.08, 0.27, -0.08, 0.12, -0.62, -0.12, -0.62]).fill(seatColor).stroke({ width: 0.025, color: dark });
    g.poly([-0.27, -0.08, -0.05, -0.08, -0.02, -0.62, -0.12, -0.62]).fill({ color: light, alpha: 0.55 });
    g.ellipse(0, -0.62, 0.15, 0.05).fill(dark);
    g.circle(0, -0.76, 0.19).fill(seatColor).stroke({ width: 0.025, color: dark });
    g.circle(-0.07, -0.82, 0.07).fill({ color: 0xffffff, alpha: 0.65 });
}
