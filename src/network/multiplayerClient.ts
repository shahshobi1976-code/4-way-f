import { io, Socket } from 'socket.io-client';
import type { ClientRoomState, RoomPlayer } from '../../server/roomManager';
import type { AIPersonality } from '../game/banter';
import { store } from '../state/store';
import { bus } from '../game/bus';
import { safeStorage, safeSessionStorage } from '../state/storage';
import * as sfx from '../game/sfx';

export interface ChatBubble {
    p: number;
    name: string;
    avatar: string;
    text: string;
    emoji?: string;
    time: number;
    kind?: 'chat' | 'voice' | 'whisper';
    clipId?: string;
    duration?: number;
}

export interface SocialLogEntry {
    id: string;
    kind: 'chat' | 'voice' | 'whisper_in' | 'whisper_out' | 'whisper_notice';
    seatIndex: number;
    sender: string;
    avatar: string;
    text?: string;
    emoji?: string;
    payload?: unknown;
    mimeType?: string;
    duration?: number;
    timestamp: number;
    toSeats?: number[];
    targetNames?: string[];
    messageCount?: number;
}

export interface ActiveReaction {
    seatIndex: number;
    emoji: string;
    until: number;
    key: number;
}

export interface WhisperBadgeState {
    fromSeat: number;
    toSeats: number[];
    secret: boolean;
    until: number;
}

export interface ToastNotice {
    id: number;
    kind: 'error' | 'warn' | 'info';
    message: string;
}

export type NetworkListener = () => void;

const SESSION_KEYS_TO_PURGE_FROM_LOCAL = [
    'ludo_session_token',
    'ludo_public_player_id',
    'ludo_room_code',
    'ludo_seat_index',
    'playerToken',
    'roomCode',
    'seatIndex',
];

function clearStaleLocalSessionCopies() {
    for (const k of SESSION_KEYS_TO_PURGE_FROM_LOCAL) {
        safeStorage.removeItem(k);
    }
}

export function getInviteCodeFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('room') || params.get('invite');
    const clean = raw ? raw.trim().toUpperCase() : '';
    return clean || null;
}

class MultiplayerClient {
    private socket: Socket | null = null;
    public publicPlayerId: string | null = null;
    public sessionToken: string;
    public roomCode: string | null = null;
    public myPlayerIndex: number | null = null;
    public roomState: ClientRoomState | null = null;
    public isConnected = false;
    public initialInviteError: string | null = null;
    public movableTokens: { tok: number; die: number }[] = [];
    public recentChat: ChatBubble | null = null;
    public offlineNotice: string | null = null;
    public chatLog: SocialLogEntry[] = [];
    public activeReactions: Record<number, ActiveReaction> = {};
    public activeVoiceSeat: number | null = null;
    public activeWhisperBadge: WhisperBadgeState | null = null;
    public mutedSeats = new Set<number>();
    public blockedAutoplayClip: { id: string; payload: unknown; mimeType?: string; label: string; seatIndex: number } | null = null;
    public toastNotice: ToastNotice | null = null;

    private listeners = new Set<NetworkListener>();
    private timerInterval: NodeJS.Timeout | null = null;
    private toastTimer: ReturnType<typeof setTimeout> | null = null;
    private reactionCleanupTimer: ReturnType<typeof setTimeout> | null = null;
    private whisperBadgeTimer: ReturnType<typeof setTimeout> | null = null;
    private startupHandled = false;
    public turnSecondsLeft = 30;

    constructor() {
        clearStaleLocalSessionCopies();
        // Tab-isolated sessionStorage credentials so multiple tabs never share an active seat
        let token = safeSessionStorage.getItem('playerToken') || safeSessionStorage.getItem('ludo_session_token');
        if (!token) {
            token = `tok_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
        }
        safeSessionStorage.setItem('playerToken', token);
        safeSessionStorage.setItem('ludo_session_token', token);
        this.sessionToken = token;
        this.publicPlayerId = safeSessionStorage.getItem('ludo_public_player_id') || null;
        this.roomCode = safeSessionStorage.getItem('roomCode') || safeSessionStorage.getItem('ludo_room_code') || null;
        const storedSeat = safeSessionStorage.getItem('seatIndex') ?? safeSessionStorage.getItem('ludo_seat_index');
        if (storedSeat !== null && storedSeat !== '' && Number.isInteger(Number(storedSeat))) {
            this.myPlayerIndex = Number(storedSeat);
        }
        this.initSocket();
        this.startTimerTicker();
        sfx.registerSeatMuteChecker((seatIdx) => this.isSeatMuted(seatIdx));
    }

    private clearRoomSessionCredentials() {
        this.roomCode = null;
        this.myPlayerIndex = null;
        this.roomState = null;
        safeSessionStorage.removeItem('roomCode');
        safeSessionStorage.removeItem('seatIndex');
        safeSessionStorage.removeItem('ludo_room_code');
        safeSessionStorage.removeItem('ludo_seat_index');
        clearStaleLocalSessionCopies();
    }

    private persistSessionCredentials(roomCode: string | null, seatIndex: number | null, publicPlayerId?: string | null, sessionToken?: string | null) {
        clearStaleLocalSessionCopies();
        if (sessionToken) {
            this.sessionToken = sessionToken;
            safeSessionStorage.setItem('playerToken', sessionToken);
            safeSessionStorage.setItem('ludo_session_token', sessionToken);
        }
        if (publicPlayerId) {
            this.publicPlayerId = publicPlayerId;
            safeSessionStorage.setItem('ludo_public_player_id', publicPlayerId);
        }
        if (roomCode) {
            const clean = String(roomCode).trim().toUpperCase();
            this.roomCode = clean;
            safeSessionStorage.setItem('roomCode', clean);
            safeSessionStorage.setItem('ludo_room_code', clean);
        }
        if (seatIndex !== null && seatIndex !== undefined && seatIndex >= 0 && seatIndex <= 3) {
            this.myPlayerIndex = seatIndex;
            safeSessionStorage.setItem('seatIndex', String(seatIndex));
            safeSessionStorage.setItem('ludo_seat_index', String(seatIndex));
        }
    }

    private matchPlayer(state: ClientRoomState) {
        const idx = state.players.findIndex(
            (p) =>
                p &&
                ((this.publicPlayerId && (p.publicPlayerId === this.publicPlayerId || p.id === this.publicPlayerId)) ||
                    p.id === this.sessionToken)
        );
        if (idx !== -1) {
            this.myPlayerIndex = idx;
            safeSessionStorage.setItem('seatIndex', String(idx));
            safeSessionStorage.setItem('ludo_seat_index', String(idx));
        }
    }

    private waitForSocketConnection(timeoutMs = 4500): Promise<boolean> {
        if (this.socket?.connected) return Promise.resolve(true);
        return new Promise((resolve) => {
            if (!this.socket) return resolve(false);
            let done = false;
            const finish = (ok: boolean) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                this.socket?.off('connect', onConn);
                resolve(ok);
            };
            const onConn = () => finish(true);
            const timer = setTimeout(() => finish(!!this.socket?.connected), timeoutMs);
            this.socket.once('connect', onConn);
        });
    }

    private emitReconnect(roomCode: string): Promise<{ ok: boolean; roomState?: ClientRoomState; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket) return resolve({ ok: false, error: 'Socket not initialized' });
            const clean = String(roomCode || '').trim().toUpperCase();
            this.socket.emit('ludo:reconnect', { roomCode: clean, token: this.sessionToken }, (res: any) => {
                if (res?.ok && res.roomState) {
                    const alreadyPlayingSameRoom =
                        store.get().phase === 'playing' &&
                        this.roomCode === res.roomState.code &&
                        res.roomState.phase === 'playing';
                    this.roomState = res.roomState;
                    const resolvedSeat = res.playerIndex !== undefined ? res.playerIndex : this.myPlayerIndex;
                    this.persistSessionCredentials(res.roomState.code, resolvedSeat, res.publicPlayerId || null, null);
                    this.matchPlayer(res.roomState);
                    if (alreadyPlayingSameRoom) {
                        const diff = res.roomState.turnDeadline > 0
                            ? Math.max(0, Math.ceil((res.roomState.turnDeadline - Date.now()) / 1000))
                            : 0;
                        this.turnSecondsLeft = diff;
                        store.patch({
                            turnSecondsLeft: diff,
                            turnTotalSec: res.roomState.turnTimeSec ?? 90,
                            timerActive: res.roomState.turnDeadline > 0,
                        });
                        bus.onRoomStateSynced?.(res.roomState);
                    } else if (res.roomState.phase === 'playing' || res.roomState.phase === 'game_over') {
                        this.syncStoreWithRoom();
                    } else {
                        store.patch({ modal: 'multiplayer' });
                    }
                    this.notify();
                    resolve({ ok: true, roomState: res.roomState });
                } else {
                    if (res?.error === 'Room not found' || res?.error === 'Invalid session token') {
                        this.clearRoomSessionCredentials();
                        this.notify();
                    }
                    resolve({ ok: false, error: res?.error || 'Reconnect failed' });
                }
            });
        });
    }

    public async handleStartupInviteOrReconnect(): Promise<void> {
        if (this.startupHandled) return;
        this.startupHandled = true;

        const inviteCode = getInviteCodeFromUrl();
        if (inviteCode) {
            await this.waitForSocketConnection();
            if (this.roomCode === inviteCode && this.sessionToken) {
                const rec = await this.emitReconnect(inviteCode);
                if (rec.ok) return;
            }
            this.clearRoomSessionCredentials();
            const savedName = safeStorage.getItem('ludo_player_name') || 'Guest Warrior';
            const savedAvatar = safeStorage.getItem('ludo_player_avatar') || '⚔️';
            const res = await this.joinRoom(inviteCode, savedName, savedAvatar);
            if (res.ok) {
                this.initialInviteError = null;
                if (this.roomState?.phase === 'playing' || this.roomState?.phase === 'game_over') {
                    this.syncStoreWithRoom();
                } else {
                    store.patch({ modal: 'multiplayer' });
                }
            } else {
                this.initialInviteError = res.error || 'Could not join room. Check code.';
                store.patch({ modal: 'multiplayer' });
            }
            return;
        }

        // Otherwise check tab-isolated sessionStorage credentials (roomCode, seatIndex, playerToken)
        const storedRoom = safeSessionStorage.getItem('roomCode') || safeSessionStorage.getItem('ludo_room_code');
        const storedToken = safeSessionStorage.getItem('playerToken') || safeSessionStorage.getItem('ludo_session_token');
        const storedSeat = safeSessionStorage.getItem('seatIndex') ?? safeSessionStorage.getItem('ludo_seat_index');
        if (storedRoom && storedToken && storedSeat !== null && storedSeat !== '') {
            await this.waitForSocketConnection();
            await this.emitReconnect(storedRoom);
        }
    }

    private initSocket() {
        const url = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        this.socket = io(url, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            timeout: 8000,
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.offlineNotice = null;
            this.notify();

            // Auto-reconnect to active room when startup has already run or no competing URL invite exists
            const inviteCode = getInviteCodeFromUrl();
            if (this.startupHandled && this.roomCode && this.sessionToken && (!inviteCode || inviteCode === this.roomCode)) {
                void this.emitReconnect(this.roomCode);
            }
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            if (this.roomCode) {
                this.offlineNotice = 'Connection lost. Reconnecting... (60s grace period)';
            }
            this.notify();
        });

        this.socket.on('room_updated', (state: ClientRoomState) => {
            this.roomState = state;
            this.matchPlayer(state);
            this.notify();
        });

        this.socket.on('game_started', (state: ClientRoomState) => {
            this.roomState = state;
            this.matchPlayer(state);
            this.syncStoreWithRoom();
            this.notify();
        });

        this.socket.on('dice_rolled', (data: { p: number; dice: [number, number]; lucky: boolean; movableTokens: { tok: number; die: number }[]; streakForfeited: boolean }) => {
            if (this.roomState) {
                this.roomState.dice = data.dice;
                this.roomState.diceUsed = data.streakForfeited ? [true, true] : [false, false];
            }
            this.movableTokens = data.movableTokens || [];
            this.notify();

            // Trigger local Pixi animation / sound
            if (bus.onRemoteDiceRolled) {
                bus.onRemoteDiceRolled(data.p, data.dice, data.lucky, data.streakForfeited);
            }
        });

        this.socket.on('pawn_moved', (data: { p: number; dieIndex: number; tokenIndex: number; to: number; captures: { p: number; t: number }[]; reachedHome: boolean; diceUsed: [boolean, boolean]; passed?: boolean }) => {
            if (this.roomState) {
                this.roomState.tokens[data.p][data.tokenIndex] = data.to;
                this.roomState.diceUsed = data.diceUsed;
                for (const c of data.captures) {
                    this.roomState.tokens[c.p][c.t] = -1;
                }
            }
            this.notify();

            // Trigger local Pixi pawn move hop or pass
            if (bus.onRemotePawnMoved) {
                bus.onRemotePawnMoved(data.p, data.dieIndex, data.tokenIndex, data.to, data.captures, data.reachedHome, data.passed);
            }
        });

        this.socket.on('penalty_applied', (data: { p: number; tokenIndex: number; tokenIndices?: number[]; penalties: number; reason?: string }) => {
            const list = data.tokenIndices && data.tokenIndices.length > 0 ? data.tokenIndices : [data.tokenIndex];
            if (this.roomState && this.roomState.tokens[data.p]) {
                for (const tok of list) {
                    if (tok >= 0 && tok < 4) {
                        this.roomState.tokens[data.p][tok] = -1;
                    }
                }
                if (this.roomState.players[data.p]) {
                    this.roomState.players[data.p]!.penalties = data.penalties;
                }
            }
            this.notify();

            if (bus.onRemotePenaltyApplied) {
                bus.onRemotePenaltyApplied(data.p, list, data.penalties);
            }
        });

        this.socket.on('turn_changed', (data: { currentTurn: number; turnDeadline: number; extraTurn: boolean }) => {
            if (this.roomState) {
                this.roomState.currentTurn = data.currentTurn;
                this.roomState.turnDeadline = data.turnDeadline;
                this.roomState.dice = null;
                this.roomState.diceUsed = [false, false];
            }
            this.movableTokens = [];
            const diff = data.turnDeadline > 0 ? Math.max(0, Math.ceil((data.turnDeadline - Date.now()) / 1000)) : 0;
            this.turnSecondsLeft = diff;
            bus.onGulDecision = undefined;
            store.patch({
                turnSecondsLeft: diff,
                turnTotalSec: this.roomState?.turnTimeSec ?? 90,
                timerActive: data.turnDeadline > 0,
                gulPrompt: null,
                captureNotice: null,
                skipCapturePrompt: null,
            });
            this.notify();

            if (bus.onRemoteTurnChanged) {
                bus.onRemoteTurnChanged(data.currentTurn, data.extraTurn);
            }
        });

        this.socket.on('game_over', (data: { winner: number; rankings: any[] }) => {
            if (this.roomState) {
                this.roomState.phase = 'game_over';
                this.roomState.winner = data.winner;
                this.roomState.rankings = data.rankings;
            }
            this.notify();

            const rows = data.rankings && data.rankings.length > 0
                ? data.rankings.map((r: any) => ({ idx: r.playerIndex, pct: r.rank === 1 ? 100 : Math.round(r.progress || 0) }))
                : [0, 1, 2, 3].map((p) => ({ idx: p, pct: p === data.winner ? 100 : 0 }));
            store.patch({ result: rows, popup: null, wishUsable: false });

            if (bus.onRemoteGameOver) {
                bus.onRemoteGameOver(data.winner, data.rankings);
            }
        });

        this.socket.on(
            'ai_banter',
            (data: { seatIndex: number; event: string; personality: string; lineIdx: number; vars?: Record<string, string> }) => {
                if (this.mutedSeats.has(data.seatIndex)) return;
                bus.onRemoteAiBanter?.(data);
            },
        );

        this.socket.on('chat_received', (chat: ChatBubble) => {
            if (this.mutedSeats.has(chat.p)) return;
            this.recentChat = { ...chat, time: Date.now(), kind: 'chat' };
            this.pushLogEntry({
                id: `c_${chat.p}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                kind: 'chat',
                seatIndex: chat.p,
                sender: chat.name,
                avatar: chat.avatar,
                text: chat.text,
                emoji: chat.emoji,
                timestamp: chat.time || Date.now(),
            });
            this.notify();

            if (bus.chat) {
                bus.chat(chat.p, chat.emoji ? `${chat.emoji} ${chat.text}` : chat.text, { voice: false });
            }
        });

        this.socket.on(
            'ludo:chat',
            (data: { sender: string; avatar?: string; text: string; emoji?: string; seatIndex: number; timestamp: number; messageCount: number }) => {
                if (this.mutedSeats.has(data.seatIndex)) return;
                const avatar = data.avatar || this.roomState?.players[data.seatIndex]?.avatar || '💬';
                const display = data.emoji ? (data.text ? `${data.emoji} ${data.text}` : data.emoji) : data.text;
                this.recentChat = {
                    p: data.seatIndex,
                    name: data.sender,
                    avatar,
                    text: data.text,
                    emoji: data.emoji,
                    time: Date.now(),
                    kind: 'chat',
                };
                if (this.roomState) this.roomState.messageCount = data.messageCount;
                this.pushLogEntry({
                    id: `chat_${data.seatIndex}_${data.timestamp}_${data.messageCount}`,
                    kind: 'chat',
                    seatIndex: data.seatIndex,
                    sender: data.sender,
                    avatar,
                    text: data.text,
                    emoji: data.emoji,
                    timestamp: data.timestamp || Date.now(),
                    messageCount: data.messageCount,
                });
                this.notify();

                if (bus.chat && display) {
                    bus.chat(data.seatIndex, display, { voice: false });
                }
            },
        );

        this.socket.on('ludo:reaction', (data: { seatIndex: number; emoji: string; sender?: string; timestamp?: number }) => {
            if (this.mutedSeats.has(data.seatIndex)) return;
            const until = Date.now() + 2500;
            this.activeReactions = {
                ...this.activeReactions,
                [data.seatIndex]: {
                    seatIndex: data.seatIndex,
                    emoji: data.emoji,
                    until,
                    key: Date.now() + Math.random(),
                },
            };
            this.scheduleReactionCleanup();
            this.notify();
        });

        this.socket.on(
            'ludo:voice',
            (data: { sender: string; avatar?: string; seatIndex: number; audio: unknown; mimeType: string; duration: number; timestamp: number; messageCount: number }) => {
                if (this.mutedSeats.has(data.seatIndex)) return;
                const clipId = `voice_${data.seatIndex}_${data.timestamp}_${data.messageCount}`;
                const avatar = data.avatar || this.roomState?.players[data.seatIndex]?.avatar || '🎤';
                void sfx.cacheAudioClip(clipId, data.audio);

                if (this.roomState) this.roomState.messageCount = data.messageCount;
                this.pushLogEntry({
                    id: clipId,
                    kind: 'voice',
                    seatIndex: data.seatIndex,
                    sender: data.sender,
                    avatar,
                    text: `🎤 Voice Note (${data.duration}s)`,
                    payload: data.audio,
                    mimeType: data.mimeType,
                    duration: data.duration,
                    timestamp: data.timestamp || Date.now(),
                    messageCount: data.messageCount,
                });

                this.recentChat = {
                    p: data.seatIndex,
                    name: data.sender,
                    avatar,
                    text: `Voice Note (${data.duration}s)`,
                    emoji: '🎤',
                    time: Date.now(),
                    kind: 'voice',
                    clipId,
                    duration: data.duration,
                };

                // Do not auto-play our own voice note back to ourselves, keep in log for optional replay
                if (data.seatIndex !== this.myPlayerIndex) {
                    this.activeVoiceSeat = data.seatIndex;
                    sfx.playAudioClip(clipId, data.audio, data.mimeType, {
                        onEnded: () => {
                            if (this.activeVoiceSeat === data.seatIndex) {
                                this.activeVoiceSeat = null;
                                this.notify();
                            }
                        },
                        onAutoplayBlocked: () => {
                            this.activeVoiceSeat = null;
                            this.blockedAutoplayClip = {
                                id: clipId,
                                payload: data.audio,
                                mimeType: data.mimeType,
                                label: `${data.sender} sent a voice note (${data.duration}s)`,
                                seatIndex: data.seatIndex,
                            };
                            this.notify();
                        },
                    });
                }
                this.notify();
            },
        );

        this.socket.on(
            'voice:whisper',
            (data: { id: string; fromSeat: number; senderName: string; senderAvatar?: string; toSeat: number; toSeats?: number[]; clip: unknown; mimeType: string; duration: number; timestamp: number }) => {
                if (this.mutedSeats.has(data.fromSeat)) return;
                const clipId = data.id || `wh_${data.fromSeat}_${data.timestamp}`;
                const avatar = data.senderAvatar || this.roomState?.players[data.fromSeat]?.avatar || '🤫';
                void sfx.cacheAudioClip(clipId, data.clip);

                this.pushLogEntry({
                    id: clipId,
                    kind: 'whisper_in',
                    seatIndex: data.fromSeat,
                    sender: data.senderName,
                    avatar,
                    text: `🤫 Private Whisper (${data.duration}s)`,
                    payload: data.clip,
                    mimeType: data.mimeType,
                    duration: data.duration,
                    timestamp: data.timestamp || Date.now(),
                    toSeats: data.toSeats || [data.toSeat],
                });

                this.setWhisperBadge(data.fromSeat, data.toSeats || [data.toSeat], true);
                this.activeVoiceSeat = data.fromSeat;

                sfx.playAudioClip(clipId, data.clip, data.mimeType, {
                    onEnded: () => {
                        if (this.activeVoiceSeat === data.fromSeat) {
                            this.activeVoiceSeat = null;
                            this.notify();
                        }
                    },
                    onAutoplayBlocked: () => {
                        this.activeVoiceSeat = null;
                        this.blockedAutoplayClip = {
                            id: clipId,
                            payload: data.clip,
                            mimeType: data.mimeType,
                            label: `🤫 Secret whisper from ${data.senderName} (${data.duration}s)`,
                            seatIndex: data.fromSeat,
                        };
                        this.notify();
                    },
                });
                this.notify();
            },
        );

        this.socket.on(
            'ludo:whisper_notice',
            (data: { fromSeat: number; senderName: string; toSeats: number[]; targetNames: string[]; timestamp: number }) => {
                if (this.mutedSeats.has(data.fromSeat)) return;
                const avatar = this.roomState?.players[data.fromSeat]?.avatar || '🤫';
                const targetLabel = (data.targetNames || []).join(', ') || 'player';
                this.pushLogEntry({
                    id: `whn_${data.fromSeat}_${data.timestamp}_${Math.random().toString(36).slice(2, 5)}`,
                    kind: 'whisper_notice',
                    seatIndex: data.fromSeat,
                    sender: data.senderName,
                    avatar,
                    text: `whispered to ${targetLabel}`,
                    timestamp: data.timestamp || Date.now(),
                    toSeats: data.toSeats,
                    targetNames: data.targetNames,
                });
                this.setWhisperBadge(data.fromSeat, data.toSeats, false);
                this.notify();
            },
        );

        this.socket.on('ludo:secret_whispers_changed', (data: { secretWhispers: boolean }) => {
            if (this.roomState) {
                this.roomState.secretWhispers = !!data.secretWhispers;
            }
            this.notify();
        });

        this.socket.on('player_disconnected', (data: { p: number; name: string; graceSeconds: number }) => {
            if (this.roomState?.players[data.p]) {
                this.roomState.players[data.p]!.connected = false;
            }
            this.notify();
        });

        this.socket.on('player_converted_to_bot', (data: { p: number; name: string }) => {
            if (this.roomState?.players[data.p]) {
                this.roomState.players[data.p]!.isAI = true;
                const cleanName = (data.name || '').replace(/\s*#[a-zA-Z0-9_-]+$/, '').trim();
                this.roomState.players[data.p]!.name = cleanName;
            }
            store.patchPlayer(data.p, { ai: true, name: data.name });
            this.notify();
        });

        this.socket.on('rematch_started', (state: ClientRoomState) => {
            this.roomState = state;
            this.matchPlayer(state);
            this.syncStoreWithRoom();
            this.notify();
        });
    }

    private startTimerTicker() {
        this.timerInterval = setInterval(() => {
            if (!this.roomState || this.roomState.phase !== 'playing') return;
            if (this.roomState.turnDeadline > 0) {
                const diff = Math.max(0, Math.ceil((this.roomState.turnDeadline - Date.now()) / 1000));
                if (this.turnSecondsLeft !== diff) {
                    this.turnSecondsLeft = diff;
                    store.patch({
                        turnSecondsLeft: diff,
                        turnTotalSec: this.roomState.turnTimeSec ?? 90,
                        timerActive: true,
                    });
                    this.notify();
                }
            } else if (this.turnSecondsLeft !== 0) {
                this.turnSecondsLeft = 0;
                store.patch({
                    turnSecondsLeft: 0,
                    timerActive: (this.roomState.turnTimeSec ?? 90) > 0 && this.roomState.turnDeadline > 0,
                });
                this.notify();
            }
        }, 200);
    }

    private syncStoreWithRoom() {
        if (!this.roomState) return;
        const state = this.roomState;

        // Sync players to App store
        const active = [false, false, false, false];
        state.players.forEach((p, i) => {
            if (p) {
                active[i] = true;
                const cleanName = (p.name || '').replace(/\s*#[a-zA-Z0-9_-]+$/, '').trim();
                store.patchPlayer(i, {
                    name: cleanName || p.name,
                    avatar: p.avatar,
                    ai: p.isAI,
                    personality: p.personality || state.botPersonalities?.[i],
                });
            }
        });

        const myWish = this.myPlayerIndex !== null && state.players[this.myPlayerIndex]?.wish;
        store.patch({
            phase: 'playing',
            mode: 4,
            active,
            modal: null,
            gameId: store.get().gameId + 1,
            result: null,
            popup: null,
            wishNums: myWish || store.get().wishNums || [6, 5],
            wishUsable: true,
        });
    }

    public subscribe(listener: NetworkListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        this.listeners.forEach((fn) => fn());
    }

    public get isMyTurn(): boolean {
        if (!this.roomState || this.roomState.phase !== 'playing') return false;
        return this.roomState.currentTurn === this.myPlayerIndex;
    }

    public get isHost(): boolean {
        if (!this.roomState) return false;
        const myP = this.myPlayerIndex !== null ? this.roomState.players[this.myPlayerIndex] : null;
        return !!(myP?.isHost || (myP && this.roomState.hostId === myP.id));
    }

    public createRoom(name: string, avatar: string, turnTimeSec = 90, maxPlayers = 4): Promise<{ ok: boolean; roomCode?: string; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket) return resolve({ ok: false, error: 'Socket not initialized' });
            this.socket.emit('create_room', { name, avatar, sessionToken: this.sessionToken, turnTimeSec, maxPlayers: 4 }, (res: any) => {
                if (res?.ok && res.roomCode) {
                    this.roomState = res.roomState;
                    this.chatLog = [];
                    this.activeReactions = {};
                    this.activeVoiceSeat = null;
                    this.activeWhisperBadge = null;
                    this.blockedAutoplayClip = null;
                    this.persistSessionCredentials(res.roomCode, 0, res.publicPlayerId || null, res.secretSessionToken || null);
                    this.notify();
                }
                resolve(res || { ok: false, error: 'Network timeout' });
            });
        });
    }

    public setTurnTime(turnTimeSec: number) {
        if (!this.socket || !this.roomCode) return;
        this.socket.emit('set_turn_time', { roomCode: this.roomCode, sessionToken: this.sessionToken, turnTimeSec });
    }

    public setWish(wish: [number, number] | null) {
        if (!this.socket || !this.roomCode) return;
        this.socket.emit('set_wish', { roomCode: this.roomCode, sessionToken: this.sessionToken, wish });
    }

    public joinRoom(roomCode: string, name: string, avatar: string): Promise<{ ok: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket) return resolve({ ok: false, error: 'Socket not initialized' });
            const clean = String(roomCode || '').trim().toUpperCase();
            this.socket.emit('join_room', { roomCode: clean, name, avatar, sessionToken: this.sessionToken }, (res: any) => {
                if (res?.ok) {
                    this.roomState = res.roomState;
                    this.initialInviteError = null;
                    this.chatLog = [];
                    this.activeReactions = {};
                    this.activeVoiceSeat = null;
                    this.activeWhisperBadge = null;
                    this.blockedAutoplayClip = null;
                    this.persistSessionCredentials(
                        res.roomCode || clean,
                        res.playerIndex ?? null,
                        res.publicPlayerId || null,
                        res.secretSessionToken || null,
                    );
                    this.notify();
                }
                resolve(res || { ok: false, error: 'Network timeout' });
            });
        });
    }

    public endMatch(): Promise<{ ok: boolean; matchId?: string; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ ok: false, error: 'Not in a room' });
            this.socket.emit('ludo:match_ended', { roomCode: this.roomCode, token: this.sessionToken }, (res: any) => {
                resolve(res || { ok: false, error: 'Network timeout' });
            });
        });
    }

    public toggleReady() {
        if (!this.socket || !this.roomCode) return;
        this.socket.emit('toggle_ready', { roomCode: this.roomCode, sessionToken: this.sessionToken });
    }

    public toggleFillBots(fillBots: boolean) {
        if (!this.socket || !this.roomCode) return;
        this.socket.emit('toggle_fill_bots', { roomCode: this.roomCode, sessionToken: this.sessionToken, fillBots });
    }

    public setSeatPersonality(seatIndex: number, personality: AIPersonality) {
        if (!this.socket || !this.roomCode) return;
        this.socket.emit('set_seat_personality', { roomCode: this.roomCode, sessionToken: this.sessionToken, seatIndex, personality });
    }

    public startGame(): Promise<{ ok: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ ok: false, error: 'No room' });
            this.socket.emit('start_game', { roomCode: this.roomCode, sessionToken: this.sessionToken }, (res: any) => {
                resolve(res || { ok: false });
            });
        });
    }

    public rollDice(useWish = false): Promise<{ ok: boolean; dice?: [number, number]; lucky?: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ ok: false, error: 'No room' });
            let timer: any = setTimeout(() => {
                timer = null;
                resolve({ ok: false, error: 'Network timeout' });
            }, 3500);
            this.socket.emit('dice_roll', { roomCode: this.roomCode, sessionToken: this.sessionToken, useWish }, (res: any) => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                if (res?.ok && res.dice) {
                    if (this.roomState) {
                        this.roomState.dice = res.dice;
                        this.roomState.diceUsed = res.streakForfeited ? [true, true] : [false, false];
                    }
                }
                resolve(res || { ok: false });
            });
        });
    }

    public movePawn(dieIndex: number, tokenIndex: number, action: 'gul' | 'pass' = 'gul'): Promise<{ ok: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ ok: false, error: 'No room' });
            let timer: any = setTimeout(() => {
                timer = null;
                resolve({ ok: false, error: 'Network timeout' });
            }, 3500);
            this.socket.emit('move_pawn', { roomCode: this.roomCode, sessionToken: this.sessionToken, dieIndex, tokenIndex, action }, (res: any) => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                resolve(res || { ok: false });
            });
        });
    }

    public syncState(): Promise<{ ok: boolean; roomState?: ClientRoomState; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ ok: false, error: 'No room' });
            let timer: any = setTimeout(() => {
                timer = null;
                resolve({ ok: false, error: 'Network timeout' });
            }, 3500);
            this.socket.emit('sync_state', { roomCode: this.roomCode, sessionToken: this.sessionToken }, (res: any) => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                if (res?.ok && res.roomState) {
                    this.roomState = res.roomState;
                    this.matchPlayer(res.roomState);
                    bus.onRoomStateSynced?.(res.roomState);
                    this.notify();
                }
                resolve(res || { ok: false });
            });
        });
    }

    private pushLogEntry(entry: SocialLogEntry) {
        this.chatLog = [...this.chatLog.slice(-49), entry];
    }

    private setWhisperBadge(fromSeat: number, toSeats: number[], secret: boolean) {
        if (this.whisperBadgeTimer) clearTimeout(this.whisperBadgeTimer);
        this.activeWhisperBadge = { fromSeat, toSeats, secret, until: Date.now() + 4500 };
        this.whisperBadgeTimer = setTimeout(() => {
            this.whisperBadgeTimer = null;
            this.activeWhisperBadge = null;
            this.notify();
        }, 4500);
    }

    private scheduleReactionCleanup() {
        if (this.reactionCleanupTimer) clearTimeout(this.reactionCleanupTimer);
        this.reactionCleanupTimer = setTimeout(() => {
            this.reactionCleanupTimer = null;
            const now = Date.now();
            const next: Record<number, ActiveReaction> = {};
            let changed = false;
            for (const [k, v] of Object.entries(this.activeReactions)) {
                if (v.until > now) next[Number(k)] = v;
                else changed = true;
            }
            if (changed) {
                this.activeReactions = next;
                this.notify();
            }
            if (Object.keys(next).length > 0) this.scheduleReactionCleanup();
        }, 600);
    }

    public showToast(message: string, kind: 'error' | 'warn' | 'info' = 'info', durationMs = 3000) {
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastNotice = { id: Date.now(), kind, message };
        this.notify();
        this.toastTimer = setTimeout(() => {
            this.toastTimer = null;
            this.toastNotice = null;
            this.notify();
        }, durationMs);
    }

    public isSeatMuted(seatIndex: number): boolean {
        return this.mutedSeats.has(seatIndex);
    }

    public toggleSeatMute(seatIndex: number) {
        if (seatIndex === this.myPlayerIndex) return;
        const next = new Set(this.mutedSeats);
        if (next.has(seatIndex)) next.delete(seatIndex);
        else next.add(seatIndex);
        this.mutedSeats = next;
        this.notify();
    }

    public playClipById(clipId: string) {
        let payload: unknown = null;
        let mimeType: string | undefined;
        let seatIndex = 0;

        if (this.blockedAutoplayClip && this.blockedAutoplayClip.id === clipId) {
            payload = this.blockedAutoplayClip.payload;
            mimeType = this.blockedAutoplayClip.mimeType;
            seatIndex = this.blockedAutoplayClip.seatIndex;
            this.blockedAutoplayClip = null;
        } else {
            const entry = this.chatLog.find((c) => c.id === clipId);
            if (!entry?.payload) return;
            payload = entry.payload;
            mimeType = entry.mimeType;
            seatIndex = entry.seatIndex;
        }

        this.activeVoiceSeat = seatIndex;
        this.notify();
        sfx.playAudioClip(clipId, payload, mimeType, {
            onEnded: () => {
                if (this.activeVoiceSeat === seatIndex) {
                    this.activeVoiceSeat = null;
                    this.notify();
                }
            },
            onAutoplayBlocked: () => {
                this.activeVoiceSeat = null;
                this.showToast('Tap again to enable audio playback', 'warn');
                this.notify();
            },
        });
    }

    public sendChat(text: string, emoji?: string) {
        void this.sendLudoChat(text, emoji);
    }

    public sendLudoChat(text: string, emoji?: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ success: false, error: 'Not in a room' });
            this.socket.emit(
                'ludo:chat',
                { roomCode: this.roomCode, sessionToken: this.sessionToken, text, emoji },
                (res: any) => {
                    if (res && res.success === false && res.error) {
                        this.showToast(res.error, 'warn');
                    }
                    resolve(res || { success: false, error: 'Network error' });
                },
            );
        });
    }

    public sendReaction(emoji: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ success: false, error: 'Not in a room' });
            this.socket.emit(
                'ludo:reaction',
                { roomCode: this.roomCode, sessionToken: this.sessionToken, emoji },
                (res: any) => {
                    if (res && res.success === false && res.error) {
                        this.showToast(res.error, 'warn');
                    }
                    resolve(res || { success: false });
                },
            );
        });
    }

    public sendVoiceNote(bytes: Uint8Array, mimeType: string): Promise<{ success: boolean; duration?: number; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ success: false, error: 'Not in a room' });
            const bufferCopy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            this.socket.emit(
                'ludo:voice',
                { roomCode: this.roomCode, sessionToken: this.sessionToken, audio: bufferCopy, mimeType },
                (res: any) => {
                    if (!res?.success && res?.error) {
                        this.showToast(res.error, 'error');
                    }
                    resolve(res || { success: false, error: 'Failed to send voice note' });
                },
            );
        });
    }

    public sendWhisper(
        toSeats: number[],
        bytes: Uint8Array,
        mimeType: string,
    ): Promise<{ success: boolean; duration?: number; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ success: false, error: 'Not in a room' });
            const bufferCopy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            this.socket.emit(
                'voice:whisper',
                { roomCode: this.roomCode, sessionToken: this.sessionToken, toSeats, clip: bufferCopy, mimeType },
                (res: any) => {
                    if (res?.success) {
                        const dur = res.duration || 1;
                        const names = toSeats
                            .map((s) => this.roomState?.players[s]?.name || `Seat ${s + 1}`)
                            .join(', ');
                        const mySeat = this.myPlayerIndex ?? 0;
                        const me = this.roomState?.players[mySeat];
                        this.pushLogEntry({
                            id: `whout_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                            kind: 'whisper_out',
                            seatIndex: mySeat,
                            sender: me?.name || 'You',
                            avatar: me?.avatar || '🤫',
                            text: `🤫 Whispered to ${names} (${dur}s)`,
                            payload: bytes,
                            mimeType,
                            duration: dur,
                            timestamp: Date.now(),
                            toSeats,
                        });
                        this.notify();
                    } else if (res?.error) {
                        this.showToast(res.error, 'error');
                    }
                    resolve(res || { success: false, error: 'Failed to send whisper' });
                },
            );
        });
    }

    public toggleSecretWhispers(secretWhispers?: boolean): Promise<{ success: boolean; secretWhispers?: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ success: false, error: 'Not in a room' });
            this.socket.emit(
                'ludo:toggle_secret_whispers',
                { roomCode: this.roomCode, sessionToken: this.sessionToken, secretWhispers },
                (res: any) => {
                    if (!res?.success && res?.error) {
                        this.showToast(res.error, 'error');
                    }
                    resolve(res || { success: false });
                },
            );
        });
    }

    public voteRematch(): Promise<{ ok: boolean }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ ok: false });
            this.socket.emit('vote_rematch', { roomCode: this.roomCode, sessionToken: this.sessionToken }, (res: any) => {
                resolve(res || { ok: false });
            });
        });
    }

    public leaveRoom() {
        if (this.socket && this.roomCode) {
            this.socket.emit('leave_room', { roomCode: this.roomCode, sessionToken: this.sessionToken });
        }
        this.clearRoomSessionCredentials();
        this.movableTokens = [];
        this.offlineNotice = null;
        this.initialInviteError = null;
        this.chatLog = [];
        this.activeReactions = {};
        this.activeVoiceSeat = null;
        this.activeWhisperBadge = null;
        this.mutedSeats.clear();
        this.blockedAutoplayClip = null;
        if (typeof window !== 'undefined' && (window.location.search.includes('room=') || window.location.search.includes('invite='))) {
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('room');
                url.searchParams.delete('invite');
                window.history.replaceState({}, document.title, url.toString());
            } catch {}
        }
        this.notify();
        store.patch({ phase: 'menu', modal: null });
    }
}

export const multiplayerClient = new MultiplayerClient();
