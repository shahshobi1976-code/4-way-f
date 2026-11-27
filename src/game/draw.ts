// Drawing helpers: colours, pawns, dice and the 17 table backgrounds (10 classic + 7 5-way arenas).
import { Graphics } from 'pixi.js';
import { DICE_STYLES, type DiceStyleId } from './themes';

export type Proj = (x: number, y: number, z?: number) => { x: number; y: number; k?: number };

export function shade(color: number, f: number): number {
    const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((color & 255) * f)));
    return (r << 16) | (g << 8) | b;
}

export function mix(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export function circlePts(cx: number, cy: number, r: number, n = 14): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
}

export function starPts(cx: number, cy: number, ro: number, ri: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? ro : ri;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
}

/** 3D-looking pawn in cell units: origin = ground contact point. */
export function drawPawn(g: Graphics, color: number) {
    g.clear();
    const dark = shade(color, 0.6);
    const light = mix(color, 0xffffff, 0.35);
    // base ring
    g.ellipse(0, -0.03, 0.34, 0.13).fill(dark);
    g.ellipse(0, -0.07, 0.31, 0.11).fill(color);
    // body (cone) with lit left side
    g.poly([-0.27, -0.08, 0.27, -0.08, 0.12, -0.62, -0.12, -0.62]).fill(color).stroke({ width: 0.025, color: dark });
    g.poly([-0.27, -0.08, -0.05, -0.08, -0.02, -0.62, -0.12, -0.62]).fill({ color: light, alpha: 0.55 });
    // collar and head
    g.ellipse(0, -0.62, 0.15, 0.05).fill(dark);
    g.circle(0, -0.76, 0.19).fill(color).stroke({ width: 0.025, color: dark });
    g.circle(-0.07, -0.82, 0.07).fill({ color: 0xffffff, alpha: 0.65 });
}

const PIPS: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** Rounded-corner die with 3D extruded bevel & recessed pips, centred on the origin. */
export function drawDie(
    g: Graphics,
    size: number,
    value: number,
    color: number,
    pip: number,
    opts: { dim?: boolean; glow?: boolean; styleId?: DiceStyleId } = {},
) {
    g.clear();
    const h = size / 2;
    const r = size * 0.27;
    const a = opts.dim ? 0.45 : 1;
    const style = opts.styleId && opts.styleId !== 'classic' ? DICE_STYLES[opts.styleId] : null;
    const faceColor = style ? style.face : color;
    const pipColor = style ? style.pip : pip;
    const borderColor = style ? style.border : 0xffffff;
    const glowColor = opts.glow ? (style?.glow ?? 0xffffff) : (style?.glow ?? null);

    if (glowColor !== null && (opts.glow || style?.glow)) {
        g.roundRect(-h - size * 0.08, -h - size * 0.08, size * 1.16, size * 1.16, r * 1.25)
            .fill({ color: glowColor, alpha: (opts.glow ? 0.38 : 0.16) * a });
    }
    // Soft ground shadow + extruded 3D cube bottom edge
    g.ellipse(0, h + size * 0.07, size * 0.44, size * 0.12).fill({ color: 0x000000, alpha: 0.34 * a });
    g.roundRect(-h, -h + size * 0.11, size, size, r).fill({ color: shade(faceColor, 0.46), alpha: a });
    g.roundRect(-h, -h + size * 0.05, size, size, r).fill({ color: shade(faceColor, 0.68), alpha: a });
    g.roundRect(-h, -h, size, size, r)
        .fill({ color: faceColor, alpha: a })
        .stroke({ width: size * (style ? 0.05 : 0.035), color: style ? mix(borderColor, color, 0.25) : borderColor, alpha: (style ? 0.9 : 0.55) * a });

    if (style?.pattern === 'marble') {
        g.moveTo(-h * 0.72, -h * 0.45).lineTo(-h * 0.1, h * 0.2).lineTo(h * 0.6, h * 0.55)
            .stroke({ width: Math.max(1, size * 0.03), color: 0x9ca3af, alpha: 0.45 * a });
        g.moveTo(h * 0.4, -h * 0.65).lineTo(-h * 0.2, h * 0.1)
            .stroke({ width: Math.max(1, size * 0.02), color: 0xffffff, alpha: 0.55 * a });
    } else if (style?.pattern === 'galaxy') {
        for (const [sx, sy, sr] of [[-0.55, -0.5, 0.04], [0.48, -0.45, 0.035], [-0.45, 0.52, 0.03], [0.5, 0.42, 0.04]] as const) {
            g.circle(h * sx, h * sy, size * sr).fill({ color: 0xc4b5fd, alpha: 0.75 * a });
        }
    } else if (style?.pattern === 'fire') {
        g.roundRect(-h + size * 0.1, 0, size - size * 0.2, h - size * 0.08, r * 0.5)
            .fill({ color: 0xf97316, alpha: 0.25 * a });
    } else if (style?.pattern === 'ice') {
        g.moveTo(-h * 0.6, -h * 0.6).lineTo(h * 0.6, h * 0.6)
            .stroke({ width: Math.max(1, size * 0.025), color: 0xffffff, alpha: 0.55 * a });
    } else if (style?.pattern === 'holo') {
        g.roundRect(-h + size * 0.08, -h + size * 0.08, size * 0.84, size * 0.35, r * 0.5)
            .fill({ color: 0xf0abfc, alpha: 0.3 * a });
    }

    g.roundRect(-h + size * 0.08, -h + size * 0.06, size * 0.55, size * 0.16, r * 0.5).fill({ color: 0xffffff, alpha: 0.28 * a });
    for (const [gx, gy] of PIPS[Math.max(1, Math.min(6, value))]) {
        const px = gx * size * 0.26;
        const py = gy * size * 0.26;
        const pr = size * 0.088;
        g.circle(px, py + pr * 0.18, pr * 1.04).fill({ color: 0xffffff, alpha: 0.18 * a });
        g.circle(px, py, pr).fill({ color: pipColor, alpha: a });
    }
}

export interface BoardProjResult {
    x: number;
    y: number;
    k: number;
    d: number;
}

const ADJACENT_DIE_FACES: Record<number, [number, number, number, number]> = {
    1: [2, 3, 5, 4],
    2: [6, 3, 1, 4],
    3: [1, 2, 6, 5],
    4: [1, 5, 6, 2],
    5: [1, 4, 6, 3],
    6: [5, 3, 2, 4],
};

function rotVec3(x: number, y: number, z: number, rx: number, ry: number, rz: number): [number, number, number] {
    // Rotate around X
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    // Rotate around Y
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const x2 = x * cy + z1 * sy;
    const z2 = -x * sy + z1 * cy;
    // Rotate around Z
    const cz = Math.cos(rz), sz = Math.sin(rz);
    const x3 = x2 * cz - y1 * sz;
    const y3 = x2 * sz + y1 * cz;
    return [x3, y3, z2];
}

function bilerpPt(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    u: number,
    v: number,
): { x: number; y: number } {
    const x0 = p0.x + (p1.x - p0.x) * u;
    const y0 = p0.y + (p1.y - p0.y) * u;
    const x1 = p3.x + (p2.x - p3.x) * u;
    const y1 = p3.y + (p2.y - p3.y) * u;
    return { x: x0 + (x1 - x0) * v, y: y0 + (y1 - y0) * v };
}

function traceRoundedQuad(
    g: Graphics,
    pts: readonly { x: number; y: number }[],
    cornerFrac = 0.25,
) {
    const n = pts.length;
    const c = Math.max(0.05, Math.min(0.45, cornerFrac));
    const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
    });
    const firstOut = lerp(pts[0], pts[1], c);
    g.moveTo(firstOut.x, firstOut.y);
    for (let i = 1; i <= n; i++) {
        const curr = pts[i % n];
        const prev = pts[(i - 1) % n];
        const next = pts[(i + 1) % n];
        const enter = lerp(curr, prev, c);
        const exit = lerp(curr, next, c);
        g.lineTo(enter.x, enter.y);
        g.quadraticCurveTo(curr.x, curr.y, exit.x, exit.y);
    }
    g.closePath();
}

const PIP_CIRCLE_TRIG: readonly [number, number][] = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
});

export interface DieFaceBasis3D {
    center: [number, number, number];
    u: [number, number, number];
    v: [number, number, number];
}

export function computeDieFaceBasis3D(
    hs: number,
    normal: readonly [number, number, number],
    c0: readonly [number, number, number],
    c1: readonly [number, number, number],
    c3: readonly [number, number, number],
    rx: number,
    ry: number,
    rz: number,
): DieFaceBasis3D {
    const invSpan = hs > 0 ? 1 / (2 * hs) : 1;
    const uLocal: [number, number, number] = [
        (c1[0] - c0[0]) * invSpan,
        (c1[1] - c0[1]) * invSpan,
        (c1[2] - c0[2]) * invSpan,
    ];
    const vLocal: [number, number, number] = [
        (c3[0] - c0[0]) * invSpan,
        (c3[1] - c0[1]) * invSpan,
        (c3[2] - c0[2]) * invSpan,
    ];
    return {
        center: rotVec3(normal[0] * hs, normal[1] * hs, normal[2] * hs, rx, ry, rz),
        u: rotVec3(uLocal[0], uLocal[1], uLocal[2], rx, ry, rz),
        v: rotVec3(vLocal[0], vLocal[1], vLocal[2], rx, ry, rz),
    };
}

export function projectDieFacePipPoly(
    proj: (x: number, y: number, z?: number) => BoardProjResult,
    cx: number,
    cy: number,
    centerZ: number,
    basis: DieFaceBasis3D,
    hs: number,
    gx: number,
    gy: number,
    pipRadius3D: number,
    vOffset3D = 0,
): number[] {
    const offU = gx * 0.5 * hs;
    const offV = gy * 0.5 * hs + vOffset3D;
    const pcx = cx + basis.center[0] + basis.u[0] * offU + basis.v[0] * offV;
    const pcy = cy + basis.center[1] + basis.u[1] * offU + basis.v[1] * offV;
    const pcz = centerZ + basis.center[2] + basis.u[2] * offU + basis.v[2] * offV;

    const pts: number[] = [];
    for (let i = 0; i < PIP_CIRCLE_TRIG.length; i++) {
        const [ca, sa] = PIP_CIRCLE_TRIG[i];
        const rxOff = (basis.u[0] * ca + basis.v[0] * sa) * pipRadius3D;
        const ryOff = (basis.u[1] * ca + basis.v[1] * sa) * pipRadius3D;
        const rzOff = (basis.u[2] * ca + basis.v[2] * sa) * pipRadius3D;
        const p = proj(pcx + rxOff, pcy + ryOff, pcz + rzOff);
        pts.push(p.x, p.y);
    }
    return pts;
}

/**
 * Draws a physical 3D cube die with curved corners directly onto the tilted/rotating board projection `proj`,
 * complete with perspective-projected rounded faces, side pips, theme finishes, glow ring, and contact shadow.
 */
export function drawBoardDie3D(
    g: Graphics,
    sh: Graphics,
    proj: (x: number, y: number, z?: number) => BoardProjResult,
    cx: number,
    cy: number,
    cz: number,
    halfSize: number,
    value: number,
    color: number,
    pip: number,
    opts: {
        dim?: boolean;
        glow?: boolean;
        rotX?: number;
        rotY?: number;
        rotZ?: number;
        styleId?: DiceStyleId;
    } = {},
) {
    g.clear();
    sh.clear();

    const style = opts.styleId && opts.styleId !== 'classic' ? DICE_STYLES[opts.styleId] : null;
    const faceColor = style ? style.face : color;
    const pipColor = style ? style.pip : pip;
    const borderColor = style ? style.border : 0xffffff;
    const a = opts.dim ? 0.42 : 1;
    const rx = opts.rotX ?? 0;
    const ry = opts.rotY ?? 0;
    const rz = opts.rotZ ?? 0;
    const hs = halfSize;

    // 1. Ground contact shadow on the board plane (z = 0.015)
    const shScale = hs * (1.14 + Math.min(0.65, cz * 0.14));
    const shAlpha = (opts.dim ? 0.16 : 0.38) * Math.max(0.28, 1 - cz * 0.16);
    const shOffX = 0.12 + cz * 0.08;
    const shOffY = 0.16 + cz * 0.1;
    const shPts: number[] = [];
    for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        const p = proj(cx + shOffX + Math.cos(ang) * shScale, cy + shOffY + Math.sin(ang) * shScale, 0.015);
        shPts.push(p.x, p.y);
    }
    sh.poly(shPts).fill({ color: 0x000000, alpha: shAlpha });

    // Optional selection halo directly on the board surface under the die
    if (opts.glow && !opts.dim) {
        const glowColor = style?.glow ?? 0xfacc15;
        const haloPts: number[] = [];
        for (let i = 0; i < 18; i++) {
            const ang = (i / 18) * Math.PI * 2;
            const p = proj(cx + Math.cos(ang) * (hs * 1.48), cy + Math.sin(ang) * (hs * 1.48), 0.02);
            haloPts.push(p.x, p.y);
        }
        sh.poly(haloPts).fill({ color: glowColor, alpha: 0.28 }).stroke({ width: 2.2, color: glowColor, alpha: 0.9 });
    }

    // 2. 8 cube vertices centered at (0, 0, hs) so resting cube sits flush at z = 0..2*hs
    const localCorners: [number, number, number][] = [
        [-hs, -hs, -hs], // 0: bottom-back-left
        [hs, -hs, -hs],  // 1: bottom-back-right
        [hs, hs, -hs],   // 2: bottom-front-right
        [-hs, hs, -hs],  // 3: bottom-front-left
        [-hs, -hs, hs],  // 4: top-back-left
        [hs, -hs, hs],   // 5: top-back-right
        [hs, hs, hs],    // 6: top-front-right
        [-hs, hs, hs],   // 7: top-front-left
    ];
    const centerZ = cz + hs;
    const cubeCenterProj = proj(cx, cy, centerZ);
    const projected = localCorners.map(([lx, ly, lz]) => {
        const [wx, wy, wz] = rotVec3(lx, ly, lz, rx, ry, rz);
        return proj(cx + wx, cy + wy, centerZ + wz);
    });

    const v = Math.max(1, Math.min(6, Math.round(value)));
    const adj = ADJACENT_DIE_FACES[v] || [2, 3, 5, 4];
    const faces: {
        idx: [number, number, number, number];
        normal: [number, number, number];
        val: number;
        isTop: boolean;
    }[] = [
        { idx: [4, 5, 6, 7], normal: [0, 0, 1], val: v, isTop: true },
        { idx: [3, 2, 1, 0], normal: [0, 0, -1], val: 7 - v, isTop: false },
        { idx: [7, 6, 2, 3], normal: [0, 1, 0], val: adj[0], isTop: false },
        { idx: [5, 1, 2, 6], normal: [1, 0, 0], val: adj[1], isTop: false },
        { idx: [4, 0, 1, 5], normal: [0, -1, 0], val: adj[2], isTop: false },
        { idx: [4, 7, 3, 0], normal: [-1, 0, 0], val: adj[3], isTop: false },
    ];

    // Inner bevel core (0.81 * hs) seals curved 3-face corner valleys cleanly without sharpening outer corners
    const innerHs = hs * 0.81;
    const innerProjected = localCorners.map(([lx, ly, lz]) => {
        const s = innerHs / hs;
        const [wx, wy, wz] = rotVec3(lx * s, ly * s, lz * s, rx, ry, rz);
        return proj(cx + wx, cy + wy, centerZ + wz);
    });

    // Sort back-to-front by average camera depth D (descending)
    const sorted = faces
        .map((f) => {
            const pts = f.idx.map((k) => projected[k]);
            const innerPts = f.idx.map((k) => innerProjected[k]);
            const avgD = (pts[0].d + pts[1].d + pts[2].d + pts[3].d) / 4;
            const [nx, ny, nz] = rotVec3(f.normal[0], f.normal[1], f.normal[2], rx, ry, rz);
            const shadeFactor = Math.max(0.46, Math.min(1.06, 0.72 + nz * 0.30 - nx * 0.14 - ny * 0.14));
            return { ...f, pts, innerPts, avgD, shadeFactor };
        })
        .sort((aF, bF) => bF.avgD - aF.avgD);

    const bevelColor = shade(faceColor, 0.54);
    for (const f of sorted) {
        traceRoundedQuad(g, f.innerPts, 0.2);
        g.fill({ color: bevelColor, alpha: a });
    }

    // Draw only the 3-4 faces on the front hemisphere cleanly with curved corners
    for (const f of sorted) {
        const [p0, p1, p2, p3] = f.pts;
        const fill = f.shadeFactor >= 1 ? mix(faceColor, 0xffffff, 0.08) : shade(faceColor, f.shadeFactor);
        const edge = style ? mix(borderColor, faceColor, 0.3) : shade(faceColor, Math.max(0.32, f.shadeFactor * 0.58));

        traceRoundedQuad(g, f.pts, 0.25);
        g.fill({ color: fill, alpha: a })
            .stroke({ width: 1.5, color: edge, alpha: 0.85 * a });

        if (f.isTop) {
            // Subtle glossy rim highlight along top-left edge
            const h0 = bilerpPt(p0, p1, p2, p3, 0.12, 0.10);
            const h1 = bilerpPt(p0, p1, p2, p3, 0.72, 0.10);
            const h2 = bilerpPt(p0, p1, p2, p3, 0.62, 0.24);
            const h3 = bilerpPt(p0, p1, p2, p3, 0.12, 0.24);
            traceRoundedQuad(g, [h0, h1, h2, h3], 0.28);
            g.fill({ color: 0xffffff, alpha: 0.22 * a });

            if (style?.pattern === 'marble') {
                const m0 = bilerpPt(p0, p1, p2, p3, 0.15, 0.2);
                const m1 = bilerpPt(p0, p1, p2, p3, 0.55, 0.58);
                const m2 = bilerpPt(p0, p1, p2, p3, 0.82, 0.78);
                g.moveTo(m0.x, m0.y).lineTo(m1.x, m1.y).lineTo(m2.x, m2.y)
                    .stroke({ width: 1.5, color: 0x9ca3af, alpha: 0.45 * a });
            } else if (style?.pattern === 'galaxy') {
                for (const [su, sv] of [[0.24, 0.25], [0.76, 0.28], [0.28, 0.74], [0.74, 0.70]] as const) {
                    const sp = bilerpPt(p0, p1, p2, p3, su, sv);
                    g.circle(sp.x, sp.y, Math.max(1.2, 2.2 * p0.k)).fill({ color: 0xc4b5fd, alpha: 0.75 * a });
                }
            } else if (style?.pattern === 'fire') {
                const f0 = bilerpPt(p0, p1, p2, p3, 0.14, 0.5);
                const f1 = bilerpPt(p0, p1, p2, p3, 0.86, 0.5);
                const f2 = bilerpPt(p0, p1, p2, p3, 0.86, 0.88);
                const f3 = bilerpPt(p0, p1, p2, p3, 0.14, 0.88);
                g.poly([f0.x, f0.y, f1.x, f1.y, f2.x, f2.y, f3.x, f3.y]).fill({ color: 0xf97316, alpha: 0.24 * a });
            } else if (style?.pattern === 'ice') {
                const i0 = bilerpPt(p0, p1, p2, p3, 0.2, 0.2);
                const i1 = bilerpPt(p0, p1, p2, p3, 0.8, 0.8);
                g.moveTo(i0.x, i0.y).lineTo(i1.x, i1.y).stroke({ width: 1.3, color: 0xffffff, alpha: 0.5 * a });
            }
        }

        // Draw each pip as a true 3D circle in the face's own plane (u, v) so side-face pips stay properly perspective-foreshortened
        const edgeLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const sideLen = Math.hypot(p3.x - p0.x, p3.y - p0.y);
        const minSpan = Math.min(edgeLen, sideLen);
        const isFrontFacing = f.avgD <= cubeCenterProj.d + hs * 0.05;
        if (isFrontFacing && minSpan > 6) {
            const basis = computeDieFaceBasis3D(
                hs,
                f.normal,
                localCorners[f.idx[0]],
                localCorners[f.idx[1]],
                localCorners[f.idx[3]],
                rx,
                ry,
                rz,
            );
            const pipR3D = hs * 0.19;
            const pipAlpha = a * (f.isTop ? 0.98 : 0.78);
            for (const [gx, gy] of PIPS[f.val]) {
                if (f.isTop) {
                    const hlPts = projectDieFacePipPoly(
                        proj,
                        cx,
                        cy,
                        centerZ,
                        basis,
                        hs,
                        gx,
                        gy,
                        pipR3D * 1.05,
                        pipR3D * 0.18,
                    );
                    g.poly(hlPts).fill({ color: 0xffffff, alpha: 0.18 * pipAlpha });
                }
                const pipPts = projectDieFacePipPoly(proj, cx, cy, centerZ, basis, hs, gx, gy, pipR3D);
                g.poly(pipPts).fill({ color: pipColor, alpha: pipAlpha });
            }
        }
    }
}

// ---------------------------------------------------------------- backgrounds

export const BG_NAMES = [
    'Cyber Tech',
    'Felt',
    'Deep Space',
    'Ocean',
    'Sunset',
    'Marble',
    'Grass',
    'Neon',
    'Desert',
    'Ice',
    // 5-Way Ludo (Ludo Emperor) Table Arenas
    'Classic Dark',
    'LED Display Arena',
    'Luxury Wood Table',
    'Royal Velvet',
    'Marble Hall',
    'Neon Cyber Grid',
    'Golden Palace',
];
export const BG_BASE = [
    0x0a0d26,
    0x0f4a28,
    0x05071a,
    0x083e75,
    0x2b1146,
    0x6e6a62,
    0x2c6f2a,
    0x07040f,
    0xb98c4e,
    0xa9cde3,
    // 5-Way Ludo (Ludo Emperor) base tones
    0x11151d,
    0x0a1226,
    0x1f120b,
    0x1d0710,
    0x181a1f,
    0x100824,
    0x1d1507,
];

export interface BgView {
    w: number;
    h: number;
    invP?: (sx: number, sy: number) => { x: number; y: number; ok: boolean };
}

const LO = -8;
const HI = 23;

function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function kValid(q: { k?: number }) {
    return q.k === undefined || (q.k > 0.06 && q.k < 7.5);
}

function quad(
    g: Graphics,
    P: Proj,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
    alpha = 1,
    viewW = 0,
    viewH = 0,
) {
    const a = P(x0, y0), b = P(x1, y0), c = P(x1, y1), d = P(x0, y1);
    if (!kValid(a) || !kValid(b) || !kValid(c) || !kValid(d)) return;
    if (viewW > 0 && viewH > 0) {
        const minX = Math.min(a.x, b.x, c.x, d.x);
        const maxX = Math.max(a.x, b.x, c.x, d.x);
        const minY = Math.min(a.y, b.y, c.y, d.y);
        const maxY = Math.max(a.y, b.y, c.y, d.y);
        if (maxX < -120 || minX > viewW + 120 || maxY < -120 || minY > viewH + 120) return;
    }
    g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color, alpha });
}

function line(
    g: Graphics,
    P: Proj,
    pts: [number, number][],
    width: number,
    color: number,
    alpha = 1,
    viewW = 0,
    viewH = 0,
) {
    if (pts.length < 2) return;
    const projected = pts.map(([x, y]) => P(x, y));
    let started = false;
    let prev: { x: number; y: number; k?: number } | null = null;
    for (const q of projected) {
        if (!kValid(q)) {
            started = false;
            prev = null;
            continue;
        }
        if (viewW > 0 && viewH > 0 && prev) {
            const segMinX = Math.min(prev.x, q.x), segMaxX = Math.max(prev.x, q.x);
            const segMinY = Math.min(prev.y, q.y), segMaxY = Math.max(prev.y, q.y);
            if (segMaxX < -160 || segMinX > viewW + 160 || segMaxY < -160 || segMinY > viewH + 160) {
                started = false;
                prev = q;
                continue;
            }
        }
        if (!started) {
            if (prev) g.moveTo(prev.x, prev.y).lineTo(q.x, q.y);
            else g.moveTo(q.x, q.y);
            started = true;
        } else {
            g.lineTo(q.x, q.y);
        }
        prev = q;
    }
    g.stroke({ width, color, alpha });
}

function disc(
    g: Graphics,
    P: Proj,
    cx: number,
    cy: number,
    r: number,
    color: number,
    alpha: number,
    viewW = 0,
    viewH = 0,
) {
    const center = P(cx, cy);
    if (!kValid(center)) return;
    if (viewW > 0 && viewH > 0) {
        const margin = Math.max(120, r * 120);
        if (center.x < -margin || center.x > viewW + margin || center.y < -margin || center.y > viewH + margin) return;
    }
    const pts = circlePts(cx, cy, r, 12).map(([x, y]) => P(x, y));
    if (pts.some((p) => !kValid(p))) return;
    const flat: number[] = [];
    pts.forEach((p) => flat.push(p.x, p.y));
    g.poly(flat).fill({ color, alpha });
}

function computeWorldBounds(view?: BgView) {
    let wx0 = LO, wx1 = HI, wy0 = LO, wy1 = HI;
    if (view && view.invP && view.w > 0 && view.h > 0) {
        let minX = 7.5, maxX = 7.5, minY = 7.5, maxY = 7.5;
        let anyOk = false;
        const pad = 80;
        for (let ix = 0; ix <= 4; ix++) {
            const sx = -pad + ((view.w + pad * 2) * ix) / 4;
            for (let iy = 0; iy <= 4; iy++) {
                const sy = -pad + ((view.h + pad * 2) * iy) / 4;
                const pt = view.invP(sx, sy);
                if (!pt.ok) continue;
                anyOk = true;
                minX = Math.min(minX, pt.x);
                maxX = Math.max(maxX, pt.x);
                minY = Math.min(minY, pt.y);
                maxY = Math.max(maxY, pt.y);
            }
        }
        if (anyOk) {
            wx0 = Math.max(-55, Math.min(LO, Math.floor(minX) - 3));
            wx1 = Math.min(70, Math.max(HI, Math.ceil(maxX) + 3));
            wy0 = Math.max(-55, Math.min(LO, Math.floor(minY) - 3));
            wy1 = Math.min(70, Math.max(HI, Math.ceil(maxY) + 3));
        }
    }
    return { wx0, wx1, wy0, wy1 };
}

export function drawBackground(g: Graphics, P: Proj, idx: number, scale: number, view?: BgView) {
    const r = rng(1234 + idx);
    const W = view?.w ?? 0;
    const H = view?.h ?? 0;
    if (W > 0 && H > 0) {
        g.rect(-80, -80, W + 160, H + 160).fill(BG_BASE[idx]);
    } else {
        quad(g, P, LO, LO, HI, HI, BG_BASE[idx]);
    }
    const { wx0, wx1, wy0, wy1 } = computeWorldBounds(view);
    const w = Math.max(1, scale * 0.06);
    switch (idx) {
        case 0: { // Cyber Space Circuit (fullscreen edge-to-edge)
            // 1. Ambient corner & center glows in screen space
            if (W > 0 && H > 0) {
                const glowR = Math.max(W, H) * 0.36;
                g.circle(W * 0.10, H * 0.14, glowR).fill({ color: 0x6366f1, alpha: 0.18 });
                g.circle(W * 0.90, H * 0.14, glowR * 1.05).fill({ color: 0x7c3aed, alpha: 0.16 });
                g.circle(W * 0.12, H * 0.88, glowR).fill({ color: 0x3b82f6, alpha: 0.18 });
                g.circle(W * 0.88, H * 0.88, glowR * 1.05).fill({ color: 0x6366f1, alpha: 0.20 });
            } else {
                disc(g, P, LO + 2, LO + 2, 7, 0x6366f1, 0.2);
                disc(g, P, HI - 2, LO + 2, 8, 0x7c3aed, 0.18);
                disc(g, P, LO + 3, HI - 2, 7, 0x3b82f6, 0.2);
                disc(g, P, HI - 2, HI - 2, 8, 0x6366f1, 0.22);
            }
            disc(g, P, 7.5, 7.5, 12, 0x1d4ed8, 0.15, W, H);

            // 2. Tech dot matrix grid spanning entire visible world
            const dotStep = 1.6;
            const dxStart = Math.floor(wx0 / dotStep) * dotStep;
            const dyStart = Math.floor(wy0 / dotStep) * dotStep;
            for (let x = dxStart; x <= wx1; x += dotStep) {
                for (let y = dyStart; y <= wy1; y += dotStep) {
                    const isLit = Math.abs(Math.sin(x * 12.3 + y * 7.1)) > 0.82;
                    disc(g, P, x, y, isLit ? 0.08 : 0.045, isLit ? 0x00f0ff : 0x2563eb, isLit ? 0.65 : 0.25, W, H);
                }
            }

            // 3. Glowing circuit traces with 90-degree elbows and terminal nodes across entire visible space
            const circuits: [number, number][][] = [
                // Top-left traces
                [[wx0, 2], [-2, 2], [-2, -2], [3, -2]],
                [[-4, wy0], [-4, 5], [-1, 5], [-1, 8]],
                [[-2, -5], [-2, 0], [4, 0]],
                // Top-right traces
                [[12, -3], [12, 1], [18, 1], [18, wy0]],
                [[16, -1], [16, 4], [Math.max(21, wx1 - 2), 4]],
                [[wx1, 6], [17, 6], [17, 9]],
                // Bottom-left traces
                [[wx0, 12], [-3, 12], [-3, 16], [2, 16]],
                [[-1, 10], [-1, 14], [-4, 14], [-4, wy1]],
                [[1, 18], [5, 18], [5, wy1]],
                // Bottom-right traces
                [[13, wy1], [13, 16], [19, 16], [19, 13]],
                [[wx1, 11], [17, 11], [17, 15], [21, 15]],
                [[15, 18], [15, 20], [wx1, 20]],
                // Extended outer traces for wide desktop / tall portrait viewports
                [[22, wy0 + 3], [22, 3], [Math.max(28, wx1), 3]],
                [[24, 9], [24, 15], [Math.max(32, wx1), 15]],
                [[20, 19], [26, 19], [26, wy1]],
                [[-10, 4], [-10, -3], [wx0, -3]],
                [[-12, 11], [-12, 19], [wx0, 19]],
                // Framing tech border traces
                [[-5, -4], [20, -4]],
                [[20, -4], [20, 19]],
                [[20, 19], [-5, 19]],
                [[-5, 19], [-5, -4]],
            ];

            for (const c of circuits) {
                line(g, P, c, w * 2.2, 0x0284c7, 0.45, W, H);
                line(g, P, c, w * 1.1, 0x00f0ff, 0.9, W, H);
                const start = c[0];
                const end = c[c.length - 1];
                disc(g, P, start[0], start[1], 0.22, 0x0284c7, 0.7, W, H);
                disc(g, P, start[0], start[1], 0.12, 0xffffff, 0.95, W, H);
                disc(g, P, end[0], end[1], 0.22, 0x00f0ff, 0.75, W, H);
                disc(g, P, end[0], end[1], 0.12, 0xffffff, 0.95, W, H);
            }
            break;
        }
        case 1: // casino felt with gold border + fullscreen mottling
            if (W > 0 && H > 0) {
                for (let i = 0; i < 65; i++) {
                    const fx = r() * W;
                    const fy = r() * H;
                    const fr = (0.06 + r() * 0.11) * Math.max(W, H);
                    g.circle(fx, fy, fr).fill({ color: 0x1b7a40, alpha: 0.12 });
                }
            } else {
                for (let i = 0; i < 40; i++) disc(g, P, LO + r() * (HI - LO), LO + r() * (HI - LO), 2 + r() * 3, 0x1b7a40, 0.12);
            }
            line(g, P, [[-5, -5], [20, -5], [20, 20], [-5, 20], [-5, -5]], w * 2.4, 0xd9b44a, 0.95, W, H);
            line(g, P, [[-5.6, -5.6], [20.6, -5.6], [20.6, 20.6], [-5.6, 20.6], [-5.6, -5.6]], w, 0xf2d98a, 0.8, W, H);
            break;
        case 2: // space (fullscreen nebulae + starfield)
            if (W > 0 && H > 0) {
                const maxD = Math.max(W, H);
                g.circle(W * 0.22, H * 0.20, maxD * 0.28).fill({ color: 0x4b1d8a, alpha: 0.34 });
                g.circle(W * 0.76, H * 0.56, maxD * 0.32).fill({ color: 0x0f4a9a, alpha: 0.30 });
                g.circle(W * 0.42, H * 0.84, maxD * 0.26).fill({ color: 0x8a1d6a, alpha: 0.26 });
                for (let i = 0; i < 240; i++) {
                    const sx = -20 + r() * (W + 40);
                    const sy = -20 + r() * (H + 40);
                    const sr = 1.0 + r() * 2.4;
                    g.circle(sx, sy, sr).fill({ color: 0xffffff, alpha: 0.45 + r() * 0.55 });
                }
            } else {
                disc(g, P, 3, 2, 8, 0x4b1d8a, 0.35);
                disc(g, P, 14, 12, 9, 0x0f4a9a, 0.3);
                disc(g, P, 8, 18, 7, 0x8a1d6a, 0.28);
                for (let i = 0; i < 180; i++) {
                    const x = LO + r() * (HI - LO), y = LO + r() * (HI - LO), sz = 0.05 + r() * 0.12;
                    disc(g, P, x, y, sz, 0xffffff, 0.5 + r() * 0.5);
                }
            }
            break;
        case 3: { // ocean waves (fullscreen)
            const waveStep = 1.1;
            const yStart = Math.floor(wy0 / waveStep) * waveStep;
            for (let y = yStart, i = Math.round(yStart / waveStep); y <= wy1; y += waveStep, i++) {
                const pts: [number, number][] = [];
                for (let x = wx0; x <= wx1; x += 1.4) pts.push([x, y + Math.sin(x * 0.9 + i) * 0.28]);
                line(g, P, pts, w * 1.3, (i & 1) ? 0x3d9be0 : 0x1c78c4, 0.65, W, H);
            }
            break;
        }
        case 4: // sunset bands (fullscreen sky gradient + warm glowing sun)
            if (W > 0 && H > 0) {
                const bands = 28;
                const startY = -60;
                const totalH = H + 120;
                for (let i = 0; i < bands; i++) {
                    const t = i / (bands - 1);
                    const c = t < 0.5 ? mix(0x3a1565, 0xd8456b, t * 2) : mix(0xd8456b, 0xffa43a, (t - 0.5) * 2);
                    const by = startY + (i * totalH) / bands;
                    const bh = totalH / bands + 2;
                    g.rect(-80, by, W + 160, bh).fill(c);
                }
                const sunR = Math.min(W, H) * 0.22;
                const sunX = W * 0.5;
                const sunY = H * 0.22;
                g.circle(sunX, sunY, sunR * 1.45).fill({ color: 0xffd07a, alpha: 0.18 });
                g.circle(sunX, sunY, sunR).fill({ color: 0xfff0b0, alpha: 0.45 });
            } else {
                for (let i = 0; i < 16; i++) {
                    const t = i / 15;
                    const c = t < 0.5 ? mix(0x3a1565, 0xd8456b, t * 2) : mix(0xd8456b, 0xffa43a, (t - 0.5) * 2);
                    quad(g, P, LO, LO + (i * (HI - LO)) / 16, HI, LO + ((i + 1) * (HI - LO)) / 16 + 0.02, c);
                }
                disc(g, P, 7.5, 24, 6, 0xfff0b0, 0.5);
            }
            break;
        case 5: { // marble checker floor (fullscreen perspective tiling)
            const tile = 2.5;
            const ix0 = Math.floor(wx0 / tile);
            const ix1 = Math.ceil(wx1 / tile);
            const iy0 = Math.floor(wy0 / tile);
            const iy1 = Math.ceil(wy1 / tile);
            for (let i = ix0; i < ix1; i++) {
                const x = i * tile;
                for (let j = iy0; j < iy1; j++) {
                    const y = j * tile;
                    const col = ((i + j) & 1) === 0 ? 0xeeeae2 : 0x8a857c;
                    quad(g, P, x, y, x + tile, y + tile, col, 1, W, H);
                }
            }
            for (let i = 0; i < 24; i++) {
                const x = wx0 + r() * (wx1 - wx0), y = wy0 + r() * (wy1 - wy0);
                line(g, P, [[x, y], [x + 2 + r() * 3, y + 1 + r() * 2], [x + 4 + r() * 3, y + r() * 4]], w * 0.8, 0x5b574f, 0.35, W, H);
            }
            break;
        }
        case 6: { // mown lawn (fullscreen perspective stripes segmented for perspective safety)
            const stripe = 1.6;
            const ix0 = Math.floor(wx0 / stripe);
            const ix1 = Math.ceil(wx1 / stripe);
            const segStep = 4;
            for (let i = ix0; i < ix1; i++) {
                const x = i * stripe;
                const col = (i & 1) ? 0x358a32 : 0x44a73f;
                for (let y = wy0; y < wy1; y += segStep) {
                    const yEnd = Math.min(wy1, y + segStep + 0.05);
                    quad(g, P, x, y, x + stripe + 0.03, yEnd, col, 1, W, H);
                }
            }
            break;
        }
        case 7: { // neon grid (fullscreen perspective grid)
            const step = 1.5;
            const vx0 = Math.floor(wx0 / step) * step;
            const vy0 = Math.floor(wy0 / step) * step;
            for (let vx = vx0; vx <= wx1; vx += step) {
                const pts: [number, number][] = [];
                for (let y = wy0; y <= wy1; y += 3) pts.push([vx, y]);
                pts.push([vx, wy1]);
                line(g, P, pts, w * 1.4, 0xd02cff, 0.6, W, H);
            }
            for (let vy = vy0; vy <= wy1; vy += step) {
                const pts: [number, number][] = [];
                for (let x = wx0; x <= wx1; x += 3) pts.push([x, vy]);
                pts.push([wx1, vy]);
                line(g, P, pts, w * 1.4, 0x18e0ff, 0.6, W, H);
            }
            break;
        }
        case 8: { // desert dunes (fullscreen perspective dunes)
            if (W > 0 && H > 0) {
                g.circle(W * 0.78, H * 0.16, Math.max(W, H) * 0.32).fill({ color: 0xe3b86d, alpha: 0.25 });
            }
            const duneStep = 3.6;
            const iy0 = Math.floor(wy0 / duneStep);
            const iy1 = Math.ceil(wy1 / duneStep);
            for (let i = iy0; i <= iy1; i++) {
                const y0 = i * duneStep;
                const pts: [number, number][] = [];
                for (let x = wx0; x <= wx1; x += 1.6) pts.push([x, y0 + Math.sin(x * 0.45 + i * 1.7) * 1.1]);
                line(g, P, pts, w * 3, (i & 1) ? 0xf0cd8d : 0xa87a40, 0.55, W, H);
            }
            break;
        }
        case 9: // ice (fullscreen glacial frost + fractures + sparkles)
            if (W > 0 && H > 0) {
                g.circle(W * 0.15, H * 0.15, Math.max(W, H) * 0.35).fill({ color: 0xdcf0fa, alpha: 0.28 });
                g.circle(W * 0.85, H * 0.85, Math.max(W, H) * 0.35).fill({ color: 0x7cb8db, alpha: 0.22 });
            }
            for (let i = 0; i < 32; i++) {
                let x = wx0 + r() * (wx1 - wx0), y = wy0 + r() * (wy1 - wy0);
                const pts: [number, number][] = [[x, y]];
                for (let k = 0; k < 4; k++) {
                    x += (r() - 0.5) * 3.5;
                    y += (r() - 0.5) * 3.5;
                    pts.push([x, y]);
                }
                line(g, P, pts, w, 0xffffff, 0.75, W, H);
            }
            if (W > 0 && H > 0) {
                for (let i = 0; i < 85; i++) {
                    g.circle(-10 + r() * (W + 20), -10 + r() * (H + 20), 1.5 + r() * 2.5).fill({ color: 0xffffff, alpha: 0.65 });
                }
            } else {
                for (let i = 0; i < 50; i++) disc(g, P, LO + r() * (HI - LO), LO + r() * (HI - LO), 0.08 + r() * 0.1, 0xffffff, 0.8);
            }
            break;
        case 10: { // 5-Way: Classic Dark
            const cx = W > 0 ? W * 0.5 : 0;
            const cy = H > 0 ? H * 0.45 : 0;
            if (W > 0 && H > 0) {
                const maxD = Math.max(W, H);
                g.rect(-80, -80, W + 160, H + 160).fill(0x06080c);
                g.circle(cx, cy, maxD * 0.62).fill({ color: 0x11151d, alpha: 0.85 });
                g.circle(cx, cy, maxD * 0.36).fill({ color: 0x1f2430, alpha: 0.72 });
                g.circle(cx, cy, maxD * 0.2).fill({ color: 0xffffff, alpha: 0.05 });
            } else {
                disc(g, P, 7.5, 7.5, 16, 0x1f2430, 0.8);
                disc(g, P, 7.5, 7.5, 9, 0xffffff, 0.05);
            }
            break;
        }
        case 11: { // 5-Way: LED Display Arena
            if (W > 0 && H > 0) {
                const maxD = Math.max(W, H);
                g.rect(-80, -80, W + 160, H + 160).fill(0x04060e);
                g.circle(W * 0.5, H * 0.45, maxD * 0.58).fill({ color: 0x0a1226, alpha: 0.9 });
                g.circle(W * 0.5, H * 0.45, maxD * 0.34).fill({ color: 0x152547, alpha: 0.75 });
            }
            const step = 1.7;
            const gx0 = Math.floor(wx0 / step) * step;
            const gy0 = Math.floor(wy0 / step) * step;
            for (let vx = gx0; vx <= wx1; vx += step) {
                line(g, P, [[vx, wy0], [vx, wy1]], Math.max(1, w * 0.7), 0x38bdf8, 0.14, W, H);
            }
            for (let vy = gy0; vy <= wy1; vy += step) {
                line(g, P, [[wx0, vy], [wx1, vy]], Math.max(1, w * 0.7), 0x38bdf8, 0.14, W, H);
            }
            for (const rad of [8.2, 10.6, 13.0, 15.6]) {
                const ringPts = circlePts(7.5, 7.5, rad, 48);
                ringPts.push(ringPts[0]);
                line(g, P, ringPts, w * 1.4, 0x38bdf8, 0.28, W, H);
            }
            break;
        }
        case 12: { // 5-Way: Luxury Wood Table
            if (W > 0 && H > 0) {
                const maxD = Math.max(W, H);
                g.rect(-80, -80, W + 160, H + 160).fill(0x0d0704);
                g.circle(W * 0.5, H * 0.46, maxD * 0.6).fill({ color: 0x2b190f, alpha: 0.88 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.35).fill({ color: 0x4a2d1b, alpha: 0.72 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.22).fill({ color: 0xf59e0b, alpha: 0.08 });
            }
            const grainStep = 1.25;
            const gy0 = Math.floor(wy0 / grainStep) * grainStep;
            for (let y = gy0, i = 0; y <= wy1; y += grainStep, i++) {
                const pts: [number, number][] = [];
                for (let x = wx0; x <= wx1; x += 2.2) {
                    pts.push([x, y + Math.sin(x * 0.35 + i * 0.7) * 0.24]);
                }
                line(g, P, pts, w * 1.2, (i & 1) ? 0x120a06 : 0x5c3721, (i & 1) ? 0.35 : 0.25, W, H);
            }
            break;
        }
        case 13: { // 5-Way: Royal Velvet
            if (W > 0 && H > 0) {
                const maxD = Math.max(W, H);
                g.rect(-80, -80, W + 160, H + 160).fill(0x0a0206);
                g.circle(W * 0.5, H * 0.46, maxD * 0.6).fill({ color: 0x260814, alpha: 0.9 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.36).fill({ color: 0x4b1228, alpha: 0.78 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.2).fill({ color: 0xf1c40f, alpha: 0.08 });
            } else {
                disc(g, P, 7.5, 7.5, 16, 0x4b1228, 0.85);
            }
            for (const rad of [8.8, 9.6, 13.5]) {
                const ringPts = circlePts(7.5, 7.5, rad, 56);
                ringPts.push(ringPts[0]);
                line(g, P, ringPts, w * 1.5, 0xf1c40f, 0.26, W, H);
            }
            break;
        }
        case 14: { // 5-Way: Marble Hall
            if (W > 0 && H > 0) {
                const maxD = Math.max(W, H);
                g.rect(-80, -80, W + 160, H + 160).fill(0x0a0b0e);
                g.circle(W * 0.5, H * 0.46, maxD * 0.6).fill({ color: 0x1d2026, alpha: 0.9 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.34).fill({ color: 0x363940, alpha: 0.75 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.2).fill({ color: 0xe2e8f0, alpha: 0.07 });
            }
            const veinStep = 2.6;
            const vy0 = Math.floor(wy0 / veinStep) * veinStep;
            for (let y = vy0, i = 0; y <= wy1; y += veinStep, i++) {
                const pts: [number, number][] = [];
                for (let x = wx0; x <= wx1; x += 2.5) {
                    pts.push([x, y + Math.sin(x * 0.3 + i * 1.3) * 0.85]);
                }
                line(g, P, pts, w * 0.9, 0xe2e8f0, 0.14, W, H);
            }
            break;
        }
        case 15: { // 5-Way: Neon Cyber Grid
            if (W > 0 && H > 0) {
                const maxD = Math.max(W, H);
                g.rect(-80, -80, W + 160, H + 160).fill(0x05020d);
                g.circle(W * 0.5, H * 0.46, maxD * 0.58).fill({ color: 0x100824, alpha: 0.9 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.32).fill({ color: 0x261242, alpha: 0.72 });
            }
            const step = 2.0;
            const vx0 = Math.floor(wx0 / step) * step;
            const vy0 = Math.floor(wy0 / step) * step;
            for (let vx = vx0; vx <= wx1; vx += step) {
                line(g, P, [[vx, wy0], [vx, wy1]], Math.max(1, w * 0.9), 0xe879f9, 0.22, W, H);
            }
            for (let vy = vy0; vy <= wy1; vy += step) {
                line(g, P, [[wx0, vy], [wx1, vy]], Math.max(1, w * 0.9), 0x22d3ee, 0.22, W, H);
            }
            break;
        }
        case 16: { // 5-Way: Golden Palace
            if (W > 0 && H > 0) {
                const maxD = Math.max(W, H);
                g.rect(-80, -80, W + 160, H + 160).fill(0x0b0803);
                g.circle(W * 0.5, H * 0.46, maxD * 0.6).fill({ color: 0x241a09, alpha: 0.9 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.35).fill({ color: 0x463314, alpha: 0.78 });
                g.circle(W * 0.5, H * 0.46, maxD * 0.22).fill({ color: 0xfacc15, alpha: 0.11 });
            } else {
                disc(g, P, 7.5, 7.5, 16, 0x463314, 0.85);
            }
            for (const rad of [8.8, 9.8, 12.6, 15.2]) {
                const ringPts = circlePts(7.5, 7.5, rad, 56);
                ringPts.push(ringPts[0]);
                line(g, P, ringPts, w * 1.5, 0xfacc15, 0.3, W, H);
            }
            break;
        }
        default:
            break;
    }
}
