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
    const profanityPath = path.resolve(__dirname, '../supabase/game4/profanity-words.json');
    if (fs.existsSync(profanityPath)) {
        profanityWords = JSON.parse(fs.readFileSync(profanityPath, 'utf8'));
    }
} catch (e: any) {
    console.warn('[Records] Using empty profanity list:', e.message);
}

try {
    if (typeof process.loadEnvFile === 'function' && fs.existsSync(path.resolve(__dirname, '../.env'))) {
        process.loadEnvFile(path.resolve(__dirname, '../.env'));
    }
} catch {
    // Ignore if not present
}

const SUPABASE_URL =
    process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('rvwbgvyxofkeufzgjiyb')
        ? process.env.SUPABASE_URL
        : 'https://xiummtvknlfpwvrgchms.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

    // Step 3: Public Player ID: "g_" + 8 random hex characters
    const publicPlayerId = `g_${crypto.randomBytes(4).toString('hex')}`;
    // Secret Session Token: 48-character random token
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

export function sanitizeDisplayName(rawName: string, publicPlayerId: string): string {
    let name = String(rawName || 'Player').trim();
    if (name.length > 24) name = name.slice(0, 24);

    const lower = name.toLowerCase();
    if (RESERVED_NAMES.has(lower)) {
        name = 'Player';
    }

    // Mask abusive words
    for (const word of profanityWords) {
        if (!word) continue;
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi');
        name = name.replace(regex, '***');
    }

    // Return sanitized name directly without appending any #suffix or room code
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
            const backoff = Math.min(1000 * Math.pow(2, attempt), 3000);
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

export async function recordMatchEnded(matchData: MatchEndedData): Promise<{ ok: boolean; matchId?: string; error?: string; warning?: string }> {
    if (!supabaseClient) {
        return { ok: false, warning: 'Supabase client not configured' };
    }

    try {
        const {
            roomCode,
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

        // 4. Minimum 2 humans
        const humanPlayers = players.filter((p) => p && !p.isAI);
        if (humanPlayers.length < config.minHumanPlayers) {
            throw new Error(`Validation failed: Requires at least ${config.minHumanPlayers} human players`);
        }

        // 5. Duration >= 120s
        const durationSec = Math.floor((endedAt - startedAt) / 1000);
        if (durationSec < config.matchDurationMinSeconds) {
            throw new Error(`Validation failed: Match duration (${durationSec}s) is shorter than minimum ${config.matchDurationMinSeconds}s`);
        }

        // 6. Winner == Rank 1 and unique ranks
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

        await withRetry(async () => {
            // 1. Upsert players in game4.players
            for (const p of humanPlayers) {
                const { error: pErr } = await supabaseClient!
                    .schema('game4')
                    .from('players')
                    .upsert(
                        {
                            id: p.publicPlayerId,
                            display_name: p.displayName || p.name,
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

            // 3. Insert results with verified: false
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

        // Increment rate counters
        ipMatchesPerDay.set(ipKey, ipCount + 1);
        for (const p of humanPlayers) {
            if (p.tokenHash) {
                const tokKey = `${p.tokenHash}:${today}`;
                tokenMatchesPerDay.set(tokKey, (tokenMatchesPerDay.get(tokKey) || 0) + 1);
            }
        }

        console.log(`[Records] Match ${matchId} successfully recorded in game4 schema`);
        return { ok: true, matchId };
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
        const { data, error } = await supabaseClient
            .schema('game4')
            .from('leaderboard')
            .select('*')
            .limit(100);
        if (error) throw error;
        return { ok: true, data };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}
