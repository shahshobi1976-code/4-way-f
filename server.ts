import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { roomManager } from './server/roomManager';
import { fetchLeaderboard } from './server/supabaseRecords';

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
});

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
    const code = String(req.params.code || '').toUpperCase().trim();
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
            const cleanCode = (roomCode || '').toUpperCase().trim();
            const res = roomManager.joinRoom(cleanCode, sessionToken, name, avatar, socket.id, clientIp);
            if (res.ok) {
                socket.join(cleanCode);
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
        const cleanCode = (roomCode || '').toUpperCase().trim();
        const res = roomManager.reconnectPlayer(cleanCode, token, socket.id);
        if (res.ok) {
            socket.join(cleanCode);
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

    socket.on('move_pawn', (data: { roomCode: string; sessionToken: string; dieIndex: number; tokenIndex: number; action?: 'gul' | 'pass' }, callback) => {
        const { roomCode, sessionToken, dieIndex, tokenIndex, action } = data || {};
        const res = roomManager.movePawn(roomCode, sessionToken, dieIndex, tokenIndex, action);
        if (typeof callback === 'function') callback(res);
    });

    socket.on('chat_message', (data: { roomCode: string; sessionToken: string; text: string; emoji?: string }, callback) => {
        const { roomCode, sessionToken, text, emoji } = data || {};
        const ok = roomManager.sendChat(roomCode, sessionToken, text, emoji);
        if (typeof callback === 'function') callback({ ok });
    });

    socket.on('vote_rematch', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode, sessionToken } = data || {};
        const res = roomManager.voteRematch(roomCode, sessionToken);
        if (typeof callback === 'function') callback(res);
    });

    socket.on('sync_state', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode } = data || {};
        const room = roomManager.getRoom(roomCode);
        if (room && typeof callback === 'function') {
            callback({ ok: true, roomState: roomManager.getClientRoomState(room) });
        } else if (typeof callback === 'function') {
            callback({ ok: false, error: 'Room not found' });
        }
    });

    socket.on('leave_room', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode, sessionToken } = data || {};
        const ok = roomManager.leaveRoom(roomCode, sessionToken);
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
