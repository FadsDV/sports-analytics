/**
 * Slip database — Vercel Blob (replaces better-sqlite3 which doesn't work on Vercel).
 *
 * Each game is stored as `slip-analytics/{gameId}.json`.
 * Analytics queries fetch all blobs and aggregate in memory.
 *
 * Falls back silently when BLOB_READ_WRITE_TOKEN is not set (local dev without Blob).
 *
 * Note: uses `slip-analytics/` prefix (not `slips/`) to avoid colliding with
 * the kitchen freeze cache in lib/slipCache.ts which uses `slips/`.
 */

const BLOB_PREFIX = "slip-analytics/";

function blobAvailable(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// ─── Stored data shapes ───────────────────────────────────────────────────────

interface StoredLeg {
  id:            number;
  player:        string;
  teamAbbr:      string;
  side:          "home" | "away";
  stat:          string;
  statLabel:     string;
  threshold:     number;
  avgStat:       number;
  hitRate:       number;
  reliability:   number;
  isOnForm:      number;
  isBounceBack:  number;
  gamesAnalyzed: number;
  signalTotal?:  number;
  propPrice?:    number;
  propLine?:     number;
  propBookmaker?: string;
  edge?:         number;
  actualStat?:   number;
  hit?:          number; // 0 | 1 | undefined (undefined = unresolved)
}

interface StoredSlip {
  id:           number;
  slipType:     string;
  bookie:       string;
  legCount:     number;
  combinedOdds?: number;
  hitCount?:    number;
  allHit?:      number;
  legs:         StoredLeg[];
}

interface StoredGame {
  id:        string;
  homeTeam:  string;
  awayTeam:  string;
  venue?:    string;
  gameDate?: string;
  round?:    string;
  season?:   number;
  sport:     string;
  createdAt: string;
  slips:     StoredSlip[];
}

// ─── Blob helpers ─────────────────────────────────────────────────────────────

/** Fetch a blob's content using the SDK token (works for both public and private). */
async function fetchBlobContent(url: string): Promise<StoredGame | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const res = await fetch(url, {
    cache:   "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return await res.json() as StoredGame;
}

async function readGame(gameId: string): Promise<StoredGame | null> {
  if (!blobAvailable()) return null;
  try {
    const { list } = await import("@vercel/blob");
    const token = process.env.BLOB_READ_WRITE_TOKEN!;
    const { blobs } = await list({ prefix: `${BLOB_PREFIX}${gameId}.json`, limit: 1, token });
    if (!blobs.length) return null;
    return await fetchBlobContent(blobs[0].downloadUrl ?? blobs[0].url);
  } catch {
    return null;
  }
}

async function writeGame(game: StoredGame): Promise<void> {
  if (!blobAvailable()) return;
  const { put } = await import("@vercel/blob");
  const token = process.env.BLOB_READ_WRITE_TOKEN!;
  await put(`${BLOB_PREFIX}${game.id}.json`, JSON.stringify(game), {
    access:          "public",
    addRandomSuffix: false,
    allowOverwrite:  true,
    contentType:     "application/json",
    token,
  });
}

async function readAllGames(): Promise<StoredGame[]> {
  if (!blobAvailable()) return [];
  try {
    const { list } = await import("@vercel/blob");
    const token = process.env.BLOB_READ_WRITE_TOKEN!;
    const { blobs } = await list({ prefix: BLOB_PREFIX, token });
    if (!blobs.length) return [];
    const results = await Promise.all(
      blobs.map(async b => {
        try {
          return await fetchBlobContent(b.downloadUrl ?? b.url);
        } catch {
          return null;
        }
      })
    );
    return results.filter((g): g is StoredGame => g !== null);
  } catch {
    return [];
  }
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
  sport?:    string;
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
  signalTotal?: number;
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

export async function logSlips(game: SlipLogGame, slips: SlipLogSlip[]): Promise<void> {
  try {
    // Guard: don't log if slips already exist for this game
    const existing = await readGame(game.id);
    if (existing && existing.slips.length > 0) return;

    let slipId = 0;
    let legId  = 0;

    const storedSlips: StoredSlip[] = slips
      .filter(s => s.legs.length > 0)
      .map(s => {
        let combinedOdds: number | undefined;
        const priced = s.legs.filter(l => l.prop?.price);
        if (priced.length > 0) {
          combinedOdds = Math.round(priced.reduce((acc, l) => acc * l.prop!.price, 1) * 100) / 100;
        }

        return {
          id:           ++slipId,
          slipType:     s.slipType,
          bookie:       s.bookie,
          legCount:     s.legs.length,
          combinedOdds: combinedOdds ?? s.combinedOdds,
          legs: s.legs.map(l => ({
            id:            ++legId,
            player:        l.player,
            teamAbbr:      l.teamAbbr,
            side:          l.side,
            stat:          l.stat,
            statLabel:     l.statLabel,
            threshold:     l.threshold,
            avgStat:       l.avgStat,
            hitRate:       l.hitRate,
            reliability:   l.reliability,
            isOnForm:      l.isOnForm ? 1 : 0,
            isBounceBack:  l.isBounceBack ? 1 : 0,
            gamesAnalyzed: l.gamesAnalyzed,
            signalTotal:   l.signalTotal,
            propPrice:     l.prop?.price,
            propLine:      l.prop?.line,
            propBookmaker: l.prop?.bookmaker,
            edge:          l.edge,
          })),
        };
      });

    if (storedSlips.length === 0) return;

    const stored: StoredGame = {
      id:        game.id,
      homeTeam:  game.homeTeam,
      awayTeam:  game.awayTeam,
      venue:     game.venue,
      gameDate:  game.gameDate,
      round:     game.round,
      season:    game.season,
      sport:     game.sport ?? "afl",
      createdAt: new Date().toISOString(),
      slips:     storedSlips,
    };

    await writeGame(stored);
  } catch (err) {
    const msg = err instanceof Error
      ? `${err.constructor.name}: ${err.message}`
      : String(err);
    console.error("[slipDb] logSlips error:", msg);
  }
}

// ─── Outcome resolution ───────────────────────────────────────────────────────

export interface PlayerStatLine {
  player: string;
  D:  number;
  G:  number;
  M:  number;
  T:  number;
  HO: number;
  K:  number;
  H:  number;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function findPlayerLine(target: string, lines: PlayerStatLine[]): PlayerStatLine | undefined {
  const norm = normName(target);
  const exact = lines.find(l => normName(l.player) === norm);
  if (exact) return exact;
  const suffix = norm.slice(-7);
  if (suffix.length >= 5) return lines.find(l => normName(l.player).endsWith(suffix));
  return undefined;
}

function rollUpSlip(slip: StoredSlip): StoredSlip {
  const resolved = slip.legs.filter(l => l.hit !== undefined);
  if (resolved.length === 0) return slip;
  const hits = resolved.filter(l => l.hit === 1).length;
  return {
    ...slip,
    hitCount: hits,
    allHit:   hits >= slip.legCount ? 1 : 0,
  };
}

export async function resolveOutcomes(gameId: string, statLines: PlayerStatLine[]): Promise<void> {
  try {
    const game = await readGame(gameId);
    if (!game) return;

    let changed = false;
    const updatedSlips = game.slips.map(slip => {
      const updatedLegs = slip.legs.map(leg => {
        if (leg.hit !== undefined) return leg; // already resolved
        const line = findPlayerLine(leg.player, statLines);
        if (!line) return leg;
        const actualStat = line[leg.stat as keyof PlayerStatLine] as number ?? 0;
        changed = true;
        return { ...leg, actualStat, hit: actualStat >= leg.threshold ? 1 : 0 };
      });
      return rollUpSlip({ ...slip, legs: updatedLegs });
    });

    if (!changed) return;
    await writeGame({ ...game, slips: updatedSlips });
    console.info(`[slipDb] resolved outcomes for ${gameId}`);
  } catch (err) {
    console.error("[slipDb] resolveOutcomes error:", err);
  }
}

// ─── Soccer outcome resolution ────────────────────────────────────────────────

export interface SoccerStatLine {
  player:        string;
  playerId:      number;
  goals:         number;
  assists:       number;
  shots:         number;
  shotsOnTarget: number;
  yellowCards:   number;
}

function getSoccerStatValue(line: SoccerStatLine, stat: string): number {
  switch (stat) {
    case "goals":         return line.goals;
    case "assists":       return line.assists;
    case "scoreOrAssist": return line.goals + line.assists;
    case "shots":         return line.shots;
    case "shotsOnTarget": return line.shotsOnTarget;
    case "yellowCards":   return line.yellowCards;
    default:              return 0;
  }
}

export async function resolveSoccerOutcomes(gameId: string, statLines: SoccerStatLine[]): Promise<void> {
  try {
    const game = await readGame(gameId);
    if (!game) return;

    const byName: Record<string, SoccerStatLine> = {};
    for (const line of statLines) byName[normName(line.player)] = line;

    const findSoccerLine = (target: string): SoccerStatLine | undefined => {
      const norm = normName(target);
      if (byName[norm]) return byName[norm];
      const suffix = norm.slice(-7);
      if (suffix.length >= 5) {
        for (const key of Object.keys(byName)) {
          if (key.endsWith(suffix)) return byName[key];
        }
      }
      return undefined;
    };

    let changed = false;
    const updatedSlips = game.slips.map(slip => {
      const updatedLegs = slip.legs.map(leg => {
        if (leg.hit !== undefined) return leg;
        const line = findSoccerLine(leg.player);
        if (!line) return leg;
        const actualStat = getSoccerStatValue(line, leg.stat);
        changed = true;
        return { ...leg, actualStat, hit: actualStat >= leg.threshold ? 1 : 0 };
      });
      return rollUpSlip({ ...slip, legs: updatedLegs });
    });

    if (!changed) return;
    await writeGame({ ...game, slips: updatedSlips });
    console.info(`[slipDb] resolveSoccerOutcomes ${gameId}`);
  } catch (err) {
    console.error("[slipDb] resolveSoccerOutcomes error:", err);
  }
}

export async function resetOutcomes(gameId: string): Promise<void> {
  try {
    const game = await readGame(gameId);
    if (!game) return;
    const updatedSlips = game.slips.map(slip => ({
      ...slip,
      hitCount: undefined,
      allHit:   undefined,
      legs: slip.legs.map(leg => ({ ...leg, actualStat: undefined, hit: undefined })),
    }));
    await writeGame({ ...game, slips: updatedSlips });
    console.info(`[slipDb] reset outcomes for ${gameId}`);
  } catch (err) {
    console.error("[slipDb] resetOutcomes error:", err);
  }
}

export async function resetAllOutcomes(): Promise<void> {
  try {
    const games = await readAllGames();
    await Promise.all(games.map(game => {
      const updatedSlips = game.slips.map(slip => ({
        ...slip,
        hitCount: undefined,
        allHit:   undefined,
        legs: slip.legs.map(leg => ({ ...leg, actualStat: undefined, hit: undefined })),
      }));
      return writeGame({ ...game, slips: updatedSlips });
    }));
    console.info(`[slipDb] reset ALL outcomes`);
  } catch (err) {
    console.error("[slipDb] resetAllOutcomes error:", err);
  }
}

export async function hasOutcomes(gameId: string): Promise<boolean> {
  try {
    const game = await readGame(gameId);
    if (!game || !game.slips.length) return false;
    const allLegs = game.slips.flatMap(s => s.legs);
    if (allLegs.length === 0) return false;
    return allLegs.every(l => l.hit !== undefined);
  } catch {
    return false;
  }
}

export async function hasSlips(gameId: string): Promise<boolean> {
  try {
    const game = await readGame(gameId);
    return (game?.slips.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Analytics queries ────────────────────────────────────────────────────────

export interface SlipHitStats {
  slipType:     string;
  bookie:       string;
  totalSlips:   number;
  resolvedSlips: number;
  fullHits:     number;
  partialHits:  number;
  busts:        number;
  hitRate:      number | null;
  avgLegCount:  number;
}

export async function getSlipHitStats(sport?: string): Promise<SlipHitStats[]> {
  try {
    const games = await readAllGames();
    const filtered = sport ? games.filter(g => g.sport === sport) : games;
    const buckets = new Map<string, {
      totalSlips: number; resolvedSlips: number; fullHits: number;
      partialHits: number; busts: number; legCountSum: number;
    }>();

    for (const game of filtered) {
      for (const slip of game.slips) {
        const key = `${slip.slipType}|${slip.bookie}`;
        const b = buckets.get(key) ?? { totalSlips: 0, resolvedSlips: 0, fullHits: 0, partialHits: 0, busts: 0, legCountSum: 0 };
        b.totalSlips++;
        b.legCountSum += slip.legCount;
        if (slip.allHit !== undefined) {
          b.resolvedSlips++;
          if (slip.allHit === 1) b.fullHits++;
          else if ((slip.hitCount ?? 0) > 0) b.partialHits++;
          else b.busts++;
        }
        buckets.set(key, b);
      }
    }

    return Array.from(buckets.entries())
      .map(([key, b]) => {
        const [slipType, bookie] = key.split("|");
        return {
          slipType: slipType!,
          bookie:   bookie!,
          totalSlips:   b.totalSlips,
          resolvedSlips: b.resolvedSlips,
          fullHits:    b.fullHits,
          partialHits: b.partialHits,
          busts:       b.busts,
          hitRate:     b.resolvedSlips > 0 ? Math.round((b.fullHits / b.resolvedSlips) * 1000) / 1000 : null,
          avgLegCount: b.totalSlips > 0 ? Math.round((b.legCountSum / b.totalSlips) * 10) / 10 : 0,
        };
      })
      .sort((a, b) => a.slipType.localeCompare(b.slipType) || a.bookie.localeCompare(b.bookie));
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

export async function getOverallStats(sport?: string): Promise<OverallStats> {
  try {
    const games = await readAllGames();
    const filtered = sport ? games.filter(g => g.sport === sport) : games;

    let totalSlips = 0, totalLegs = 0, resolvedLegs = 0, hitLegs = 0;
    let resolvedSlips = 0, hitSlips = 0;
    let resolvedGames = 0;

    for (const game of filtered) {
      let gameHasResolved = false;
      for (const slip of game.slips) {
        totalSlips++;
        if (slip.allHit !== undefined) resolvedSlips++;
        if (slip.allHit === 1) hitSlips++;
        for (const leg of slip.legs) {
          totalLegs++;
          if (leg.hit !== undefined) { resolvedLegs++; gameHasResolved = true; }
          if (leg.hit === 1) hitLegs++;
        }
      }
      if (gameHasResolved) resolvedGames++;
    }

    return {
      totalGames:    filtered.length,
      resolvedGames,
      totalSlips,
      totalLegs,
      resolvedLegs,
      legHitRate:    resolvedLegs > 0 ? Math.round((hitLegs / resolvedLegs) * 1000) / 1000 : null,
      slipHitRate:   resolvedSlips > 0 ? Math.round((hitSlips / resolvedSlips) * 1000) / 1000 : null,
    };
  } catch {
    return { totalGames: 0, resolvedGames: 0, totalSlips: 0, totalLegs: 0, resolvedLegs: 0, legHitRate: null, slipHitRate: null };
  }
}

export interface ReliabilityBandStats {
  band:          string;
  minRel:        number;
  maxRel:        number;
  legs:          number;
  hits:          number;
  actualHitRate: number | null;
  predictedMid:  number;
}

export async function getReliabilityCalibration(sport?: string): Promise<ReliabilityBandStats[]> {
  try {
    const games = await readAllGames();
    const filtered = sport ? games.filter(g => g.sport === sport) : games;

    const bands = [
      { band: "Elite",    min: 0.85, max: 1.01, mid: 0.92 },
      { band: "High",     min: 0.70, max: 0.85, mid: 0.77 },
      { band: "Strong",   min: 0.55, max: 0.70, mid: 0.62 },
      { band: "Risky",    min: 0.38, max: 0.55, mid: 0.46 },
      { band: "Longshot", min: 0.00, max: 0.38, mid: 0.19 },
    ];

    return bands.map(b => {
      let legs = 0, hits = 0;
      for (const game of filtered) {
        for (const slip of game.slips) {
          for (const leg of slip.legs) {
            if (leg.hit === undefined) continue;
            if (leg.reliability >= b.min && leg.reliability < b.max) {
              legs++;
              if (leg.hit === 1) hits++;
            }
          }
        }
      }
      return {
        band: b.band, minRel: b.min, maxRel: b.max, legs, hits,
        predictedMid:  b.mid,
        actualHitRate: legs > 0 ? Math.round((hits / legs) * 1000) / 1000 : null,
      };
    });
  } catch {
    return [];
  }
}

export interface PlayerLegStats {
  player:         string;
  stat:           string;
  statLabel:      string;
  legs:           number;
  hits:           number;
  hitRate:        number | null;
  avgThreshold:   number;
  avgActual:      number;
  avgReliability: number;
  drift:          number | null;
}

export async function getPlayerStatHitRate(sport?: string): Promise<PlayerLegStats[]> {
  try {
    const games = await readAllGames();
    const filtered = sport ? games.filter(g => g.sport === sport) : games;

    const buckets = new Map<string, {
      stat: string; statLabel: string;
      legs: number; hits: number;
      thresholdSum: number; actualSum: number; relSum: number;
    }>();

    for (const game of filtered) {
      for (const slip of game.slips) {
        for (const leg of slip.legs) {
          if (leg.hit === undefined || leg.actualStat === undefined) continue;
          const key = `${leg.player}|${leg.stat}`;
          const b = buckets.get(key) ?? { stat: leg.stat, statLabel: leg.statLabel, legs: 0, hits: 0, thresholdSum: 0, actualSum: 0, relSum: 0 };
          b.legs++;
          b.hits += leg.hit;
          b.thresholdSum   += leg.threshold;
          b.actualSum      += leg.actualStat;
          b.relSum         += leg.reliability;
          buckets.set(key, b);
        }
      }
    }

    return Array.from(buckets.entries())
      .filter(([, b]) => b.legs >= 2)
      .map(([key, b]) => {
        const [player] = key.split("|");
        const hitRate = Math.round((b.hits / b.legs) * 1000) / 1000;
        const avgRel  = Math.round((b.relSum / b.legs) * 1000) / 1000;
        return {
          player:         player!,
          stat:           b.stat,
          statLabel:      b.statLabel,
          legs:           b.legs,
          hits:           b.hits,
          hitRate,
          avgThreshold:   Math.round((b.thresholdSum / b.legs) * 10) / 10,
          avgActual:      Math.round((b.actualSum / b.legs) * 10) / 10,
          avgReliability: avgRel,
          drift:          Math.round((hitRate - avgRel) * 1000) / 1000,
        };
      })
      .sort((a, b) => (a.drift ?? 0) - (b.drift ?? 0));
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

export async function getRecentGames(limit = 15, sport?: string): Promise<RecentGameSummary[]> {
  try {
    const games = await readAllGames();
    const filtered = (sport ? games.filter(g => g.sport === sport) : games)
      .sort((a, b) => {
        const da = a.gameDate ?? a.createdAt;
        const db = b.gameDate ?? b.createdAt;
        return db.localeCompare(da);
      })
      .slice(0, limit);

    return filtered.map(game => {
      let totalSlips = 0, resolvedSlips = 0, fullHits = 0, totalLegs = 0, hitLegs = 0;
      for (const slip of game.slips) {
        totalSlips++;
        if (slip.allHit !== undefined) resolvedSlips++;
        if (slip.allHit === 1) fullHits++;
        for (const leg of slip.legs) {
          totalLegs++;
          if (leg.hit === 1) hitLegs++;
        }
      }
      return {
        gameId:       game.id,
        homeTeam:     game.homeTeam,
        awayTeam:     game.awayTeam,
        gameDate:     game.gameDate ?? null,
        venue:        game.venue ?? null,
        totalSlips,
        resolvedSlips,
        fullHits,
        totalLegs,
        hitLegs,
      };
    });
  } catch {
    return [];
  }
}
