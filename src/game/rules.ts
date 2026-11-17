// Pure Ludo rules: board geometry, legal moves, progress and the computer-player brain.
// No Pixi / React in here, so it is easy to reason about and test.

export const COLORS = [0xef4444, 0x22c55e, 0xfacc15, 0x2563eb]; // Red, Green, Yellow, Blue (matching screenshot scheme)
export const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];

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
    die: number; // index of the die used (0, 1, or 2 = combined both dice)
    value: number;
    captures: { p: number; t: number }[];
    fromBase: boolean;
    reachesHome: boolean;
    combined?: boolean;
}

export function newTokens(): Tokens {
    return [0, 1, 2, 3].map(() => [IN_BASE, IN_BASE, IN_BASE, IN_BASE]);
}

function countColorOnGlobal(tokens: Tokens, color: number, g: number, excludeTok = -1): number {
    let count = 0;
    for (let u = 0; u < 4; u++) {
        if (u === excludeTok) continue;
        const rr = tokens[color][u];
        if (rr >= 0 && rr <= LAST_TRACK && globalIdx(color, rr) === g) count++;
    }
    return count;
}

/**
 * Computes captures for player `p` landing token `tok` at relative square `to`.
 * Stack / Pair Protection: a capture only succeeds if `myCount >= otherCount`
 * on the target non-safe square (counting the moving token plus any friendly
 * tokens of `p` already standing on that square).
 */
function capturesOnSquare(tokens: Tokens, p: number, tok: number, to: number, active: boolean[]): { p: number; t: number }[] {
    const captures: { p: number; t: number }[] = [];
    if (to < 0 || to > LAST_TRACK) return captures;
    const g = globalIdx(p, to);
    if (SAFE.has(g)) return captures;

    const myCount = 1 + countColorOnGlobal(tokens, p, g, tok);
    for (let q = 0; q < 4; q++) {
        if (q === p || !active[q]) continue;
        const oppTokens: { p: number; t: number }[] = [];
        for (let u = 0; u < 4; u++) {
            const rr = tokens[q][u];
            if (rr >= 0 && rr <= LAST_TRACK && globalIdx(q, rr) === g) {
                oppTokens.push({ p: q, t: u });
            }
        }
        if (oppTokens.length > 0 && myCount >= oppTokens.length) {
            captures.push(...oppTokens);
        }
    }
    return captures;
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
        const captures = capturesOnSquare(tokens, p, t, to, active);
        out.push({ tok: t, to, die, value, captures, fromBase: r === IN_BASE, reachesHome: to === HOME });
    }
    return out;
}

/**
 * All legal moves for player `p` given the current `[d0, d1]` and `diceUsed` state.
 * Enforces the Lone Token Full-Total Rule:
 * - When player `p` has only 1 active token out on the board (`0 <= r < HOME`)
 *   and both dice remain unused:
 *   - Partial entry of that lone token into its coloured home path (`>= PATH_START`)
 *     or centre home (`HOME`) with a single die is blocked.
 *   - That lone token may move by the full combined total (`dice[0] + dice[1]`,
 *     with `die: 2, combined: true`) whenever legal (`to <= HOME`).
 */
export function legalMovesForTurn(
    tokens: Tokens,
    p: number,
    dice: [number, number],
    diceUsed: [boolean, boolean],
    active: boolean[],
): Move[] {
    const bothRemaining = !diceUsed[0] && !diceUsed[1];
    const outIndices: number[] = [];
    for (let t = 0; t < 4; t++) {
        const r = tokens[p][t];
        if (r >= 0 && r < HOME) outIndices.push(t);
    }
    const isLoneToken = outIndices.length === 1;
    const loneTok = isLoneToken ? outIndices[0] : -1;

    const out: Move[] = [];
    for (let i = 0; i < 2; i++) {
        if (diceUsed[i]) continue;
        const single = legalMoves(tokens, p, dice[i], i, active);
        for (const m of single) {
            if (bothRemaining && isLoneToken && m.tok === loneTok) {
                const r = tokens[p][loneTok];
                if ((r <= LAST_TRACK && m.to >= PATH_START) || (r >= PATH_START && m.to === HOME)) {
                    continue;
                }
            }
            out.push(m);
        }
    }

    if (bothRemaining && isLoneToken) {
        const r = tokens[p][loneTok];
        const total = dice[0] + dice[1];
        const to = r + total;
        if (to <= HOME) {
            const captures = capturesOnSquare(tokens, p, loneTok, to, active);
            out.push({
                tok: loneTok,
                to,
                die: 2,
                value: total,
                captures,
                fromBase: false,
                reachesHome: to === HOME,
                combined: true,
            });
        }
    }

    return out;
}

/** Share of the way to a win, 0..100. A token in home (position 56) counts as fully done. */
export function tokenShare(r: number): number {
    if (r < 0) return 0;
    return Math.min(1, (r + 1) / (HOME + 1));
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
    return tokens[p].every((r) => r === HOME);
}
/**
 * Lucky Seven: active only when zero tokens are on the open track AND
 * at least 1 token is still in base (1-4 in base, others on coloured path or centre home).
 */
export function luckySevenAllowed(tokens: Tokens, p: number): boolean {
    const hasBaseToken = tokens[p].some((r) => r === IN_BASE);
    const noneOnOpenTrack = tokens[p].every((r) => r === IN_BASE || r >= PATH_START);
    return hasBaseToken && noneOnOpenTrack && !hasWon(tokens, p);
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

/** Explicit alias for theme calculation: Match Leader / Potential Winner detection */
export const getMatchLeader = leaderOf;

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
        else if (countColorOnGlobal(tokens, p, g, m.tok) >= 1) {
            // Forming or reinforcing a protected friendly stack on an open square
            s += 14;
        }
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
        // avoid landing right in front of an opponent unless protected in a friendly stack
        if (!SAFE.has(g) && countColorOnGlobal(tokens, p, g, m.tok) === 0) {
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
 * Explores single-die captures, same-token combined-sum captures,
 * and two-token pair/stack captures (where two friendly tokens land on an
 * opponent stack so myCount >= otherCount).
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

        // 1. Single-die capture moves
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

        // 2. Two-die sequences:
        //    (a) Same-token combined total capture (e.g. 6 + 1 on the same token)
        //    (b) Two-token pair/stack capture (tok1 lands on opponent stack, then tok2 joins to make myCount >= otherCount)
        if (unused.length >= 2) {
            for (let i = 0; i < unused.length; i++) {
                const d1 = unused[i];
                const d2 = unused.find((d) => d !== d1)!;
                const firstMoves = legalMoves(b, p, dice[d1], d1, active);
                for (const m1 of firstMoves) {
                    const nb1 = b.map((row) => row.slice());
                    nb1[p][m1.tok] = m1.to;
                    for (const c of m1.captures) nb1[c.p][c.t] = IN_BASE;

                    const g1 = m1.to <= LAST_TRACK ? globalIdx(p, m1.to) : -1;
                    const secondMoves = legalMoves(nb1, p, dice[d2], d2, active).filter(
                        (m2) =>
                            m2.captures.length > 0 &&
                            (m2.tok === m1.tok || (g1 >= 0 && m2.to <= LAST_TRACK && globalIdx(p, m2.to) === g1))
                    );
                    for (const m2 of secondMoves) {
                        const nb2 = nb1.map((row) => row.slice());
                        nb2[p][m2.tok] = m2.to;
                        for (const c of m2.captures) nb2[c.p][c.t] = IN_BASE;
                        const nextVictims = victims
                            .concat(m1.captures.map((c) => ({ p: c.p, t: c.t })))
                            .concat(m2.captures.map((c) => ({ p: c.p, t: c.t })));
                        explore(nb2, [], nextVictims);
                    }
                }
            }
        }
    };

    explore(tokens.map((row) => row.slice()), dice.map((_, i) => i), []);
    return { taken: best.length, victims: best };
}

export function randDie(): number {
    return 1 + Math.floor(Math.random() * 6);
}

/**
 * Finds the index of the player's token that missed a mandatory capture.
 * Evaluates the initial board state against legal capture moves (single-die,
 * combined-sum, and two-token stack captures).
 */
export function findOffendingToken(
    initialTokens: Tokens,
    currentTokens: Tokens,
    p: number,
    dice: number[],
    active: boolean[]
): number | null {
    const candidates: number[] = [];
    // 1. Single-die direct captures
    for (let d = 0; d < dice.length; d++) {
        const moves = legalMoves(initialTokens, p, dice[d], d, active);
        for (const m of moves) {
            if (m.captures.length > 0 && !candidates.includes(m.tok)) {
                candidates.push(m.tok);
            }
        }
    }
    // 2. Combined total sum or 2-token stack capture moves
    if (dice.length >= 2) {
        for (let d = 0; d < dice.length; d++) {
            const moves = legalMoves(initialTokens, p, dice[d], d, active);
            for (const m of moves) {
                const nb = initialTokens.map((row) => row.slice());
                nb[p][m.tok] = m.to;
                for (const c of m.captures) nb[c.p][c.t] = IN_BASE;
                const g1 = m.to <= LAST_TRACK ? globalIdx(p, m.to) : -1;
                const rem = dice.filter((_, idx) => idx !== d);
                for (let d2 = 0; d2 < rem.length; d2++) {
                    const moves2 = legalMoves(nb, p, rem[d2], d2, active);
                    if (
                        moves2.some(
                            (m2) =>
                                m2.captures.length > 0 &&
                                (m2.tok === m.tok || (g1 >= 0 && m2.to <= LAST_TRACK && globalIdx(p, m2.to) === g1))
                        )
                    ) {
                        if (!candidates.includes(m.tok)) candidates.push(m.tok);
                    }
                }
            }
        }
    }
    // Prefer candidate still on the board and not home
    for (const tok of candidates) {
        if (currentTokens[p][tok] >= 0 && currentTokens[p][tok] < HOME) {
            return tok;
        }
    }
    // Candidate still anywhere >= 0
    for (const tok of candidates) {
        if (currentTokens[p][tok] >= 0) {
            return tok;
        }
    }
    if (candidates.length > 0) return candidates[0];
    // Fallback: any active token on track
    for (let t = 0; t < 4; t++) {
        if (currentTokens[p][t] >= 0 && currentTokens[p][t] < HOME) {
            return t;
        }
    }
    return null;
}

export interface CaptureObligation {
    required: number;
    optionTokens: number[];
    hasSingle: boolean;
    hasTotal: boolean;
    hasPair: boolean;
}

/**
 * Evaluates capture obligation at the start of a roll `[d0, d1]`:
 * - options = single-die captures, total captures (final square only), pair captures (two tokens, one die each)
 * - if no options: required = 0
 * - if a total or pair option exists: required = 1
 * - else: required = most independent single-die captures possible (each die used once)
 */
export function evaluateCaptureObligation(
    tokens: Tokens,
    p: number,
    dice: number[],
    active: boolean[],
): CaptureObligation {
    const optionSet = new Set<number>();
    let hasSingle = false;
    let hasTotal = false;
    let hasPair = false;

    // 1. Single-die captures
    for (let d = 0; d < dice.length; d++) {
        const moves = legalMoves(tokens, p, dice[d], d, active);
        for (const m of moves) {
            if (m.captures.length > 0) {
                hasSingle = true;
                optionSet.add(m.tok);
            }
        }
    }

    // 2. Two-die options: total captures (final square only) and pair captures (two tokens, one die each)
    if (dice.length >= 2) {
        for (let d1 = 0; d1 < dice.length; d1++) {
            const d2 = d1 === 0 ? 1 : 0;
            const firstMoves = legalMoves(tokens, p, dice[d1], d1, active);
            for (const m1 of firstMoves) {
                const nb1 = tokens.map((row) => row.slice());
                nb1[p][m1.tok] = m1.to;
                for (const c of m1.captures) nb1[c.p][c.t] = IN_BASE;

                const g1 = m1.to <= LAST_TRACK ? globalIdx(p, m1.to) : -1;
                const secondMoves = legalMoves(nb1, p, dice[d2], d2, active);
                for (const m2 of secondMoves) {
                    if (m2.captures.length === 0) continue;
                    if (m2.tok === m1.tok) {
                        // Total capture (final square only)
                        hasTotal = true;
                        optionSet.add(m1.tok);
                    } else if (g1 >= 0 && m2.to <= LAST_TRACK && globalIdx(p, m2.to) === g1) {
                        // Pair capture (two tokens, one die each)
                        hasPair = true;
                        optionSet.add(m1.tok);
                        optionSet.add(m2.tok);
                    }
                }
            }
        }
    }

    let required = 0;
    if (hasSingle || hasTotal || hasPair) {
        if (hasTotal || hasPair) {
            required = 1;
        } else {
            // Most independent single-die captures possible (each die used once)
            let bestCount = 0;
            const exploreSingle = (b: Tokens, unused: number[], count: number) => {
                if (count > bestCount) bestCount = count;
                for (let i = 0; i < unused.length; i++) {
                    const dieIdx = unused[i];
                    const opts = legalMoves(b, p, dice[dieIdx], dieIdx, active).filter((m) => m.captures.length > 0);
                    for (const m of opts) {
                        const nb = b.map((row) => row.slice());
                        nb[p][m.tok] = m.to;
                        for (const c of m.captures) nb[c.p][c.t] = IN_BASE;
                        exploreSingle(nb, unused.filter((d) => d !== dieIdx), count + 1);
                    }
                }
            };
            exploreSingle(tokens.map((row) => row.slice()), dice.map((_, idx) => idx), 0);
            required = bestCount;
        }
    }

    return {
        required,
        optionTokens: Array.from(optionSet).sort((a, b) => a - b),
        hasSingle,
        hasTotal,
        hasPair,
    };
}

/**
 * Returns every token that had a capture option at the start of the turn and did
 * NOT make a capture during the turn (provided it is currently out of base).
 */
export function offendingTokensForPenalty(
    obligation: CaptureObligation,
    currentTokens: Tokens,
    p: number,
    tokensThatCaptured: Set<number>,
): number[] {
    return obligation.optionTokens.filter(
        (tok) => !tokensThatCaptured.has(tok) && currentTokens[p][tok] >= 0,
    );
}
