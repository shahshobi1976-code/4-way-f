import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { roomManager } from './server/roomManager';
import { fetchLeaderboard, maskProfanity } from './server/supabaseRecords';
import type { AIPersonality } from './src/game/banter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env file if present
try {
    if (typeof process.loadEnvFile === 'function' && fs.existsSync(path.resolve(__dirname, '.env'))) {
        process.loadEnvFile(path.resolve(__dirname, '.env'));
    }
} catch {
    // Ignore error if env is already provided by environment
}

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: 256 * 1024,
});

function sanitizeAudioMime(rawMime?: string): string {
    const clean = String(rawMime || '').split(';')[0].trim().toLowerCase();
    if (clean === 'audio/wave' || clean === 'audio/x-wav' || clean === 'audio/wav') return 'audio/wav';
    if (clean === 'audio/webm') return 'audio/webm';
    if (clean === 'audio/mp4' || clean === 'audio/m4a' || clean === 'audio/x-m4a') return 'audio/mp4';
    if (clean === 'audio/aac') return 'audio/aac';
    if (clean === 'audio/ogg') return 'audio/ogg';
    if (clean === 'audio/mpeg' || clean === 'audio/mp3') return 'audio/mpeg';
    return 'audio/wav';
}

function extractAudioBuffer(payload: unknown): Buffer | null {
    if (!payload) return null;
    if (Buffer.isBuffer(payload)) return payload;
    if (payload instanceof ArrayBuffer) return Buffer.from(payload);
    if (ArrayBuffer.isView(payload)) {
        return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
    }
    if (typeof payload === 'object' && payload !== null && (payload as any).type === 'Buffer' && Array.isArray((payload as any).data)) {
        return Buffer.from((payload as any).data);
    }
    if (typeof payload === 'string') {
        const match = payload.match(/^data:audio\/[a-z0-9.+-]+(?:;[^,]*)?;base64,(.+)$/i);
        if (match && match[1]) {
            return Buffer.from(match[1], 'base64');
        }
    }
    return null;
}

function sniffMimeFromBuffer(buf: Buffer, fallbackMime: string): string {
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
        return 'audio/wav';
    }
    if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
        return 'audio/webm';
    }
    if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'OggS') {
        return 'audio/ogg';
    }
    if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') {
        return 'audio/mp4';
    }
    if (buf.length >= 3 && (buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) {
        return 'audio/mpeg';
    }
    return sanitizeAudioMime(fallbackMime);
}

function computeAudioDurationSec(buf: Buffer, mimeType: string, minSec = 1, maxSec = 7): number {
    if (
        mimeType === 'audio/wav' &&
        buf.length >= 44 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WAVE'
    ) {
        const byteRate = buf.readUInt32LE(28);
        if (byteRate > 0) {
            let dataBytes = buf.length - 44;
            if (buf.toString('ascii', 36, 40) === 'data') {
                const declared = buf.readUInt32LE(40);
                if (declared > 0 && declared <= buf.length - 44) {
                    dataBytes = declared;
                }
            }
            const sec = Math.round(dataBytes / byteRate);
            return Math.max(minSec, Math.min(maxSec, sec || minSec));
        }
    }
    const sec = Math.round(buf.byteLength / 2500);
    return Math.max(minSec, Math.min(maxSec, sec || minSec));
}

function resolvePort(): number {
    const portArgIdx = process.argv.indexOf('--port');
    if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
        return Number(process.argv[portArgIdx + 1]);
    }
    for (const arg of process.argv) {
        if (arg.startsWith('--port=')) {
            return Number(arg.split('=')[1]);
        }
    }
    if (process.env.PORT && process.env.PORT !== '8080') {
        return Number(process.env.PORT);
    }
    return 3000;
}

const PORT = resolvePort();
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// Broadcast callback so RoomManager can push events directly to Socket.io rooms
roomManager.setBroadcastCallback((roomCode: string, event: string, payload: any) => {
    io.to(roomCode).emit(event, payload);
});

// Strict per-IP sliding window rate limiter for REST / proxy endpoints
const apiRateWindows = new Map<string, number[]>();
const API_RATE_LIMIT_MAX = 60;
const API_RATE_WINDOW_MS = 60_000;

app.use('/api', (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const history = (apiRateWindows.get(ip) || []).filter((t) => now - t < API_RATE_WINDOW_MS);
    if (history.length >= API_RATE_LIMIT_MAX) {
        apiRateWindows.set(ip, history);
        return res.status(429).json({ ok: false, error: 'Too many API requests. Please slow down.' });
    }
    history.push(now);
    apiRateWindows.set(ip, history);
    if (apiRateWindows.size > 2000) {
        for (const [k, v] of apiRateWindows.entries()) {
            if (v.every((t) => now - t >= API_RATE_WINDOW_MS)) apiRateWindows.delete(k);
        }
    }
    return next();
});

// REST Health and Room endpoints
app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
});

app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params?.code || '').trim().toUpperCase();
    const room = roomManager.getRoom(code);
    if (!room) {
        return res.status(404).json({ ok: false, error: 'Room not found' });
    }
    return res.json({ ok: true, room: roomManager.getClientRoomState(room) });
});

// Public Leaderboard API from game4.leaderboard view
app.get('/api/leaderboard', async (_req, res) => {
    const result = await fetchLeaderboard();
    if (!result.ok) {
        return res.status(500).json({ ok: false, error: result.error });
    }
    return res.json({ ok: true, leaderboard: result.data });
});

// Socket.IO event router
io.on('connection', (socket) => {
    const clientIp = socket.handshake.address || '127.0.0.1';

    socket.on('create_room', (data: { name: string; avatar: string; sessionToken?: string; turnTimeSec?: number; maxPlayers?: number }, callback) => {
        try {
            const { name, avatar, sessionToken, turnTimeSec, maxPlayers } = data || {};
            const res = roomManager.createRoom(sessionToken, name, avatar, socket.id, turnTimeSec, maxPlayers, clientIp);
            if (res.ok && res.roomCode) {
                socket.join(res.roomCode);
                socket.join(`ludo:${res.roomCode}`);
                const room = roomManager.getRoom(res.roomCode);
                const clientState = room ? roomManager.getClientRoomState(room) : null;
                if (typeof callback === 'function') {
                    callback({
                        ok: true,
                        roomCode: res.roomCode,
                        playerIndex: 0,
                        publicPlayerId: res.publicPlayerId,
                        secretSessionToken: res.secretSessionToken,
                        roomState: clientState,
                    });
                }
            } else {
                if (typeof callback === 'function') callback({ ok: false, error: res.error });
            }
        } catch (e: any) {
            if (typeof callback === 'function') callback({ ok: false, error: e.message });
        }
    });

    socket.on('set_turn_time', (data: { roomCode: string; sessionToken: string; turnTimeSec: number }, callback) => {
        const { roomCode, sessionToken, turnTimeSec } = data || {};
        const ok = roomManager.setTurnTime(roomCode, sessionToken, turnTimeSec);
        if (typeof callback === 'function') callback({ ok });
    });

    socket.on('join_room', (data: { roomCode: string; name: string; avatar: string; sessionToken?: string }, callback) => {
        try {
            const { roomCode, name, avatar, sessionToken } = data || {};
            const cleanCode = String(roomCode || '').trim().toUpperCase();
            const res = roomManager.joinRoom(cleanCode, sessionToken, name, avatar, socket.id, clientIp);
            if (res.ok) {
                socket.join(cleanCode);
                socket.join(`ludo:${cleanCode}`);
                const room = roomManager.getRoom(cleanCode);
                const clientState = room ? roomManager.getClientRoomState(room) : null;
                if (typeof callback === 'function') {
                    callback({
                        ok: true,
                        roomCode: cleanCode,
                        playerIndex: res.playerIndex,
                        publicPlayerId: res.publicPlayerId,
                        secretSessionToken: res.secretSessionToken,
                        roomState: clientState,
                    });
                }
            } else {
                if (typeof callback === 'function') callback({ ok: false, error: res.error });
            }
        } catch (e: any) {
            if (typeof callback === 'function') callback({ ok: false, error: e.message });
        }
    });

    socket.on('ludo:reconnect', (data: { roomCode: string; token: string }, callback) => {
        const { roomCode, token } = data || {};
        const cleanCode = String(roomCode || '').trim().toUpperCase();
        const res = roomManager.reconnectPlayer(cleanCode, token, socket.id);
        if (res.ok) {
            socket.join(cleanCode);
            socket.join(`ludo:${cleanCode}`);
            const room = roomManager.getRoom(cleanCode);
            if (typeof callback === 'function') {
                callback({
                    ok: true,
                    roomCode: cleanCode,
                    playerIndex: res.playerIndex,
                    publicPlayerId: res.publicPlayerId,
                    roomState: room ? roomManager.getClientRoomState(room) : null,
                });
            }
        } else {
            if (typeof callback === 'function') callback({ ok: false, error: res.error });
        }
    });

    socket.on('ludo:match_ended', async (data: { roomCode: string; token: string }, callback) => {
        const { roomCode, token } = data || {};
        const res = await roomManager.endMatchAndRecord(roomCode, token, clientIp);
        if (typeof callback === 'function') callback(res);
    });

    socket.on('toggle_ready', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode, sessionToken } = data || {};
        const ok = roomManager.toggleReady(roomCode, sessionToken);
        if (typeof callback === 'function') callback({ ok });
    });

    socket.on('set_wish', (data: { roomCode: string; sessionToken: string; wish: [number, number] | null }, callback) => {
        const { roomCode, sessionToken, wish } = data || {};
        const ok = roomManager.setPlayerWish(roomCode, sessionToken, wish);
        if (typeof callback === 'function') callback({ ok });
    });

    socket.on('toggle_fill_bots', (data: { roomCode: string; sessionToken: string; fillBots: boolean }, callback) => {
        const { roomCode, sessionToken, fillBots } = data || {};
        const ok = roomManager.toggleFillBots(roomCode, sessionToken, fillBots);
        if (typeof callback === 'function') callback({ ok });
    });

    socket.on('set_seat_personality', (data: { roomCode: string; sessionToken: string; seatIndex: number; personality: AIPersonality }, callback) => {
        const { roomCode, sessionToken, seatIndex, personality } = data || {};
        const ok = roomManager.setSeatPersonality(roomCode, sessionToken, seatIndex, personality);
        if (typeof callback === 'function') callback({ ok });
    });

    socket.on('start_game', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode, sessionToken } = data || {};
        const res = roomManager.startGame(roomCode, sessionToken);
        if (typeof callback === 'function') callback(res);
    });

    socket.on('dice_roll', (data: { roomCode: string; sessionToken: string; useWish?: boolean }, callback) => {
        const { roomCode, sessionToken, useWish } = data || {};
        const res = roomManager.rollDice(roomCode, sessionToken, false, !!useWish);
        if (typeof callback === 'function') callback(res);
    });

    socket.on('move_pawn', (data: { roomCode: string; sessionToken: string; dieIndex: number | 'combined'; tokenIndex: number; action?: 'gul' | 'pass' }, callback) => {
        const { roomCode, sessionToken, dieIndex, tokenIndex, action } = data || {};
        const res = roomManager.movePawn(roomCode, sessionToken, dieIndex, tokenIndex, action);
        if (typeof callback === 'function') callback(res);
    });

    socket.on('chat_message', (data: { roomCode: string; sessionToken: string; text: string; emoji?: string }, callback) => {
        const { roomCode, sessionToken, text, emoji } = data || {};
        const ok = roomManager.sendChat(roomCode, sessionToken, text, emoji);
        if (typeof callback === 'function') callback({ ok });
    });

    socket.on(
        'ludo:chat',
        (data: { roomCode: string; sessionToken?: string; token?: string; text?: string; emoji?: string }, callback) => {
            const { roomCode, sessionToken, token, text, emoji } = data || {};
            const auth = roomManager.verifySender(roomCode, sessionToken || token || '', socket.id);
            if (!auth.ok) {
                if (typeof callback === 'function') callback({ success: false, error: auth.error });
                return;
            }
            const waitMs = roomManager.checkSocialCooldown(auth.room.code, auth.seatIndex, 'chat', 800);
            if (waitMs > 0) {
                if (typeof callback === 'function') callback({ success: false, error: 'Slow down a moment', retryAfterMs: waitMs });
                return;
            }
            const cleanText = maskProfanity(String(text || '').replace(/[<>]/g, '').trim().slice(0, 120));
            const cleanEmoji = emoji ? Array.from(String(emoji).trim()).slice(0, 8).join('') : undefined;
            if (!cleanText && !cleanEmoji) {
                if (typeof callback === 'function') callback({ success: false, error: 'Empty message' });
                return;
            }
            const messageCount = roomManager.incrementMessageCount(auth.room);
            const payload = {
                sender: auth.player.name,
                avatar: auth.player.avatar,
                text: cleanText,
                emoji: cleanEmoji,
                seatIndex: auth.seatIndex,
                timestamp: Date.now(),
                messageCount,
            };
            io.to(`ludo:${auth.room.code}`).emit('ludo:chat', payload);
            if (typeof callback === 'function') callback({ success: true, messageCount });
        },
    );

    socket.on(
        'ludo:reaction',
        (data: { roomCode: string; sessionToken?: string; token?: string; emoji?: string }, callback) => {
            const { roomCode, sessionToken, token, emoji } = data || {};
            const auth = roomManager.verifySender(roomCode, sessionToken || token || '', socket.id);
            if (!auth.ok) {
                if (typeof callback === 'function') callback({ success: false, error: auth.error });
                return;
            }
            const waitMs = roomManager.checkSocialCooldown(auth.room.code, auth.seatIndex, 'reaction', 250);
            if (waitMs > 0) {
                if (typeof callback === 'function') callback({ success: false, error: 'Too many reactions', retryAfterMs: waitMs });
                return;
            }
            const cleanEmoji = Array.from(String(emoji || '').trim()).slice(0, 8).join('');
            if (!cleanEmoji) {
                if (typeof callback === 'function') callback({ success: false, error: 'Empty emoji' });
                return;
            }
            io.to(`ludo:${auth.room.code}`).emit('ludo:reaction', {
                seatIndex: auth.seatIndex,
                emoji: cleanEmoji,
                sender: auth.player.name,
                timestamp: Date.now(),
            });
            if (typeof callback === 'function') callback({ success: true });
        },
    );

    socket.on(
        'ludo:voice',
        (data: { roomCode: string; sessionToken?: string; token?: string; audio?: unknown; mimeType?: string }, callback) => {
            const { roomCode, sessionToken, token, audio, mimeType } = data || {};
            const auth = roomManager.verifySender(roomCode, sessionToken || token || '', socket.id);
            if (!auth.ok) {
                if (typeof callback === 'function') callback({ success: false, error: auth.error });
                return;
            }
            const waitMs = roomManager.checkSocialCooldown(auth.room.code, auth.seatIndex, 'voice', 2500);
            if (waitMs > 0) {
                if (typeof callback === 'function') callback({ success: false, error: 'Please wait before next voice note', retryAfterMs: waitMs });
                return;
            }
            const buf = extractAudioBuffer(audio);
            if (!buf || buf.byteLength === 0) {
                if (typeof callback === 'function') callback({ success: false, error: 'Invalid audio payload' });
                return;
            }
            if (buf.byteLength > 80_000) {
                if (typeof callback === 'function') callback({ success: false, error: 'Voice note exceeds 80KB limit' });
                return;
            }
            const safeMime = sniffMimeFromBuffer(buf, sanitizeAudioMime(mimeType));
            const duration = computeAudioDurationSec(buf, safeMime, 1, 7);
            const messageCount = roomManager.incrementMessageCount(auth.room);

            io.to(`ludo:${auth.room.code}`).emit('ludo:voice', {
                sender: auth.player.name,
                avatar: auth.player.avatar,
                seatIndex: auth.seatIndex,
                audio: buf,
                mimeType: safeMime,
                duration,
                timestamp: Date.now(),
                messageCount,
            });
            if (typeof callback === 'function') callback({ success: true, duration, messageCount });
        },
    );

    socket.on(
        'voice:whisper',
        (
            data: {
                roomCode: string;
                sessionToken?: string;
                token?: string;
                toSeats?: number[];
                clip?: unknown;
                mimeType?: string;
            },
            callback,
        ) => {
            const { roomCode, sessionToken, token, toSeats, clip, mimeType } = data || {};
            const auth = roomManager.verifySender(roomCode, sessionToken || token || '', socket.id);
            if (!auth.ok) {
                if (typeof callback === 'function') callback({ success: false, error: auth.error });
                return;
            }
            if (!Array.isArray(toSeats) || toSeats.length === 0) {
                if (typeof callback === 'function') callback({ success: false, error: 'Select at least one opponent' });
                return;
            }

            const requested = Array.from(
                new Set(toSeats.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 3 && n !== auth.seatIndex)),
            );
            if (requested.length === 0) {
                if (typeof callback === 'function') callback({ success: false, error: 'Invalid whisper target seat(s)' });
                return;
            }

            const validTargets: { seat: number; socketId: string; name: string }[] = [];
            for (const seat of requested) {
                const target = auth.room.players[seat];
                if (!target) {
                    if (typeof callback === 'function') callback({ success: false, error: 'Empty seat cannot receive whispers' });
                    return;
                }
                if (target.isAI) {
                    if (typeof callback === 'function') callback({ success: false, error: 'Cannot whisper to AI bots' });
                    return;
                }
                if (!target.connected || !target.socketId) {
                    if (typeof callback === 'function') callback({ success: false, error: `${target.name} is disconnected` });
                    return;
                }
                validTargets.push({ seat, socketId: target.socketId, name: target.name });
            }

            const buf = extractAudioBuffer(clip);
            if (!buf || buf.byteLength === 0) {
                if (typeof callback === 'function') callback({ success: false, error: 'Invalid whisper audio clip' });
                return;
            }
            if (buf.byteLength > 60_000) {
                if (typeof callback === 'function') callback({ success: false, error: 'Whisper clip exceeds 60KB limit' });
                return;
            }

            const waitMs = roomManager.checkSocialCooldown(auth.room.code, auth.seatIndex, 'whisper', 5000);
            if (waitMs > 0) {
                if (typeof callback === 'function') callback({ success: false, error: 'Please wait before sending another whisper', retryAfterMs: waitMs });
                return;
            }

            const safeMime = sniffMimeFromBuffer(buf, sanitizeAudioMime(mimeType));
            const duration = computeAudioDurationSec(buf, safeMime, 1, 6);
            const timestamp = Date.now();
            const whisperId = `wh_${auth.seatIndex}_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;

            // Relay audio ONLY to selected recipient socket IDs — never broadcast audio to room
            for (const target of validTargets) {
                io.to(target.socketId).emit('voice:whisper', {
                    id: whisperId,
                    fromSeat: auth.seatIndex,
                    senderName: auth.player.name,
                    senderAvatar: auth.player.avatar,
                    toSeat: target.seat,
                    toSeats: validTargets.map((t) => t.seat),
                    clip: buf,
                    mimeType: safeMime,
                    duration,
                    timestamp,
                });
            }

            // Transparent mode: notify room metadata-only (no audio)
            if (!auth.room.secretWhispers) {
                io.to(`ludo:${auth.room.code}`).emit('ludo:whisper_notice', {
                    fromSeat: auth.seatIndex,
                    senderName: auth.player.name,
                    toSeats: validTargets.map((t) => t.seat),
                    targetNames: validTargets.map((t) => t.name),
                    timestamp,
                });
            }

            if (typeof callback === 'function') {
                callback({ success: true, duration, deliveredTo: validTargets.map((t) => t.seat) });
            }
        },
    );

    socket.on(
        'ludo:toggle_secret_whispers',
        (data: { roomCode: string; sessionToken?: string; token?: string; secretWhispers?: boolean }, callback) => {
            const { roomCode, sessionToken, token, secretWhispers } = data || {};
            const res = roomManager.toggleSecretWhispers(roomCode, sessionToken || token || '', socket.id, secretWhispers);
            if (res.ok && res.room) {
                io.to(`ludo:${res.room.code}`).emit('ludo:secret_whispers_changed', {
                    secretWhispers: !!res.secretWhispers,
                });
                if (typeof callback === 'function') callback({ success: true, secretWhispers: !!res.secretWhispers });
            } else if (typeof callback === 'function') {
                callback({ success: false, error: res.error || 'Failed to toggle secret whispers' });
            }
        },
    );

    socket.on('vote_rematch', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode, sessionToken } = data || {};
        const res = roomManager.voteRematch(roomCode, sessionToken);
        if (typeof callback === 'function') callback(res);
    });

    socket.on('sync_state', (data: { roomCode: string; sessionToken: string }, callback) => {
        const cleanCode = String(data?.roomCode || '').trim().toUpperCase();
        const room = roomManager.getRoom(cleanCode);
        if (room && typeof callback === 'function') {
            callback({ ok: true, roomState: roomManager.getClientRoomState(room) });
        } else if (typeof callback === 'function') {
            callback({ ok: false, error: 'Room not found' });
        }
    });

    socket.on('leave_room', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode, sessionToken } = data || {};
        const clean = String(roomCode || '').trim().toUpperCase();
        if (clean) {
            socket.leave(clean);
            socket.leave(`ludo:${clean}`);
        }
        const ok = roomManager.leaveRoom(clean, sessionToken);
        if (typeof callback === 'function') callback({ ok });
    });

    socket.on('disconnect', () => {
        roomManager.handleSocketDisconnect(socket.id);
    });
});

server.on('error', (err: any) => {
    console.error('Server listen error:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception in server process:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection in server process:', reason);
});

const handleGracefulShutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}, saving room snapshots...`);
    roomManager.shutdown();
    process.exit(0);
};
process.once('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.once('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

// Vite dev middleware or static dist file serving
async function startServer() {
    // Listen immediately so port 3000 and /api/health respond within milliseconds
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`  VITE v6 ready in dev server`);
        console.log(`  ➜  Local:   http://localhost:${PORT}/`);
        console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
        console.log(`Ludo Dethroned Multiplayer Server running on http://0.0.0.0:${PORT}`);
    });

    if (!isProduction) {
        const vite = await createViteServer({
            server: { middlewareMode: true, host: '0.0.0.0', hmr: false },
            appType: 'spa',
        });
        app.use(vite.middlewares);
        // Fallback for SPA routing in dev mode
        app.use(async (req, res, next) => {
            if (req.method !== 'GET') return next();
            const url = req.originalUrl;
            try {
                const indexPath = path.resolve(__dirname, 'index.html');
                let template = await fs.promises.readFile(indexPath, 'utf-8');
                template = await vite.transformIndexHtml(url, template);
                res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
            } catch (e) {
                next(e);
            }
        });
    } else {
        const distPath = path.resolve(__dirname, 'dist');
        app.use(express.static(distPath));
        app.use((_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }
}

void startServer();
