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
    type Tokens,
} from '../src/game/rules';
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

// Test 1: Win condition requires reaching centre HOME (56), NOT PATH_START (51)
{
    const tokens: Tokens = newTokens();
    tokens[0] = [PATH_START, PATH_START, PATH_START, PATH_START]; // 51, 51, 51, 51
    assert(!hasWon(tokens, 0), 'hasWon returns false when pawns are on coloured path (51..55)');

    tokens[0] = [55, 55, 55, 55];
    assert(!hasWon(tokens, 0), 'hasWon returns false when pawns are on square 55');

    tokens[0] = [HOME, HOME, HOME, HOME]; // 56
    assert(hasWon(tokens, 0), 'hasWon returns true when all 4 pawns reach centre HOME (56)');
}

// Test 2: tokenShare progress computation
{
    assert(tokenShare(-1) === 0, 'tokenShare is 0 for base token');
    assert(tokenShare(HOME) === 1, 'tokenShare is 1 (100%) for token at centre HOME (56)');
    assert(tokenShare(PATH_START) < 1, 'tokenShare is < 1 for token on path start (51)');
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

    // 11E: offendingTokensForPenalty excludes tokens that captured and base tokens
    const offAll = offendingTokensForPenalty(sharedOb, sharedDieToks, 0, new Set());
    assert(offAll.length === 2 && offAll[0] === 0 && offAll[1] === 1, 'offendingTokensForPenalty returns all uncaptured option tokens when required not met');
    const offOne = offendingTokensForPenalty(sharedOb, sharedDieToks, 0, new Set([0]));
    assert(offOne.length === 1 && offOne[0] === 1, 'offendingTokensForPenalty excludes tokens that actually captured');
}

console.log('🎉 ALL LUDO RULES & PENALTY & GUL TESTS PASSED SUCCESSFULLY!');
process.exit(0);
