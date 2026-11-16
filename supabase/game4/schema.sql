-- ============================================================
-- Ludo Dethroned (4-Way) - Supabase Database Schema
-- Schema Name: game4
-- ============================================================

-- 1. Create dedicated schema
CREATE SCHEMA IF NOT EXISTS game4;

-- 2. Allow API roles to use the schema
GRANT USAGE ON SCHEMA game4 TO anon, authenticated, service_role;

-- 3. Base Tables
-- 3.1 Players table (id is public player id like g_a1b2c3d4)
CREATE TABLE IF NOT EXISTS game4.players (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3.2 Matches table
CREATE TABLE IF NOT EXISTS game4.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    player_count INTEGER DEFAULT 4 NOT NULL
);

-- 3.3 Results table
CREATE TABLE IF NOT EXISTS game4.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES game4.matches(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES game4.players(id),
    seat INTEGER NOT NULL CHECK (seat >= 0 AND seat <= 3),
    rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 4),
    progress_percent NUMERIC(5,2) DEFAULT 0.00 NOT NULL CHECK (progress_percent >= 0 AND progress_percent <= 100),
    captures_made INTEGER DEFAULT 0 NOT NULL CHECK (captures_made >= 0 AND captures_made <= 200),
    times_captured INTEGER DEFAULT 0 NOT NULL CHECK (times_captured >= 0 AND times_captured <= 200),
    penalties INTEGER DEFAULT 0 NOT NULL CHECK (penalties >= 0 AND penalties <= 200),
    verified BOOLEAN DEFAULT false NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_game4_matches_ended_at ON game4.matches(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_game4_results_match_id ON game4.results(match_id);
CREATE INDEX IF NOT EXISTS idx_game4_results_player_id ON game4.results(player_id);

-- 4. Public Aggregated Leaderboard View
DROP VIEW IF EXISTS game4.leaderboard;
CREATE VIEW game4.leaderboard AS
SELECT 
    p.id AS player_id,
    p.display_name,
    COUNT(r.id)::INTEGER AS matches_played,
    COUNT(CASE WHEN r.rank = 1 THEN 1 END)::INTEGER AS wins,
    CASE 
        WHEN COUNT(r.id) > 0 THEN 
            ROUND((COUNT(CASE WHEN r.rank = 1 THEN 1 END)::NUMERIC / COUNT(r.id)::NUMERIC) * 100, 2)
        ELSE 0.00 
    END AS win_rate,
    ROUND(COALESCE(AVG(r.progress_percent), 0)::NUMERIC, 2) AS avg_progress,
    COALESCE(SUM(r.captures_made), 0)::INTEGER AS total_captures,
    COALESCE(SUM(r.times_captured), 0)::INTEGER AS total_times_captured,
    COALESCE(SUM(r.penalties), 0)::INTEGER AS total_penalties,
    MAX(m.ended_at) AS last_played_at,
    p.created_at AS member_since
FROM game4.players p
LEFT JOIN game4.results r ON p.id = r.player_id
LEFT JOIN game4.matches m ON r.match_id = m.id
GROUP BY p.id, p.display_name, p.created_at
HAVING COUNT(r.id) > 0
ORDER BY wins DESC, total_captures DESC, win_rate DESC;

-- 5. Row Level Security (RLS) Configuration
ALTER TABLE game4.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game4.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE game4.results ENABLE ROW LEVEL SECURITY;

-- Note: We intentionally do NOT create direct read/write policies for anon or authenticated
-- on players, matches, or results. Clients CANNOT read or write base tables directly.
-- All writes are handled strictly server-side by the Node backend with service_role.

-- 6. Permissions
-- Only server (service_role) gets full read/write access to base tables
GRANT ALL ON ALL TABLES IN SCHEMA game4 TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA game4 TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA game4 GRANT ALL ON TABLES TO service_role;

-- Public (anon & authenticated) gets SELECT ONLY on the aggregated leaderboard view
GRANT SELECT ON game4.leaderboard TO anon, authenticated;
