import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RecordsConfig {
    matchDurationMinSeconds: number;
    minHumanPlayers: number;
    maxCapturesPerSeat: number;
    maxRecordedMatchesPerIpPerDay: number;
    maxRecordedMatchesPerTokenPerDay: number;
    maxGuestIdsPerIpPer5Min: number;
}

let config: RecordsConfig = {
    matchDurationMinSeconds: 120,
    minHumanPlayers: 2,
    maxCapturesPerSeat: 60,
    maxRecordedMatchesPerIpPerDay: 30,
    maxRecordedMatchesPerTokenPerDay: 10,
    maxGuestIdsPerIpPer5Min: 15,
};

export function getRecordsConfig(): RecordsConfig {
    return config;
}

try {
    const configPath = path.resolve(__dirname, '../supabase/game4/records-config.json');
    if (fs.existsSync(configPath)) {
        config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    }
} catch (e: any) {
    console.warn('[Records] Using default records config:', e.message);
}

let profanityWords: string[] = [];
try {
    const candidatePaths = [
        path.resolve(__dirname, '../profanity-words.json'),
        path.resolve(__dirname, '../supabase/game4/profanity-words.json'),
    ];
    for (const profanityPath of candidatePaths) {
        if (fs.existsSync(profanityPath)) {
            const parsed = JSON.parse(fs.readFileSync(profanityPath, 'utf8'));
            const rawList = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.words) ? parsed.words : [];
            profanityWords = rawList
                .filter((w: unknown): w is string => typeof w === 'string' && w.trim().length > 0)
                .map((w: string) => w.trim());
            if (profanityWords.length > 0) break;
        }
    }
} catch (e: any) {
    console.warn('[Records] Using empty profanity list:', e.message);
}

try {
    if (typeof process.loadEnvFile === 'function' && fs.existsSync(path.resolve(__dirname, '../.env'))) {
        process.loadEnvFile(path.resolve(__dirname, '../.env'));
    }
} catch {
    // Ignore if already loaded or missing
}

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

let supabaseClient: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        console.log('[Records] Supabase client initialized for schema game4');
    } catch (err: any) {
        console.warn('[Records] Error initializing Supabase client:', err.message);
    }
} else {
    console.warn('[Records] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured. DB recording is disabled.');
}

const ipGuestCreations = new Map<string, number[]>();
const ipMatchesPerDay = new Map<string, number>();
const tokenMatchesPerDay = new Map<string, number>();

function getTodayString(): string {
    return new Date().toISOString().slice(0, 10);
}

export function cleanRateLimitWindows(): void {
    const now = Date.now();
    for (const [ip, times] of ipGuestCreations.entries()) {
        const fresh = times.filter((t) => now - t < 5 * 60 * 1000);
        if (fresh.length === 0) ipGuestCreations.delete(ip);
        else ipGuestCreations.set(ip, fresh);
    }
}

export function generateGuestIdentity(ip = '127.0.0.1'): {
    publicPlayerId: string;
    secretSessionToken: string;
    tokenHash: string;
} {
    cleanRateLimitWindows();
    const now = Date.now();
    const history = ipGuestCreations.get(ip) || [];
    if (history.length >= config.maxGuestIdsPerIpPer5Min) {
        throw new Error('Too many guest IDs created from this IP. Please wait a few minutes.');
    }
    history.push(now);
    ipGuestCreations.set(ip, history);

    const publicPlayerId = `g_${crypto.randomBytes(4).toString('hex')}`;
    const secretSessionToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(secretSessionToken);

    return {
        publicPlayerId,
        secretSessionToken,
        tokenHash,
    };
}

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

const RESERVED_NAMES = new Set(['admin', 'root', 'system', 'host', 'moderator']);

export function maskProfanity(rawText: string): string {
    let text = String(rawText || '');
    if (!text || profanityWords.length === 0) return text;
    for (const word of profanityWords) {
        if (!word) continue;
        try {
            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const isAscii = /^[a-z0-9_.-]+$/i.test(word);
            const regex = isAscii
                ? new RegExp(`\\b${escaped}\\b`, 'gi')
                : new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'giu');
            text = text.replace(regex, '***');
        } catch {
            // Skip malformed pattern
        }
    }
    return text;
}

export function sanitizeDisplayName(rawName: string, _publicPlayerId: string): string {
    let name = String(rawName || 'Player').trim();
    if (name.length > 24) name = name.slice(0, 24);

    const lower = name.toLowerCase();
    if (RESERVED_NAMES.has(lower)) {
        name = 'Player';
    }

    name = maskProfanity(name);

    return name;
}

async function withRetry<T>(operation: () => Promise<T>, retries = 2, timeoutMs = 4500): Promise<T> {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Database operation timed out')), timeoutMs)
            );
            return await Promise.race([operation(), timeoutPromise]);
        } catch (err) {
            attempt++;
            if (attempt > retries) throw err;
            const backoff = Math.min(1000 * Math.pow(2, attempt), 4000);
            await new Promise((r) => setTimeout(r, backoff));
        }
    }
    throw new Error('Retry limit reached');
}

export interface PlayerRecordData {
    publicPlayerId: string;
    displayName: string;
    name: string;
    isAI: boolean;
    tokenHash?: string;
}

export interface SeatResultData {
    playerId: string;
    seat: number;
    rank: number;
    progress_percent: number;
    captures_made: number;
    times_captured: number;
    penalties: number;
}

export interface MatchEndedData {
    roomCode: string;
    startedAt: number;
    endedAt: number;
    callerSeat: number;
    roomStarted: boolean;
    alreadyEnded: boolean;
    players: PlayerRecordData[];
    results: SeatResultData[];
    ip?: string;
}

interface QueuedMatchWrite {
    matchId: string;
    matchData: MatchEndedData;
    attempts: number;
    nextRetryAt: number;
}

const MAX_OFFLINE_QUEUE = 50;
const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const offlineQueue: QueuedMatchWrite[] = [];
let backoffFlushTimer: NodeJS.Timeout | null = null;

function scheduleOfflineFlush() {
    if (backoffFlushTimer || offlineQueue.length === 0 || !supabaseClient) return;
    const earliest = Math.min(...offlineQueue.map((q) => q.nextRetryAt));
    const waitMs = Math.max(500, earliest - Date.now());
    backoffFlushTimer = setTimeout(() => {
        backoffFlushTimer = null;
        void flushOfflineQueue();
    }, waitMs);
    backoffFlushTimer.unref?.();
}

async function persistValidatedMatchToSupabase(matchId: string, matchData: MatchEndedData): Promise<void> {
    if (!supabaseClient) throw new Error('Supabase client not configured');
    const { roomCode, startedAt, endedAt, players, results } = matchData;

    await withRetry(async () => {
        // 1. Upsert all participating players (including bot seat entries so results FK never fails)
        //    and increment tournament_balance + matches_played + wins for human players.
        const resultByPlayerId = new Map(results.map((r) => [r.playerId, r]));

        for (const p of players) {
            if (!p?.publicPlayerId) continue;
            const seatRes = resultByPlayerId.get(p.publicPlayerId);
            const won = seatRes?.rank === 1;

            const { data: existing } = await supabaseClient!
                .schema('game4')
                .from('players')
                .select('tournament_balance, matches_played, wins')
                .eq('id', p.publicPlayerId)
                .maybeSingle();

            const prevBal = Number((existing as any)?.tournament_balance ?? 1000);
            const prevPlayed = Number((existing as any)?.matches_played ?? 0);
            const prevWins = Number((existing as any)?.wins ?? 0);
            const reward = p.isAI ? 0 : won ? 100 : 15;

            const { error: pErr } = await supabaseClient!
                .schema('game4')
                .from('players')
                .upsert(
                    {
                        id: p.publicPlayerId,
                        display_name: p.displayName || p.name,
                        tournament_balance: prevBal + reward,
                        matches_played: prevPlayed + 1,
                        wins: prevWins + (won ? 1 : 0),
                    },
                    { onConflict: 'id' }
                );
            if (pErr) throw pErr;
        }

        // 2. Insert match in game4.matches
        const { error: mErr } = await supabaseClient!
            .schema('game4')
            .from('matches')
            .insert({
                id: matchId,
                room_code: roomCode,
                started_at: new Date(startedAt).toISOString(),
                ended_at: new Date(endedAt).toISOString(),
                player_count: players.length,
            });
        if (mErr) throw mErr;

        // 3. Insert results in game4.results enforcing seats 0..3 & ranks 1..4
        const resultRows = results.map((r) => ({
            id: crypto.randomUUID(),
            match_id: matchId,
            player_id: r.playerId,
            seat: r.seat,
            rank: r.rank,
            progress_percent: Math.min(100, Math.max(0, Number(r.progress_percent || 0))),
            captures_made: r.captures_made || 0,
            times_captured: r.times_captured || 0,
            penalties: r.penalties || 0,
            verified: false,
        }));

        const { error: rErr } = await supabaseClient!
            .schema('game4')
            .from('results')
            .insert(resultRows);
        if (rErr) throw rErr;
    });
}

async function flushOfflineQueue(): Promise<void> {
    if (!supabaseClient || offlineQueue.length === 0) return;
    const now = Date.now();
    const remaining: QueuedMatchWrite[] = [];

    for (const item of offlineQueue) {
        if (item.nextRetryAt > now) {
            remaining.push(item);
            continue;
        }
        try {
            await persistValidatedMatchToSupabase(item.matchId, item.matchData);
            console.log(`[Records] Flushed queued match ${item.matchId} to game4 schema`);
        } catch (err: any) {
            const nextAttempts = item.attempts + 1;
            if (nextAttempts <= 6) {
                const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, nextAttempts));
                remaining.push({
                    ...item,
                    attempts: nextAttempts,
                    nextRetryAt: Date.now() + backoff,
                });
            } else {
                console.warn(`[Records] Dropping queued match ${item.matchId} after max retries:`, err?.message);
            }
        }
    }

    offlineQueue.length = 0;
    offlineQueue.push(...remaining);
    scheduleOfflineFlush();
}

export function getOfflineQueueSize(): number {
    return offlineQueue.length;
}

export async function recordMatchEnded(
    matchData: MatchEndedData
): Promise<{ ok: boolean; matchId?: string; queued?: boolean; error?: string; warning?: string }> {
    if (!supabaseClient) {
        return { ok: false, warning: 'Supabase client not configured' };
    }

    try {
        const {
            startedAt,
            endedAt,
            callerSeat,
            roomStarted,
            alreadyEnded,
            players,
            results,
            ip,
        } = matchData;

        // 1. Host socket only (seat 0)
        if (callerSeat !== 0) {
            throw new Error('Validation failed: Only host (seat 0) can submit match ended');
        }

        // 2. Room was actually started
        if (!roomStarted) {
            throw new Error('Validation failed: Match was never started');
        }

        // 3. Once per room
        if (alreadyEnded) {
            throw new Error('Validation failed: Match already recorded');
        }

        // 4. Minimum human players
        const humanPlayers = players.filter((p) => p && !p.isAI);
        if (humanPlayers.length < config.minHumanPlayers) {
            throw new Error(`Validation failed: Requires at least ${config.minHumanPlayers} human players`);
        }

        // 5. Duration >= minimum
        const durationSec = Math.floor((endedAt - startedAt) / 1000);
        if (durationSec < config.matchDurationMinSeconds) {
            throw new Error(`Validation failed: Match duration (${durationSec}s) is shorter than minimum ${config.matchDurationMinSeconds}s`);
        }

        // 6. Enforce valid seats 0..3 and ranks 1..4 without duplicates
        if (results.length < 2 || results.length > 4) {
            throw new Error('Validation failed: Results must contain between 2 and 4 player seats');
        }
        for (const r of results) {
            if (!Number.isInteger(r.seat) || r.seat < 0 || r.seat > 3) {
                throw new Error(`Validation failed: Invalid seat ${r.seat} (must be 0..3)`);
            }
            if (!Number.isInteger(r.rank) || r.rank < 1 || r.rank > 4) {
                throw new Error(`Validation failed: Invalid rank ${r.rank} (must be 1..4)`);
            }
        }
        const ranks = results.map((r) => r.rank);
        const seats = results.map((r) => r.seat);
        if (new Set(seats).size !== results.length) {
            throw new Error('Validation failed: Duplicate seats detected');
        }
        if (new Set(ranks).size !== results.length) {
            throw new Error('Validation failed: Duplicate ranks detected');
        }

        const rank1 = results.find((r) => r.rank === 1);
        if (!rank1) {
            throw new Error('Validation failed: No winner declared with rank 1');
        }

        // 7. Captures cap (max 60 per seat)
        for (const r of results) {
            if (r.captures_made > config.maxCapturesPerSeat) {
                throw new Error(`Validation failed: Seat ${r.seat} captures (${r.captures_made}) exceed limit`);
            }
        }

        // 8. Capture conservation: sum(captures_made) === sum(times_captured)
        const totalCapturesMade = results.reduce((sum, r) => sum + (r.captures_made || 0), 0);
        const totalTimesCaptured = results.reduce((sum, r) => sum + (r.times_captured || 0), 0);
        if (totalCapturesMade !== totalTimesCaptured) {
            throw new Error(`Validation failed: Capture conservation failed (${totalCapturesMade} made vs ${totalTimesCaptured} times captured)`);
        }

        // 9. Rate limiting
        const today = getTodayString();
        const ipKey = `${ip || 'local'}:${today}`;
        const ipCount = ipMatchesPerDay.get(ipKey) || 0;
        if (ipCount >= config.maxRecordedMatchesPerIpPerDay) {
            throw new Error('Rate limit reached: Max matches per IP per day');
        }

        for (const p of humanPlayers) {
            if (p.tokenHash) {
                const tokKey = `${p.tokenHash}:${today}`;
                const tokCount = tokenMatchesPerDay.get(tokKey) || 0;
                if (tokCount >= config.maxRecordedMatchesPerTokenPerDay) {
                    throw new Error(`Rate limit reached: Max matches per token for player ${p.name}`);
                }
            }
        }

        const matchId = crypto.randomUUID();

        // Increment rate counters on validated write attempt
        ipMatchesPerDay.set(ipKey, ipCount + 1);
        for (const p of humanPlayers) {
            if (p.tokenHash) {
                const tokKey = `${p.tokenHash}:${today}`;
                tokenMatchesPerDay.set(tokKey, (tokenMatchesPerDay.get(tokKey) || 0) + 1);
            }
        }

        try {
            await persistValidatedMatchToSupabase(matchId, matchData);
            console.log(`[Records] Match ${matchId} successfully recorded in game4 schema`);
            return { ok: true, matchId };
        } catch (dbErr: any) {
            if (offlineQueue.length < MAX_OFFLINE_QUEUE) {
                offlineQueue.push({
                    matchId,
                    matchData,
                    attempts: 1,
                    nextRetryAt: Date.now() + BASE_BACKOFF_MS,
                });
                scheduleOfflineFlush();
                console.warn(`[Records] Queued match ${matchId} for offline backoff retry:`, dbErr?.message);
                return { ok: false, matchId, queued: true, error: dbErr?.message };
            }
            throw dbErr;
        }
    } catch (err: any) {
        console.warn('[Records] Failed to record match in game4:', err.message);
        return { ok: false, error: err.message };
    }
}

export async function fetchLeaderboard(): Promise<{ ok: boolean; data?: any[]; error?: string }> {
    if (!supabaseClient) {
        return { ok: false, error: 'Database not configured' };
    }
    try {
        const { data, error } = await withRetry(async () =>
            supabaseClient!
                .schema('game4')
                .from('leaderboard')
                .select('*')
                .limit(100)
        );
        if (error) throw error;
        return { ok: true, data };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}
