import { io } from 'socket.io-client';

async function testTurnsFlow() {
    const hostSocket = io('http://localhost:3000', { reconnection: false });
    await new Promise((res) => hostSocket.on('connect', res));

    const createRes: any = await new Promise((res) => {
        hostSocket.emit('create_room', { name: 'HostKing', avatar: '👑', turnTimeSec: 90, maxPlayers: 4 }, res);
    });
    const roomCode = createRes.roomCode;
    const hostToken = createRes.secretSessionToken;

    const friendSocket = io('http://localhost:3000', { reconnection: false });
    await new Promise((res) => friendSocket.on('connect', res));

    const joinRes: any = await new Promise((res) => {
        friendSocket.emit('join_room', { roomCode, name: 'FriendWarrior', avatar: '⚔️' }, res);
    });
    const friendToken = joinRes.secretSessionToken;

    // Listen to events on both
    const logEvent = (source: string, ev: string, data: any) => {
        console.log(`[${source}] ${ev}:`, JSON.stringify(data));
    };

    ['dice_rolled', 'pawn_moved', 'turn_changed'].forEach((ev) => {
        hostSocket.on(ev, (d) => logEvent('HOST', ev, d));
        friendSocket.on(ev, (d) => logEvent('FRIEND', ev, d));
    });

    console.log('--- Host starting game ---');
    await new Promise((res) => hostSocket.emit('start_game', { roomCode, sessionToken: hostToken }, res));

    // Turn 0: Host rolls dice
    console.log('\n--- Host rolling dice (Turn 0) ---');
    const rollRes0: any = await new Promise((res) => {
        hostSocket.emit('dice_roll', { roomCode, sessionToken: hostToken }, res);
    });
    console.log('Host roll response:', rollRes0);

    // Let 6 seconds pass to observe timeout or turn advancement
    console.log('\nWaiting 6 seconds to observe bot turns and turn changes...');
    await new Promise((r) => setTimeout(r, 6000));

    hostSocket.disconnect();
    friendSocket.disconnect();
    process.exit(0);
}

testTurnsFlow().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
