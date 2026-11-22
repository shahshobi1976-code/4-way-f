// The Ludo Dethroned game scene: tilted/rotating pseudo-3D board, 3D-style pawns, two dice,
// computer players that gang up on the leader, penalties, Lucky Seven, talk and sound.
import { Application, Circle, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type { Stage } from './stage';
import { store, shouldShowCaptureWarning, type PlayerCfg } from '../state/store';
import { multiplayerClient } from '../network/multiplayerClient';
import { recordMatchStarted } from '../state/persist';
import { bus, type NameplateBound } from './bus';
import { tr, colorName } from '../i18n';
import {
    BASE_CENTER, BASE_SPOTS, COLORS, HOME, HOME_COL, IN_BASE, LAST_TRACK, PATH_START, SAFE, STAR_IDX, START_IDX, TRACK,
    boardPos, evaluateCaptureObligation, fineProgress, globalIdx, hasWon, isLuckySum, legalMovesForTurn, luckySevenAllowed,
    newTokens, offendingTokensForPenalty, percent, pickBestAIMove, randDie, type CaptureObligation, type Move, type Tokens,
} from './rules';
import { BG_BASE, circlePts, drawBackground, drawDie, drawPawn, mix, shade, starPts } from './draw';
import { TOKEN_URLS_BY_PLAYER, getCachedPawnTexture, loadPawnTexture } from './tokenAssets';
import * as sfx from './sfx';
import * as banter from './banter';
import type { AIPersonality, BanterEvent, Cat } from './banter';
import {
    BANTER_HIGH_PRIORITY_COOLDOWN_MS,
    BANTER_ROUTINE_COOLDOWN_MS,
    HIGH_PRIORITY_BANTER_EVENTS,
    getPersonalityForSeat,
    pickBanterLine,
} from './banter';

export interface SceneOpts {
    players: PlayerCfg[];
    active: boolean[];
    lang: string;
}
export interface Scene {
    destroy(): void;
}

const F = 34; // perspective focal distance in board units
const SPEED = 0.5; // whole game runs at half speed (as requested)
const BOARD_SPEED = 0.8; // camera turns/tilts at 0.8x
const YAW_FOR = [-90, 180, 90, 0]; // rotate board so colour c sits bottom-left
const DEFAULT_NAMES = ['red', 'green', 'yellow', 'cyan'];
const TOKEN_SIZE_SCALE = 0.75; // token size scaled to 0.75x

interface Tween {
    tok: TokView;
    pts: [number, number][];
    seg: number;
    u: number;
    stepMs: number;
    hop: number;
    done: () => void;
}
interface TokView {
    p: number;
    t: number;
    c: Container;
    body: Graphics;
    sprite?: Sprite;
    shadow: Graphics;
    ring: Graphics;
    vx: number;
    vy: number;
    vz: number;
    tween: Tween | null;
    movable: boolean;
    flash: number; // ms of red penalty ring left
    phase: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function createLudoScene(app: Application, stage: Stage, opts: SceneOpts): Scene {
    let lang = opts.lang; // follows the Settings language live
    const active = opts.active.slice();
    const cfgs = opts.players;
    const root = stage.root;
    let dead = false;

    // ---------------------------------------------------------------- layers
    const bgFill = new Graphics();
    const bgG = new Graphics();
    const boardG = new Graphics();
    const shadowLayer = new Container();
    const tokenLayer = new Container();
    tokenLayer.sortableChildren = true;
    const plateLayer = new Container();
    const flyLayer = new Container();
    const uiLayer = new Container();
    const handLayer = new Container();
    root.addChild(bgFill, bgG, boardG, shadowLayer, tokenLayer, plateLayer, flyLayer, uiLayer, handLayer);

    const isOnline = () => {
        return Boolean(
            multiplayerClient.roomCode &&
            multiplayerClient.roomState &&
            multiplayerClient.roomState.phase === 'playing'
        );
    };

    // ---------------------------------------------------------------- game state
    const tokens: Tokens = (isOnline() && multiplayerClient.roomState?.tokens)
        ? multiplayerClient.roomState.tokens.map((r) => r.slice())
        : newTokens();
    let current = (isOnline() && multiplayerClient.roomState?.currentTurn !== undefined)
        ? multiplayerClient.roomState.currentTurn
        : active.findIndex((a) => a);
    let winner = -1;
    let ranking: { idx: number; pct: number }[] = [];
    const wishUsed = [false, false, false, false];

    // Track matches played locally for Newcomers (first 3 matches) vs Always/Off setting
    const matchCount = recordMatchStarted();
    const captureWarningActive = () => shouldShowCaptureWarning(store.get().settings.captureWarningMode, matchCount);
    let turnCapturePromise = 0;
    let turnCapturesTaken = 0;
    let turnObligation: CaptureObligation | null = null;
    const turnTokensCaptured = new Set<number>();
    const turnMovedToSquare = new Map<number, string>();

    let dice: [number, number] = [5, 2];
    let diceUsed: [boolean, boolean] = [true, true];
    let selDie = 0;
    // humans pick the die explicitly; dieConfirmed is true once they have, and
    // dieFlash briefly highlights the dice when they try to skip that step
    let dieConfirmed = false;
    let dieFlash = 0;
    let diceColor = COLORS[current];
    let waitRoll: ((forced?: [number, number]) => void) | null = null;
    let waitRollTarget = -1;
    let waitChoice: ((m?: Move) => void) | null = null;
    let optionsNow: Move[] = [];
    let turnChangeResolver: ((newTurn: number) => void) | null = null;
    let statusText = '';

    const cleanPlayerName = (raw: string): string => {
        if (!raw) return '';
        return raw.replace(/\s*#[a-zA-Z0-9_-]+$/, '').trim();
    };

    const nameOf = (p: number): string => {
        const raw = (cfgs[p]?.name || '').trim();
        const n = cleanPlayerName(raw);
        if (!n || DEFAULT_NAMES.includes(n.toLowerCase()) || n === colorName(lang, p)) return colorName(lang, p);
        return n;
    };
    const plateName = (p: number) => nameOf(p).toUpperCase();
    const avatarOf = (p: number) => cfgs[p]?.avatar || '🎲';

    const isAI = (p: number) => {
        if (isOnline()) {
            return !!multiplayerClient.roomState?.players[p]?.isAI;
        }
        return !!cfgs[p]?.ai || !!store.get().players[p]?.ai;
    };
    const nextActive = (p: number) => {
        for (let i = 1; i <= 4; i++) {
            const q = (p + i) % 4;
            if (active[q]) return q;
        }
        return p;
    };

    function publish() {
        store.patch({
            progress: [0, 1, 2, 3].map((p) => (active[p] ? percent(tokens, p) : 0)),
            current,
        });
    }

    // ---------------------------------------------------------------- timers / tweens (ticker clock + abort-safe)
    let clock = 0;
    const timers: { t: number; cb: () => void }[] = [];
    const turnAbortCallbacks = new Set<() => void>();
    const bumpTurnEpoch = () => {
        turnEpoch++;
        const cbs = Array.from(turnAbortCallbacks);
        turnAbortCallbacks.clear();
        for (const cb of cbs) {
            try { cb(); } catch {}
        }
    };
    const delay = (ms: number, abortOnTurnChange = false) => new Promise<void>((res) => {
        let done = false;
        let wallTimer: ReturnType<typeof setTimeout> | null = null;
        const finishDelay = () => {
            if (done) return;
            done = true;
            if (wallTimer !== null) {
                clearTimeout(wallTimer);
                wallTimer = null;
            }
            turnAbortCallbacks.delete(finishDelay);
            res();
        };
        if (abortOnTurnChange) {
            turnAbortCallbacks.add(finishDelay);
        }
        // In online mode (or when tab is hidden/ticker stopped), wall-clock setTimeout prevents permanent freezes
        if (isOnline() || (typeof document !== 'undefined' && document.hidden)) {
            wallTimer = setTimeout(finishDelay, ms);
        } else {
            timers.push({ t: clock + ms, cb: finishDelay });
        }
    });
    const tweens: Tween[] = [];

    // ---------------------------------------------------------------- camera / projection
    let yaw = 0;
    let pitch = store.get().settings.tilt;
    let targetYaw = store.get().settings.rotate ? YAW_FOR[Math.max(0, opts.active.findIndex((a) => a))] : 0;
    yaw = targetYaw;
    let S = 40, OX = 360, OY = 300;
    let lastSig = '';
    let outline = COLORS[current];
    let platesAlpha = 1;
    let moving = false;

    const P = (x: number, y: number, z = 0) => {
        const bx = x - 7.5, by = y - 7.5;
        const a = rad(yaw), ca = Math.cos(a), sa = Math.sin(a);
        const rx = bx * ca - by * sa;
        const ry = bx * sa + by * ca;
        const el = rad(pitch), se = Math.sin(el), ce = Math.cos(el);
        const Y = ry * se - z * ce;
        const D = -ry * ce - z * se;
        const k = F / (F + D);
        return { x: OX + rx * k * S, y: OY + Y * k * S, k, d: D };
    };

    // layout rectangles (design units)
    let boardRect = { x: 10, y: 196, w: 700, h: 420 };
    let diceCY = 890, diceSize = 64;
    let diceCX = [260, 460];
    let turnY = 960, chatY = 1000;
    let colX = 20, colW = 680;
    let adRect = { x: 20, y: 700, w: 680, h: 160 };

    function fitBoard(scaleMultiplier = 1.0) {
        const el = rad(pitch), se = Math.sin(el), ce = Math.cos(el);
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (const [x, y, z] of [[0, 0, 0], [15, 0, 0], [15, 15, 0], [0, 15, 0], [0, 15, -0.7], [15, 15, -0.7]]) {
            const bx = x - 7.5, by = y - 7.5;
            const Y = by * se - z * ce;
            const D = -by * ce - z * se;
            const k = F / (F + D);
            minX = Math.min(minX, bx * k); maxX = Math.max(maxX, bx * k);
            minY = Math.min(minY, Y * k); maxY = Math.max(maxY, Y * k);
        }
        const baseS = Math.min(boardRect.w / (maxX - minX), boardRect.h / (maxY - minY));
        S = baseS * scaleMultiplier;
        OX = boardRect.x + boardRect.w / 2 - ((minX + maxX) / 2) * S;
        OY = boardRect.y - minY * S;
    }

    function layout() {
        const W = stage.designWidth(), H = stage.designHeight();
        bgFill.clear().rect(-60, -60, W + 120, H + 120).fill(BG_BASE[store.get().settings.bg]);
        if (stage.landscape()) {
            const bw = Math.min(W * 0.56, 800);
            // Board pushed down generously so top color name plates and HUD bars have clear spacing
            boardRect = { x: 24, y: 136, w: bw, h: H - 136 - 56 };
            colX = 24 + bw + 32;
            colW = W - colX - 24;

            fitBoard(1.0);

            // 1. Ad banner in landscape / web with DOUBLED height (220 units)
            const bannerTop = 82;
            const bannerH = 220; // Doubled height in landscape/web
            adRect = { x: colX, y: bannerTop, w: colW, h: bannerH };

            // 2. Clickable dice positioned DOWN below the doubled banner
            diceSize = Math.min(68, colW * 0.22);
            diceCY = adRect.y + adRect.h + 36 + diceSize / 2;
            diceCX = [colX + colW / 2 - diceSize * 1.25, colX + colW / 2 + diceSize * 1.25];

            // 3. Turn message and AI chatter text positioned DOWN below the dice
            turnY = diceCY + diceSize * 0.5 + 32;
            chatY = turnY + 36;
        } else {
            // Vertical mobile: increase board size by 0.2x (1.20x scale) cleanly positioned with 3x banner height
            const boardTop = 150;
            const boardW = Math.min(W - 20, 740);
            const maxBoardH = Math.min(boardW * 0.86, Math.round((H - boardTop) * 0.44));
            boardRect = { x: Math.round((W - boardW) / 2), y: boardTop, w: boardW, h: maxBoardH };
            colX = 16;
            colW = boardW;

            fitBoard(1.20);

            // Calculate exact bottom coordinate of board and bottom plates (Yellow & Blue)
            const c0 = P(0, 0), c1 = P(15, 0), c2 = P(15, 15), c3 = P(0, 15);
            const actualBottom = Math.max(P(0, 15, -0.7).y, P(15, 15, -0.7).y, c0.y, c1.y, c2.y, c3.y);

            // 1. Clickable dice placed cleanly below the board & bottom nameplates (pushed down)
            diceSize = 60;
            diceCY = Math.round(actualBottom + 54 + diceSize / 2);
            diceCX = [W / 2 - diceSize * 1.25, W / 2 + diceSize * 1.25];

            // 2. Turn message and chatter ("message place") positioned comfortably below the dice
            turnY = Math.round(diceCY + diceSize * 0.5 + 24);
            chatY = Math.round(turnY + 24);

            // 3. Advertisement banner placed cleanly UNDER the message place with 3x height
            const bannerTop = Math.round(chatY + 52);
            const bannerH = Math.min(210, Math.max(130, Math.round(H - bannerTop - 50)));
            adRect = { x: 24, y: bannerTop, w: W - 48, h: bannerH };
        }
        document.getElementById('app-frame')?.style.setProperty('--colx', String(colX));
        document.getElementById('app-frame')?.style.setProperty('--colw', String(colW));
        buildUi();
        lastSig = '';
    }

    // ---------------------------------------------------------------- board drawing
    function poly(g: Graphics, pts: [number, number][], z: number, fill: number, alpha = 1, stroke?: { w: number; c: number; a?: number }) {
        const flat: number[] = [];
        for (const [x, y] of pts) {
            const q = P(x, y, z);
            flat.push(q.x, q.y);
        }
        g.poly(flat).fill({ color: fill, alpha });
        if (stroke) g.stroke({ width: stroke.w, color: stroke.c, alpha: stroke.a ?? 1 });
    }
    const sq = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

    function drawBoard() {
        const st = store.get().settings;
        bgG.clear();
        drawBackground(bgG, (x, y, z) => P(x, y, z ?? 0), st.bg, S);
        const g = boardG;
        g.clear();
        const T = 0.7;
        // slab: underside + 4 sides
        poly(g, sq(0, 0, 15, 15), -T, 0x24160b);
        const corners: [number, number][] = [[0, 0], [15, 0], [15, 15], [0, 15]];
        for (let i = 0; i < 4; i++) {
            const a = corners[i], b = corners[(i + 1) % 4];
            const flat: number[] = [];
            for (const [x, y, z] of [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], -T], [a[0], a[1], -T]] as [number, number, number][]) {
                const q = P(x, y, z);
                flat.push(q.x, q.y);
            }
            g.poly(flat).fill(i % 2 ? 0x6b4423 : 0x835530).stroke({ width: 1, color: 0x2c1a0c, alpha: 0.7 });
        }
        // top surface
        poly(g, sq(0, 0, 15, 15), 0, 0xf4f0e4);
        // base yards
        const origins: [number, number][] = [[0, 0], [9, 0], [9, 9], [0, 9]];
        for (let c = 0; c < 4; c++) {
            const [ox, oy] = origins[c];
            poly(g, sq(ox, oy, 6, 6), 0, active[c] ? COLORS[c] : mix(COLORS[c], 0xdddddd, 0.55), 1, { w: 1.2, c: shade(COLORS[c], 0.55) });
            poly(g, sq(ox + 1, oy + 1, 4, 4), 0.02, 0xfaf8f0, 0.96, { w: 1, c: shade(COLORS[c], 0.7), a: 0.8 });
            for (const [sx, sy] of BASE_SPOTS[c]) poly(g, circlePts(sx, sy, 0.55, 14), 0.03, COLORS[c], 0.85, { w: 1, c: shade(COLORS[c], 0.5) });
        }
        // home columns
        for (let c = 0; c < 4; c++) for (const [col, row] of HOME_COL[c]) poly(g, sq(col, row, 1, 1), 0.01, COLORS[c], 1, { w: 1, c: shade(COLORS[c], 0.55), a: 0.9 });
        // track
        for (let i = 0; i < 52; i++) {
            const [col, row] = TRACK[i];
            const startOf = START_IDX.indexOf(i);
            poly(g, sq(col, row, 1, 1), 0.01, startOf >= 0 ? COLORS[startOf] : 0xffffff, 1, { w: 1, c: 0x8a8f96, a: 0.9 });
        }
        // safe stars (start squares get a white star, star squares a grey/gold one)
        for (const i of STAR_IDX) {
            const [col, row] = TRACK[i];
            poly(g, starPts(col + 0.5, row + 0.5, 0.36, 0.16), 0.02, 0xe8b923, 1, { w: 1, c: 0x9a7408 });
        }
        for (let c = 0; c < 4; c++) {
            const [col, row] = TRACK[START_IDX[c]];
            poly(g, starPts(col + 0.5, row + 0.5, 0.3, 0.13), 0.02, 0xffffff, 0.95);
        }
        // centre triangles
        const mid: [number, number] = [7.5, 7.5];
        const tri: [number, number][][] = [
            [[6, 6], mid, [6, 9]], // red (left)
            [[6, 6], [9, 6], mid], // green (top)
            [[9, 6], [9, 9], mid], // yellow (right)
            [[6, 9], mid, [9, 9]], // cyan (bottom)
        ];
        for (let c = 0; c < 4; c++) poly(g, tri[c], 0.02, COLORS[c], 1, { w: 1, c: shade(COLORS[c], 0.5) });
        // (Orange circle removed per user instruction; HOME text remains centered on triangles)
        // active-player outline with a soft glow
        const flat: number[] = [];
        for (const [x, y] of [[0, 0], [15, 0], [15, 15], [0, 15]] as [number, number][]) {
            const q = P(x, y, 0);
            flat.push(q.x, q.y);
        }
        g.poly(flat).stroke({ width: Math.max(10, S * 0.45), color: outline, alpha: 0.22 });
        g.poly(flat).stroke({ width: Math.max(5, S * 0.2), color: outline, alpha: 0.95 });
    }

    // ---------------------------------------------------------------- tokens
    const views: TokView[][] = [[], [], [], []];
    for (let p = 0; p < 4; p++) {
        const tokenUrl = TOKEN_URLS_BY_PLAYER[p];
        for (let t = 0; t < 4; t++) {
            const c = new Container();
            const body = new Graphics();
            drawPawn(body, COLORS[p]);
            c.addChild(body);
            c.eventMode = 'static';
            c.cursor = 'pointer';
            c.interactiveChildren = false; // hitArea receives taps directly without child interception
            c.hitArea = new Circle(0, -0.65, 1.4);
            const shadow = new Graphics();
            shadow.ellipse(0, 0, 0.38, 0.15).fill({ color: 0x000000, alpha: 0.35 });
            const ring = new Graphics();
            ring.ellipse(0, 0, 0.52, 0.22).stroke({ width: 0.08, color: 0xffffff, alpha: 0.95 });
            ring.visible = false;
            const v: TokView = { p, t, c, body, shadow, ring, vx: 0, vy: 0, vz: 0, tween: null, movable: false, flash: 0, phase: Math.random() * 6 };

            const attachSprite = (tex: any) => {
                if (dead || c.destroyed || !tex) return;
                const natW = (tex.source as any)?.naturalWidth || tex.width || 200;
                if (!natW || isNaN(natW) || natW <= 0) return;

                if (v.sprite && !v.sprite.destroyed) {
                    v.sprite.texture = tex;
                    return;
                }
                const sp = new Sprite(tex);
                sp.anchor.set(0.5, 0.94);
                const targetW = 0.78;
                const scale = targetW / natW;
                sp.scale.set(scale, scale);
                sp.eventMode = 'none';
                body.visible = false;
                c.addChild(sp);
                v.sprite = sp;
            };

            const cached = getCachedPawnTexture(tokenUrl);
            if (cached) {
                attachSprite(cached);
            } else {
                void loadPawnTexture(tokenUrl).then((tex) => {
                    attachSprite(tex);
                }).catch(() => {
                    // Fallback to body Graphics
                });
            }

            const [bx, by] = boardPos(p, IN_BASE, t);
            v.vx = bx;
            v.vy = by;
            c.visible = shadow.visible = active[p];
            c.on('pointertap', () => onTokenTap(v));
            shadowLayer.addChild(shadow, ring);
            tokenLayer.addChild(c);
            views[p].push(v);
        }
    }

    function tween(tok: TokView, pts: [number, number][], stepMs: number, hop: number, expectedEpoch?: number): Promise<void> {
        return new Promise<void>((res) => {
            if (dead || pts.length < 2 || (typeof document !== 'undefined' && document.hidden) || (expectedEpoch !== undefined && isOnline() && turnEpoch !== expectedEpoch)) {
                const lastPt = pts[pts.length - 1];
                if (lastPt) {
                    tok.vx = lastPt[0];
                    tok.vy = lastPt[1];
                }
                tok.vz = 0;
                tok.tween = null;
                res();
                return;
            }
            let settled = false;
            let safetyTimer: ReturnType<typeof setTimeout> | null = null;
            const finishTween = () => {
                if (settled) return;
                settled = true;
                if (safetyTimer !== null) {
                    clearTimeout(safetyTimer);
                    safetyTimer = null;
                }
                turnAbortCallbacks.delete(abortFinish);
                const idx = tweens.indexOf(tw);
                if (idx !== -1) tweens.splice(idx, 1);
                tok.tween = null;
                res();
            };
            const abortFinish = () => {
                const lastPt = pts[pts.length - 1];
                if (lastPt) {
                    tok.vx = lastPt[0];
                    tok.vy = lastPt[1];
                }
                tok.vz = 0;
                finishTween();
            };
            const tw: Tween = { tok, pts, seg: 0, u: 0, stepMs, hop, done: finishTween };
            tok.tween = tw;
            tweens.push(tw);
            if (isOnline()) {
                turnAbortCallbacks.add(abortFinish);
                // Wall-clock cap ensures tween never freezes if browser throttles/pauses requestAnimationFrame
                const maxMs = Math.max(400, (pts.length - 1) * stepMs + 600);
                safetyTimer = setTimeout(abortFinish, maxMs);
            }
        });
    }

    function updateTweens(dt: number) {
        for (let i = tweens.length - 1; i >= 0; i--) {
            const tw = tweens[i];
            tw.u += dt / tw.stepMs;
            while (tw.u >= 1 && tw.seg < tw.pts.length - 2) {
                tw.u -= 1;
                tw.seg++;
            }
            const last = tw.seg >= tw.pts.length - 2 && tw.u >= 1;
            const u = Math.min(1, tw.u);
            const a = tw.pts[tw.seg], b = tw.pts[tw.seg + 1];
            tw.tok.vx = a[0] + (b[0] - a[0]) * u;
            tw.tok.vy = a[1] + (b[1] - a[1]) * u;
            tw.tok.vz = Math.sin(Math.PI * u) * tw.hop;
            if (last) {
                tw.tok.tween = null;
                tweens.splice(i, 1);
                tw.done();
            }
        }
    }

    function updateTokens(now: number) {
        // stacking offsets for tokens sharing a square
        const groups = new Map<string, TokView[]>();
        for (let p = 0; p < 4; p++) {
            if (!active[p]) continue;
            for (const v of views[p]) {
                if (v.tween) continue;
                const [x, y] = boardPos(p, tokens[p][v.t], v.t);
                v.vx = x;
                v.vy = y;
                v.vz = 0;
                if (tokens[p][v.t] >= 0 && tokens[p][v.t] < HOME) {
                    const key = `${Math.round(x * 10)},${Math.round(y * 10)}`;
                    const arr = groups.get(key) || [];
                    arr.push(v);
                    groups.set(key, arr);
                }
            }
        }
        const off = new Map<TokView, number>();
        groups.forEach((arr) => {
            if (arr.length > 1) arr.forEach((v, i) => off.set(v, (i - (arr.length - 1) / 2) * 0.3));
        });
        for (let p = 0; p < 4; p++) {
            if (!active[p]) continue;
            for (const v of views[p]) {
                const o = off.get(v) || 0;
                const crowd = o !== 0 ? 0.82 : 1;
                const pr = P(v.vx + o, v.vy, v.vz);
                const gr = P(v.vx + o, v.vy, 0);
                const bounce = v.movable ? Math.abs(Math.sin((now / 1000) * 6 + v.phase)) * 0.38 : 0;
                if (v.c?.position) v.c.position.set(pr.x, pr.y - bounce * S * pr.k);
                if (v.c?.scale) v.c.scale.set(S * pr.k * crowd * TOKEN_SIZE_SCALE);
                if (v.c) v.c.zIndex = -gr.d * 100 + (v.tween ? 500 : 0);
                if (v.shadow?.position) v.shadow.position.set(gr.x, gr.y);
                if (v.shadow?.scale) v.shadow.scale.set(S * gr.k * crowd * TOKEN_SIZE_SCALE * (1 - Math.min(0.5, v.vz * 0.25)));
                if (v.ring?.position) v.ring.position.set(gr.x, gr.y);
                if (v.ring?.scale) v.ring.scale.set(S * gr.k * crowd * TOKEN_SIZE_SCALE);
                v.ring.visible = v.movable || v.flash > 0;
                if (v.flash > 0) {
                    v.ring.tint = 0xff2a2a;
                    v.ring.alpha = 0.5 + 0.5 * Math.sin(now / 90);
                } else {
                    v.ring.tint = 0xffffff;
                    v.ring.alpha = 0.6 + 0.4 * Math.sin(now / 160);
                }
            }
        }
    }

    // ---------------------------------------------------------------- name plates (above / below the board)
    interface Plate { c: Container; g: Graphics; txt: Text }
    const plates: Plate[] = [];
    for (let p = 0; p < 4; p++) {
        const c = new Container();
        const g = new Graphics();
        // 0.75x name font size (19 instead of 25) with stroke
        const txt = new Text({ text: '', style: { fontFamily: 'Arial Black, Impact, sans-serif', fontSize: 19, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x1a1a1a, width: 4 }, letterSpacing: 0.75 } });
        txt.anchor.set(0.5);
        c.addChild(g, txt);
        c.eventMode = 'static';
        c.cursor = 'pointer';
        c.on('pointertap', () => {
            if (platesAlpha > 0.7) store.patch({ modal: `profile:${p}` as const });
        });
        c.visible = active[p];
        plateLayer.addChild(c);
        plates.push({ c, g, txt });
    }
    function drawPlate(p: number, w: number) {
        const { g } = plates[p];
        g.clear();
        // 0.75x height: 34.5 (was 46)
        const h = 34.5;
        const cornerR = 9;
        const shadowOffset = 5.25;
        g.roundRect(-w / 2, -h / 2 + shadowOffset, w, h, cornerR).fill(shade(COLORS[p], 0.45));
        g.roundRect(-w / 2, -h / 2, w, h, cornerR).fill(COLORS[p]).stroke({ width: 2.25, color: shade(COLORS[p], 0.6) });
        g.roundRect(-w / 2 + 5, -h / 2 + 3, w - 10, 9, 4.5).fill({ color: 0xffffff, alpha: 0.25 });
    }
    let lastPublishedPlatesSig = '';
    function updatePlates(dt: number) {
        const target = moving ? 0 : 1;
        platesAlpha += (target - platesAlpha) * Math.min(1, dt / 160);
        const c0 = P(0, 0), c1 = P(15, 0), c2 = P(15, 15), c3 = P(0, 15);
        const top = Math.min(c0.y, c1.y, c2.y, c3.y);
        const bottom = Math.max(P(0, 15, -0.7).y, P(15, 15, -0.7).y, c0.y, c1.y, c2.y, c3.y);
        const midY = (top + bottom) / 2;
        const u = stage.unit();
        const nextBounds: NameplateBound[] = [];
        for (let p = 0; p < 4; p++) {
            const pl = plates[p];
            if (!active[p] || !pl.txt || pl.txt.destroyed) continue;
            const b = P(BASE_CENTER[p][0], BASE_CENTER[p][1]);
            const above = b.y < midY;
            const px = Math.max(80, Math.min(stage.designWidth() - 80, b.x));
            const py = above ? top - 26 : bottom + 28;
            if (pl.c?.position) {
                pl.c.position.set(px, py);
            }
            const name = plateName(p);
            if (pl.txt.text !== name) {
                pl.txt.text = name;
            }
            // 0.75x name size: 14 / 16 / 19 instead of 18 / 21 / 25
            const size = Math.round((name.length > 10 ? 18 : name.length > 7 ? 21 : 25) * 0.75);
            if (pl.txt.style.fontSize !== size) pl.txt.style.fontSize = size;
            const w = 132;
            const h = 34.5;
            drawPlate(p, w);
            pl.c.alpha = platesAlpha;
            if (platesAlpha > 0.7) {
                nextBounds.push({
                    seatIdx: p,
                    x: Math.round((px - w / 2) * u),
                    y: Math.round((py - h / 2) * u),
                    w: Math.round(w * u),
                    h: Math.round(h * u),
                    angleDeg: 0,
                });
            }
        }
        const sig = nextBounds.map((nb) => `${nb.seatIdx}:${Math.round(nb.x / 2)},${Math.round(nb.y / 2)},${Math.round(nb.w / 2)},${Math.round(nb.h / 2)}`).join('|');
        if (sig !== lastPublishedPlatesSig) {
            lastPublishedPlatesSig = sig;
            store.patch({ nameplateBounds: nextBounds });
        }
    }

    // ---------------------------------------------------------------- dice (under the board) + status text + chat + ad
    const dieC: Container[] = [];
    const dieG: Graphics[] = [];
    let turnTxt: Text;
    let homeCenterTxt: Text | null = null;
    const chatTxt: Text[] = [];
    let adC: Container;
    let uiBuilt = false;
    let adG: Graphics;
    let diceTrayC: Container;
    let diceTrayG: Graphics;
    let sumC: Container;
    let sumG: Graphics;
    let sumTxt: Text;

    function buildUi() {
        if (!uiBuilt) {
            uiBuilt = true;
            uiLayer.removeChildren();
            dieC.length = 0;
            dieG.length = 0;
            let lastDieTap = 0;
            const triggerDieTap = (dieIdx: number) => {
                const t = performance.now();
                if (t - lastDieTap < 200) return;
                lastDieTap = t;
                onDieTap(dieIdx);
            };
            bus.roll = () => triggerDieTap(0);

            // Generous clickable tray beneath both dice
            diceTrayC = new Container();
            diceTrayG = new Graphics();
            diceTrayG.eventMode = 'none';
            diceTrayC.addChild(diceTrayG);
            diceTrayC.eventMode = 'static';
            diceTrayC.cursor = 'pointer';
            diceTrayC.on('pointertap', () => triggerDieTap(0));
            uiLayer.addChild(diceTrayC);

            for (let i = 0; i < 2; i++) {
                const c = new Container();
                const g = new Graphics();
                g.eventMode = 'none';
                c.addChild(g);
                c.position.set(diceCX[i], diceCY);
                c.eventMode = 'static';
                c.cursor = 'pointer';
                c.hitArea = new Circle(0, 0, diceSize * 1.35);
                c.on('pointertap', () => triggerDieTap(i));
                uiLayer.addChild(c);
                dieC.push(c);
                dieG.push(g);
            }

            // Combined sum selector button shown between the two dice when the Lone Token combined move is legal
            sumC = new Container();
            sumG = new Graphics();
            sumG.eventMode = 'none';
            sumTxt = new Text({
                text: '',
                style: { fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: '900', fill: 0xffffff },
            });
            sumTxt.anchor.set(0.5);
            sumTxt.eventMode = 'none';
            sumC.addChild(sumG, sumTxt);
            sumC.eventMode = 'static';
            sumC.cursor = 'pointer';
            sumC.visible = false;
            sumC.on('pointertap', () => triggerDieTap(2));
            uiLayer.addChild(sumC);
            // Central HOME text on board hub (clean white bold text, no orange circle)
            homeCenterTxt = new Text({
                text: 'HOME',
                style: {
                    fontFamily: 'Arial Black, Impact, sans-serif',
                    fontSize: 16,
                    fontWeight: '900',
                    fill: 0xffffff,
                    stroke: { color: 0x0f172a, width: 4 },
                    letterSpacing: 1.5,
                },
            });
            homeCenterTxt.anchor.set(0.5);
            homeCenterTxt.eventMode = 'none';
            uiLayer.addChild(homeCenterTxt);

            // half-size text for the turn line and the AI chatter
            turnTxt = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 16, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
            turnTxt.anchor.set(0.5);
            turnTxt.eventMode = 'static';
            turnTxt.cursor = 'pointer';
            turnTxt.on('pointertap', () => triggerDieTap(0));
            turnTxt.position.set(diceCX[0] / 2 + diceCX[1] / 2, turnY);
            uiLayer.addChild(turnTxt);
            chatTxt.length = 0;
            // AI banter text lines removed from board per user instruction
            // Advertisement banner slot
            adC = new Container();
            adG = new Graphics();
            const adTag = new Text({
                text: 'AD',
                style: { fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: '900', fill: 0x111827 },
            });
            adTag.anchor.set(0.5);
            adTag.eventMode = 'none';
            adTag.position.set(40, 28);
            adC.addChild(adG, adTag);
            adC.eventMode = 'static';
            adC.cursor = 'pointer';
            adC.on('pointertap', () => { /* banner slot: hook an ad SDK here */ });
            uiLayer.addChild(adC);
        }

        // On every layout, seamlessly reposition and redraw without destroying Text textures
        if (diceTrayC) {
            const trayW = Math.abs(diceCX[1] - diceCX[0]) + diceSize * 2.8;
            const trayH = diceSize * 1.8;
            diceTrayC.position.set((diceCX[0] + diceCX[1]) / 2, diceCY);
            diceTrayC.hitArea = new Rectangle(-trayW / 2, -trayH / 2, trayW, trayH);
        }
        for (let i = 0; i < 2; i++) {
            if (dieC[i]) {
                dieC[i].position.set(diceCX[i], diceCY);
                dieC[i].hitArea = new Circle(0, 0, diceSize * 1.35);
            }
        }
        if (sumC) {
            sumC.position.set((diceCX[0] + diceCX[1]) / 2, diceCY + diceSize * 0.75);
            sumC.hitArea = new Rectangle(-44, -16, 88, 32);
        }
        if (turnTxt && !turnTxt.destroyed) {
            turnTxt.position.set(diceCX[0] / 2 + diceCX[1] / 2, turnY);
        }
        for (let i = 0; i < 2; i++) {
            const t = chatTxt[i];
            if (t && !t.destroyed) {
                t.position.set(colX + colW / 2, chatY + i * 24);
                t.style.wordWrapWidth = Math.max(100, colW - 20);
            }
        }
        if (adC) {
            adC.position.set(adRect.x, adRect.y);
        }
        if (adG) {
            adG.clear()
                .roundRect(0, 0, adRect.w, adRect.h, 16)
                .fill({ color: 0x0b132e, alpha: 0.65 })
                .stroke({ width: 2, color: 0x00f0ff, alpha: 0.85 })
                .roundRect(10, 10, adRect.w - 20, adRect.h - 20, 12)
                .fill({ color: 0x141f48, alpha: 0.28 })
                .stroke({ width: 1, color: 0x00f0ff, alpha: 0.2 })
                .roundRect(16, 16, 48, 24, 6)
                .fill(0xffc107);
        }
    }

    function drawDice(now: number) {
        if (dead) return;
        const isMyTurn = isOnline() ? multiplayerClient.myPlayerIndex === current : !isAI(current);
        const rollingIdle = !!waitRoll && isMyTurn;

        if (diceTrayG) {
            const trayW = Math.abs(diceCX[1] - diceCX[0]) + diceSize * 2.8;
            const trayH = diceSize * 1.8;
            const trayBorder = rollingIdle ? COLORS[current] : 0x1e293b;
            const trayAlpha = rollingIdle ? 0.75 + 0.25 * Math.sin(now / 180) : 0.25;
            diceTrayG.clear()
                .roundRect(-trayW / 2, -trayH / 2, trayW, trayH, 20)
                .fill({ color: 0x070b1e, alpha: rollingIdle ? 0.75 : 0.45 })
                .stroke({ width: rollingIdle ? 2.5 : 1, color: trayBorder, alpha: trayAlpha });
        }

        for (let i = 0; i < 2; i++) {
            const used = diceUsed[i];
            const choosingDie = !!waitChoice && !used && !dieConfirmed && isMyTurn;
            const pulse = (rollingIdle || dieFlash > 0 ? 1 + 0.08 * Math.sin(now / 160) : 1) * (choosingDie ? 1 + 0.04 * Math.sin(now / 220) : 1);
            const sel = !used && (selDie === i || selDie === 2) && !!waitChoice;
            const dimDice = !isMyTurn || (used && !waitRoll);
            if (dieG[i]) {
                drawDie(dieG[i], diceSize, dice[i], diceColor, current === 2 ? 0x2a2a2a : 0xffffff, { dim: dimDice, glow: sel || rollingIdle });
            }
            if (dieC[i]?.scale) {
                dieC[i].scale.set(pulse);
            }
        }
        if (sumC && sumG && sumTxt) {
            const hasCombined = !!waitChoice && isMyTurn && !diceUsed[0] && !diceUsed[1] && optionsNow.some((m) => m.die === 2);
            sumC.visible = hasCombined;
            if (hasCombined) {
                const activeSum = selDie === 2;
                const total = dice[0] + dice[1];
                sumTxt.text = `${dice[0]}+${dice[1]} = ${total}`;
                sumTxt.style.fill = activeSum ? 0x0f172a : 0xfef08a;
                sumG.clear()
                    .roundRect(-42, -13, 84, 26, 13)
                    .fill({ color: activeSum ? 0xfacc15 : 0x0f172a, alpha: 0.95 })
                    .stroke({ width: activeSum ? 2.5 : 1.5, color: 0xfacc15, alpha: 0.95 });
            }
        }
        if (dieFlash > 0) dieFlash = Math.max(0, dieFlash - 16);
    }

    // ---------------------------------------------------------------- guiding hand
    // A hand pointing DOWN at the thing to tap. The 👇 glyph is used (NOT 👆,
    // which points up and away from the target -- that was the original bug), and
    // the offset is derived from the measured glyph box so the fingertip lands
    // just above whatever it is aiming at, on any device that has the font.
    const hand = new Text({
        text: '👇',
        style: { fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif', fontSize: 58 },
    });
    hand.anchor.set(0.5);
    hand.alpha = 0;
    hand.visible = false;
    hand.eventMode = 'none';
    handLayer.addChild(hand);
    /** Distance from the glyph's centre down to roughly its fingertip. */
    const handTipDrop = () => (hand?.height ? hand.height * 0.34 : 20);
    let handTarget: { x: number; y: number } | null = null;
    /** Clear space between the fingertip and the target's centre. */
    let handGap = 22;

    function dieCenter(i: number) {
        const cx = dieC[i]?.position?.x ?? diceCX[i];
        const cy = dieC[i]?.position?.y ?? diceCY;
        return { x: cx, y: cy };
    }
    function syncHand() {
        if (dead || (isOnline() && multiplayerClient.myPlayerIndex !== current) || isAI(current) || winner >= 0) {
            handTarget = null;
        } else if (waitRoll) {
            handTarget = dieCenter(0); // any die starts the roll
            handGap = 24;
        } else if (waitChoice) {
            const usable = optionsNow.filter((m) => m.die === selDie);
            const targetDieIdx = selDie === 2 ? 0 : selDie;
            if (!dieConfirmed) {
                handTarget = selDie === 2 && sumC?.visible
                    ? { x: sumC.position.x, y: sumC.position.y }
                    : dieCenter(targetDieIdx); // step 1: which number
                handGap = 24;
            } else if (usable.length && views[current]?.[usable[0].tok]?.c?.position) {
                // step 2: point down at the piece to move (follows the board)
                const vc = views[current][usable[0].tok].c;
                handTarget = { x: vc.position.x, y: vc.position.y };
                handGap = 16;
            } else {
                handTarget = dieCenter(targetDieIdx);
                handGap = 24;
            }
        } else {
            handTarget = null;
        }
        if (hand && !hand.destroyed) {
            hand.visible = !dead && !!handTarget;
        }
    }
    function updateHand(dt: number) {
        if (dead || !hand || hand.destroyed || !hand.position) return;
        const want = handTarget ? 0.95 : 0;
        hand.alpha += (want - hand.alpha) * Math.min(1, dt / 160);
        hand.visible = hand.alpha > 0.02;
        if (!handTarget || typeof handTarget.x !== 'number' || typeof handTarget.y !== 'number' || isNaN(handTarget.x) || isNaN(handTarget.y)) return;
        // The hand sits so its fingertip hovers just above the target, then taps
        // gently downwards: the glyph centre is (tipDrop + gap) above the target.
        const gap = handGap;
        const bob = Math.abs(Math.sin(clock / 300)) * 8;
        hand.position.set(handTarget.x, handTarget.y - handTipDrop() - gap + bob);
    }

    function setStatus(s: string) {
        statusText = s;
    }
    function refreshTurnText() {
        if (!turnTxt || turnTxt.destroyed) return;
        if (isOnline()) {
            const isMe = multiplayerClient.myPlayerIndex === current;
            if (isMe) {
                turnTxt.text = waitRoll
                    ? '🎯 Your Turn'
                    : '🎲 Pick a die & move your pawn';
                turnTxt.style.fill = 0x22c55e;
            } else {
                turnTxt.text = `⏳ Waiting for ${avatarOf(current)} ${nameOf(current)}...`;
                turnTxt.style.fill = 0xfacc15;
            }
            return;
        }
        if (isAI(current)) {
            turnTxt.text = `🤖 ${avatarOf(current)} ${nameOf(current)} is rolling...`;
            turnTxt.style.fill = 0x93c5fd;
            return;
        }
        turnTxt.text = statusText || (waitRoll ? `🎯 ${avatarOf(current)} ${nameOf(current)}` : `${avatarOf(current)} ${tr(lang, 'turn', { n: nameOf(current) })}`);
        turnTxt.style.fill = statusText ? 0xffffff : (waitRoll ? 0x22c55e : mix(COLORS[current], 0xffffff, 0.25));
    }

    // ---------------------------------------------------------------- 3D-style rolling dice on the board
    interface Fly { c: Container; g: Graphics; sh: Graphics; fx: number; fy: number; tx: number; ty: number; rot: number; spin: number }
    let flying: Fly[] = [];
    let flyT = -1;
    let flyDur = 0;
    let flyFinal: [number, number] = [1, 1];
    let flyColor = 0xffffff;
    function startFly(p: number, a: number, b: number, dur: number) {
        flyLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
        flying = [];
        flyDur = dur;
        flyT = 0;
        flyFinal = [a, b];
        flyColor = COLORS[p];
        const from = P(BASE_CENTER[p][0], BASE_CENTER[p][1]);
        for (let i = 0; i < 2; i++) {
            const c = new Container();
            const sh = new Graphics();
            const g = new Graphics();
            c.addChild(g);
            flyLayer.addChild(sh, c);
            const to = P(7.5 + (i ? 1.6 : -1.6), 7.5 + (i ? 0.7 : -0.7));
            flying.push({ c, g, sh, fx: from.x + (i ? 24 : -24), fy: from.y, tx: to.x, ty: to.y, rot: Math.random() * 6, spin: (i ? -1 : 1) * (9 + Math.random() * 4) });
        }
    }
    function updateFly(dt: number) {
        if (flyT < 0) return;
        flyT += dt;
        const u = Math.min(1, flyT / flyDur);
        const ease = 1 - Math.pow(1 - u, 3);
        const size = S * 1.5 * 1.0; // 1.5x bigger dice
        for (let i = 0; i < flying.length; i++) {
            const f = flying[i];
            const x = f.fx + (f.tx - f.fx) * ease;
            const y = f.fy + (f.ty - f.fy) * ease;
            const hop = Math.abs(Math.sin(u * Math.PI * 3.6)) * (1 - u) * S * 4.2;
            const face = u > 0.82 ? flyFinal[i] : 1 + Math.floor(Math.random() * 6);
            drawDie(f.g, size, face, flyColor, flyColor === COLORS[2] ? 0x2a2a2a : 0xffffff);
            if (f.c?.position) f.c.position.set(x, y - hop);
            if (f.c) f.c.rotation = f.rot + f.spin * u * (1 - u * 0.6) * 1.4;
            if (f.c?.scale) f.c.scale.set(1 + 0.06 * Math.sin(u * 30 + i));
            if (f.sh?.position) {
                f.sh.clear().ellipse(0, 0, size * 0.55, size * 0.2).fill({ color: 0x000000, alpha: 0.28 * (1 - hop / (S * 5)) });
                f.sh.position.set(x, y + size * 0.35);
            }
        }
        if (u >= 1 && flyT > flyDur + 900) {
            flyLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
            flying = [];
            flyT = -1;
        }
    }

    // ---------------------------------------------------------------- chat lines (under the board) + voices
    interface ChatItem { idx: number; text: string; alt?: string; priority?: boolean; voice: boolean }
    const queue: ChatItem[] = [];
    const lines: { idx: number; text: string; born: number }[] = [];
    let pumping = false;

    function updateChat() {
        return; // AI messages removed from board per user instruction
    }

    async function pump() {
        if (pumping) return;
        pumping = true;
        while (queue.length && !dead) {
            const it = queue.shift()!;
            lines.push({ idx: it.idx, text: it.text, born: clock });
            if (lines.length > 6) lines.shift();
            if (it.voice) await sfx.speak({ text: it.text, altText: it.alt, altLang: 'hi', lang, player: it.idx });
            else await delay(1400);
            await delay(450);
        }
        pumping = false;
    }

    function enqueue(item: ChatItem, front = false) {
        item.text = banter.removeHahahaOnly(item.text);
        if (item.alt) item.alt = banter.removeHahahaOnly(item.alt);
        if (!item.text) return;
        if (queue.length > 5 && !front) return; // never flood
        if (front) queue.unshift(item);
        else queue.push(item);
        void pump();
    }

    // Equitable round-robin cycle across all AI players (Shahbaz, Mughal, Zoi, Kajal)
    let aiRoundRobinIndex = 0;
    function getNextRoundRobinAI(exclude: number = -1): number | null {
        const aiPool = [0, 1, 2, 3].filter((q) => q !== exclude && active[q] && isAI(q));
        if (!aiPool.length) return null;
        const selected = aiPool[aiRoundRobinIndex % aiPool.length];
        aiRoundRobinIndex = (aiRoundRobinIndex + 1) % aiPool.length;
        return selected;
    }

    const lastBanterMs = [0, 0, 0, 0];

    function canSpeakBanter(seatIdx: number, event: BanterEvent): boolean {
        if (store.get().settings.aiMute) return false;
        if (multiplayerClient.isSeatMuted(seatIdx)) return false;
        const nowMs = Date.now();
        const isHigh = HIGH_PRIORITY_BANTER_EVENTS.has(event);
        const minGap = isHigh ? BANTER_HIGH_PRIORITY_COOLDOWN_MS : BANTER_ROUTINE_COOLDOWN_MS;
        return nowMs - lastBanterMs[seatIdx] >= minGap;
    }

    /** Emit a personality-flavored local AI banter event with priority cooldown & per-seat mute gating. */
    function emitLocalBanter(
        event: BanterEvent,
        idx: number,
        vars?: Record<string, string>,
        chance = 1,
        forcedLineIdx?: number,
        personalityOverride?: AIPersonality,
    ) {
        if (idx < 0 || idx > 3 || !active[idx]) return;
        if (forcedLineIdx === undefined && !isAI(idx)) return;
        if (Math.random() > chance) return;
        if (!canSpeakBanter(idx, event)) return;
        const line = pickBanterLine(
            event,
            lang,
            idx,
            vars,
            forcedLineIdx,
            personalityOverride || getPersonalityForSeat(idx),
        );
        if (!line) return;
        lastBanterMs[idx] = Date.now();
        lastSpoke[idx] = clock;
        enqueue({
            idx,
            text: line.text,
            alt: line.alt,
            priority: HIGH_PRIORITY_BANTER_EVENTS.has(event),
            voice: true,
        }, HIGH_PRIORITY_BANTER_EVENTS.has(event));
    }

    function emitRoundRobinBanter(event: BanterEvent, exclude = -1, vars?: Record<string, string>, chance = 1) {
        const nextAI = getNextRoundRobinAI(exclude);
        if (nextAI === null) return;
        emitLocalBanter(event, nextAI, vars, chance);
    }

    /** A computer player says something (if it's not a human seat). */
    function ai(cat: Cat, idx: number, vars?: Record<string, string>, chance = 1) {
        if (!active[idx] || !isAI(idx) || Math.random() > chance) return;
        if (store.get().settings.aiMute || multiplayerClient.isSeatMuted(idx)) return;
        const catToEvent: Partial<Record<Cat, BanterEvent>> = {
            capture: 'capture',
            victim: 'captured',
            lucky: 'lucky7',
            sixes: 'lucky_roll',
            double: 'lucky_roll',
            home: 'pawn_home',
            threat: 'home_stretch',
            escape: 'home_stretch',
            excuse: 'penalty',
            laughAt: 'penalty',
            win: 'win',
            praise: 'loss',
            sore: 'loss',
            leave: 'turn',
            ones: 'roll',
            advice: 'roll',
        };
        const mappedEvent = catToEvent[cat] || 'banter';
        if (!canSpeakBanter(idx, mappedEvent)) return;
        const l = pickBanterLine(mappedEvent, lang, idx, vars);
        if (l) {
            lastBanterMs[idx] = Date.now();
            lastSpoke[idx] = clock;
            enqueue({ idx, text: l.text, alt: l.alt, priority: HIGH_PRIORITY_BANTER_EVENTS.has(mappedEvent), voice: true });
        }
    }

    /** Banter and event speech triggers use an equitable round-robin cycle across all AI players. */
    function anyAI(cat: Cat, not: number, vars?: Record<string, string>, chance = 1) {
        const nextAI = getNextRoundRobinAI(not);
        if (nextAI === null) return;
        ai(cat, nextAI, vars, chance);
    }
    const lastSpoke = [-1e9, -1e9, -1e9, -1e9];
    /** After every turn, the next AI in the round-robin cycle chips in with contextual dialogue. */
    function chatterAfterTurn(actor: number) {
        if (Math.random() < 0.55) {
            emitRoundRobinBanter('banter', actor, undefined, 1);
        }
    }

    bus.onRemoteAiBanter = (data) => {
        if (dead || !isOnline()) return;
        const ev = (data.event || 'banter') as BanterEvent;
        emitLocalBanter(
            ev,
            data.seatIndex,
            data.vars,
            1,
            data.lineIdx,
            data.personality as AIPersonality | undefined,
        );
    };

    bus.chat = (idx, text, o) => {
        if (!active[idx]) return;
        enqueue({ idx, text, voice: o?.voice !== false }, true);
    };

    let pendingRemoteRoll: { p: number; dice: [number, number] } | null = null;
    const pendingRemoteMoves: { p: number; dieIndex: number; tokenIndex: number; to: number; captures: { p: number; t: number }[]; reachedHome: boolean; passed?: boolean }[] = [];
    const pendingLocalMoves: { dieIndex: number; tokenIndex: number }[] = [];
    let latestRemoteTurn: number | null = null;
    let latestRemoteExtraTurn = false;
    let remoteTurnChangedPending = false;
    let turnEpoch = 0;

    function syncTokensFromServer() {
        if (!multiplayerClient.roomState?.tokens) return;
        for (let pl = 0; pl < 4; pl++) {
            if (multiplayerClient.roomState.tokens[pl]) {
                tokens[pl] = multiplayerClient.roomState.tokens[pl].slice();
            }
        }
    }

    function buildMoveFromServer(rp: number, dieIndex: number, tokenIndex: number, to: number, captures: { p: number; t: number }[], reachedHome: boolean, passed?: boolean): Move {
        const moveVal = dieIndex === 2 ? (dice[0] || 0) + (dice[1] || 0) : (dice[dieIndex] || 0);
        if (passed) {
            return { tok: tokenIndex, die: dieIndex, value: moveVal, to: tokens[rp][tokenIndex], captures: [], fromBase: false, reachesHome: false, combined: dieIndex === 2, passed: true } as any;
        }
        return optionsNow.find((o) => o.die === dieIndex && o.tok === tokenIndex)
            || legalMovesForTurn(tokens, rp, dice, diceUsed, active).find((o) => o.die === dieIndex && o.tok === tokenIndex)
            || {
                tok: tokenIndex,
                to,
                die: dieIndex,
                value: moveVal,
                captures: captures || [],
                fromBase: tokens[rp][tokenIndex] === IN_BASE,
                reachesHome: !!reachedHome,
                combined: dieIndex === 2,
            };
    }

    bus.onRemoteDiceRolled = (rp, rolledDice, lucky, _streakForfeited) => {
        if (lucky) {
            popup('lucky', 'LUCKY 7!', `${nameOf(rp)} rolled Lucky 7 (counts as 6+6)!`, 2500);
            sfx.fanfare();
        }

        // If current was desynced from active roller, abort stale turn cleanly and align to rp
        if (current !== rp) {
            latestRemoteTurn = rp;
            remoteTurnChangedPending = true;
            bumpTurnEpoch();
            if (waitRoll) {
                const r = waitRoll;
                waitRoll = null;
                waitRollTarget = -1;
                r(undefined);
            }
            if (waitChoice) {
                const c = waitChoice;
                waitChoice = null;
                c(undefined as any);
            }
            current = rp;
            diceColor = COLORS[rp];
            targetYaw = store.get().settings.rotate ? YAW_FOR[rp] : 0;
            publish();
        }

        // Resolve waiter if it belongs to this player
        if (waitRoll && (waitRollTarget === rp || waitRollTarget === -1 || current === rp)) {
            const r = waitRoll;
            waitRoll = null;
            waitRollTarget = -1;
            r([rolledDice[0], rolledDice[1]]);
        } else {
            pendingRemoteRoll = { p: rp, dice: [rolledDice[0], rolledDice[1]] };
        }
        refreshTurnText();
        syncHand();
    };

    bus.onRemotePawnMoved = (rp, dieIndex, tokenIndex, to, captures, reachedHome, passed) => {
        // Echo filter: if this is our own local tap already applied optimistically, skip it!
        // (If NOT in pendingLocalMoves, the server auto-played it on timeout — animate it normally.)
        if (isOnline() && rp === multiplayerClient.myPlayerIndex) {
            const locIdx = pendingLocalMoves.findIndex((pm) => pm.dieIndex === dieIndex && pm.tokenIndex === tokenIndex);
            if (locIdx !== -1) {
                pendingLocalMoves.splice(locIdx, 1);
                return;
            }
        }

        if (current !== rp && !remoteTurnChangedPending) {
            current = rp;
            diceColor = COLORS[rp];
            publish();
        }
        if (rp === multiplayerClient.myPlayerIndex) {
            bus.onGulDecision = undefined;
            store.patch({ gulPrompt: null, captureNotice: null, skipCapturePrompt: null });
        }
        if (passed) {
            if (dieIndex === 2) diceUsed = [true, true];
            else diceUsed[dieIndex] = true;
            popup('info', 'PASSED', `${nameOf(rp)} passed the Gul!`, 2000);
            if (waitChoice && current === rp) {
                const r = waitChoice;
                waitChoice = null;
                r(buildMoveFromServer(rp, dieIndex, tokenIndex, to, captures, reachedHome, true));
                return;
            }
            pendingRemoteMoves.push({ p: rp, dieIndex, tokenIndex, to, captures, reachedHome, passed: true });
            return;
        }
        if (waitChoice && current === rp) {
            const m = buildMoveFromServer(rp, dieIndex, tokenIndex, to, captures, reachedHome, false);
            const r = waitChoice;
            waitChoice = null;
            r(m);
            return;
        }
        pendingRemoteMoves.push({ p: rp, dieIndex, tokenIndex, to, captures, reachedHome, passed: false });
        refreshTurnText();
        syncHand();
    };

    bus.onRemotePenaltyApplied = (rp: number, tokenIndices: number[]) => {
        void penalize(rp, tokenIndices);
    };

    bus.onRemoteGameOver = (remoteWinner: number) => {
        sfx.stopHeartbeat();
        bumpTurnEpoch();
        winner = remoteWinner;
        bus.onGulDecision = undefined;
        store.patch({ gulPrompt: null, captureNotice: null, skipCapturePrompt: null });
        if (waitChoice) {
            const c = waitChoice;
            waitChoice = null;
            c(undefined as any);
        }
        if (waitRoll) {
            const r = waitRoll;
            waitRoll = null;
            waitRollTarget = -1;
            r(undefined);
        }
        if (turnChangeResolver) {
            const res = turnChangeResolver;
            turnChangeResolver = null;
            res(remoteWinner);
        }
        finish();
    };

    bus.onRemoteTurnChanged = (newTurn: number, extraTurn?: boolean) => {
        sfx.stopHeartbeat();
        latestRemoteTurn = newTurn;
        latestRemoteExtraTurn = !!extraTurn;
        remoteTurnChangedPending = true;
        bumpTurnEpoch();
        pendingLocalMoves.length = 0;
        // Purge pending remote moves that belonged to older turns
        for (let i = pendingRemoteMoves.length - 1; i >= 0; i--) {
            if (pendingRemoteMoves[i].p !== newTurn) {
                pendingRemoteMoves.splice(i, 1);
            }
        }
        clearHighlights();
        bus.onGulDecision = undefined;
        store.patch({ gulPrompt: null, captureNotice: null, skipCapturePrompt: null });

        // Every turn_changed starts an unrolled turn (including extra turns for the same player)
        pendingRemoteRoll = null;

        // Resynchronize tokens with authoritative server state
        syncTokensFromServer();

        if (turnChangeResolver) {
            const res = turnChangeResolver;
            turnChangeResolver = null;
            remoteTurnChangedPending = false;
            res(newTurn);
        }

        // Always interrupt active waiters from previous turn even if current was pre-aligned
        if (waitChoice) {
            const c = waitChoice;
            waitChoice = null;
            c(undefined as any);
        }
        if (waitRoll) {
            const r = waitRoll;
            waitRoll = null;
            waitRollTarget = -1;
            r(undefined as any);
        }
        current = newTurn;
        diceColor = COLORS[newTurn];
        targetYaw = store.get().settings.rotate ? YAW_FOR[newTurn] : 0;
        publish();
        refreshTurnText();
        syncHand();
    };

    bus.onRoomStateSynced = (state: any) => {
        if (!state || state.phase !== 'playing') return;
        latestRemoteTurn = state.currentTurn;
        latestRemoteExtraTurn = false;
        remoteTurnChangedPending = true;
        bumpTurnEpoch();
        pendingLocalMoves.length = 0;
        pendingRemoteMoves.length = 0;
        clearHighlights();
        bus.onGulDecision = undefined;
        store.patch({ gulPrompt: null, captureNotice: null, skipCapturePrompt: null });

        syncTokensFromServer();
        if (state.dice && state.currentTurn !== undefined) {
            pendingRemoteRoll = { p: state.currentTurn, dice: [state.dice[0], state.dice[1]] };
        } else {
            pendingRemoteRoll = null;
        }

        if (turnChangeResolver) {
            const res = turnChangeResolver;
            turnChangeResolver = null;
            remoteTurnChangedPending = false;
            res(state.currentTurn);
        }
        if (waitChoice) {
            const c = waitChoice;
            waitChoice = null;
            c(undefined as any);
        }
        if (waitRoll) {
            const r = waitRoll;
            waitRoll = null;
            waitRollTarget = -1;
            r(undefined);
        }
        current = state.currentTurn;
        diceColor = COLORS[current];
        targetYaw = store.get().settings.rotate ? YAW_FOR[current] : 0;
        publish();
        refreshTurnText();
        syncHand();
    };

    // ---------------------------------------------------------------- input
    // Humans can tap either a die first OR tap a movable token directly.
    // If a token is tapped directly, the game smart-matches the appropriate die instantly!
    function onDieTap(i: number) {
        if (isOnline()) {
            const myIdx = multiplayerClient.myPlayerIndex;
            const serverTurn = multiplayerClient.roomState?.currentTurn;
            // If server says it is my turn, synchronize current immediately so clicks are never locked out
            if (myIdx !== null && serverTurn === myIdx && current !== myIdx) {
                current = myIdx;
                diceColor = COLORS[myIdx];
                publish();
                refreshTurnText();
            }

            if (myIdx !== current) {
                // Strict turn locking: ignore taps on non-active screens
                return;
            }
            if (waitRoll) {
                const rollEpoch = turnEpoch;
                const currentWaitRoll = waitRoll;
                let rollResolved = false;
                const resolveInFlight = (val?: [number, number]) => {
                    if (rollResolved) return;
                    rollResolved = true;
                    turnAbortCallbacks.delete(abortRoll);
                    currentWaitRoll(val);
                };
                const abortRoll = () => resolveInFlight(undefined);
                turnAbortCallbacks.add(abortRoll);
                waitRoll = null;
                sfx.tap();
                void multiplayerClient.rollDice().then((res) => {
                    if (dead || turnEpoch !== rollEpoch) {
                        resolveInFlight(undefined);
                        return;
                    }
                    if (res?.ok && res.dice) {
                        if (pendingRemoteRoll?.p === myIdx) pendingRemoteRoll = null;
                        syncWish();
                        resolveInFlight(res.dice);
                    } else if (pendingRemoteRoll?.p === myIdx) {
                        const d = pendingRemoteRoll.dice;
                        pendingRemoteRoll = null;
                        syncWish();
                        resolveInFlight(d);
                    } else if (multiplayerClient.roomState?.currentTurn === myIdx && multiplayerClient.roomState?.dice) {
                        pendingRemoteRoll = null;
                        syncWish();
                        resolveInFlight(multiplayerClient.roomState.dice);
                    } else {
                        turnAbortCallbacks.delete(abortRoll);
                        // Restore waitRoll if still our turn and no dice rolled yet
                        if (multiplayerClient.roomState && multiplayerClient.roomState.currentTurn !== myIdx) {
                            current = multiplayerClient.roomState.currentTurn;
                            diceColor = COLORS[current];
                            publish();
                            refreshTurnText();
                            resolveInFlight(undefined);
                        } else if (!rollResolved) {
                            waitRoll = currentWaitRoll;
                            syncWish();
                        }
                        if (res && !res.ok) {
                            console.warn('Roll dice rejected by server:', res.error);
                            void multiplayerClient.syncState();
                        }
                    }
                });
                return;
            }
        }
        if (waitRoll && !isAI(current)) {
            sfx.tap();
            const r = waitRoll;
            waitRoll = null;
            syncWish();
            r();
            return;
        }
        if (waitChoice && (!isOnline() ? !isAI(current) : multiplayerClient.myPlayerIndex === current)) {
            if (i === 2) {
                if (diceUsed[0] || diceUsed[1] || !optionsNow.some((m) => m.die === 2)) return;
            } else if (diceUsed[i]) {
                return;
            } else if (!optionsNow.some((m) => m.die === i)) {
                if (!diceUsed[0] && !diceUsed[1] && optionsNow.some((m) => m.die === 2)) {
                    i = 2;
                } else {
                    return;
                }
            }
            sfx.tap();
            selDie = i;
            dieConfirmed = true;
            setStatus(tr(lang, 'pickToken'));
            refreshHighlights();
            syncHand();
        }
    }
    function onTokenTap(v: TokView) {
        if (!waitChoice) return;
        if (isOnline()) {
            const myIdx = multiplayerClient.myPlayerIndex;
            const serverTurn = multiplayerClient.roomState?.currentTurn;
            if (myIdx !== null && serverTurn === myIdx && current !== myIdx) {
                current = myIdx;
                diceColor = COLORS[myIdx];
                publish();
                refreshTurnText();
            }
            if (myIdx !== current || v.p !== myIdx) {
                return;
            }
        }
        if (!isOnline() && isAI(current)) return;
        if (v.p !== current) return;

        // Smart die resolution:
        // 1) Does currently selected die work for this token?
        let m = optionsNow.find((o) => o.die === selDie && o.tok === v.t);
        // 2) If user hasn't locked a single die, prefer a combined capture on this token if available
        if (!m || (!dieConfirmed && optionsNow.some((o) => o.tok === v.t && o.die === 2 && o.captures.length > 0))) {
            const capCombined = !dieConfirmed ? optionsNow.find((o) => o.tok === v.t && o.die === 2 && o.captures.length > 0) : undefined;
            if (capCombined) {
                m = capCombined;
                selDie = 2;
            } else if (!m) {
                m = optionsNow.find((o) => o.tok === v.t);
                if (m) {
                    selDie = m.die;
                }
            }
        }

        if (!m) {
            setStatus(tr(lang, 'pieceNeedsOtherDie'));
            flashDies();
            return;
        }

        dieConfirmed = true;
        sfx.tap();

        const proceedWithMove = () => {
            sfx.stopHeartbeat();
            if (m!.reachesHome) {
                store.patch({
                    gulPrompt: {
                        p: current,
                        tokenIndex: v.t,
                        dieIndex: m!.die,
                        value: m!.value,
                    },
                });
                bus.onGulDecision = (decision: 'gul' | 'pass') => {
                    bus.onGulDecision = undefined;
                    if (decision === 'gul') {
                        dieConfirmed = true;
                        sfx.tap();
                        if (isOnline()) {
                            pendingLocalMoves.push({ dieIndex: m!.die, tokenIndex: v.t });
                            void multiplayerClient.movePawn(m!.die, v.t, 'gul').then((res) => {
                                if (res && !res.ok && !dead) void multiplayerClient.syncState();
                            });
                        }
                        const r = waitChoice;
                        waitChoice = null;
                        if (r) r(m!);
                    } else {
                        dieConfirmed = true;
                        sfx.tap();
                        if (isOnline()) {
                            pendingLocalMoves.push({ dieIndex: m!.die, tokenIndex: v.t });
                            void multiplayerClient.movePawn(m!.die, v.t, 'pass').then((res) => {
                                if (res && !res.ok && !dead) {
                                    const idx = pendingLocalMoves.findIndex((pm) => pm.dieIndex === m!.die && pm.tokenIndex === v.t);
                                    if (idx !== -1) pendingLocalMoves.splice(idx, 1);
                                    void multiplayerClient.syncState();
                                }
                            });
                        }
                        if (m!.die === 2 || m!.combined) diceUsed = [true, true];
                        else diceUsed[m!.die] = true;
                        clearHighlights();
                        popup('info', 'PASSED', `${nameOf(current)} passed the Gul!`, 2000);
                        const r = waitChoice;
                        waitChoice = null;
                        if (r) r({ ...m!, reachesHome: false, to: tokens[current][v.t], passed: true } as any);
                    }
                };
                return;
            }

            if (isOnline()) {
                // Track local move so server echo does not double-move or consume next die
                pendingLocalMoves.push({ dieIndex: m!.die, tokenIndex: v.t });
                void multiplayerClient.movePawn(m!.die, v.t).then((res) => {
                    if (res && !res.ok && !dead) {
                        const idx = pendingLocalMoves.findIndex((pm) => pm.dieIndex === m!.die && pm.tokenIndex === v.t);
                        if (idx !== -1) pendingLocalMoves.splice(idx, 1);
                        void multiplayerClient.syncState();
                    }
                });
                // Execute move locally immediately for zero-latency instant response!
                const r = waitChoice;
                waitChoice = null;
                if (r) r(m!);
                return;
            }

            const r = waitChoice;
            waitChoice = null;
            if (r) r(m!);
        };

        // Respect configurable captureWarningMode ('first3' | 'always' | 'off') in both local Play & online pre-move checks
        const wouldSkipCapture = (() => {
            if (!captureWarningActive() || !turnObligation || turnObligation.required <= 0) return false;
            if (turnCapturesTaken >= turnObligation.required) return false;
            const afterCaps = turnCapturesTaken + (m.captures.length > 0 ? 1 : 0);
            if (afterCaps >= turnObligation.required) return false;
            if (m.combined || m.die === 2) return true;

            // Never warn when playing Step 1 of a valid combinedCaptures or pairCaptures plan
            if (!diceUsed[0] && !diceUsed[1]) {
                const isStep1OfCombined = turnObligation.combinedCaptures.some(
                    (c) => c.tokenIdx === m.tok && c.diceOrder[0] === m.die,
                );
                if (isStep1OfCombined) return false;

                const destKey = m.to >= 0 && m.to <= LAST_TRACK ? String(globalIdx(current, m.to)) : null;
                if (destKey) {
                    const isStep1OfPair = turnObligation.pairCaptures.some(
                        (pc) =>
                            pc.targetSquareKey === destKey &&
                            ((pc.tokens[0] === m.tok && m.die === 0) || (pc.tokens[1] === m.tok && m.die === 1)),
                    );
                    if (isStep1OfPair) return false;
                }
            }

            const sim = tokens.map((row) => row.slice());
            sim[current][m.tok] = m.to;
            for (const c of m.captures) sim[c.p][c.t] = IN_BASE;
            const nextUsed: [boolean, boolean] = [diceUsed[0], diceUsed[1]];
            nextUsed[m.die] = true;
            if (nextUsed[0] && nextUsed[1]) return true;

            const remOb = evaluateCaptureObligation(sim, current, dice, active, nextUsed);
            return afterCaps + remOb.required < turnObligation.required;
        })();

        if (wouldSkipCapture) {
            sfx.heartbeat();
            store.patch({
                skipCapturePrompt: {
                    message: 'This move leaves your capture requirement unmet. Every token with a capture option that did not capture will go back to base. Continue anyway?',
                },
            });
            bus.onSkipCaptureDecision = (decision: 'continue' | 'back') => {
                bus.onSkipCaptureDecision = undefined;
                sfx.stopHeartbeat();
                if (decision === 'continue') {
                    proceedWithMove();
                }
            };
            return;
        }

        proceedWithMove();
    }
    function flashDies() {
        dieFlash = 900;
        sfx.tap();
    }
    bus.wish = () => {
        if (!waitRoll || isAI(current)) return;
        const w = cfgs[current]?.wish;
        if (!w || wishUsed[current]) return;
        if (isOnline()) {
            const myIdx = multiplayerClient.myPlayerIndex;
            if (myIdx !== current) return;
            const wishEpoch = turnEpoch;
            wishUsed[current] = true;
            const currentWaitRoll = waitRoll;
            let wishResolved = false;
            const resolveWish = (val?: [number, number]) => {
                if (wishResolved) return;
                wishResolved = true;
                turnAbortCallbacks.delete(abortWish);
                currentWaitRoll(val);
            };
            const abortWish = () => resolveWish(undefined);
            turnAbortCallbacks.add(abortWish);
            waitRoll = null;
            syncWish();
            sfx.tap();
            void multiplayerClient.rollDice(true).then((res) => {
                if (dead || turnEpoch !== wishEpoch) {
                    resolveWish(undefined);
                    return;
                }
                if (res?.ok && res.dice) {
                    if (pendingRemoteRoll?.p === myIdx) pendingRemoteRoll = null;
                    syncWish();
                    resolveWish(res.dice);
                } else if (pendingRemoteRoll?.p === myIdx) {
                    const d = pendingRemoteRoll.dice;
                    pendingRemoteRoll = null;
                    syncWish();
                    resolveWish(d);
                } else if (multiplayerClient.roomState?.currentTurn === myIdx && multiplayerClient.roomState?.dice) {
                    pendingRemoteRoll = null;
                    syncWish();
                    resolveWish(multiplayerClient.roomState.dice);
                } else {
                    turnAbortCallbacks.delete(abortWish);
                    wishUsed[current] = false;
                    if (!wishResolved) {
                        waitRoll = currentWaitRoll;
                        syncWish();
                    }
                }
            });
            return;
        }
        wishUsed[current] = true;
        const r = waitRoll;
        waitRoll = null;
        syncWish();
        r([w[0], w[1]]);
    };
    function syncWish() {
        const w = cfgs[current]?.wish || null;
        const usable = !!w && !isAI(current) && !wishUsed[current];
        store.patch({
            wishNums: usable ? w : null,
            wishUsable: usable && !!waitRoll,
            isWaitingRoll: !!waitRoll && (isOnline() ? multiplayerClient.myPlayerIndex === current : !isAI(current)),
        });
    }

    function refreshHighlights() {
        if (isOnline() && multiplayerClient.myPlayerIndex !== current) {
            clearHighlights();
            return;
        }
        const mine = optionsNow.filter((m) => m.die === selDie);
        for (const v of views[current]) v.movable = mine.some((m) => m.tok === v.t);
    }
    function clearHighlights() {
        for (const row of views) for (const v of row) v.movable = false;
    }

    // ---------------------------------------------------------------- announcements
    function popup(kind: 'lucky' | 'penalty' | 'info', title: string, sub: string, ms: number) {
        store.patch({ popup: { kind, title, sub } });
        void delay(ms).then(() => {
            const cur = store.get().popup;
            if (cur && cur.title === title) store.patch({ popup: null });
        });
    }

    // ---------------------------------------------------------------- the game flow
    async function rollDice(p: number, forced?: [number, number], expectedEpoch?: number): Promise<{ a: number; b: number; lucky: boolean }> {
        let a = forced ? forced[0] : randDie();
        let b = forced ? forced[1] : randDie();
        const lucky = luckySevenAllowed(tokens, p) && isLuckySum(a, b) && !(a === 6 && b === 6);
        const dur = 850 / SPEED; // the dice tumble twice as long as the original 850 ms
        diceUsed = [true, true];
        diceColor = COLORS[p];
        startFly(p, a, b, dur);
        sfx.diceRoll(dur);
        await delay(dur + 150, expectedEpoch !== undefined);
        if (expectedEpoch !== undefined && isOnline() && turnEpoch !== expectedEpoch) {
            return { a, b, lucky };
        }
        dice = [a, b];
        diceUsed = [false, false];
        if (lucky) {
            await delay(700, expectedEpoch !== undefined);
            if (expectedEpoch !== undefined && isOnline() && turnEpoch !== expectedEpoch) {
                return { a, b, lucky };
            }
            a = 6;
            b = 6;
            dice = [6, 6];
            sfx.fanfare();
            popup('lucky', tr(lang, 'luckyT'), tr(lang, 'luckyS'), 3600);
            void sfx.speak({ text: tr(lang, 'sayLucky'), lang, player: p, cancelCurrent: true });
            anyAI('lucky', p, undefined, 0.8);
            await delay(2800, expectedEpoch !== undefined);
        }
        return { a, b, lucky };
    }

    function movesFor(p: number): Move[] {
        return legalMovesForTurn(tokens, p, dice, diceUsed, active);
    }

    async function moveToken(p: number, m: Move, expectedEpoch?: number) {
        const v = views[p][m.tok];
        const from = tokens[p][m.tok];
        const pts: [number, number][] = [boardPos(p, from, m.tok)];
        if (from === IN_BASE) pts.push(boardPos(p, 0, m.tok));
        else for (let r = from + 1; r <= m.to; r++) pts.push(boardPos(p, r, m.tok));
        const stepMs = 280;
        sfx.carMove(Math.min(2600, (pts.length - 1) * stepMs));
        // the token keeps its old logical position until the hop ends
        await tween(v, pts, stepMs, 0.55, expectedEpoch);
        // Never overwrite authoritative synced state if turn already changed mid-animation
        if (expectedEpoch === undefined || !isOnline() || turnEpoch === expectedEpoch) {
            tokens[p][m.tok] = m.to;
        }
    }

    async function sendHome(p: number, t: number, ms: number) {
        const v = views[p][t];
        const from = boardPos(p, tokens[p][t], t);
        const to = boardPos(p, IN_BASE, t);
        await tween(v, [from, to], ms, 1.8);
        tokens[p][t] = IN_BASE;
    }

    async function applyMove(p: number, m: Move, expectedEpoch?: number): Promise<{ captured: boolean; home: boolean }> {
        clearHighlights();
        const prevPos = tokens[p][m.tok];
        await moveToken(p, m, expectedEpoch);
        if (expectedEpoch !== undefined && isOnline() && turnEpoch !== expectedEpoch) {
            return { captured: false, home: false };
        }
        let captured = false;
        for (const c of m.captures) {
            // re-check: the victim is still on that square after landing
            captured = true;
            sfx.heartbeat();
            const victim = c.p;
            void sendHome(victim, c.t, 900);
            if (!isOnline()) {
                emitLocalBanter('capture', p, { n: nameOf(victim) }, 0.9);
                emitLocalBanter('captured', victim, undefined, 0.9);
            }
        }
        if (captured) await delay(1400, expectedEpoch !== undefined);
        if (expectedEpoch !== undefined && isOnline() && turnEpoch !== expectedEpoch) {
            return { captured, home: m.reachesHome };
        }
        if (!isOnline()) {
            if (m.reachesHome) {
                emitLocalBanter('pawn_home', p, undefined, 0.75);
            } else if (prevPos < PATH_START && m.to >= PATH_START) {
                emitLocalBanter('home_stretch', p, undefined, 0.7);
            } else if (m.fromBase) {
                emitLocalBanter('turn', p, undefined, 0.35);
            }
        }
        publish();
        return { captured, home: m.reachesHome };
    }

    let isPenalizing = false;
    async function penalize(p: number, tokenIndices: number[]) {
        if (isPenalizing || tokenIndices.length === 0) return;
        isPenalizing = true;
        try {
            const name = nameOf(p);
            for (const t of tokenIndices) {
                const v = views[p]?.[t];
                if (v) v.flash = 500;
            }
            sfx.buzzer();
            popup('penalty', tr(lang, 'penT'), tr(lang, 'penS', { n: name }), 2500);
            if (turnTxt && !turnTxt.destroyed) {
                turnTxt.text = tokenIndices.length > 1
                    ? `⚠️ PENALTY: ${name} missed required captures! ${tokenIndices.length} pawns sent back to base!`
                    : `⚠️ PENALTY: ${name} missed a capture! Pawn sent back to base!`;
            }
            await Promise.all(
                tokenIndices.map(async (t) => {
                    const v = views[p]?.[t];
                    if (v && tokens[p][t] !== IN_BASE) {
                        await sendHome(p, t, 600);
                    }
                    if (v) v.flash = 0;
                    tokens[p][t] = IN_BASE;
                }),
            );
            publish();
            if (!isOnline()) {
                emitLocalBanter('penalty', p, undefined, 0.85);
                emitRoundRobinBanter('banter', p, { n: name }, 0.65);
            }
            await delay(250);
        } finally {
            isPenalizing = false;
        }
    }

    async function takeTurn(p: number): Promise<boolean> {
        const myTurnEpoch = turnEpoch;
        const turnAborted = () => dead || winner >= 0 || (isOnline() && turnEpoch !== myTurnEpoch);

        // camera: bring this colour to the bottom-left
        targetYaw = store.get().settings.rotate ? YAW_FOR[p] : 0;
        diceColor = COLORS[p];
        current = p;
        diceUsed = [true, true];
        setStatus('');
        clearHighlights();
        bus.onGulDecision = undefined;
        store.patch({ gulPrompt: null, captureNotice: null, skipCapturePrompt: null });
        if (isOnline() && !pendingRemoteMoves.some((m) => m.p === p)) {
            syncTokensFromServer();
        }
        publish();
        syncWish();

        const settings = store.get().settings;
        const timerEnabled = settings.timerEnabled;
        const timerSec = settings.timerSec || 90;
        let turnTimerInterval: any = null;

        if (isOnline()) {
            // Online multiplayer: timer is authoritative from server & multiplayerClient
            turnTimerInterval = null;
        } else if (timerEnabled) {
            const turnDeadline = Date.now() + timerSec * 1000;
            store.patch({
                turnSecondsLeft: timerSec,
                turnTotalSec: timerSec,
                timerActive: true,
            });

            let lastTickedSecond: number = timerSec;
            turnTimerInterval = setInterval(() => {
                if (dead) return;
                const left = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
                store.patch({ turnSecondsLeft: left });
                if (left > 0 && left <= 5 && left !== lastTickedSecond) {
                    lastTickedSecond = left;
                    sfx.tick();
                }
                if (left <= 0) {
                    // Offline / singleplayer auto-roll or auto-move
                    if (waitRoll) {
                        const r = waitRoll;
                        waitRoll = null;
                        sfx.tick();
                        r();
                    } else if (waitChoice && optionsNow.length > 0) {
                        bus.onGulDecision = undefined;
                        store.patch({ gulPrompt: null });
                        const r = waitChoice;
                        waitChoice = null;
                        const caps = optionsNow.filter((m) => m.captures.length > 0);
                        const pool = caps.length > 0 ? caps : optionsNow;
                        const autoMove = pickBestAIMove(tokens, p, pool, active).move;
                        sfx.tick();
                        r(autoMove);
                    }
                }
            }, 250);
        } else {
            store.patch({
                turnSecondsLeft: 0,
                turnTotalSec: 0,
                timerActive: false,
            });
        }

        try {
            if (!isOnline()) {
                await delay(600);
            }
            if (turnAborted()) return false;

            if (!isOnline() && isAI(p) && Math.random() < 0.35) {
                emitLocalBanter('turn', p);
            }

            // --- roll
            let forced: [number, number] | undefined;
            let initialDiceUsedFromServer: [boolean, boolean] | null = null;
            if (isOnline()) {
                if (multiplayerClient.roomState?.currentTurn === p && multiplayerClient.roomState?.dice) {
                    forced = multiplayerClient.roomState.dice;
                    if (multiplayerClient.roomState.diceUsed) {
                        initialDiceUsedFromServer = [
                            !!multiplayerClient.roomState.diceUsed[0],
                            !!multiplayerClient.roomState.diceUsed[1],
                        ];
                    }
                } else if (pendingRemoteRoll && pendingRemoteRoll.p === p) {
                    forced = pendingRemoteRoll.dice;
                    pendingRemoteRoll = null;
                } else if (multiplayerClient.myPlayerIndex !== p) {
                    // Remote player or Bot turn: wait for server dice_rolled or turn change
                    forced = await new Promise<[number, number] | undefined>((res) => {
                        waitRollTarget = p;
                        waitRoll = (f) => res(f);
                    });
                } else {
                    // Local human turn in online mode: wait for tap OR server auto-roll on timeout
                    forced = await new Promise<[number, number] | undefined>((res) => {
                        waitRollTarget = p;
                        waitRoll = (f) => res(f);
                        syncWish();
                    });
                }
                if (!forced || turnAborted()) {
                    return false;
                }
            } else if (isAI(p)) {
                await delay(1200);
            } else {
                forced = await new Promise<[number, number] | undefined>((res) => {
                    waitRollTarget = p;
                    waitRoll = (f) => res(f);
                    syncWish();
                });
            }
            if (turnAborted()) return false;
            syncWish();
            const roll = await rollDice(p, forced, myTurnEpoch);
            if (turnAborted()) return false;
            if (initialDiceUsedFromServer) {
                diceUsed = initialDiceUsedFromServer;
            }
            const double6 = roll.a === 6 && roll.b === 6;
            if (!isOnline() && isAI(p)) {
                if (roll.lucky) emitLocalBanter('lucky7', p, undefined, 0.9);
                else if (double6) emitLocalBanter('lucky_roll', p, undefined, 0.75);
                else emitLocalBanter('roll', p, undefined, 0.3);
            }
            // Double 6 awards an extra turn unconditionally every time
            let extra = double6;

            // --- use each die
            turnObligation = evaluateCaptureObligation(tokens, p, dice, active, diceUsed);
            let capturePromise = turnObligation.required;
            turnCapturePromise = capturePromise;
            turnCapturesTaken = 0;
            turnTokensCaptured.clear();
            turnMovedToSquare.clear();
            let capturesTaken = 0;

            const isLocalHumanTurn = !isAI(p) && (!isOnline() || multiplayerClient.myPlayerIndex === p);
            if (isLocalHumanTurn && capturePromise > 0) {
                sfx.heartbeat();
            }

            const recordMoveCaptureAndUpgrade = (moveChosen: Move) => {
                const destKey =
                    moveChosen.to >= 0 && moveChosen.to <= LAST_TRACK
                        ? String(globalIdx(p, moveChosen.to))
                        : null;
                if (moveChosen.captures.length > 0) {
                    capturesTaken += 1;
                    turnCapturesTaken = capturesTaken;
                    turnTokensCaptured.add(moveChosen.tok);
                    if (destKey) {
                        for (const [partnerTok, partnerKey] of turnMovedToSquare.entries()) {
                            if (partnerTok !== moveChosen.tok && partnerKey === destKey) {
                                turnTokensCaptured.add(partnerTok);
                            }
                        }
                    }
                }
                if (destKey) turnMovedToSquare.set(moveChosen.tok, destKey);
                else turnMovedToSquare.delete(moveChosen.tok);

                // Mid-turn newly unlocked capture check when 1 die remains and initial obligation was 0
                if ((!diceUsed[0] || !diceUsed[1]) && !(diceUsed[0] && diceUsed[1])) {
                    if (turnObligation && turnObligation.required === 0) {
                        const remOb = evaluateCaptureObligation(tokens, p, dice, active, diceUsed);
                        if (remOb.required > 0) {
                            turnObligation.required = remOb.required;
                            turnObligation.singleDieCaptures.push(...remOb.singleDieCaptures);
                            const merged = Array.from(
                                new Set([...turnObligation.candidateTokenIndices, ...remOb.candidateTokenIndices]),
                            ).sort((a, b) => a - b);
                            turnObligation.candidateTokenIndices = merged;
                            turnObligation.optionTokens = merged;
                            turnObligation.hasSingle = turnObligation.hasSingle || remOb.hasSingle;
                            capturePromise = remOb.required;
                            turnCapturePromise = capturePromise;
                        }
                    }
                }
            };

            for (let guard = 0; guard < 4 && (!diceUsed[0] || !diceUsed[1]); guard++) {
                if (turnAborted()) break;
                optionsNow = movesFor(p);
                if (!optionsNow.length) {
                    sfx.stopHeartbeat();
                    store.patch({ captureNotice: null });
                    setStatus(tr(lang, 'noMoves'));
                    await delay(1100, isOnline());
                    setStatus('');
                    break;
                }

                if (isLocalHumanTurn && capturesTaken < capturePromise) {
                    if (guard > 0) sfx.heartbeat();
                    store.patch({
                        captureNotice:
                            capturePromise >= 2
                                ? `Multiple captures available! Complete at least ${capturePromise} captures or remaining option tokens go back to base.`
                                : 'Capture available! Complete a capture or every token with a capture option goes back to base.',
                    });
                } else {
                    store.patch({ captureNotice: null });
                }

                // In online mode, consume any server-received move first (covers remote turns AND timeout auto-play on local seat!)
                const pmIdx = isOnline() ? pendingRemoteMoves.findIndex((item) => item.p === p) : -1;
                if (pmIdx !== -1) {
                    const pm = pendingRemoteMoves.splice(pmIdx, 1)[0];
                    setStatus('');
                    if (pm.dieIndex === 2) diceUsed = [true, true];
                    else diceUsed[pm.dieIndex] = true;
                    if (pm.passed) {
                        optionsNow = [];
                        continue;
                    }
                    const preChosen = buildMoveFromServer(p, pm.dieIndex, pm.tokenIndex, pm.to, pm.captures, pm.reachedHome, false);
                    const res = await applyMove(p, preChosen, myTurnEpoch);
                    if (turnAborted()) break;
                    recordMoveCaptureAndUpgrade(preChosen);
                    if (res.captured || res.home) extra = true;
                    if (hasWon(tokens, p)) {
                        winner = p;
                        return false;
                    }
                    optionsNow = [];
                    continue;
                }

                if (isOnline() && multiplayerClient.myPlayerIndex !== p) {
                    if (turnAborted()) break;
                    // Remote player or Bot turn: wait for socket pawn move event
                    const chosen = await new Promise<Move | undefined>((res) => {
                        waitChoice = (m) => res(m);
                    });
                    if (!chosen || turnAborted()) {
                        break;
                    }
                    setStatus('');
                    if (chosen.die === 2 || chosen.combined) diceUsed = [true, true];
                    else diceUsed[chosen.die] = true;
                    if ((chosen as any).passed) {
                        optionsNow = [];
                        continue;
                    }
                    const res = await applyMove(p, chosen, myTurnEpoch);
                    if (turnAborted()) break;
                    recordMoveCaptureAndUpgrade(chosen);
                    if (res.captured || res.home) extra = true;
                    if (hasWon(tokens, p)) {
                        winner = p;
                        return false;
                    }
                    optionsNow = [];
                    continue;
                }
                if (!isOnline() && isAI(p)) {
                    const { move: chosen } = pickBestAIMove(
                        tokens,
                        p,
                        optionsNow,
                        active,
                        dice,
                        diceUsed,
                        turnObligation,
                        capturesTaken,
                    );
                    selDie = chosen.die;
                    refreshHighlights();
                    await delay(900);
                    if (chosen.die === 2 || chosen.combined) diceUsed = [true, true];
                    else diceUsed[chosen.die] = true;
                    const res = await applyMove(p, chosen, myTurnEpoch);
                    recordMoveCaptureAndUpgrade(chosen);
                    if (res.captured || res.home) extra = true;
                    if (hasWon(tokens, p)) {
                        winner = p;
                        return false;
                    }
                    optionsNow = [];
                    continue;
                }

                if (turnAborted()) break;
                // --- human: tap a die (or combined sum) to choose it, then tap a token to move it
                setStatus(tr(lang, 'pickDie'));
                const usableDies = [0, 1].filter((i) => !diceUsed[i] && optionsNow.some((m) => m.die === i));
                const hasCombined = !diceUsed[0] && !diceUsed[1] && optionsNow.some((m) => m.die === 2);
                if (usableDies.length > 0) {
                    if (!usableDies.includes(selDie) && !(selDie === 2 && hasCombined)) selDie = usableDies[0];
                } else if (hasCombined) {
                    selDie = 2;
                }
                refreshHighlights();
                if (!isOnline() && Math.random() < 0.25) emitRoundRobinBanter('banter', p, undefined, 0.5);
                const chosen = await new Promise<Move | undefined>((res) => {
                    waitChoice = res as any;
                });
                if (!chosen || turnAborted()) {
                    optionsNow = [];
                    break;
                }
                setStatus('');
                if (chosen.die === 2 || chosen.combined) diceUsed = [true, true];
                else diceUsed[chosen.die] = true;
                if ((chosen as any).passed) {
                    optionsNow = [];
                    continue;
                }
                const res = await applyMove(p, chosen, myTurnEpoch);
                if (turnAborted()) break;
                recordMoveCaptureAndUpgrade(chosen);
                if (res.captured || res.home) extra = true;
                if (hasWon(tokens, p)) {
                    winner = p;
                    return false;
                }
                optionsNow = [];
            }
            sfx.stopHeartbeat();
            store.patch({ captureNotice: null, skipCapturePrompt: null });
            // Settle up: if captures made < required, every candidate token that did not capture returns to base.
            // In online multiplayer, server is authoritative and broadcasts penalty_applied.
            if (!isOnline() && turnObligation && turnObligation.required > 0 && capturesTaken < turnObligation.required) {
                const offending = offendingTokensForPenalty(turnObligation, capturesTaken, turnTokensCaptured, tokens[p]);
                if (offending.length > 0) {
                    await penalize(p, offending);
                    extra = false;
                }
            }
            turnObligation = null;
            diceUsed = [true, true];
            clearHighlights();
            return extra;
        } finally {
            sfx.stopHeartbeat();
            if (turnTimerInterval) {
                clearInterval(turnTimerInterval);
            }
            bus.onGulDecision = undefined;
            bus.onSkipCaptureDecision = undefined;
            if (!isOnline()) {
                store.patch({ timerActive: false, gulPrompt: null, captureNotice: null, skipCapturePrompt: null });
            } else {
                store.patch({ gulPrompt: null, captureNotice: null, skipCapturePrompt: null });
            }
        }
    }

    function finish() {
        sfx.stopHeartbeat();
        const rows = [0, 1, 2, 3]
            .filter((p) => active[p])
            .map((p) => ({ idx: p, pct: p === winner ? 100 : percent(tokens, p), fine: fineProgress(tokens, p) }));
        rows.sort((a, b) => (a.idx === winner ? -1 : b.idx === winner ? 1 : b.pct - a.pct || b.fine - a.fine));
        ranking = rows.map((r) => ({ idx: r.idx, pct: r.pct }));
        publish();
        sfx.fanfare();
        if (!isOnline()) {
            emitLocalBanter('win', winner, undefined, 1);
            const losingAi = rows.find((r) => r.idx !== winner && isAI(r.idx));
            if (losingAi) emitLocalBanter('loss', losingAi.idx, undefined, 0.9);
        }
        store.patch({ result: ranking, popup: null, wishUsable: false });
    }

    async function run() {
        publish();
        await delay(600);
        if (!isOnline()) emitRoundRobinBanter('banter', -1, undefined, 0.8);
        let p = current;
        while (!dead && winner < 0) {
            const extra = await takeTurn(p);
            if (dead) return;
            if (!isOnline()) {
                chatterAfterTurn(p);
            }
            if (isOnline()) {
                // In online multiplayer, server is authoritative on turn order and extra turns.
                // If turn_changed already arrived while we were animating/resolving, consume it immediately:
                if (remoteTurnChangedPending && latestRemoteTurn !== null) {
                    p = latestRemoteTurn;
                    remoteTurnChangedPending = false;
                    latestRemoteTurn = null;
                } else if (latestRemoteTurn !== null) {
                    p = latestRemoteTurn;
                    latestRemoteTurn = null;
                } else {
                    // Wait for server's authoritative turn_changed event
                    p = await new Promise<number>((res) => {
                        let settled = false;
                        const finishWait = (newTurn: number) => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(fallbackTimer);
                            turnChangeResolver = null;
                            res(newTurn);
                        };
                        const fallbackTimer = setTimeout(() => {
                            if (settled) return;
                            void multiplayerClient.syncState().then(() => {
                                // onRoomStateSynced usually resolves turnChangeResolver; only fallback if still unsettled
                                if (!settled) {
                                    finishWait(multiplayerClient.roomState?.currentTurn ?? (extra ? p : nextActive(p)));
                                }
                            });
                        }, 3500);
                        turnChangeResolver = finishWait;
                    });
                }
            } else {
                p = extra ? p : nextActive(p);
            }
        }
        if (!dead && winner >= 0) finish();
    }

    // ---------------------------------------------------------------- ticker
    let now = 0;
    const tick = () => {
        if (dead) return;
        const dt = Math.min(60, app.ticker.deltaMS);
        clock += dt;
        now += dt;
        for (let i = timers.length - 1; i >= 0; i--) {
            if (timers[i].t <= clock) {
                const cb = timers.splice(i, 1)[0].cb;
                cb();
            }
        }
        updateTweens(dt);
        for (const row of views) for (const v of row) if (v.flash > 0) v.flash -= dt;

        // camera
        const st = store.get().settings;
        lang = st.lang;
        if (!st.rotate) targetYaw = 0;
        const targetPitch = Math.max(20, Math.min(90, st.tilt));
        const rate = 1 - Math.exp(-(2.0 * BOARD_SPEED * dt) / 1000);
        yaw += wrap180(targetYaw - yaw) * rate;
        pitch += (targetPitch - pitch) * rate;
        moving = Math.abs(wrap180(targetYaw - yaw)) > 0.6 || Math.abs(targetPitch - pitch) > 0.6;
        const tc = COLORS[current];
        outline = mix(outline, tc, Math.min(1, dt / 350));

        fitBoard();
        const sig = [yaw.toFixed(1), pitch.toFixed(1), S.toFixed(1), OX.toFixed(0), OY.toFixed(0), outline, st.bg].join('|');
        if (sig !== lastSig) {
            lastSig = sig;
            drawBoard();
        }
        bgFill.tint = 0xffffff;
        updateTokens(now);
        updatePlates(dt);
        if (homeCenterTxt?.position && homeCenterTxt?.scale && !homeCenterTxt.destroyed) {
            const midP = P(7.5, 7.5, 0.05);
            homeCenterTxt.position.set(midP.x, midP.y);
            homeCenterTxt.scale.set(Math.max(0.7, S * 0.024));
        }
        updateFly(dt);
        drawDice(now);
        syncHand();
        updateHand(dt);
        refreshTurnText();
        updateChat();
    };

    layout();
    const offResize = stage.onResize(layout);
    bgFill.clear().rect(-60, -60, stage.designWidth() + 120, stage.designHeight() + 120).fill(BG_BASE[store.get().settings.bg]);
    // keep the page background in step with the chosen table
    const unsubStore = store.subscribe(() => {
        bgFill.clear().rect(-60, -60, stage.designWidth() + 120, stage.designHeight() + 120).fill(BG_BASE[store.get().settings.bg]);
    });
    const onVisibilityChange = () => {
        if (dead) return;
        if (!document.hidden && isOnline()) {
            void multiplayerClient.syncState();
        }
    };
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
    }

    app.ticker.add(tick);
    store.patch({ result: null, popup: null, active: active.slice() });
    void run();

    return {
        destroy() {
            dead = true;
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', onVisibilityChange);
            }
            offResize();
            unsubStore();
            app.ticker.remove(tick);
            bus.chat = undefined;
            bus.wish = undefined;
            bus.roll = undefined;
            bus.onRemoteDiceRolled = undefined;
            bus.onRemotePawnMoved = undefined;
            bus.onRemoteTurnChanged = undefined;
            bus.onRemotePenaltyApplied = undefined;
            bus.onRemoteGameOver = undefined;
            bus.onRoomStateSynced = undefined;
            bus.onGulDecision = undefined;
            bus.onSkipCaptureDecision = undefined;
            bus.onRemoteAiBanter = undefined;
            bumpTurnEpoch();
            // release anything the turn loop is awaiting, so it can unwind cleanly
            if (turnChangeResolver) { const res = turnChangeResolver; turnChangeResolver = null; res(0); }
            if (waitRoll) { const r = waitRoll; waitRoll = null; r(); }
            if (waitChoice) { const c = waitChoice; waitChoice = null; c(optionsNow[0]); }
            handTarget = null;
            sfx.stopHeartbeat();
            sfx.stopSpeech();
            tweens.length = 0;
            timers.length = 0;
            root.removeChildren();
            store.patch({ wishNums: null, wishUsable: false, isWaitingRoll: false, gulPrompt: null, captureNotice: null, skipCapturePrompt: null, nameplateBounds: [] });
        },
    };
}

// silence "unused" for helpers kept for readability
void PATH_START;
void SAFE;
void globalIdx;
