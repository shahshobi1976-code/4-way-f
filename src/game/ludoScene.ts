// The Ludo Dethroned game scene: tilted/rotating pseudo-3D board, 3D-style pawns, two dice,
// computer players that gang up on the leader, penalties, Lucky Seven, talk and sound.
import { Application, Circle, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type { Stage } from './stage';
import { DEFAULT_PLAYERS, store, shouldShowCaptureWarning, type PlayerCfg } from '../state/store';
import { multiplayerClient } from '../network/multiplayerClient';
import { recordMatchStarted } from '../state/persist';
import { bus, type NameplateBound } from './bus';
import { tr, colorName } from '../i18n';
import {
    BASE_CENTER, BASE_SPOTS, CENTER_HOME_POS, COLORED_PATH_START_POS, COLORS, HOME, HOME_COL, IN_BASE, LAST_TRACK, PATH_START, SAFE, STAR_IDX, START_IDX, TRACK,
    boardPos, createEmptyGrudges, decrementSeatGrudge, evaluateCaptureObligation, evaluateRivalryState, findCombinedSprintMove, fineProgress, getTokenPathWorldDir,
    globalIdx, hasWon, isLoneTokenOnTrack, isLuckySum, legalMovesForTurn, luckySevenAllowed, newTokens, offendingTokensForPenalty, percent,
    pickBestAIMove, randDie, recordCaptureGrudge, resolveAutoPlayGulAction, resolvePawnTapMove, shouldPromptGulChoice, type CaptureObligation, type Move, type Tokens,
} from './rules';
import { BG_BASE, drawBackground, drawBoardDie3D, drawDie, drawPawn, mix, shade } from './draw';
import { resolveBoardTheme } from './themes';
import { drawThemedBoardFX, drawThemedBoardSurface } from './boardThemesRender';
import {
    drawToken3D,
    getTokenLocomotion,
    isAnimalTokenKind,
    resolveMatchSeatTokenKind,
    type LocomotionMode,
    type ResolvedTokenKind,
} from './tokens';
import { TOKEN_URLS_BY_PLAYER, getCachedPawnTexture, loadPawnTexture } from './tokenAssets';
import * as sfx from './sfx';
import * as banter from './banter';
import type { AIPersonality, BanterEvent, Cat, RivalryCalloutKind } from './banter';
import {
    BANTER_HIGH_PRIORITY_COOLDOWN_MS,
    BANTER_ROUTINE_COOLDOWN_MS,
    HIGH_PRIORITY_BANTER_EVENTS,
    getPersonalityForSeat,
    getRivalryCalloutLine,
    pickBanterLine,
    preloadDialoguePack,
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
    mode: LocomotionMode;
    isBurnoutSprint?: boolean;
    lastSfxSeg: number;
    done: () => void;
}
interface BurnoutParticle {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    r: number;
    grow: number;
    life: number;
    maxLife: number;
    color: number;
    alpha: number;
    kind: 'smoke' | 'spark' | 'dust';
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
    renderX: number;
    renderY: number;
    prevRenderX: number;
    prevRenderY: number;
    travelPhase: number;
    speedNorm: number;
    facingRad: number;
    dirX: number;
    dirY: number;
    worldDirX: number;
    worldDirY: number;
    burnoutPhase: 'none' | 'rev' | 'sprint';
    burnoutStartedAt: number;
    burnoutRevDurationMs: number;
    burnoutEmitAccumMs: number;
    skidLean: number;
    celebrateUntil: number;
    tween: Tween | null;
    movable: boolean;
    flash: number; // ms of red penalty ring left
    phase: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function createLudoScene(app: Application, stage: Stage, opts: SceneOpts): Scene {
    let lang = opts.lang; // follows the Settings language live
    void preloadDialoguePack(lang);
    const active = opts.active.slice();
    const cfgs = opts.players;
    const root = stage.root;
    let dead = false;

    // ---------------------------------------------------------------- layers
    const bgFill = new Graphics();
    const bgG = new Graphics();
    const boardG = new Graphics();
    const boardFxG = new Graphics();
    boardFxG.eventMode = 'none';
    const shadowLayer = new Container();
    const burnoutLayer = new Graphics();
    burnoutLayer.eventMode = 'none';
    const tokenLayer = new Container();
    tokenLayer.sortableChildren = true;
    const plateLayer = new Container();
    const flyLayer = new Container();
    flyLayer.eventMode = 'none';
    flyLayer.interactiveChildren = false;
    const uiLayer = new Container();
    const handLayer = new Container();
    root.addChild(bgFill, bgG, boardG, boardFxG, shadowLayer, burnoutLayer, tokenLayer, plateLayer, flyLayer, uiLayer, handLayer);

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
    let ranking: { idx: number; pct: number; captures: number; penalties: number }[] = [];
    const capturesMade = [0, 0, 0, 0];
    const penalties = [0, 0, 0, 0];
    const wishUsed = [false, false, false, false];

    // Track matches played locally for Newcomers (first 3 matches) vs Always/Off setting
    const matchCount = recordMatchStarted();
    const captureWarningActive = () => shouldShowCaptureWarning(store.get().settings.captureWarningMode, matchCount);
    let turnCapturePromise = 0;
    let turnCapturesTaken = 0;
    let turnObligation: CaptureObligation | null = null;
    let turnInitialTokens: Tokens | null = null;
    const turnTokensCaptured = new Set<number>();
    const turnMovedToSquare = new Map<number, string>();
    const grudges = createEmptyGrudges();
    const dethroneAlertedLeaders = new Set<number>();
    let rivalryBannerTimer: ReturnType<typeof setTimeout> | null = null;
    let localReactionsTimer: ReturnType<typeof setTimeout> | null = null;

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
    let localTurnAutoPlay = false;
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
    const genderOf = (p: number): 'male' | 'female' => {
        const explicit = cfgs[p]?.gender || store.get().players[p]?.gender;
        if (explicit === 'female' || explicit === 'male') return explicit;
        const av = avatarOf(p);
        if (av === '👸') return 'female';
        if (av === '🤴') return 'male';
        return DEFAULT_PLAYERS[p]?.gender || 'male';
    };

    const isAI = (p: number) => {
        if (isOnline()) {
            return !!multiplayerClient.roomState?.players[p]?.isAI;
        }
        return !!cfgs[p]?.ai || !!store.get().players[p]?.ai;
    };
    const personalityOf = (p: number): AIPersonality => {
        if (isOnline()) {
            const netP = multiplayerClient.roomState?.players[p]?.personality;
            if (netP) return netP;
            const botP = multiplayerClient.roomState?.botPersonalities?.[p];
            if (botP) return botP;
        }
        return store.get().players[p]?.personality || cfgs[p]?.personality || getPersonalityForSeat(p);
    };
    const nextActive = (p: number) => {
        for (let i = 1; i <= 4; i++) {
            const q = (p + i) % 4;
            if (active[q]) return q;
        }
        return p;
    };

    function publish() {
        const rivalry = evaluateRivalryState(tokens, -1, active);
        store.patch({
            progress: [0, 1, 2, 3].map((p) => (active[p] ? percent(tokens, p) : 0)),
            current,
            rivalry,
            grudges: grudges.map((g) => (g ? { ...g } : null)),
        });
    }

    // ---------------------------------------------------------------- timers / tweens (ticker clock + abort-safe)
    let clock = 0;
    const timers: { t: number; cb: () => void }[] = [];
    let pendingTapState: { tok: number; timer: ReturnType<typeof setTimeout>; epoch: number } | null = null;
    function clearPendingTap() {
        if (pendingTapState) {
            clearTimeout(pendingTapState.timer);
            pendingTapState = null;
        }
    }
    const turnAbortCallbacks = new Set<() => void>();
    const bumpTurnEpoch = () => {
        clearPendingTap();
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

    const invP = (sx: number, sy: number) => {
        const safeS = Math.max(1e-3, S);
        const nx = (sx - OX) / safeS;
        const ny = (sy - OY) / safeS;
        const el = rad(pitch), se = Math.sin(el), ce = Math.cos(el);
        const denom = se * F + ny * ce;
        if (denom <= 1.2) return { x: 7.5, y: 7.5, ok: false };
        const ry = (ny * F) / denom;
        const fPlusD = F - ry * ce;
        if (fPlusD <= 1.2) return { x: 7.5, y: 7.5, ok: false };
        const rx = (nx * fPlusD) / F;
        const a = rad(yaw), ca = Math.cos(a), sa = Math.sin(a);
        const bx = rx * ca + ry * sa;
        const by = -rx * sa + ry * ca;
        return { x: 7.5 + bx, y: 7.5 + by, ok: true };
    };

    // layout rectangles (design units)
    let boardRect = { x: 10, y: 196, w: 700, h: 420 };
    let diceCY = 890, diceSize = 54;
    let diceCX = [260, 460];
    let turnY = 960, chatY = 1000;
    let colX = 20, colW = 680;
    let portraitCenterMaxW = 260;
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
        const sw = Math.max(1, app.screen.width);
        const sh = Math.max(1, app.screen.height);
        const u = Math.max(0.01, stage.unit());
        bgFill.clear().rect(-80, -80, W + 160, H + 160).fill(BG_BASE[store.get().settings.bg]);
        let adVisible = false;

        const minGap150 = Math.ceil(150 / u);

        if (stage.landscape()) {
            const bw = Math.min(W * 0.56, 800);
            // Board pushed down generously so top color name plates and HUD bars have clear spacing
            boardRect = { x: 24, y: 136, w: bw, h: H - 136 - 56 };
            colX = 24 + bw + 32;
            colW = W - colX - 24;

            fitBoard(1.0);

            // 1. Right-side FloatingControls footprint mapped into design units; anchor 0.75x dice cleanly to its LEFT
            const cssU = Math.max(0.65, Math.min(sh / 680, sw / 960));
            const cssToDesign = cssU / u;
            const rightIconsLeftX = W - 66 * cssToDesign;
            const trayGapFromIcons = 14;
            const trayRightEdge = rightIconsLeftX - trayGapFromIcons;
            const availW = Math.max(150, trayRightEdge - colX);

            const baseDiceSize = Math.round(Math.min(82, colW * 0.26) * 0.75);
            diceSize = Math.max(38, Math.min(baseDiceSize, Math.floor(availW / 4.65)));
            const trayW = diceSize * 4.64;
            const trayCenterX = Math.round(trayRightEdge - trayW / 2);

            diceCY = Math.round(H - 14 * cssToDesign - Math.max(diceSize * 0.9, 27 * cssToDesign));
            diceCX = [trayCenterX - diceSize * 1.22, trayCenterX + diceSize * 1.22];

            // 2. Roll hint / turn text positioned cleanly above the bottom-right dice
            turnY = Math.round(diceCY - diceSize * 0.9 - 14);
            chatY = turnY - 26;

            // 3. Policy-compliant Ad Banner on upper-right beneath non-clickable #ai-judge-bar (>=150px clearance from board, nameplates, dice, roll hint, and music/settings buttons)
            const isCompactLand = sh <= 540;
            const targetAdW = isCompactLand ? 176 : 184;
            const targetAdH = isCompactLand ? 328 : 358;
            const topBarBottomDesign = Math.ceil((20 + 30 * cssU + 4) / u);
            const adTop = Math.max(56, topBarBottomDesign);
            const maxAdBottom = Math.round(turnY - 12 - minGap150);
            const adH = Math.max(0, Math.min(targetAdH, maxAdBottom - adTop));
            const boardSafeRight = boardRect.x + boardRect.w + 26 + minGap150;
            const availAdW = Math.floor(W - 20 - boardSafeRight);
            const adW = Math.min(targetAdW, Math.max(0, availAdW));
            const adX = W - 20 - adW;
            adRect = { x: adX, y: adTop, w: adW, h: adH };
            adVisible = adW >= 120 && adH >= 120;
        } else {
            // Vertical mobile & tablet: full playable board + 0.75x dice & click zone at bottom center in icon line + 90px full-width ad banner (>=150px clear)
            const frameW = sw;
            const cssU = Math.max(0.65, Math.min(frameW / 420, sh / 740));
            const cssToDesign = cssU / u;
            const centerFreeW = Math.max(150, W - 264 * cssToDesign);
            portraitCenterMaxW = Math.max(140, centerFreeW - 8);

            // 1. 0.75x dice in the bottom-center icon row
            diceSize = Math.max(40, Math.min(Math.round(72 * 0.75), Math.round(36 * cssToDesign), Math.floor(centerFreeW / 4.2)));
            const diceSep = Math.round(diceSize * 1.32);
            diceCY = Math.round(H - 26 * cssToDesign);
            diceCX = [Math.round(W / 2 - diceSep), Math.round(W / 2 + diceSep)];

            // 2. Clickable roll hint / turn text positioned cleanly right above the bottom-center dice
            turnY = Math.round(diceCY - diceSize * 0.5 - 15);
            chatY = Math.round(turnY - 24);

            // 3. Size board robustly up to full width (never crush the playable board on shorter portrait viewports)
            const bottomCtrlTop = H - 38 * cssToDesign;
            const bottomClickableTop = Math.min(bottomCtrlTop, diceCY - Math.round(diceSize * 0.75), turnY - 12);
            const adH = Math.round(80 / u);
            const topHudBotDesign = Math.ceil((10 + 30 * cssU + 4 + 20 * cssU) / u);
            const boardTop = Math.max(topHudBotDesign + 42, Math.min(150, Math.round(H * 0.12)));

            const isTabletPortrait = sw >= 760 && sh >= 950;
            const mobileScale = isTabletPortrait ? 1.0 : 0.8;
            const boardW = Math.round(Math.min(W - 20, 740) * mobileScale);
            const rawMaxH = Math.min(boardW * 0.86, Math.round((H - boardTop) * 0.56 * mobileScale));
            const availWithAd = Math.floor(bottomClickableTop - 2 * minGap150 - adH - 46 - boardTop);
            const minPlayableH = isTabletPortrait
                ? Math.round(boardW * 0.48)
                : Math.round(boardW * 0.56);
            const maxBoardH = availWithAd >= minPlayableH ? Math.min(rawMaxH, availWithAd) : rawMaxH;
            boardRect = { x: Math.round((W - boardW) / 2), y: boardTop, w: boardW, h: maxBoardH };
            colX = 16;
            colW = W - 32;

            fitBoard(1.0);

            // Calculate exact bottom coordinate of rendered board & bottom nameplates
            const c0 = P(0, 0), c1 = P(15, 0), c2 = P(15, 15), c3 = P(0, 15);
            const actualBottom = Math.max(P(0, 15, -0.7).y, P(15, 15, -0.7).y, c0.y, c1.y, c2.y, c3.y);

            // 4. Policy-compliant 90px edge-to-edge Portrait Ad Banner (stick to left and right, >=150px clear above and below)
            const safeAboveBottom = actualBottom + 46;
            const adW = W;
            const minSafeY = Math.round(safeAboveBottom + minGap150);
            const maxSafeY = Math.round(bottomClickableTop - minGap150 - adH);
            const preferredY = Math.round((minSafeY + maxSafeY) / 2);
            if (minSafeY <= maxSafeY) {
                const adY = Math.max(minSafeY, Math.min(maxSafeY, preferredY));
                adRect = { x: 0, y: adY, w: adW, h: adH };
                adVisible = true;
            } else {
                const fallbackY = Math.round((safeAboveBottom + (bottomClickableTop - adH)) / 2);
                adRect = { x: 0, y: fallbackY, w: adW, h: adH };
                adVisible = false;
            }
        }
        const frameEl = document.getElementById('app-frame');
        frameEl?.style.setProperty('--colx', String(colX));
        frameEl?.style.setProperty('--colw', String(colW));
        frameEl?.style.setProperty('--board-cx', `${Math.round((boardRect.x + boardRect.w / 2) * u)}px`);
        store.patch({
            adBannerBound: {
                x: Math.round(adRect.x * u),
                y: Math.round(adRect.y * u),
                w: Math.round(adRect.w * u),
                h: Math.round(adRect.h * u),
                visible: adVisible,
            },
        });
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
        const bt = resolveBoardTheme(st.boardTheme);
        bgG.clear();
        drawBackground(bgG, (x, y, z) => P(x, y, z ?? 0), st.bg, S, {
            w: stage.designWidth(),
            h: stage.designHeight(),
            invP,
        });
        drawThemedBoardSurface(boardG, (x, y, z = 0) => P(x, y, z), bt, active, S, outline);
        if (homeCenterTxt && !homeCenterTxt.destroyed) {
            homeCenterTxt.style.fill = bt.homeTextFill;
            homeCenterTxt.style.stroke = { color: bt.homeTextStroke, width: 4 };
        }
    }

    // ---------------------------------------------------------------- tokens
    const views: TokView[][] = [[], [], [], []];
    const seatTokenKind = (p: number): ResolvedTokenKind => {
        const st = store.get();
        return resolveMatchSeatTokenKind(
            st.settings.tokenStyle,
            p,
            st.players.map((pl) => !!pl.ai),
            st.gameId,
        );
    };

    const resolveHumanGender = (p: number): 'girl' | 'boy' => {
        const mode = store.get().settings.humanGenderMode;
        if (mode === 'girl' || mode === 'boy') return mode;
        return genderOf(p) === 'female' ? 'girl' : 'boy';
    };

    const paintTokenShadow = (shG: Graphics, seatIdx: number, kind: ResolvedTokenKind) => {
        shG.clear();
        if (isAnimalTokenKind(kind)) {
            const c = COLORS[seatIdx];
            shG.ellipse(0, 0, 0.58, 0.24).fill({ color: c, alpha: 0.30 });
            shG.ellipse(0, 0, 0.43, 0.17).fill({ color: mix(0x000000, c, 0.38), alpha: 0.48 });
            shG.ellipse(0, 0, 0.54, 0.22).stroke({ width: 0.065, color: c, alpha: 0.92 });
            shG.ellipse(0, 0, 0.47, 0.19).stroke({ width: 0.025, color: mix(c, 0xffffff, 0.45), alpha: 0.55 });
        } else {
            shG.ellipse(0, 0, 0.38, 0.15).fill({ color: 0x000000, alpha: 0.35 });
        }
    };

    let lastRenderedTokenSig = '';

    for (let p = 0; p < 4; p++) {
        const tokenUrl = TOKEN_URLS_BY_PLAYER[p];
        const initKind = seatTokenKind(p);
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
            paintTokenShadow(shadow, p, initKind);
            const ring = new Graphics();
            ring.ellipse(0, 0, 0.62, 0.26).stroke({ width: 0.08, color: 0xffffff, alpha: 0.95 });
            ring.visible = false;
            const [bx, by] = boardPos(p, IN_BASE, t);
            const pathScreenFacingRad = (seatP: number, posR: number, tokIdx: number, tw: Tween | null): number => {
                let wx = 1, wy = 0;
                if (tw && tw.pts.length > tw.seg + 1) {
                    const aPt = tw.pts[tw.seg], bPt = tw.pts[tw.seg + 1];
                    const dx = bPt[0] - aPt[0], dy = bPt[1] - aPt[1];
                    const dLen = Math.hypot(dx, dy);
                    if (dLen > 1e-4) {
                        wx = dx / dLen;
                        wy = dy / dLen;
                    } else {
                        [wx, wy] = getTokenPathWorldDir(seatP, posR, tokIdx);
                    }
                } else {
                    [wx, wy] = getTokenPathWorldDir(seatP, posR, tokIdx);
                }
                const aYaw = rad(yaw), caYaw = Math.cos(aYaw), saYaw = Math.sin(aYaw);
                const sdx = wx * caYaw - wy * saYaw;
                const sdy = wx * saYaw + wy * caYaw;
                return Math.atan2(sdy, sdx);
            };
            const [initWx, initWy] = getTokenPathWorldDir(p, tokens[p][t], t);
            const v: TokView = {
                p,
                t,
                c,
                body,
                shadow,
                ring,
                vx: bx,
                vy: by,
                vz: 0,
                renderX: bx,
                renderY: by,
                prevRenderX: bx,
                prevRenderY: by,
                travelPhase: Math.random() * 6,
                speedNorm: 0,
                facingRad: pathScreenFacingRad(p, tokens[p][t], t, null),
                dirX: 1,
                dirY: 0,
                worldDirX: initWx,
                worldDirY: initWy,
                burnoutPhase: 'none',
                burnoutStartedAt: 0,
                burnoutRevDurationMs: 450,
                burnoutEmitAccumMs: 0,
                skidLean: 0,
                celebrateUntil: 0,
                tween: null,
                movable: false,
                flash: 0,
                phase: Math.random() * 6,
            };

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
                if (seatTokenKind(p) === 'default') {
                    body.visible = false;
                    sp.visible = true;
                } else {
                    sp.visible = false;
                    body.visible = true;
                }
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

            c.visible = shadow.visible = active[p];
            c.on('pointertap', () => onTokenTap(v));
            shadowLayer.addChild(shadow, ring);
            tokenLayer.addChild(c);
            views[p].push(v);
        }
    }

    const MAX_BURNOUT_PARTICLES = 90;
    const burnoutParticles: BurnoutParticle[] = [];
    const SMOKE_COLORS = [0xe5e7eb, 0xd1d5db, 0x9ca3af, 0xf3f4f6];
    const SPARK_COLORS = [0xff8c00, 0xfacc15, 0xff4500, 0xfdba74];
    const DUST_COLORS = [0xf1f5f9, 0xe2e8f0, 0xcbd5e1];

    function spawnBurnoutParticle(pt: BurnoutParticle) {
        while (burnoutParticles.length >= MAX_BURNOUT_PARTICLES) {
            burnoutParticles.shift();
        }
        burnoutParticles.push(pt);
    }

    function emitRevBurnoutPuff(v: TokView, revProg: number) {
        const bx = -v.worldDirX;
        const by = -v.worldDirY;
        const px = -by;
        const py = bx;
        const smokeCount = revProg > 0.45 ? 3 : 2;
        for (let k = 0; k < smokeCount; k++) {
            const spread = (Math.random() - 0.5) * 0.48;
            const speed = 1.4 + revProg * 1.9 + Math.random() * 0.9;
            spawnBurnoutParticle({
                x: v.renderX + bx * (0.22 + Math.random() * 0.14) + px * spread * 0.45,
                y: v.renderY + by * (0.22 + Math.random() * 0.14) + py * spread * 0.45,
                z: 0.06 + Math.random() * 0.08,
                vx: bx * speed + px * spread * 1.4,
                vy: by * speed + py * spread * 1.4,
                vz: 0.45 + Math.random() * 0.65,
                r: 0.14 + revProg * 0.09 + Math.random() * 0.07,
                grow: 0.42 + revProg * 0.35,
                life: 0,
                maxLife: 420 + Math.random() * 240,
                color: SMOKE_COLORS[Math.floor(Math.random() * SMOKE_COLORS.length)],
                alpha: 0.52 + revProg * 0.24,
                kind: 'smoke',
            });
        }
        if (Math.random() < 0.55 + revProg * 0.35) {
            const spSpread = (Math.random() - 0.5) * 0.7;
            const spSpeed = 2.6 + Math.random() * 2.2;
            spawnBurnoutParticle({
                x: v.renderX + bx * 0.2 + px * spSpread * 0.3,
                y: v.renderY + by * 0.2 + py * spSpread * 0.3,
                z: 0.05 + Math.random() * 0.06,
                vx: bx * spSpeed + px * spSpread * 1.6,
                vy: by * spSpeed + py * spSpread * 1.6,
                vz: 0.7 + Math.random() * 0.9,
                r: 0.055 + Math.random() * 0.035,
                grow: -0.05,
                life: 0,
                maxLife: 180 + Math.random() * 140,
                color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
                alpha: 0.95,
                kind: 'spark',
            });
        }
    }

    function emitSkidTrail(v: TokView, heavy: boolean) {
        const bx = -v.worldDirX;
        const by = -v.worldDirY;
        const px = -by;
        const py = bx;
        const spread = (Math.random() - 0.5) * (heavy ? 0.34 : 0.24);
        if (heavy) {
            spawnBurnoutParticle({
                x: v.renderX + bx * 0.2 + px * spread * 0.4,
                y: v.renderY + by * 0.2 + py * spread * 0.4,
                z: 0.05 + Math.random() * 0.05,
                vx: bx * (1.1 + Math.random() * 0.8) + px * spread,
                vy: by * (1.1 + Math.random() * 0.8) + py * spread,
                vz: 0.35 + Math.random() * 0.45,
                r: 0.14 + Math.random() * 0.08,
                grow: 0.36,
                life: 0,
                maxLife: 340 + Math.random() * 180,
                color: SMOKE_COLORS[Math.floor(Math.random() * SMOKE_COLORS.length)],
                alpha: 0.52,
                kind: 'smoke',
            });
            if (Math.random() < 0.35) {
                spawnBurnoutParticle({
                    x: v.renderX + bx * 0.18,
                    y: v.renderY + by * 0.18,
                    z: 0.04,
                    vx: bx * 2.2 + px * spread * 1.8,
                    vy: by * 2.2 + py * spread * 1.8,
                    vz: 0.55,
                    r: 0.045,
                    grow: -0.04,
                    life: 0,
                    maxLife: 160,
                    color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
                    alpha: 0.9,
                    kind: 'spark',
                });
            }
        } else {
            spawnBurnoutParticle({
                x: v.renderX + bx * 0.18 + px * spread * 0.35,
                y: v.renderY + by * 0.18 + py * spread * 0.35,
                z: 0.03,
                vx: bx * (0.45 + Math.random() * 0.35) + px * spread * 0.8,
                vy: by * (0.45 + Math.random() * 0.35) + py * spread * 0.8,
                vz: 0.18 + Math.random() * 0.2,
                r: 0.085 + Math.random() * 0.045,
                grow: 0.18,
                life: 0,
                maxLife: 240 + Math.random() * 120,
                color: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)],
                alpha: 0.34,
                kind: 'dust',
            });
        }
    }

    function emitBrakeBurst(v: TokView) {
        const count = 11;
        for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
            const spd = 1.0 + Math.random() * 1.25;
            spawnBurnoutParticle({
                x: v.renderX + Math.cos(ang) * 0.14 + v.worldDirX * 0.16,
                y: v.renderY + Math.sin(ang) * 0.14 + v.worldDirY * 0.16,
                z: 0.05 + Math.random() * 0.05,
                vx: Math.cos(ang) * spd + v.worldDirX * 0.55,
                vy: Math.sin(ang) * spd + v.worldDirY * 0.55,
                vz: 0.38 + Math.random() * 0.42,
                r: 0.12 + Math.random() * 0.07,
                grow: 0.34,
                life: 0,
                maxLife: 320 + Math.random() * 160,
                color: SMOKE_COLORS[Math.floor(Math.random() * SMOKE_COLORS.length)],
                alpha: 0.54,
                kind: 'smoke',
            });
        }
    }

    function clearBurnoutEffects() {
        burnoutParticles.length = 0;
        if (burnoutLayer && !burnoutLayer.destroyed) {
            burnoutLayer.clear();
        }
        for (const row of views) {
            for (const v of row) {
                v.burnoutPhase = 'none';
                v.burnoutEmitAccumMs = 0;
                v.skidLean = 0;
                if (v.c && !v.c.destroyed) {
                    v.c.rotation = 0;
                    if (v.c.skew) v.c.skew.set(0, 0);
                }
            }
        }
    }

    function updateBurnoutParticles(dt: number, nowMs: number) {
        if (!burnoutLayer || burnoutLayer.destroyed) return;
        burnoutLayer.clear();
        const dtSec = Math.max(0.001, dt / 1000);

        for (let p = 0; p < 4; p++) {
            if (!active[p]) continue;
            if (seatTokenKind(p) !== 'default') continue;
            for (const v of views[p]) {
                if (v.burnoutPhase === 'rev') {
                    const revProg = Math.min(1, Math.max(0, (nowMs - v.burnoutStartedAt) / Math.max(1, v.burnoutRevDurationMs)));
                    const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.048);
                    const ringR = 0.52 + 0.13 * revProg + 0.07 * pulse;
                    const ringPts: number[] = [];
                    for (let k = 0; k < 14; k++) {
                        const a = (k / 14) * Math.PI * 2;
                        const gp = P(v.renderX + Math.cos(a) * ringR, v.renderY + Math.sin(a) * ringR, 0.015);
                        ringPts.push(gp.x, gp.y);
                    }
                    burnoutLayer
                        .poly(ringPts)
                        .fill({ color: 0xff7a00, alpha: 0.16 + 0.20 * revProg })
                        .stroke({ width: Math.max(2, S * 0.095), color: pulse > 0.45 ? 0xfbbf24 : 0xff6b00, alpha: 0.62 + 0.34 * revProg });

                    v.burnoutEmitAccumMs += dt;
                    if (v.burnoutEmitAccumMs >= 32) {
                        v.burnoutEmitAccumMs = 0;
                        emitRevBurnoutPuff(v, revProg);
                    }
                } else if (v.tween && v.tween.mode === 'skid') {
                    const heavy = !!v.tween.isBurnoutSprint;
                    v.burnoutEmitAccumMs += dt;
                    const interval = heavy ? 22 : 52;
                    if (v.burnoutEmitAccumMs >= interval) {
                        v.burnoutEmitAccumMs = 0;
                        emitSkidTrail(v, heavy);
                    }
                }
            }
        }

        for (let i = burnoutParticles.length - 1; i >= 0; i--) {
            const pt = burnoutParticles[i];
            pt.life += dt;
            if (pt.life >= pt.maxLife) {
                burnoutParticles.splice(i, 1);
                continue;
            }
            const drag = pt.kind === 'spark' ? 0.90 : 0.94;
            const dragPow = Math.pow(drag, dt / 16.67);
            pt.vx *= dragPow;
            pt.vy *= dragPow;
            if (pt.kind === 'spark') pt.vz -= 2.4 * dtSec;
            pt.x += pt.vx * dtSec;
            pt.y += pt.vy * dtSec;
            pt.z = Math.max(0.01, pt.z + pt.vz * dtSec);

            const age = pt.life / pt.maxLife;
            const curR = Math.max(0.015, pt.r + pt.grow * age);
            const fade = pt.kind === 'spark' ? (1 - age) : Math.pow(1 - age, 1.25);
            const pr = P(pt.x, pt.y, pt.z);
            const screenR = Math.max(1.2, curR * S * pr.k);
            burnoutLayer.circle(pr.x, pr.y, screenR).fill({ color: pt.color, alpha: pt.alpha * fade });
        }
    }

    function tween(
        tok: TokView,
        pts: [number, number][],
        stepMs: number,
        hop: number,
        expectedEpoch?: number,
        mode: LocomotionMode = 'hop',
        isBurnoutSprint = false,
    ): Promise<void> {
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
            const tw: Tween = { tok, pts, seg: 0, u: 0, stepMs, hop, mode, isBurnoutSprint, lastSfxSeg: -1, done: finishTween };
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
            const totalSegs = Math.max(1, tw.pts.length - 1);
            const approxU = Math.min(1, (tw.seg + Math.min(1, tw.u)) / totalSegs);
            const sprintMult = tw.isBurnoutSprint
                ? (approxU > 0.85 ? 0.78 + (1 - approxU) * 3.0 : 0.95 + Math.sin(approxU * Math.PI) * 0.55)
                : 1.0;
            tw.u += (dt * sprintMult) / tw.stepMs;
            while (tw.u >= 1 && tw.seg < tw.pts.length - 2) {
                tw.u -= 1;
                tw.seg++;
            }
            const kind = seatTokenKind(tw.tok.p);
            if (kind !== 'default' && tw.seg !== tw.lastSfxSeg) {
                tw.lastSfxSeg = tw.seg;
                sfx.playTokenStepSfx(kind, tw.seg, totalSegs);
            }
            const last = tw.seg >= tw.pts.length - 2 && tw.u >= 1;
            const u = Math.min(1, tw.u);
            const a = tw.pts[tw.seg], b = tw.pts[tw.seg + 1];
            const baseX = a[0] + (b[0] - a[0]) * u;
            const baseY = a[1] + (b[1] - a[1]) * u;
            const totalU = Math.min(1, (tw.seg + u) / totalSegs);

            if (tw.mode === 'skid') {
                // Grounded smooth glide from square to square along the 4-way path with zero vertical jump
                tw.tok.vx = baseX;
                tw.tok.vy = baseY;
                tw.tok.vz = 0;
            } else if (tw.mode === 'slither') {
                // Grounded sinusoidal S-wave path glide along the board surface with zero vertical jump
                const sdx = b[0] - a[0];
                const sdy = b[1] - a[1];
                const len = Math.hypot(sdx, sdy) || 1;
                const perpX = -sdy / len;
                const perpY = sdx / len;
                const env = Math.sin(Math.min(1, totalU * 5) * Math.PI * 0.5) * Math.sin(Math.min(1, (1 - totalU) * 5) * Math.PI * 0.5);
                const wave = Math.sin(totalU * totalSegs * Math.PI * 2) * 0.14 * env;
                tw.tok.vx = baseX + perpX * wave;
                tw.tok.vy = baseY + perpY * wave;
                tw.tok.vz = 0;
            } else if (tw.mode === 'fly') {
                // Sustained aerial soar over intermediate squares, landing cleanly at destination
                const env = Math.pow(Math.sin(Math.PI * totalU), 0.65);
                const cruise = Math.min(1, totalU * 4) * Math.min(1, (1 - totalU) * 4);
                const wingLift = Math.sin(totalU * totalSegs * Math.PI * 2) * 0.08 * cruise;
                tw.tok.vx = baseX;
                tw.tok.vy = baseY;
                tw.tok.vz = tw.hop * env + wingLift;
            } else if (tw.mode === 'walk') {
                // Smooth grounded walk/trot/gallop with zero tile-by-tile hop on track
                tw.tok.vx = baseX;
                tw.tok.vy = baseY;
                tw.tok.vz = Math.sin(Math.PI * u) * tw.hop;
            } else {
                // True jumping/hopping arc per step (frog, kangaroo, climber, gymnast)
                tw.tok.vx = baseX;
                tw.tok.vy = baseY;
                tw.tok.vz = Math.sin(Math.PI * u) * tw.hop;
            }

            if (last) {
                tw.tok.tween = null;
                tweens.splice(i, 1);
                tw.done();
            }
        }
    }

    function updateTokens(now: number, dt: number) {
        const stSnap = store.get();
        const stSettings = stSnap.settings;
        const aiSig = stSnap.players.map((pl) => (pl.ai ? '1' : '0')).join('');
        const tokenSig = `${stSettings.tokenStyle}|${stSettings.humanGenderMode}|${stSnap.gameId}|${aiSig}`;
        const styleSwitched = tokenSig !== lastRenderedTokenSig;
        if (styleSwitched) lastRenderedTokenSig = tokenSig;

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

        const dtSec = Math.max(0.001, dt / 1000);
        const timeSec = now / 1000;
        const settleRate = 1 - Math.exp(-12 * dtSec);

        for (let p = 0; p < 4; p++) {
            if (!active[p]) continue;
            const seatKind = seatTokenKind(p);
            const seatGender = resolveHumanGender(p);

            for (const v of views[p]) {
                const o = off.get(v) || 0;
                const targetX = v.vx + o;
                const targetY = v.vy;

                if (v.tween) {
                    v.renderX = targetX;
                    v.renderY = targetY;
                } else {
                    // Smoothly walk/settle into stacked offset positions so animals/humans step rather than snap!
                    v.renderX += (targetX - v.renderX) * settleRate;
                    v.renderY += (targetY - v.renderY) * settleRate;
                }

                const dxWorld = v.renderX - v.prevRenderX;
                const dyWorld = v.renderY - v.prevRenderY;
                const distWorld = Math.hypot(dxWorld, dyWorld);
                v.prevRenderX = v.renderX;
                v.prevRenderY = v.renderY;

                const instSpeed = Math.min(1, (distWorld / dtSec) / 3.2);
                v.speedNorm += (instSpeed - v.speedNorm) * Math.min(1, dtSec * 14);
                if (v.speedNorm > 0.04) {
                    v.travelPhase += dtSec * (7.5 + v.speedNorm * 8.5);
                }

                // Always compute projected screen-space travel direction (dirX, dirY) & world path vector
                let wx = 1, wy = 0;
                if (v.tween && v.tween.pts.length > v.tween.seg + 1) {
                    const aPt = v.tween.pts[v.tween.seg], bPt = v.tween.pts[v.tween.seg + 1];
                    const dx = bPt[0] - aPt[0], dy = bPt[1] - aPt[1];
                    const dLen = Math.hypot(dx, dy);
                    if (dLen > 1e-4) {
                        wx = dx / dLen;
                        wy = dy / dLen;
                    } else {
                        [wx, wy] = getTokenPathWorldDir(p, tokens[p][v.t], v.t);
                    }
                } else {
                    [wx, wy] = getTokenPathWorldDir(p, tokens[p][v.t], v.t);
                }
                v.worldDirX = wx;
                v.worldDirY = wy;
                const pDir0 = P(v.renderX, v.renderY, 0);
                const pDir1 = P(v.renderX + wx * 0.25, v.renderY + wy * 0.25, 0);
                const scrDx = pDir1.x - pDir0.x;
                const scrDy = pDir1.y - pDir0.y;
                const scrLen = Math.hypot(scrDx, scrDy) || 1;
                v.dirX = scrDx / scrLen;
                v.dirY = scrDy / scrLen;

                const aYaw = rad(yaw), caYaw = Math.cos(aYaw), saYaw = Math.sin(aYaw);
                const targetFacingRad = Math.atan2(wx * saYaw + wy * caYaw, wx * caYaw - wy * saYaw);
                const angDiff = Math.atan2(Math.sin(targetFacingRad - v.facingRad), Math.cos(targetFacingRad - v.facingRad));
                if (styleSwitched) {
                    v.facingRad = targetFacingRad;
                } else {
                    v.facingRad = Math.atan2(
                        Math.sin(v.facingRad + angDiff * Math.min(1, dtSec * 15)),
                        Math.cos(v.facingRad + angDiff * Math.min(1, dtSec * 15)),
                    );
                }

                const crowd = o !== 0 ? 0.82 : 1;
                const pr = P(v.renderX, v.renderY, v.vz);
                const gr = P(v.renderX, v.renderY, 0);
                const isCustom = seatKind !== 'default';
                const isCelebrating = v.celebrateUntil > now;
                const celebratePhase = isCelebrating ? Math.min(1, 1 - (v.celebrateUntil - now) / 1100) : 0;

                if (styleSwitched) {
                    paintTokenShadow(v.shadow, p, seatKind);
                    if (isCustom) {
                        if (v.sprite && !v.sprite.destroyed) v.sprite.visible = false;
                        v.body.visible = true;
                    } else if (v.sprite && !v.sprite.destroyed) {
                        v.sprite.visible = true;
                        v.body.visible = false;
                    } else {
                        drawPawn(v.body, COLORS[p]);
                        v.body.visible = true;
                    }
                }

                if (isCustom) {
                    v.body.visible = true;
                    drawToken3D(v.body, seatKind, COLORS[p], {
                        timeSec,
                        travelPhase: v.travelPhase,
                        speedNorm: v.speedNorm,
                        hopZ: v.vz,
                        facingRad: v.facingRad,
                        gender: seatGender,
                        animState: isCelebrating ? 'celebrate' : (v.speedNorm > 0.06 || !!v.tween ? 'move' : 'idle'),
                        celebratePhase,
                    });
                }

                const loco = getTokenLocomotion(seatKind);
                const bounce = v.movable && loco.movableBounce > 0
                    ? Math.abs(Math.sin(timeSec * 6 + v.phase)) * loco.movableBounce
                    : 0;
                const baseScale = S * pr.k * crowd * TOKEN_SIZE_SCALE;
                let offX = 0;
                let offY = 0;
                let sxMult = 1;
                let syMult = 1;
                let targetSkidLean = 0;

                if (seatKind === 'default') {
                    if (v.burnoutPhase === 'rev') {
                        const revProg = Math.min(1, Math.max(0, (now - v.burnoutStartedAt) / Math.max(1, v.burnoutRevDurationMs)));
                        const vibAmp = (0.03 + 0.035 * revProg) * S * pr.k;
                        const creep = (0.035 + 0.065 * revProg) * S * pr.k;
                        offX = v.dirX * creep + Math.sin(now * 0.21 + v.phase) * vibAmp;
                        offY = v.dirY * creep + Math.cos(now * 0.27 + v.phase) * vibAmp * 0.55;
                        sxMult = 1.13 + 0.03 * Math.sin(now * 0.14);
                        syMult = 0.84 - 0.04 * Math.sin(now * 0.14);
                        const leanDir = Math.abs(v.dirX) > 0.18 ? Math.sign(v.dirX) : 1;
                        targetSkidLean = -leanDir * (0.14 + 0.06 * revProg);
                    } else if (v.tween && loco.mode === 'skid') {
                        const heavy = !!v.tween.isBurnoutSprint;
                        const leanDir = Math.abs(v.dirX) > 0.12 ? v.dirX : (v.dirY < 0 ? 0.28 : -0.28);
                        targetSkidLean = leanDir * (heavy ? 0.28 : 0.17);
                        sxMult = heavy ? 1.04 : 1.01;
                        syMult = heavy ? 0.94 : 0.98;
                    }
                    v.skidLean += (targetSkidLean - v.skidLean) * Math.min(1, dtSec * 18);
                } else {
                    v.skidLean = 0;
                }

                if (v.c?.position) v.c.position.set(pr.x + offX, pr.y - bounce * S * pr.k + offY);
                if (v.c?.scale) v.c.scale.set(baseScale * sxMult, baseScale * syMult);
                if (v.c) {
                    v.c.rotation = seatKind === 'default' ? v.skidLean : 0;
                    if (v.c.skew) {
                        v.c.skew.set(seatKind === 'default' ? v.skidLean * 0.35 : 0, 0);
                    }
                    v.c.zIndex = -gr.d * 100 + (v.tween ? 500 : 0);
                }
                if (v.shadow?.position) v.shadow.position.set(gr.x + offX * 0.5, gr.y + offY * 0.5);
                const shAirScale = isAnimalTokenKind(seatKind)
                    ? Math.max(0.68, 1 - Math.min(0.32, v.vz * 0.22))
                    : (1 - Math.min(0.5, v.vz * 0.25));
                if (v.shadow?.scale) v.shadow.scale.set(S * gr.k * crowd * TOKEN_SIZE_SCALE * shAirScale * sxMult, S * gr.k * crowd * TOKEN_SIZE_SCALE * shAirScale);
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
            const padX = stage.landscape() ? 80 : 92;
            const px = Math.max(padX, Math.min(stage.designWidth() - padX, b.x));
            const py = above ? top - (stage.landscape() ? 26 : 22) : bottom + 28;
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

            // 0.75x roll hint text
            turnTxt = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 2.5 } } });
            turnTxt.anchor.set(0.5);
            turnTxt.eventMode = 'static';
            turnTxt.cursor = 'pointer';
            turnTxt.on('pointertap', () => triggerDieTap(0));
            turnTxt.position.set(diceCX[0] / 2 + diceCX[1] / 2, turnY);
            uiLayer.addChild(turnTxt);
            chatTxt.length = 0;
            // AI banter text lines removed from board per user instruction
            // Legacy Pixi ad banner slot disabled (policy-compliant #ad-banner is rendered in DOM Hud)
            adC = new Container();
            adG = new Graphics();
            adC.visible = false;
            adC.eventMode = 'none';
            uiLayer.addChild(adC);
        }

        // On every layout, seamlessly reposition and redraw without destroying Text textures
        const isLand = stage.landscape();
        if (diceTrayC) {
            const rawTrayW = Math.abs(diceCX[1] - diceCX[0]) + diceSize * (isLand ? 2.2 : 1.55);
            const trayW = isLand ? rawTrayW : Math.min(portraitCenterMaxW, rawTrayW);
            const trayH = diceSize * (isLand ? 1.78 : 1.5);
            diceTrayC.position.set((diceCX[0] + diceCX[1]) / 2, diceCY);
            diceTrayC.hitArea = new Rectangle(-trayW / 2, -trayH / 2, trayW, trayH);
        }
        for (let i = 0; i < 2; i++) {
            if (dieC[i]) {
                dieC[i].position.set(diceCX[i], diceCY);
                dieC[i].hitArea = new Circle(0, 0, diceSize * (isLand ? 1.35 : 0.88));
            }
        }
        if (sumC) {
            sumC.scale.set(0.75);
            sumC.position.set(
                (diceCX[0] + diceCX[1]) / 2,
                isLand ? diceCY + diceSize * 0.72 : diceCY,
            );
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
            adC.visible = false;
        }
        if (adG) {
            adG.clear();
        }
    }

    function drawDice(now: number) {
        if (dead) return;
        const isMyTurn = isOnline() ? multiplayerClient.myPlayerIndex === current : !isAI(current);
        const rollingIdle = !!waitRoll && isMyTurn;

        // Keep surrounding dice box completely transparent while preserving diceTrayC tap hitArea
        if (diceTrayG) {
            diceTrayG.clear();
        }

        for (let i = 0; i < 2; i++) {
            const used = diceUsed[i];
            const hasLegalForDie = !waitChoice || optionsNow.some((m) => m.die === i);
            const choosingDie = !!waitChoice && !used && hasLegalForDie && !dieConfirmed && isMyTurn;
            const pulse = (rollingIdle || dieFlash > 0 ? 1 + 0.08 * Math.sin(now / 160) : 1) * (choosingDie ? 1 + 0.04 * Math.sin(now / 220) : 1);
            const sel = !used && hasLegalForDie && (selDie === i || selDie === 2) && !!waitChoice;
            const dimDice = !isMyTurn || (used && !waitRoll) || (!!waitChoice && !used && !hasLegalForDie);
            if (dieG[i]) {
                drawDie(dieG[i], diceSize, dice[i], diceColor, current === 2 ? 0x2a2a2a : 0xffffff, {
                    dim: dimDice,
                    glow: sel || rollingIdle,
                    styleId: store.get().settings.diceStyle,
                });
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
                sumTxt.text = `USE ${total}`;
                sumTxt.style.fill = 0xffffff;
                sumG.clear()
                    .roundRect(-42, -13, 84, 26, 13)
                    .fill({ color: activeSum ? 0x16a34a : 0x14532d, alpha: 0.96 })
                    .stroke({ width: activeSum ? 2.5 : 1.5, color: 0x4ade80, alpha: 0.96 });
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

    // ---------------------------------------------------------------- real 3D dice on the board
    const BOARD_DIE_HALF = 0.42 * 1.2; // 1.2x bigger 3D board dice
    const BOARD_REST_SPOTS: [[number, number], [number, number]] = [[6.2, 7.75], [8.8, 7.25]];
    const BOARD_REST_ROT_Z: [number, number] = [-0.24, 0.28];
    const boardDieSh = [new Graphics(), new Graphics()];
    const boardDieG = [new Graphics(), new Graphics()];
    for (const sh of boardDieSh) {
        sh.eventMode = 'none';
        flyLayer.addChild(sh);
    }
    for (const g of boardDieG) {
        g.eventMode = 'none';
        flyLayer.addChild(g);
    }

    interface Fly {
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
        endRotZ: number;
        spinX: number;
        spinY: number;
        spinZ: number;
        tumbleFace: number;
        nextFaceT: number;
    }
    let flying: Fly[] = [];
    let flyT = -1;
    let flyDur = 0;
    let flyFinal: [number, number] = [1, 1];
    let flyColor = 0xffffff;
    let flySeat = current;
    let flyHoldingResult = false;
    let flyBounceStage = 0;

    function startFly(p: number, a: number, b: number, dur: number) {
        flyDur = dur;
        flyT = 0;
        flyFinal = [a, b];
        flySeat = p;
        flyColor = COLORS[p];
        flyHoldingResult = true;
        flyBounceStage = 0;
        const bc = BASE_CENTER[p];
        const startX = bc[0] + (7.5 - bc[0]) * 0.22;
        const startY = bc[1] + (7.5 - bc[1]) * 0.22;
        flying = [0, 1].map((i) => ({
            fromX: startX + (i ? 0.55 : -0.55),
            fromY: startY + (i ? 0.28 : -0.28),
            toX: BOARD_REST_SPOTS[i][0],
            toY: BOARD_REST_SPOTS[i][1],
            endRotZ: BOARD_REST_ROT_Z[i],
            spinX: (i ? -1 : 1) * (4.4 + Math.random() * 1.6),
            spinY: (i ? 1 : -1) * (4.8 + Math.random() * 1.6),
            spinZ: (i ? -1 : 1) * (Math.PI * 3.5 + Math.random() * 1.5),
            tumbleFace: 1 + Math.floor(Math.random() * 6),
            nextFaceT: 70,
        }));
    }

    function updateFly(dt: number, nowMs: number) {
        if (dead) return;
        if (winner >= 0) {
            flyLayer.visible = false;
            return;
        }
        flyLayer.visible = true;
        const styleId = store.get().settings.diceStyle;

        if (flyT >= 0 && flying.length === 2) {
            flyT += dt;
            const u = Math.min(1, flyT / Math.max(1, flyDur));
            const easePos = 1 - Math.pow(1 - Math.min(1, u / 0.92), 2.4);
            const pipColor = flySeat === 2 ? 0x2a2a2a : 0xffffff;

            const prevStage = flyBounceStage;
            if (flyBounceStage < 1 && u >= 0.62) {
                flyBounceStage = 1;
                sfx.diceHit(1.0);
                sfx.diceRoll((1 - 0.62) * flyDur + 150);
            }
            if (flyBounceStage < 2 && u >= 0.84) {
                flyBounceStage = 2;
                if (prevStage === 1) sfx.diceHit(0.55);
            }
            if (flyBounceStage < 3 && u >= 1) {
                flyBounceStage = 3;
                if (prevStage === 2) sfx.diceHit(0.32);
            }

            for (let i = 0; i < 2; i++) {
                const f = flying[i];
                const cx = f.fromX + (f.toX - f.fromX) * easePos;
                const cy = f.fromY + (f.toY - f.fromY) * easePos;
                let cz = 0;
                if (u < 0.62) {
                    cz = Math.sin((u / 0.62) * Math.PI) * 3.4;
                } else if (u < 0.84) {
                    cz = Math.sin(((u - 0.62) / 0.22) * Math.PI) * 1.1;
                } else if (u < 1) {
                    cz = Math.sin(((u - 0.84) / 0.16) * Math.PI) * 0.35;
                }

                const settle = u > 0.78 ? (u - 0.78) / 0.22 : 0;
                const spinScale = Math.pow(1 - settle, 2);
                const rotX = f.spinX * spinScale * Math.sin(u * Math.PI * 3.2);
                const rotY = f.spinY * spinScale * Math.cos(u * Math.PI * 2.8);
                const rotZ = f.spinZ * (1 - settle) + f.endRotZ * settle;

                if (u < 0.78 && flyT >= f.nextFaceT) {
                    f.tumbleFace = 1 + ((f.tumbleFace + Math.floor(Math.random() * 5)) % 6);
                    f.nextFaceT = flyT + 75;
                }
                const face = u >= 0.78 ? flyFinal[i] : f.tumbleFace;

                drawBoardDie3D(
                    boardDieG[i],
                    boardDieSh[i],
                    (x, y, z = 0) => P(x, y, z),
                    cx,
                    cy,
                    cz,
                    BOARD_DIE_HALF,
                    face,
                    flyColor,
                    pipColor,
                    {
                        rotX,
                        rotY,
                        rotZ,
                        styleId,
                    },
                );
            }

            if (u >= 1) {
                flyT = -1;
                flying = [];
            }
            return;
        }

        // Resting 3D dice on the board surface between rolls and during move selection
        const isMyTurn = isOnline() ? multiplayerClient.myPlayerIndex === current : !isAI(current);
        const pipColor = (flyHoldingResult ? flySeat : current) === 2 ? 0x2a2a2a : 0xffffff;
        const activeColor = flyHoldingResult ? flyColor : diceColor;
        for (let i = 0; i < 2; i++) {
            const used = !flyHoldingResult && diceUsed[i];
            const waitingIdle = !flyHoldingResult && !!waitRoll && isMyTurn;
            const hasLegalForDie = !waitChoice || optionsNow.some((m) => m.die === i);
            const selectedGlow = (!flyHoldingResult && !used && hasLegalForDie && (selDie === i || selDie === 2) && !!waitChoice && isMyTurn) || waitingIdle;
            const dimDie = !flyHoldingResult && !!waitChoice && (used || !hasLegalForDie);
            const cz = waitingIdle ? 0.04 + Math.abs(Math.sin(nowMs / 360 + i * 1.1)) * 0.08 : 0;
            const rotZ = BOARD_REST_ROT_Z[i] + (waitingIdle ? Math.sin(nowMs / 420 + i) * 0.06 : 0);
            const shownVal = flyHoldingResult ? flyFinal[i] : dice[i];

            drawBoardDie3D(
                boardDieG[i],
                boardDieSh[i],
                (x, y, z = 0) => P(x, y, z),
                BOARD_REST_SPOTS[i][0],
                BOARD_REST_SPOTS[i][1],
                cz,
                BOARD_DIE_HALF,
                shownVal,
                activeColor,
                pipColor,
                {
                    dim: dimDie,
                    glow: selectedGlow,
                    rotZ,
                    styleId,
                },
            );
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
            if (it.voice) await sfx.speak({ text: it.text, altText: it.alt, altLang: 'hi', lang, player: it.idx, gender: genderOf(it.idx) });
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
            personalityOverride || personalityOf(idx),
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
        const l = pickBanterLine(mappedEvent, lang, idx, vars, undefined, personalityOf(idx));
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

    function emitRivalryEvent(
        kind: RivalryCalloutKind,
        actorSeat: number,
        targetSeat: number,
        leaderPct: number,
        forcedLineIdx?: number,
    ) {
        if (dead || targetSeat < 0 || targetSeat > 3) return;
        const targetName = nameOf(targetSeat);
        const actorName = actorSeat >= 0 && actorSeat <= 3 ? nameOf(actorSeat) : '';
        const speakerSeat =
            actorSeat >= 0 && isAI(actorSeat)
                ? actorSeat
                : [0, 1, 2, 3].find((s) => s !== targetSeat && active[s] && isAI(s)) ?? -1;
        const speakerPersonality = speakerSeat >= 0 ? personalityOf(speakerSeat) : 'Strategist';
        const callout = getRivalryCalloutLine(speakerPersonality, kind, targetName, leaderPct, forcedLineIdx);

        // Local observer AI emoji reactions (online mode handles synced reactions via multiplayerClient)
        if (!isOnline()) {
            const emojiSets: Record<RivalryCalloutKind, string[]> = {
                dethrone_alert: ['🎯', '🚨', '😱', '🎯'],
                leader_hit: ['🔥', '🎯', '🚨', '🔥'],
                grudge_hit: ['🔥', '😱', '🎯', '🔥'],
            };
            const pool = emojiSets[kind] || emojiSets.dethrone_alert;
            const until = Date.now() + 2800;
            const nextReactions: Record<number, { seatIndex: number; emoji: string; until: number; key: number }> = {
                ...store.get().localReactions,
            };
            let added = false;
            for (let s = 0; s < 4; s++) {
                if (!active[s] || !isAI(s) || s === targetSeat) continue;
                if (kind !== 'dethrone_alert' && s === actorSeat) continue;
                nextReactions[s] = {
                    seatIndex: s,
                    emoji: pool[s % pool.length],
                    until,
                    key: Date.now() + s * 17 + Math.random(),
                };
                added = true;
            }
            if (added) {
                store.patch({ localReactions: nextReactions });
                if (localReactionsTimer) clearTimeout(localReactionsTimer);
                localReactionsTimer = setTimeout(() => {
                    localReactionsTimer = null;
                    if (dead) return;
                    const nowMs = Date.now();
                    const kept: Record<number, { seatIndex: number; emoji: string; until: number; key: number }> = {};
                    for (const [k, v] of Object.entries(store.get().localReactions)) {
                        if (v.until > nowMs) kept[Number(k)] = v;
                    }
                    store.patch({ localReactions: kept });
                }, 2900);
            }
        }

        const icon = kind === 'dethrone_alert' ? '🚨' : kind === 'leader_hit' ? '🎯' : '🔥';
        const title =
            kind === 'dethrone_alert'
                ? `TARGET LOCKED • ${targetName.toUpperCase()} (${Math.round(leaderPct)}%)`
                : kind === 'leader_hit'
                ? `LEADER DETHRONED • ${actorName || 'RIVAL'} HIT ${targetName.toUpperCase()}`
                : `PAYBACK! • ${actorName || 'RIVAL'} VS ${targetName.toUpperCase()}`;

        const bannerId = Date.now();
        store.patch({
            rivalryBanner: {
                id: bannerId,
                kind,
                icon,
                title,
                message: callout,
                targetSeat,
                actorSeat,
                leaderPct: Math.round(leaderPct),
                until: bannerId + 4200,
            },
        });
        if (rivalryBannerTimer) clearTimeout(rivalryBannerTimer);
        rivalryBannerTimer = setTimeout(() => {
            rivalryBannerTimer = null;
            if (!dead && store.get().rivalryBanner?.id === bannerId) {
                store.patch({ rivalryBanner: null });
            }
        }, 4300);

        if (
            speakerSeat >= 0 &&
            isAI(speakerSeat) &&
            !store.get().settings.aiMute &&
            !multiplayerClient.isSeatMuted(speakerSeat)
        ) {
            lastBanterMs[speakerSeat] = Date.now();
            lastSpoke[speakerSeat] = clock;
            enqueue({ idx: speakerSeat, text: callout, priority: true, voice: true }, true);
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

    bus.onRemoteRivalryEvent = (data) => {
        if (dead || !isOnline()) return;
        emitRivalryEvent(data.kind, data.actorSeat, data.targetSeat, data.leaderPct, data.lineIdx);
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
            || (dieIndex === 2 ? findCombinedSprintMove(tokens, rp, tokenIndex, dice, diceUsed, active) : undefined)
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
            diceUsed = [true, true];
            popup('info', 'PASSED', `${nameOf(rp)} passed the turn!`, 2000);
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
        flyT = -1;
        flying = [];
        flyHoldingResult = false;
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
        flyT = -1;
        flying = [];
        flyHoldingResult = false;
        targetYaw = store.get().settings.rotate ? YAW_FOR[current] : 0;
        publish();
        refreshTurnText();
        syncHand();
    };

    // ---------------------------------------------------------------- input
    // Humans can tap either a die first OR tap a movable token directly.
    // If a token is tapped directly, the game smart-matches the appropriate die instantly!
    function onDieTap(i: number) {
        clearPendingTap();
        if (!isOnline() && localTurnAutoPlay) return;
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
                if (diceUsed[0] || diceUsed[1]) return;
                const combinedOpts = optionsNow.filter((m) => m.die === 2 || m.combined);
                if (combinedOpts.length === 0) return;
                if (combinedOpts.length === 1) {
                    selDie = 2;
                    executePlayerMove(combinedOpts[0]);
                    return;
                }
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

    function executePlayerMove(m: Move) {
        clearPendingTap();
        if (!waitChoice) return;
        dieConfirmed = true;
        sfx.tap();

        const proceedWithMove = () => {
            sfx.stopHeartbeat();
            if (shouldPromptGulChoice(tokens, current, m.value, m.die, dice, turnInitialTokens, m.tok)) {
                store.patch({
                    gulPrompt: {
                        p: current,
                        tokenIndex: m.tok,
                        dieIndex: m.die,
                        value: m.value,
                    },
                });
                bus.onGulDecision = (decision: 'gul' | 'pass') => {
                    if (!isOnline() && localTurnAutoPlay) return;
                    bus.onGulDecision = undefined;
                    if (decision === 'gul') {
                        dieConfirmed = true;
                        sfx.tap();
                        if (isOnline()) {
                            pendingLocalMoves.push({ dieIndex: m.die, tokenIndex: m.tok });
                            void multiplayerClient.movePawn(m.die, m.tok, 'gul').then((res) => {
                                if (res && !res.ok && !dead) {
                                    const idx = pendingLocalMoves.findIndex((pm) => pm.dieIndex === m.die && pm.tokenIndex === m.tok);
                                    if (idx !== -1) pendingLocalMoves.splice(idx, 1);
                                    void multiplayerClient.syncState();
                                }
                            });
                        }
                        const r = waitChoice;
                        waitChoice = null;
                        if (r) r(m);
                    } else {
                        dieConfirmed = true;
                        sfx.tap();
                        if (isOnline()) {
                            pendingLocalMoves.push({ dieIndex: m.die, tokenIndex: m.tok });
                            void multiplayerClient.movePawn(m.die, m.tok, 'pass').then((res) => {
                                if (res && !res.ok && !dead) {
                                    const idx = pendingLocalMoves.findIndex((pm) => pm.dieIndex === m.die && pm.tokenIndex === m.tok);
                                    if (idx !== -1) pendingLocalMoves.splice(idx, 1);
                                    void multiplayerClient.syncState();
                                }
                            });
                        }
                        diceUsed = [true, true];
                        clearHighlights();
                        popup('info', 'PASSED', `${nameOf(current)} passed the turn!`, 2000);
                        const r = waitChoice;
                        waitChoice = null;
                        if (r) r({ ...m, reachesHome: false, to: tokens[current][m.tok], passed: true } as any);
                    }
                };
                return;
            }

            if (isOnline()) {
                // Track local move so server echo does not double-move or consume next die
                pendingLocalMoves.push({ dieIndex: m.die, tokenIndex: m.tok });
                void multiplayerClient.movePawn(m.die, m.tok, 'gul').then((res) => {
                    if (res && !res.ok && !dead) {
                        const idx = pendingLocalMoves.findIndex((pm) => pm.dieIndex === m.die && pm.tokenIndex === m.tok);
                        if (idx !== -1) pendingLocalMoves.splice(idx, 1);
                        void multiplayerClient.syncState();
                    }
                });
                // Execute move locally immediately for zero-latency instant response!
                const r = waitChoice;
                waitChoice = null;
                if (r) r(m);
                return;
            }

            const r = waitChoice;
            waitChoice = null;
            if (r) r(m);
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

    const DOUBLE_TAP_WINDOW_MS = 250;

    function handleLocalCombinedMove(tokIdx: number): boolean {
        if (!waitChoice) return false;
        if (!isOnline() && (localTurnAutoPlay || isAI(current))) return false;
        if (isOnline() && multiplayerClient.myPlayerIndex !== current) return false;
        const stSnap = store.get();
        if (stSnap.gulPrompt || stSnap.skipCapturePrompt) return false;

        const combinedMove = findCombinedSprintMove(tokens, current, tokIdx, dice, diceUsed, active);
        if (!combinedMove) return false;
        selDie = 2;
        executePlayerMove(combinedMove);
        return true;
    }

    function onTokenTap(v: TokView) {
        if (!isOnline() && localTurnAutoPlay) return;
        if (!waitChoice) return;
        const stSnap = store.get();
        if (stSnap.gulPrompt || stSnap.skipCapturePrompt) return;
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

        const singleMove = resolvePawnTapMove(
            tokens,
            current,
            v.t,
            optionsNow,
            selDie,
            dieConfirmed,
            dice,
            diceUsed,
        );

        const combinedCandidate = !dieConfirmed
            ? findCombinedSprintMove(tokens, current, v.t, dice, diceUsed, active)
            : undefined;
        const singleAlreadyCombined = !!singleMove && (singleMove.die === 2 || !!singleMove.combined);
        const eligibleForDoubleTap = !!combinedCandidate && !singleAlreadyCombined;

        if (!eligibleForDoubleTap) {
            clearPendingTap();
            if (!singleMove) {
                setStatus(tr(lang, 'pieceNeedsOtherDie'));
                flashDies();
                return;
            }
            selDie = singleMove.die;
            executePlayerMove(singleMove);
            return;
        }

        // Second quick tap on the same eligible on-path pawn fires a combined sprint!
        if (pendingTapState && pendingTapState.tok === v.t) {
            clearPendingTap();
            if (!handleLocalCombinedMove(v.t) && singleMove) {
                selDie = singleMove.die;
                executePlayerMove(singleMove);
            }
            return;
        }

        // First tap on an eligible double-tap pawn: wait 250ms only for this case so
        // non-eligible single taps keep 0ms latency.
        clearPendingTap();
        const savedEpoch = turnEpoch;
        const savedTok = v.t;
        const timer = setTimeout(() => {
            if (pendingTapState && pendingTapState.timer === timer) {
                pendingTapState = null;
            }
            if (dead || !waitChoice || turnEpoch !== savedEpoch) return;
            if (!isOnline() && (localTurnAutoPlay || isAI(current))) return;
            if (isOnline() && multiplayerClient.myPlayerIndex !== current) return;
            if (!singleMove) {
                setStatus(tr(lang, 'pieceNeedsOtherDie'));
                flashDies();
                return;
            }
            selDie = singleMove.die;
            executePlayerMove(singleMove);
        }, DOUBLE_TAP_WINDOW_MS);
        pendingTapState = { tok: savedTok, timer, epoch: savedEpoch };
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
        clearPendingTap();
        let a = forced ? forced[0] : randDie();
        let b = forced ? forced[1] : randDie();
        const lucky = luckySevenAllowed(tokens, p) && isLuckySum(a, b) && !(a === 6 && b === 6);
        const dur = 850 / SPEED; // the dice tumble twice as long as the original 850 ms
        diceUsed = [true, true];
        diceColor = COLORS[p];
        startFly(p, a, b, dur);
        await delay(dur + 150, expectedEpoch !== undefined);
        flyHoldingResult = false;
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
            void sfx.speak({ text: tr(lang, 'sayLucky'), lang, player: p, gender: genderOf(p), cancelCurrent: true });
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
        const kind = seatTokenKind(p);
        const loco = getTokenLocomotion(kind, from === IN_BASE);
        const steps = Math.max(0, pts.length - 1);
        const isBurnoutSprint = kind === 'default' && from >= 0 && !m.fromBase && steps >= 9;

        if (isBurnoutSprint) {
            const revMs = 450;
            v.burnoutPhase = 'rev';
            v.burnoutStartedAt = now;
            v.burnoutRevDurationMs = revMs;
            v.burnoutEmitAccumMs = 0;
            sfx.playBurnoutLaunch(revMs);
            await delay(revMs, expectedEpoch !== undefined);
            if (dead || (expectedEpoch !== undefined && isOnline() && turnEpoch !== expectedEpoch)) {
                v.burnoutPhase = 'none';
                return;
            }
            v.burnoutPhase = 'sprint';
            v.burnoutEmitAccumMs = 0;
            await tween(v, pts, 125, 0, expectedEpoch, 'skid', true);
            v.burnoutPhase = 'none';
            if (!dead && (expectedEpoch === undefined || !isOnline() || turnEpoch === expectedEpoch)) {
                emitBrakeBurst(v);
            }
        } else {
            if (kind === 'default') {
                sfx.carMove(Math.min(2600, steps * loco.stepMs));
            }
            // the token keeps its old logical position until the move ends
            await tween(v, pts, loco.stepMs, loco.hop, expectedEpoch, loco.mode, false);
        }
        // Never overwrite authoritative synced state if turn already changed mid-animation
        if (expectedEpoch === undefined || !isOnline() || turnEpoch === expectedEpoch) {
            tokens[p][m.tok] = m.to;
        }
    }

    async function sendHome(p: number, t: number, ms: number) {
        const v = views[p][t];
        const from = boardPos(p, tokens[p][t], t);
        const to = boardPos(p, IN_BASE, t);
        const kind = seatTokenKind(p);
        const loco = getTokenLocomotion(kind, false);
        const grounded = loco.mode === 'slither' || loco.mode === 'skid';
        await tween(
            v,
            [from, to],
            ms,
            grounded ? 0 : 1.8,
            undefined,
            grounded ? loco.mode : 'hop',
            false,
        );
        tokens[p][t] = IN_BASE;
    }

    async function applyMove(p: number, m: Move, expectedEpoch?: number): Promise<{ captured: boolean; home: boolean }> {
        clearHighlights();
        const prevPos = tokens[p][m.tok];
        const preRivalry = !isOnline() ? evaluateRivalryState(tokens, -1, active) : null;
        await moveToken(p, m, expectedEpoch);
        if (expectedEpoch !== undefined && isOnline() && turnEpoch !== expectedEpoch) {
            return { captured: false, home: false };
        }
        let captured = false;
        let leaderVictim = -1;
        let revengeVictim = -1;
        const kind = seatTokenKind(p);
        if (m.captures.length > 0) {
            sfx.capture();
            views[p][m.tok].celebrateUntil = now + 1100;
            sfx.playTokenEventSfx(kind, 'capture');
        }
        for (const c of m.captures) {
            // re-check: the victim is still on that square after landing
            captured = true;
            capturesMade[p] += 1;
            const victim = c.p;
            void sendHome(victim, c.t, 900);
            if (!isOnline()) {
                const { revengeHit } = recordCaptureGrudge(grudges, p, victim);
                if (revengeHit && revengeVictim === -1) revengeVictim = victim;
                if (preRivalry && victim === preRivalry.leaderIdx && preRivalry.leaderPct >= 20 && leaderVictim === -1) {
                    leaderVictim = victim;
                }
                emitLocalBanter('capture', p, { n: nameOf(victim) }, 0.9);
                emitLocalBanter('captured', victim, undefined, 0.9);
            }
        }
        if (captured) await delay(1400, expectedEpoch !== undefined);
        if (expectedEpoch !== undefined && isOnline() && turnEpoch !== expectedEpoch) {
            return { captured, home: m.reachesHome };
        }
        if (m.reachesHome) {
            views[p][m.tok].celebrateUntil = now + 1100;
            if (!captured) sfx.playTokenEventSfx(kind, 'home');
        } else if (prevPos < COLORED_PATH_START_POS && m.to >= COLORED_PATH_START_POS) {
            views[p][m.tok].celebrateUntil = now + 900;
            if (!captured) sfx.playTokenEventSfx(kind, 'home_stretch');
        }
        if (!isOnline()) {
            if (leaderVictim !== -1 && preRivalry?.tier === 'dethrone') {
                emitRivalryEvent('leader_hit', p, leaderVictim, preRivalry.leaderPct);
            } else if (revengeVictim !== -1) {
                emitRivalryEvent('grudge_hit', p, revengeVictim, percent(tokens, revengeVictim));
            } else if (leaderVictim !== -1 && preRivalry) {
                emitRivalryEvent('leader_hit', p, leaderVictim, preRivalry.leaderPct);
            }

            if (m.reachesHome) {
                emitLocalBanter('pawn_home', p, undefined, 0.75);
            } else if (prevPos < COLORED_PATH_START_POS && m.to >= COLORED_PATH_START_POS) {
                emitLocalBanter('home_stretch', p, undefined, 0.7);
            } else if (m.fromBase) {
                emitLocalBanter('turn', p, undefined, 0.35);
            }
        }
        publish();
        if (!isOnline() && !hasWon(tokens, p)) {
            const postRivalry = evaluateRivalryState(tokens, -1, active);
            if (
                postRivalry.tier === 'dethrone' &&
                postRivalry.leaderIdx >= 0 &&
                !dethroneAlertedLeaders.has(postRivalry.leaderIdx)
            ) {
                dethroneAlertedLeaders.add(postRivalry.leaderIdx);
                const commentator = [0, 1, 2, 3].find((s) => s !== postRivalry.leaderIdx && active[s] && isAI(s)) ?? -1;
                emitRivalryEvent('dethrone_alert', commentator, postRivalry.leaderIdx, postRivalry.leaderPct);
            }
        }
        return { captured, home: m.reachesHome };
    }

    let isPenalizing = false;
    async function penalize(p: number, tokenIndices: number[]) {
        if (isPenalizing || tokenIndices.length === 0) return;
        isPenalizing = true;
        try {
            penalties[p] += tokenIndices.length;
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
        flyT = -1;
        flying = [];
        flyHoldingResult = false;
        current = p;
        localTurnAutoPlay = false;
        diceUsed = [true, true];
        dieConfirmed = false;
        turnInitialTokens = null;
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
                    clearPendingTap();
                    localTurnAutoPlay = true;
                    if (turnTimerInterval) {
                        clearInterval(turnTimerInterval);
                        turnTimerInterval = null;
                    }
                    // Timeout while "Gul or Pass?" modal is open -> ALWAYS Auto-PASS (never Auto-Gul)
                    if (bus.onGulDecision && waitChoice) {
                        const decide = bus.onGulDecision;
                        bus.onGulDecision = undefined;
                        store.patch({ gulPrompt: null });
                        localTurnAutoPlay = false; // allow decide('pass') internal resolution, then immediately re-lock
                        decide('pass');
                        localTurnAutoPlay = true;
                        sfx.tick();
                        return;
                    }
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
                        const autoMove = pickBestAIMove(
                            tokens,
                            p,
                            pool,
                            active,
                            dice,
                            diceUsed,
                            turnObligation,
                            turnCapturesTaken,
                            { personality: personalityOf(p), grudgeTargetIdx: grudges[p]?.targetIdx ?? null },
                        ).move;
                        sfx.tick();
                        if (resolveAutoPlayGulAction(tokens, p, autoMove, dice, true, turnInitialTokens) === 'pass') {
                            diceUsed = [true, true];
                            clearHighlights();
                            popup('info', 'AUTO-PASSED', `${nameOf(p)} timed out — turn passed!`, 2000);
                            r({ ...autoMove, reachesHome: false, to: tokens[p][autoMove.tok], passed: true } as any);
                        } else {
                            r(autoMove);
                        }
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
            turnInitialTokens = tokens.map((row) => row.slice());
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
                        { personality: personalityOf(p), grudgeTargetIdx: grudges[p]?.targetIdx ?? null },
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
                if (!isOnline() && localTurnAutoPlay) {
                    const caps = optionsNow.filter((m) => m.captures.length > 0);
                    const pool = caps.length > 0 ? caps : optionsNow;
                    const autoMove = pickBestAIMove(
                        tokens,
                        p,
                        pool,
                        active,
                        dice,
                        diceUsed,
                        turnObligation,
                        capturesTaken,
                        { personality: personalityOf(p), grudgeTargetIdx: grudges[p]?.targetIdx ?? null },
                    ).move;
                    await delay(650);
                    if (turnAborted()) break;
                    if (resolveAutoPlayGulAction(tokens, p, autoMove, dice, true, turnInitialTokens) === 'pass') {
                        diceUsed = [true, true];
                        clearHighlights();
                        extra = false;
                        popup('info', 'AUTO-PASSED', `${nameOf(p)} timed out — turn passed!`, 2000);
                        optionsNow = [];
                        continue;
                    }
                    if (autoMove.die === 2 || autoMove.combined) diceUsed = [true, true];
                    else diceUsed[autoMove.die] = true;
                    const res = await applyMove(p, autoMove, myTurnEpoch);
                    if (turnAborted()) break;
                    recordMoveCaptureAndUpgrade(autoMove);
                    if (res.captured || res.home) extra = true;
                    if (hasWon(tokens, p)) {
                        winner = p;
                        return false;
                    }
                    optionsNow = [];
                    continue;
                }
                // --- human: tap a die (or combined sum) to choose it, then tap a token to move it
                dieConfirmed = false;
                setStatus(tr(lang, 'pickDie'));
                const usableDies = [0, 1].filter((i) => !diceUsed[i] && optionsNow.some((m) => m.die === i));
                const hasCombined = !diceUsed[0] && !diceUsed[1] && optionsNow.some((m) => m.die === 2);
                const loneTokIdx = isLoneTokenOnTrack(tokens, p)
                    ? tokens[p].findIndex((r) => r >= 0 && r < CENTER_HOME_POS)
                    : -1;
                const preferCombinedByDefault =
                    hasCombined &&
                    loneTokIdx >= 0 &&
                    (tokens[p][loneTokIdx] + dice[0] + dice[1] >= COLORED_PATH_START_POS ||
                        !(tokens[p].some((r) => r === IN_BASE) && (dice[0] === 6 || dice[1] === 6)));
                if (preferCombinedByDefault) {
                    selDie = 2;
                } else if (usableDies.length > 0) {
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
                    extra = false;
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
            turnInitialTokens = null;
            diceUsed = [true, true];
            clearHighlights();
            return extra;
        } finally {
            clearPendingTap();
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
        clearPendingTap();
        clearBurnoutEffects();
        sfx.stopHeartbeat();
        const rows = [0, 1, 2, 3]
            .filter((p) => active[p])
            .map((p) => ({ idx: p, pct: p === winner ? 100 : percent(tokens, p), fine: fineProgress(tokens, p) }));
        rows.sort((a, b) => (a.idx === winner ? -1 : b.idx === winner ? 1 : b.pct - a.pct || b.fine - a.fine));
        ranking = rows.map((r) => ({
            idx: r.idx,
            pct: r.pct,
            captures: capturesMade[r.idx] ?? 0,
            penalties: penalties[r.idx] ?? 0,
        }));
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
                decrementSeatGrudge(grudges, p);
                publish();
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
        if (lang !== st.lang) {
            lang = st.lang;
            void preloadDialoguePack(lang);
        }
        if (!st.rotate) targetYaw = 0;
        const targetPitch = Math.max(20, Math.min(90, st.tilt));
        const rate = 1 - Math.exp(-(2.0 * BOARD_SPEED * dt) / 1000);
        yaw += wrap180(targetYaw - yaw) * rate;
        pitch += (targetPitch - pitch) * rate;
        moving = Math.abs(wrap180(targetYaw - yaw)) > 0.6 || Math.abs(targetPitch - pitch) > 0.6;
        const tc = COLORS[current];
        outline = mix(outline, tc, Math.min(1, dt / 350));

        fitBoard();
        const sig = [
            yaw.toFixed(1),
            pitch.toFixed(1),
            S.toFixed(1),
            OX.toFixed(0),
            OY.toFixed(0),
            stage.designWidth().toFixed(0),
            stage.designHeight().toFixed(0),
            outline,
            st.bg,
            st.boardTheme || 'classic',
            st.diceStyle || 'classic',
        ].join('|');
        if (sig !== lastSig) {
            lastSig = sig;
            drawBoard();
        }
        drawThemedBoardFX(boardFxG, (x, y, z = 0) => P(x, y, z), resolveBoardTheme(st.boardTheme), now, S);
        bgFill.tint = 0xffffff;
        updateTokens(now, dt);
        updateBurnoutParticles(dt, now);
        updatePlates(dt);
        if (homeCenterTxt?.position && homeCenterTxt?.scale && !homeCenterTxt.destroyed) {
            const midP = P(7.5, 7.5, 0.05);
            homeCenterTxt.position.set(midP.x, midP.y);
            homeCenterTxt.scale.set(Math.max(0.7, S * 0.024));
        }
        updateFly(dt, now);
        drawDice(now);
        syncHand();
        updateHand(dt);
        refreshTurnText();
        updateChat();
    };

    layout();
    const offResize = stage.onResize(layout);
    bgFill.clear().rect(-80, -80, stage.designWidth() + 160, stage.designHeight() + 160).fill(BG_BASE[store.get().settings.bg]);
    // keep the page background in step with the chosen table
    const unsubStore = store.subscribe(() => {
        bgFill.clear().rect(-80, -80, stage.designWidth() + 160, stage.designHeight() + 160).fill(BG_BASE[store.get().settings.bg]);
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
            clearPendingTap();
            clearBurnoutEffects();
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
            bus.onRemoteRivalryEvent = undefined;
            if (rivalryBannerTimer) {
                clearTimeout(rivalryBannerTimer);
                rivalryBannerTimer = null;
            }
            if (localReactionsTimer) {
                clearTimeout(localReactionsTimer);
                localReactionsTimer = null;
            }
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
            store.patch({
                wishNums: null,
                wishUsable: false,
                isWaitingRoll: false,
                gulPrompt: null,
                captureNotice: null,
                skipCapturePrompt: null,
                rivalry: null,
                grudges: createEmptyGrudges(),
                rivalryBanner: null,
                localReactions: {},
                nameplateBounds: [],
                adBannerBound: null,
            });
        },
    };
}

// silence "unused" for helpers kept for readability
void PATH_START;
void SAFE;
void globalIdx;
