/**
 * Local slip database — SQLite via better-sqlite3.
 *
 * Stored at: data/local/slips.db
 * NEVER committed to git (data/local/ is in .gitignore).
 *
 * Purpose:
 *  - Log every AFL kitchen slip generated on the local server
 *  - Track outcome (did each leg hit? did the full slip hit?)
 *  - Feed data back into analytics to improve the picker over time
 *
 * Schema:
 *   games        — one row per AFL game that had a kitchen generated
 *   slips        — one row per slip type (safe, doable, etc.) per game
 *   legs         — one row per leg within each slip
 *   outcomes     — one row per game, written after result is known
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ─── DB path ──────────────────────────────────────────────────────────────────

const DB_DIR  = path.join(process.cwd(), "data", "local");
const DB_PATH = path.join(DB_DIR, "slips.db");

// ─── Singleton connection ─────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  return _db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id            TEXT PRIMARY KEY,   -- ESPN game ID e.g. "afl-1133570"
      home_team     TEXT NOT NULL,
      away_team     TEXT NOT NULL,
      venue         TEXT,
      game_date     TEXT,               -- ISO date string
      round         TEXT,
      season        INTEGER,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS slips (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id       TEXT NOT NULL REFERENCES games(id),
      slip_type     TEXT NOT NULL,      -- safe | doable | goalscorers | disposals | ballsy | value
      bookie        TEXT DEFAULT 'generic', -- generic | bet365 | dabble
      leg_count     INTEGER NOT NULL,
      combined_odds REAL,               -- product of all leg odds (if available)
      hit_count     INTEGER,            -- filled after outcome check
      all_hit       INTEGER,            -- 0 or 1, filled after outcome check
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS legs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      slip_id         INTEGER NOT NULL REFERENCES slips(id),
      game_id         TEXT NOT NULL,
      player          TEXT NOT NULL,
      team_abbr       TEXT NOT NULL,
      side            TEXT NOT NULL,    -- home | away
      stat            TEXT NOT NULL,    -- D | G | M | T | HO
      stat_label      TEXT NOT NULL,    -- disposals | goals | marks | tackles | hitouts
      threshold       REAL NOT NULL,    -- recommended line
      avg_stat        REAL NOT NULL,    -- player's season average for this stat
      hit_rate        REAL NOT NULL,    -- historical hit rate at this threshold
      reliability     REAL NOT NULL,    -- 0-1 reliability score
      is_on_form      INTEGER NOT NULL, -- 0 or 1
      is_bounce_back  INTEGER NOT NULL, -- 0 or 1
      games_analyzed  INTEGER NOT NULL,
      prop_price      REAL,             -- bookmaker odds (if available)
      prop_line       REAL,             -- bookmaker line (if available)
      prop_bookmaker  TEXT,
      edge            REAL,             -- avg - line (value picks only)
      -- Outcome fields (filled after game finishes)
      actual_stat     REAL,             -- player's actual final stat
      hit             INTEGER,          -- 0 or 1
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_legs_game   ON legs(game_id);
    CREATE INDEX IF NOT EXISTS idx_legs_player ON legs(player, stat);
    CREATE INDEX IF NOT EXISTS idx_slips_game  ON slips(game_id);
    CREATE INDEX IF NOT EXISTS idx_slips_type  ON slips(slip_type, bookie);
  `);
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SlipLogGame {
  id:        string;
  homeTeam:  string;
  awayTeam:  string;
  venue?:    string;
  gameDate?: string;
  round?:    string;
  season?:   number;
}

export interface SlipLogLeg {
  player:       string;
  teamAbbr:     string;
  side:         "home" | "away";
  stat:         string;
  statLabel:    string;
  threshold:    number;
  avgStat:      number;
  hitRate:      number;
  reliability:  number;
  isOnForm:     boolean;
  isBounceBack: boolean;
  gamesAnalyzed: number;
  prop?: { price: number; line: number; bookmaker: string };
  edge?: number;
}

export interface SlipLogSlip {
  slipType:     string;
  bookie:       string;
  legs:         SlipLogLeg[];
  combinedOdds?: number;
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Log a full kitchen for a game.
 * Safe to call multiple times — uses INSERT OR IGNORE for the game row
 * and replaces existing slips for the same game+type+bookie.
 */
export function logSlips(game: SlipLogGame, slips: SlipLogSlip[]): void {
  try {
    const db = getDb();

    // Upsert game
    db.prepare(`
      INSERT OR IGNORE INTO games (id, home_team, away_team, venue, game_date, round, season)
      VALUES (@id, @homeTeam, @awayTeam, @venue, @gameDate, @round, @season)
    `).run({
      id:       game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      venue:    game.venue ?? null,
      gameDate: game.gameDate ?? null,
      round:    game.round ?? null,
      season:   game.season ?? null,
    });

    const insertSlip = db.prepare(`
      INSERT INTO slips (game_id, slip_type, bookie, leg_count, combined_odds)
      VALUES (@gameId, @slipType, @bookie, @legCount, @combinedOdds)
    `);

    const insertLeg = db.prepare(`
      INSERT INTO legs (
        slip_id, game_id, player, team_abbr, side, stat, stat_label,
        threshold, avg_stat, hit_rate, reliability,
        is_on_form, is_bounce_back, games_analyzed,
        prop_price, prop_line, prop_bookmaker, edge
      ) VALUES (
        @slipId, @gameId, @player, @teamAbbr, @side, @stat, @statLabel,
        @threshold, @avgStat, @hitRate, @reliability,
        @isOnForm, @isBounceBack, @gamesAnalyzed,
        @propPrice, @propLine, @propBookmaker, @edge
      )
    `);

    const transaction = db.transaction(() => {
      for (const slip of slips) {
        if (slip.legs.length === 0) continue;

        // Compute combined odds from legs that have props
        let combinedOdds: number | null = null;
        const priced = slip.legs.filter(l => l.prop?.price);
        if (priced.length > 0) {
          combinedOdds = priced.reduce((acc, l) => acc * (l.prop!.price), 1);
          combinedOdds = Math.round(combinedOdds * 100) / 100;
        }

        const slipRow = insertSlip.run({
          gameId:       game.id,
          slipType:     slip.slipType,
          bookie:       slip.bookie,
          legCount:     slip.legs.length,
          combinedOdds: combinedOdds ?? slip.combinedOdds ?? null,
        });

        const slipId = slipRow.lastInsertRowid;

        for (const leg of slip.legs) {
          insertLeg.run({
            slipId,
            gameId:        game.id,
            player:        leg.player,
            teamAbbr:      leg.teamAbbr,
            side:          leg.side,
            stat:          leg.stat,
            statLabel:     leg.statLabel,
            threshold:     leg.threshold,
            avgStat:       leg.avgStat,
            hitRate:       leg.hitRate,
            reliability:   leg.reliability,
            isOnForm:      leg.isOnForm ? 1 : 0,
            isBounceBack:  leg.isBounceBack ? 1 : 0,
            gamesAnalyzed: leg.gamesAnalyzed,
            propPrice:     leg.prop?.price ?? null,
            propLine:      leg.prop?.line  ?? null,
            propBookmaker: leg.prop?.bookmaker ?? null,
            edge:          leg.edge ?? null,
          });
        }
      }
    });

    transaction();
  } catch (err) {
    // Never let logging crash the app
    console.error("[slipDb] logSlips error:", err);
  }
}

// ─── Outcome resolution ───────────────────────────────────────────────────────

/**
 * Final boxscore stat line for one player.
 * Sent from the client after a game finishes.
 * `hit` is NOT included — computed server-side against stored threshold.
 */
export interface PlayerStatLine {
  player: string;  // displayName from ESPN boxscore
  D:  number;      // disposals (direct ESPN column, not K+H)
  G:  number;      // goals
  M:  number;      // marks
  T:  number;      // tackles
  HO: number;      // hitouts
}

// ── Fuzzy name normalisation (mirrors slipTracker.ts findRow) ─────────────────

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Find a PlayerStatLine whose name fuzzy-matches `target`.
 * Uses exact normalised match first, then last-name suffix (≥5 chars).
 */
function findPlayerLine(
  target: string,
  lines:  PlayerStatLine[],
): PlayerStatLine | undefined {
  const norm = normName(target);

  // 1. Exact normalised match
  const exact = lines.find(l => normName(l.player) === norm);
  if (exact) return exact;

  // 2. Last-name suffix match (≥5 chars)
  const suffix = norm.slice(-7);
  if (suffix.length >= 5) {
    return lines.find(l => normName(l.player).endsWith(suffix));
  }

  return undefined;
}

/**
 * Update leg outcomes for a finished game.
 *
 * - Fetches all unresolved legs from the DB for this game
 * - Fuzzy-matches each leg's player name against the boxscore lines
 * - Computes hit = actualStat >= threshold SERVER-SIDE
 * - Updates legs and rolls up slip hit counts
 *
 * Safe to call multiple times (only updates legs where hit IS NULL).
 */
export function resolveOutcomes(gameId: string, statLines: PlayerStatLine[]): void {
  try {
    const db = getDb();

    // Fetch all unresolved legs for this game
    type LegRow = {
      id:        number;
      slip_id:   number;
      player:    string;
      stat:      string;
      threshold: number;
    };
    const unresolved = db.prepare(`
      SELECT id, slip_id, player, stat, threshold
      FROM legs
      WHERE game_id = ? AND hit IS NULL
    `).all(gameId) as LegRow[];

    if (unresolved.length === 0) return;

    const updateLeg = db.prepare(`
      UPDATE legs
      SET actual_stat = @actualStat, hit = @hit
      WHERE id = @id
    `);

    const transaction = db.transaction(() => {
      for (const leg of unresolved) {
        const line = findPlayerLine(leg.player, statLines);
        if (!line) continue;  // player not in boxscore (did not play)

        const actualStat = line[leg.stat as keyof PlayerStatLine] as number ?? 0;
        const hit        = actualStat >= leg.threshold ? 1 : 0;

        updateLeg.run({ id: leg.id, actualStat, hit });
      }

      // Roll up hit_count and all_hit on each slip
      const slips = db.prepare(
        `SELECT id, leg_count FROM slips WHERE game_id = ?`
      ).all(gameId) as { id: number; leg_count: number }[];

      const countHits  = db.prepare(`SELECT COUNT(*) as n FROM legs WHERE slip_id = ? AND hit = 1`);
      const countResolved = db.prepare(`SELECT COUNT(*) as n FROM legs WHERE slip_id = ? AND hit IS NOT NULL`);
      const updateSlip = db.prepare(`
        UPDATE slips SET hit_count = @hitCount, all_hit = @allHit WHERE id = @slipId
      `);

      for (const slip of slips) {
        const resolved = (countResolved.get(slip.id) as { n: number }).n;
        if (resolved === 0) continue;  // none resolved for this slip yet
        const hits = (countHits.get(slip.id) as { n: number }).n;
        updateSlip.run({
          slipId:   slip.id,
          hitCount: hits,
          allHit:   hits >= slip.leg_count ? 1 : 0,
        });
      }
    });

    transaction();
    console.info(`[slipDb] resolved outcomes for ${gameId}: ${unresolved.length} legs processed`);
  } catch (err) {
    console.error("[slipDb] resolveOutcomes error:", err);
  }
}

/**
 * Reset outcomes for a game — sets hit = NULL so resolveOutcomes can re-run.
 * Use this to clear incorrect data from the bug where hit was hardcoded false.
 */
export function resetOutcomes(gameId: string): void {
  try {
    const db = getDb();
    db.prepare(`UPDATE legs  SET actual_stat = NULL, hit = NULL WHERE game_id = ?`).run(gameId);
    db.prepare(`UPDATE slips SET hit_count   = NULL, all_hit = NULL WHERE game_id = ?`).run(gameId);
    console.info(`[slipDb] reset outcomes for ${gameId}`);
  } catch (err) {
    console.error("[slipDb] resetOutcomes error:", err);
  }
}

/** Reset ALL outcomes — nuclear option to clear all bad data from the old bug. */
export function resetAllOutcomes(): void {
  try {
    const db = getDb();
    db.prepare(`UPDATE legs  SET actual_stat = NULL, hit = NULL`).run();
    db.prepare(`UPDATE slips SET hit_count   = NULL, all_hit = NULL`).run();
    console.info(`[slipDb] reset ALL outcomes`);
  } catch (err) {
    console.error("[slipDb] resetAllOutcomes error:", err);
  }
}

// ─── Analytics queries ────────────────────────────────────────────────────────

export interface SlipHitStats {
  slipType:    string;
  bookie:      string;
  totalSlips:  number;
  resolvedSlips: number;
  fullHits:    number;
  partialHits: number;
  busts:       number;
  hitRate:     number | null;
  avgLegCount: number;
}

/** Per-slip-type breakdown with full/partial/bust counts. */
export function getSlipHitStats(): SlipHitStats[] {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT
        slip_type    AS slipType,
        bookie,
        COUNT(*)     AS totalSlips,
        SUM(CASE WHEN all_hit IS NOT NULL THEN 1 ELSE 0 END)           AS resolvedSlips,
        SUM(CASE WHEN all_hit = 1 THEN 1 ELSE 0 END)                   AS fullHits,
        SUM(CASE WHEN all_hit = 0 AND hit_count > 0 THEN 1 ELSE 0 END) AS partialHits,
        SUM(CASE WHEN all_hit = 0 AND (hit_count = 0 OR hit_count IS NULL) AND all_hit IS NOT NULL THEN 1 ELSE 0 END) AS busts,
        CASE WHEN SUM(CASE WHEN all_hit IS NOT NULL THEN 1 ELSE 0 END) > 0
          THEN ROUND(
            CAST(SUM(CASE WHEN all_hit = 1 THEN 1 ELSE 0 END) AS REAL)
            / SUM(CASE WHEN all_hit IS NOT NULL THEN 1 ELSE 0 END), 3)
          ELSE NULL
        END          AS hitRate,
        ROUND(AVG(leg_count), 1) AS avgLegCount
      FROM slips
      GROUP BY slip_type, bookie
      ORDER BY slip_type, bookie
    `).all() as SlipHitStats[];
  } catch {
    return [];
  }
}

export interface OverallStats {
  totalGames:    number;
  resolvedGames: number;
  totalSlips:    number;
  totalLegs:     number;
  resolvedLegs:  number;
  legHitRate:    number | null;
  slipHitRate:   number | null;
}

/** Top-level summary numbers for the dashboard header. */
export function getOverallStats(): OverallStats {
  try {
    const db = getDb();
    const games  = db.prepare(`SELECT COUNT(*) as n FROM games`).get() as { n: number };
    const resolved = db.prepare(
      `SELECT COUNT(DISTINCT game_id) as n FROM legs WHERE actual_stat > 0 AND hit IS NOT NULL`
    ).get() as { n: number };
    const slips  = db.prepare(`SELECT COUNT(*) as n FROM slips`).get() as { n: number };
    const legs   = db.prepare(`SELECT COUNT(*) as n FROM legs`).get() as { n: number };
    const legRes = db.prepare(`SELECT COUNT(*) as n FROM legs WHERE hit IS NOT NULL AND actual_stat > 0`).get() as { n: number };
    const legHit = db.prepare(`SELECT COUNT(*) as n FROM legs WHERE hit = 1`).get() as { n: number };
    const slipHit = db.prepare(`
      SELECT
        CASE WHEN SUM(CASE WHEN all_hit IS NOT NULL THEN 1 ELSE 0 END) > 0
          THEN ROUND(CAST(SUM(all_hit) AS REAL) / SUM(CASE WHEN all_hit IS NOT NULL THEN 1 ELSE 0 END), 3)
          ELSE NULL END AS rate
      FROM slips
    `).get() as { rate: number | null };

    return {
      totalGames:    games.n,
      resolvedGames: resolved.n,
      totalSlips:    slips.n,
      totalLegs:     legs.n,
      resolvedLegs:  legRes.n,
      legHitRate:    legRes.n > 0 ? Math.round((legHit.n / legRes.n) * 1000) / 1000 : null,
      slipHitRate:   slipHit.rate,
    };
  } catch {
    return { totalGames: 0, resolvedGames: 0, totalSlips: 0, totalLegs: 0, resolvedLegs: 0, legHitRate: null, slipHitRate: null };
  }
}

export interface ReliabilityBandStats {
  band:         string;
  minRel:       number;
  maxRel:       number;
  legs:         number;
  hits:         number;
  actualHitRate: number | null;
  predictedMid: number;  // midpoint of the band — what the model "said"
}

/**
 * Model calibration: compare predicted reliability vs actual hit rate.
 * Reveals whether the reliability engine is over/underconfident.
 */
export function getReliabilityCalibration(): ReliabilityBandStats[] {
  try {
    const db = getDb();
    const bands = [
      { band: "Elite",    min: 0.85, max: 1.01, mid: 0.92 },
      { band: "High",     min: 0.70, max: 0.85, mid: 0.77 },
      { band: "Strong",   min: 0.55, max: 0.70, mid: 0.62 },
      { band: "Risky",    min: 0.38, max: 0.55, mid: 0.46 },
      { band: "Longshot", min: 0.00, max: 0.38, mid: 0.19 },
    ];

    return bands.map(b => {
      const row = db.prepare(`
        SELECT
          COUNT(*) as legs,
          SUM(CASE WHEN hit = 1 THEN 1 ELSE 0 END) as hits
        FROM legs
        WHERE reliability >= @min AND reliability < @max
          AND hit IS NOT NULL AND actual_stat > 0
      `).get({ min: b.min, max: b.max }) as { legs: number; hits: number };

      return {
        band:          b.band,
        minRel:        b.min,
        maxRel:        b.max,
        legs:          row.legs,
        hits:          row.hits,
        predictedMid:  b.mid,
        actualHitRate: row.legs > 0 ? Math.round((row.hits / row.legs) * 1000) / 1000 : null,
      };
    });
  } catch {
    return [];
  }
}

export interface PlayerLegStats {
  player:      string;
  stat:        string;
  statLabel:   string;
  legs:        number;
  hits:        number;
  hitRate:     number | null;
  avgThreshold: number;
  avgActual:   number;
  avgReliability: number;
  drift:       number | null;  // actualHitRate - avgReliability (negative = model overconfident)
}

/** Per-player, per-stat accuracy. Minimum 2 resolved legs. */
export function getPlayerStatHitRate(): PlayerLegStats[] {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT
        player,
        stat,
        stat_label      AS statLabel,
        COUNT(*)        AS legs,
        SUM(CASE WHEN hit = 1 THEN 1 ELSE 0 END) AS hits,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(CAST(SUM(hit) AS REAL) / COUNT(*), 3)
          ELSE NULL END AS hitRate,
        ROUND(AVG(threshold), 1)    AS avgThreshold,
        ROUND(AVG(actual_stat), 1)  AS avgActual,
        ROUND(AVG(reliability), 3)  AS avgReliability,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(CAST(SUM(hit) AS REAL) / COUNT(*) - AVG(reliability), 3)
          ELSE NULL END AS drift
      FROM legs
      WHERE hit IS NOT NULL AND actual_stat > 0
      GROUP BY player, stat
      HAVING COUNT(*) >= 2
      ORDER BY drift ASC  -- worst model errors first (most overconfident)
    `).all() as PlayerLegStats[];
  } catch {
    return [];
  }
}

export interface RecentGameSummary {
  gameId:        string;
  homeTeam:      string;
  awayTeam:      string;
  gameDate:      string | null;
  venue:         string | null;
  totalSlips:    number;
  resolvedSlips: number;
  fullHits:      number;
  totalLegs:     number;
  hitLegs:       number;
}

/** Last N games with outcome summary. */
export function getRecentGames(limit = 15): RecentGameSummary[] {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT
        g.id         AS gameId,
        g.home_team  AS homeTeam,
        g.away_team  AS awayTeam,
        g.game_date  AS gameDate,
        g.venue,
        COUNT(DISTINCT s.id)                                              AS totalSlips,
        COUNT(DISTINCT CASE WHEN s.all_hit IS NOT NULL THEN s.id END)    AS resolvedSlips,
        COUNT(DISTINCT CASE WHEN s.all_hit = 1 THEN s.id END)           AS fullHits,
        COUNT(l.id)                                                       AS totalLegs,
        SUM(CASE WHEN l.hit = 1 THEN 1 ELSE 0 END)                      AS hitLegs
      FROM games g
      LEFT JOIN slips s ON s.game_id = g.id
      LEFT JOIN legs l  ON l.slip_id = s.id
      GROUP BY g.id
      ORDER BY g.game_date DESC, g.created_at DESC
      LIMIT ?
    `).all(limit) as RecentGameSummary[];
  } catch {
    return [];
  }
}

/**
 * Check if outcomes have already been correctly resolved for a game.
 *
 * Considers outcomes "resolved" only if at least one leg has actual_stat > 0
 * (guards against the old bug where everything was written as 0/false).
 */
export function hasOutcomes(gameId: string): boolean {
  try {
    const db = getDb();
    const row = db.prepare(
      `SELECT COUNT(*) as n FROM legs WHERE game_id = ? AND hit IS NOT NULL AND actual_stat > 0`
    ).get(gameId) as { n: number };
    return row.n > 0;
  } catch {
    return false;
  }
}

/** Check if a game has any logged slips. */
export function hasSlips(gameId: string): boolean {
  try {
    const db = getDb();
    const row = db.prepare(
      `SELECT COUNT(*) as n FROM slips WHERE game_id = ?`
    ).get(gameId) as { n: number };
    return row.n > 0;
  } catch {
    return false;
  }
}
