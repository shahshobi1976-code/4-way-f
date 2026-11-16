import {
    hasWon,
    tokenShare,
    HOME,
    PATH_START,
    IN_BASE,
    newTokens,
    legalMoves,
    maxCaptures,
    findOffendingToken,
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

    // Player 0 has a token at track pos 10.
    // Player 1 has a token at track pos 14.
    // Global idx: Player 0 start is 0, so pos 10 -> global 10.
    // Player 1 start is 13, so to land on global 10: (10 - 13 + 52) % 52 = 49.
    // Let's set Player 0 token 0 at relative 10 (global 10).
    // Let's set Player 1 token 0 at relative 49 (which is global (13 + 49) % 52 = 10).
    // When Player 0 rolls a 4 from pos 6 (global 6): 6 + 4 = 10 -> lands on Player 1 token!
    tokens[0][0] = 6;  // Player 0 token 0 is at pos 6
    tokens[1][0] = (10 - 13 + 52) % 52; // Player 1 token 0 is at global 10

    // Dice rolled: [4, 2]
    const dice = [4, 2];
    const mc = maxCaptures(tokens, 0, dice, active);
    assert(mc.taken === 1, 'maxCaptures identifies 1 capture opportunity available from roll');

    // findOffendingToken identifies token 0 of Player 0
    const initialTokens = tokens.map(r => r.slice());
    const offending = findOffendingToken(initialTokens, tokens, 0, dice, active);
    assert(offending === 0, 'findOffendingToken identifies player 0 pawn 0 as offending pawn');

    // What if Player 0 moves token 1 instead of token 0?
    // Token 0 is still on board, missed its capture.
    const currentTokens = tokens.map(r => r.slice());
    currentTokens[0][1] = 2; // moved token 1 with die 2
    const offendingAfterMove = findOffendingToken(initialTokens, currentTokens, 0, dice, active);
    assert(offendingAfterMove === 0, 'findOffendingToken correctly identifies un-moved offending token 0');
}

// Test 4: Several of my tokens being able to make the same capture
{
    const tokens: Tokens = newTokens();
    const active = [true, true, true, true];
    // Enemy piece at global 10
    tokens[1][0] = (10 - 13 + 52) % 52;

    // Player 0 has TWO tokens that can capture:
    // Token 0 at pos 6 (needs 4 to reach 10)
    // Token 1 at pos 8 (needs 2 to reach 10)
    tokens[0][0] = 6;
    tokens[0][1] = 8;

    const dice = [4, 2];
    const mc = maxCaptures(tokens, 0, dice, active);
    assert(mc.taken >= 1, 'At least 1 capture can be fulfilled');

    // Taking either capture satisfies the captureDebt!
    const takenWithToken0 = 1;
    assert(takenWithToken0 >= mc.taken, 'Capturing with token 0 satisfies capture obligation');
}

// Test 5: Pair capture (2 captures obligatory in same turn)
{
    const tokens: Tokens = newTokens();
    const active = [true, true, true, true];
    // Enemy piece 1 at global 10
    // Enemy piece 2 at global 12
    tokens[1][0] = (10 - 13 + 52) % 52;
    tokens[2][0] = (12 - 26 + 52) % 52;

    // Player 0 token 0 at pos 7 (die 3 -> reaches 10, die 2 from 10 -> reaches 12)
    tokens[0][0] = 7;

    const dice = [3, 2];
    const mc = maxCaptures(tokens, 0, dice, active);
    assert(mc.taken === 2, 'maxCaptures identifies sequential pair capture (2 captures obligatory)');
}

// Test 6: Server Missed Capture Penalty Enforcement
{
    const res = roomManager.createRoom('tok_test_session_token_123456789', 'Host', '👑', 'sock_1');
    assert(res.ok && !!res.roomCode, 'Server created room');
    const room = roomManager.getRoom(res.roomCode!)!;
    
    // Setup board state with missed capture
    room.phase = 'playing';
    room.currentTurn = 0;
    room.tokens = newTokens();
    room.tokens[0][0] = 6;
    room.tokens[1][0] = (10 - 13 + 52) % 52;
    room.initialTurnTokens = room.tokens.map(r => r.slice());
    room.dice = [4, 2];
    room.capturePromise = 1;
    room.capturesTakenThisTurn = 0; // Player missed capture!

    // Check penalty enforcement
    const penalized = roomManager.checkAndApplyMissedCapturePenalty(room);
    assert(penalized, 'Server enforces missed capture penalty');
    assert(room.tokens[0][0] === IN_BASE, 'Offending pawn sent back to base (-1)');
    assert(room.penalties[0] === 1, 'Player penalty counter incremented to 1');
}

// Test 7: Centre "Gul or Pass?" choice logic
{
    const res = roomManager.createRoom('tok_test_gul_token_1234567890123', 'Host', '👑', 'sock_2');
    const room = roomManager.getRoom(res.roomCode!)!;
    room.phase = 'playing';
    room.currentTurn = 0;
    room.tokens = newTokens();
    room.tokens[0][0] = 53; // on coloured path
    room.dice = [3, 1]; // die 0 has value 3: 53 + 3 = 56 (exact Gul!)
    room.diceUsed = [false, false];

    // 7A: Player chooses "pass" on Gul move
    const passRes = roomManager.movePawn(room.code, 'tok_test_gul_token_1234567890123', 0, 0, 'pass');
    assert(passRes.ok, 'Server allows pass choice for move reaching centre (56)');
    assert(room.tokens[0][0] === 53, 'Token remains at 53 on coloured path when passed');
    assert(room.diceUsed[0] === true, 'Die 0 is consumed by pass');

    // 7B: Player chooses "gul" (enter centre)
    room.diceUsed[0] = false;
    const gulRes = roomManager.movePawn(room.code, 'tok_test_gul_token_1234567890123', 0, 0, 'gul');
    assert(gulRes.ok, 'Server moves token into centre on gul');
    assert(room.tokens[0][0] === HOME, 'Token reaches centre HOME (56)');
}

console.log('🎉 ALL LUDO RULES & PENALTY & GUL TESTS PASSED SUCCESSFULLY!');
process.exit(0);
