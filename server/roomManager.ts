import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    legalMovesForTurn,
    newTokens,
    randDie,
    pickMove,
    pickBestAIMove,
    hasWon,
    coloredPathStartIndex,
    isLuckySum,
    luckySevenAllowed,
    evaluateCaptureObligation,
    offendingTokensForPenalty,
    pickObligationAwarePool,
    LAST_TRACK,
    PATH_START,
    globalIdx,
    evaluateRivalryState,
    createEmptyGrudges,
    recordCaptureGrudge,
    decrementSeatGrudge,
    type GrudgeEntry,
    type CaptureObligation,
    type Move,
    type Tokens,
} from '../src/game/rules';
import {
    pickBanterIndex,
    pickRivalryCalloutIndex,
    AI_PERSONALITIES,
    getPersonalityForSeat,
    normalizeAIPersonality,
    HIGH_PRIORITY_BANTER_EVENTS,
    BANTER_ROUTINE_COOLDOWN_MS,
    BANTER_HIGH_PRIORITY_COOLDOWN_MS,
    type AIPersonality,
    type BanterEvent,
    type RivalryCalloutKind,
} from '../src/game/banter';
import {
    generateGuestIdentity,
    getRecordsConfig,
    hashToken,
    maskProfanity,
    sanitizeDisplayName,
    recordMatchEnded,
    type PlayerRecordData,
    type SeatResultData,
} from './supabaseRecords';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_FILE = path.resolve(__dirname, '../tmp/ludo-rooms-snapshot.json');

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
    personality?: AIPersonality;
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
    personality?: AIPersonality;
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
    botPersonalities?: AIPersonality[];
    tokens: number[][];
    currentTurn: number;
    turnDeadline: number;
    dice: [number, number] | null;
    diceUsed: [boolean, boolean];
    winner: number | null;
    rankings: { playerIndex: number; name: string; avatar: string; rank: number; progress?: number }[];
    turnTimeSec?: number;
    maxPlayers?: number;
    secretWhispers?: boolean;
    messageCount?: number;
}

export interface Room {
    code: string;
    hostId: string;
    phase: 'lobby' | 'playing' | 'game_over';
    fillBots: boolean;
    turnTimeSec: number;
    maxPlayers: number;
    secretWhispers: boolean;
    messageCount: number;
    players: (RoomPlayer | null)[];
    botPersonalities: AIPersonality[];
    tokens: Tokens;
    currentTurn: number;
    turnDeadline: number;
    dice: [number, number] | null;
    diceUsed: [boolean, boolean];
    winner: number | null;
    rankings: { playerIndex: number; name: string; avatar: string; rank: number; progress?: number }[];
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
    turnMovedToSquare?: Record<number, string>;
    turnObligation?: CaptureObligation;
    hadCaptureOrHomeThisTurn?: boolean;
    turnAutoPlay?: boolean;
    initialTurnTokens?: Tokens;
    grudges: (GrudgeEntry | null)[];
    dethroneAlertedLeaders: Set<number>;
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
    const winTarget = coloredPathStartIndex(p);
    let sum = 0;
    for (const t of list) {
        if (t === -1) sum += 0;
        else if (t >= winTarget) sum += 25;
        else sum += (t / winTarget) * 25;
    }
    return Math.min(100, Math.max(0, Math.round(sum * 100) / 100));
}

const MAX_ROOMS_IN_MEMORY = 500;
const MAX_ROOM_CREATES_PER_MIN = 6;
const MAX_ROOM_JOINS_PER_MIN = 12;
const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

class RoomManager {
    private rooms = new Map<string, Room>();
    private broadcast: BroadcastFn = () => {};
    private roomCreateWindows = new Map<string, number[]>();
    private roomJoinWindows = new Map<string, number[]>();
    private socialCooldowns = new Map<string, number>();
    private snapshotTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.restoreFromSnapshot();
    }

    public setBroadcastCallback(cb: BroadcastFn) {
        this.broadcast = cb;
    }

    private checkSlidingRateLimit(storeMap: Map<string, number[]>, ip: string, limit: number, windowMs: number): boolean {
        const now = Date.now();
        const key = ip || '127.0.0.1';
        const recent = (storeMap.get(key) || []).filter((t) => now - t < windowMs);
        if (recent.length >= limit) {
            storeMap.set(key, recent);
            return false;
        }
        recent.push(now);
        storeMap.set(key, recent);
        if (storeMap.size > 2000) {
            for (const [k, v] of storeMap.entries()) {
                if (v.every((t) => now - t >= windowMs)) storeMap.delete(k);
            }
        }
        return true;
    }

    private aiBanterCooldowns = new Map<string, number>();

    private emitAiBanter(room: Room, seatIndex: number, event: BanterEvent, vars?: Record<string, string>) {
        const player = room.players[seatIndex];
        if (!player || !player.isAI) return;
        const now = Date.now();
        const isHigh = HIGH_PRIORITY_BANTER_EVENTS.has(event);
        const minGap = isHigh ? BANTER_HIGH_PRIORITY_COOLDOWN_MS : BANTER_ROUTINE_COOLDOWN_MS;
        const key = `${room.code}:${seatIndex}`;
        const prev = this.aiBanterCooldowns.get(key) || 0;
        if (!isHigh && now - prev < minGap) return;
        if (isHigh && now - prev < minGap) return;
        this.aiBanterCooldowns.set(key, now);
        const seatPersonality = player.personality || room.botPersonalities?.[seatIndex] || getPersonalityForSeat(seatIndex);
        const { lineIdx, personality } = pickBanterIndex(event, seatIndex, seatPersonality);
        this.broadcast(room.code, 'ai_banter', {
            seatIndex,
            event,
            personality,
            lineIdx,
            vars,
            timestamp: now,
        });
    }

    private emitRivalryEvent(
        room: Room,
        kind: RivalryCalloutKind,
        actorSeat: number,
        targetSeat: number,
        leaderPct: number,
    ) {
        const speakerSeat =
            actorSeat >= 0 && room.players[actorSeat]?.isAI
                ? actorSeat
                : room.players.findIndex((p, s) => s !== targetSeat && !!p?.isAI);
        const speakerPersonality =
            speakerSeat >= 0
                ? room.players[speakerSeat]?.personality || room.botPersonalities?.[speakerSeat] || getPersonalityForSeat(speakerSeat)
                : 'Strategist';
        const lineIdx = pickRivalryCalloutIndex(speakerPersonality, kind);
        this.broadcast(room.code, 'ludo:rivalry_event', {
            kind,
            actorSeat,
            targetSeat,
            leaderPct: Math.round(leaderPct),
            lineIdx,
        });
    }

    private serializeRoom(room: Room) {
        return {
            code: room.code,
            hostId: room.hostId,
            phase: room.phase,
            fillBots: room.fillBots,
            turnTimeSec: room.turnTimeSec,
            maxPlayers: room.maxPlayers,
            secretWhispers: room.secretWhispers,
            messageCount: room.messageCount,
            players: room.players,
            botPersonalities: room.botPersonalities,
            tokens: room.tokens,
            currentTurn: room.currentTurn,
            turnDeadline: room.turnDeadline,
            dice: room.dice,
            diceUsed: room.diceUsed,
            winner: room.winner,
            rankings: room.rankings,
            rematchVotes: Array.from(room.rematchVotes),
            startedAt: room.startedAt,
            endedAt: room.endedAt,
            matchEnded: room.matchEnded,
            capturesMade: room.capturesMade,
            timesCaptured: room.timesCaptured,
            penalties: room.penalties,
            capturePromise: room.capturePromise,
            capturesTakenThisTurn: room.capturesTakenThisTurn,
            tokensCapturedThisTurn: room.tokensCapturedThisTurn,
            turnMovedToSquare: room.turnMovedToSquare,
            turnObligation: room.turnObligation,
            hadCaptureOrHomeThisTurn: room.hadCaptureOrHomeThisTurn,
            turnAutoPlay: room.turnAutoPlay,
            initialTurnTokens: room.initialTurnTokens,
            grudges: room.grudges,
            dethroneAlertedLeaders: Array.from(room.dethroneAlertedLeaders || []),
            savedAt: Date.now(),
        };
    }

    private scheduleSnapshotSave() {
        if (this.snapshotTimer) return;
        this.snapshotTimer = setTimeout(() => {
            this.snapshotTimer = null;
            this.saveSnapshotSync();
        }, 2500);
        this.snapshotTimer.unref?.();
    }

    public saveSnapshotSync() {
        try {
            const dir = path.dirname(SNAPSHOT_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const payload = {
                savedAt: Date.now(),
                rooms: Array.from(this.rooms.values()).map((r) => this.serializeRoom(r)),
            };
            const tmpFile = `${SNAPSHOT_FILE}.tmp`;
            fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf8');
            fs.renameSync(tmpFile, SNAPSHOT_FILE);
        } catch (err: any) {
            console.warn('[RoomManager] Snapshot write skipped:', err?.message);
        }
    }

    private restoreFromSnapshot() {
        try {
            if (!fs.existsSync(SNAPSHOT_FILE)) return;
            const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            const now = Date.now();
            if (!parsed?.rooms || !Array.isArray(parsed.rooms)) return;
            if (parsed.savedAt && now - parsed.savedAt > SNAPSHOT_MAX_AGE_MS) return;

            for (const item of parsed.rooms) {
                if (!item?.code || (item.savedAt && now - item.savedAt > SNAPSHOT_MAX_AGE_MS)) continue;
                const players: (RoomPlayer | null)[] = Array.isArray(item.players)
                    ? item.players.map((p: any) =>
                          p
                              ? {
                                    ...p,
                                    socketId: '',
                                    connected: !!p.isAI,
                                    disconnectTime: p.isAI ? null : now,
                                }
                              : null
                      )
                    : [null, null, null, null];

                const room: Room = {
                    code: item.code,
                    hostId: item.hostId,
                    phase: item.phase || 'lobby',
                    fillBots: item.fillBots !== undefined ? !!item.fillBots : true,
                    turnTimeSec: item.turnTimeSec ?? 90,
                    maxPlayers: item.maxPlayers ?? 4,
                    secretWhispers: !!item.secretWhispers,
                    messageCount: Number(item.messageCount) || 0,
                    players,
                    botPersonalities: Array.isArray(item.botPersonalities) && item.botPersonalities.length === 4
                        ? item.botPersonalities.map((bp: unknown, sIdx: number) => normalizeAIPersonality(bp, sIdx))
                        : AI_PERSONALITIES.slice(),
                    tokens: item.tokens || newTokens(),
                    currentTurn: item.currentTurn ?? 0,
                    turnDeadline: 0,
                    dice: item.dice || null,
                    diceUsed: item.diceUsed || [false, false],
                    winner: item.winner ?? null,
                    rankings: Array.isArray(item.rankings) ? item.rankings : [],
                    rematchVotes: new Set(Array.isArray(item.rematchVotes) ? item.rematchVotes : []),
                    startedAt: item.startedAt,
                    endedAt: item.endedAt,
                    matchEnded: item.matchEnded,
                    capturesMade: item.capturesMade || [0, 0, 0, 0],
                    timesCaptured: item.timesCaptured || [0, 0, 0, 0],
                    penalties: item.penalties || [0, 0, 0, 0],
                    capturePromise: item.capturePromise || 0,
                    capturesTakenThisTurn: item.capturesTakenThisTurn || 0,
                    tokensCapturedThisTurn: item.tokensCapturedThisTurn || [],
                    turnMovedToSquare: item.turnMovedToSquare || {},
                    turnObligation: item.turnObligation,
                    hadCaptureOrHomeThisTurn: item.hadCaptureOrHomeThisTurn,
                    turnAutoPlay: false,
                    initialTurnTokens: item.initialTurnTokens,
                    grudges: Array.isArray(item.grudges) && item.grudges.length === 4 ? item.grudges : createEmptyGrudges(),
                    dethroneAlertedLeaders: new Set(Array.isArray(item.dethroneAlertedLeaders) ? item.dethroneAlertedLeaders : []),
                    disconnectTimeouts: new Map(),
                };
                this.rooms.set(room.code, room);
            }
            if (this.rooms.size > 0) {
                console.log(`[RoomManager] Restored ${this.rooms.size} room(s) from snapshot`);
            }
        } catch (err: any) {
            console.warn('[RoomManager] Could not restore snapshot:', err?.message);
        }
    }

    public shutdown() {
        if (this.snapshotTimer) {
            clearTimeout(this.snapshotTimer);
            this.snapshotTimer = null;
        }
        this.saveSnapshotSync();
    }

    private reassignHostIfNeeded(room: Room, leavingPlayerId: string) {
        if (room.hostId !== leavingPlayerId) return;
        const nextHuman =
            room.players.find((p) => p && p.publicPlayerId !== leavingPlayerId && !p.isAI && p.connected) ||
            room.players.find((p) => p && p.publicPlayerId !== leavingPlayerId && !p.isAI);
        if (nextHuman) {
            room.hostId = nextHuman.publicPlayerId;
            for (const p of room.players) {
                if (p) p.isHost = p.publicPlayerId === room.hostId;
            }
        }
    }

    private normalizeCode(code: unknown): string {
        return String(code || '').trim().toUpperCase();
    }

    public getRoom(code: string): Room | undefined {
        const clean = this.normalizeCode(code);
        if (!clean) return undefined;
        return this.rooms.get(clean);
    }

    public getClientRoomState(room: Room): ClientRoomState {
        return {
            code: room.code,
            hostId: room.hostId,
            phase: room.phase,
            fillBots: room.fillBots,
            players: room.players.map((p, seatIdx) =>
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
                          personality: p.personality || room.botPersonalities?.[seatIdx] || getPersonalityForSeat(seatIdx),
                          wish: p.wish || null,
                          capturesMade: p.capturesMade || 0,
                          timesCaptured: p.timesCaptured || 0,
                          penalties: p.penalties || 0,
                      }
                    : null,
            ),
            botPersonalities: room.botPersonalities || AI_PERSONALITIES.slice(),
            tokens: room.tokens,
            currentTurn: room.currentTurn,
            turnDeadline: room.turnDeadline,
            dice: room.dice,
            diceUsed: room.diceUsed,
            winner: room.winner,
            rankings: room.rankings,
            turnTimeSec: room.turnTimeSec ?? 90,
            maxPlayers: 4,
            secretWhispers: !!room.secretWhispers,
            messageCount: room.messageCount || 0,
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
        const room = this.getRoom(code);
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

    public generateRoomCode(): string {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for (let attempt = 0; attempt < 20; attempt++) {
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += alphabet[crypto.randomInt(0, alphabet.length)];
            }
            if (!this.rooms.has(code)) return code;
        }
        return crypto.randomBytes(3).toString('hex').toUpperCase();
    }

    public getTurnLimitMs(room: Room): number {
        return (room.turnTimeSec ?? 90) * 1000;
    }

    public setTurnTime(code: string, sessionToken: string, turnTimeSec: number): boolean {
        const room = this.getRoom(code);
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
        if (!this.checkSlidingRateLimit(this.roomCreateWindows, ip, MAX_ROOM_CREATES_PER_MIN, 60 * 1000)) {
            return { ok: false, error: 'Too many rooms created from this IP. Please wait a moment.' };
        }
        if (this.rooms.size >= MAX_ROOMS_IN_MEMORY) {
            return { ok: false, error: 'Server room capacity reached. Please try again shortly.' };
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

        const code = this.generateRoomCode();
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
            secretWhispers: false,
            messageCount: 0,
            players,
            botPersonalities: AI_PERSONALITIES.slice(),
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
            grudges: createEmptyGrudges(),
            dethroneAlertedLeaders: new Set(),
        };

        this.rooms.set(code, room);
        this.scheduleSnapshotSave();
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
        roomCode?: string;
        playerIndex?: number;
        publicPlayerId?: string;
        secretSessionToken?: string;
        error?: string;
    } {
        if (!this.checkSlidingRateLimit(this.roomJoinWindows, ip, MAX_ROOM_JOINS_PER_MIN, 60 * 1000)) {
            return { ok: false, error: 'Too many join attempts. Please slow down.' };
        }
        const cleanCode = this.normalizeCode(code);
        if (!cleanCode) return { ok: false, error: 'Invalid room code' };
        const room = this.rooms.get(cleanCode);
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
                    roomCode: room.code,
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
            roomCode: room.code,
            playerIndex: openIdx,
            publicPlayerId: identity.publicPlayerId,
            secretSessionToken: identity.secretSessionToken,
        };
    }

    public reconnectPlayer(
        code: string,
        secretSessionToken: string,
        socketId: string,
    ): { ok: boolean; roomCode?: string; playerIndex?: number; publicPlayerId?: string; error?: string } {
        const cleanCode = this.normalizeCode(code);
        if (!cleanCode) return { ok: false, error: 'Invalid room code' };
        const room = this.rooms.get(cleanCode);
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
            roomCode: room.code,
            playerIndex: found.index,
            publicPlayerId: player.publicPlayerId,
        };
    }

    public toggleReady(code: string, sessionToken: string): boolean {
        const room = this.getRoom(code);
        if (!room || room.phase !== 'lobby') return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found) return false;
        found.player.ready = !found.player.ready;
        found.player.isReady = found.player.ready;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public toggleFillBots(code: string, sessionToken: string, fillBots: boolean): boolean {
        const room = this.getRoom(code);
        if (!room || room.phase !== 'lobby') return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found || found.player.publicPlayerId !== room.hostId) return false;
        room.fillBots = !!fillBots;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        return true;
    }

    public setSeatPersonality(code: string, sessionToken: string, seatIndex: number, personality: AIPersonality): boolean {
        const room = this.getRoom(code);
        if (!room || room.phase !== 'lobby') return false;
        if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex > 3) return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found || found.player.publicPlayerId !== room.hostId) return false;
        const clean = normalizeAIPersonality(personality, seatIndex);
        if (!Array.isArray(room.botPersonalities) || room.botPersonalities.length !== 4) {
            room.botPersonalities = AI_PERSONALITIES.slice();
        }
        room.botPersonalities[seatIndex] = clean;
        const seatPlayer = room.players[seatIndex];
        if (seatPlayer && seatPlayer.isAI) {
            seatPlayer.personality = clean;
        }
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        this.scheduleSnapshotSave();
        return true;
    }

    public startGame(code: string, sessionToken: string): { ok: boolean; error?: string } {
        const room = this.getRoom(code);
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
                    personality: room.botPersonalities?.[i] || getPersonalityForSeat(i),
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
        room.turnMovedToSquare = {};
        room.turnObligation = undefined;
        room.hadCaptureOrHomeThisTurn = false;
        room.turnAutoPlay = false;
        room.initialTurnTokens = room.tokens.map((r) => r.slice());
        room.grudges = createEmptyGrudges();
        room.dethroneAlertedLeaders = new Set();

        const turnLimitMs = this.getTurnLimitMs(room);
        room.turnDeadline = room.turnTimeSec > 0 ? Date.now() + turnLimitMs : 0;

        this.broadcast(room.code, 'game_started', this.getClientRoomState(room));
        this.startTurnTimer(room);
        this.scheduleSnapshotSave();

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
            const botPlayer = room.players[botIdx];
            const botPersonality = botPlayer?.personality || room.botPersonalities?.[botIdx] || getPersonalityForSeat(botIdx);
            const grudgeTargetIdx = room.grudges?.[botIdx]?.targetIdx ?? null;
            const { move: chosen } = pickBestAIMove(
                room.tokens,
                botIdx,
                allMoves,
                activeBools,
                room.dice,
                room.diceUsed,
                room.turnObligation,
                room.capturesTakenThisTurn || 0,
                { personality: botPersonality, grudgeTargetIdx },
            );
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
        room.turnMovedToSquare = {};
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

        if (curPlayer.isAI) {
            if (lucky) {
                this.emitAiBanter(room, room.currentTurn, 'lucky7');
            } else if (doubleSix) {
                this.emitAiBanter(room, room.currentTurn, 'lucky_roll');
            } else if (Math.random() < 0.35) {
                this.emitAiBanter(room, room.currentTurn, 'roll');
            }
        }

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
                taken,
                new Set(room.tokensCapturedThisTurn || []),
                room.tokens[p] || [],
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
                this.emitAiBanter(room, p, 'penalty');
                room.capturePromise = 0;
                room.turnObligation = undefined;
                room.turnMovedToSquare = {};
                return true;
            }
        }
        room.capturePromise = 0;
        room.turnObligation = undefined;
        room.turnMovedToSquare = {};
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

        const preRivalry = evaluateRivalryState(room.tokens, -1, activeBools);
        const prevTokenPos = room.tokens[room.currentTurn][tokenIndex];
        room.tokens[room.currentTurn][tokenIndex] = move.to;
        if (dieIndex === 2) room.diceUsed = [true, true];
        else room.diceUsed[dieIndex] = true;

        if (!room.turnMovedToSquare) room.turnMovedToSquare = {};
        const destKey =
            move.to >= 0 && move.to <= LAST_TRACK ? String(globalIdx(room.currentTurn, move.to)) : null;

        if (move.captures.length > 0) {
            room.capturesTakenThisTurn = (room.capturesTakenThisTurn || 0) + 1;
            if (!room.tokensCapturedThisTurn) room.tokensCapturedThisTurn = [];
            if (!room.tokensCapturedThisTurn.includes(tokenIndex)) {
                room.tokensCapturedThisTurn.push(tokenIndex);
            }
            if (destKey) {
                for (const [partnerStr, partnerKey] of Object.entries(room.turnMovedToSquare)) {
                    const partnerIdx = Number(partnerStr);
                    if (
                        partnerIdx !== tokenIndex &&
                        partnerKey === destKey &&
                        !room.tokensCapturedThisTurn.includes(partnerIdx)
                    ) {
                        room.tokensCapturedThisTurn.push(partnerIdx);
                    }
                }
            }
        }
        if (destKey) room.turnMovedToSquare[tokenIndex] = destKey;
        else delete room.turnMovedToSquare[tokenIndex];

        if (!Array.isArray(room.grudges) || room.grudges.length !== 4) {
            room.grudges = createEmptyGrudges();
        }
        let leaderVictim = -1;
        let revengeVictim = -1;
        for (const cap of move.captures) {
            room.tokens[cap.p][cap.t] = -1;
            room.capturesMade[room.currentTurn] = (room.capturesMade[room.currentTurn] || 0) + 1;
            room.timesCaptured[cap.p] = (room.timesCaptured[cap.p] || 0) + 1;
            const { revengeHit } = recordCaptureGrudge(room.grudges, room.currentTurn, cap.p);
            if (revengeHit && revengeVictim === -1) revengeVictim = cap.p;
            if (cap.p === preRivalry.leaderIdx && preRivalry.leaderPct >= 20 && leaderVictim === -1) {
                leaderVictim = cap.p;
            }
        }

        // Mid-turn newly unlocked capture check when 1 die remains and initial obligation was 0
        if (
            room.dice &&
            (!room.diceUsed[0] || !room.diceUsed[1]) &&
            !(room.diceUsed[0] && room.diceUsed[1]) &&
            room.turnObligation &&
            room.turnObligation.required === 0
        ) {
            const remOb = evaluateCaptureObligation(
                room.tokens,
                room.currentTurn,
                room.dice,
                activeBools,
                room.diceUsed,
            );
            if (remOb.required > 0) {
                room.turnObligation.required = remOb.required;
                room.turnObligation.singleDieCaptures.push(...remOb.singleDieCaptures);
                const merged = Array.from(
                    new Set([...room.turnObligation.candidateTokenIndices, ...remOb.candidateTokenIndices]),
                ).sort((a, b) => a - b);
                room.turnObligation.candidateTokenIndices = merged;
                room.turnObligation.optionTokens = merged;
                room.turnObligation.hasSingle = room.turnObligation.hasSingle || remOb.hasSingle;
                room.capturePromise = remOb.required;
            }
        }

        const reachedHome = move.to === 56;
        const enteredHomeStretch = prevTokenPos < PATH_START && move.to >= PATH_START && !reachedHome;

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

        if (move.captures.length > 0) {
            const firstCap = move.captures[0];
            const victimName = room.players[firstCap.p]?.name || 'Rival';
            this.emitAiBanter(room, room.currentTurn, 'capture', { n: victimName });
            this.emitAiBanter(room, firstCap.p, 'captured');
        } else if (reachedHome) {
            this.emitAiBanter(room, room.currentTurn, 'pawn_home');
        } else if (enteredHomeStretch) {
            this.emitAiBanter(room, room.currentTurn, 'home_stretch');
        }

        if (hasWon(room.tokens, room.currentTurn)) {
            room.winner = room.currentTurn;
            if (room.turnTimeout) clearTimeout(room.turnTimeout);
            void this.endMatchAndRecord(room.code, room.players[0]?.tokenHash || '', '127.0.0.1');
            return { ok: true };
        }

        if (leaderVictim !== -1 && preRivalry.tier === 'dethrone') {
            this.emitRivalryEvent(room, 'leader_hit', room.currentTurn, leaderVictim, preRivalry.leaderPct);
        } else if (revengeVictim !== -1) {
            const victimPct = calculateProgress(room.tokens, revengeVictim);
            this.emitRivalryEvent(room, 'grudge_hit', room.currentTurn, revengeVictim, victimPct);
        } else if (leaderVictim !== -1) {
            this.emitRivalryEvent(room, 'leader_hit', room.currentTurn, leaderVictim, preRivalry.leaderPct);
        }

        if (!room.dethroneAlertedLeaders) room.dethroneAlertedLeaders = new Set();
        const postRivalry = evaluateRivalryState(room.tokens, -1, activeBools);
        if (
            postRivalry.tier === 'dethrone' &&
            postRivalry.leaderIdx >= 0 &&
            !room.dethroneAlertedLeaders.has(postRivalry.leaderIdx)
        ) {
            room.dethroneAlertedLeaders.add(postRivalry.leaderIdx);
            const commentatorSeat = room.players.findIndex(
                (pl, s) => s !== postRivalry.leaderIdx && !!pl?.isAI,
            );
            this.emitRivalryEvent(
                room,
                'dethrone_alert',
                commentatorSeat,
                postRivalry.leaderIdx,
                postRivalry.leaderPct,
            );
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

        if (Array.isArray(room.grudges)) {
            decrementSeatGrudge(room.grudges, room.currentTurn);
        }

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
        this.scheduleSnapshotSave();

        if (room.players[room.currentTurn]?.isAI) {
            if (Math.random() < 0.35) this.emitAiBanter(room, room.currentTurn, 'turn');
            this.scheduleBotTurn(room);
        } else if (Math.random() < 0.25) {
            const idleAi = room.players.findIndex((pl, s) => s !== room.currentTurn && !!pl?.isAI);
            if (idleAi !== -1) this.emitAiBanter(room, idleAi, 'banter');
        }
    }

    public verifySender(
        code: string,
        sessionToken: string,
        socketId: string,
    ): { ok: true; room: Room; player: RoomPlayer; seatIndex: number } | { ok: false; error: string } {
        const cleanCode = String(code || '').toUpperCase().trim();
        const room = this.rooms.get(cleanCode);
        if (!room) return { ok: false, error: 'Room not found' };
        if (!sessionToken) return { ok: false, error: 'Missing session token' };
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found) return { ok: false, error: 'Unauthorized player token' };
        const { player, index } = found;
        if (index < 0 || index > 3) return { ok: false, error: 'Invalid seat index' };
        if (player.isAI) return { ok: false, error: 'Bots cannot send messages' };
        if (!player.socketId || player.socketId !== socketId) {
            return { ok: false, error: 'Active socket mismatch' };
        }
        return { ok: true, room, player, seatIndex: index };
    }

    public checkSocialCooldown(
        roomCode: string,
        seatIndex: number,
        kind: 'chat' | 'reaction' | 'voice' | 'whisper',
        cooldownMs: number,
    ): number {
        const key = `${roomCode}:${seatIndex}:${kind}`;
        const now = Date.now();
        const prev = this.socialCooldowns.get(key) || 0;
        const elapsed = now - prev;
        if (elapsed < cooldownMs) {
            return cooldownMs - elapsed;
        }
        this.socialCooldowns.set(key, now);
        if (this.socialCooldowns.size > 4000) {
            for (const [k, t] of this.socialCooldowns.entries()) {
                if (now - t > 60_000) this.socialCooldowns.delete(k);
            }
        }
        return 0;
    }

    public incrementMessageCount(room: Room): number {
        room.messageCount = (room.messageCount || 0) + 1;
        return room.messageCount;
    }

    public toggleSecretWhispers(
        code: string,
        sessionToken: string,
        socketId: string,
        secretWhispers?: boolean,
    ): { ok: boolean; secretWhispers?: boolean; error?: string; room?: Room } {
        const auth = this.verifySender(code, sessionToken, socketId);
        if (!auth.ok) return { ok: false, error: auth.error };
        const { room, player } = auth;
        if (player.publicPlayerId !== room.hostId) {
            return { ok: false, error: 'Only host can change Secret Whispers' };
        }
        room.secretWhispers = typeof secretWhispers === 'boolean' ? secretWhispers : !room.secretWhispers;
        this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
        this.scheduleSnapshotSave();
        return { ok: true, secretWhispers: room.secretWhispers, room };
    }

    public sendChat(code: string, sessionToken: string, text: string, emoji?: string): boolean {
        const room = this.rooms.get(code);
        if (!room) return false;
        const found = this.findPlayerByToken(room, sessionToken);
        if (!found) return false;
        const player = found.player;

        const filteredText = maskProfanity((text || '').replace(/[<>]/g, '').trim().slice(0, 120));
        this.broadcast(room.code, 'chat_received', {
            p: found.index,
            name: player.name,
            avatar: player.avatar,
            text: filteredText,
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
            room.turnMovedToSquare = {};
            room.turnObligation = undefined;
            room.hadCaptureOrHomeThisTurn = false;
            room.turnAutoPlay = false;
            room.initialTurnTokens = room.tokens.map((r) => r.slice());
            room.grudges = createEmptyGrudges();
            room.dethroneAlertedLeaders = new Set();

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
            progress: rIdx === 0 ? 100 : Math.round(calculateProgress(room.tokens, item.seat)),
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
        this.scheduleSnapshotSave();
        this.broadcast(room.code, 'game_over', { winner: room.winner, rankings: room.rankings });
        this.emitAiBanter(room, winnerSeat, 'win');
        const runnerUpAi = nonWinners.find((item) => item.player.isAI);
        if (runnerUpAi) {
            this.emitAiBanter(room, runnerUpAi.seat, 'loss');
        }

        // Non-blocking async record (only persist ranked matches that meet human & duration thresholds)
        let recordRes: any = { ok: true };
        const recordsCfg = getRecordsConfig();
        const humanCount = playerData.filter((p) => !p.isAI).length;
        const durationSec = Math.floor((room.endedAt - room.startedAt) / 1000);
        if (humanCount >= recordsCfg.minHumanPlayers && durationSec >= recordsCfg.matchDurationMinSeconds) {
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
        }
        return { ok: true, matchId: recordRes?.matchId };
    }

    public leaveRoom(code: string, sessionToken: string): boolean {
        const room = this.getRoom(code);
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
            this.reassignHostIfNeeded(room, player.publicPlayerId);
            room.players[idx] = null;
            const remaining = room.players.filter((p) => p !== null && !p.isAI);
            if (remaining.length === 0) {
                this.rooms.delete(room.code);
                this.scheduleSnapshotSave();
                return true;
            }
            this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
            this.scheduleSnapshotSave();
        } else {
            player.isAI = true;
            player.isHost = false;
            player.name = `${player.name} (Bot)`;
            player.connected = false;
            this.reassignHostIfNeeded(room, player.publicPlayerId);
            this.broadcast(room.code, 'player_converted_to_bot', { p: idx, name: player.name });
            this.broadcast(room.code, 'room_updated', this.getClientRoomState(room));
            this.scheduleSnapshotSave();
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
                        this.reassignHostIfNeeded(r, r.players[idx]!.publicPlayerId);
                        r.players[idx] = null;
                        r.disconnectTimeouts.delete(idx);
                        const remaining = r.players.filter((p) => p !== null && !p.isAI);
                        if (remaining.length === 0) {
                            this.rooms.delete(r.code);
                            this.scheduleSnapshotSave();
                            return;
                        }
                        this.broadcast(r.code, 'room_updated', this.getClientRoomState(r));
                        this.scheduleSnapshotSave();
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
                        const timedOutId = r.players[idx]!.publicPlayerId;
                        r.players[idx]!.isAI = true;
                        r.players[idx]!.isHost = false;
                        r.players[idx]!.name = `${r.players[idx]!.name} (Bot)`;
                        this.reassignHostIfNeeded(r, timedOutId);
                        this.broadcast(r.code, 'player_converted_to_bot', {
                            p: idx,
                            name: r.players[idx]!.name,
                        });
                        this.broadcast(r.code, 'room_updated', this.getClientRoomState(r));
                        this.scheduleSnapshotSave();
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
