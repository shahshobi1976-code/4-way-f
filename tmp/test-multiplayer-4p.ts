import { roomManager } from './server/roomManager';

console.log('--- Testing 4-Way Online Friends Room & Bot Fill ---');

// 1. Host creates room
const hostRes = roomManager.createRoom('tok_host_test_secret_1234567890', 'HostPlayer', '👑', 'sock_host_1', 90, 4);
if (!hostRes.ok || !hostRes.roomCode) {
    throw new Error('Host failed to create room: ' + hostRes.error);
}
console.log('1. Room created:', hostRes.roomCode, 'Host Seat:', hostRes.playerIndex);

const roomCode = hostRes.roomCode;
let room = roomManager.getRoom(roomCode)!;
console.log('Room players count:', room.players.length);
if (room.players.length !== 4) {
    throw new Error('Expected 4 seats in room, got: ' + room.players.length);
}

// 2. Friend 1 joins
const friendRes = roomManager.joinRoom(roomCode, 'tok_friend1_test_secret_1234567890', 'FriendOne', '⚔️', 'sock_friend_1');
if (!friendRes.ok || friendRes.playerIndex !== 1) {
    throw new Error('Friend 1 failed to join seat 1: ' + JSON.stringify(friendRes));
}
console.log('2. Friend 1 joined Seat:', friendRes.playerIndex, 'Name:', room.players[1]?.name);

// Check seats before start: seat 0 = Host, seat 1 = Friend, seats 2 and 3 = null
if (room.players[0]?.name !== 'HostPlayer' || room.players[1]?.name !== 'FriendOne') {
    throw new Error('Unexpected seat 0 or 1 player');
}
if (room.players[2] !== null || room.players[3] !== null) {
    throw new Error('Seats 2 and 3 should be open before match starts');
}
console.log('Seats 2 and 3 open as expected.');

// 3. Host starts game with fillBots: true
const startRes = roomManager.startGame(roomCode, 'tok_host_test_secret_1234567890');
if (!startRes.ok) {
    throw new Error('Failed to start game: ' + startRes.error);
}
console.log('3. Game started successfully!');

// Verify all 4 seats are populated: seat 0 (Human), seat 1 (Human), seat 2 (Bot), seat 3 (Bot)
console.log('Seat 0:', room.players[0]?.name, 'isAI:', room.players[0]?.isAI);
console.log('Seat 1:', room.players[1]?.name, 'isAI:', room.players[1]?.isAI);
console.log('Seat 2:', room.players[2]?.name, 'isAI:', room.players[2]?.isAI);
console.log('Seat 3:', room.players[3]?.name, 'isAI:', room.players[3]?.isAI);

if (room.players[0]?.isAI !== false || room.players[1]?.isAI !== false) {
    throw new Error('Host and Friend 1 should NOT be AI');
}
if (room.players[2]?.isAI !== true || room.players[3]?.isAI !== true) {
    throw new Error('Seats 2 and 3 should be automatically filled with AI Bots');
}

// 4. Test Seat 0 (Host) Turn
const roll0 = roomManager.rollDice(roomCode, 'tok_host_test_secret_1234567890');
console.log('4. Host rolled dice:', roll0.ok, room.dice);
if (!roll0.ok || !room.dice) throw new Error('Host roll failed: ' + roll0.error);

// Force turn advancement to Seat 1 (Friend 1)
roomManager['advanceTurn'](room, false);
console.log('Current turn now:', room.currentTurn, 'Player:', room.players[room.currentTurn]?.name);
if (room.currentTurn !== 1) throw new Error('Expected Seat 1 turn');

// 5. Test Seat 1 (Friend 1) Turn
const roll1 = roomManager.rollDice(roomCode, 'tok_friend1_test_secret_1234567890');
console.log('5. Friend 1 rolled dice:', roll1.ok, room.dice);
if (!roll1.ok || !room.dice) throw new Error('Friend 1 roll failed: ' + roll1.error);

// Force turn advancement to Seat 2 (Echo Bot)
roomManager['advanceTurn'](room, false);
console.log('Current turn now:', room.currentTurn, 'Player:', room.players[room.currentTurn]?.name);
if (room.currentTurn !== 2) throw new Error('Expected Seat 2 turn');
if (room.players[2]?.isAI !== true) throw new Error('Seat 2 should be AI');

// Force turn advancement to Seat 3 (Titan Bot)
roomManager['advanceTurn'](room, false);
console.log('Current turn now:', room.currentTurn, 'Player:', room.players[room.currentTurn]?.name);
if (room.currentTurn !== 3) throw new Error('Expected Seat 3 turn');
if (room.players[3]?.isAI !== true) throw new Error('Seat 3 should be AI');

// Force turn advancement back to Seat 0 (Host)
roomManager['advanceTurn'](room, false);
console.log('Cycle complete. Current turn back to:', room.currentTurn, 'Player:', room.players[room.currentTurn]?.name);
if (room.currentTurn !== 0) throw new Error('Expected turn back to Seat 0');

console.log('✅ ALL MULTIPLAYER 4-SEAT & BOT FILL TESTS PASSED CLEANLY!');
