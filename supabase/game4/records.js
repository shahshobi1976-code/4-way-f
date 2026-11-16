import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration files
let config = {
    matchDurationMinSeconds: 120,
    minHumanPlayers: 2,
    maxCapturesPerSeat: 60,
    maxRecordedMatchesPerIpPerDay: 30,
    maxRecordedMatchesPerTokenPerDay: 10,
    maxGuestIdsPerIpPer5Min: 15,
};

try {
    const configPath = path.join(__dirname, 'records-config.json');
    if (fs.existsSync(configPath)) {
        config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    }
} catch (e) {
    console.warn('[Records] Failed to read records-config.json, using defaults', e.message);
}

let profanityWords = [];
try {
    const profanityPath = path.join(__dirname, 'profanity-words.json');
    if (fs.existsSync(profanityPath)) {
        profanityWords = JSON.parse(fs.readFileSync(profanityPath, 'utf8'));
    }
} catch (e) {
    console.warn('[Records] Failed to read profanity-words.json', e.message);
}

const SUPABASE_URL =
    process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('rvwbgvyxofkeufzgjiyb')
        ? process.env.SUPABASE_URL
        : 'https://xiummtvknlfpwvrgchms.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        console.log('[Records] Supabase client initialized for schema game4');
    } catch (err) {
        console.warn('[Records] Error initializing Supabase client:', err.message);
    }
} else {
    console.warn('[Records] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Database logging disabled.');
}

// In-memory rate limiting counters
const ipGuestCreations = new Map(); // ip -> [timestamps]
const ipMatchesPerDay = new Map();  // ip:date -> count
const tokenMatchesPerDay = new Map(); // tokenHash:date -> count

function getTodayString() {
    return new Date().toISOString().slice(0, 10);
}

export function cleanRateLimitWindows() {
    const now = Date.now();
    for (const [ip, times] of ipGuestCreations.entries()) {
        const fresh = times.filter((t) => now - t < 5 * 60 * 1000);
        if (fresh.length === 0) ipGuestCreations.delete(ip);
        else ipGuestCreations.set(ip, fresh);
    }
}

// Step 3: Guest Identity & Secret Token
export function generateGuestIdentity(ip = '127.0.0.1') {
    cleanRateLimitWindows();
    const now = Date.now();
    const history = ipGuestCreations.get(ip) || [];
    if (history.length >= config.maxGuestIdsPerIpPer5Min) {
        throw new Error('Too many guest IDs created from this IP. Please wait a few minutes.');
    }
    history.push(now);
    ipGuestCreations.set(ip, history);

    // Public Player ID: "g_" + 8 random hex characters
    const publicPlayerId = `g_${crypto.randomBytes(4).toString('hex')}`;
    // Secret Session Token: 48-character random hex token
    const secretSessionToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(secretSessionToken);

    return {
        publicPlayerId,
        secretSessionToken,
        tokenHash,
    };
}

export function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Step 4: Display Name & Profanity Filter
const RESERVED_NAMES = new Set(['admin', 'root', 'system', 'host', 'moderator']);

export function sanitizeDisplayName(rawName, publicPlayerId) {
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

// Retry with exponential backoff & 4.5s timeout
async function withRetry(operation, retries = 2, timeoutMs = 4500) {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            const timeoutPromise = new Promise((_, reject) =>
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
}

// Step 6: Match Ended Strict Validation & Async Recording
export async function recordMatchEnded(matchData) {
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
            players, // Array of player records
            results, // Array of seat result objects
            ip,
        } = matchData;

        // 1. Host socket only (seat 0)
        if (callerSeat !== 0) {
            throw new Error('Validation failed: Only host (seat 0) can submit match ended');
        }

        // 2. Match was actually started
        if (!roomStarted) {
            throw new Error('Validation failed: Match was never started');
        }

        // 3. Once per room
        if (alreadyEnded) {
            throw new Error('Validation failed: Match has already been recorded for this room');
        }

        // 4. Minimum 2 humans
        const humanPlayers = players.filter((p) => p && !p.isAI);
        if (humanPlayers.length < config.minHumanPlayers) {
            throw new Error(`Validation failed: Match requires at least ${config.minHumanPlayers} human players`);
        }

        // 5. Duration >= 120s
        const durationSec = Math.floor((endedAt - startedAt) / 1000);
        if (durationSec < config.matchDurationMinSeconds) {
            throw new Error(`Validation failed: Match duration (${durationSec}s) is shorter than minimum ${config.matchDurationMinSeconds}s`);
        }

        // 6. Winner == Rank 1 check & rank uniqueness
        const ranks = results.map((r) => r.rank);
        const seats = results.map((r) => r.seat);
        if (new Set(seats).size !== results.length) {
            throw new Error('Validation failed: Duplicate seat detected in results');
        }
        if (new Set(ranks).size !== results.length) {
            throw new Error('Validation failed: Duplicate rank detected in results');
        }

        const rank1 = results.find((r) => r.rank === 1);
        if (!rank1) {
            throw new Error('Validation failed: No winner with rank 1 found');
        }

        // 7. Captures cap (max 60 per seat)
        for (const r of results) {
            if (r.captures_made > config.maxCapturesPerSeat) {
                throw new Error(`Validation failed: Seat ${r.seat} exceeded max captures limit (${r.captures_made})`);
            }
        }

        // 8. Capture conservation: sum(captures_made) === sum(times_captured)
        const totalCapturesMade = results.reduce((sum, r) => sum + (r.captures_made || 0), 0);
        const totalTimesCaptured = results.reduce((sum, r) => sum + (r.times_captured || 0), 0);
        if (totalCapturesMade !== totalTimesCaptured) {
            throw new Error(`Validation failed: Capture conservation failed (${totalCapturesMade} made vs ${totalTimesCaptured} times captured)`);
        }

        // 9. Rate limiting checks
        const today = getTodayString();
        const ipKey = `${ip || 'local'}:${today}`;
        const ipCount = ipMatchesPerDay.get(ipKey) || 0;
        if (ipCount >= config.maxRecordedMatchesPerIpPerDay) {
            throw new Error('Rate limit reached: Max matches recorded for this IP today');
        }

        for (const p of humanPlayers) {
            if (p.tokenHash) {
                const tokKey = `${p.tokenHash}:${today}`;
                const tokCount = tokenMatchesPerDay.get(tokKey) || 0;
                if (tokCount >= config.maxRecordedMatchesPerTokenPerDay) {
                    throw new Error(`Rate limit reached: Max matches recorded for token ${p.name}`);
                }
            }
        }

        // Non-blocking async insert with retry
        const matchId = crypto.randomUUID();

        await withRetry(async () => {
            // 1. Upsert players in game4.players
            for (const p of humanPlayers) {
                const { error: pErr } = await supabaseClient
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
            const { error: mErr } = await supabaseClient
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

            // 3. Insert results in game4.results with verified: false
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

            const { error: rErr } = await supabaseClient
                .schema('game4')
                .from('results')
                .insert(resultRows);
            if (rErr) throw rErr;
        });

        // Increment rate limit counters
        ipMatchesPerDay.set(ipKey, ipCount + 1);
        for (const p of humanPlayers) {
            if (p.tokenHash) {
                const tokKey = `${p.tokenHash}:${today}`;
                tokenMatchesPerDay.set(tokKey, (tokenMatchesPerDay.get(tokKey) || 0) + 1);
            }
        }

        console.log(`[Records] Match ${matchId} successfully recorded in game4 schema`);
        return { ok: true, matchId };
    } catch (err) {
        console.warn('[Records] Failed to record match in game4:', err.message);
        return { ok: false, error: err.message };
    }
}
