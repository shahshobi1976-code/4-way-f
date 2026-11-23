import type { RivalryCalloutKind } from './banter';

export interface NameplateBound {
    seatIdx: number;
    x: number;
    y: number;
    w: number;
    h: number;
    angleDeg: number;
}

// Channel between React UI, Multiplayer Client, and running Pixi scene
export const bus: {
    /** Post a chat line as a player (typed message, reaction, quick phrase). */
    chat?: (idx: number, text: string, opts?: { voice?: boolean }) => void;
    /** Use the current human player's pre-set lucky wish for this roll. */
    wish?: () => void;
    /** Trigger dice roll for current player. */
    roll?: () => void;
    /** Remote player rolled dice event */
    onRemoteDiceRolled?: (p: number, dice: [number, number], lucky: boolean, streakForfeited: boolean) => void;
    /** Remote player moved pawn event */
    onRemotePawnMoved?: (p: number, dieIndex: number, tokenIndex: number, to: number, captures: { p: number; t: number }[], reachedHome: boolean, passed?: boolean) => void;
    /** Remote turn change event */
    onRemoteTurnChanged?: (currentTurn: number, extraTurn: boolean) => void;
    /** Remote penalty applied event */
    onRemotePenaltyApplied?: (p: number, tokenIndices: number[], penalties: number) => void;
    /** Player decision for Gul or Pass prompt */
    onGulDecision?: (decision: 'gul' | 'pass') => void;
    /** Player decision for Skip Capture confirmation prompt */
    onSkipCaptureDecision?: (decision: 'continue' | 'back') => void;
    /** Remote game over event */
    onRemoteGameOver?: (winner: number, rankings: any[]) => void;
    /** Authoritative room state sync event (reconnect or recovery) */
    onRoomStateSynced?: (state: any) => void;
    /** Open Private Whisper composer targeted at specific seat(s) */
    openWhisperModal?: (preselectSeats?: number[]) => void;
    /** Remote server-synced AI banter line event */
    onRemoteAiBanter?: (data: {
        seatIndex: number;
        event: string;
        personality: string;
        lineIdx: number;
        vars?: Record<string, string>;
    }) => void;
    /** Authoritative server-synced rivalry event (dethrone alert, leader hit, or grudge hit) */
    onRemoteRivalryEvent?: (data: {
        kind: RivalryCalloutKind;
        actorSeat: number;
        targetSeat: number;
        leaderPct: number;
        lineIdx?: number;
    }) => void;
} = {};
