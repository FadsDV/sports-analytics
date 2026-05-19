/**
 * 365Scores soccer data adapter — supplementary source for match-level enrichment.
 *
 * ESPN is primary for schedule, squad, and history.
 * 365Scores adds what ESPN lacks for live/finished matches:
 *   ✅ xG per team (aggregated from shot events)
 *   ✅ xA per player
 *   ✅ Player ratings (6.3, 7.2 etc.)
 *   ✅ Shot chart (position + xG + xGOT per shot)
 *   ✅ Big Chances Created/Missed/Scored
 *   ✅ Key Passes, Tackles, Interceptions, Ball Recovery
 *   ✅ Passes Completed %, Touches
 *   ❌ Pre-match predictions / odds
 *
 * ID mapping: search by date + fuzzy team name — no hard-coded ID table needed.
 */

const BASE = "https://webws.365scores.com/web";

async function scoresGet(path: string, revalidate = 60): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...(revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } }),
      headers: {
        "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept":          "application/json",
        "Referer":         "https://www.365scores.com/",
      },
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Scores365Shot {
  playerId:  number;
  minute:    string;
  xG:        number;
  xGOT:      number;
  outcome:   "Goal" | "Saved" | "Missed" | "Blocked" | "Woodwork" | string;
  isHome:    boolean;
  bodyPart:  string;
  line:      number;  // 0–100 field position
  side:      number;  // 0–100 field side
}

export interface Scores365Player {
  id:            number;
  name:          string;
  shortName:     string;
  jersey:        string;
  isHome:        boolean;
  starter:       boolean;
  position:      string;
  rating:        number | null;
  minutes:       number;
  goals:         number;
  assists:       number;
  xG:            number | null;
  xA:            number | null;
  shots:         number;
  shotsOnTarget: number;
  keyPasses:     number;
  tackles:       number;
  interceptions: number;
  touches:       number;
  passesCompleted: number;
  passAccuracy:  number | null;
  bigChances:    number;
  yellowCard:    boolean;
  redCard:       boolean;
}

export interface Scores365MatchData {
  gameId:      number;
  homeTeamId:  number;
  awayTeamId:  number;
  homeXG:      number;
  awayXG:      number;
  homeXGOT:    number;
  awayXGOT:    number;
  homeBigChances: number;
  awayBigChances: number;
  homePlayers: Scores365Player[];
  awayPlayers: Scores365Player[];
  shots:       Scores365Shot[];
}

// ─── Name normaliser ──────────────────────────────────────────────────────────

function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(fc|afc|cf|sc|united|hotspur|athletic|wanderers|albion|rovers|town|city|county)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length < nb.length ? [na, nb] : [nb, na];
  return short.length >= 4 && long.startsWith(short);
}

// ─── Search: find 365Scores game ID by date + team names ─────────────────────

export async function find365ScoresGameId(
  homeTeamName: string,
  awayTeamName: string,
  dateStr: string,  // "YYYY-MM-DD"
): Promise<number | null> {
  // Convert to DD/MM/YYYY
  const [y, m, d] = dateStr.split("-");
  const fmt = `${d}/${m}/${y}`;

  const data = await scoresGet(`/games/?appTypeId=5&langId=1&startDate=${fmt}&endDate=${fmt}&sports=1`, 300);
  if (!data) return null;

  const games = (data.games as any[]) ?? [];
  for (const g of games) {
    const h = g.homeCompetitor?.name ?? "";
    const a = g.awayCompetitor?.name ?? "";
    if (namesMatch(h, homeTeamName) && namesMatch(a, awayTeamName)) {
      return g.id as number;
    }
    // Also try reversed (in case home/away is swapped)
    if (namesMatch(h, awayTeamName) && namesMatch(a, homeTeamName)) {
      return g.id as number;
    }
  }
  return null;
}

// ─── Parse a player's stat array into a typed object ─────────────────────────

function parseStat(stats: any[], typeName: string): number {
  const s = stats.find((x: any) => x.name === typeName || x.type === typeName);
  if (!s) return 0;
  const raw = String(s.value ?? "0");
  // Handle "33/36 (92%)" format — take the numerator
  const n = parseFloat(raw.split("/")[0].replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function parsePassAccuracy(stats: any[]): number | null {
  const s = stats.find((x: any) => x.name === "Passes Completed");
  if (!s) return null;
  // "33/36 (92%)" — extract the percentage
  const m = String(s.value ?? "").match(/\((\d+)%\)/);
  return m ? parseInt(m[1], 10) : null;
}

function parsePlayerStats(member: any, isHome: boolean, nameMap?: Map<number, { name: string; shortName: string; jersey: string }>): Scores365Player {
  const stats: any[] = member.stats ?? [];
  const lookup = nameMap?.get(member.id ?? 0);
  return {
    id:              member.id ?? 0,
    name:            lookup?.name      || member.name      || "",
    shortName:       lookup?.shortName || member.shortName || lookup?.name || member.name || "",
    jersey:          lookup?.jersey    || "",
    isHome,
    starter:         member.status === 1,
    position:        member.position?.name ?? "?",
    rating:          (typeof member.ranking === "number" && member.ranking > 0) ? member.ranking : null,
    minutes:         parseStat(stats, "Minutes"),
    goals:           parseStat(stats, "Goals"),
    assists:         parseStat(stats, "Assists"),
    xG:              parseStat(stats, "Expected Goals") || null,
    xA:              parseStat(stats, "Expected Assists") || null,
    shots:           parseStat(stats, "Total Shots"),
    shotsOnTarget:   parseStat(stats, "Shots On Target"),
    keyPasses:       parseStat(stats, "Key Passes"),
    tackles:         parseStat(stats, "Tackles Won"),
    interceptions:   parseStat(stats, "Interceptions"),
    touches:         parseStat(stats, "Touches"),
    passesCompleted: parseStat(stats, "Passes Completed"),
    passAccuracy:    parsePassAccuracy(stats),
    bigChances:      parseStat(stats, "Big Chances Created"),
    yellowCard:      false, // parsed from events separately
    redCard:         false,
  };
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetch365ScoresMatchData(
  gameId: number
): Promise<Scores365MatchData | null> {
  const data = await scoresGet(`/game/?appTypeId=5&langId=1&gameId=${gameId}`, 60);
  if (!data) return null;

  const g = (data.game as any) ?? {};
  const homeTeamId = g.homeCompetitor?.id ?? 0;
  const awayTeamId = g.awayCompetitor?.id ?? 0;

  // Build player name lookup from top-level g.members array
  // (lineup members have ids but empty name/shortName — names live in g.members)
  const nameMap = new Map<number, { name: string; shortName: string; jersey: string }>();
  for (const m of (g.members ?? []) as any[]) {
    if (m.id) {
      nameMap.set(m.id, {
        name:      m.name      ?? "",
        shortName: m.shortName ?? m.name ?? "",
        jersey:    String(m.jerseyNumber ?? ""),
      });
    }
  }

  // Parse shot chart events
  const rawShots: any[] = (g.chartEvents?.events ?? []) as any[];
  const shots: Scores365Shot[] = rawShots.map((s: any) => ({
    playerId:  s.playerId ?? 0,
    minute:    s.time ?? "",
    xG:        parseFloat(String(s.xg ?? "0")) || 0,
    xGOT:      parseFloat(String(s.xgot ?? "0")) || 0,
    outcome:   s.outcome?.name ?? "Missed",
    isHome:    s.competitorNum === 1,
    bodyPart:  s.bodyPart ?? "",
    line:      s.line ?? 50,
    side:      s.side ?? 50,
  }));

  const homeXG   = shots.filter(s => s.isHome).reduce((a, s) => a + s.xG, 0);
  const awayXG   = shots.filter(s => !s.isHome).reduce((a, s) => a + s.xG, 0);
  const homeXGOT = shots.filter(s => s.isHome).reduce((a, s) => a + s.xGOT, 0);
  const awayXGOT = shots.filter(s => !s.isHome).reduce((a, s) => a + s.xGOT, 0);

  // Parse lineups
  const homeLineup: any[] = g.homeCompetitor?.lineups?.members ?? [];
  const awayLineup: any[] = g.awayCompetitor?.lineups?.members ?? [];

  // Mark yellow/red cards from events
  const cardEvents: any[] = (g.events ?? []).filter((e: any) => [2, 5, 6].includes(e.eventType?.id));
  const yellowIds = new Set(cardEvents.filter((e: any) => e.eventType?.id === 2).map((e: any) => e.playerId));
  const redIds    = new Set(cardEvents.filter((e: any) => [5, 6].includes(e.eventType?.id)).map((e: any) => e.playerId));

  const parseSide = (members: any[], isHome: boolean): Scores365Player[] =>
    members.map((m: any) => {
      const p = parsePlayerStats(m, isHome, nameMap);
      p.yellowCard = yellowIds.has(m.id);
      p.redCard    = redIds.has(m.id);
      return p;
    });

  const homePlayers = parseSide(homeLineup, true);
  const awayPlayers = parseSide(awayLineup, false);

  const homeBigChances = homePlayers.reduce((a, p) => a + p.bigChances, 0);
  const awayBigChances = awayPlayers.reduce((a, p) => a + p.bigChances, 0);

  return {
    gameId,
    homeTeamId,
    awayTeamId,
    homeXG:      Math.round(homeXG * 100) / 100,
    awayXG:      Math.round(awayXG * 100) / 100,
    homeXGOT:    Math.round(homeXGOT * 100) / 100,
    awayXGOT:    Math.round(awayXGOT * 100) / 100,
    homeBigChances,
    awayBigChances,
    homePlayers,
    awayPlayers,
    shots,
  };
}

// ─── Convenience: find + fetch in one call ────────────────────────────────────

export async function fetch365ScoresForGame(
  homeTeamName: string,
  awayTeamName: string,
  dateStr: string,
): Promise<Scores365MatchData | null> {
  const gameId = await find365ScoresGameId(homeTeamName, awayTeamName, dateStr);
  if (!gameId) return null;
  return fetch365ScoresMatchData(gameId);
}
