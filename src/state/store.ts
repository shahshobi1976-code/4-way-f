import { useSyncExternalStore } from 'react';
import { readDevice, readLocal, write } from './persist';
import type { NameplateBound } from '../game/bus';
import type { AIPersonality, RivalryCalloutKind } from '../game/banter';
import { createEmptyGrudges, type GrudgeEntry, type RivalryState } from '../game/rules';
import type { BoardThemeId, DiceStyleId } from '../game/themes';

export type Phase = 'loading' | 'menu' | 'setup' | 'playing';
export type ModalId =
    | null
    | 'settings'
    | 'music'
    | 'howto'
    | 'invite'
    | 'multiplayer'
    | 'tournament'
    | 'mic'
    | `wish:${number}`
    | `profile:${number}`;

export type MicPermissionState = 'unknown' | 'prompt' | 'checking' | 'granted' | 'denied' | 'unsupported';

export type CaptureWarningMode = 'first3' | 'always' | 'off';

export interface Settings {
    rotate: boolean;
    tilt: number; // camera elevation in degrees, 20 (low) .. 90 (top view)
    sound: boolean;
    music: boolean;
    aiMute: boolean; // Mute AI talking/speech only
    bgmTrack: string; // bundled MP3 soundtrack id
    bg: number; // 0..9 background arena
    boardTheme: BoardThemeId;
    diceStyle: DiceStyleId;
    lang: string;
    songName: string | null;
    timerEnabled: boolean; // Turn timer optional
    timerSec: 60 | 90 | 120; // 60s, 90s, 120s
    captureWarningMode: CaptureWarningMode;
}

export interface PlayerCfg {
    name: string;
    ai: boolean;
    avatar: string;
    wish: [number, number] | null;
    personality?: AIPersonality;
}

export interface Popup {
    kind: 'lucky' | 'penalty' | 'info';
    title: string;
    sub: string;
}

export interface RankRow {
    idx: number;
    pct: number;
}

export interface GulPrompt {
    p: number;
    tokenIndex: number;
    dieIndex: number;
    value: number;
}

export interface AppState {
    phase: Phase;
    loadProgress: number;
    paused: boolean;
    settings: Settings;
    players: PlayerCfg[]; // indexed by colour: 0 red, 1 green, 2 yellow, 3 blue
    mode: 4 | 2;
    gender: 'male' | 'female';
    gameId: number;
    modal: ModalId;
    // live game info (written by the Pixi scene)
    progress: number[];
    active: boolean[];
    current: number;
    popup: Popup | null;
    result: RankRow[] | null;
    wishNums: [number, number] | null;
    wishUsable: boolean;
    fullscreen: boolean;
    landscape: boolean;
    turnSecondsLeft: number;
    turnTotalSec: number;
    timerActive: boolean;
    isWaitingRoll: boolean;
    gulPrompt: GulPrompt | null;
    activeSpeechBalloon: { idx: number; text: string } | null;
    captureNotice: string | null;
    skipCapturePrompt: { message: string } | null;
    rivalry: RivalryState | null;
    grudges: (GrudgeEntry | null)[];
    rivalryBanner: {
        id: number;
        kind: RivalryCalloutKind;
        icon: string;
        title: string;
        message: string;
        targetSeat: number;
        actorSeat: number;
        leaderPct: number;
        until: number;
    } | null;
    localReactions: Record<number, { seatIndex: number; emoji: string; until: number; key: number }>;
    chatOpen: boolean;
    nameplateBounds: NameplateBound[];
    micPermission: MicPermissionState;
    micDeviceLabel: string | null;
    micError: string | null;
    micPromptDismissed: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    rotate: true,
    tilt: 55,
    sound: true,
    music: true,
    aiMute: false,
    bgmTrack: 'afro-reggaeton',
    bg: 0,
    boardTheme: 'classic',
    diceStyle: 'classic',
    lang: 'en',
    songName: null,
    timerEnabled: true,
    timerSec: 90,
    captureWarningMode: 'first3',
};

export function shouldShowCaptureWarning(mode: CaptureWarningMode | undefined, matchCount: number): boolean {
    const effectiveMode = mode || 'first3';
    if (effectiveMode === 'always') return true;
    if (effectiveMode === 'off') return false;
    return matchCount <= 3;
}

function loadSettings(): Settings {
    try {
        const raw = readLocal();
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                ...DEFAULT_SETTINGS,
                ...parsed,
                bgmTrack: typeof parsed.bgmTrack === 'string' && parsed.bgmTrack ? parsed.bgmTrack : DEFAULT_SETTINGS.bgmTrack,
                songName: null,
            };
        }
    } catch {
        /* unreadable/corrupt save: use defaults */
    }
    return DEFAULT_SETTINGS;
}

export const DEFAULT_PLAYERS: PlayerCfg[] = [
    { name: 'Shahbaz', ai: false, avatar: '🤴', wish: null, personality: 'Strategist' },
    { name: 'Mughal', ai: true, avatar: '🦁', wish: null, personality: 'Confidante' },
    { name: 'Zoi', ai: true, avatar: '🌟', wish: null, personality: 'Rival' },
    { name: 'Kajal', ai: true, avatar: '💎', wish: null, personality: 'Rideordie' },
];

let state: AppState = {
    phase: 'loading',
    loadProgress: 0,
    paused: false,
    settings: loadSettings(),
    players: DEFAULT_PLAYERS.map((p) => ({ ...p })),
    mode: 4,
    gender: 'male',
    gameId: 0,
    modal: null,
    progress: [0, 0, 0, 0],
    active: [true, true, true, true],
    current: 0,
    popup: null,
    result: null,
    wishNums: null,
    wishUsable: false,
    fullscreen: false,
    landscape: false,
    turnSecondsLeft: 90,
    turnTotalSec: 90,
    timerActive: false,
    isWaitingRoll: false,
    gulPrompt: null,
    activeSpeechBalloon: null,
    captureNotice: null,
    skipCapturePrompt: null,
    rivalry: null,
    grudges: createEmptyGrudges(),
    rivalryBanner: null,
    localReactions: {},
    chatOpen: false,
    nameplateBounds: [],
    micPermission: 'unknown',
    micDeviceLabel: null,
    micError: null,
    micPromptDismissed: false,
};

const listeners = new Set<() => void>();

export const store = {
    get: () => state,
    subscribe(cb: () => void) {
        listeners.add(cb);
        return () => {
            listeners.delete(cb);
        };
    },
    patch(p: Partial<AppState>) {
        state = { ...state, ...p };
        listeners.forEach((l) => l());
    },
    patchSettings(p: Partial<Settings>) {
        state = { ...state, settings: { ...state.settings, ...p } };
        write(JSON.stringify(state.settings));
        listeners.forEach((l) => l());
    },
    patchPlayer(i: number, p: Partial<PlayerCfg>) {
        const players = state.players.map((pl, k) => (k === i ? { ...pl, ...p } : pl));
        state = { ...state, players };
        listeners.forEach((l) => l());
    },
};

export function useStore<T>(selector: (s: AppState) => T): T {
    return useSyncExternalStore(store.subscribe, () => selector(state));
}

/**
 * Merge in the host-backed settings once the SDK is ready (the initial state
 * read only the synchronous browser copy). Runs before React mounts, so the
 * first paint already reflects the player's real settings.
 */
export async function hydrateSettings(): Promise<void> {
    const raw = await readDevice();
    if (!raw) return;
    try {
        const saved = JSON.parse(raw) as Partial<Settings>;
        state = { ...state, settings: { ...state.settings, ...saved, songName: state.settings.songName } };
        listeners.forEach((l) => l());
    } catch {
        /* corrupt host save: keep what we already have */
    }
}
