import { io, Socket } from 'socket.io-client';
import type { ClientRoomState, RoomPlayer } from '../../server/roomManager';
import { store } from '../state/store';
import { bus } from '../game/bus';
import { safeStorage } from '../state/storage';

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
        // Retrieve or generate persistent session token for reconnection
        let token = safeStorage.getItem('ludo_session_token');
        if (!token) {
            token = `tok_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
            safeStorage.setItem('ludo_session_token', token);
        }
        this.sessionToken = token;
        this.initSocket();
        this.startTimerTicker();
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

            // Auto-reconnect to room if was in one
            if (this.roomCode) {
                this.socket?.emit('sync_state', { roomCode: this.roomCode, sessionToken: this.sessionToken }, (res: any) => {
                    if (res?.ok && res.roomState) {
                        this.roomState = res.roomState;
                        const idx = res.roomState.players.findIndex((p: RoomPlayer | null) => p && p.id === this.sessionToken);
                        if (idx !== -1) this.myPlayerIndex = idx;
                        this.syncStoreWithRoom();
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
            const idx = state.players.findIndex((p) => p && p.id === this.sessionToken);
            if (idx !== -1) this.myPlayerIndex = idx;
            this.notify();
        });

        this.socket.on('game_started', (state: ClientRoomState) => {
            this.roomState = state;
            const idx = state.players.findIndex((p) => p && p.id === this.sessionToken);
            if (idx !== -1) this.myPlayerIndex = idx;
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

        this.socket.on('pawn_moved', (data: { p: number; dieIndex: number; tokenIndex: number; to: number; captures: { p: number; t: number }[]; reachedHome: boolean; diceUsed: [boolean, boolean] }) => {
            if (this.roomState) {
                this.roomState.tokens[data.p][data.tokenIndex] = data.to;
                this.roomState.diceUsed = data.diceUsed;
                for (const c of data.captures) {
                    this.roomState.tokens[c.p][c.t] = -1;
                }
            }
            this.notify();

            // Trigger local Pixi pawn move hop
            if (bus.onRemotePawnMoved) {
                bus.onRemotePawnMoved(data.p, data.dieIndex, data.tokenIndex, data.to, data.captures, data.reachedHome);
            }
        });

        this.socket.on('turn_changed', (data: { currentTurn: number; turnDeadline: number; extraTurn: boolean }) => {
            if (this.roomState) {
                this.roomState.currentTurn = data.currentTurn;
                this.roomState.turnDeadline = data.turnDeadline;
                this.roomState.dice = null;
                this.roomState.diceUsed = [true, true];
            }
            this.movableTokens = [];
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
                this.roomState.players[data.p]!.name = data.name;
            }
            this.notify();
        });

        this.socket.on('rematch_started', (state: ClientRoomState) => {
            this.roomState = state;
            this.notify();
        });
    }

    private startTimerTicker() {
        this.timerInterval = setInterval(() => {
            if (this.roomState && this.roomState.phase === 'playing' && this.roomState.turnDeadline > 0) {
                const diff = Math.max(0, Math.ceil((this.roomState.turnDeadline - Date.now()) / 1000));
                if (this.turnSecondsLeft !== diff) {
                    this.turnSecondsLeft = diff;
                    this.notify();
                }
            }
        }, 300);
    }

    private syncStoreWithRoom() {
        if (!this.roomState) return;
        const state = this.roomState;

        // Sync players to App store
        const active = [false, false, false, false];
        state.players.forEach((p, i) => {
            if (p) {
                active[i] = true;
                store.patchPlayer(i, {
                    name: p.name,
                    avatar: p.avatar,
                    ai: p.isAI,
                });
            }
        });

        store.patch({
            phase: 'playing',
            mode: 4,
            active,
            modal: null,
            gameId: store.get().gameId + 1,
            result: null,
            popup: null,
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
        return this.roomState.hostId === this.sessionToken;
    }

    public createRoom(name: string, avatar: string): Promise<{ ok: boolean; roomCode?: string; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket) return resolve({ ok: false, error: 'Socket not initialized' });
            this.socket.emit('create_room', { name, avatar, sessionToken: this.sessionToken }, (res: any) => {
                if (res?.ok && res.roomCode) {
                    this.roomCode = res.roomCode;
                    this.myPlayerIndex = 0;
                    this.roomState = res.roomState;
                    safeStorage.setItem('ludo_room_code', res.roomCode);
                    this.notify();
                }
                resolve(res || { ok: false, error: 'Network timeout' });
            });
        });
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
                    safeStorage.setItem('ludo_room_code', clean);
                    this.notify();
                }
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

    public rollDice(): Promise<{ ok: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ ok: false, error: 'No room' });
            this.socket.emit('dice_roll', { roomCode: this.roomCode, sessionToken: this.sessionToken }, (res: any) => {
                resolve(res || { ok: false });
            });
        });
    }

    public movePawn(dieIndex: number, tokenIndex: number): Promise<{ ok: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.roomCode) return resolve({ ok: false, error: 'No room' });
            this.socket.emit('move_pawn', { roomCode: this.roomCode, sessionToken: this.sessionToken, dieIndex, tokenIndex }, (res: any) => {
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
        this.roomCode = null;
        this.myPlayerIndex = null;
        this.roomState = null;
        this.movableTokens = [];
        this.offlineNotice = null;
        safeStorage.removeItem('ludo_room_code');
        this.notify();
        store.patch({ phase: 'menu', modal: null });
    }
}

export const multiplayerClient = new MultiplayerClient();
