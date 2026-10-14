import { useSyncExternalStore } from 'react';
import { readDevice, readLocal, write } from './persist';

export type Phase = 'loading' | 'menu' | 'setup' | 'playing';
export type ModalId =
    | null
    | 'settings'
    | 'music'
    | 'howto'
    | 'invite'
    | 'multiplayer'
    | 'tournament'
    | `wish:${number}`
    | `profile:${number}`;

export interface Settings {
    rotate: boolean;
    tilt: number; // camera elevation in degrees, 20 (low) .. 90 (top view)
    sound: boolean;
    music: boolean;
    instrument: number; // 0..9
    bg: number; // 0..9
    lang: string;
    songName: string | null;
    timerEnabled: boolean; // Turn timer optional
    timerSec: 60 | 90 | 120; // 60s, 90s, 120s
}

export interface PlayerCfg {
    name: string;
    ai: boolean;
    avatar: string;
    wish: [number, number] | null;
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
}

const DEFAULT_SETTINGS: Settings = {
    rotate: true,
    tilt: 55,
    sound: true,
    music: true,
    instrument: 0,
    bg: 0,
    lang: 'en',
    songName: null,
    timerEnabled: true,
    timerSec: 90,
};

function loadSettings(): Settings {
    try {
        const raw = readLocal();
        if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw), songName: null };
    } catch {
        /* unreadable/corrupt save: use defaults */
    }
    return DEFAULT_SETTINGS;
}

export const DEFAULT_PLAYERS: PlayerCfg[] = [
    { name: 'Red', ai: true, avatar: '🔥', wish: null },
    { name: 'Green', ai: true, avatar: '🍀', wish: null },
    { name: 'Yellow', ai: true, avatar: '🌟', wish: null },
    { name: 'Blue', ai: false, avatar: '🤴', wish: null },
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
