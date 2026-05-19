/**
 * FotMob soccer data adapter — player stats, photos, match data.
 *
 * FotMob has a public JSON API used by their web app.
 * No auth required. Works from Vercel server-side.
 *
 * Player photos: https://images.fotmob.com/image_resources/playerimages/{fotmobId}.png
 * Match details: https://www.fotmob.com/api/matchDetails?matchId={id}
 * Player data:   https://www.fotmob.com/api/playerData?id={fotmobId}
 * Matches by date: https://www.fotmob.com/api/matches?date=YYYYMMDD
 */

const BASE = "https://www.fotmob.com/api";
const IMG_BASE = "https://images.fotmob.com/image_resources/playerimages";

async function fotmobGet(path: string, revalidate = 60): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...(revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } }),
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.fotmob.com/",
        "x-fm-req": "eyJhbGciOiJIUzI1NiJ9",
      },
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Photo URL helper ─────────────────────────────────────────────────────────

export function fotmobPhotoUrl(fotmobId: number): string {
  return `${IMG_BASE}/${fotmobId}.png`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FotMobPlayer {
  fotmobId:    number;
  name:        string;
  shortName:   string;
  position:    string;
  jersey:      number | null;
  isHome:      boolean;
  isStarter:   boolean;
  photoUrl:    string;
  rating:      number | null;
}

export interface FotMobMatchLineup {
  matchId:      number;
  homePlayers:  FotMobPlayer[];
  awayPlayers:  FotMobPlayer[];
}

export interface FotMobRecentMatch {
  matchId:       number;
  date:          string;   // "YYYY-MM-DD"
  homeTeam:      string;
  awayTeam:      string;
  homeScore:     number;
  awayScore:     number;
  isHome:        boolean;
  minutesPlayed: number | null;
  goals:         number | null;
  assists:       number | null;
  rating:        number | null;
  shots:         number | null;
  shotsOnTarget: number | null;
  keyPasses:     number | null;
  tackles:       number | null;
  interceptions: number | null;
  yellowCards:   number | null;
  redCards:      number | null;
  passes:        number | null;
  passAccuracy:  number | null;
  xG:            number | null;
  xA:            number | null;
}

export interface FotMobPlayerStats {
  fotmobId:       number;
  name:           string;
  position:       string;
  photoUrl:       string;
  appearances:    number | null;
  goals:          number | null;
  assists:        number | null;
  yellowCards:    number | null;
  redCards:       number | null;
  rating:         number | null;
  minutesPlayed:  number | null;
  shots:          number | null;
  shotsOnTarget:  number | null;
  keyPasses:      number | null;
  tackles:        number | null;
  interceptions:  number | null;
  xG:             number | null;
  xA:             number | null;
  passAccuracy:   number | null;
  recentMatches:  FotMobRecentMatch[];
}

// ─── Name normaliser ──────────────────────────────────────────────────────────

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function namesMatch(a: string, b: string): boolean {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length < nb.length ? [na, nb] : [nb, na];
  return short.length >= 4 && long.includes(short);
}

// ─── Find FotMob match ID by date + team names ────────────────────────────────

export async function findFotMobMatchId(
  homeTeamName: string,
  awayTeamName: string,
  dateStr: string,  // "YYYY-MM-DD"
): Promise<number | null> {
  // FotMob uses YYYYMMDD format
  const dateFmt = dateStr.replace(/-/g, "");
  const data = await fotmobGet(`/matches?date=${dateFmt}`, 3600);
  if (!data) return null;

  const leagues = (data.leagues as any[]) ?? [];
  for (const league of leagues) {
    const matches = (league.matches ?? []) as any[];
    for (const match of matches) {
      const h = match.home?.name ?? match.homeTeam?.name ?? "";
      const a = match.away?.name ?? match.awayTeam?.name ?? "";
      if (namesMatch(h, homeTeamName) && namesMatch(a, awayTeamName)) {
        return match.id as number;
      }
      if (namesMatch(h, awayTeamName) && namesMatch(a, homeTeamName)) {
        return match.id as number;
      }
    }
  }
  return null;
}

// ─── Extract a stat from FotMob stat blocks ───────────────────────────────────

function extractStat(stats: any[], keys: string[]): number | null {
  if (!stats) return null;
  for (const key of keys) {
    const found = stats.find((s: any) =>
      s.key === key || s.name?.toLowerCase() === key.toLowerCase() || s.title?.toLowerCase() === key.toLowerCase()
    );
    if (found != null) {
      const v = found.value ?? found.stat?.value ?? found.stat;
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = parseFloat(v.replace(/[^0-9.]/g, ""));
        return isNaN(n) ? null : n;
      }
    }
  }
  return null;
}

// ─── Fetch FotMob match lineup ────────────────────────────────────────────────

export async function fetchFotMobMatchLineup(matchId: number): Promise<FotMobMatchLineup | null> {
  const data = await fotmobGet(`/matchDetails?matchId=${matchId}`, 300);
  if (!data) return null;

  const lineup = (data.lineup as any) ?? {};
  const rawHome: any[] = lineup.homeTeam?.players ?? lineup.home?.players ?? [];
  const rawAway: any[] = lineup.awayTeam?.players ?? lineup.away?.players ?? [];

  function parsePlayers(arr: any[], isHome: boolean): FotMobPlayer[] {
    return arr.flatMap((row: any) => {
      // FotMob lineup comes as rows: each row is a line of players
      const players: any[] = Array.isArray(row) ? row : [row];
      return players
        .filter((p: any) => p?.id)
        .map((p: any) => ({
          fotmobId:  p.id,
          name:      p.name ?? p.fullName ?? "",
          shortName: p.shortName ?? p.name ?? "",
          position:  p.role?.key ?? p.position ?? "",
          jersey:    typeof p.shirt === "number" ? p.shirt : null,
          isHome,
          isStarter: p.isFirstEleven ?? true,
          photoUrl:  fotmobPhotoUrl(p.id),
          rating:    typeof p.rating?.num === "number" ? p.rating.num : null,
        }));
    });
  }

  return {
    matchId,
    homePlayers: parsePlayers(rawHome, true),
    awayPlayers: parsePlayers(rawAway, false),
  };
}

// ─── Build name → FotMob player ID map from match lineup ─────────────────────

export async function buildFotMobPlayerMap(
  homeTeamName: string,
  awayTeamName: string,
  dateStr: string,
): Promise<{ [playerName: string]: number } | null> {
  const matchId = await findFotMobMatchId(homeTeamName, awayTeamName, dateStr);
  if (!matchId) return null;

  const lineup = await fetchFotMobMatchLineup(matchId);
  if (!lineup) return null;

  const map: { [name: string]: number } = {};
  for (const p of [...lineup.homePlayers, ...lineup.awayPlayers]) {
    if (p.fotmobId && p.name) {
      map[normName(p.name)] = p.fotmobId;
      if (p.shortName && p.shortName !== p.name) {
        map[normName(p.shortName)] = p.fotmobId;
      }
    }
  }
  return map;
}

// ─── Fetch FotMob player season stats + recent matches ────────────────────────

export async function fetchFotMobPlayerStats(fotmobId: number): Promise<FotMobPlayerStats | null> {
  const data = await fotmobGet(`/playerData?id=${fotmobId}`, 1800);
  if (!data) return null;

  const name     = (data.name as string) ?? "";
  const position = (data.positionId as string) ?? "";

  // Season stats — FotMob stores them in mainLeague or primaryLeague
  const d = data as any;
  const topStats: any[] = (d.topStatCard?.items ?? []) as any[];
  const statItems: any[] = (d.statSeasons?.[0]?.tournamentStatGroup?.flatMap((g: any) => g.items ?? []) ?? []) as any[];
  const allStats = [...topStats, ...statItems];

  const getN = (keys: string[]) => extractStat(allStats, keys);

  // Recent matches
  const rawMatches: any[] = ((d.recentMatches ?? []) as any[]);
  const recentMatches: FotMobRecentMatch[] = rawMatches
    .filter((m: any) => m?.matchId)
    .map((m: any) => {
      const stats: any[] = m.playerMatchStats ?? m.stats ?? [];
      const homeTeam = m.teamName ?? "";
      const awayTeam = m.opponentTeamName ?? "";
      const isHome   = m.isHome ?? false;
      const homeScore = isHome ? (m.teamScore ?? 0) : (m.opponentScore ?? 0);
      const awayScore = isHome ? (m.opponentScore ?? 0) : (m.teamScore ?? 0);

      return {
        matchId:       m.matchId,
        date:          (m.matchDate ?? m.date ?? "").slice(0, 10),
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        isHome,
        minutesPlayed: extractStat(stats, ["Minutes played", "minutesPlayed", "minutes"]),
        goals:         extractStat(stats, ["Goals", "goals"]),
        assists:       extractStat(stats, ["Assists", "assists"]),
        rating:        typeof m.ratingProps?.num === "number" ? m.ratingProps.num : extractStat(stats, ["Rating"]),
        shots:         extractStat(stats, ["Shots", "Total shots", "totalShots"]),
        shotsOnTarget: extractStat(stats, ["Shots on target", "shotsOnTarget"]),
        keyPasses:     extractStat(stats, ["Key passes", "keyPasses"]),
        tackles:       extractStat(stats, ["Tackles won", "tackles"]),
        interceptions: extractStat(stats, ["Interceptions", "interceptions"]),
        yellowCards:   extractStat(stats, ["Yellow cards", "yellowCards"]),
        redCards:      extractStat(stats, ["Red cards", "redCards"]),
        passes:        extractStat(stats, ["Accurate passes", "passes"]),
        passAccuracy:  extractStat(stats, ["Pass accuracy", "passAccuracy"]),
        xG:            extractStat(stats, ["Expected goals (xG)", "xg", "xG"]),
        xA:            extractStat(stats, ["Expected assists (xA)", "xa", "xA"]),
      };
    });

  return {
    fotmobId,
    name,
    position,
    photoUrl: fotmobPhotoUrl(fotmobId),
    appearances: getN(["Appearances", "appearances", "Matches played"]),
    goals:       getN(["Goals", "goals"]),
    assists:     getN(["Assists", "assists"]),
    yellowCards: getN(["Yellow cards", "yellowCards"]),
    redCards:    getN(["Red cards", "redCards"]),
    rating:      getN(["FotMob rating", "rating"]),
    minutesPlayed: getN(["Minutes played", "minutesPlayed"]),
    shots:         getN(["Shots", "totalShots"]),
    shotsOnTarget: getN(["Shots on target", "shotsOnTarget"]),
    keyPasses:     getN(["Key passes", "keyPasses"]),
    tackles:       getN(["Tackles won", "tackles"]),
    interceptions: getN(["Interceptions"]),
    xG:            getN(["Expected goals (xG)", "xG"]),
    xA:            getN(["Expected assists (xA)", "xA"]),
    passAccuracy:  getN(["Pass accuracy", "passAccuracy", "Accurate passes (%)"]),
    recentMatches,
  };
}

// ─── Lookup FotMob player ID by name from a player map ───────────────────────

export function lookupFotMobId(name: string, playerMap: { [k: string]: number }): number | null {
  const key = normName(name);
  if (playerMap[key]) return playerMap[key];
  // Partial match — try starts-with
  for (const [k, id] of Object.entries(playerMap)) {
    if (key.length >= 4 && (k.includes(key) || key.includes(k))) return id;
  }
  return null;
}
