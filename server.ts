import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { roomManager } from './server/roomManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000,
});

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// Broadcast callback so RoomManager can push events directly to Socket.io rooms
roomManager.setBroadcastCallback((roomCode: string, event: string, payload: any) => {
    io.to(roomCode).emit(event, payload);
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

// Socket.IO event router
io.on('connection', (socket) => {
    socket.on('create_room', (data: { name: string; avatar: string; sessionToken: string }, callback) => {
        try {
            const { name, avatar, sessionToken } = data || {};
            const res = roomManager.createRoom(sessionToken, name, avatar, socket.id);
            if (res.ok && res.roomCode) {
                socket.join(res.roomCode);
                const room = roomManager.getRoom(res.roomCode);
                const clientState = room ? roomManager.getClientRoomState(room) : null;
                if (typeof callback === 'function') {
                    callback({ ok: true, roomCode: res.roomCode, playerIndex: 0, roomState: clientState });
                }
            } else {
                if (typeof callback === 'function') callback({ ok: false, error: res.error });
            }
        } catch (e: any) {
            if (typeof callback === 'function') callback({ ok: false, error: e.message });
        }
    });

    socket.on('join_room', (data: { roomCode: string; name: string; avatar: string; sessionToken: string }, callback) => {
        try {
            const { roomCode, name, avatar, sessionToken } = data || {};
            const cleanCode = (roomCode || '').toUpperCase().trim();
            const res = roomManager.joinRoom(cleanCode, sessionToken, name, avatar, socket.id);
            if (res.ok) {
                socket.join(cleanCode);
                const room = roomManager.getRoom(cleanCode);
                const clientState = room ? roomManager.getClientRoomState(room) : null;
                if (typeof callback === 'function') {
                    callback({ ok: true, roomCode: cleanCode, playerIndex: res.playerIndex, roomState: clientState });
                }
            } else {
                if (typeof callback === 'function') callback({ ok: false, error: res.error });
            }
        } catch (e: any) {
            if (typeof callback === 'function') callback({ ok: false, error: e.message });
        }
    });

    socket.on('toggle_ready', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode, sessionToken } = data || {};
        const ok = roomManager.toggleReady(roomCode, sessionToken);
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

    socket.on('dice_roll', (data: { roomCode: string; sessionToken: string }, callback) => {
        const { roomCode, sessionToken } = data || {};
        const res = roomManager.rollDice(roomCode, sessionToken);
        if (typeof callback === 'function') callback(res);
    });

    socket.on('move_pawn', (data: { roomCode: string; sessionToken: string; dieIndex: number; tokenIndex: number }, callback) => {
        const { roomCode, sessionToken, dieIndex, tokenIndex } = data || {};
        const res = roomManager.movePawn(roomCode, sessionToken, dieIndex, tokenIndex);
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

    socket.on('disconnect', () => {
        roomManager.handleSocketDisconnect(socket.id);
    });
});

// Vite dev middleware or static dist file serving
async function startServer() {
    if (!isProduction) {
        const vite = await createViteServer({
            server: { middlewareMode: true, host: '0.0.0.0' },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.resolve(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Ludo Emperor Multiplayer Server running on http://0.0.0.0:${PORT}`);
    });
}

void startServer();
