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
export const COLORED_PATH_START_POS = PATH_START;
export const CENTER_HOME_POS = HOME;

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
    if (r < CENTER_HOME_POS) {
        const [c, row] = HOME_COL[color][r - COLORED_PATH_START_POS];
        return [c + 0.5, row + 0.5];
    }
    const [hx, hy] = HOME_SPOT[color];
    const [ox, oy] = HOME_OFF[(tok + color) % 4];
    return [hx + ox * 0.6, hy + oy * 0.6];
}

/**
 * Normalized board-plane forward unit vector [dx, dy] along player `color`'s path
 * at relative position `r` (works whether in base yard, on track, turning a corner,
 * on the coloured home path, or finished inside Centre Home).
 */
export function getTokenPathWorldDir(color: number, r: number, tok = 0): [number, number] {
    let from: [number, number];
    let to: [number, number];
    if (r < 0) {
        from = boardPos(color, 0, tok);
        to = boardPos(color, 1, tok);
    } else if (r >= CENTER_HOME_POS - 1) {
        from = boardPos(color, CENTER_HOME_POS - 1, tok);
        to = HOME_SPOT[color] ?? [7.5, 7.5];
    } else {
        from = boardPos(color, r, tok);
        to = boardPos(color, r + 1, tok);
    }
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [1, 0];
    return [dx / len, dy / len];
}

/**
 * Full 57-cell board path for player `color`:
 * 51 outer-track squares (indices 0..50, ending on own-arm outer middle turn square)
 * + 5 coloured home-stretch squares (indices 51..55)
 * + 1 Centre Home (Gul) at index CENTER_HOME_POS (56 = path.length - 1).
 */
export function getPawnPath(color: number): [number, number][] {
    const path: [number, number][] = [];
    const start = START_IDX[color] ?? 0;
    for (let r = 0; r <= LAST_TRACK; r++) {
        path.push(TRACK[(start + r) % 52]);
    }
    const homeStretch = HOME_COL[color] ?? HOME_COL[0];
    for (let i = 0; i < homeStretch.length; i++) {
        path.push(homeStretch[i]);
    }
    path.push([7, 7]);
    return path;
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

function countColorOnGlobalExcluding(tokens: Tokens, color: number, g: number, excludeA = -1, excludeB = -1): number {
    let count = 0;
    for (let u = 0; u < 4; u++) {
        if (u === excludeA || u === excludeB) continue;
        const rr = tokens[color][u];
        if (rr >= 0 && rr <= LAST_TRACK && globalIdx(color, rr) === g) count++;
    }
    return count;
}

function countColorOnGlobal(tokens: Tokens, color: number, g: number, excludeTok = -1): number {
    return countColorOnGlobalExcluding(tokens, color, g, excludeTok);
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

/** True when player `p` has exactly 1 active token out on the path (0 <= r < CENTER_HOME_POS). */
export function isLoneTokenOnTrack(tokens: Tokens, p: number): boolean {
    const list = tokens[p];
    if (!list) return false;
    let onTrack = 0;
    for (let t = 0; t < list.length; t++) {
        if (list[t] >= 0 && list[t] < CENTER_HOME_POS) onTrack++;
    }
    return onTrack === 1;
}

/**
 * Resolves a player's tap on a pawn across local and online play:
 * - If the player explicitly clicked a die (`dieConfirmed`), honor that die first.
 * - Otherwise under the Lone Token rule when combined (`die === 2`) is legal and
 *   either `pos + total >= COLORED_PATH_START_POS` or no base-deploy 6 is available
 *   (or the combined move captures), prioritize `'combined'` before single-die fallback.
 */
export function resolvePawnTapMove(
    tokens: Tokens,
    p: number,
    tok: number,
    optionsNow: Move[],
    selDie: number,
    dieConfirmed: boolean,
    dice: [number, number],
    diceUsed: [boolean, boolean],
): Move | undefined {
    const forTok = optionsNow.filter((o) => o.tok === tok);
    if (forTok.length === 0) return undefined;

    if (dieConfirmed) {
        const confirmedMatch = forTok.find((o) => o.die === selDie);
        if (confirmedMatch) return confirmedMatch;
    }

    const bothUnused = !diceUsed[0] && !diceUsed[1];
    const combinedMove = bothUnused ? forTok.find((o) => o.die === 2 || o.combined) : undefined;
    if (!dieConfirmed && combinedMove && isLoneTokenOnTrack(tokens, p)) {
        const pos = tokens[p][tok];
        const total = dice[0] + dice[1];
        const hasBaseDeploy6 =
            tokens[p].some((r) => r === IN_BASE) && (dice[0] === 6 || dice[1] === 6);
        if (
            pos + total >= COLORED_PATH_START_POS ||
            !hasBaseDeploy6 ||
            combinedMove.captures.length > 0
        ) {
            return combinedMove;
        }
    }

    if (!dieConfirmed && combinedMove && combinedMove.captures.length > 0) {
        return combinedMove;
    }

    const selectedMatch = forTok.find((o) => o.die === selDie);
    if (selectedMatch) return selectedMatch;

    if (combinedMove) return combinedMove;
    return forTok[0];
}

/**
 * Returns true when player `pIdx` has:
 * - Exactly 2 active tokens out on the path (`0 <= r < CENTER_HOME_POS`), with no other active tokens
 * - BOTH of those 2 tokens inside the coloured home path (`COLORED_PATH_START_POS <= r < CENTER_HOME_POS`)
 * - BOTH tokens able to reach `CENTER_HOME_POS` (56) using one die each (`dice[0]` and `dice[1]`).
 */
export function isTwoColoredTokensExactGulTurn(
    tokens: Tokens,
    pIdx: number,
    dice: number[],
): boolean {
    if (!dice || dice.length < 2 || (dice[0] ?? 0) <= 0 || (dice[1] ?? 0) <= 0) return false;
    const list = tokens[pIdx];
    if (!list) return false;
    const activeIndices: number[] = [];
    for (let t = 0; t < list.length; t++) {
        if (list[t] >= 0 && list[t] < CENTER_HOME_POS) activeIndices.push(t);
    }
    if (activeIndices.length !== 2) return false;
    const posA = list[activeIndices[0]];
    const posB = list[activeIndices[1]];
    if (posA < COLORED_PATH_START_POS || posB < COLORED_PATH_START_POS) return false;
    const [d0, d1] = dice;
    return (
        (posA + d0 === CENTER_HOME_POS && posB + d1 === CENTER_HOME_POS) ||
        (posA + d1 === CENTER_HOME_POS && posB + d0 === CENTER_HOME_POS)
    );
}

/**
 * Strict "Gul or Pass?" gate used by both local execution and authoritative server:
 * Opens/allows the Gul or Pass choice ONLY when:
 * 1) `isLoneTokenOnTrack(tokens, pIdx)` is true (all other 3 tokens are in base or finished), AND
 * 2) That lone runner reaches `CENTER_HOME_POS` using the full combined/remaining dice roll.
 *
 * When 2 or more active tokens are `'on-path'`, entering Centre Home skips the prompt
 * and completes Gul directly.
 */
export function shouldPromptGulChoice(
    tokens: Tokens,
    pIdx: number,
    steps: number,
    dieIdx: number | 'combined',
    dice: number[],
    _initialTurnTokens?: Tokens | null,
    tokenIdx?: number,
): boolean {
    if (!isLoneTokenOnTrack(tokens, pIdx)) return false;
    const list = tokens[pIdx];
    const loneTok = list.findIndex((r) => r >= 0 && r < CENTER_HOME_POS);
    if (loneTok < 0 || (tokenIdx !== undefined && tokenIdx !== loneTok)) return false;
    const pos = list[loneTok];
    if (pos + steps !== CENTER_HOME_POS) return false;

    const diceSum = (dice?.[0] ?? 0) + (dice?.[1] ?? 0);
    const isCombined =
        dieIdx === 2 ||
        dieIdx === 'combined' ||
        (dice.length >= 2 && (dice[0] ?? 0) > 0 && (dice[1] ?? 0) > 0 && steps === diceSum);
    return isCombined;
}

/**
 * Resolves Centre Home entry choice for timeout auto-play or temporary bot takeover:
 * - Human timeout (`turnAutoPlay`) or disconnected human seat takeover ALWAYS resolves a
 *   `shouldPromptGulChoice` move as `'pass'` instead of auto-entering Gul.
 * - Normal AI bot seats resolve as `'gul'` so bots finish matches normally.
 */
export function resolveAutoPlayGulAction(
    tokens: Tokens,
    pIdx: number,
    move: Pick<Move, 'tok' | 'die' | 'value'>,
    dice: number[],
    isAutoPlayOrTakeover: boolean,
    initialTurnTokens?: Tokens | null,
): 'gul' | 'pass' {
    if (!isAutoPlayOrTakeover) return 'gul';
    return shouldPromptGulChoice(
        tokens,
        pIdx,
        move.value,
        move.die,
        dice,
        initialTurnTokens,
        move.tok,
    )
        ? 'pass'
        : 'gul';
}

/**
 * All legal moves for player `p` given the current `[d0, d1]` and `diceUsed` state.
 * Enforces the Lone Token Full-Total Rule:
 * - When player `p` has only 1 active token out on the board (`0 <= r < CENTER_HOME_POS`)
 *   and both unspent dice remain (`availableTotal > numSteps`):
 *   - Partial entry of that lone token into its coloured home path (`>= COLORED_PATH_START_POS`)
 *     or centre home (`CENTER_HOME_POS`) with a single die is blocked.
 *   - After one die has been legally played (leaving only 1 unspent die), that remaining die
 *     is allowed to enter `COLORED_PATH_START_POS..CENTER_HOME_POS`.
 *   - When both dice remain unused, that lone token may move by the full combined total
 *     (`dice[0] + dice[1]`, with `die: 2, combined: true`) whenever legal (`to <= CENTER_HOME_POS`).
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
        if (r >= 0 && r < CENTER_HOME_POS) outIndices.push(t);
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
                if (
                    (r <= LAST_TRACK && m.to >= COLORED_PATH_START_POS) ||
                    (r >= COLORED_PATH_START_POS && m.to === CENTER_HOME_POS)
                ) {
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
        if (to <= CENTER_HOME_POS) {
            const captures = capturesOnSquare(tokens, p, loneTok, to, active);
            out.push({
                tok: loneTok,
                to,
                die: 2,
                value: total,
                captures,
                fromBase: false,
                reachesHome: to === CENTER_HOME_POS,
                combined: true,
            });
        }
    }

    return out;
}

/**
 * Resolves a combined double-die sprint (`die: 2, combined: true`) for any active
 * `'on-path'` token (`0 <= r < CENTER_HOME_POS`) when both dice remain unspent.
 * - Pawns still in base (`IN_BASE`) are never eligible for combined moves (must exit on 6).
 * - Preserves exact `<= CENTER_HOME_POS` target bounds, safe-square checks, and captures.
 */
export function findCombinedSprintMove(
    tokens: Tokens,
    p: number,
    tok: number,
    dice: number[],
    diceUsed: [boolean, boolean],
    active: boolean[],
): Move | undefined {
    if (!dice || dice.length < 2 || diceUsed[0] || diceUsed[1]) return undefined;
    const d0 = dice[0] ?? 0;
    const d1 = dice[1] ?? 0;
    if (d0 <= 0 || d1 <= 0) return undefined;
    if (tok < 0 || tok >= 4) return undefined;
    const r = tokens[p]?.[tok];
    if (r === undefined || r === IN_BASE || r < 0 || r >= CENTER_HOME_POS) return undefined;

    const total = d0 + d1;
    const to = r + total;
    if (to > CENTER_HOME_POS) return undefined;

    const captures = capturesOnSquare(tokens, p, tok, to, active);
    return {
        tok,
        to,
        die: 2,
        value: total,
        captures,
        fromBase: false,
        reachesHome: to === CENTER_HOME_POS,
        combined: true,
    };
}

/** All legal combined-sprint moves across all `'on-path'` tokens of player `p`. */
export function legalCombinedSprintMoves(
    tokens: Tokens,
    p: number,
    dice: number[],
    diceUsed: [boolean, boolean],
    active: boolean[],
): Move[] {
    const res: Move[] = [];
    for (let t = 0; t < 4; t++) {
        const mv = findCombinedSprintMove(tokens, p, t, dice, diceUsed, active);
        if (mv) res.push(mv);
    }
    return res;
}

/** Full path length for a player's colour: open track (51) + coloured home stretch (5) + centre home (1) = 57. */
export function getPathLength(color = 0): number {
    return (LAST_TRACK + 1) + (HOME_COL[color]?.length ?? 5) + 1;
}

/** Dynamic index where the player's coloured home stretch begins (last 6 indices = 5 home-stretch + 1 centre). */
export function coloredPathStartIndex(color = 0): number {
    return getPathLength(color) - 6;
}

/** Share of the way to a win, 0..1. Any token on or past the coloured home path counts as 100% done. */
export function tokenShare(r: number, color = 0): number {
    if (r < 0) return 0;
    const winTarget = coloredPathStartIndex(color);
    return Math.min(1, (r + 1) / (winTarget + 1));
}
export function percent(tokens: Tokens, p: number): number {
    let s = 0;
    for (let t = 0; t < 4; t++) s += tokenShare(tokens[p][t], p);
    return Math.round((s / 4) * 100);
}
/** Finer progress used for tie-breaks and ranking (counts the whole route including the path). */
export function fineProgress(tokens: Tokens, p: number): number {
    let s = 0;
    for (let t = 0; t < 4; t++) s += tokens[p][t] + 1;
    return s;
}
/**
 * Coloured Path Win: returns true as soon as all 4 tokens of player `p` have reached
 * their coloured home stretch (pos >= coloredPathStartIndex) or centre home (CENTER_HOME_POS).
 */
export function hasWon(tokens: Tokens, p: number): boolean {
    const list = tokens[p];
    if (!list || list.length === 0) return false;
    const startIdx = coloredPathStartIndex(p);
    return list.every((r) => r >= startIdx);
}
export const checkForWin = hasWon;
/**
 * Lucky Seven: active only when zero tokens are on the open track AND
 * at least 1 token is still in base (1-4 in base, others on coloured path or centre home).
 * Note: the outer turn square (LAST_TRACK = 50) is still part of the open track.
 */
export function luckySevenAllowed(tokens: Tokens, p: number): boolean {
    const hasBaseToken = tokens[p].some((r) => r === IN_BASE);
    const noneOnOpenTrack = tokens[p].every((r) => r === IN_BASE || r >= COLORED_PATH_START_POS);
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

export interface MatchLeaderResult {
    leaderIdx: number;
    score: number;
}

export type RivalryTier = 'normal' | 'heat' | 'dethrone';

export interface RivalryState {
    leaderIdx: number;
    leaderPct: number;
    runnerUpPct: number;
    leadMargin: number;
    tier: RivalryTier;
}

export interface GrudgeEntry {
    targetIdx: number;
    turnsLeft: number;
}

export interface AIScoringOptions {
    personality?: string;
    grudgeTargetIdx?: number | null;
}

export function createEmptyGrudges(): (GrudgeEntry | null)[] {
    return [null, null, null, null];
}

export function recordCaptureGrudge(
    grudges: (GrudgeEntry | null)[],
    attackerIdx: number,
    victimIdx: number,
): { revengeHit: boolean } {
    if (
        attackerIdx < 0 ||
        attackerIdx >= grudges.length ||
        victimIdx < 0 ||
        victimIdx >= grudges.length ||
        attackerIdx === victimIdx
    ) {
        return { revengeHit: false };
    }
    const revengeHit = grudges[attackerIdx]?.targetIdx === victimIdx;
    if (revengeHit) {
        grudges[attackerIdx] = null;
    }
    grudges[victimIdx] = { targetIdx: attackerIdx, turnsLeft: 6 };
    return { revengeHit };
}

export function decrementSeatGrudge(grudges: (GrudgeEntry | null)[], seatIdx: number): void {
    if (seatIdx < 0 || seatIdx >= grudges.length) return;
    const entry = grudges[seatIdx];
    if (!entry) return;
    const nextTurns = entry.turnsLeft - 1;
    grudges[seatIdx] = nextTurns > 0 ? { targetIdx: entry.targetIdx, turnsLeft: nextTurns } : null;
}

/**
 * Evaluates escalating rivalry state (`normal` | `heat` | `dethrone`) across active seats
 * (optionally excluding `excludePIdx`), returning `{ leaderIdx, leaderPct, runnerUpPct, leadMargin, tier }`.
 */
export function evaluateRivalryState(
    pawns: Tokens,
    excludePIdx = -1,
    active: boolean[] = [true, true, true, true],
): RivalryState {
    const ranked: { p: number; pct: number; fine: number }[] = [];
    for (let p = 0; p < pawns.length; p++) {
        if (p === excludePIdx || !active[p]) continue;
        ranked.push({
            p,
            pct: percent(pawns, p),
            fine: fineProgress(pawns, p),
        });
    }
    if (ranked.length === 0) {
        return { leaderIdx: -1, leaderPct: 0, runnerUpPct: 0, leadMargin: 0, tier: 'normal' };
    }
    ranked.sort((a, b) => b.pct - a.pct || b.fine - a.fine);
    const leaderIdx = ranked[0].p;
    const leaderPct = ranked[0].pct;
    const runnerUpPct = ranked.length > 1 ? ranked[1].pct : 0;
    const leadMargin = Math.max(0, leaderPct - runnerUpPct);

    let tier: RivalryTier = 'normal';
    if (leaderPct >= 75 || (leaderPct >= 45 && leadMargin >= 20)) {
        tier = 'dethrone';
    } else if (leaderPct >= 55 || (leaderPct >= 30 && leadMargin >= 12)) {
        tier = 'heat';
    }
    return { leaderIdx, leaderPct, runnerUpPct, leadMargin, tier };
}

/**
 * Scores every other active seat (`finished` pawns weighted 1000 + active pawn `pos + 1`)
 * and returns the current match leader `{ leaderIdx, score }`.
 */
export function getMatchLeader(
    pawns: Tokens,
    excludePIdx = -1,
    active: boolean[] = [true, true, true, true],
): MatchLeaderResult {
    let leaderIdx = -1;
    let bestScore = -1;
    for (let p = 0; p < pawns.length; p++) {
        if (p === excludePIdx || !active[p]) continue;
        const row = pawns[p] || [];
        let score = 0;
        for (let t = 0; t < row.length; t++) {
            const pos = row[t];
            if (pos >= HOME) score += 1000;
            else if (pos >= 0) score += pos + 1;
        }
        if (score > bestScore) {
            bestScore = score;
            leaderIdx = p;
        }
    }
    return { leaderIdx, score: bestScore };
}

/**
 * Returns true if any other active player's pawn sits on or within 1..6 steps
 * behind seat `pIdx`'s entry square (`pos 0`).
 */
export function isEntrySquareThreatened(
    pawns: Tokens,
    pIdx: number,
    active: boolean[] = [true, true, true, true],
): boolean {
    const entryGlobal = globalIdx(pIdx, 0);
    for (let q = 0; q < pawns.length; q++) {
        if (q === pIdx || !active[q]) continue;
        const row = pawns[q] || [];
        for (let t = 0; t < row.length; t++) {
            const rr = row[t];
            if (rr < 0 || rr > LAST_TRACK) continue;
            const oppGlobal = globalIdx(q, rr);
            const dist = (entryGlobal - oppGlobal + 52) % 52;
            if (dist >= 0 && dist <= 6) return true;
        }
    }
    return false;
}

/** The computer players pile on whoever is winning: captures and ambushes of the leader score highest. */
export function scoreMove(
    tokens: Tokens,
    p: number,
    m: Move,
    active: boolean[],
    opts?: AIScoringOptions,
): number {
    const globalRivalry = evaluateRivalryState(tokens, -1, active);
    const rivalry =
        globalRivalry.leaderIdx >= 0 && globalRivalry.leaderIdx !== p
            ? globalRivalry
            : evaluateRivalryState(tokens, p, active);
    const matchLeader = getMatchLeader(tokens, p, active).leaderIdx;
    const leader = rivalry.leaderIdx >= 0 ? rivalry.leaderIdx : matchLeader;
    const leaderPct = leader >= 0 ? percent(tokens, leader) / 100 : 0;
    const personality = opts?.personality || '';
    const grudgeTarget =
        opts?.grudgeTargetIdx !== null &&
        opts?.grudgeTargetIdx !== undefined &&
        opts.grudgeTargetIdx >= 0 &&
        opts.grudgeTargetIdx !== p &&
        active[opts.grudgeTargetIdx]
            ? opts.grudgeTargetIdx
            : -1;
    const winStart = coloredPathStartIndex(p);
    const r0 = tokens[p][m.tok];
    let s = Math.random() * 6;

    // Immediate winning move: gets the final token onto the coloured home stretch
    if (r0 < winStart && m.to >= winStart) {
        const sim = tokens[p].slice();
        sim[m.tok] = m.to;
        if (sim.every((r) => r >= winStart)) s += 2000;
    }

    for (const c of m.captures) {
        const victimProg = tokens[c.p][c.t];
        s += 100 + victimProg * 0.8;
        if (c.p === leader && c.p !== p) s += 400 + 80 * leaderPct;
        if (c.p === grudgeTarget) s += personality === 'Rival' ? 320 : 250;
    }
    if (r0 < winStart && m.to >= winStart) s += 130;
    if (m.reachesHome) s += 30;
    if (m.fromBase) {
        s += isEntrySquareThreatened(tokens, p, active) ? 20 : 150;
    }
    s += m.to * 0.35;
    if (m.to <= LAST_TRACK) {
        const g = globalIdx(p, m.to);
        const existingFriendly = countColorOnGlobal(tokens, p, g, m.tok);
        if (SAFE.has(g)) s += 18;
        else if (existingFriendly >= 1) {
            // 2-Token Stack Shield & Leader Roadblock bonus
            const shieldBase = personality === 'Strategist' || personality === 'Rideordie' ? 48 : 24;
            const shieldTierMult = rivalry.tier === 'dethrone' ? 1.4 : rivalry.tier === 'heat' ? 1.15 : 1.0;
            s += shieldBase * shieldTierMult;
            if (leader >= 0 && leader !== p) {
                let blocksLeader = false;
                for (let u = 0; u < 4; u++) {
                    const rr = tokens[leader][u];
                    if (rr < 0 || rr > LAST_TRACK) continue;
                    const distAheadOfLeader = (g - globalIdx(leader, rr) + 52) % 52;
                    if (distAheadOfLeader >= 1 && distAheadOfLeader <= 8) {
                        blocksLeader = true;
                        break;
                    }
                }
                if (blocksLeader) {
                    s += rivalry.tier === 'dethrone' ? 85 : 55;
                }
            }
        }

        // Tiered Ambush Positioning: stage 1..6 steps behind active Leader tokens
        const ambushMult =
            rivalry.tier === 'dethrone'
                ? 1.55
                : rivalry.tier === 'heat'
                ? 1.25
                : personality === 'Rival'
                ? 1.2
                : 1.0;
        if (leader >= 0 && leader !== p) {
            for (let u = 0; u < 4; u++) {
                const rr = tokens[leader][u];
                if (rr < 0 || rr > LAST_TRACK) continue;
                const lg = globalIdx(leader, rr);
                const dist = (lg - g + 52) % 52;
                if (dist >= 1 && dist <= 6 && !SAFE.has(lg)) {
                    const lateStretchBonus = personality === 'Strategist' && rr >= 34 ? 95 : 0;
                    s += (260 + rr) * ambushMult + lateStretchBonus;
                }
            }
        }

        // Grudge Stalking: stage 1..6 steps behind grudge target
        if (grudgeTarget >= 0) {
            for (let u = 0; u < 4; u++) {
                const rr = tokens[grudgeTarget][u];
                if (rr < 0 || rr > LAST_TRACK) continue;
                const gg = globalIdx(grudgeTarget, rr);
                const dist = (gg - g + 52) % 52;
                if (dist >= 1 && dist <= 6 && !SAFE.has(gg)) {
                    s += personality === 'Rival' ? 190 : 140;
                }
            }
        }

        // "Don't Feed the Leader" Danger Penalty & general open-track exposure check
        if (!SAFE.has(g) && existingFriendly === 0) {
            let leaderFeedApplied = false;
            for (let q = 0; q < 4; q++) {
                if (q === p || !active[q]) continue;
                for (let u = 0; u < 4; u++) {
                    const rr = tokens[q][u];
                    if (rr < 0 || rr > LAST_TRACK) continue;
                    const dist = (g - globalIdx(q, rr) + 52) % 52;
                    if (dist >= 1 && dist <= 6) {
                        if (q === leader) {
                            if (!leaderFeedApplied) {
                                leaderFeedApplied = true;
                                const feedPenalty =
                                    rivalry.tier === 'dethrone'
                                        ? personality === 'Confidante'
                                            ? 200
                                            : 180
                                        : rivalry.tier === 'heat'
                                        ? personality === 'Confidante'
                                            ? 175
                                            : 155
                                        : personality === 'Confidante'
                                        ? 160
                                        : 135;
                                s -= feedPenalty;
                            }
                        } else {
                            s -= 22;
                        }
                    }
                }
            }
        }
    }
    if (r0 >= 0 && r0 <= LAST_TRACK && SAFE.has(globalIdx(p, r0))) s -= 9;
    return s;
}

export function pickBestAIMove(
    tokens: Tokens,
    p: number,
    options: Move[],
    active: boolean[],
    dice?: [number, number],
    diceUsed?: [boolean, boolean],
    obligation?: CaptureObligation | null,
    capturesMade = 0,
    opts?: AIScoringOptions,
): { move: Move; hitsLeader: boolean; hitsGrudge: boolean } {
    const pool =
        dice && diceUsed
            ? pickObligationAwarePool(tokens, p, dice, diceUsed, active, options, obligation, capturesMade)
            : options;
    const globalRivalry = evaluateRivalryState(tokens, -1, active);
    const rivalry =
        globalRivalry.leaderIdx >= 0 && globalRivalry.leaderIdx !== p
            ? globalRivalry
            : evaluateRivalryState(tokens, p, active);
    const leaderIdx = rivalry.leaderIdx >= 0 ? rivalry.leaderIdx : getMatchLeader(tokens, p, active).leaderIdx;
    const grudgeIdx =
        opts?.grudgeTargetIdx !== null &&
        opts?.grudgeTargetIdx !== undefined &&
        opts.grudgeTargetIdx >= 0 &&
        opts.grudgeTargetIdx !== p &&
        active[opts.grudgeTargetIdx]
            ? opts.grudgeTargetIdx
            : -1;

    // Order capture targets while keeping compulsory & 2-capture chains intact:
    // Leader capture > Grudge capture > standard capture
    const leaderCapPool =
        leaderIdx >= 0 ? pool.filter((m) => m.captures.some((c) => c.p === leaderIdx)) : [];
    const grudgeCapPool =
        grudgeIdx >= 0 ? pool.filter((m) => m.captures.some((c) => c.p === grudgeIdx)) : [];
    const anyCapPool = pool.filter((m) => m.captures.length > 0);
    const evalPool =
        leaderCapPool.length > 0
            ? leaderCapPool
            : grudgeCapPool.length > 0
            ? grudgeCapPool
            : anyCapPool.length > 0
            ? anyCapPool
            : pool;

    let best = evalPool[0];
    let bs = -Infinity;
    for (const m of evalPool) {
        const s = scoreMove(tokens, p, m, active, opts);
        if (s > bs) {
            bs = s;
            best = m;
        }
    }
    const hitsLeader = leaderIdx >= 0 && best.captures.some((c) => c.p === leaderIdx);
    const hitsGrudge = grudgeIdx >= 0 && best.captures.some((c) => c.p === grudgeIdx);
    return { move: best, hitsLeader, hitsGrudge };
}

export function pickMove(tokens: Tokens, p: number, options: Move[], active: boolean[]): Move {
    return pickBestAIMove(tokens, p, options, active).move;
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

export interface SingleDieCaptureOption {
    tokenIdx: number;
    dieIndex: 0 | 1;
    steps: number;
    destPos: number;
    targetSquareKey: string;
    targetPlayer: number;
    defenderCount: number;
}

export interface CombinedCaptureOption {
    tokenIdx: number;
    diceOrder: [0, 1] | [1, 0];
    intermediatePos: number;
    finalPos: number;
    targetSquareKey: string;
    targetPlayer: number;
    defenderCount: number;
}

export interface PairCaptureOption {
    tokens: [number, number];
    diceIndices: [0, 1];
    targetSquareKey: string;
    targetPlayer: number;
    defenderCount: number;
}

export interface CaptureObligation {
    required: 0 | 1 | 2;
    singleDieCaptures: SingleDieCaptureOption[];
    combinedCaptures: CombinedCaptureOption[];
    pairCaptures: PairCaptureOption[];
    candidateTokenIndices: number[];
    // Compatibility aliases
    optionTokens: number[];
    hasSingle: boolean;
    hasTotal: boolean;
    hasPair: boolean;
}

/**
 * Evaluates all compulsory capture options for player `p` across single-die,
 * final-square combined-total, and 2-token pair captures while enforcing safe
 * squares, home-stretch immunity, and Stack Protection (`myCount >= defenderCount`).
 */
export function evaluateCaptureObligation(
    tokens: Tokens,
    p: number,
    dice: number[],
    active: boolean[],
    diceUsed: [boolean, boolean] = [false, false],
): CaptureObligation {
    const singleDieCaptures: SingleDieCaptureOption[] = [];
    const combinedCaptures: CombinedCaptureOption[] = [];
    const pairCaptures: PairCaptureOption[] = [];
    const candidateSet = new Set<number>();

    // 1. Single-die captures across available dice
    for (let d = 0; d < dice.length && d < 2; d++) {
        if (diceUsed[d]) continue;
        const steps = dice[d];
        for (let tokenIdx = 0; tokenIdx < 4; tokenIdx++) {
            const r = tokens[p][tokenIdx];
            if (r >= HOME) continue;
            const destPos = r === IN_BASE ? (steps === 6 ? 0 : -1) : r + steps;
            if (destPos < 0 || destPos > LAST_TRACK) continue;

            const g = globalIdx(p, destPos);
            if (SAFE.has(g)) continue;

            const myCount = 1 + countColorOnGlobalExcluding(tokens, p, g, tokenIdx);
            for (let o = 0; o < 4; o++) {
                if (o === p || !active[o]) continue;
                const oppCount = countColorOnGlobalExcluding(tokens, o, g);
                if (oppCount > 0 && myCount >= oppCount) {
                    singleDieCaptures.push({
                        tokenIdx,
                        dieIndex: d as 0 | 1,
                        steps,
                        destPos,
                        targetSquareKey: String(g),
                        targetPlayer: o,
                        defenderCount: oppCount,
                    });
                    candidateSet.add(tokenIdx);
                }
            }
        }
    }

    const bothRemaining = dice.length >= 2 && !diceUsed[0] && !diceUsed[1];

    // 2. Final-square combined-total captures (only when 2 dice remain)
    if (bothRemaining) {
        const orders: ([0, 1] | [1, 0])[] = dice[0] === dice[1] ? [[0, 1]] : [[0, 1], [1, 0]];
        for (let tokenIdx = 0; tokenIdx < 4; tokenIdx++) {
            const r = tokens[p][tokenIdx];
            if (r >= HOME) continue;
            for (const diceOrder of orders) {
                const [d1, d2] = diceOrder;
                const pos1 = r === IN_BASE ? (dice[d1] === 6 ? 0 : -1) : r + dice[d1];
                if (pos1 < 0 || pos1 >= HOME) continue;
                const pos2 = pos1 + dice[d2];
                if (pos2 < 0 || pos2 > LAST_TRACK) continue;

                const g2 = globalIdx(p, pos2);
                if (SAFE.has(g2)) continue;

                const myCountAtS2 = 1 + countColorOnGlobalExcluding(tokens, p, g2, tokenIdx);
                for (let o = 0; o < 4; o++) {
                    if (o === p || !active[o]) continue;
                    const oppCount = countColorOnGlobalExcluding(tokens, o, g2);
                    if (oppCount > 0 && myCountAtS2 >= oppCount) {
                        combinedCaptures.push({
                            tokenIdx,
                            diceOrder,
                            intermediatePos: pos1,
                            finalPos: pos2,
                            targetSquareKey: String(g2),
                            targetPlayer: o,
                            defenderCount: oppCount,
                        });
                        candidateSet.add(tokenIdx);
                    }
                }
            }
        }

        // 3. 2-Token Pair Captures (tA uses dice[0], tB uses dice[1], landing on exact same non-safe square)
        const seenPairs = new Set<string>();
        for (let tA = 0; tA < 4; tA++) {
            const rA = tokens[p][tA];
            if (rA >= HOME) continue;
            const posA = rA === IN_BASE ? (dice[0] === 6 ? 0 : -1) : rA + dice[0];
            if (posA < 0 || posA > LAST_TRACK) continue;
            const gA = globalIdx(p, posA);
            if (SAFE.has(gA)) continue;

            for (let tB = 0; tB < 4; tB++) {
                if (tB === tA) continue;
                const rB = tokens[p][tB];
                if (rB >= HOME) continue;
                const posB = rB === IN_BASE ? (dice[1] === 6 ? 0 : -1) : rB + dice[1];
                if (posB < 0 || posB > LAST_TRACK) continue;
                const gB = globalIdx(p, posB);
                if (gB !== gA) continue;

                const myCountAfterBoth = 2 + countColorOnGlobalExcluding(tokens, p, gA, tA, tB);
                for (let o = 0; o < 4; o++) {
                    if (o === p || !active[o]) continue;
                    const oppCount = countColorOnGlobalExcluding(tokens, o, gA);
                    if (oppCount > 0 && myCountAfterBoth >= oppCount) {
                        const symKey =
                            dice[0] === dice[1]
                                ? `${Math.min(tA, tB)}-${Math.max(tA, tB)}-${gA}-${o}`
                                : `${tA}-${tB}-${gA}-${o}`;
                        if (!seenPairs.has(symKey)) {
                            seenPairs.add(symKey);
                            pairCaptures.push({
                                tokens: [tA, tB],
                                diceIndices: [0, 1],
                                targetSquareKey: String(gA),
                                targetPlayer: o,
                                defenderCount: oppCount,
                            });
                            candidateSet.add(tA);
                            candidateSet.add(tB);
                        }
                    }
                }
            }
        }
    }

    // 4. Max independent single-die captures (0, 1, or 2)
    let maxIndependentSingleDieCaptures: 0 | 1 | 2 = singleDieCaptures.length > 0 ? 1 : 0;
    if (bothRemaining && singleDieCaptures.length > 0) {
        outer: for (let d1 = 0; d1 < 2; d1++) {
            const d2 = d1 === 0 ? 1 : 0;
            const firstCaps = legalMoves(tokens, p, dice[d1], d1, active).filter((m) => m.captures.length > 0);
            for (const m1 of firstCaps) {
                const nb1 = tokens.map((row) => row.slice());
                nb1[p][m1.tok] = m1.to;
                for (const c of m1.captures) nb1[c.p][c.t] = IN_BASE;
                if (legalMoves(nb1, p, dice[d2], d2, active).some((m2) => m2.captures.length > 0)) {
                    maxIndependentSingleDieCaptures = 2;
                    break outer;
                }
            }
        }
    }

    const hasSingle = singleDieCaptures.length > 0;
    const hasTotal = combinedCaptures.length > 0;
    const hasPair = pairCaptures.length > 0;
    const required: 0 | 1 | 2 = hasTotal || hasPair ? 1 : maxIndependentSingleDieCaptures;
    const candidateTokenIndices = Array.from(candidateSet).sort((a, b) => a - b);

    return {
        required,
        singleDieCaptures,
        combinedCaptures,
        pairCaptures,
        candidateTokenIndices,
        optionTokens: candidateTokenIndices,
        hasSingle,
        hasTotal,
        hasPair,
    };
}

/**
 * At turn end, returns every candidate token index that did NOT capture this turn
 * and is currently on the board (not in base and not finished in centre home).
 * Includes tokens that dodged a capture by entering their coloured home stretch.
 */
export function offendingTokensForPenalty(
    obligation: CaptureObligation,
    capturesMadeThisTurn: number,
    capturedTokenIndices: Set<number>,
    playerTokens: number[],
): number[] {
    if (obligation.required === 0 || capturesMadeThisTurn >= obligation.required) {
        return [];
    }
    return obligation.candidateTokenIndices.filter((tok) => {
        if (capturedTokenIndices.has(tok)) return false;
        const pos = playerTokens[tok];
        return pos >= 0 && pos < HOME;
    });
}

/**
 * Filters legal AI/timeout moves to honor CaptureObligation:
 * - When required >= 2, prioritizes first captures that preserve a 2nd capture.
 * - Otherwise takes direct single/combined captures if present.
 * - Otherwise takes Step 1 of a valid combinedCaptures or pairCaptures plan.
 */
export function pickObligationAwarePool(
    tokens: Tokens,
    p: number,
    dice: [number, number],
    diceUsed: [boolean, boolean],
    active: boolean[],
    legal: Move[],
    obligation: CaptureObligation | null | undefined,
    capturesMade: number,
): Move[] {
    if (legal.length === 0) return legal;
    const directCaps = legal.filter((m) => m.captures.length > 0);
    const needed = obligation ? Math.max(0, obligation.required - capturesMade) : 0;

    if (needed >= 2 && directCaps.length > 0 && !diceUsed[0] && !diceUsed[1]) {
        const keepSecond = directCaps.filter((m1) => {
            if (m1.combined || m1.die === 2) return false;
            const sim = tokens.map((row) => row.slice());
            sim[p][m1.tok] = m1.to;
            for (const c of m1.captures) sim[c.p][c.t] = IN_BASE;
            const nextUsed: [boolean, boolean] = [diceUsed[0], diceUsed[1]];
            nextUsed[m1.die] = true;
            return legalMovesForTurn(sim, p, dice, nextUsed, active).some((m2) => m2.captures.length > 0);
        });
        if (keepSecond.length > 0) return keepSecond;
    }

    if (directCaps.length > 0) return directCaps;

    if (!diceUsed[0] && !diceUsed[1]) {
        if (obligation && (obligation.combinedCaptures.length > 0 || obligation.pairCaptures.length > 0)) {
            const step1Moves = legal.filter((m) => {
                if (m.combined || m.die === 2) return false;
                const isComb = obligation.combinedCaptures.some(
                    (c) => c.tokenIdx === m.tok && c.diceOrder[0] === m.die,
                );
                if (isComb) return true;
                const destKey = m.to >= 0 && m.to <= LAST_TRACK ? String(globalIdx(p, m.to)) : null;
                return (
                    !!destKey &&
                    obligation.pairCaptures.some(
                        (pc) =>
                            pc.targetSquareKey === destKey &&
                            ((pc.tokens[0] === m.tok && m.die === 0) || (pc.tokens[1] === m.tok && m.die === 1)),
                    )
                );
            });
            if (step1Moves.length > 0) return step1Moves;
        }

        const comboSetup = legal.filter((m1) => {
            if (m1.combined || m1.die === 2) return false;
            const sim = tokens.map((row) => row.slice());
            sim[p][m1.tok] = m1.to;
            const nextUsed: [boolean, boolean] = [diceUsed[0], diceUsed[1]];
            nextUsed[m1.die] = true;
            return legalMovesForTurn(sim, p, dice, nextUsed, active).some((m2) => m2.captures.length > 0);
        });
        if (comboSetup.length > 0) return comboSetup;
    }

    return legal;
}
