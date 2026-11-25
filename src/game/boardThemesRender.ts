// Transformative 3D Board Surface Renderers & Non-Blocking Surface FX for 4-Way Ludo.
import { Graphics } from 'pixi.js';
import { BASE_SPOTS, COLORS, HOME_COL, STAR_IDX, START_IDX, TRACK } from './rules';
import { circlePts, mix, shade, starPts, type Proj } from './draw';
import type { BoardThemeConfig } from './themes';

const sq = (x: number, y: number, w: number, h: number): [number, number][] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
];

function poly3(
    g: Graphics,
    P: Proj,
    pts: [number, number][],
    z: number,
    fill: number,
    alpha = 1,
    stroke?: { w: number; c: number; a?: number },
) {
    const flat: number[] = [];
    for (const [x, y] of pts) {
        const q = P(x, y, z);
        flat.push(q.x, q.y);
    }
    g.poly(flat).fill({ color: fill, alpha });
    if (stroke) g.stroke({ width: stroke.w, color: stroke.c, alpha: stroke.a ?? 1 });
}

function line3(
    g: Graphics,
    P: Proj,
    pts: [number, number][],
    z: number,
    w: number,
    c: number,
    alpha = 1,
) {
    if (pts.length < 2) return;
    const p0 = P(pts[0][0], pts[0][1], z);
    g.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
        const pi = P(pts[i][0], pts[i][1], z);
        g.lineTo(pi.x, pi.y);
    }
    g.stroke({ width: w, color: c, alpha });
}

function disc3(
    g: Graphics,
    P: Proj,
    cx: number,
    cy: number,
    r: number,
    z: number,
    fill: number,
    alpha = 1,
    stroke?: { w: number; c: number; a?: number },
) {
    poly3(g, P, circlePts(cx, cy, r, 14), z, fill, alpha, stroke);
}

function drawYardDecoration(
    g: Graphics,
    P: Proj,
    bt: BoardThemeConfig,
    seat: number,
    ox: number,
    oy: number,
    seatCol: number,
) {
    const ix = ox + 1;
    const iy = oy + 1;
    const cx = ox + 3;
    const cy = oy + 3;

    switch (bt.id) {
        case 'jungle': {
            // Mossy forest clearing, lush ferns, hanging corner vines & wildflowers
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0x1b3b1a, 0.96, { w: 1.4, c: 0x6aa84f, a: 0.9 });
            disc3(g, P, cx, cy, 1.55, 0.022, 0x265324, 0.55);
            // Corner fern fronds
            for (const [fx, fy, dx, dy] of [
                [ix + 0.25, iy + 0.25, 1, 1],
                [ix + 3.75, iy + 0.25, -1, 1],
                [ix + 0.25, iy + 3.75, 1, -1],
                [ix + 3.75, iy + 3.75, -1, -1],
            ] as const) {
                poly3(
                    g,
                    P,
                    [
                        [fx, fy],
                        [fx + dx * 0.85, fy + dy * 0.2],
                        [fx + dx * 0.5, fy + dy * 0.6],
                    ],
                    0.026,
                    0x4d7c0f,
                    0.85,
                );
                poly3(
                    g,
                    P,
                    [
                        [fx, fy],
                        [fx + dx * 0.22, fy + dy * 0.85],
                        [fx + dx * 0.58, fy + dy * 0.48],
                    ],
                    0.026,
                    0x65a30d,
                    0.85,
                );
            }
            // Vine curves + forest flowers
            line3(g, P, [[ix + 0.1, iy + 1.2], [ix + 0.8, iy + 0.6], [ix + 1.6, iy + 0.1]], 0.028, 1.6, 0x84cc16, 0.7);
            disc3(g, P, cx, iy + 0.42, 0.12, 0.03, mix(seatCol, 0xfef08a, 0.45), 0.95);
            disc3(g, P, ix + 0.45, cy, 0.11, 0.03, 0xf472b6, 0.9);
            break;
        }
        case 'pool': {
            // Miniature swimming pool: white stone coping, aqua water, tile lines & chrome pool ladder
            poly3(g, P, sq(ix - 0.12, iy - 0.12, 4.24, 4.24), 0.018, 0xf8fafc, 0.98, { w: 1.4, c: 0xcbd5e1 });
            poly3(g, P, sq(ix + 0.15, iy + 0.15, 3.7, 3.7), 0.022, 0x06b6d4, 0.95, { w: 1.2, c: 0x0e7490 });
            // Underwater ceramic mosaic grid lines
            for (let k = 1; k < 4; k++) {
                line3(g, P, [[ix + 0.18, iy + k], [ix + 3.82, iy + k]], 0.024, 0.9, 0x67e8f9, 0.38);
                line3(g, P, [[ix + k, iy + 0.18], [ix + k, iy + 3.82]], 0.024, 0.9, 0x67e8f9, 0.38);
            }
            // Chrome pool ladder rails on top edge
            const lx = ix + 1.75;
            line3(g, P, [[lx, iy - 0.05], [lx, iy + 0.48]], 0.04, 2.2, 0xe2e8f0, 0.95);
            line3(g, P, [[lx + 0.5, iy - 0.05], [lx + 0.5, iy + 0.48]], 0.04, 2.2, 0xe2e8f0, 0.95);
            line3(g, P, [[lx, iy + 0.25], [lx + 0.5, iy + 0.25]], 0.04, 1.8, 0x94a3b8, 0.95);
            break;
        }
        case 'dancefloor': {
            // Glossy LED checker dance pad + equalizer bars
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0x0d081d, 0.98, { w: 1.5, c: seatCol, a: 0.9 });
            const neonCols = [0xec4899, 0x22d3ee, 0xa855f7, 0x39ff14];
            for (let gx = 0; gx < 4; gx++) {
                for (let gy = 0; gy < 4; gy++) {
                    const padCol = (gx + gy) % 2 === 0 ? neonCols[(gx + gy + seat) % 4] : 0x171230;
                    poly3(g, P, sq(ix + gx + 0.08, iy + gy + 0.08, 0.84, 0.84), 0.022, padCol, (gx + gy) % 2 === 0 ? 0.36 : 0.9);
                }
            }
            // Subtle equalizer strip at yard bottom edge
            for (let b = 0; b < 5; b++) {
                const bh = 0.18 + ((b + seat) % 3) * 0.14;
                poly3(g, P, sq(ix + 0.45 + b * 0.66, iy + 3.85 - bh, 0.42, bh), 0.025, b % 2 ? 0x22d3ee : 0xec4899, 0.65);
            }
            break;
        }
        case 'museum': {
            // Royal marble rotunda with burgundy velvet carpet & brass corners
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0xfaf6ed, 0.98, { w: 1.6, c: 0xd4af37, a: 0.95 });
            poly3(g, P, sq(ix + 0.32, iy + 0.32, 3.36, 3.36), 0.023, 0x7a1c28, 0.96, { w: 1.2, c: 0xd4af37, a: 0.85 });
            disc3(g, P, cx, cy, 1.15, 0.025, 0x8f2230, 0.7, { w: 1.1, c: 0xeab308, a: 0.8 });
            break;
        }
        case 'cliff': {
            // Terraced rocky granite cliff ledge + evergreen tufts
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0x374151, 0.98, { w: 1.4, c: 0x9ca3af, a: 0.9 });
            poly3(g, P, [[ix + 0.2, iy + 0.3], [ix + 3.6, iy + 0.15], [ix + 3.8, iy + 3.7], [ix + 0.35, iy + 3.8]], 0.022, 0x4b5563, 0.85);
            // Rock strata lines & alpine pine tufts
            line3(g, P, [[ix + 0.3, iy + 2.0], [ix + 1.8, iy + 1.75], [ix + 3.6, iy + 2.15]], 0.025, 1.1, 0x1f2937, 0.65);
            disc3(g, P, cx, iy + 0.42, 0.22, 0.027, 0x15803d, 0.9);
            disc3(g, P, ix + 0.42, cy, 0.18, 0.027, 0x166534, 0.9);
            break;
        }
        case 'galaxy': {
            // Deep cosmos nebula + orbital rings + stars
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0x07061a, 0.98, { w: 1.4, c: 0x818cf8, a: 0.9 });
            disc3(g, P, cx - 0.3, cy - 0.2, 1.45, 0.022, seatCol, 0.18);
            disc3(g, P, cx + 0.35, cy + 0.3, 1.1, 0.022, 0xa855f7, 0.18);
            poly3(g, P, circlePts(cx, cy, 1.62, 24), 0.024, 0x000000, 0, { w: 1, c: 0x6366f1, a: 0.55 });
            poly3(g, P, circlePts(cx, cy, 0.88, 20), 0.024, 0x000000, 0, { w: 0.9, c: 0xc084fc, a: 0.5 });
            break;
        }
        case 'desert': {
            // Golden sand dunes + shimmering turquoise oasis spring
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0xf3d79e, 0.98, { w: 1.4, c: 0xb47832, a: 0.9 });
            line3(g, P, [[ix + 0.15, iy + 0.9], [cx, iy + 0.55], [ix + 3.85, iy + 1.05]], 0.022, 2.2, 0xd9a75a, 0.55);
            line3(g, P, [[ix + 0.15, iy + 3.1], [cx, iy + 3.45], [ix + 3.85, iy + 2.95]], 0.022, 2.2, 0xd9a75a, 0.55);
            // Center turquoise oasis pool
            disc3(g, P, cx, cy, 0.92, 0.024, 0x06b6d4, 0.82, { w: 1.4, c: 0x67e8f9, a: 0.9 });
            disc3(g, P, cx - 0.15, cy - 0.12, 0.5, 0.026, 0x22d3ee, 0.55);
            break;
        }
        case 'city': {
            // Illuminated modern skyscraper rooftop plaza + window skylight grids
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0x0f172a, 0.98, { w: 1.4, c: 0x38bdf8, a: 0.9 });
            poly3(g, P, sq(ix + 0.25, iy + 0.25, 3.5, 3.5), 0.022, 0x1e293b, 0.95);
            // Illuminated architectural grid windows on rooftop corners
            for (const [wx, wy] of [[ix + 0.4, iy + 0.4], [ix + 2.95, iy + 0.4], [ix + 0.4, iy + 2.95], [ix + 2.95, iy + 2.95]] as const) {
                poly3(g, P, sq(wx, wy, 0.65, 0.65), 0.023, 0x334155, 0.9);
                poly3(g, P, sq(wx + 0.12, wy + 0.12, 0.18, 0.18), 0.025, 0xfef08a, 0.85);
                poly3(g, P, sq(wx + 0.36, wy + 0.36, 0.18, 0.18), 0.025, 0x38bdf8, 0.85);
            }
            poly3(g, P, circlePts(cx, cy, 0.65, 18), 0.024, 0x000000, 0, { w: 1.2, c: 0xfacc15, a: 0.6 });
            break;
        }
        case 'lava': {
            // Volcanic magma caldera with molten river veins
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0x1c0d0a, 0.98, { w: 1.5, c: 0xf97316, a: 0.95 });
            line3(g, P, [[ix + 0.2, iy + 0.4], [cx - 0.3, cy], [ix + 3.7, iy + 3.6]], 0.023, 3.8, 0xea580c, 0.65);
            line3(g, P, [[ix + 0.2, iy + 0.4], [cx - 0.3, cy], [ix + 3.7, iy + 3.6]], 0.024, 1.5, 0xfde047, 0.8);
            line3(g, P, [[ix + 3.6, iy + 0.3], [cx + 0.2, cy - 0.2], [ix + 0.35, iy + 3.5]], 0.023, 2.8, 0xf97316, 0.65);
            break;
        }
        case 'ice': {
            // Faceted arctic glacial floor with translucent frost cracks
            poly3(g, P, sq(ix, iy, 4, 4), 0.02, 0xe0f2fe, 0.98, { w: 1.4, c: 0x38bdf8, a: 0.95 });
            poly3(g, P, [[ix, iy], [cx, iy + 1.2], [ix + 4, iy]], 0.022, 0xf8fafc, 0.55);
            poly3(g, P, [[ix, iy + 4], [cx, cy + 0.4], [ix + 4, iy + 4]], 0.022, 0xbae6fd, 0.45);
            line3(g, P, [[ix + 0.4, iy + 0.7], [cx - 0.2, cy], [ix + 3.4, iy + 3.2]], 0.025, 1.2, 0xffffff, 0.85);
            line3(g, P, [[cx - 0.2, cy], [ix + 0.6, iy + 3.3]], 0.025, 1.0, 0x7dd3fc, 0.8);
            break;
        }
        default:
            break;
    }
}

function drawPawnPad(g: Graphics, P: Proj, bt: BoardThemeConfig, sx: number, sy: number, seatCol: number) {
    switch (bt.id) {
        case 'classic':
            poly3(g, P, circlePts(sx, sy, 0.55, 14), 0.03, seatCol, 0.85, { w: 1, c: shade(seatCol, 0.5) });
            return;
        case 'jungle':
            // Carved mossy tree-stump pawn pad
            disc3(g, P, sx, sy, 0.58, 0.03, 0x784f30, 0.96, { w: 1.4, c: 0x3f2412 });
            disc3(g, P, sx, sy, 0.44, 0.034, seatCol, 0.78, { w: 0.9, c: 0xfef08a, a: 0.55 });
            return;
        case 'pool':
            // Buoyant colorful swim-ring pawn pad
            disc3(g, P, sx, sy, 0.58, 0.03, seatCol, 0.94, { w: 1.4, c: 0xffffff });
            disc3(g, P, sx, sy, 0.26, 0.034, 0x06b6d4, 0.95, { w: 0.9, c: 0xffffff, a: 0.85 });
            return;
        case 'dancefloor':
            // Neon spotlight dance circle
            disc3(g, P, sx, sy, 0.58, 0.03, 0x1e1b4b, 0.95, { w: 1.6, c: seatCol, a: 0.95 });
            disc3(g, P, sx, sy, 0.4, 0.033, mix(seatCol, 0xffffff, 0.35), 0.55);
            return;
        case 'museum':
            // Brass-rimmed marble plinth pad
            disc3(g, P, sx, sy, 0.58, 0.03, 0xd4af37, 0.95, { w: 1.2, c: 0x78350f });
            disc3(g, P, sx, sy, 0.44, 0.034, mix(seatCol, 0xfaf6ed, 0.25), 0.92);
            return;
        case 'cliff':
            // Flat granite boulder pawn pad
            disc3(g, P, sx, sy, 0.57, 0.03, 0x9ca3af, 0.94, { w: 1.3, c: 0x1f2937 });
            disc3(g, P, sx, sy, 0.41, 0.034, seatCol, 0.85);
            return;
        case 'galaxy':
            // Glowing orbital star-gate pad
            disc3(g, P, sx, sy, 0.58, 0.03, 0x1e1b4b, 0.95, { w: 1.4, c: 0xc084fc });
            disc3(g, P, sx, sy, 0.4, 0.034, seatCol, 0.82);
            return;
        case 'desert':
            // Sun-baked sandstone ring pad
            disc3(g, P, sx, sy, 0.57, 0.03, 0xf6dfad, 0.96, { w: 1.4, c: 0x92571b });
            disc3(g, P, sx, sy, 0.41, 0.034, seatCol, 0.85);
            return;
        case 'city':
            // Illuminated helipad circle
            disc3(g, P, sx, sy, 0.58, 0.03, 0x334155, 0.96, { w: 1.4, c: 0xfacc15 });
            disc3(g, P, sx, sy, 0.4, 0.034, seatCol, 0.86);
            return;
        case 'lava':
            // Obsidian stepping-stone pad over glowing magma
            disc3(g, P, sx, sy, 0.59, 0.03, 0xf97316, 0.65);
            disc3(g, P, sx, sy, 0.5, 0.033, 0x292524, 0.98, { w: 1.2, c: 0xfb923c });
            disc3(g, P, sx, sy, 0.34, 0.035, seatCol, 0.86);
            return;
        case 'ice':
            // Snow-rimmed frost crystal pad
            disc3(g, P, sx, sy, 0.58, 0.03, 0xffffff, 0.96, { w: 1.3, c: 0x0284c7 });
            disc3(g, P, sx, sy, 0.42, 0.034, seatCol, 0.85);
            return;
    }
}

function drawTrackTileDetail(g: Graphics, P: Proj, bt: BoardThemeConfig, col: number, row: number, isStart: boolean, isStar: boolean) {
    switch (bt.id) {
        case 'jungle':
            if (!isStart) {
                line3(g, P, [[col + 0.15, row + 0.3], [col + 0.52, row + 0.48], [col + 0.84, row + 0.25]], 0.014, 0.9, 0x365314, 0.45);
                poly3(g, P, [[col + 0.08, row + 0.08], [col + 0.32, row + 0.1], [col + 0.1, row + 0.3]], 0.015, 0x4d7c0f, 0.6);
            }
            break;
        case 'pool':
            // 2x2 ceramic mosaic cross lines + glossy sheen
            line3(g, P, [[col + 0.5, row + 0.04], [col + 0.5, row + 0.96]], 0.014, 0.75, 0x0284c7, 0.35);
            line3(g, P, [[col + 0.04, row + 0.5], [col + 0.96, row + 0.5]], 0.014, 0.75, 0x0284c7, 0.35);
            poly3(g, P, sq(col + 0.12, row + 0.1, 0.5, 0.14), 0.015, 0xffffff, 0.28);
            if (isStar) disc3(g, P, col + 0.5, row + 0.5, 0.38, 0.017, 0xffffff, 0.4);
            break;
        case 'dancefloor':
            // Inner glowing club diode bevel
            poly3(g, P, sq(col + 0.14, row + 0.14, 0.72, 0.72), 0.014, isStart ? 0xffffff : 0x00f0ff, 0.12);
            disc3(g, P, col + 0.16, row + 0.16, 0.05, 0.016, 0xec4899, 0.8);
            disc3(g, P, col + 0.84, row + 0.84, 0.05, 0.016, 0x22d3ee, 0.8);
            break;
        case 'museum':
            // Gold marble vein + trim inner frame
            line3(g, P, [[col + 0.15, row + 0.8], [col + 0.55, row + 0.45], [col + 0.85, row + 0.2]], 0.014, 0.8, 0xd4af37, 0.32);
            if (isStar) disc3(g, P, col + 0.5, row + 0.5, 0.4, 0.017, 0xfef3c7, 0.75, { w: 1, c: 0xd4af37 });
            break;
        case 'cliff':
            // Chiseled stone bevel highlight
            poly3(g, P, sq(col + 0.08, row + 0.08, 0.84, 0.14), 0.014, 0xffffff, 0.24);
            break;
        case 'galaxy':
            disc3(g, P, col + 0.24, row + 0.28, 0.04, 0.015, 0xe0e7ff, 0.75);
            disc3(g, P, col + 0.76, row + 0.7, 0.035, 0.015, 0xc084fc, 0.7);
            break;
        case 'desert':
            line3(g, P, [[col + 0.12, row + 0.52], [col + 0.5, row + 0.4], [col + 0.88, row + 0.54]], 0.014, 1.1, 0xd9a75a, 0.45);
            break;
        case 'city':
            // Street avenue dashed stripe & helipad circle on stars
            line3(g, P, [[col + 0.25, row + 0.5], [col + 0.75, row + 0.5]], 0.014, 1.0, 0xfacc15, 0.42);
            if (isStar) poly3(g, P, circlePts(col + 0.5, row + 0.5, 0.38, 14), 0.016, 0x000000, 0, { w: 1, c: 0xfacc15, a: 0.7 });
            break;
        case 'lava':
            // Glowing magma fissure crack on dark basalt
            line3(g, P, [[col + 0.12, row + 0.2], [col + 0.48, row + 0.55], [col + 0.88, row + 0.78]], 0.014, 1.1, 0xf97316, 0.65);
            break;
        case 'ice':
            // Frosted diagonal ice sheen facet
            poly3(g, P, [[col + 0.08, row + 0.08], [col + 0.92, row + 0.08], [col + 0.08, row + 0.92]], 0.014, 0xffffff, 0.38);
            break;
        default:
            break;
    }
}

export function drawThemedBoardSurface(
    g: Graphics,
    P: Proj,
    bt: BoardThemeConfig,
    active: boolean[],
    S: number,
    outline: number,
) {
    g.clear();
    const T = 0.7;
    // 1. 3D Slab: underside + 4 extruded sides
    poly3(g, P, sq(0, 0, 15, 15), -T, bt.slabUnderside);
    const corners: [number, number][] = [[0, 0], [15, 0], [15, 15], [0, 15]];
    for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        const flat: number[] = [];
        for (const [x, y, z] of [
            [a[0], a[1], 0],
            [b[0], b[1], 0],
            [b[0], b[1], -T],
            [a[0], a[1], -T],
        ] as [number, number, number][]) {
            const q = P(x, y, z);
            flat.push(q.x, q.y);
        }
        g.poly(flat)
            .fill(i % 2 ? bt.slabSideDark : bt.slabSideLight)
            .stroke({ width: 1, color: bt.slabUnderside, alpha: 0.7 });
    }

    // 2. Top Surface Base
    poly3(g, P, sq(0, 0, 15, 15), 0, bt.surface);

    // 3. Base Yards (4 corner 6x6 squares)
    const origins: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];
    for (let c = 0; c < 4; c++) {
        const [ox, oy] = origins[c];
        const frameCol = active[c] ? COLORS[c] : mix(COLORS[c], bt.surface, 0.55);
        poly3(g, P, sq(ox, oy, 6, 6), 0, frameCol, 1, {
            w: 1.2,
            c: bt.id === 'classic' ? shade(COLORS[c], 0.55) : bt.yardRim,
        });
        if (bt.id === 'classic') {
            poly3(g, P, sq(ox + 1, oy + 1, 4, 4), 0.02, bt.yardInner, 0.96, {
                w: 1,
                c: shade(COLORS[c], 0.7),
                a: 0.8,
            });
        } else {
            drawYardDecoration(g, P, bt, c, ox, oy, COLORS[c]);
        }
        for (const [sx, sy] of BASE_SPOTS[c]) {
            drawPawnPad(g, P, bt, sx, sy, COLORS[c]);
        }
    }

    // 4. Home Columns (colored stretches)
    for (let c = 0; c < 4; c++) {
        for (let k = 0; k < HOME_COL[c].length; k++) {
            const [col, row] = HOME_COL[c][k];
            const tileCol = bt.id === 'classic' ? COLORS[c] : mix(COLORS[c], bt.track, k % 2 === 0 ? 0.08 : 0.22);
            poly3(g, P, sq(col, row, 1, 1), 0.01, tileCol, 1, {
                w: 1,
                c: bt.id === 'classic' ? shade(COLORS[c], 0.55) : bt.trackBorder,
                a: 0.9,
            });
            if (bt.id !== 'classic') {
                poly3(g, P, sq(col + 0.16, row + 0.16, 0.68, 0.68), 0.014, COLORS[c], 0.35);
            }
        }
    }

    // 5. Outer Track (52 squares)
    for (let i = 0; i < 52; i++) {
        const [col, row] = TRACK[i];
        const startOf = START_IDX.indexOf(i);
        const isStar = STAR_IDX.includes(i);
        const tileBg =
            startOf >= 0
                ? COLORS[startOf]
                : isStar && bt.id !== 'classic'
                    ? bt.safe
                    : i % 2 === 0
                        ? bt.track
                        : bt.trackAlt;
        poly3(g, P, sq(col, row, 1, 1), 0.01, tileBg, 1, { w: 1, c: bt.trackBorder, a: 0.9 });
        if (bt.id !== 'classic') {
            drawTrackTileDetail(g, P, bt, col, row, startOf >= 0, isStar);
        }
    }

    // 6. Safe Stars (star squares + seat start squares with crisp contrast)
    for (const i of STAR_IDX) {
        const [col, row] = TRACK[i];
        poly3(g, P, starPts(col + 0.5, row + 0.5, 0.36, 0.16), 0.02, bt.starFill, 1, {
            w: 1.2,
            c: bt.starStroke,
        });
    }
    for (let c = 0; c < 4; c++) {
        const [col, row] = TRACK[START_IDX[c]];
        poly3(g, P, starPts(col + 0.5, row + 0.5, 0.3, 0.13), 0.02, bt.startStarFill, 0.96, {
            w: 1,
            c: bt.startStarStroke,
        });
    }

    // 7. Centre Triangles (HOME hub)
    const mid: [number, number] = [7.5, 7.5];
    const tri: [number, number][][] = [
        [[6, 6], mid, [6, 9]], // red (left)
        [[6, 6], [9, 6], mid], // green (top)
        [[9, 6], [9, 9], mid], // yellow (right)
        [[6, 9], mid, [9, 9]], // cyan (bottom)
    ];
    for (let c = 0; c < 4; c++) {
        const triCol = bt.id === 'classic' ? COLORS[c] : mix(COLORS[c], bt.surface, 0.14);
        poly3(g, P, tri[c], 0.02, triCol, 1, { w: 1.2, c: bt.homeStroke });
    }
    if (bt.id !== 'classic') {
        disc3(g, P, 7.5, 7.5, 0.72, 0.024, bt.surface, 0.55, { w: 1.2, c: bt.homeStroke, a: 0.85 });
    }

    // 8. Active-player outer board rim glow
    const flat: number[] = [];
    for (const [x, y] of [[0, 0], [15, 0], [15, 15], [0, 15]] as [number, number][]) {
        const q = P(x, y, 0);
        flat.push(q.x, q.y);
    }
    g.poly(flat).stroke({ width: Math.max(10, S * 0.45), color: outline, alpha: 0.22 });
    g.poly(flat).stroke({ width: Math.max(5, S * 0.2), color: outline, alpha: 0.95 });
}

// ---------------------------------------------------------------- Subtle Non-Blocking Surface FX

export function drawThemedBoardFX(
    g: Graphics,
    P: Proj,
    bt: BoardThemeConfig,
    nowMs: number,
    S: number,
) {
    g.clear();
    if (bt.id === 'classic') return;
    const t = nowMs / 1000;
    const origins: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];
    const wBase = Math.max(1, S * 0.04);

    switch (bt.id) {
        case 'jungle': {
            // Subtle glowing fireflies inside the 4 corner forest clearings
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                for (let f = 0; f < 3; f++) {
                    const fx = ox + 3 + Math.sin(t * (0.9 + f * 0.2) + c * 1.7 + f * 2.1) * 1.35;
                    const fy = oy + 3 + Math.cos(t * (0.8 + f * 0.25) + c * 2.3 + f * 1.4) * 1.35;
                    const pulse = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3.5 + f * 2 + c));
                    disc3(g, P, fx, fy, 0.14, 0.04, 0xd9f99d, pulse * 0.45);
                    disc3(g, P, fx, fy, 0.055, 0.045, 0xfef08a, pulse);
                }
            }
            break;
        }
        case 'pool': {
            // Expanding water ripples inside each corner pool & center hub
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                const ph = (t * 0.45 + c * 0.27) % 1;
                const r = 0.25 + ph * 1.45;
                poly3(g, P, circlePts(ox + 3, oy + 3, r, 18), 0.028, 0x000000, 0, {
                    w: wBase,
                    c: 0xffffff,
                    a: (1 - ph) * 0.5,
                });
            }
            const cPh = (t * 0.4) % 1;
            poly3(g, P, circlePts(7.5, 7.5, 0.2 + cPh * 0.9, 18), 0.028, 0x000000, 0, {
                w: wBase,
                c: 0xe0f2fe,
                a: (1 - cPh) * 0.45,
            });
            break;
        }
        case 'dancefloor': {
            // Beat-synced neon color pulse around yards & center
            const beat = 0.5 + 0.5 * Math.sin(t * 7.2);
            const neonPool = [0xec4899, 0x22d3ee, 0x39ff14, 0xa855f7];
            const activeCol = neonPool[Math.floor(t * 1.6) % neonPool.length];
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                poly3(g, P, sq(ox + 1.08, oy + 1.08, 3.84, 3.84), 0.026, 0x000000, 0, {
                    w: wBase * 1.2,
                    c: activeCol,
                    a: 0.25 + beat * 0.5,
                });
            }
            break;
        }
        case 'museum': {
            // Warm chandelier shimmer across the burgundy velvet carpets
            const sh = 0.35 + 0.35 * Math.sin(t * 2.1);
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                disc3(g, P, ox + 3 + Math.sin(t + c) * 0.25, oy + 3 + Math.cos(t * 0.8 + c) * 0.25, 0.65, 0.028, 0xfef3c7, 0.14 * sh);
            }
            break;
        }
        case 'cliff': {
            // Soft drifting alpine mist ribbons across yard edges
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                const drift = Math.sin(t * 0.7 + c * 1.3) * 0.45;
                disc3(g, P, ox + 3 + drift, oy + 1.45, 0.65, 0.032, 0xf1f5f9, 0.12);
                disc3(g, P, ox + 3 - drift, oy + 4.5, 0.55, 0.032, 0xe2e8f0, 0.1);
            }
            break;
        }
        case 'galaxy': {
            // Orbiting micro-star around center HOME + twinkling yard stars
            const ox = 7.5 + Math.cos(t * 1.4) * 1.1;
            const oy = 7.5 + Math.sin(t * 1.4) * 1.1;
            disc3(g, P, ox, oy, 0.14, 0.035, 0xc084fc, 0.45);
            disc3(g, P, ox, oy, 0.06, 0.038, 0xfef08a, 0.95);
            for (let c = 0; c < 4; c++) {
                const [yx, yy] = origins[c];
                for (let k = 0; k < 3; k++) {
                    const tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 3.1 + c * 2 + k * 1.9));
                    disc3(g, P, yx + 1.5 + k * 1.35, yy + 1.5 + ((k + c) % 2) * 2.1, 0.055, 0.028, 0xfef9c3, tw * 0.85);
                }
            }
            break;
        }
        case 'desert': {
            // Gentle oasis sun glints
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                const gl = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 3.2 + c * 1.5));
                disc3(g, P, ox + 2.85 + Math.sin(t + c) * 0.18, oy + 2.85, 0.12, 0.03, 0xffffff, gl * 0.45);
            }
            break;
        }
        case 'city': {
            // Blinking aviation beacons on rooftop yard corners
            const blink = Math.sin(t * 4.5) > 0.2 ? 0.95 : 0.2;
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                disc3(g, P, ox + 1.18, oy + 1.18, 0.07, 0.032, 0xef4444, blink);
                disc3(g, P, ox + 4.82, oy + 4.82, 0.07, 0.032, 0x38bdf8, 1.15 - blink);
            }
            break;
        }
        case 'lava': {
            // Caldera heat pulse + rising ember sparks
            const pulse = 0.35 + 0.35 * Math.sin(t * 3.4);
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                disc3(g, P, ox + 3, oy + 3, 1.25, 0.026, 0xf97316, 0.14 * pulse);
                for (let e = 0; e < 2; e++) {
                    const ep = (t * 0.55 + c * 0.31 + e * 0.5) % 1;
                    const ex = ox + 2.0 + ((c + e) % 3) * 0.95 + Math.sin(t * 4 + e) * 0.18;
                    const ey = oy + 4.4 - ep * 2.8;
                    disc3(g, P, ex, ey, 0.06, 0.04 + ep * 0.22, 0xfde047, (1 - ep) * 0.9);
                }
            }
            break;
        }
        case 'ice': {
            // Twinkling diamond frost glints
            for (let c = 0; c < 4; c++) {
                const [ox, oy] = origins[c];
                for (let f = 0; f < 3; f++) {
                    const gl = Math.max(0, Math.sin(t * 2.8 + c * 1.9 + f * 2.4));
                    if (gl > 0.25) {
                        const gx = ox + 1.6 + ((f * 1.3 + c * 0.7) % 2.8);
                        const gy = oy + 1.6 + (((f + 1) * 1.1 + c) % 2.8);
                        disc3(g, P, gx, gy, 0.08 * gl, 0.032, 0xffffff, gl * 0.9);
                    }
                }
            }
            break;
        }
    }
}
