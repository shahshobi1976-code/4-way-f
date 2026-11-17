import {
    legalMovesForTurn,
    newTokens,
    randDie,
    pickMove,
    hasWon,
    isLuckySum,
    luckySevenAllowed,
    evaluateCaptureObligation,
    offendingTokensForPenalty,
    type CaptureObligation,
    type Move,
    type Tokens,
} from '../src/game/rules';
import {
    generateGuestIdentity,
    hashToken,
    sanitizeDisplayName,
    recordMatchEnded,
    type PlayerRecordData,
    type SeatResultData,
} from './records';

export interface RoomPlayer {
    id: string; // publicPlayerId e.g. g_a1b2c3d4
    publicPlayerId: string;
    tokenHash: string; // SHA-256 hash of secret token (plain secret is NEVER stored in memory)
    name: string;
    avatar: string;
    socketId: string;
    ready: boolean;
    isReady?: boolean;
    isHost?: boolean;
    connected: boolean;
    disconnectTime?: number | null;
    isAI: boolean;
    wish?: [number, number] | null;
    wishUsed?: boolean;
    capturesMade: number;
    timesCaptured: number;
    penalties: number;
}

export interface ClientRoomPlayer {
    id: string;
    publicPlayerId: string;
    name: string;
    avatar: string;
    socketId: string;
    ready: boolean;
    isReady?: boolean;
    isHost?: boolean;
    connected: boolean;
    disconnectTime?: number | null;
    isAI: boolean;
    wish?: [number, number] | null;
    capturesMade: number;
    timesCaptured: number;
    penalties: number;
}

export interface ClientRoomState {
    code: string;
    hostId: string;
    phase: 'lobby' | 'playing' | 'game_over';
    fillBots: boolean;
    players: (ClientRoomPlayer | null)[];
    tokens: number[][];
    currentTurn: number;
    turnDeadline: number;
    dice: [number, number] | null;
    diceUsed: [boolean, boolean];
    winner: number | null;
    rankings: { playerIndex: number; name: string; avatar: string; rank: number }[];
    turnTimeSec?: number;
    maxPlayers?: number;
}

export interface Room {
    code: string;
    hostId: string;
    phase: 'lobby' | 'playing' | 'game_over';
    fillBots: boolean;
    turnTimeSec: number;
    maxPlayers: number;
    players: (RoomPlayer | null)[];
    tokens: Tokens;
    currentTurn: number;
    turnDeadline: number;
    dice: [number, number] | null;
    diceUsed: [boolean, boolean];
    winner: number | null;
    rankings: { playerIndex: number; name: string; avatar: string; rank: number }[];
    rematchVotes: Set<string>;
    startedAt?: number;
    endedAt?: number;
    matchEnded?: boolean;
    capturesMade: number[];
    timesCaptured: number[];
    penalties: number[];
    capturePromise: number;
    capturesTakenThisTurn: number;
    tokensCapturedThisTurn?: number[];
    turnObligation?: CaptureObligation;
    hadCaptureOrHomeThisTurn?: boolean;
    turnAutoPlay?: boolean;
    initialTurnTokens?: Tokens;
    turnTimeout?: NodeJS.Timeout | null;
    disconnectTimeouts: Map<number, NodeJS.Timeout>;
}

type BroadcastFn = (roomCode: string, event: string, payload: any) => void;

const DEFAULT_TURN_TIME_LIMIT_MS = 90000;
const DISCONNECT_GRACE_SEC = 60;
const BOT_NAMES = ['Nova Bot', 'Atlas Bot', 'Echo Bot', 'Titan Bot'];
const BOT_AVATARS = ['🤖', '🦁', '⚡', '👑'];

function calculateProgress(tokens: Tokens, p: number): number {
    const list = tokens[p] || [];
    let sum = 0;
    for (const t of list) {
        if (t === -1) sum += 0;
        else if (t >= 56) sum += 25;
        else sum += (t / 56) * 25;
    }
    return Math.min(100, Math.max(0, Math.round(sum * 100) / 100));
}

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
                          id: p.publicPlayerId,
                          publicPlayerId: p.publicPlayerId,
                          name: p.name,
                          avatar: p.avatar,
                          socketId: '',
                          ready: p.ready,
                          isReady: p.ready,
                          isHost: p.publicPlayerId === room.hostId,
                          connected: p.connected,
                          disconnectTime: p.disconnectTime,
                          isAI: p.isAI,
                          wish: p.wish || null,
                          capturesMade: p.capturesMade || 0,
                          timesCaptured: p.timesCaptured || 0,
                          penalties: p.penalties || 0,
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
            turnTimeSec: room.turnTimeSec ?? 90,
            maxPlayers: 4,
        };
    }

    public findPlayerByToken(room: Room, rawToken: string): { player: RoomPlayer; index: number } | null {
        if (!rawToken) return null;
        const hash = hashToken(rawToken);
        const idx = room.players.findIndex(
            (p) => p && (p.tokenHash === hash || p.tokenHash === rawToken || p.publicPlayerId === rawToken || p.id === rawToken)
        );
        if (idx === -1) return null;
        return { player: room.players[idx]!, index: idx };
    }

    public setPlayerWish(code: string, sessionToken: string, wish: [number, number] | null): boolean {
        const room = this.rooms.get(code);
        if (!room) return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found) return false;
        const player = found.player;
        if (wish) {
            const [a, b] = wish;
            if (a >= 1 && a <= 6 && b >= 1 && b <= 6 && !(a === 6 && b === 6)) {
                player.wish = [a, b];
            } else {
                player.wish = null;
            }
        } else {
            player.wish = null;
        }
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
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
        if (!room || room.phase !== 'lobby') return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found || found.player.publicPlayerId !== room.hostId) return false;
        room.turnTimeSec = turnTimeSec;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public createRoom(
        sessionToken: string | undefined,
        name: string,
        avatar: string,
        socketId: string,
        turnTimeSec = 90,
        maxPlayers = 4,
        ip = '127.0.0.1',
    ): {
        ok: boolean;
        roomCode?: string;
        playerIndex?: number;
        publicPlayerId?: string;
        secretSessionToken?: string;
        error?: string;
    } {
        let identity: { publicPlayerId: string; secretSessionToken: string; tokenHash: string };
        try {
            if (sessionToken && sessionToken.length >= 24) {
                identity = {
                    publicPlayerId: `g_${hashToken(sessionToken).slice(0, 8)}`,
                    secretSessionToken: sessionToken,
                    tokenHash: hashToken(sessionToken),
                };
            } else {
                identity = generateGuestIdentity(ip);
            }
        } catch (e: any) {
            return { ok: false, error: e.message };
        }

        const code = this.generateCode();
        const numSeats = 4;
        const sanitized = sanitizeDisplayName(name || 'Host', identity.publicPlayerId);

        const hostPlayer: RoomPlayer = {
            id: identity.publicPlayerId,
            publicPlayerId: identity.publicPlayerId,
            tokenHash: identity.tokenHash,
            name: sanitized,
            avatar: avatar || '🤴',
            socketId,
            ready: true,
            isReady: true,
            isHost: true,
            connected: true,
            disconnectTime: null,
            isAI: false,
            capturesMade: 0,
            timesCaptured: 0,
            penalties: 0,
        };

        const players: (RoomPlayer | null)[] = [hostPlayer, null, null, null];

        const room: Room = {
            code,
            hostId: identity.publicPlayerId,
            phase: 'lobby',
            fillBots: true,
            turnTimeSec: turnTimeSec !== undefined ? turnTimeSec : 90,
            maxPlayers: 4,
            players,
            tokens: newTokens(),
            currentTurn: 0,
            turnDeadline: 0,
            dice: null,
            diceUsed: [false, false],
            winner: null,
            rankings: [],
            rematchVotes: new Set(),
            disconnectTimeouts: new Map(),
            capturesMade: [0, 0, 0, 0],
            timesCaptured: [0, 0, 0, 0],
            penalties: [0, 0, 0, 0],
            capturePromise: 0,
            capturesTakenThisTurn: 0,
            turnAutoPlay: false,
        };

        this.rooms.set(code, room);
        return {
            ok: true,
            roomCode: code,
            playerIndex: 0,
            publicPlayerId: identity.publicPlayerId,
            secretSessionToken: identity.secretSessionToken,
        };
    }

    public joinRoom(
        code: string,
        sessionToken: string | undefined,
        name: string,
        avatar: string,
        socketId: string,
        ip = '127.0.0.1',
    ): {
        ok: boolean;
        playerIndex?: number;
        publicPlayerId?: string;
        secretSessionToken?: string;
        error?: string;
    } {
        const room = this.rooms.get(code);
        if (!room) return { ok: false, error: 'Room not found' };

        // Check if player is rejoining by token hash
        if (sessionToken) {
            const found = this.findPlayerByToken(room, sessionToken);
            if (found) {
                const player = found.player;
                player.socketId = socketId;
                player.connected = true;
                player.disconnectTime = null;
                if (avatar) player.avatar = avatar;

                const existingTimeout = room.disconnectTimeouts.get(found.index);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    room.disconnectTimeouts.delete(found.index);
                }

                this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
                return {
                    ok: true,
                    playerIndex: found.index,
                    publicPlayerId: player.publicPlayerId,
                    secretSessionToken: sessionToken,
                };
            }
        }

        if (room.phase !== 'lobby') {
            return { ok: false, error: 'Game already in progress' };
        }

        const openIdx = room.players.findIndex((p) => p === null);
        if (openIdx === -1) {
            return { ok: false, error: 'Room is full' };
        }

        let identity: { publicPlayerId: string; secretSessionToken: string; tokenHash: string };
        try {
            if (sessionToken && sessionToken.length >= 24) {
                identity = {
                    publicPlayerId: `g_${hashToken(sessionToken).slice(0, 8)}`,
                    secretSessionToken: sessionToken,
                    tokenHash: hashToken(sessionToken),
                };
            } else {
                identity = generateGuestIdentity(ip);
            }
        } catch (e: any) {
            return { ok: false, error: e.message };
        }

        const sanitized = sanitizeDisplayName(name || `Player ${openIdx + 1}`, identity.publicPlayerId);

        room.players[openIdx] = {
            id: identity.publicPlayerId,
            publicPlayerId: identity.publicPlayerId,
            tokenHash: identity.tokenHash,
            name: sanitized,
            avatar: avatar || '👑',
            socketId,
            ready: false,
            isReady: false,
            isHost: false,
            connected: true,
            disconnectTime: null,
            isAI: false,
            capturesMade: 0,
            timesCaptured: 0,
            penalties: 0,
        };

        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return {
            ok: true,
            playerIndex: openIdx,
            publicPlayerId: identity.publicPlayerId,
            secretSessionToken: identity.secretSessionToken,
        };
    }

    public reconnectPlayer(
        code: string,
        secretSessionToken: string,
        socketId: string,
    ): { ok: boolean; playerIndex?: number; publicPlayerId?: string; error?: string } {
        const room = this.rooms.get(code);
        if (!room) return { ok: false, error: 'Room not found' };
        const found = this.findPlayerByToken(room, secretSessionToken);
        if (!found) return { ok: false, error: 'Invalid session token' };

        const player = found.player;
        player.socketId = socketId;
        player.connected = true;
        player.disconnectTime = null;

        const existingTimeout = room.disconnectTimeouts.get(found.index);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            room.disconnectTimeouts.delete(found.index);
        }

        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return {
            ok: true,
            playerIndex: found.index,
            publicPlayerId: player.publicPlayerId,
        };
    }

    public toggleReady(code: string, sessionToken: string): boolean {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'lobby') return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found) return false;
        found.player.ready = !found.player.ready;
        found.player.isReady = found.player.ready;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public toggleFillBots(code: string, sessionToken: string, fillBots: boolean): boolean {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'lobby') return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found || found.player.publicPlayerId !== room.hostId) return false;
        room.fillBots = !!fillBots;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public startGame(code: string, sessionToken: string): { ok: boolean; error?: string } {
        const room = this.rooms.get(code);
        if (!room) return { ok: false, error: 'Room not found' };
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found || found.player.publicPlayerId !== room.hostId) {
            return { ok: false, error: 'Only host can start game' };
        }
        if (room.phase !== 'lobby') return { ok: false, error: 'Already playing' };

        const numSeats = 4;
        while (room.players.length < 4) {
            room.players.push(null);
        }
        for (let i = 0; i < numSeats; i++) {
            if (!room.players[i] && room.fillBots) {
                const botId = `g_bot_${i}_${Date.now().toString(36)}`;
                room.players[i] = {
                    id: botId,
                    publicPlayerId: botId,
                    tokenHash: '',
                    name: BOT_NAMES[i],
                    avatar: BOT_AVATARS[i],
                    socketId: '',
                    ready: true,
                    isReady: true,
                    isHost: false,
                    connected: true,
                    isAI: true,
                    capturesMade: 0,
                    timesCaptured: 0,
                    penalties: 0,
                };
            }
        }

        const activePlayersCount = room.players.filter((p) => p !== null).length;
        if (activePlayersCount < 2) {
            return { ok: false, error: 'Need at least 2 players or bots to start' };
        }

        room.phase = 'playing';
        room.startedAt = Date.now();
        room.endedAt = undefined;
        room.matchEnded = false;
        room.tokens = newTokens();
        room.currentTurn = 0;
        room.winner = null;
        room.rankings = [];
        room.dice = null;
        room.diceUsed = [false, false];
        room.capturesMade = [0, 0, 0, 0];
        room.timesCaptured = [0, 0, 0, 0];
        room.penalties = [0, 0, 0, 0];
        room.capturePromise = 0;
        room.capturesTakenThisTurn = 0;
        room.tokensCapturedThisTurn = [];
        room.turnObligation = undefined;
        room.hadCaptureOrHomeThisTurn = false;
        room.turnAutoPlay = false;
        room.initialTurnTokens = room.tokens.map((r) => r.slice());

        const turnLimitMs = this.getTurnLimitMs(room);
        room.turnDeadline = room.turnTimeSec > 0 ? Date.now() + turnLimitMs : 0;

        this.broadcast(room.code, 'game_started', this.getClientRoomState(room));
        this.startTurnTimer(room);

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

        const timeoutTurn = room.currentTurn;
        room.turnAutoPlay = true;
        room.turnDeadline = 0;

        // Case 1: Player timed out before rolling -> auto-roll and auto-play the token(s)
        if (room.dice === null) {
            const rollRes = this.rollDice(room.code, '', true);
            if (!rollRes.ok || !room.dice) return;

            const activeBools = room.players.map((p) => p !== null);
            const hasMoves =
                legalMovesForTurn(room.tokens, timeoutTurn, room.dice, room.diceUsed, activeBools).length > 0;

            if (hasMoves) {
                setTimeout(() => {
                    const r = this.rooms.get(code);
                    if (r && r.phase === 'playing' && r.currentTurn === timeoutTurn && r.turnAutoPlay && r.dice) {
                        this.executeBotMoves(r);
                    }
                }, 1800);
            }
            return;
        }

        // Case 2: Player already rolled and timed out before finishing moves -> auto-play remaining die(s)
        const activeBools = room.players.map((p) => p !== null);
        const hasRemainingMoves =
            (!room.diceUsed[0] || !room.diceUsed[1]) &&
            legalMovesForTurn(room.tokens, timeoutTurn, room.dice, room.diceUsed, activeBools).length > 0;

        if (hasRemainingMoves) {
            this.executeBotMoves(room);
            return;
        }

        // Fallback: no remaining legal moves -> check penalty and advance cleanly
        const penaltyApplied = this.checkAndApplyMissedCapturePenalty(room);
        const doubleSix = room.dice[0] === 6 && room.dice[1] === 6;
        const extraTurn = !penaltyApplied && (doubleSix || !!room.hadCaptureOrHomeThisTurn);
        room.dice = null;
        room.diceUsed = [true, true];

        setTimeout(() => {
            const r = this.rooms.get(code);
            if (r && r.phase === 'playing' && r.currentTurn === timeoutTurn) {
                this.advanceTurn(r, extraTurn);
            }
        }, penaltyApplied ? 1100 : 350);
    }

    public scheduleBotTurn(room: Room) {
        const turnPlayer = room.players[room.currentTurn];
        if (!turnPlayer || !turnPlayer.isAI || room.phase !== 'playing') return;
        const botTurnAtSchedule = room.currentTurn;

        setTimeout(() => {
            const r = this.rooms.get(room.code);
            if (!r || r.phase !== 'playing' || r.currentTurn !== botTurnAtSchedule) return;

            // If converted to bot mid-turn after already rolling dice, resume remaining die moves
            if (r.dice !== null && (!r.diceUsed[0] || !r.diceUsed[1])) {
                const activeBools = r.players.map((p) => p !== null);
                const hasRem =
                    legalMovesForTurn(r.tokens, r.currentTurn, r.dice, r.diceUsed, activeBools).length > 0;
                if (hasRem) {
                    this.executeBotMoves(r);
                } else {
                    const penaltyApplied = this.checkAndApplyMissedCapturePenalty(r);
                    const doubleSix = r.dice[0] === 6 && r.dice[1] === 6;
                    const extraTurn = !penaltyApplied && (doubleSix || !!r.hadCaptureOrHomeThisTurn);
                    this.advanceTurn(r, extraTurn);
                }
                return;
            }

            // 1. Roll dice for bot
            const rollRes = this.rollDice(r.code, '', true);
            if (!rollRes.ok) return;

            // Check if there are legal moves from this roll
            const activeBools = r.players.map((p) => p !== null);
            const hasMoves =
                !!r.dice &&
                legalMovesForTurn(r.tokens, r.currentTurn, r.dice, r.diceUsed, activeBools).length > 0;

            if (hasMoves) {
                // Wait 1800ms so connected human clients complete dice roll tumble before token moves
                setTimeout(() => {
                    const r2 = this.rooms.get(room.code);
                    if (r2 && r2.phase === 'playing' && r2.currentTurn === botTurnAtSchedule && r2.dice) {
                        this.executeBotMoves(r2);
                    }
                }, 1800);
            }
            // Note: When hasMoves is false, rollDice already schedules advanceTurn after 1800ms.
        }, 1200);
    }

    private executeBotMoves(room: Room) {
        if (room.phase !== 'playing' || !room.dice) return;
        const botIdx = room.currentTurn;
        const activeBools = room.players.map((p) => p !== null);

        const allMoves: Move[] = (!room.diceUsed[0] || !room.diceUsed[1])
            ? legalMovesForTurn(room.tokens, botIdx, room.dice, room.diceUsed, activeBools)
            : [];

        if (allMoves.length > 0) {
            // 1. Compulsory capture first (includes combined lone-token captures)
            const captureMoves = allMoves.filter((m) => m.captures.length > 0);
            let pool = captureMoves.length > 0 ? captureMoves : allMoves;

            // If required === 2 (multiple independent single-die captures) and both dice remain, prefer a first capture that leaves the 2nd capture available
            if (
                captureMoves.length > 1 &&
                (room.turnObligation?.required || 0) >= 2 &&
                !room.diceUsed[0] &&
                !room.diceUsed[1]
            ) {
                const keepSecondCapture = captureMoves.filter((m1) => {
                    if (m1.combined || m1.die === 2) return false;
                    const sim = room.tokens.map((row) => row.slice());
                    sim[botIdx][m1.tok] = m1.to;
                    for (const c of m1.captures) sim[c.p][c.t] = -1;
                    const nextUsed: [boolean, boolean] = [room.diceUsed[0], room.diceUsed[1]];
                    nextUsed[m1.die] = true;
                    return legalMovesForTurn(sim, botIdx, room.dice!, nextUsed, activeBools).some((m2) => m2.captures.length > 0);
                });
                if (keepSecondCapture.length > 0) {
                    pool = keepSecondCapture;
                }
            }

            // 2. If no direct capture and both dice are unused, look ahead for a 2-die combined or stack capture
            if (captureMoves.length === 0 && !room.diceUsed[0] && !room.diceUsed[1]) {
                const comboSetupMoves = allMoves.filter((m1) => {
                    if (m1.combined || m1.die === 2) return false;
                    const sim = room.tokens.map((row) => row.slice());
                    sim[botIdx][m1.tok] = m1.to;
                    const nextUsed: [boolean, boolean] = [room.diceUsed[0], room.diceUsed[1]];
                    nextUsed[m1.die] = true;
                    const nextMoves = legalMovesForTurn(sim, botIdx, room.dice!, nextUsed, activeBools);
                    return nextMoves.some((m2) => m2.captures.length > 0);
                });
                if (comboSetupMoves.length > 0) {
                    pool = comboSetupMoves;
                }
            }

            const chosen = pickMove(room.tokens, botIdx, pool, activeBools);
            if (chosen) {
                this.movePawn(room.code, '', chosen.die, chosen.tok, 'gul', true);
                return;
            }
        }

        // No legal moves left on remaining die(s)
        const penaltyApplied = this.checkAndApplyMissedCapturePenalty(room);
        const doubleSix = room.dice[0] === 6 && room.dice[1] === 6;
        const extraTurn = !penaltyApplied && (doubleSix || !!room.hadCaptureOrHomeThisTurn);
        setTimeout(() => {
            const r = this.rooms.get(room.code);
            if (r && r.phase === 'playing' && r.currentTurn === botIdx) {
                this.advanceTurn(r, extraTurn);
            }
        }, penaltyApplied ? 1100 : 800);
    }

    public rollDice(
        code: string,
        sessionToken: string,
        forced = false,
        useWish = false,
    ): { ok: boolean; dice?: [number, number] | null; lucky?: boolean; streakForfeited?: boolean; error?: string } {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'playing') return { ok: false, error: 'Not in playing phase' };

        const curPlayer = room.players[room.currentTurn];
        if (!curPlayer) return { ok: false, error: 'No player at current turn' };
        if (!forced) {
            const found = this.findPlayerByToken(room, sessionToken);
            if (!found || found.index !== room.currentTurn || room.turnAutoPlay) {
                return { ok: false, error: room.turnAutoPlay ? 'Turn timed out, auto-playing' : 'Not your turn' };
            }
        }
        if (room.dice !== null) {
            if (!room.diceUsed[0] || !room.diceUsed[1]) {
                return { ok: false, error: 'Dice already rolled this turn' };
            }
            room.dice = null;
        }

        let d1 = randDie();
        let d2 = randDie();

        // Check if player requested to use their Lucky Wish
        if (useWish && curPlayer.wish && !curPlayer.wishUsed) {
            d1 = curPlayer.wish[0];
            d2 = curPlayer.wish[1];
            curPlayer.wishUsed = true;
        }

        const lucky = isLuckySum(d1, d2) && luckySevenAllowed(room.tokens, room.currentTurn);
        if (lucky) {
            d1 = 6;
            d2 = 6;
        }

        room.dice = [d1, d2];
        room.diceUsed = [false, false];
        room.initialTurnTokens = room.tokens.map((r) => r.slice());
        room.capturesTakenThisTurn = 0;
        room.tokensCapturedThisTurn = [];
        room.hadCaptureOrHomeThisTurn = false;

        const activeBools = room.players.map((p) => p !== null);
        room.turnObligation = evaluateCaptureObligation(room.tokens, room.currentTurn, [d1, d2], activeBools);
        room.capturePromise = room.turnObligation.required;

        const doubleSix = d1 === 6 && d2 === 6;
        const streakForfeited = false;
        const movableTokens: { tok: number; die: number }[] = [];

        const moves = legalMovesForTurn(room.tokens, room.currentTurn, room.dice, room.diceUsed, activeBools);
        for (const m of moves) movableTokens.push({ tok: m.tok, die: m.die });

        this.broadcast(room.code, 'dice_rolled', {
            p: room.currentTurn,
            dice: room.dice,
            lucky,
            movableTokens,
            streakForfeited,
        });

        const rollTurnAtSchedule = room.currentTurn;
        if (movableTokens.length === 0) {
            setTimeout(() => {
                const r = this.rooms.get(room.code);
                if (r && r.phase === 'playing' && r.currentTurn === rollTurnAtSchedule) {
                    this.advanceTurn(r, doubleSix);
                }
            }, 1800);
        }

        return { ok: true, dice: room.dice, lucky, streakForfeited };
    }

    public checkAndApplyMissedCapturePenalty(room: Room): boolean {
        const p = room.currentTurn;
        const activeBools = room.players.map((pl) => pl !== null);
        const obligation = room.turnObligation
            || evaluateCaptureObligation(room.initialTurnTokens || room.tokens, p, room.dice || [], activeBools);
        const required = obligation.required;
        const taken = room.capturesTakenThisTurn || 0;

        if (required > 0 && taken < required) {
            const offending = offendingTokensForPenalty(
                obligation,
                room.tokens,
                p,
                new Set(room.tokensCapturedThisTurn || []),
            );
            if (offending.length > 0) {
                for (const tok of offending) {
                    room.tokens[p][tok] = -1;
                }
                room.penalties[p] = (room.penalties[p] || 0) + offending.length;
                if (room.players[p]) {
                    room.players[p]!.penalties = room.penalties[p];
                }
                this.broadcast(room.code, 'penalty_applied', {
                    p,
                    tokenIndex: offending[0],
                    tokenIndices: offending,
                    penalties: room.penalties[p],
                    reason: 'missed_capture',
                });
                room.capturePromise = 0;
                room.turnObligation = undefined;
                return true;
            }
        }
        room.capturePromise = 0;
        room.turnObligation = undefined;
        return false;
    }

    public movePawn(
        code: string,
        sessionToken: string,
        dieIndex: number,
        tokenIndex: number,
        action: 'gul' | 'pass' = 'gul',
        forced = false,
    ): { ok: boolean; error?: string } {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'playing') return { ok: false, error: 'Not playing' };
        const curPlayer = room.players[room.currentTurn];
        if (!curPlayer) return { ok: false, error: 'No player' };

        if (!forced) {
            const found = this.findPlayerByToken(room, sessionToken);
            if (!found || found.index !== room.currentTurn || curPlayer.isAI || room.turnAutoPlay) {
                return { ok: false, error: room.turnAutoPlay ? 'Turn timed out, auto-playing' : 'Not your turn' };
            }
        }
        if (!room.dice) return { ok: false, error: 'Dice not rolled' };
        if (dieIndex === 2) {
            if (room.diceUsed[0] || room.diceUsed[1]) return { ok: false, error: 'Die already used' };
        } else if (dieIndex === 0 || dieIndex === 1) {
            if (room.diceUsed[dieIndex]) return { ok: false, error: 'Die already used' };
        } else {
            return { ok: false, error: 'Invalid die index' };
        }

        const activeBools = room.players.map((p) => p !== null);
        const legal = legalMovesForTurn(room.tokens, room.currentTurn, room.dice, room.diceUsed, activeBools);
        const move = legal.find((m) => m.die === dieIndex && m.tok === tokenIndex);
        if (!move) return { ok: false, error: 'Illegal move' };

        if (action === 'pass') {
            if (move.to !== 56) {
                return { ok: false, error: 'Cannot pass non-home move' };
            }
            if (dieIndex === 2) room.diceUsed = [true, true];
            else room.diceUsed[dieIndex] = true;

            this.broadcast(room.code, 'pawn_moved', {
                p: room.currentTurn,
                dieIndex,
                tokenIndex,
                to: room.tokens[room.currentTurn][tokenIndex],
                captures: [],
                reachedHome: false,
                diceUsed: room.diceUsed,
                passed: true,
            });

            const remPassMoves = (!room.diceUsed[0] || !room.diceUsed[1])
                ? legalMovesForTurn(room.tokens, room.currentTurn, room.dice, room.diceUsed, activeBools)
                : [];
            const canPlayOther = remPassMoves.length > 0;
            if (!canPlayOther) room.diceUsed = [true, true];

            const passTurnAtSchedule = room.currentTurn;
            if (!canPlayOther) {
                const penaltyApplied = this.checkAndApplyMissedCapturePenalty(room);
                const doubleSix = room.dice[0] === 6 && room.dice[1] === 6;
                const extraTurn = !penaltyApplied && (doubleSix || !!room.hadCaptureOrHomeThisTurn);
                setTimeout(() => {
                    const r = this.rooms.get(code);
                    if (r && r.phase === 'playing' && r.currentTurn === passTurnAtSchedule) {
                        this.advanceTurn(r, extraTurn);
                    }
                }, penaltyApplied ? 1100 : 450);
            } else if (curPlayer.isAI || room.turnAutoPlay) {
                setTimeout(() => {
                    const r = this.rooms.get(code);
                    if (r && r.phase === 'playing' && r.currentTurn === passTurnAtSchedule) {
                        this.executeBotMoves(r);
                    }
                }, 1400);
            }
            return { ok: true };
        }

        room.tokens[room.currentTurn][tokenIndex] = move.to;
        if (dieIndex === 2) room.diceUsed = [true, true];
        else room.diceUsed[dieIndex] = true;

        if (move.captures.length > 0) {
            room.capturesTakenThisTurn = (room.capturesTakenThisTurn || 0) + 1;
            if (!room.tokensCapturedThisTurn) room.tokensCapturedThisTurn = [];
            if (!room.tokensCapturedThisTurn.includes(tokenIndex)) {
                room.tokensCapturedThisTurn.push(tokenIndex);
            }
        }
        for (const cap of move.captures) {
            room.tokens[cap.p][cap.t] = -1;
            room.capturesMade[room.currentTurn] = (room.capturesMade[room.currentTurn] || 0) + 1;
            room.timesCaptured[cap.p] = (room.timesCaptured[cap.p] || 0) + 1;
        }

        const reachedHome = move.to === 56;

        this.broadcast(room.code, 'pawn_moved', {
            p: room.currentTurn,
            dieIndex,
            tokenIndex,
            to: move.to,
            captures: move.captures,
            reachedHome,
            diceUsed: room.diceUsed,
            passed: false,
        });

        if (hasWon(room.tokens, room.currentTurn)) {
            room.winner = room.currentTurn;
            if (room.turnTimeout) clearTimeout(room.turnTimeout);
            void this.endMatchAndRecord(room.code, room.players[0]?.tokenHash || '', '127.0.0.1');
            return { ok: true };
        }

        if (move.captures.length > 0 || reachedHome) {
            room.hadCaptureOrHomeThisTurn = true;
        }

        const remMoves = (!room.diceUsed[0] || !room.diceUsed[1])
            ? legalMovesForTurn(room.tokens, room.currentTurn, room.dice, room.diceUsed, activeBools)
            : [];
        const canPlayOther = remMoves.length > 0;
        if (!canPlayOther) room.diceUsed = [true, true];

        const moveTurnAtSchedule = room.currentTurn;
        if (!canPlayOther) {
            const penaltyApplied = this.checkAndApplyMissedCapturePenalty(room);
            const doubleSix = room.dice[0] === 6 && room.dice[1] === 6;
            const extraTurn = !penaltyApplied && (doubleSix || !!room.hadCaptureOrHomeThisTurn);
            setTimeout(() => {
                const r = this.rooms.get(code);
                if (r && r.phase === 'playing' && r.currentTurn === moveTurnAtSchedule) {
                    this.advanceTurn(r, extraTurn);
                }
            }, penaltyApplied ? 1100 : 450);
        } else if (curPlayer.isAI || room.turnAutoPlay) {
            // Bot or timed-out auto-play has a second die to move: wait for the first hop animation, then execute
            setTimeout(() => {
                const r = this.rooms.get(code);
                if (r && r.phase === 'playing' && r.currentTurn === moveTurnAtSchedule) {
                    this.executeBotMoves(r);
                }
            }, 1400);
        }

        return { ok: true };
    }

    private advanceTurn(room: Room, extraTurn: boolean) {
        if (room.phase !== 'playing') return;
        if (room.turnTimeout) clearTimeout(room.turnTimeout);

        room.turnAutoPlay = false;
        if (!extraTurn) {
            const numSeats = room.maxPlayers || room.players.length || 4;
            let next = (room.currentTurn + 1) % numSeats;
            while (room.players[next] === null) {
                next = (next + 1) % numSeats;
            }
            room.currentTurn = next;
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
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found) return false;
        const player = found.player;

        this.broadcast(room.code, 'chat_received', {
            p: found.index,
            name: player.name,
            avatar: player.avatar,
            text: (text || '').slice(0, 80),
            emoji,
            time: Date.now(),
        });
        return true;
    }

    public voteRematch(code: string, sessionToken: string): { ok: boolean } {
        const room = this.rooms.get(code);
        if (!room || room.phase !== 'game_over') return { ok: false };

        const found = this.findPlayerByToken(room, sessionToken);
        if (!found) return { ok: false };

        room.rematchVotes.add(found.player.publicPlayerId);
        const humanCount = room.players.filter((p) => p && !p.isAI).length;

        if (room.rematchVotes.size >= Math.max(1, humanCount)) {
            room.phase = 'playing';
            room.startedAt = Date.now();
            room.endedAt = undefined;
            room.matchEnded = false;
            room.tokens = newTokens();
            room.winner = null;
            room.rankings = [];
            room.dice = null;
            room.diceUsed = [false, false];
            room.rematchVotes.clear();
            room.currentTurn = 0;
            for (const p of room.players) if (p) p.wishUsed = false;
            room.capturesMade = [0, 0, 0, 0];
            room.timesCaptured = [0, 0, 0, 0];
            room.penalties = [0, 0, 0, 0];
            room.capturePromise = 0;
            room.capturesTakenThisTurn = 0;
            room.tokensCapturedThisTurn = [];
            room.turnObligation = undefined;
            room.hadCaptureOrHomeThisTurn = false;
            room.turnAutoPlay = false;
            room.initialTurnTokens = room.tokens.map((r) => r.slice());

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

    // Step 6: Strict validation and async recording in game4 schema
    public async endMatchAndRecord(
        code: string,
        callerSessionToken: string,
        ip = '127.0.0.1',
    ): Promise<{ ok: boolean; matchId?: string; error?: string }> {
        const room = this.rooms.get(code);
        if (!room) return { ok: false, error: 'Room not found' };

        const hostPlayer = room.players[0];
        if (!hostPlayer) return { ok: false, error: 'No host player in room' };

        // Verify caller is seat 0 (or internal game won trigger)
        if (callerSessionToken) {
            const found = this.findPlayerByToken(room, callerSessionToken);
            if (!found || found.index !== 0) {
                return { ok: false, error: 'Only host (seat 0) can end and record match' };
            }
        }

        if (!room.startedAt) {
            return { ok: false, error: 'Match was not started' };
        }

        if (room.matchEnded) {
            return { ok: false, error: 'Match already ended and recorded' };
        }

        room.endedAt = Date.now();
        room.phase = 'game_over';

        // Calculate rankings: Winner gets rank 1, remaining sorted by token progress
        const activeSeats = room.players
            .map((p, idx) => ({ player: p, seat: idx }))
            .filter((item): item is { player: RoomPlayer; seat: number } => item.player !== null);

        const winnerSeat = room.winner !== null ? room.winner : 0;
        const nonWinners = activeSeats
            .filter((item) => item.seat !== winnerSeat)
            .sort((a, b) => {
                const progA = calculateProgress(room.tokens, a.seat);
                const progB = calculateProgress(room.tokens, b.seat);
                return progB - progA;
            });

        const rankedSeats = [activeSeats.find((item) => item.seat === winnerSeat)!, ...nonWinners];

        const rankings = rankedSeats.map((item, rIdx) => ({
            playerIndex: item.seat,
            name: item.player.name,
            avatar: item.player.avatar,
            rank: rIdx + 1,
        }));

        room.rankings = rankings;

        const results: SeatResultData[] = rankedSeats.map((item, rIdx) => ({
            playerId: item.player.publicPlayerId,
            seat: item.seat,
            rank: rIdx + 1,
            progress_percent: calculateProgress(room.tokens, item.seat),
            captures_made: room.capturesMade[item.seat] || 0,
            times_captured: room.timesCaptured[item.seat] || 0,
            penalties: room.penalties[item.seat] || 0,
        }));

        const playerData: PlayerRecordData[] = activeSeats.map((item) => ({
            publicPlayerId: item.player.publicPlayerId,
            displayName: item.player.name,
            name: item.player.name,
            isAI: item.player.isAI,
            tokenHash: item.player.tokenHash,
        }));

        room.matchEnded = true;
        this.broadcast(room.code, 'game_over', { winner: room.winner, rankings: room.rankings });

        // Non-blocking async record
        let recordRes: any = { ok: true };
        try {
            recordRes = await recordMatchEnded({
                roomCode: room.code,
                startedAt: room.startedAt,
                endedAt: room.endedAt,
                callerSeat: 0,
                roomStarted: true,
                alreadyEnded: false,
                players: playerData,
                results,
                ip,
            });
        } catch (e: any) {
            console.warn('[Records] Non-blocking match record note:', e?.message);
        }
        return { ok: true, matchId: recordRes?.matchId };
    }

    public leaveRoom(code: string, sessionToken: string): boolean {
        const room = this.rooms.get(code);
        if (!room) return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found) return false;

        const idx = found.index;
        const player = found.player;
        const timeout = room.disconnectTimeouts.get(idx);
        if (timeout) {
            clearTimeout(timeout);
            room.disconnectTimeouts.delete(idx);
        }

        if (room.phase === 'lobby') {
            if (room.hostId === player.publicPlayerId) {
                const nextHost = room.players.find((p) => p && p.publicPlayerId !== player.publicPlayerId && !p.isAI);
                if (nextHost) room.hostId = nextHost.publicPlayerId;
            }
            room.players[idx] = null;
            const remaining = room.players.filter((p) => p !== null && !p.isAI);
            if (remaining.length === 0) {
                this.rooms.delete(room.code);
                return true;
            }
            this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        } else {
            player.isAI = true;
            player.name = `${player.name} (Bot)`;
            player.connected = false;
            this.broadcast(room.code, 'player_converted_to_bot', { p: idx, name: player.name });
            if (room.currentTurn === idx && room.phase === 'playing') {
                this.scheduleBotTurn(room);
            }
        }
        return true;
    }

    public handleSocketDisconnect(socketId: string) {
        for (const room of this.rooms.values()) {
            const idx = room.players.findIndex((p) => p && p.socketId === socketId);
            if (idx === -1) continue;

            const player = room.players[idx]!;
            player.connected = false;
            player.disconnectTime = Date.now();

            if (room.phase === 'lobby') {
                this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));

                // 45-second grace period for lobby to prevent instant kick on brief network/tab switch
                const timeout = setTimeout(() => {
                    const r = this.rooms.get(room.code);
                    if (r && r.phase === 'lobby' && r.players[idx] && !r.players[idx]!.connected) {
                        if (r.hostId === r.players[idx]!.publicPlayerId) {
                            const nextHost = r.players.find((p) => p && p.publicPlayerId !== r.players[idx]!.publicPlayerId && !p.isAI);
                            if (nextHost) r.hostId = nextHost.publicPlayerId;
                        }
                        r.players[idx] = null;
                        r.disconnectTimeouts.delete(idx);
                        const remaining = r.players.filter((p) => p !== null && !p.isAI);
                        if (remaining.length === 0) {
                            this.rooms.delete(r.code);
                            return;
                        }
                        this.broadcast(r.code, 'room_updated', this.getClientRoomState(r));
                    }
                }, 45000);

                room.disconnectTimeouts.set(idx, timeout);
            } else {
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
