import { io, Socket } from 'socket.io-client';
import type { ClientRoomState, RoomPlayer } from '../../server/roomManager';
import { store } from '../state/store';
import { bus } from '../game/bus';
import { safeStorage, safeSessionStorage } from '../state/storage';

export interface ChatBubble {
    p: number;
    name: string;
    avatar: string;
    text: string;
    emoji?: string;
    time: number;
}

export type NetworkListener = () => void;

class MultiplayerClient {
    private socket: Socket | null = null;
    public publicPlayerId: string | null = null;
    public sessionToken: string;
    public roomCode: string | null = null;
    public myPlayerIndex: number | null = null;
    public roomState: ClientRoomState | null = null;
    public isConnected = false;
    public movableTokens: { tok: number; die: number }[] = [];
    public recentChat: ChatBubble | null = null;
    public offlineNotice: string | null = null;
    private listeners = new Set<NetworkListener>();
    private timerInterval: NodeJS.Timeout | null = null;
    public turnSecondsLeft = 30;

    constructor() {
        // Tab-isolated session token so multiple tabs in the same browser have independent seats
        let token = safeSessionStorage.getItem('ludo_session_token');
        if (!token) {
            token = `tok_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
            safeSessionStorage.setItem('ludo_session_token', token);
        }
        this.sessionToken = token;
        this.publicPlayerId = safeSessionStorage.getItem('ludo_public_player_id') || null;
        this.roomCode = safeSessionStorage.getItem('ludo_room_code') || null;
        this.initSocket();
        this.startTimerTicker();
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

            // Auto-reconnect to room using secret token
            if (this.roomCode && this.sessionToken) {
                this.socket?.emit('ludo:reconnect', { roomCode: this.roomCode, token: this.sessionToken }, (res: any) => {
                    if (res?.ok && res.roomState) {
                        const alreadyPlayingSameRoom =
                            store.get().phase === 'playing' &&
                            this.roomCode === res.roomState.code &&
                            res.roomState.phase === 'playing';
                        this.roomState = res.roomState;
                        if (res.playerIndex !== undefined) this.myPlayerIndex = res.playerIndex;
                        if (res.publicPlayerId) {
                            this.publicPlayerId = res.publicPlayerId;
                            safeSessionStorage.setItem('ludo_public_player_id', res.publicPlayerId);
                        }
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
                        } else {
                            this.syncStoreWithRoom();
                        }
                        this.notify();
                    }
                });
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

        this.socket.on('chat_received', (chat: ChatBubble) => {
            this.recentChat = { ...chat, time: Date.now() };
            this.notify();

            // Show banter / speech bubble in Pixi board too
            if (bus.chat) {
                bus.chat(chat.p, chat.emoji ? `${chat.emoji} ${chat.text}` : chat.text, { voice: false });
            }
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
                    this.roomCode = res.roomCode;
                    this.myPlayerIndex = 0;
                    this.roomState = res.roomState;
                    if (res.publicPlayerId) {
                        this.publicPlayerId = res.publicPlayerId;
                        safeSessionStorage.setItem('ludo_public_player_id', res.publicPlayerId);
                    }
                    if (res.secretSessionToken) {
                        this.sessionToken = res.secretSessionToken;
                        safeSessionStorage.setItem('ludo_session_token', res.secretSessionToken);
                    }
                    safeSessionStorage.setItem('ludo_room_code', res.roomCode);
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
            const clean = roomCode.toUpperCase().trim();
            this.socket.emit('join_room', { roomCode: clean, name, avatar, sessionToken: this.sessionToken }, (res: any) => {
                if (res?.ok) {
                    this.roomCode = clean;
                    this.myPlayerIndex = res.playerIndex ?? null;
                    this.roomState = res.roomState;
                    if (res.publicPlayerId) {
                        this.publicPlayerId = res.publicPlayerId;
                        safeSessionStorage.setItem('ludo_public_player_id', res.publicPlayerId);
                    }
                    if (res.secretSessionToken) {
                        this.sessionToken = res.secretSessionToken;
                        safeSessionStorage.setItem('ludo_session_token', res.secretSessionToken);
                    }
                    safeSessionStorage.setItem('ludo_room_code', clean);
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

    public sendChat(text: string, emoji?: string) {
        if (!this.socket || !this.roomCode) return;
        this.socket.emit('chat_message', { roomCode: this.roomCode, sessionToken: this.sessionToken, text, emoji });
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
        this.roomCode = null;
        this.myPlayerIndex = null;
        this.roomState = null;
        this.movableTokens = [];
        this.offlineNotice = null;
        safeSessionStorage.removeItem('ludo_room_code');
        if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
            try {
                const cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            } catch {}
        }
        this.notify();
        store.patch({ phase: 'menu', modal: null });
    }
}

export const multiplayerClient = new MultiplayerClient();
