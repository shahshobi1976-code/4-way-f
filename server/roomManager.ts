import {
    legalMoves,
    newTokens,
    randDie,
    pickMove,
    hasWon,
    isLuckySum,
    luckySevenAllowed,
    type Move,
    type Tokens,
} from '../src/game/rules';

export interface RoomPlayer {
    id: string; // sessionToken
    name: string;
    avatar: string;
    socketId: string;
    ready: boolean;
    isReady?: boolean;
    isHost?: boolean;
    connected: boolean;
    disconnectTime?: number | null;
    isAI: boolean;
}

export interface ClientRoomState {
    code: string;
    hostId: string;
    phase: 'lobby' | 'playing' | 'game_over';
    fillBots: boolean;
    players: (RoomPlayer | null)[];
    tokens: number[][];
    currentTurn: number;
    turnDeadline: number;
    dice: [number, number] | null;
    diceUsed: [boolean, boolean];
    winner: number | null;
    rankings: { playerIndex: number; name: string; avatar: string; rank: number }[];
    turnTimeSec?: number;
}

export interface Room {
    code: string;
    hostId: string;
    phase: 'lobby' | 'playing' | 'game_over';
    fillBots: boolean;
    turnTimeSec: number;
    players: (RoomPlayer | null)[];
    tokens: Tokens;
    currentTurn: number;
    turnDeadline: number;
    dice: [number, number] | null;
    diceUsed: [boolean, boolean];
    winner: number | null;
    rankings: { playerIndex: number; name: string; avatar: string; rank: number }[];
    consecutiveSixes: number;
    rematchVotes: Set<string>;
    turnTimeout?: NodeJS.Timeout | null;
    disconnectTimeouts: Map<number, NodeJS.Timeout>;
}

type BroadcastFn = (roomCode: string, event: string, payload: any) => void;

const DEFAULT_TURN_TIME_LIMIT_MS = 90000;
const DISCONNECT_GRACE_SEC = 60;
const BOT_NAMES = ['Nova Bot', 'Atlas Bot', 'Echo Bot', 'Titan Bot'];
const BOT_AVATARS = ['🤖', '🦁', '⚡', '👑'];

class RoomManager {
    private rooms = new Map<string, Room>();
    private broadcast: BroadcastFn = () => {};

    public setBroadcastCallback(cb: BroadcastFn) {
        this.broadcast = cb;
    }

    public getRoom(code: string): Room | undefined {
        return this.rooms.get(code.toUpperCase().trim());
    }

    public getClientRoomState(room: Room): ClientRoomState {
        return {
            code: room.code,
            hostId: room.hostId,
            phase: room.phase,
            fillBots: room.fillBots,
            players: room.players.map((p) =>
                p
                    ? {
                          ...p,
                          isHost: p.id === room.hostId,
                          isReady: p.ready,
                      }
                    : null,
            ),
            tokens: room.tokens,
            currentTurn: room.currentTurn,
            turnDeadline: room.turnDeadline,
            dice: room.dice,
            diceUsed: room.diceUsed,
            winner: room.winner,
            rankings: room.rankings,
            turnTimeSec: room.turnTimeSec || 90,
        };
    }

    private generateCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return this.rooms.has(code) ? this.generateCode() : code;
    }

    public getTurnLimitMs(room: Room): number {
        return (room.turnTimeSec ?? 90) * 1000;
    }

    public setTurnTime(code: string, sessionToken: string, turnTimeSec: number): boolean {
        const room = this.rooms.get(code);
        if (!room || room.hostId !== sessionToken || room.phase !== 'lobby') return false;
        room.turnTimeSec = turnTimeSec;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public createRoom(
        sessionToken: string,
        name: string,
        avatar: string,
        socketId: string,
        turnTimeSec = 90,
    ): { ok: boolean; roomCode?: string; error?: string } {
        if (!sessionToken) return { ok: false, error: 'Invalid session' };
        const code = this.generateCode();
        const players: (RoomPlayer | null)[] = [
            {
                id: sessionToken,
                name: (name || 'Host').trim().slice(0, 16),
                avatar: avatar || '🤴',
                socketId,
                ready: true,
                isReady: true,
                isHost: true,
                connected: true,
                disconnectTime: null,
                isAI: false,
            },
            null,
            null,
            null,
        ];

        const room: Room = {
            code,
            hostId: sessionToken,
            phase: 'lobby',
            fillBots: true,
            turnTimeSec: turnTimeSec !== undefined ? turnTimeSec : 90,
            players,
            tokens: newTokens(),
            currentTurn: 0,
            turnDeadline: 0,
            dice: null,
            diceUsed: [false, false],
            winner: null,
            rankings: [],
            consecutiveSixes: 0,
            rematchVotes: new Set(),
            disconnectTimeouts: new Map(),
        };

        this.rooms.set(code, room);
        return { ok: true, roomCode: code };
    }

    public joinRoom(
        code: string,
        sessionToken: string,
        name: string,
        avatar: string,
        socketId: string,
    ): { ok: boolean; playerIndex?: number; error?: string } {
        const room = this.rooms.get(code);
        if (!room) return { ok: false, error: 'Room not found' };

        // Check if player is rejoining
        const existingIdx = room.players.findIndex((p) => p && p.id === sessionToken);
        if (existingIdx !== -1) {
            const player = room.players[existingIdx]!;
            player.socketId = socketId;
            player.connected = true;
            player.disconnectTime = null;
            if (name) player.name = name.trim().slice(0, 16);
            if (avatar) player.avatar = avatar;

            const existingTimeout = room.disconnectTimeouts.get(existingIdx);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
                room.disconnectTimeouts.delete(existingIdx);
            }

            this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
            return { ok: true, playerIndex: existingIdx };
        }

        if (room.phase !== 'lobby') {
            return { ok: false, error: 'Game already in progress' };
        }

        // Find empty seat
        const openIdx = room.players.findIndex((p) => p === null);
        if (openIdx === -1) {
            return { ok: false, error: 'Room is full' };
        }

        room.players[openIdx] = {
            id: sessionToken,
            name: (name || `Player ${openIdx + 1}`).trim().slice(0, 16),
            avatar: avatar || '👑',
            socketId,
            ready: false,
            isReady: false,
            isHost: false,
            connected: true,
            disconnectTime: null,
            isAI: false,
        };

        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return { ok: true, playerIndex: openIdx };
    }

    public toggleReady(code: string, sessionToken: string): boolean {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'lobby') return false;
        const player = room.players.find((p) => p && p.id === sessionToken);
        if (!player) return false;
        player.ready = !player.ready;
        player.isReady = player.ready;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public toggleFillBots(code: string, sessionToken: string, fillBots: boolean): boolean {
        const room = this.rooms.get(code);
        if (!room || room.hostId !== sessionToken || room.phase !== 'lobby') return false;
        room.fillBots = !!fillBots;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public startGame(code: string, sessionToken: string): { ok: boolean; error?: string } {
        const room = this.rooms.get(code);
        if (!room) return { ok: false, error: 'Room not found' };
        if (room.hostId !== sessionToken) return { ok: false, error: 'Only host can start game' };
        if (room.phase !== 'lobby') return { ok: false, error: 'Already playing' };

        // Fill remaining seats with bots if enabled
        for (let i = 0; i < 4; i++) {
            if (!room.players[i] && room.fillBots) {
                room.players[i] = {
                    id: `bot_${i}_${Date.now()}`,
                    name: BOT_NAMES[i],
                    avatar: BOT_AVATARS[i],
                    socketId: '',
                    ready: true,
                    connected: true,
                    isAI: true,
                };
            }
        }

        const activePlayersCount = room.players.filter((p) => p !== null).length;
        if (activePlayersCount < 2) {
            return { ok: false, error: 'Need at least 2 players or bots to start' };
        }

        room.phase = 'playing';
        room.tokens = newTokens();
        room.currentTurn = 0;
        room.consecutiveSixes = 0;
        room.winner = null;
        room.rankings = [];
        room.dice = null;
        room.diceUsed = [false, false];
        const turnLimitMs = this.getTurnLimitMs(room);
        room.turnDeadline = room.turnTimeSec > 0 ? Date.now() + turnLimitMs : 0;

        this.broadcast(room.code, 'game_started', this.getClientRoomState(room));
        this.startTurnTimer(room);

        // If player 0 is AI, trigger AI roll
        if (room.players[0]?.isAI) {
            this.scheduleBotTurn(room);
        }

        return { ok: true };
    }

    private startTurnTimer(room: Room) {
        if (room.turnTimeout) clearTimeout(room.turnTimeout);
        if (room.turnTimeSec <= 0) {
            room.turnDeadline = 0;
            return;
        }

        const turnLimitMs = this.getTurnLimitMs(room);
        room.turnDeadline = Date.now() + turnLimitMs;

        room.turnTimeout = setTimeout(() => {
            this.handleTurnTimeout(room.code);
        }, turnLimitMs);
    }

    private handleTurnTimeout(code: string) {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'playing') return;

        // Auto roll and auto move if player didn't act
        if (!room.dice) {
            this.rollDice(room.code, room.players[room.currentTurn]?.id || '', true);
        } else {
            this.advanceTurn(room, false);
        }
    }

    private scheduleBotTurn(room: Room) {
        setTimeout(() => {
            const currentRoom = this.rooms.get(room.code);
            if (!currentRoom || currentRoom.phase !== 'playing') return;
            const curP = currentRoom.players[currentRoom.currentTurn];
            if (!curP || !curP.isAI) return;

            // 1) Roll
            this.rollDice(currentRoom.code, curP.id, true);

            // 2) Move
            setTimeout(() => {
                this.executeBotMoves(currentRoom);
            }, 900);
        }, 800);
    }

    private executeBotMoves(room: Room) {
        if (!room.dice || room.phase !== 'playing') return;
        const curIdx = room.currentTurn;
        const curPlayer = room.players[curIdx];
        if (!curPlayer || !curPlayer.isAI) return;

        const activeBools = room.players.map((p) => p !== null);

        // Try using die 0 or die 1
        for (let d = 0; d < 2; d++) {
            if (room.diceUsed[d]) continue;
            const val = room.dice[d];
            const opts = legalMoves(room.tokens, curIdx, val, d, activeBools);
            if (opts.length > 0) {
                const best = pickMove(room.tokens, curIdx, opts, activeBools);
                this.movePawn(room.code, curPlayer.id, d, best.tok);
                setTimeout(() => {
                    this.executeBotMoves(room);
                }, 800);
                return;
            } else {
                room.diceUsed[d] = true;
            }
        }

        // If both dice used or no moves left, advance
        if (room.diceUsed[0] && room.diceUsed[1]) {
            const hasSix = room.dice[0] === 6 || room.dice[1] === 6;
            this.advanceTurn(room, hasSix && room.consecutiveSixes < 3);
        }
    }

    public rollDice(
        code: string,
        sessionToken: string,
        forced = false,
    ): { ok: boolean; error?: string } {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'playing') return { ok: false, error: 'Not in playing phase' };

        const curPlayer = room.players[room.currentTurn];
        if (!curPlayer) return { ok: false, error: 'No player at current turn' };
        if (!forced && curPlayer.id !== sessionToken) return { ok: false, error: 'Not your turn' };
        if (room.dice !== null) return { ok: false, error: 'Dice already rolled this turn' };

        const d1 = randDie();
        const d2 = randDie();
        room.dice = [d1, d2];
        room.diceUsed = [false, false];

        const lucky = isLuckySum(d1, d2) && luckySevenAllowed(room.tokens, room.currentTurn);
        if (d1 === 6 || d2 === 6) {
            room.consecutiveSixes += 1;
        } else {
            room.consecutiveSixes = 0;
        }

        let streakForfeited = false;
        if (room.consecutiveSixes >= 3) {
            streakForfeited = true;
            room.diceUsed = [true, true];
        }

        const activeBools = room.players.map((p) => p !== null);
        const movableTokens: { tok: number; die: number }[] = [];

        if (!streakForfeited) {
            const moves0 = legalMoves(room.tokens, room.currentTurn, d1, 0, activeBools);
            for (const m of moves0) movableTokens.push({ tok: m.tok, die: 0 });
            const moves1 = legalMoves(room.tokens, room.currentTurn, d2, 1, activeBools);
            for (const m of moves1) movableTokens.push({ tok: m.tok, die: 1 });
        }

        this.broadcast(room.code, 'dice_rolled', {
            p: room.currentTurn,
            dice: room.dice,
            lucky,
            movableTokens,
            streakForfeited,
        });

        // If streak forfeited or no legal moves at all, pass turn
        if (streakForfeited || movableTokens.length === 0) {
            setTimeout(() => {
                this.advanceTurn(room, false);
            }, 1200);
        }

        return { ok: true };
    }

    public movePawn(
        code: string,
        sessionToken: string,
        dieIndex: number,
        tokenIndex: number,
    ): { ok: boolean; error?: string } {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'playing') return { ok: false, error: 'Not playing' };
        const curPlayer = room.players[room.currentTurn];
        if (!curPlayer || curPlayer.id !== sessionToken) return { ok: false, error: 'Not your turn' };
        if (!room.dice) return { ok: false, error: 'Dice not rolled' };
        if (room.diceUsed[dieIndex]) return { ok: false, error: 'Die already used' };

        const dieVal = room.dice[dieIndex];
        const activeBools = room.players.map((p) => p !== null);
        const legal = legalMoves(room.tokens, room.currentTurn, dieVal, dieIndex, activeBools);
        const move = legal.find((m) => m.tok === tokenIndex);
        if (!move) return { ok: false, error: 'Illegal move' };

        // Apply move
        room.tokens[room.currentTurn][tokenIndex] = move.to;
        room.diceUsed[dieIndex] = true;

        for (const cap of move.captures) {
            room.tokens[cap.p][cap.t] = -1;
        }

        const reachedHome = move.to >= 51;

        this.broadcast(room.code, 'pawn_moved', {
            p: room.currentTurn,
            dieIndex,
            tokenIndex,
            to: move.to,
            captures: move.captures,
            reachedHome,
            diceUsed: room.diceUsed,
        });

        // Check if current player won
        if (hasWon(room.tokens, room.currentTurn)) {
            room.phase = 'game_over';
            room.winner = room.currentTurn;
            room.rankings = room.players
                .map((p, idx) => ({ playerIndex: idx, name: p?.name || '', avatar: p?.avatar || '', rank: idx === room.currentTurn ? 1 : 2 }))
                .filter((_, idx) => room.players[idx] !== null);

            if (room.turnTimeout) clearTimeout(room.turnTimeout);
            this.broadcast(room.code, 'game_over', { winner: room.winner, rankings: room.rankings });
            return { ok: true };
        }

        // Check if other die can still be played
        const otherDieIdx = dieIndex === 0 ? 1 : 0;
        let canPlayOther = false;
        if (!room.diceUsed[otherDieIdx]) {
            const otherVal = room.dice[otherDieIdx];
            const otherMoves = legalMoves(room.tokens, room.currentTurn, otherVal, otherDieIdx, activeBools);
            if (otherMoves.length > 0) canPlayOther = true;
            else room.diceUsed[otherDieIdx] = true;
        }

        if (!canPlayOther) {
            // Check for extra turn bonus (rolling a 6 or capturing or reaching home)
            const hadSix = (room.dice[0] === 6 || room.dice[1] === 6) && room.consecutiveSixes < 3;
            const extraTurn = hadSix || move.captures.length > 0 || reachedHome;
            setTimeout(() => {
                this.advanceTurn(room, extraTurn);
            }, 800);
        }

        return { ok: true };
    }

    private advanceTurn(room: Room, extraTurn: boolean) {
        if (room.phase !== 'playing') return;
        if (room.turnTimeout) clearTimeout(room.turnTimeout);

        if (!extraTurn) {
            let next = (room.currentTurn + 1) % 4;
            while (room.players[next] === null) {
                next = (next + 1) % 4;
            }
            room.currentTurn = next;
            room.consecutiveSixes = 0;
        }

        room.dice = null;
        room.diceUsed = [false, false];
        const turnLimitMs = this.getTurnLimitMs(room);
        room.turnDeadline = room.turnTimeSec > 0 ? Date.now() + turnLimitMs : 0;

        this.broadcast(room.code, 'turn_changed', {
            currentTurn: room.currentTurn,
            turnDeadline: room.turnDeadline,
            extraTurn,
        });

        this.startTurnTimer(room);

        if (room.players[room.currentTurn]?.isAI) {
            this.scheduleBotTurn(room);
        }
    }

    public sendChat(code: string, sessionToken: string, text: string, emoji?: string): boolean {
        const room = this.rooms.get(code);
        if (!room) return false;
        const playerIdx = room.players.findIndex((p) => p && p.id === sessionToken);
        if (playerIdx === -1) return false;
        const player = room.players[playerIdx]!;

        this.broadcast(room.code, 'chat_received', {
            p: playerIdx,
            name: player.name,
            avatar: player.avatar,
            text: (text || '').trim().slice(0, 100),
            emoji: emoji || '',
            time: Date.now(),
        });
        return true;
    }

    public voteRematch(code: string, sessionToken: string): { ok: boolean } {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'game_over') return { ok: false };

        room.rematchVotes.add(sessionToken);
        const humanCount = room.players.filter((p) => p && !p.isAI).length;

        if (room.rematchVotes.size >= Math.max(1, humanCount)) {
            // Start rematch
            room.phase = 'playing';
            room.tokens = newTokens();
            room.winner = null;
            room.rankings = [];
            room.dice = null;
            room.diceUsed = [false, false];
            room.consecutiveSixes = 0;
            room.rematchVotes.clear();
            room.currentTurn = 0;
            const rematchTurnLimitMs = this.getTurnLimitMs(room);
            room.turnDeadline = room.turnTimeSec > 0 ? Date.now() + rematchTurnLimitMs : 0;

            this.broadcast(room.code, 'rematch_started', this.getClientRoomState(room));
            this.startTurnTimer(room);

            if (room.players[0]?.isAI) {
                this.scheduleBotTurn(room);
            }
        }

        return { ok: true };
    }

    public handleSocketDisconnect(socketId: string) {
        for (const room of this.rooms.values()) {
            const idx = room.players.findIndex((p) => p && p.socketId === socketId);
            if (idx === -1) continue;

            const player = room.players[idx]!;
            player.connected = false;
            player.disconnectTime = Date.now();

            if (room.phase === 'lobby') {
                // If in lobby, remove player (or promote new host)
                if (room.hostId === player.id) {
                    const nextHost = room.players.find((p) => p && p.id !== player.id && !p.isAI);
                    if (nextHost) room.hostId = nextHost.id;
                }
                room.players[idx] = null;
                const remaining = room.players.filter((p) => p !== null && !p.isAI);
                if (remaining.length === 0) {
                    this.rooms.delete(room.code);
                    return;
                }
                this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
            } else {
                // In game: grant grace period then convert to bot
                this.broadcast(room.code, 'player_disconnected', {
                    p: idx,
                    name: player.name,
                    graceSeconds: DISCONNECT_GRACE_SEC,
                });

                const timeout = setTimeout(() => {
                    const r = this.rooms.get(room.code);
                    if (r && r.players[idx] && !r.players[idx]!.connected) {
                        r.players[idx]!.isAI = true;
                        r.players[idx]!.name = `${r.players[idx]!.name} (Bot)`;
                        this.broadcast(r.code, 'player_converted_to_bot', {
                            p: idx,
                            name: r.players[idx]!.name,
                        });
                        if (r.currentTurn === idx && r.phase === 'playing') {
                            this.scheduleBotTurn(r);
                        }
                    }
                }, DISCONNECT_GRACE_SEC * 1000);

                room.disconnectTimeouts.set(idx, timeout);
            }
        }
    }
}

export const roomManager = new RoomManager();
