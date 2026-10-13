// Drawing helpers: colours, pawns, dice and the 10 table backgrounds.
import { Graphics } from 'pixi.js';

export type Proj = (x: number, y: number, z?: number) => { x: number; y: number };

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

/** Rounded-corner die, centred on the origin. */
export function drawDie(g: Graphics, size: number, value: number, color: number, pip: number, opts: { dim?: boolean; glow?: boolean } = {}) {
    g.clear();
    const h = size / 2;
    const r = size * 0.22;
    const a = opts.dim ? 0.45 : 1;
    if (opts.glow) g.roundRect(-h - size * 0.07, -h - size * 0.07, size * 1.14, size * 1.14, r * 1.2).fill({ color: 0xffffff, alpha: 0.35 });
    g.roundRect(-h, -h + size * 0.07, size, size, r).fill({ color: shade(color, 0.55), alpha: a });
    g.roundRect(-h, -h, size, size, r).fill({ color, alpha: a }).stroke({ width: size * 0.035, color: 0xffffff, alpha: 0.55 * a });
    g.roundRect(-h + size * 0.08, -h + size * 0.06, size * 0.5, size * 0.16, r * 0.5).fill({ color: 0xffffff, alpha: 0.22 * a });
    for (const [gx, gy] of PIPS[Math.max(1, Math.min(6, value))]) {
        g.circle(gx * size * 0.26, gy * size * 0.26, size * 0.085).fill({ color: pip, alpha: a });
    }
}

// ---------------------------------------------------------------- backgrounds

export const BG_NAMES = ['Wood', 'Felt', 'Space', 'Ocean', 'Sunset', 'Marble', 'Grass', 'Neon', 'Desert', 'Ice'];
export const BG_BASE = [0x6d4423, 0x0f4a28, 0x05071a, 0x083e75, 0x2b1146, 0x6e6a62, 0x2c6f2a, 0x07040f, 0xb98c4e, 0xa9cde3];

const LO = -8;
const HI = 23;

function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function quad(g: Graphics, P: Proj, x0: number, y0: number, x1: number, y1: number, color: number, alpha = 1) {
    const a = P(x0, y0), b = P(x1, y0), c = P(x1, y1), d = P(x0, y1);
    g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color, alpha });
}

function line(g: Graphics, P: Proj, pts: [number, number][], width: number, color: number, alpha = 1) {
    const q = pts.map(([x, y]) => P(x, y));
    g.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length; i++) g.lineTo(q[i].x, q[i].y);
    g.stroke({ width, color, alpha });
}

function disc(g: Graphics, P: Proj, cx: number, cy: number, r: number, color: number, alpha: number) {
    const pts = circlePts(cx, cy, r, 12).map(([x, y]) => P(x, y));
    const flat: number[] = [];
    pts.forEach((p) => flat.push(p.x, p.y));
    g.poly(flat).fill({ color, alpha });
}

export function drawBackground(g: Graphics, P: Proj, idx: number, scale: number) {
    const r = rng(1234 + idx);
    quad(g, P, LO, LO, HI, HI, BG_BASE[idx]);
    const w = Math.max(1, scale * 0.06);
    switch (idx) {
        case 0: // wood planks
            for (let y = LO, i = 0; y < HI; y += 1.7, i++) {
                quad(g, P, LO, y, HI, y + 1.7, i % 2 ? 0x7a4d28 : 0x8a5a30, 0.9);
                line(g, P, [[LO, y], [HI, y]], w * 1.4, 0x3d2310, 0.8);
                for (let k = 0; k < 4; k++) {
                    const gx = LO + r() * (HI - LO);
                    line(g, P, [[gx, y + 0.3 + r() * 1.1], [gx + 3 + r() * 5, y + 0.3 + r() * 1.1]], w, 0x4a2c14, 0.5);
                }
            }
            break;
        case 1: // casino felt with a gold border
            for (let i = 0; i < 40; i++) disc(g, P, LO + r() * (HI - LO), LO + r() * (HI - LO), 2 + r() * 3, 0x1b7a40, 0.12);
            line(g, P, [[-5, -5], [20, -5], [20, 20], [-5, 20], [-5, -5]], w * 2.4, 0xd9b44a, 0.95);
            line(g, P, [[-5.6, -5.6], [20.6, -5.6], [20.6, 20.6], [-5.6, 20.6], [-5.6, -5.6]], w, 0xf2d98a, 0.8);
            break;
        case 2: // space
            disc(g, P, 3, 2, 8, 0x4b1d8a, 0.35);
            disc(g, P, 14, 12, 9, 0x0f4a9a, 0.3);
            disc(g, P, 8, 18, 7, 0x8a1d6a, 0.28);
            for (let i = 0; i < 180; i++) {
                const x = LO + r() * (HI - LO), y = LO + r() * (HI - LO), sz = 0.05 + r() * 0.12;
                disc(g, P, x, y, sz, 0xffffff, 0.5 + r() * 0.5);
            }
            break;
        case 3: // ocean waves
            for (let y = LO, i = 0; y < HI; y += 1.1, i++) {
                const pts: [number, number][] = [];
                for (let x = LO; x <= HI; x += 1.2) pts.push([x, y + Math.sin(x * 0.9 + i) * 0.28]);
                line(g, P, pts, w * 1.3, i % 2 ? 0x3d9be0 : 0x1c78c4, 0.65);
            }
            break;
        case 4: // sunset bands
            for (let i = 0; i < 16; i++) {
                const t = i / 15;
                const c = t < 0.5 ? mix(0x3a1565, 0xd8456b, t * 2) : mix(0xd8456b, 0xffa43a, (t - 0.5) * 2);
                quad(g, P, LO, LO + (i * (HI - LO)) / 16, HI, LO + ((i + 1) * (HI - LO)) / 16 + 0.02, c);
            }
            disc(g, P, 7.5, 24, 6, 0xfff0b0, 0.5);
            break;
        case 5: // marble checker floor
            for (let x = -8, i = 0; x < 23; x += 2.5, i++) {
                for (let y = -8, j = 0; y < 23; y += 2.5, j++) {
                    if ((i + j) % 2 === 0) quad(g, P, x, y, x + 2.5, y + 2.5, 0xeeeae2);
                    else quad(g, P, x, y, x + 2.5, y + 2.5, 0x8a857c);
                }
            }
            for (let i = 0; i < 12; i++) {
                const x = LO + r() * (HI - LO), y = LO + r() * (HI - LO);
                line(g, P, [[x, y], [x + 2 + r() * 3, y + 1 + r() * 2], [x + 4 + r() * 3, y + r() * 4]], w * 0.8, 0x5b574f, 0.35);
            }
            break;
        case 6: // mown lawn
            for (let x = LO, i = 0; x < HI; x += 1.6, i++) quad(g, P, x, LO, x + 1.6, HI, i % 2 ? 0x358a32 : 0x44a73f);
            break;
        case 7: // neon grid
            for (let v = LO; v <= HI; v += 1.5) {
                line(g, P, [[v, LO], [v, HI]], w * 1.4, 0xd02cff, 0.6);
                line(g, P, [[LO, v], [HI, v]], w * 1.4, 0x18e0ff, 0.6);
            }
            break;
        case 8: // desert dunes
            for (let i = 0; i < 9; i++) {
                const y0 = LO + i * 3.6;
                const pts: [number, number][] = [];
                for (let x = LO; x <= HI; x += 1.5) pts.push([x, y0 + Math.sin(x * 0.45 + i * 1.7) * 1.1]);
                line(g, P, pts, w * 3, i % 2 ? 0xf0cd8d : 0xa87a40, 0.55);
            }
            break;
        case 9: // ice
            for (let i = 0; i < 16; i++) {
                let x = LO + r() * (HI - LO), y = LO + r() * (HI - LO);
                const pts: [number, number][] = [[x, y]];
                for (let k = 0; k < 4; k++) {
                    x += (r() - 0.5) * 3;
                    y += (r() - 0.5) * 3;
                    pts.push([x, y]);
                }
                line(g, P, pts, w, 0xffffff, 0.8);
            }
            for (let i = 0; i < 50; i++) disc(g, P, LO + r() * (HI - LO), LO + r() * (HI - LO), 0.08 + r() * 0.1, 0xffffff, 0.8);
            break;
        default:
            break;
    }
}
