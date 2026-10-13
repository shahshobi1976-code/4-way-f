// Pure Ludo rules: board geometry, legal moves, progress and the computer-player brain.
// No Pixi / React in here, so it is easy to reason about and test.

export const COLORS = [0xe53935, 0x43a047, 0xfdd835, 0x00bcd4]; // red, green, yellow, cyan
export const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Cyan'];

/** Token position values: -1 = base yard, 0..50 = main track (relative to own start),
 *  51..55 = own coloured home path, 56 = home. */
export const IN_BASE = -1;
export const LAST_TRACK = 50;
export const PATH_START = 51;
export const HOME = 56;

// 52 main-track squares (col,row), clockwise, starting on Red's start square.
function buildTrack(): [number, number][] {
    const t: [number, number][] = [];
    for (let c = 1; c <= 5; c++) t.push([c, 6]);
    for (let r = 5; r >= 0; r--) t.push([6, r]);
    t.push([7, 0], [8, 0]);
    for (let r = 1; r <= 5; r++) t.push([8, r]);
    for (let c = 9; c <= 14; c++) t.push([c, 6]);
    t.push([14, 7], [14, 8]);
    for (let c = 13; c >= 9; c--) t.push([c, 8]);
    for (let r = 9; r <= 14; r++) t.push([8, r]);
    t.push([7, 14], [6, 14]);
    for (let r = 13; r >= 9; r--) t.push([6, r]);
    for (let c = 5; c >= 0; c--) t.push([c, 8]);
    t.push([0, 7], [0, 6]);
    return t;
}
export const TRACK = buildTrack();
export const START_IDX = [0, 13, 26, 39];
/** Start squares and the "star" squares (start + 8) are safe from capture. */
export const SAFE = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);
export const STAR_IDX = [8, 21, 34, 47];

export const HOME_COL: [number, number][][] = [
    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];

// Base-yard spots in board units (cell corner coordinates, so a cell centre is c+0.5).
const BASE_ORIGIN: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];
export const BASE_SPOTS: [number, number][][] = BASE_ORIGIN.map(([ox, oy]) => [
    [ox + 2, oy + 2], [ox + 4, oy + 2], [ox + 2, oy + 4], [ox + 4, oy + 4],
]);
export const BASE_CENTER: [number, number][] = BASE_ORIGIN.map(([ox, oy]) => [ox + 3, oy + 3]);

const HOME_SPOT: [number, number][] = [[6.35, 7.5], [7.5, 6.35], [8.65, 7.5], [7.5, 8.65]];
const HOME_OFF: [number, number][] = [[0, -0.25], [0.25, 0], [0, 0.25], [-0.25, 0]];

/** Board position (board units) for a token with relative position r. */
export function boardPos(color: number, r: number, tok: number): [number, number] {
    if (r < 0) return BASE_SPOTS[color][tok];
    if (r <= LAST_TRACK) {
        const [c, row] = TRACK[(START_IDX[color] + r) % 52];
        return [c + 0.5, row + 0.5];
    }
    if (r < HOME) {
        const [c, row] = HOME_COL[color][r - PATH_START];
        return [c + 0.5, row + 0.5];
    }
    const [hx, hy] = HOME_SPOT[color];
    const [ox, oy] = HOME_OFF[(tok + color) % 4];
    return [hx + ox * 0.6, hy + oy * 0.6];
}

export const globalIdx = (color: number, r: number) => (START_IDX[color] + r) % 52;

export type Tokens = number[][]; // [player][token] -> r

export interface Move {
    tok: number;
    to: number;
    die: number; // index of the die used (0/1)
    value: number;
    captures: { p: number; t: number }[];
    fromBase: boolean;
    reachesHome: boolean;
}

export function newTokens(): Tokens {
    return [0, 1, 2, 3].map(() => [IN_BASE, IN_BASE, IN_BASE, IN_BASE]);
}

/** Legal moves for player p with a single die value. */
export function legalMoves(tokens: Tokens, p: number, value: number, die: number, active: boolean[]): Move[] {
    const out: Move[] = [];
    for (let t = 0; t < 4; t++) {
        const r = tokens[p][t];
        if (r >= HOME) continue;
        let to: number;
        if (r === IN_BASE) {
            if (value !== 6) continue;
            to = 0;
        } else {
            to = r + value;
            if (to > HOME) continue;
        }
        const captures: { p: number; t: number }[] = [];
        if (to <= LAST_TRACK) {
            const g = globalIdx(p, to);
            if (!SAFE.has(g)) {
                for (let q = 0; q < 4; q++) {
                    if (q === p || !active[q]) continue;
                    for (let u = 0; u < 4; u++) {
                        const rr = tokens[q][u];
                        if (rr >= 0 && rr <= LAST_TRACK && globalIdx(q, rr) === g) captures.push({ p: q, t: u });
                    }
                }
            }
        }
        out.push({ tok: t, to, die, value, captures, fromBase: r === IN_BASE, reachesHome: to === HOME });
    }
    return out;
}

/** Share of the way to a win, 0..100. A token on its coloured path (or home) counts as fully done,
 *  because four tokens on the coloured path / home is a win. */
export function tokenShare(r: number): number {
    if (r < 0) return 0;
    return Math.min(1, (r + 1) / (PATH_START + 1));
}
export function percent(tokens: Tokens, p: number): number {
    let s = 0;
    for (let t = 0; t < 4; t++) s += tokenShare(tokens[p][t]);
    return Math.round((s / 4) * 100);
}
/** Finer progress used for tie-breaks and ranking (counts the whole route including the path). */
export function fineProgress(tokens: Tokens, p: number): number {
    let s = 0;
    for (let t = 0; t < 4; t++) s += tokens[p][t] + 1;
    return s;
}
export function hasWon(tokens: Tokens, p: number): boolean {
    return tokens[p].every((r) => r >= PATH_START);
}
/** Lucky Seven: every token is in base, home or on its coloured path (none on the main track). */
export function luckySevenAllowed(tokens: Tokens, p: number): boolean {
    return tokens[p].every((r) => r < 0 || r >= PATH_START) && !hasWon(tokens, p);
}
export function isLuckySum(a: number, b: number): boolean {
    return a + b === 7;
}

export function leaderOf(tokens: Tokens, active: boolean[]): number {
    let best = -1, bs = -1;
    for (let p = 0; p < 4; p++) {
        if (!active[p]) continue;
        const s = percent(tokens, p) * 1000 + fineProgress(tokens, p);
        if (s > bs) { bs = s; best = p; }
    }
    return best;
}

/** The computer players pile on whoever is winning: captures of the leader score highest. */
export function scoreMove(tokens: Tokens, p: number, m: Move, active: boolean[]): number {
    const leader = leaderOf(tokens, active);
    const leaderPct = leader >= 0 ? percent(tokens, leader) / 100 : 0;
    let s = Math.random() * 6;
    for (const c of m.captures) {
        const victimProg = tokens[c.p][c.t];
        s += 100 + victimProg * 0.8;
        if (c.p === leader && c.p !== p) s += 70 + 60 * leaderPct;
    }
    if (m.reachesHome) s += 95;
    if (m.fromBase) s += 58;
    if (m.to >= PATH_START && !m.reachesHome) s += 40;
    s += m.to * 0.35;
    if (m.to <= LAST_TRACK) {
        const g = globalIdx(p, m.to);
        if (SAFE.has(g)) s += 18;
        // chase the leader: sit 1..6 squares behind a leader token on the track
        if (leader >= 0 && leader !== p) {
            for (let u = 0; u < 4; u++) {
                const rr = tokens[leader][u];
                if (rr < 0 || rr > LAST_TRACK) continue;
                const lg = globalIdx(leader, rr);
                const dist = (lg - g + 52) % 52;
                if (dist >= 1 && dist <= 6 && !SAFE.has(lg)) s += 22 + 26 * leaderPct;
            }
        }
        // avoid landing right in front of an opponent
        if (!SAFE.has(g)) {
            for (let q = 0; q < 4; q++) {
                if (q === p || !active[q]) continue;
                for (let u = 0; u < 4; u++) {
                    const rr = tokens[q][u];
                    if (rr < 0 || rr > LAST_TRACK) continue;
                    const dist = (g - globalIdx(q, rr) + 52) % 52;
                    if (dist >= 1 && dist <= 6) s -= q === leader ? 8 : 22;
                }
            }
        }
    }
    const r0 = tokens[p][m.tok];
    if (r0 >= 0 && r0 <= LAST_TRACK && SAFE.has(globalIdx(p, r0))) s -= 9;
    return s;
}

export function pickMove(tokens: Tokens, p: number, options: Move[], active: boolean[]): Move {
    let best = options[0], bs = -Infinity;
    for (const m of options) {
        const s = scoreMove(tokens, p, m, active);
        if (s > bs) { bs = s; best = m; }
    }
    return best;
}

/**
 * Largest number of captures the player can still make from `dice`.
 *
 * Each die is spent on its own move (a Lucky Seven is just 6 + 6 here), so this
 * explores capture-only sequences: pick an unused die that can capture, take the
 * capture, then continue with the rest. The obligation is to collect them all,
 * so missing any of them is what earns the penalty.
 *
 * Capture-only exploration is deliberate. A non-capturing move could in theory
 * line up a later capture, but that is a vanishingly rare edge and chasing it
 * would make the penalty unpredictable.
 */
export function maxCaptures(
    tokens: Tokens,
    p: number,
    dice: number[],
    active: boolean[],
): { taken: number; victims: { p: number; t: number }[] } {
    let best: { p: number; t: number }[] = [];

    const explore = (b: Tokens, unused: number[], victims: { p: number; t: number }[]) => {
        if (victims.length > best.length) best = victims.slice();
        for (let i = 0; i < unused.length; i++) {
            const die = unused[i];
            const opts = legalMoves(b, p, dice[die], die, active).filter((m) => m.captures.length > 0);
            for (const m of opts) {
                const nb = b.map((row) => row.slice());
                nb[p][m.tok] = m.to;
                for (const c of m.captures) nb[c.p][c.t] = IN_BASE;
                const nextVictims = victims.concat(m.captures.map((c) => ({ p: c.p, t: c.t })));
                explore(nb, unused.filter((d) => d !== die), nextVictims);
            }
        }
    };

    explore(tokens.map((row) => row.slice()), dice.map((_, i) => i), []);
    return { taken: best.length, victims: best };
}

export function randDie(): number {
    return 1 + Math.floor(Math.random() * 6);
}
