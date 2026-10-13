// Zero-dependency static server for the built game (Node 18+).
//
// Why this exists: opening dist/index.html straight from disk does NOT work.
// The build loads Pixi.js as dynamic chunks, and browsers refuse those over
// file:// (opaque origin), so you get a black screen. This serves the same
// files over http://localhost instead, which is all the game needs.
//
//   node serve.mjs            -> serves dist on the first free port from 8080
//   node serve.mjs 5000       -> serves dist on port 5000
//   node serve.mjs 5000 dev   -> serves the source tree via Vite instead

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

// This script is happy anywhere in the project: walk up from its own folder
// until a served build turns up (dist/ or the web variant dist-web/), so it works
// from the project root or from a subfolder beside it.
function findProjectRoot(start) {
    let dir = start;
    for (let i = 0; i < 4; i++) {
        if (existsSync(join(dir, 'dist-web', 'index.web.html'))) return dir;
        if (existsSync(join(dir, 'dist', 'index.html'))) return dir;
        const parent = resolve(dir, '..');
        if (parent === dir) break;
        dir = parent;
    }
    return start;
}

const root = findProjectRoot(resolve(import.meta.dirname));
const useVite = process.argv[3] === 'dev' || process.argv[2] === 'dev';
/**
 * Which build to serve:
 *   node serve.mjs <port> web     -> the multi-file web build (default)
 *   node serve.mjs <port> mobile  -> the single-file MOBILE build
 *   node serve.mjs <port> single  -> the single-file WEB build
 *   node serve.mjs <port> dev     -> the Vite dev server
 */
const modes = ['web', 'mobile', 'single', 'dev'];
const mode = modes.includes(process.argv[2]) ? process.argv[2] : (modes.includes(process.argv[3]) ? process.argv[3] : 'web');

function pickBuild() {
    if (mode === 'mobile') {
        if (existsSync(join(root, 'dist-mobile', 'index.mobile.html'))) return { dir: join(root, 'dist-mobile'), entry: 'index.mobile.html' };
        if (existsSync(join(root, 'PLAY-MOBILE.html'))) return { dir: root, entry: 'PLAY-MOBILE.html' };
    }
    if (mode === 'single') {
        if (existsSync(join(root, 'dist-web', 'index.web.html'))) return { dir: join(root, 'dist-web'), entry: 'index.web.html' };
        if (existsSync(join(root, 'PLAY-WEB.html'))) return { dir: root, entry: 'PLAY-WEB.html' };
    }
    // 'web' (default): the multi-file build if it exists, else the single file
    if (existsSync(join(root, 'dist', 'index.html'))) return { dir: join(root, 'dist'), entry: 'index.html' };
    if (existsSync(join(root, 'dist-web', 'index.web.html'))) return { dir: join(root, 'dist-web'), entry: 'index.web.html' };
    return { dir: join(root, 'dist'), entry: 'index.html' };
}

const picked = pickBuild();
const distDir = picked.dir;
const distEntry = picked.entry;
const portArg = Number(process.argv.find((a) => /^\d+$/.test(a)));

if (useVite) {
    if (!existsSync(join(root, 'node_modules', 'vite'))) {
        console.error('Source mode needs dependencies first. Run:  npm install');
        process.exit(1);
    }
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(portArg || 5173), '--strictPort'], {
        cwd: root,
        stdio: 'inherit',
    });
    child.on('exit', (code) => process.exit(code ?? 0));
} else {
    if (!existsSync(join(distDir, distEntry))) {
        console.error('No built game found. Build it first:\n  npm install\n  npm run build:bundled          (the web build)\n  mob build -> set SINGLE_TARGET=mobile for the mobile build');
        process.exit(1);
    }

    const MIME = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.map': 'application/json; charset=utf-8',
    };

    // ---- online multiplayer rooms -------------------------------------------
    // The room relay shares this port, so players only need one address:
    //   http://host:8080/?room=4F7K
    // Resolved against the project root, so this script also works from a
    // subfolder (e.g. "Run with local server/").
    const { createRoomServer } = await import(pathToFileURL(join(root, 'server', 'rooms.mjs')).href);
    let currentPort = portArg || 8080;
    let rooms = null; // created just below
    const lanAddresses = () => {
        const out = [];
        try {
            for (const list of Object.values(networkInterfaces())) {
                for (const ni of list ?? []) {
                    if (ni.family === 'IPv4' && !ni.internal) out.push(`http://${ni.address}:${currentPort}/`);
                }
            }
        } catch { /* no interfaces: not fatal */ }
        return out;
    };

    const server = createServer(async (req, res) => {
        // Test hook: lets an automated check report what a headless client saw.
        // Writes to tmp/beacons.log and echoes the payload back.
        if (req.url && req.url.startsWith('/beacon')) {
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                try {
                    const dir = join(root, 'tmp');
                    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                    appendFileSync(join(dir, 'beacons.log'), `${Date.now()} ${body}\n`);
                } catch { /* best effort */ }
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end('{"ok":true}');
            });
            return;
        }
        // tiny endpoint so the client can confirm multiplayer is available
        if (req.url && req.url.startsWith('/rooms')) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
            res.end(JSON.stringify({ ok: true, rooms: rooms.roomCount(), lanUrls: lanAddresses() }));
            return;
        }
        try {
            const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            let target = join(distDir, normalize(urlPath).replace(/^([/\\])+/, ''));
            // never serve outside dist/
            if (target !== distDir && !target.startsWith(distDir + sep)) {
                res.writeHead(403).end('Forbidden');
                return;
            }
            const info = existsSync(target) ? await stat(target) : null;
            if (info?.isDirectory()) target = join(target, distEntry);
            const body = await readFile(target);
            res.writeHead(200, {
                'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
                'Cache-Control': 'no-cache',
            });
            res.end(body);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        }
    });

    // the room relay shares the same port
    rooms = createRoomServer({ getLanUrls: lanAddresses });
    server.on('upgrade', (req, socket, head) => {
        if (req.url && req.url.startsWith('/ws')) rooms.handleUpgrade(req, socket, head);
        else socket.destroy();
    });

    const listen = (port, attemptsLeft) => {
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
                listen(port + 1, attemptsLeft - 1);
                return;
            }
            console.error('Could not start server:', err.message);
            process.exit(1);
        });
        // Bind to every interface so a phone on the same Wi-Fi can reach the game.
        // (Use 127.0.0.1 only if you want it locked to this PC.)
        server.listen(port, '0.0.0.0', () => {
            const url = `http://127.0.0.1:${port}/`;
            console.log(`\n  Ludo Emperor 4 Way is running at ${url}\n`);
            // also print the LAN address so you can open the game on a phone
            try {
                for (const list of Object.values(networkInterfaces())) {
                    for (const ni of list ?? []) {
                        if (ni.family === 'IPv4' && !ni.internal) {
                            console.log(`  On your phone (same Wi-Fi):  http://${ni.address}:${port}/`);
                        }
                    }
                }
            } catch {
                /* no network info: the localhost URL above still works */
            }
            console.log('\n  Keep this window open while you play. Press Ctrl+C to stop.\n');
            // best-effort: open the default browser
            try {
                const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
                    : process.platform === 'darwin' ? ['open', [url]]
                    : ['xdg-open', [url]];
                spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
            } catch {
                /* the URL is printed above either way */
            }
        });
    };

    listen(portArg || 8080, 25);
}
