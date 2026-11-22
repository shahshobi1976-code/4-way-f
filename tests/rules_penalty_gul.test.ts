import {
    hasWon,
    tokenShare,
    HOME,
    PATH_START,
    IN_BASE,
    newTokens,
    legalMoves,
    legalMovesForTurn,
    maxCaptures,
    findOffendingToken,
    evaluateCaptureObligation,
    offendingTokensForPenalty,
    luckySevenAllowed,
    getMatchLeader,
    isEntrySquareThreatened,
    pickBestAIMove,
    globalIdx,
    type Tokens,
} from '../src/game/rules';
import { shouldShowCaptureWarning } from '../src/state/store';
import { roomManager, type Room } from '../server/roomManager';

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ ASSERTION FAILED: ${msg}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${msg}`);
    }
}

console.log('--- RUNNING LUDO RULES & PENALTY & GUL TEST SUITE ---');

// Test 1: Coloured Path Win condition — all 4 pawns reaching coloured home stretch (>= path.length - 6) or centre HOME wins immediately
{
    const tokens: Tokens = newTokens();
    tokens[0] = [50, PATH_START, PATH_START, PATH_START]; // one pawn still on open track (50)
    assert(!hasWon(tokens, 0), 'hasWon returns false when any pawn is still on open track (50)');

    tokens[0] = [IN_BASE, PATH_START, 53, HOME]; // one pawn still in base
    assert(!hasWon(tokens, 0), 'hasWon returns false when any pawn is still in base (-1)');

    tokens[0] = [PATH_START, PATH_START, PATH_START, PATH_START]; // 51, 51, 51, 51
    assert(hasWon(tokens, 0), 'hasWon returns true when all 4 pawns reach coloured path start (51)');

    tokens[0] = [PATH_START, 53, 55, HOME]; // mixed coloured path + finished
    assert(hasWon(tokens, 0), 'hasWon returns true when all 4 pawns are on coloured home path (51..55) or centre HOME (56)');

    tokens[0] = [HOME, HOME, HOME, HOME]; // 56
    assert(hasWon(tokens, 0), 'hasWon returns true when all 4 pawns reach centre HOME (56)');
}

// Test 2: tokenShare progress computation
{
    assert(tokenShare(-1) === 0, 'tokenShare is 0 for base token');
    assert(tokenShare(50) < 1, 'tokenShare is < 1 for token on last open-track square (50)');
    assert(tokenShare(PATH_START) === 1, 'tokenShare is 1 (100%) once token reaches coloured path start (51)');
    assert(tokenShare(HOME) === 1, 'tokenShare is 1 (100%) for token at centre HOME (56)');
}

// Test 3: maxCaptures and findOffendingToken detection
{
    const tokens: Tokens = newTokens();
    const active = [true, true, true, true];

    tokens[0][0] = 6; // Player 0 token 0 is at pos 6
    tokens[1][0] = (10 - 13 + 52) % 52; // Player 1 token 0 is at global 10

    const dice = [4, 2];
    const mc = maxCaptures(tokens, 0, dice, active);
    assert(mc.taken === 1, 'maxCaptures identifies 1 capture opportunity available from roll');

    const initialTokens = tokens.map((r) => r.slice());
    const offending = findOffendingToken(initialTokens, tokens, 0, dice, active);
    assert(offending === 0, 'findOffendingToken identifies player 0 pawn 0 as offending pawn');

    const currentTokens = tokens.map((r) => r.slice());
    currentTokens[0][1] = 2; // moved token 1 with die 2
    const offendingAfterMove = findOffendingToken(initialTokens, currentTokens, 0, dice, active);
    assert(offendingAfterMove === 0, 'findOffendingToken correctly identifies un-moved offending token 0');
}

// Test 4: Several of my tokens being able to make the same capture
{
    const tokens: Tokens = newTokens();
    const active = [true, true, true, true];
    tokens[1][0] = (10 - 13 + 52) % 52;

    tokens[0][0] = 6;
    tokens[0][1] = 8;

    const dice = [4, 2];
    const mc = maxCaptures(tokens, 0, dice, active);
    assert(mc.taken >= 1, 'At least 1 capture can be fulfilled');
}

// Test 5: Sequential capture detection
{
    const tokens: Tokens = newTokens();
    const active = [true, true, true, true];
    tokens[1][0] = (10 - 13 + 52) % 52;
    tokens[2][0] = (12 - 26 + 52) % 52;

    tokens[0][0] = 7;

    const dice = [3, 2];
    const mc = maxCaptures(tokens, 0, dice, active);
    assert(mc.taken === 2, 'maxCaptures identifies sequential 2-capture route');
}

// Test 6: Server Missed Capture Penalty Enforcement (total/pair required=1, independent single-die required=2, multi-token penalty)
{
    const res = roomManager.createRoom('tok_test_session_token_123456789', 'Host', '👑', 'sock_1');
    assert(res.ok && !!res.roomCode, 'Server created room');
    const room = roomManager.getRoom(res.roomCode!)!;
    const active = [true, true, true, true];

    // 6A: Missing single-die capture when required = 1 penalizes offending token
    room.phase = 'playing';
    room.currentTurn = 0;
    room.tokens = newTokens();
    room.tokens[0][0] = 6;
    room.tokens[1][0] = (10 - 13 + 52) % 52;
    room.initialTurnTokens = room.tokens.map((r) => r.slice());
    room.dice = [4, 2];
    room.turnObligation = evaluateCaptureObligation(room.tokens, 0, room.dice, active);
    room.capturePromise = room.turnObligation.required;
    room.capturesTakenThisTurn = 0;
    room.tokensCapturedThisTurn = [];

    const penalized = roomManager.checkAndApplyMissedCapturePenalty(room);
    assert(penalized, 'Server enforces missed capture penalty when 0 captures taken');
    assert(room.tokens[0][0] === IN_BASE, 'Offending pawn sent back to base (-1)');
    assert(room.penalties[0] === 1, 'Player penalty counter incremented to 1');

    // 6B: When total/pair capture option exists (required = 1), taking 1 capture satisfies obligation (no penalty)
    room.tokens = newTokens();
    room.tokens[0][0] = 6;  // 6 + 4 = 10 (single-die option OR 6+4+2=12 total option)
    room.tokens[1][0] = (10 - 13 + 52) % 52;
    room.tokens[2][0] = (12 - 26 + 52) % 52;
    room.initialTurnTokens = room.tokens.map((r) => r.slice());
    room.dice = [4, 2];
    room.turnObligation = evaluateCaptureObligation(room.tokens, 0, room.dice, active);
    assert(room.turnObligation.hasTotal && room.turnObligation.required === 1, 'Total capture option sets required = 1');
    room.capturePromise = room.turnObligation.required;
    room.capturesTakenThisTurn = 1;
    room.tokensCapturedThisTurn = [0];
    const exemptedTotal = roomManager.checkAndApplyMissedCapturePenalty(room);
    assert(!exemptedTotal, 'Server does NOT penalize when total option exists (required = 1) and 1 capture was made');

    // 6C: Two independent single-die captures (no total, no pair) -> required = 2.
    // Taking only 1 of 2 sends ONLY the option token that did not capture back to base.
    room.tokens = newTokens();
    room.tokens[0][0] = 6;  // +4 -> 10 captures P1[0]; +2 -> 8 (nothing); total 12 (nothing)
    room.tokens[0][1] = 20; // +2 -> 22 captures P2[0]; +4 -> 24 (nothing); total 26 (nothing)
    room.tokens[1][0] = (10 - 13 + 52) % 52;
    room.tokens[2][0] = (22 - 26 + 52) % 52;
    room.initialTurnTokens = room.tokens.map((r) => r.slice());
    room.dice = [4, 2];
    room.turnObligation = evaluateCaptureObligation(room.tokens, 0, room.dice, active);
    assert(room.turnObligation.required === 2, 'Independent single-die captures without total/pair set required = 2');
    room.capturePromise = room.turnObligation.required;
    room.tokens[0][0] = 10; // token 0 made its capture
    room.capturesTakenThisTurn = 1;
    room.tokensCapturedThisTurn = [0];
    const partialPenalty = roomManager.checkAndApplyMissedCapturePenalty(room);
    assert(partialPenalty, 'Server penalizes when captures made (1) < required (2)');
    assert(room.tokens[0][0] === 10, 'Token 0 that captured stays on board');
    assert(room.tokens[0][1] === IN_BASE, 'Only non-capturing option token 1 goes back to base');

    // 6D: Same scenario, 0 captures taken -> BOTH option tokens go back to base
    room.tokens[0][0] = 6;
    room.tokens[0][1] = 20;
    room.initialTurnTokens = room.tokens.map((r) => r.slice());
    room.turnObligation = evaluateCaptureObligation(room.tokens, 0, room.dice, active);
    room.capturesTakenThisTurn = 0;
    room.tokensCapturedThisTurn = [];
    const bothPenalty = roomManager.checkAndApplyMissedCapturePenalty(room);
    assert(bothPenalty, 'Server penalizes when 0 < required (2)');
    assert(room.tokens[0][0] === IN_BASE && room.tokens[0][1] === IN_BASE, 'Every option token that did not capture goes back to base');
}

// Test 7: Centre "Gul or Pass?" choice logic
{
    const res = roomManager.createRoom('tok_test_gul_token_1234567890123', 'Host', '👑', 'sock_2');
    const room = roomManager.getRoom(res.roomCode!)!;
    room.phase = 'playing';
    room.currentTurn = 0;
    room.tokens = newTokens();
    room.tokens[0][0] = 53;
    room.tokens[0][1] = 10; // second active token so single-die entry is allowed
    room.dice = [3, 1];
    room.diceUsed = [false, false];

    const passRes = roomManager.movePawn(room.code, 'tok_test_gul_token_1234567890123', 0, 0, 'pass');
    assert(passRes.ok, 'Server allows pass choice for move reaching centre (56)');
    assert(room.tokens[0][0] === 53, 'Token remains at 53 on coloured path when passed');
    assert(room.diceUsed[0] === true, 'Die 0 is consumed by pass');

    room.diceUsed[0] = false;
    const gulRes = roomManager.movePawn(room.code, 'tok_test_gul_token_1234567890123', 0, 0, 'gul');
    assert(gulRes.ok, 'Server moves token into centre on gul');
    assert(room.tokens[0][0] === HOME, 'Token reaches centre HOME (56)');
}

// Test 8: Stack / Pair Protection (myCount >= otherCount)
{
    const tokens: Tokens = newTokens();
    const active = [true, true, true, true];
    // Opponent has a pair of 2 tokens on global 10 (non-safe square)
    const targetG10 = (10 - 13 + 52) % 52;
    tokens[1][0] = targetG10;
    tokens[1][1] = targetG10;
    // Player 0 has token 0 at 6 (distance 4 to 10)
    tokens[0][0] = 6;

    const mSingle = legalMoves(tokens, 0, 4, 0, active).find((m) => m.tok === 0)!;
    assert(mSingle.captures.length === 0, 'Single token (myCount=1) cannot capture opponent stack of 2 (otherCount=2)');

    // Now Player 0 already has token 1 standing at 10 (myCount = 1 + 1 = 2 >= 2)
    tokens[0][1] = 10;
    const mPair = legalMoves(tokens, 0, 4, 0, active).find((m) => m.tok === 0)!;
    assert(mPair.captures.length === 2, 'Two friendly tokens (myCount=2) capture opponent stack of 2 (otherCount=2)');

    // Two-token pair capture lookahead in maxCaptures
    tokens[0][1] = 8; // token 0 at 6 (needs 4), token 1 at 8 (needs 2)
    const mc = maxCaptures(tokens, 0, [4, 2], active);
    assert(mc.taken === 2, 'maxCaptures detects 2-token stack capture when both tokens can land on opponent pair');
}

// Test 9: Lone Token Full-Total Rule & Combined Dice Move
{
    const tokens: Tokens = newTokens();
    const active = [true, true, true, true];
    tokens[0] = [49, IN_BASE, IN_BASE, IN_BASE]; // 1 active token at 49

    // Roll [4, 3]: single-die 4->53 & 3->52 blocked; combined 7->56 allowed!
    const movesHome = legalMovesForTurn(tokens, 0, [4, 3], [false, false], active);
    assert(movesHome.length === 1 && movesHome[0].die === 2 && movesHome[0].to === HOME, 'Lone token at 49 with [4,3] can only enter HOME via combined sum (die=2)');

    // Roll [5, 4]: 49+5=54 (blocked), 49+4=53 (blocked), 49+9=57 (overshoots) -> no moves!
    const movesOvershoot = legalMovesForTurn(tokens, 0, [5, 4], [false, false], active);
    assert(movesOvershoot.length === 0, 'Lone token at 49 with [5,4] has no legal moves (partial single-die entry blocked, combined overshoots)');

    // Roll [4, 3] on open track at 20 -> single moves (24, 23) AND combined move (27) are available
    tokens[0][0] = 20;
    const movesOpen = legalMovesForTurn(tokens, 0, [4, 3], [false, false], active);
    assert(movesOpen.some((m) => m.die === 2 && m.to === 27), 'Lone token on open track can also move by combined sum (20+7=27)');

    // When a 2nd token is active out on board, single-die path entry is allowed again
    tokens[0] = [49, 10, IN_BASE, IN_BASE];
    const movesTwoOut = legalMovesForTurn(tokens, 0, [4, 3], [false, false], active);
    assert(movesTwoOut.some((m) => m.die === 0 && m.tok === 0 && m.to === 53), 'Single-die entry allowed when player has 2 active tokens out');
    assert(!movesTwoOut.some((m) => m.die === 2), 'Combined move not offered when 2 active tokens are out');

    // Server combined move dieIndex=2 reaches HOME and consumes both dice
    const res = roomManager.createRoom('tok_test_lone_combined_1234567890', 'Host', '👑', 'sock_3');
    const room = roomManager.getRoom(res.roomCode!)!;
    room.phase = 'playing';
    room.currentTurn = 0;
    room.tokens = newTokens();
    room.tokens[0][0] = 49;
    room.dice = [4, 3];
    room.diceUsed = [false, false];
    const combRes = roomManager.movePawn(room.code, 'tok_test_lone_combined_1234567890', 2, 0, 'gul');
    assert(combRes.ok, 'Server accepts combined dieIndex=2 move for lone token');
    assert(room.tokens[0][0] === HOME && room.diceUsed[0] && room.diceUsed[1], 'Combined move reaches HOME and consumes both dice');
}

// Test 10: Lucky 7 Condition (0 on open track AND >=1 in base)
{
    const tokens: Tokens = newTokens();
    assert(luckySevenAllowed(tokens, 0), 'Lucky 7 allowed when all 4 tokens are in base');

    tokens[0] = [IN_BASE, PATH_START, HOME, HOME];
    assert(luckySevenAllowed(tokens, 0), 'Lucky 7 allowed when 1 token is in base and others are on path/home');

    tokens[0] = [PATH_START, 52, HOME, HOME];
    assert(!luckySevenAllowed(tokens, 0), 'Lucky 7 NOT allowed when 0 tokens remain in base');

    tokens[0] = [IN_BASE, 10, HOME, HOME];
    assert(!luckySevenAllowed(tokens, 0), 'Lucky 7 NOT allowed when a token is on open track');
}

// Test 11: evaluateCaptureObligation cases (none, pair, mutually exclusive single-die, offendingTokensForPenalty)
{
    const active = [true, true, true, true];

    // 11A: No options -> required = 0
    const noneToks = newTokens();
    noneToks[0][0] = 2;
    const noneOb = evaluateCaptureObligation(noneToks, 0, [3, 4], active);
    assert(noneOb.required === 0 && noneOb.optionTokens.length === 0, 'No capture options -> required = 0');

    // 11B: Pair capture (two tokens, one die each, landing on opponent pair of 2) -> required = 1, both tokens in optionTokens
    const pairToks = newTokens();
    const targetG10 = (10 - 13 + 52) % 52;
    pairToks[1][0] = targetG10;
    pairToks[1][1] = targetG10;
    pairToks[0][0] = 6; // +4 -> 10
    pairToks[0][1] = 8; // +2 -> 10
    const pairOb = evaluateCaptureObligation(pairToks, 0, [4, 2], active);
    assert(pairOb.hasPair && pairOb.required === 1, 'Pair capture sets hasPair=true and required=1');
    assert(pairOb.optionTokens.includes(0) && pairOb.optionTokens.includes(1), 'Pair capture marks both participating tokens as option tokens');

    // 11C: Both tokens share ONLY die 0 to capture (two single-die options using the same die, 0 on the other die) -> required = 1
    const sharedDieToks = newTokens();
    sharedDieToks[0][0] = 6; // +4 -> 10 captures P1[0]
    sharedDieToks[0][1] = 16; // +4 -> 20 captures P2[0]
    sharedDieToks[1][0] = (10 - 13 + 52) % 52;
    sharedDieToks[2][0] = (20 - 26 + 52) % 52;
    const sharedOb = evaluateCaptureObligation(sharedDieToks, 0, [4, 1], active);
    assert(sharedOb.required === 1, 'Two single-die captures competing for the same die require at most 1');
    assert(sharedOb.optionTokens.length === 2, 'Both tokens with capture options are tracked in optionTokens');

    // 11D: Total capture counts ONLY on final square (6+4=10 captures P1[0], then 10+2=12 has no capture -> NOT hasTotal; single capture still sets required=1)
    const midOnlyToks = newTokens();
    midOnlyToks[0][0] = 6;
    midOnlyToks[1][0] = (10 - 13 + 52) % 52; // mid square, not final square
    const midOnlyOb = evaluateCaptureObligation(midOnlyToks, 0, [4, 2], active);
    assert(!midOnlyOb.hasTotal && midOnlyOb.hasSingle && midOnlyOb.required === 1, 'Intermediate square capture does NOT count as total capture (final square only)');

    // 11E: offendingTokensForPenalty excludes tokens that captured, base tokens, and finished HOME tokens
    const offAll = offendingTokensForPenalty(sharedOb, 0, new Set(), sharedDieToks[0]);
    assert(offAll.length === 2 && offAll[0] === 0 && offAll[1] === 1, 'offendingTokensForPenalty returns all uncaptured candidate tokens when required not met');
    const offOne = offendingTokensForPenalty(sharedOb, 0, new Set([0]), sharedDieToks[0]);
    assert(offOne.length === 1 && offOne[0] === 1, 'offendingTokensForPenalty excludes tokens that actually captured');
    const offMet = offendingTokensForPenalty(sharedOb, 1, new Set([0]), sharedDieToks[0]);
    assert(offMet.length === 0, 'offendingTokensForPenalty returns [] once capturesMade >= required');
}

// Test 12: Server host disconnect reassignment & room creation rate limiting
{
    const hostTok = 'tok_test_host_resilience_12345678';
    const guestTok = 'tok_test_guest_resilience_1234567';
    const cRes = roomManager.createRoom(hostTok, 'HostA', '👑', 'sock_host_a', 90, 4, '10.0.0.1');
    assert(cRes.ok && !!cRes.roomCode, 'Created room for resilience test');
    const jRes = roomManager.joinRoom(cRes.roomCode!, guestTok, 'GuestB', '🦁', 'sock_guest_b', '10.0.0.2');
    assert(jRes.ok && jRes.playerIndex === 1, 'Guest joined seat 1');

    const startRes = roomManager.startGame(cRes.roomCode!, hostTok);
    assert(startRes.ok, 'Match started for resilience test');

    const r = roomManager.getRoom(cRes.roomCode!)!;
    const guestPubId = r.players[1]!.publicPlayerId;
    roomManager.leaveRoom(cRes.roomCode!, hostTok);
    assert(r.hostId === guestPubId && r.players[1]!.isHost === true, 'Host ownership transfers to connected human when host leaves mid-match');
    assert(r.players[0]!.isAI === true && r.players[0]!.isHost === false, 'Departed host becomes Bot and loses host flag');

    // Rate-limit test on isolated IP
    let blocked = false;
    for (let k = 0; k < 15; k++) {
        const rr = roomManager.createRoom(`tok_ratelimit_${k}_123456789012345`, `RL${k}`, '👑', `sock_rl_${k}`, 90, 4, '192.168.77.77');
        if (!rr.ok && rr.error?.includes('Too many rooms')) {
            blocked = true;
            break;
        }
    }
    assert(blocked, 'Room creation enforces per-IP sliding window rate limit');
}

// Test 13: Immunity & Edge Capture Obligation Rules (safe squares, home stretch, 2-stack block, shared target, combined precedence, dodging into home stretch)
{
    const active = [true, true, true, true];

    // 13A: Safe/Star squares, start squares, home stretch, and protected 2-stack give required = 0
    const immuneToks = newTokens();
    immuneToks[0][0] = 5;
    immuneToks[1][0] = (8 - 13 + 52) % 52; // Star square global 8
    immuneToks[2][0] = 52; // Enemy in their own coloured home stretch
    // Enemy 2-stack at global 10 (only 1 friendly token can reach -> Stack Protected)
    immuneToks[3][0] = (10 - 39 + 52) % 52;
    immuneToks[3][1] = (10 - 39 + 52) % 52;
    const immuneOb = evaluateCaptureObligation(immuneToks, 0, [3, 5], active);
    assert(
        immuneOb.required === 0 && immuneOb.candidateTokenIndices.length === 0,
        'Safe/star squares, home stretch, and protected 2-stacks impose required = 0',
    );

    // 13B: Shared single target reached by two tokens -> required = 1 (NOT 2)
    const sharedEnemyToks = newTokens();
    sharedEnemyToks[0][0] = 6; // +4 -> 10
    sharedEnemyToks[0][1] = 8; // +2 -> 10
    sharedEnemyToks[1][0] = (10 - 13 + 52) % 52;
    const sharedEnemyOb = evaluateCaptureObligation(sharedEnemyToks, 0, [4, 2], active);
    assert(
        sharedEnemyOb.required === 1 && sharedEnemyOb.singleDieCaptures.length === 2,
        'Two tokens targeting the SAME lone enemy require only 1 capture (not 2)',
    );
    assert(
        offendingTokensForPenalty(sharedEnemyOb, 1, new Set([0]), [10, 8, -1, -1]).length === 0,
        'When Token 0 captures shared enemy, Token 1 is NOT penalized',
    );

    // 13C: Both a combined-total capture AND two independent single-die captures exist -> required = 1
    const combAndDualToks = newTokens();
    combAndDualToks[0][0] = 6; // +4->10 (P1[0]), +2->8; combined +6->12 (P3[0])!
    combAndDualToks[0][1] = 20; // +2->22 (P2[0])
    combAndDualToks[1][0] = (10 - 13 + 52) % 52;
    combAndDualToks[2][0] = (22 - 26 + 52) % 52;
    combAndDualToks[3][0] = (12 - 39 + 52) % 52;
    const combAndDualOb = evaluateCaptureObligation(combAndDualToks, 0, [4, 2], active);
    assert(
        combAndDualOb.combinedCaptures.length > 0 && combAndDualOb.required === 1,
        'When combinedCaptures exists alongside dual single-die options, required = 1 so executing combined capture is unpenalized',
    );

    // 13D: Dodging into coloured home stretch (pos 52) still returns offending token to base
    const dodgeToks = newTokens();
    dodgeToks[0][0] = 46; // +2 -> 48 captures P1[0] at global 48, OR +6 -> 52 dodges into coloured home stretch!
    dodgeToks[1][0] = (48 - 13 + 52) % 52;
    const dodgeOb = evaluateCaptureObligation(dodgeToks, 0, [2, 6], active);
    assert(dodgeOb.required === 1 && dodgeOb.candidateTokenIndices.includes(0), 'Capture at 48 detected before dodge');
    const dodgeOffenders = offendingTokensForPenalty(dodgeOb, 0, new Set(), [52, IN_BASE, IN_BASE, IN_BASE]);
    assert(
        dodgeOffenders.length === 1 && dodgeOffenders[0] === 0,
        'Dodging capture into coloured home stretch (pos 52) still flags token for return to base',
    );
}

// Test 14: End-to-End Server 2-Token Pair Capture & Mid-Turn Newly Unlocked Capture
{
    const hostTok = 'tok_test_pair_and_mid_1234567890';
    const res = roomManager.createRoom(hostTok, 'HostPair', '👑', 'sock_pair', 90, 4, '10.0.0.9');
    assert(res.ok && !!res.roomCode, 'Created room for server pair & mid-turn tests');
    const started = roomManager.startGame(res.roomCode!, hostTok);
    assert(started.ok, 'Started room match so seats 1..3 are active');
    const room = roomManager.getRoom(res.roomCode!)!;
    room.currentTurn = 0;

    // 14A: Server Pair Capture (Die 0 moves tok 0 to 10, Die 1 moves tok 1 to 10 breaking enemy pair -> 0 penalties)
    room.tokens = newTokens();
    room.tokens[0] = [6, 8, IN_BASE, IN_BASE];
    const targetG10 = (10 - 13 + 52) % 52;
    room.tokens[1] = [targetG10, targetG10, IN_BASE, IN_BASE];
    room.dice = [4, 2];
    room.diceUsed = [false, false];
    room.capturesTakenThisTurn = 0;
    room.tokensCapturedThisTurn = [];
    room.turnMovedToSquare = {};
    room.turnObligation = evaluateCaptureObligation(room.tokens, 0, room.dice, [true, true, true, true]);
    room.capturePromise = room.turnObligation.required;
    assert(
        room.turnObligation.pairCaptures.length === 1 &&
            room.turnObligation.required === 1 &&
            room.turnObligation.candidateTokenIndices.join(',') === '0,1',
        'Server detects PairCaptureOption [0,1] on enemy 2-stack with required = 1',
    );

    const m1 = roomManager.movePawn(room.code, hostTok, 0, 0, 'gul', false);
    assert(m1.ok && room.tokens[0][0] === 10 && room.capturesTakenThisTurn === 0, 'Step 1 of pair capture lands token 0 on square 10');
    const m2 = roomManager.movePawn(room.code, hostTok, 1, 1, 'gul', false);
    assert(
        m2.ok &&
            room.tokens[0][1] === 10 &&
            room.capturesTakenThisTurn === 1 &&
            room.tokens[1][0] === IN_BASE &&
            room.tokens[1][1] === IN_BASE,
        'Step 2 of pair capture breaks opponent 2-stack on square 10',
    );
    assert(
        room.tokensCapturedThisTurn!.includes(0) && room.tokensCapturedThisTurn!.includes(1),
        'Both cooperating pair tokens [0, 1] credited in tokensCapturedThisTurn',
    );
    assert(room.penalties[0] === 0, 'Zero penalties applied after executing 2-token pair capture');

    // 14B: Base-deploy + capture ([6, 4] deploys token 0 from base on 6 and reaches enemy at 4 on 4; skipping Die 2 penalizes token 0)
    room.currentTurn = 0;
    room.tokens = newTokens();
    room.tokens[0] = [IN_BASE, 15, HOME, HOME];
    room.tokens[1] = [(4 - 13 + 52) % 52, IN_BASE, IN_BASE, IN_BASE]; // Enemy sitting at global 4
    room.dice = [6, 4];
    room.diceUsed = [false, false];
    room.capturesTakenThisTurn = 0;
    room.tokensCapturedThisTurn = [];
    room.turnMovedToSquare = {};
    room.penalties = [0, 0, 0, 0];
    room.turnObligation = evaluateCaptureObligation(room.tokens, 0, room.dice, [true, true, true, true]);
    room.capturePromise = room.turnObligation.required;
    assert(
        room.turnObligation.combinedCaptures.length === 1 &&
            room.turnObligation.required === 1 &&
            room.turnObligation.candidateTokenIndices.includes(0),
        'Deploy-on-6 + move-4 capture is detected in combinedCaptures (required = 1, candidate = [0])',
    );

    const deployRes = roomManager.movePawn(room.code, hostTok, 0, 0, 'gul', false);
    assert(deployRes.ok && room.tokens[0][0] === 0, 'Deploying token 0 on 6 succeeds cleanly');
    // Now player skips capture on token 0 and moves token 1 (+4 -> 19) instead
    const skipRes = roomManager.movePawn(room.code, hostTok, 1, 1, 'gul', false);
    assert(skipRes.ok && room.tokens[0][0] === IN_BASE && room.penalties[0] === 1, 'Skipping capture after deploying on 6 sends token 0 back to base');
}

// Test 15: Splitting a 2-token stack keeps partner stationary on path (no automatic split-sacrifice)
{
    const res = roomManager.createRoom('host_tok_split_long_session_id_123', 'HostSplit', '👑', 'sock_split', 90, 4, '10.0.0.10');
    assert(res.ok && !!res.roomCode, 'Created room for stack-split test');
    const hostTok = res.secretSessionToken || 'host_tok_split_long_session_id_123';
    roomManager.startGame(res.roomCode!, hostTok);
    const room = roomManager.getRoom(res.roomCode!)!;
    room.currentTurn = 0;
    room.tokens = newTokens();
    room.tokens[0] = [10, 10, IN_BASE, IN_BASE]; // 2-token stack on open square 10
    room.dice = [3, 2];
    room.diceUsed = [false, false];
    room.capturesTakenThisTurn = 0;
    room.tokensCapturedThisTurn = [];
    room.turnMovedToSquare = {};
    room.turnObligation = evaluateCaptureObligation(room.tokens, 0, room.dice, [true, true, true, true]);
    room.capturePromise = room.turnObligation.required;

    const splitRes = roomManager.movePawn(room.code, hostTok, 0, 0, 'gul', false);
    assert(
        splitRes.ok && room.tokens[0][0] === 13 && room.tokens[0][1] === 10,
        'Moving 1 token off a 2-token stack leaves partner token stationary at pos 10 (no auto split-sacrifice)',
    );
}

// Test 16: Lone opponent sitting on a friendly 2-token pair cannot capture the pair and is still capturable by 1 attacker
{
    const tokens = newTokens();
    const pairSquare = 10; // non-safe shared square (global 10 for seat 0)
    const oppRel10 = (10 - 13 + 52) % 52; // seat 1 relative index matching global 10
    tokens[0] = [pairSquare, pairSquare, IN_BASE, IN_BASE];
    tokens[1] = [oppRel10, IN_BASE, IN_BASE, IN_BASE];

    // If seat 1 has another token arriving at global 10 (still only 1 mover vs pair), check lone landing vs stack
    const loneTokens = newTokens();
    loneTokens[0] = [pairSquare, pairSquare, IN_BASE, IN_BASE];
    loneTokens[1] = [oppRel10 - 3, IN_BASE, IN_BASE, IN_BASE];
    const oppMoves = legalMoves(loneTokens, 1, 3, 0, [true, true, false, false]);
    const oppLandingOnPair = oppMoves.find((m) => m.to === oppRel10);
    assert(
        !!oppLandingOnPair && oppLandingOnPair.captures.length === 0,
        'Lone opponent token landing on 2-token pair cannot capture the pair (1 < 2)',
    );

    // Meanwhile seat 2 with 1 token 4 steps behind global 10 captures seat 1's lone token on global 10 while pair stays safe
    const opp2Rel10 = (10 - 26 + 52) % 52;
    tokens[2] = [opp2Rel10 - 4, IN_BASE, IN_BASE, IN_BASE];
    const seat2Moves = legalMoves(tokens, 2, 4, 0, [true, true, true, false]);
    const seat2Attack = seat2Moves.find((m) => m.to === opp2Rel10);
    assert(
        !!seat2Attack &&
            seat2Attack.captures.length === 1 &&
            seat2Attack.captures[0].p === 1 &&
            !seat2Attack.captures.some((c) => c.p === 0),
        'Single attacker captures lone opponent sitting on a 2-token pair while the pair remains protected',
    );
}

// Test 17: getMatchLeader, isEntrySquareThreatened, and pickBestAIMove leader targeting
{
    const tokens = newTokens();
    tokens[0] = [20, 12, IN_BASE, IN_BASE]; // score for seat 0 = 21 + 13 = 34
    tokens[1] = [HOME, 40, 10, IN_BASE]; // score for seat 1 = 1000 + 41 + 11 = 1052 (leader)
    tokens[2] = [15, IN_BASE, IN_BASE, IN_BASE]; // AI evaluator seat 2 (entry square global 26)
    tokens[3] = [5, IN_BASE, IN_BASE, IN_BASE];

    const leaderRes = getMatchLeader(tokens, 2, [true, true, true, true]);
    assert(
        leaderRes.leaderIdx === 1 && leaderRes.score === 1052,
        `getMatchLeader scores finished=1000 + active(pos+1) and picks seat 1 (got ${leaderRes.leaderIdx}, score=${leaderRes.score})`,
    );

    // Threat detection: seat 0 at pos 23 (global 23) is 3 steps behind seat 2 entry square (global 26)
    const threatTokens = newTokens();
    threatTokens[0] = [23, IN_BASE, IN_BASE, IN_BASE];
    assert(
        isEntrySquareThreatened(threatTokens, 2, [true, true, true, true]) === true,
        'isEntrySquareThreatened returns true when opponent sits within 1..6 steps behind entry square',
    );
    threatTokens[0] = [10, IN_BASE, IN_BASE, IN_BASE];
    assert(
        isEntrySquareThreatened(threatTokens, 2, [true, true, true, true]) === false,
        'isEntrySquareThreatened returns false when no opponent threatens entry square',
    );

    // AI capture prioritization: seat 2 can capture either seat 1 (leader) with die 0 or seat 3 (non-leader) with die 1
    const aiBoard = newTokens();
    const leaderTargetG30 = (30 - 13 + 52) % 52; // global 30 belongs to seat 1 (leader via finished pawn at HOME)
    const nonLeaderG29 = (29 - 39 + 52) % 52; // global 29 belongs to seat 3
    aiBoard[1] = [HOME, leaderTargetG30, IN_BASE, IN_BASE]; // leader
    aiBoard[3] = [nonLeaderG29, IN_BASE, IN_BASE, IN_BASE];
    aiBoard[2] = [0, 1, IN_BASE, IN_BASE]; // tok 0 at rel 0 (global 26) -> +4=global 30; tok 1 at rel 1 (global 27) -> +2=global 29
    const dice: [number, number] = [4, 2];
    const active = [false, true, true, true];
    const legal = legalMovesForTurn(aiBoard, 2, dice, [false, false], active);
    const ob = evaluateCaptureObligation(aiBoard, 2, dice, active);
    const aiPick = pickBestAIMove(aiBoard, 2, legal, active, dice, [false, false], ob, 0);
    assert(
        aiPick.hitsLeader && aiPick.move.captures.some((c) => c.p === 1),
        'pickBestAIMove prioritizes capturing match leader pawn first and flags hitsLeader = true',
    );
}

// Test 18: Configurable CaptureWarningMode helper ('first3' | 'always' | 'off')
{
    assert(shouldShowCaptureWarning('first3', 1) === true, "first3 warns on match 1");
    assert(shouldShowCaptureWarning('first3', 3) === true, "first3 warns on match 3");
    assert(shouldShowCaptureWarning('first3', 4) === false, "first3 stops warning on match 4");
    assert(shouldShowCaptureWarning('always', 10) === true, "always warns on match 10");
    assert(shouldShowCaptureWarning('off', 1) === false, "off disables warning even on match 1");
}

console.log('🎉 ALL LUDO RULES & PENALTY & GUL TESTS PASSED SUCCESSFULLY!');
process.exit(0);
