// The Ludo Emperor game scene: tilted/rotating pseudo-3D board, 3D-style pawns, two dice,
// computer players that gang up on the leader, penalties, Lucky Seven, talk and sound.
import { Application, Circle, Container, Graphics, Text } from 'pixi.js';
import type { Stage } from './stage';
import { store, type PlayerCfg } from '../state/store';
import { multiplayerClient } from '../network/multiplayerClient';
import { bus } from './bus';
import { tr, colorName } from '../i18n';
import {
    BASE_CENTER, BASE_SPOTS, COLORS, HOME, HOME_COL, IN_BASE, LAST_TRACK, PATH_START, SAFE, STAR_IDX, START_IDX, TRACK,
    boardPos, fineProgress, globalIdx, hasWon, isLuckySum, legalMoves, luckySevenAllowed, maxCaptures, newTokens,
    percent, pickMove, randDie, type Move, type Tokens,
} from './rules';
import { BG_BASE, circlePts, drawBackground, drawDie, drawPawn, mix, shade, starPts } from './draw';
import * as sfx from './sfx';
import * as banter from './banter';
import type { Cat } from './banter';

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
    root.addChild(bgFill, bgG, boardG, shadowLayer, tokenLayer, plateLayer, flyLayer, uiLayer);

    // ---------------------------------------------------------------- game state
    const tokens: Tokens = newTokens();
    let current = active.findIndex((a) => a);
    let winner = -1;
    let ranking: { idx: number; pct: number }[] = [];
    const wishUsed = [false, false, false, false];
    const sixStreak = [0, 0, 0, 0];

    let dice: [number, number] = [5, 2];
    let diceUsed: [boolean, boolean] = [true, true];
    let selDie = 0;
    // humans pick the die explicitly; dieConfirmed is true once they have, and
    // dieFlash briefly highlights the dice when they try to skip that step
    let dieConfirmed = false;
    let dieFlash = 0;
    let diceColor = COLORS[current];
    let waitRoll: ((forced?: [number, number]) => void) | null = null;
    let waitChoice: ((m: Move) => void) | null = null;
    let optionsNow: Move[] = [];
    let statusText = '';

    const nameOf = (p: number): string => {
        const n = (cfgs[p]?.name || '').trim();
        if (!n || DEFAULT_NAMES.includes(n.toLowerCase()) || n === colorName(lang, p)) return colorName(lang, p);
        return n;
    };
    const plateName = (p: number) => nameOf(p).toUpperCase();
    const avatarOf = (p: number) => cfgs[p]?.avatar || '🎲';
    const isAI = (p: number) => !!cfgs[p]?.ai;
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

    // ---------------------------------------------------------------- timers / tweens (ticker clock, pause-safe)
    let clock = 0;
    const timers: { t: number; cb: () => void }[] = [];
    const delay = (ms: number) => new Promise<void>((res) => timers.push({ t: clock + ms, cb: res }));
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
    let boardRect = { x: 10, y: 170, w: 700, h: 520 };
    let diceCY = 800, diceSize = 96;
    let diceCX = [260, 460];
    let turnY = 880, chatY = 920;
    let colX = 20, colW = 680;
    let adRect = { x: 20, y: 1000, w: 680, h: 190 };

    function layout() {
        const W = stage.designWidth(), H = stage.designHeight();
        bgFill.clear().rect(-60, -60, W + 120, H + 120).fill(BG_BASE[store.get().settings.bg]);
        if (stage.landscape()) {
            const bw = Math.min(W * 0.56, 800);
            boardRect = { x: 24, y: 84, w: bw, h: H - 84 - 84 };
            colX = 24 + bw + 34;
            colW = W - colX - 24;
            // dice at a third of their previous size, kept close together so the
            // pair reads as one control and is easy to tap
            diceSize = Math.min(104, colW * 0.2) / 3;
            diceCY = 232;
            diceCX = [colX + colW / 2 - diceSize * 1.15, colX + colW / 2 + diceSize * 1.15];
            turnY = diceCY + diceSize * 0.5 + 34;
            chatY = turnY + 40;
            const adTop = chatY + 84;
            // banner 20% taller than the panel it replaced, capped so it never
            // runs under the music / fullscreen buttons at the bottom.
            const adRoom = Math.max(60, H - adTop - 110);
            adRect = { x: colX, y: adTop, w: colW, h: Math.max(90, adRoom) };
        } else {
            const boardH = Math.max(380, Math.min(H * 0.4, 640));
            boardRect = { x: 12, y: 176, w: W - 24, h: boardH };
            colX = 14;
            colW = W - 28;
            // dice at a third of their previous size, kept close together
            diceSize = 96 / 3;
            diceCY = boardRect.y + boardRect.h + 56 + 62;
            diceCX = [W / 2 - diceSize * 1.15, W / 2 + diceSize * 1.15];
            turnY = diceCY + diceSize * 0.5 + 34;
            chatY = turnY + 38;
            const adTop = chatY + 84;
            // same 20% increase, capped so it never reaches the bottom buttons
            const adRoom = Math.max(60, H - adTop - 110);
            adRect = { x: 16, y: adTop, w: W - 32, h: Math.max(90, Math.min(adRoom, 380)) };
        }
        document.getElementById('app-frame')?.style.setProperty('--colx', String(colX));
        document.getElementById('app-frame')?.style.setProperty('--colw', String(colW));
        buildUi();
        lastSig = '';
    }

    function fitBoard() {
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
        S = Math.min(boardRect.w / (maxX - minX), boardRect.h / (maxY - minY));
        OX = boardRect.x + boardRect.w / 2 - ((minX + maxX) / 2) * S;
        OY = boardRect.y - minY * S;
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
        for (let t = 0; t < 4; t++) {
            const c = new Container();
            const body = new Graphics();
            drawPawn(body, COLORS[p]);
            c.addChild(body);
            c.eventMode = 'static';
            c.cursor = 'pointer';
            c.hitArea = new Circle(0, -0.4, 0.62);
            const shadow = new Graphics();
            shadow.ellipse(0, 0, 0.36, 0.14).fill({ color: 0x000000, alpha: 0.3 });
            const ring = new Graphics();
            ring.ellipse(0, 0, 0.5, 0.2).stroke({ width: 0.08, color: 0xffffff, alpha: 0.95 });
            ring.visible = false;
            const v: TokView = { p, t, c, body, shadow, ring, vx: 0, vy: 0, vz: 0, tween: null, movable: false, flash: 0, phase: Math.random() * 6 };
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

    function tween(tok: TokView, pts: [number, number][], stepMs: number, hop: number): Promise<void> {
        return new Promise<void>((res) => {
            const tw: Tween = { tok, pts, seg: 0, u: 0, stepMs, hop, done: res };
            tok.tween = tw;
            tweens.push(tw);
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
                const bounce = v.movable ? Math.abs(Math.sin(now / 1000 * 6 + v.phase)) * 0.38 : 0;
                v.c.position.set(pr.x, pr.y - bounce * S * pr.k);
                v.c.scale.set(S * pr.k * crowd);
                v.c.zIndex = -gr.d * 100 + (v.tween ? 500 : 0);
                v.shadow.position.set(gr.x, gr.y);
                v.shadow.scale.set(S * gr.k * crowd * (1 - Math.min(0.5, v.vz * 0.25)));
                v.ring.position.set(gr.x, gr.y);
                v.ring.scale.set(S * gr.k * crowd);
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
        const txt = new Text({ text: '', style: { fontFamily: 'Arial Black, Impact, sans-serif', fontSize: 25, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x1a1a1a, width: 5 }, letterSpacing: 1 } });
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
        const h = 46;
        g.roundRect(-w / 2, -h / 2 + 7, w, h, 12).fill(shade(COLORS[p], 0.45));
        g.roundRect(-w / 2, -h / 2, w, h, 12).fill(COLORS[p]).stroke({ width: 3, color: shade(COLORS[p], 0.6) });
        g.roundRect(-w / 2 + 6, -h / 2 + 4, w - 12, 12, 6).fill({ color: 0xffffff, alpha: 0.25 });
    }
    function updatePlates(dt: number) {
        const target = moving ? 0 : 1;
        platesAlpha += (target - platesAlpha) * Math.min(1, dt / 160);
        const c0 = P(0, 0), c1 = P(15, 0), c2 = P(15, 15), c3 = P(0, 15);
        const top = Math.min(c0.y, c1.y, c2.y, c3.y);
        const bottom = Math.max(P(0, 15, -0.7).y, P(15, 15, -0.7).y, c0.y, c1.y, c2.y, c3.y);
        const midY = (top + bottom) / 2;
        for (let p = 0; p < 4; p++) {
            const pl = plates[p];
            if (!active[p]) continue;
            const b = P(BASE_CENTER[p][0], BASE_CENTER[p][1]);
            const above = b.y < midY;
            pl.c.position.set(Math.max(80, Math.min(stage.designWidth() - 80, b.x)), above ? top - 34 : bottom + 36);
            const name = plateName(p);
            if (pl.txt.text !== name) {
                pl.txt.text = name;
            }
            const size = name.length > 10 ? 18 : name.length > 7 ? 21 : 25;
            if (pl.txt.style.fontSize !== size) pl.txt.style.fontSize = size;
            const w = 164;
            drawPlate(p, w);
            pl.c.alpha = platesAlpha;
        }
    }

    // ---------------------------------------------------------------- dice (under the board) + status text + chat + ad
    const dieC: Container[] = [];
    const dieG: Graphics[] = [];
    let turnTxt: Text;
    const chatTxt: Text[] = [];
    let adC: Container;

    function buildUi() {
        uiLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
        dieC.length = 0;
        dieG.length = 0;
        for (let i = 0; i < 2; i++) {
            const c = new Container();
            const g = new Graphics();
            c.addChild(g);
            c.position.set(diceCX[i], diceCY);
            c.eventMode = 'static';
            c.cursor = 'pointer';
            c.hitArea = new Circle(0, 0, diceSize * 0.75);
            c.on('pointertap', () => onDieTap(i));
            uiLayer.addChild(c);
            dieC.push(c);
            dieG.push(g);
        }
        // half-size text for the turn line and the AI chatter
        turnTxt = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 15, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
        turnTxt.anchor.set(0.5);
        turnTxt.position.set(diceCX[0] / 2 + diceCX[1] / 2, turnY);
        uiLayer.addChild(turnTxt);
        chatTxt.length = 0;
        for (let i = 0; i < 2; i++) {
            const t = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x000000, width: 2 }, wordWrap: true, wordWrapWidth: colW - 20, align: 'center' } });
            t.anchor.set(0.5, 0);
            t.position.set(colX + colW / 2, chatY + i * 40);
            uiLayer.addChild(t);
            chatTxt.push(t);
        }
        // advertisement banner placeholder (no real ad network is wired in here).
        // Fully transparent: only the outline, the AD tag and the label show, so
        // the table background stays visible behind the slot.
        adC = new Container();
        const ag = new Graphics();
        ag.roundRect(0, 0, adRect.w, adRect.h, 18).fill({ color: 0x10142b, alpha: 0 }).stroke({ width: 3, color: 0x00e5ff, alpha: 0.7 });
        ag.roundRect(10, 10, 58, 28, 8).fill(0xffc107);
        const adTag = new Text({ text: 'AD', style: { fontFamily: 'Arial', fontSize: 20, fontWeight: '900', fill: 0x222222 } });
        adTag.anchor.set(0.5);
        adTag.position.set(39, 24);
        const adTxt = new Text({ text: 'ADVERTISEMENT · Your banner here', style: { fontFamily: 'Arial', fontSize: Math.min(40, adRect.h * 0.22), fontWeight: '800', fill: 0xbfc8ff, align: 'center' } });
        adTxt.anchor.set(0.5);
        adTxt.position.set(adRect.w / 2, adRect.h / 2);
        adC.addChild(ag, adTag, adTxt);
        adC.position.set(adRect.x, adRect.y);
        adC.eventMode = 'static';
        adC.on('pointertap', () => { /* banner slot: hook an ad SDK here */ });
        uiLayer.addChild(adC);
    }

    function drawDice(now: number) {
        for (let i = 0; i < 2; i++) {
            const used = diceUsed[i];
            const rollingIdle = !!waitRoll && !isAI(current);
            // "tap a die" nudge: both dice breathe so it is obvious they are buttons
            const choosingDie = !!waitChoice && !used && !dieConfirmed;
            const pulse = (rollingIdle || dieFlash > 0 ? 1 + 0.06 * Math.sin(now / 160) : 1) * (choosingDie ? 1 + 0.04 * Math.sin(now / 220) : 1);
            const sel = !used && selDie === i && !!waitChoice;
            drawDie(dieG[i], diceSize, dice[i], diceColor, current === 2 ? 0x2a2a2a : 0xffffff, { dim: used && !waitRoll, glow: sel });
            dieC[i].scale.set(pulse);
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
    hand.eventMode = 'none';
    /** Distance from the glyph's centre down to roughly its fingertip. */
    const handTipDrop = () => hand.height * 0.34;
    let handTarget: { x: number; y: number } | null = null;
    /** Clear space between the fingertip and the target's centre. */
    let handGap = 22;
    let handShown = false;

    function dieCenter(i: number) {
        return { x: dieC[i]?.position.x ?? diceCX[i], y: dieC[i]?.position.y ?? diceCY };
    }
    function syncHand() {
        if ((multiplayerClient.roomCode && multiplayerClient.myPlayerIndex !== current) || isAI(current) || winner >= 0) {
            handTarget = null;
        } else if (waitRoll) {
            handTarget = dieCenter(0); // any die starts the roll
            handGap = 24;
        } else if (waitChoice) {
            const usable = optionsNow.filter((m) => m.die === selDie);
            if (!dieConfirmed) {
                handTarget = dieCenter(selDie); // step 1: which number
                handGap = 24;
            } else if (usable.length) {
                // step 2: point down at the piece to move (follows the board)
                const v = views[current][usable[0].tok];
                handTarget = { x: v.c.x, y: v.c.y };
                handGap = 16;
            } else {
                handTarget = dieCenter(selDie);
                handGap = 24;
            }
        } else {
            handTarget = null;
        }
        if (handTarget && !handShown) {
            handShown = true;
            uiLayer.addChild(hand);
        } else if (!handTarget && handShown) {
            handShown = false;
            hand.removeFromParent();
        }
    }
    function updateHand(dt: number) {
        const want = handTarget ? 0.95 : 0;
        hand.alpha += (want - hand.alpha) * Math.min(1, dt / 160);
        if (!handTarget) return;
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
        if (multiplayerClient.roomCode) {
            const isMe = multiplayerClient.myPlayerIndex === current;
            if (isMe) {
                turnTxt.text = waitRoll
                    ? `🎯 Your Turn! Roll the dice (${multiplayerClient.turnSecondsLeft}s)`
                    : `🎲 Pick a die & move your pawn (${multiplayerClient.turnSecondsLeft}s)`;
                turnTxt.style.fill = 0x22c55e;
            } else {
                turnTxt.text = `⏳ Waiting for ${nameOf(current)} to ${waitRoll ? 'roll' : 'move'} (${multiplayerClient.turnSecondsLeft}s)...`;
                turnTxt.style.fill = 0xfacc15;
            }
            return;
        }
        turnTxt.text = statusText || `${avatarOf(current)} ${tr(lang, 'turn', { n: nameOf(current) })}`;
        turnTxt.style.fill = statusText ? 0xffffff : mix(COLORS[current], 0xffffff, 0.25);
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
            f.c.position.set(x, y - hop);
            f.c.rotation = f.rot + f.spin * u * (1 - u * 0.6) * 1.4;
            f.c.scale.set(1 + 0.06 * Math.sin(u * 30 + i));
            f.sh.clear().ellipse(0, 0, size * 0.55, size * 0.2).fill({ color: 0x000000, alpha: 0.28 * (1 - hop / (S * 5)) });
            f.sh.position.set(x, y + size * 0.35);
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
        for (let i = 0; i < 2; i++) {
            const idx = lines.length - 1 - i;
            const t = chatTxt[1 - i];
            if (!t) continue;
            if (idx < 0) {
                t.text = '';
                continue;
            }
            const l = lines[idx];
            const age = clock - l.born;
            t.text = `${avatarOf(l.idx)} ${nameOf(l.idx)}: ${l.text}`;
            t.style.fill = mix(COLORS[l.idx], 0xffffff, 0.35);
            t.alpha = age > 6500 ? Math.max(0, 1 - (age - 6500) / 1500) : 1;
        }
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
        if (queue.length > 5 && !front) return; // never flood
        if (front) queue.unshift(item);
        else queue.push(item);
        void pump();
    }

    /** A computer player says something (if it's not a human seat). */
    function ai(cat: Cat, idx: number, vars?: Record<string, string>, chance = 1) {
        if (!active[idx] || !isAI(idx) || Math.random() > chance) return;
        const l = banter.line(cat, lang, idx, vars);
        if (l) {
            lastSpoke[idx] = clock;
            enqueue({ idx, text: l.text, alt: l.alt, voice: true });
        }
    }
    /** The computer player (other than `not`) who has been quiet the longest speaks, so every AI gets a voice. */
    function anyAI(cat: Cat, not: number, vars?: Record<string, string>, chance = 1) {
        const pool = [0, 1, 2, 3].filter((q) => q !== not && active[q] && isAI(q));
        if (!pool.length) return;
        pool.sort((a, b) => lastSpoke[a] - lastSpoke[b]);
        ai(cat, pool[0], vars, chance);
    }
    const lastSpoke = [-1e9, -1e9, -1e9, -1e9];
    /** After every turn, whichever AI has been silent longest chips in with a joke, threat or compliment. */
    function chatterAfterTurn(actor: number) {
        const cats: Cat[] = ['joke', 'threat', 'praise', 'advice', 'laugh', 'yard', 'sore'];
        if (Math.random() < 0.6) anyAI(cats[Math.floor(Math.random() * cats.length)], actor, undefined, 1);
    }

    bus.chat = (idx, text, o) => {
        if (!active[idx]) return;
        enqueue({ idx, text, voice: o?.voice !== false }, true);
    };

    bus.onRemoteDiceRolled = (rp, rolledDice) => {
        if (rp === current && waitRoll) {
            const r = waitRoll;
            waitRoll = null;
            r([rolledDice[0], rolledDice[1]]);
        }
    };

    bus.onRemotePawnMoved = (rp, dieIndex, tokenIndex) => {
        if (rp === current && waitChoice) {
            const m = optionsNow.find((o) => o.die === dieIndex && o.tok === tokenIndex)
                || legalMoves(tokens, rp, dice[dieIndex], dieIndex, active).find((o) => o.tok === tokenIndex);
            if (m) {
                const r = waitChoice;
                waitChoice = null;
                r(m);
            }
        }
    };

    // ---------------------------------------------------------------- input
    // Humans always work in two taps: first pick the die (a number), then pick
    // the token (a piece). This keeps doubled dice honest -- the player decides
    // which 5 they are spending instead of the game guessing for them.
    // (dieConfirmed / dieFlash are declared with the dice state above.)
    function onDieTap(i: number) {
        if (multiplayerClient.roomCode) {
            if (multiplayerClient.myPlayerIndex !== current) {
                // Strict turn locking: ignore taps on non-active screens
                return;
            }
            if (waitRoll) {
                sfx.tap();
                void multiplayerClient.rollDice();
                return;
            }
        }
        if (waitRoll && !isAI(current)) {
            sfx.tap();
            const r = waitRoll;
            waitRoll = null;
            r();
            return;
        }
        if (waitChoice && !diceUsed[i] && (!multiplayerClient.roomCode ? !isAI(current) : multiplayerClient.myPlayerIndex === current)) {
            if (!optionsNow.some((m) => m.die === i)) return;
            sfx.tap();
            if (selDie === i) {
                dieConfirmed = true; // tapping the chosen die again is optional
            } else {
                selDie = i;
                dieConfirmed = false;
            }
            setStatus(tr(lang, 'pickToken'));
            refreshHighlights();
            syncHand();
        }
    }
    function onTokenTap(v: TokView) {
        if (!waitChoice) return;
        if (multiplayerClient.roomCode && multiplayerClient.myPlayerIndex !== current) {
            // Strict turn locking
            return;
        }
        if (!multiplayerClient.roomCode && isAI(current)) return;
        if (v.p !== current) return;

        // The number always comes first, so the choice is never guessed for you.
        if (!dieConfirmed) {
            setStatus(tr(lang, 'pickDie'));
            flashDies();
            return;
        }
        const m = optionsNow.find((o) => o.die === selDie && o.tok === v.t);
        if (!m) {
            // This piece needs the other number. Say so instead of silently
            // ignoring the tap -- otherwise it looks like the tap did nothing.
            if (optionsNow.some((o) => o.tok === v.t)) {
                setStatus(tr(lang, 'pieceNeedsOtherDie'));
                flashDies();
            }
            return;
        }

        if (multiplayerClient.roomCode) {
            // Send move to server
            void multiplayerClient.movePawn(selDie, v.t);
            return;
        }

        const r = waitChoice;
        waitChoice = null;
        r(m);
    }
    function flashDies() {
        dieFlash = 900;
        sfx.tap();
    }
    bus.wish = () => {
        if (!waitRoll || isAI(current)) return;
        const w = cfgs[current]?.wish;
        if (!w || wishUsed[current]) return;
        wishUsed[current] = true;
        const r = waitRoll;
        waitRoll = null;
        syncWish();
        r([w[0], w[1]]);
    };
    function syncWish() {
        const w = cfgs[current]?.wish || null;
        const usable = !!w && !isAI(current) && !wishUsed[current];
        store.patch({ wishNums: usable ? w : null, wishUsable: usable && !!waitRoll });
    }

    function refreshHighlights() {
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
    async function rollDice(p: number, forced?: [number, number]): Promise<{ a: number; b: number; lucky: boolean }> {
        let a = forced ? forced[0] : randDie();
        let b = forced ? forced[1] : randDie();
        const lucky = luckySevenAllowed(tokens, p) && isLuckySum(a, b) && !(a === 6 && b === 6);
        const dur = 850 / SPEED; // the dice tumble twice as long as the original 850 ms
        diceUsed = [true, true];
        diceColor = COLORS[p];
        startFly(p, a, b, dur);
        sfx.diceRoll(dur);
        await delay(dur + 150);
        dice = [a, b];
        diceUsed = [false, false];
        if (lucky) {
            await delay(700);
            a = 6;
            b = 6;
            dice = [6, 6];
            sfx.fanfare();
            popup('lucky', tr(lang, 'luckyT'), tr(lang, 'luckyS'), 3600);
            void sfx.speak({ text: tr(lang, 'sayLucky'), lang, player: p, cancelCurrent: true });
            anyAI('lucky', p, undefined, 0.8);
            await delay(2800);
        }
        return { a, b, lucky };
    }

    function movesFor(p: number): Move[] {
        const out: Move[] = [];
        for (let i = 0; i < 2; i++) if (!diceUsed[i]) out.push(...legalMoves(tokens, p, dice[i], i, active));
        return out;
    }

    /**
     * Penalty check for the capture obligation.
     *
     * `atStart` is the number of captures the whole roll could deliver from the
     * opening position -- the promise the turn began with. `taken` is what the
     * player actually collected. Falling short means a capture was thrown away.
     *
     * Using the START figure (rather than the board after each move) is what makes
     * a duplicate die forgiven: with 5 + 5 and one capture, spending the first 5
     * innocently drops the figure that is still reachable to 1, so taking it with
     * the second 5 finishes level and nothing is owed. Waste BOTH 5s and the
     * player ends on 0 against a promise of 1, which is the penalty.
     */
    function captureDebt(atStart: number, taken: number): boolean {
        return taken < atStart;
    }

    async function moveToken(p: number, m: Move) {
        const v = views[p][m.tok];
        const from = tokens[p][m.tok];
        const pts: [number, number][] = [boardPos(p, from, m.tok)];
        if (from === IN_BASE) pts.push(boardPos(p, 0, m.tok));
        else for (let r = from + 1; r <= m.to; r++) pts.push(boardPos(p, r, m.tok));
        const stepMs = 280;
        sfx.carMove(Math.min(2600, (pts.length - 1) * stepMs));
        // the token keeps its old logical position until the hop ends
        await tween(v, pts, stepMs, 0.55);
        tokens[p][m.tok] = m.to;
    }

    async function sendHome(p: number, t: number, ms: number) {
        const v = views[p][t];
        const from = boardPos(p, tokens[p][t], t);
        const to = boardPos(p, IN_BASE, t);
        await tween(v, [from, to], ms, 1.8);
        tokens[p][t] = IN_BASE;
    }

    async function applyMove(p: number, m: Move): Promise<{ captured: boolean; home: boolean }> {
        clearHighlights();
        await moveToken(p, m);
        let captured = false;
        for (const c of m.captures) {
            // re-check: the victim is still on that square after landing
            captured = true;
            sfx.heartbeat();
            const victim = c.p;
            void sendHome(victim, c.t, 900);
            ai('capture', p, { n: nameOf(victim) }, 0.9);
            ai('victim', victim, undefined, 0.9);
            anyAI('laugh', p, undefined, 0.5);
        }
        if (captured) await delay(1400);
        if (m.fromBase) ai('leave', p, undefined, 0.35);
        if (m.reachesHome) ai('home', p, undefined, 0.7);
        publish();
        return { captured, home: m.reachesHome };
    }

    async function penalize(p: number, t: number) {
        const v = views[p][t];
        const name = nameOf(p);
        v.flash = 1500;
        sfx.buzzer();
        // voice first, while the token flashes on the board
        void sfx.speak({ text: tr(lang, 'sayPen', { n: name }), lang, player: p, slow: true, cancelCurrent: true });
        await delay(1500);
        v.flash = 0;
        await sendHome(p, t, 2000);
        popup('penalty', tr(lang, 'penT'), tr(lang, 'penS', { n: name }), 3200);
        publish();
        anyAI('laughAt', p, { n: name }, 1);
        ai('excuse', p, undefined, 0.7);
        await delay(1200);
    }

    async function takeTurn(p: number): Promise<boolean> {
        // camera: bring this colour to the bottom-left
        targetYaw = store.get().settings.rotate ? YAW_FOR[p] : 0;
        diceColor = COLORS[p];
        current = p;
        diceUsed = [true, true];
        setStatus('');
        publish();
        syncWish();
        await delay(900);

        // --- roll
        let forced: [number, number] | undefined;
        if (multiplayerClient.roomCode && multiplayerClient.myPlayerIndex !== p) {
            // Remote player's turn: wait for socket dice roll event
            forced = await new Promise<[number, number]>((res) => {
                waitRoll = (f) => res(f || [1, 1]);
            });
        } else if (isAI(p)) {
            await delay(1200);
            if (Math.random() < 0.18) anyAI('joke', p, undefined, 0.5);
        } else {
            forced = await new Promise<[number, number] | undefined>((res) => {
                waitRoll = (f) => res(f);
                syncWish();
            });
        }
        syncWish();
        const roll = await rollDice(p, forced);
        const double6 = roll.a === 6 && roll.b === 6;
        if (double6) {
            sixStreak[p]++;
            if (!roll.lucky) ai('sixes', p, undefined, 0.7);
        } else sixStreak[p] = 0;
        if (roll.a === 1 && roll.b === 1) anyAI('ones', p, undefined, 0.8);
        // No limit on consecutive double sixes: every double 6 earns another turn.
        let extra = double6;

        // --- use each die
        // Capture obligation: the player must take EVERY capture this roll allows
        // (one per die, since each die is spent on its own move). The opening
        // promise is measured once; the moves are then counted against it.
        const capturePromise = maxCaptures(tokens, p, dice, active).taken;
        let capturesTaken = 0;
        for (let guard = 0; guard < 4 && (!diceUsed[0] || !diceUsed[1]); guard++) {
            optionsNow = movesFor(p);
            if (!optionsNow.length) {
                setStatus(tr(lang, 'noMoves'));
                await delay(1100);
                setStatus('');
                break;
            }
            if (multiplayerClient.roomCode && multiplayerClient.myPlayerIndex !== p) {
                // Remote player's turn: wait for socket pawn move event
                const chosen = await new Promise<Move>((res) => {
                    waitChoice = res;
                });
                setStatus('');
                diceUsed[chosen.die] = true;
                capturesTaken += chosen.captures.length;
                const res = await applyMove(p, chosen);
                if (res.captured || res.home) extra = true;
                if (hasWon(tokens, p)) {
                    winner = p;
                    return false;
                }
                optionsNow = [];
                continue;
            }
            if (isAI(p)) {
                // the AI takes every capture it can, including the second of a pair
                const caps = optionsNow.filter((m) => m.captures.length);
                const pool = caps.length ? caps : optionsNow;
                const chosen = pickMove(tokens, p, pool, active);
                selDie = chosen.die;
                refreshHighlights();
                await delay(900);
                diceUsed[chosen.die] = true;
                capturesTaken += chosen.captures.length;
                const res = await applyMove(p, chosen);
                if (res.captured || res.home) extra = true;
                if (hasWon(tokens, p)) {
                    winner = p;
                    return false;
                }
                optionsNow = [];
                continue;
            }

            // --- human: tap a die to choose it, then tap a token to move it
            setStatus(tr(lang, 'pickDie'));
            const usableDies = [0, 1].filter((i) => !diceUsed[i] && optionsNow.some((m) => m.die === i));
            if (!usableDies.includes(selDie)) selDie = usableDies[0];
            refreshHighlights();
            if (Math.random() < 0.25) anyAI('advice', p, undefined, 0.5);
            const chosen = await new Promise<Move>((res) => {
                waitChoice = res;
            });
            setStatus('');
            diceUsed[chosen.die] = true;
            capturesTaken += chosen.captures.length;
            const res = await applyMove(p, chosen);
            if (res.captured || res.home) extra = true;
            if (hasWon(tokens, p)) {
                winner = p;
                return false;
            }
            optionsNow = [];
        }
        // Settle up: any capture the roll promised and the player did not take.
        if (captureDebt(capturePromise, capturesTaken)) {
            const victims = maxCaptures(tokens, p, dice, active).victims;
            const victim = victims.find((v) => tokens[v.p][v.t] >= 0 && tokens[v.p][v.t] <= LAST_TRACK);
            if (victim) await penalize(p, victim.t);
        }
        diceUsed = [true, true];
        clearHighlights();
        return extra;
    }

    function finish() {
        const rows = [0, 1, 2, 3]
            .filter((p) => active[p])
            .map((p) => ({ idx: p, pct: p === winner ? 100 : percent(tokens, p), fine: fineProgress(tokens, p) }));
        rows.sort((a, b) => (a.idx === winner ? -1 : b.idx === winner ? 1 : b.pct - a.pct || b.fine - a.fine));
        ranking = rows.map((r) => ({ idx: r.idx, pct: r.pct }));
        publish();
        ai('win', winner, undefined, 1);
        anyAI('praise', winner, undefined, 0.8);
        store.patch({ result: ranking, popup: null, wishUsable: false });
    }

    async function run() {
        publish();
        await delay(600);
        anyAI('welcome', -1, undefined, 1);
        let p = current;
        while (!dead && winner < 0) {
            const extra = await takeTurn(p);
            if (dead) return;
            if (winner >= 0) break;
            chatterAfterTurn(p);
            const leader = [0, 1, 2, 3].filter((q) => active[q]).sort((a, b) => percent(tokens, b) - percent(tokens, a))[0];
            if (Math.random() < 0.22 && leader !== undefined) {
                anyAI('leader', leader, undefined, 0.6);
                if (Math.random() < 0.4) anyAI('truce', leader, undefined, 0.5);
            }
            if (tokens[p].every((r) => r === IN_BASE) && Math.random() < 0.3) anyAI('yard', p, undefined, 0.5);
            p = extra ? p : nextActive(p);
        }
        if (!dead && winner >= 0) finish();
    }

    // ---------------------------------------------------------------- ticker
    let now = 0;
    const tick = () => {
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
    app.ticker.add(tick);
    store.patch({ result: null, popup: null, active: active.slice() });
    void run();

    return {
        destroy() {
            dead = true;
            offResize();
            unsubStore();
            app.ticker.remove(tick);
            bus.chat = undefined;
            bus.wish = undefined;
            bus.onRemoteDiceRolled = undefined;
            bus.onRemotePawnMoved = undefined;
            bus.onRemoteTurnChanged = undefined;
            // release anything the turn loop is awaiting, so it can unwind cleanly
            if (waitRoll) { const r = waitRoll; waitRoll = null; r(); }
            if (waitChoice) { const c = waitChoice; waitChoice = null; c(optionsNow[0]); }
            handTarget = null;
            sfx.stopSpeech();
            tweens.length = 0;
            timers.length = 0;
            root.removeChildren();
            store.patch({ wishNums: null, wishUsable: false });
        },
    };
}

// silence "unused" for helpers kept for readability
void PATH_START;
void SAFE;
void globalIdx;
