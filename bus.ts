// Channel between React UI, Multiplayer Client, and running Pixi scene
export const bus: {
    /** Post a chat line as a player (typed message, reaction, quick phrase). */
    chat?: (idx: number, text: string, opts?: { voice?: boolean }) => void;
    /** Use the current human player's pre-set lucky wish for this roll. */
    wish?: () => void;
    /** Remote player rolled dice event */
    onRemoteDiceRolled?: (p: number, dice: [number, number], lucky: boolean, streakForfeited: boolean) => void;
    /** Remote player moved pawn event */
    onRemotePawnMoved?: (p: number, dieIndex: number, tokenIndex: number, to: number, captures: { p: number; t: number }[], reachedHome: boolean) => void;
    /** Remote turn change event */
    onRemoteTurnChanged?: (currentTurn: number, extraTurn: boolean) => void;
} = {};
