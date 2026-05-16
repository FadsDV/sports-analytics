/**
 * Sofascore unofficial API — free, no key required.
 * Personal use only.
 *
 * NOTE: Sofascore returns 403 to Node.js built-in fetch (TLS fingerprint
 * detection). We route all requests through curl via execFile so the TLS
 * handshake looks like a real browser.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BASE = "https://api.sofascore.com/api/v1";
const CURL_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Simple in-process cache ──────────────────────────────────────────────────

const CACHE = new Map<string, { data: unknown; expires: number }>();

async function sofaFetch(url: string, ttlSeconds = 300): Promise<unknown> {
  const now = Date.now();
  const hit = CACHE.get(url);
  if (hit && now < hit.expires) {
    console.info("[SportsPulse/sofascore] cache hit", { url });
    return hit.data;
  }

  console.info("[SportsPulse/sofascore] curl fetch", { url });
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "curl",
      [
        "-s",
        "--compressed",
        "--max-time", "12",
        "-H", "Accept: application/json",
        "-H", "Accept-Language: en-US,en;q=0.9",
        "-H", "Referer: https://www.sofascore.com/",
        "-H", "Origin: https://www.sofascore.com",
        "-A", CURL_UA,
        url,
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    ));
    console.info("[SportsPulse/sofascore] curl ok", { url, bytes: stdout.length });
  } catch (err) {
    console.error("[SportsPulse/sofascore] curl error", { url, err: String(err) });
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch (err) {
    console.error("[SportsPulse/sofascore] JSON parse error", { url, err: String(err), preview: stdout.slice(0, 200) });
    return null;
  }

  CACHE.set(url, { data, expires: now + ttlSeconds * 1000 });
  return data;
}

// ─── Sport slug mapping ───────────────────────────────────────────────────────

const SPORT_SLUG: Record<string, string> = {
  soccer:     "football",
  ucl:        "football",
  uel:        "football",
  laliga:     "football",
  bundesliga: "football",
  aleague:    "football",
  basketball: "basketball",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SofascorePlayer {
  id:            number;
  name:          string;
  shortName:     string;
  position:      string;
  jerseyNumber:  string;
  starter:       boolean;
  minutesPlayed?: number;
  rating?:       number;
  stats:         Record<string, number | null>;
}

export interface SofascoreLineup {
  confirmed:       boolean;
  homeFormation?:  string;
  awayFormation?:  string;
  home:            SofascorePlayer[];
  away:            SofascorePlayer[];
}

export interface SofascoreIncident {
  type:           "goal" | "card" | "substitution" | "var" | "other";
  minute:         number;
  addedTime?:     number;
  isHome:         boolean;
  playerName?:    string;
  assistName?:    string;
  playerInName?:  string;
  playerOutName?: string;
  incidentClass?: string; // "regular", "penalty", "ownGoal", "yellow", "red", "yellowRed"
  description?:   string;
}

export interface SofascoreTeamStats {
  matches:                  number;
  goalsScored:              number;
  goalsConceded:            number;
  shots:                    number | null;
  shotsOnTarget:            number | null;
  corners:                  number | null;
  fouls:                    number | null;
  yellowCards:              number | null;
  redCards:                 number | null;
  saves:                    number | null;
  averageBallPossession:    number | null;
  accuratePassesPercentage: number | null;
}

export interface SofascoreTopPlayer {
  playerId:      number;
  playerName:    string;
  shortName:     string;
  teamName:      string;
  goals:         number;
  assists:       number;
  shotsOnTarget: number | null;
  rating:        number | null;
}

export interface SofascorePlayerSeasonStats {
  appearances:              number | null;
  minutesPlayed:            number | null;
  goals:                    number | null;
  assists:                  number | null;
  rating:                   number | null;
  shotsOnTarget:            number | null;
  totalShots:               number | null;
  accuratePassesPercentage: number | null;
  keyPasses:                number | null;
  tackles:                  number | null;
  interceptions:            number | null;
  yellowCards:              number | null;
  expectedGoals:            number | null;
  expectedAssists:          number | null;
}

export interface SofascoreGameLog {
  eventId:       number;
  date:          string;   // "YYYY-MM-DD"
  homeTeam:      string;
  awayTeam:      string;
  homeScore:     number;
  awayScore:     number;
  homeTeamId:    number;
  awayTeamId:    number;
  goals:         number | null;
  assists:       number | null;
  rating:        number | null;
  minutesPlayed: number | null;
  shots:         number | null;
  shotsOnTarget: number | null;
  passes:        number | null;
  xG:            number | null;
}

export interface SofascoreMatchData {
  sofascoreId:    number;
  lineups:        SofascoreLineup | null;
  incidents:      SofascoreIncident[];
  homeTeamId?:    number;
  awayTeamId?:    number;
  tournamentId?:  number;
  seasonId?:      number;
  homeTeamStats?: SofascoreTeamStats | null;
  awayTeamStats?: SofascoreTeamStats | null;
  topScorers?:    SofascoreTopPlayer[];
}

// ─── Name normalisation ───────────────────────────────────────────────────────

// English city name → canonical form used in original-language names
const CITY_ALIASES: [RegExp, string][] = [
  [/\bcologne\b/g,    "koln"],      // FC Cologne → Köln
  [/\bmunich\b/g,     "munchen"],   // Bayern Munich → München
  [/\bmuenchen\b/g,   "munchen"],
  [/\bmoenchengladbach\b/g, "monchengladbach"],
  [/\bathens\b/g,     "athen"],
  [/\brome\b/g,       "roma"],
  [/\bmilan\b/g,      "milano"],    // AC Milan → Milano
  [/\blyon\b/g,       "lyon"],
  [/\bmarseille\b/g,  "marseille"],
];

function normalizeName(name: string): string {
  let s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining/accent chars
    .toLowerCase();

  // Apply city/locale aliases before stripping
  for (const [pattern, replacement] of CITY_ALIASES) {
    s = s.replace(pattern, replacement);
  }

  return s
    .replace(/\bfc\b|\bcf\b|\bafc\b|\bsc\b|\bac\b|\bas\b|\bss\b|\brc\b|\bcd\b|\bud\b|\bsd\b|\bsv\b|\bfsv\b|\bssv\b|\bvfl\b|\bvfb\b|\brb\b|\btsg\b|\bbsc\b|\btsv\b|\bfk\b|\bsk\b|\bif\b|\bbk\b|\bgif\b/g, "")
    .replace(/\b(real|atletico|sporting|united|city|borussia|dynamo|lokomotiv|spartak)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function namesMatch(sofaName: string, espnName: string): boolean {
  const na = normalizeName(sofaName);
  const nb = normalizeName(espnName);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // prefix match (handles "Arsenal FC" vs "Arsenal")
  const short = na.length < nb.length ? na : nb;
  const long  = na.length < nb.length ? nb : na;
  if (short.length >= 5 && long.startsWith(short)) return true;
  return false;
}

// ─── Find Sofascore event ID ──────────────────────────────────────────────────

/**
 * Finds the Sofascore event ID by matching date + team names against
 * Sofascore's scheduled-events endpoint.
 */
export async function findSofascoreEventId(
  sport:         string,
  homeTeamName:  string,
  awayTeamName:  string,
  kickoffISO:    string
): Promise<number | null> {
  const slug = SPORT_SLUG[sport];
  if (!slug) {
    console.warn("[SportsPulse/sofascore] no slug for sport", { sport });
    return null;
  }

  console.info("[SportsPulse/sofascore] findSofascoreEventId", {
    sport, homeTeamName, awayTeamName, kickoffISO,
    homeNorm: normalizeName(homeTeamName),
    awayNorm: normalizeName(awayTeamName),
  });

  // Try the game date first, then ±1 day to cover timezone edge cases
  const base = new Date(kickoffISO);
  const datesToTry = [0, -1, 1].map((off) => {
    const d = new Date(base);
    d.setDate(d.getDate() + off);
    return d.toISOString().slice(0, 10);
  });

  for (const dateStr of datesToTry) {
    const url  = `${BASE}/sport/${slug}/scheduled-events/${dateStr}`;
    const data = await sofaFetch(url, 3600) as Record<string, unknown> | null;
    if (!data) continue;

    const events: unknown[] = (data.events as unknown[]) ?? [];
    console.info("[SportsPulse/sofascore] scanning events", { dateStr, count: events.length });

    for (const e of events) {
      const ev = e as Record<string, unknown>;
      const home = (ev.homeTeam as Record<string, unknown>)?.name as string ?? "";
      const away = (ev.awayTeam as Record<string, unknown>)?.name as string ?? "";
      if (namesMatch(home, homeTeamName) && namesMatch(away, awayTeamName)) {
        console.info("[SportsPulse/sofascore] event match found", { id: ev.id, home, away });
        return ev.id as number;
      }
    }
    console.info("[SportsPulse/sofascore] no match on date", { dateStr,
      homeNorm: normalizeName(homeTeamName), awayNorm: normalizeName(awayTeamName) });
  }

  console.warn("[SportsPulse/sofascore] event not found", { sport, homeTeamName, awayTeamName, kickoffISO });
  return null;
}

// ─── Fetch lineups ────────────────────────────────────────────────────────────

export async function fetchSofascoreLineups(
  sofascoreId: number,
  _sport:      string
): Promise<SofascoreLineup | null> {
  const url  = `${BASE}/event/${sofascoreId}/lineups`;
  const data = await sofaFetch(url, 300) as Record<string, unknown> | null;
  if (!data) return null;

  const parseTeam = (side: unknown): SofascorePlayer[] => {
    const s = side as Record<string, unknown>;
    return ((s?.players as unknown[]) ?? []).map((raw): SofascorePlayer => {
      const p = raw as Record<string, unknown>;
      const player  = p.player  as Record<string, unknown> ?? {};
      const statObj = p.statistics as Record<string, unknown> ?? {};

      const stats: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(statObj)) {
        stats[k] = typeof v === "number" ? v : null;
      }

      // Fix: resolve minutesPlayed separately to avoid ternary precedence bug
      const minsPlayed: number | undefined =
        statObj.minutesPlayed != null
          ? (statObj.minutesPlayed as number)
          : statObj.secondsPlayed != null
          ? Math.round((statObj.secondsPlayed as number) / 60)
          : undefined;

      return {
        id:            (player.id as number) ?? 0,
        name:          (player.name  as string) ?? "Unknown",
        shortName:     (player.shortName as string) ?? (player.name as string) ?? "Unknown",
        position:      (p.position as string) ?? (player.position as string) ?? "?",
        jerseyNumber:  String(p.jerseyNumber ?? p.shirtNumber ?? ""),
        starter:       !(p.substitute as boolean),
        minutesPlayed: minsPlayed,
        rating:        statObj.rating != null ? (statObj.rating as number) : undefined,
        stats,
      };
    });
  };

  const d = data as Record<string, unknown>;
  return {
    confirmed:      Boolean(d.confirmed),
    homeFormation:  (d.home as Record<string, unknown>)?.formation as string | undefined,
    awayFormation:  (d.away as Record<string, unknown>)?.formation as string | undefined,
    home:           parseTeam(d.home),
    away:           parseTeam(d.away),
  };
}

// ─── Fetch incidents ──────────────────────────────────────────────────────────

export async function fetchSofascoreIncidents(
  sofascoreId: number
): Promise<SofascoreIncident[]> {
  const url  = `${BASE}/event/${sofascoreId}/incidents`;
  const data = await sofaFetch(url, 300) as Record<string, unknown> | null;
  if (!data) return [];

  const raw = (data.incidents as unknown[]) ?? [];

  return (raw
    .map((item): SofascoreIncident | null => {
      const i = item as Record<string, unknown>;
      const rawType   = i.incidentType as string;
      const minute    = (i.time ?? i.minute ?? 0) as number;
      const isHome    = Boolean(i.isHome);
      const getPlayer = (key: string) =>
        ((i[key] as Record<string, unknown>)?.name as string | undefined);

      if (rawType === "goal") {
        return {
          type: "goal", minute, addedTime: i.addedTime as number | undefined,
          isHome,
          playerName:   getPlayer("player"),
          assistName:   getPlayer("assist1"),
          incidentClass: i.incidentClass as string | undefined,
        };
      }
      if (rawType === "card") {
        return {
          type: "card", minute, addedTime: i.addedTime as number | undefined,
          isHome,
          playerName:   getPlayer("player"),
          incidentClass: i.incidentClass as string | undefined,
        };
      }
      if (rawType === "substitution") {
        return {
          type: "substitution", minute, isHome,
          playerInName:  getPlayer("playerIn"),
          playerOutName: getPlayer("playerOut"),
          incidentClass: i.incidentClass as string | undefined,
        };
      }
      if (rawType === "varDecision") {
        return {
          type: "var", minute, isHome,
          playerName:  getPlayer("player"),
          description: i.incidentClass as string | undefined,
        };
      }
      return null;
    })
    .filter(Boolean) as SofascoreIncident[])
    .reverse(); // Sofascore returns newest first — reverse to oldest first
}

// ─── Team & player stat helpers ──────────────────────────────────────────────

export async function fetchTeamSeasonStats(
  teamId:       number,
  tournamentId: number,
  seasonId:     number
): Promise<SofascoreTeamStats | null> {
  const url = `${BASE}/team/${teamId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`;
  const data = await sofaFetch(url, 3600) as Record<string, unknown> | null;
  if (!data) return null;
  const s = (data.statistics ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof s[k] === "number" ? s[k] as number : null);
  return {
    matches:                  (n("matches") ?? 0),
    goalsScored:              (n("goalsScored") ?? 0),
    goalsConceded:            (n("goalsConceded") ?? 0),
    shots:                    n("shots"),
    shotsOnTarget:            n("shotsOnTarget"),
    corners:                  n("corners"),
    fouls:                    n("fouls"),
    yellowCards:              n("yellowCards"),
    redCards:                 n("redCards"),
    saves:                    n("saves"),
    averageBallPossession:    n("averageBallPossession"),
    accuratePassesPercentage: n("accuratePassesPercentage"),
  };
}

export async function fetchTournamentTopScorers(
  tournamentId: number,
  seasonId:     number
): Promise<SofascoreTopPlayer[]> {
  const url = `${BASE}/unique-tournament/${tournamentId}/season/${seasonId}/statistics?group=overall&filter=overall&limit=10&offset=0&accumulation=total&fields=goals%2Cassists%2CshotsOnTarget%2Crating`;
  const data = await sofaFetch(url, 3600) as Record<string, unknown> | null;
  if (!data) return [];
  const results = (data.results as unknown[]) ?? [];
  return results
    .filter((r: unknown) => {
      const row = r as Record<string, unknown>;
      return ((row.goals as number) ?? 0) > 0;
    })
    .sort((a: unknown, b: unknown) => {
      const ra = a as Record<string, unknown>;
      const rb = b as Record<string, unknown>;
      return ((rb.goals as number) ?? 0) - ((ra.goals as number) ?? 0);
    })
    .slice(0, 8)
    .map((r: unknown) => {
      const row = r as Record<string, unknown>;
      const p = (row.player ?? {}) as Record<string, unknown>;
      const t = (row.team ?? {}) as Record<string, unknown>;
      return {
        playerId:      (p.id as number) ?? 0,
        playerName:    (p.name as string) ?? "",
        shortName:     (p.shortName as string) ?? (p.name as string) ?? "",
        teamName:      (t.shortName as string) ?? (t.name as string) ?? "",
        goals:         (row.goals as number) ?? 0,
        assists:       (row.assists as number) ?? 0,
        shotsOnTarget: typeof row.shotsOnTarget === "number" ? row.shotsOnTarget as number : null,
        rating:        typeof row.rating === "number" ? row.rating as number : null,
      };
    });
}

export async function fetchPlayerSeasonStats(
  playerId: number,
  sport:    string
): Promise<{ stats: SofascorePlayerSeasonStats; tournamentId: number; seasonId: number } | null> {
  const SPORT_TOURNAMENT: Record<string, number> = {
    soccer: 17, bundesliga: 35, laliga: 8, ucl: 7, uel: 679, aleague: 329,
  };
  const tournamentId = SPORT_TOURNAMENT[sport];
  if (!tournamentId) return null;

  const seasonsUrl = `${BASE}/player/${playerId}/statistics/seasons`;
  const seasonsData = await sofaFetch(seasonsUrl, 3600) as Record<string, unknown> | null;
  if (!seasonsData) return null;

  const tournamentSeasons = (seasonsData.uniqueTournamentSeasons as unknown[]) ?? [];
  let seasonId: number | null = null;
  for (const ts of tournamentSeasons) {
    const tso = ts as Record<string, unknown>;
    const tid = ((tso.uniqueTournament as Record<string, unknown>)?.id as number);
    if (tid === tournamentId) {
      const seasons = (tso.seasons as unknown[]) ?? [];
      if (seasons.length > 0) {
        seasonId = ((seasons[0] as Record<string, unknown>).id as number);
      }
      break;
    }
  }
  if (!seasonId) return null;

  const statsUrl = `${BASE}/player/${playerId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`;
  const statsData = await sofaFetch(statsUrl, 3600) as Record<string, unknown> | null;
  if (!statsData) return null;
  const s = (statsData.statistics ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof s[k] === "number" ? s[k] as number : null);

  return {
    tournamentId,
    seasonId,
    stats: {
      appearances:              n("appearances"),
      minutesPlayed:            n("minutesPlayed"),
      goals:                    n("goals"),
      assists:                  n("assists"),
      rating:                   n("rating"),
      shotsOnTarget:            n("shotsOnTarget"),
      totalShots:               n("totalShots"),
      accuratePassesPercentage: n("accuratePassesPercentage"),
      keyPasses:                n("keyPasses"),
      tackles:                  n("tackles"),
      interceptions:            n("interceptions"),
      yellowCards:              n("yellowCards"),
      expectedGoals:            n("expectedGoals"),
      expectedAssists:          n("expectedAssists"),
    },
  };
}

export async function fetchPlayerRecentGames(
  playerId:        number,
  opponentTeamId?: number
): Promise<{ recentGames: SofascoreGameLog[]; vsOpponent: SofascoreGameLog | null }> {
  const eventsUrl = `${BASE}/player/${playerId}/events/last/0`;
  const eventsData = await sofaFetch(eventsUrl, 1800) as Record<string, unknown> | null;
  if (!eventsData) return { recentGames: [], vsOpponent: null };

  const events = (eventsData.events as unknown[]) ?? [];
  const finished = events.filter((e: unknown) => {
    const ev = e as Record<string, unknown>;
    const status = (ev.status as Record<string, unknown>)?.type as string;
    return status === "finished";
  });

  const last5 = finished.slice(0, 5);

  const vsEvent = opponentTeamId
    ? finished.find((e: unknown) => {
        const ev = e as Record<string, unknown>;
        const hId = ((ev.homeTeam as Record<string, unknown>)?.id as number);
        const aId = ((ev.awayTeam as Record<string, unknown>)?.id as number);
        return hId === opponentTeamId || aId === opponentTeamId;
      })
    : null;

  const toGameLog = async (e: unknown): Promise<SofascoreGameLog> => {
    const ev = e as Record<string, unknown>;
    const eventId = ev.id as number;
    const ts = ev.startTimestamp as number;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const ht  = (ev.homeTeam as Record<string, unknown>);
    const at  = (ev.awayTeam as Record<string, unknown>);
    const hs  = (ev.homeScore as Record<string, unknown>);
    const as_ = (ev.awayScore as Record<string, unknown>);

    const statsUrl = `${BASE}/event/${eventId}/player/${playerId}/statistics`;
    const statsData = await sofaFetch(statsUrl, 86400) as Record<string, unknown> | null;
    const ps = (statsData?.statistics ?? statsData ?? {}) as Record<string, unknown>;
    const n = (k: string) => (typeof ps[k] === "number" ? ps[k] as number : null);

    return {
      eventId,
      date,
      homeTeam:      (ht?.name as string) ?? "",
      awayTeam:      (at?.name as string) ?? "",
      homeScore:     (hs?.current as number) ?? 0,
      awayScore:     (as_?.current as number) ?? 0,
      homeTeamId:    (ht?.id as number) ?? 0,
      awayTeamId:    (at?.id as number) ?? 0,
      goals:         n("goals"),
      assists:       n("goalAssist") ?? n("assists"),
      rating:        n("rating"),
      minutesPlayed: n("minutesPlayed"),
      shots:         n("totalShots") ?? n("totalShot"),
      shotsOnTarget: n("onTargetScoringAttempt"),
      passes:        n("accuratePass"),
      xG:            n("expectedGoals"),
    };
  };

  const [recentGames, vsOpponentLog] = await Promise.all([
    Promise.all(last5.map(toGameLog)),
    vsEvent ? toGameLog(vsEvent) : Promise.resolve(null),
  ]);

  return { recentGames, vsOpponent: vsOpponentLog };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Fetches lineups + incidents for a game.
 * Returns null if the game can't be found on Sofascore.
 */
export async function fetchSofascoreMatchData(
  sport:        string,
  homeTeamName: string,
  awayTeamName: string,
  kickoffISO:   string
): Promise<SofascoreMatchData | null> {
  console.info("[SportsPulse/sofascore] fetchSofascoreMatchData start", {
    sport, homeTeamName, awayTeamName, kickoffISO
  });

  const sofascoreId = await findSofascoreEventId(
    sport, homeTeamName, awayTeamName, kickoffISO
  );
  if (!sofascoreId) {
    console.warn("[SportsPulse/sofascore] fetchSofascoreMatchData: no sofascoreId, returning null");
    return null;
  }

  // Fetch event details for team IDs and tournament/season info
  const eventData = await sofaFetch(`${BASE}/event/${sofascoreId}`, 3600) as Record<string, unknown> | null;
  const ev = (eventData?.event ?? {}) as Record<string, unknown>;
  const homeTeamId   = ((ev.homeTeam as Record<string, unknown>)?.id as number) ?? undefined;
  const awayTeamId   = ((ev.awayTeam as Record<string, unknown>)?.id as number) ?? undefined;
  const tournamentId = ((ev.uniqueTournament as Record<string, unknown>)?.id as number) ?? undefined;
  const seasonId     = ((ev.season as Record<string, unknown>)?.id as number) ?? undefined;

  console.info("[SportsPulse/sofascore] fetching lineups + incidents + team stats", { sofascoreId, homeTeamId, awayTeamId, tournamentId, seasonId });

  const [lineups, incidents, homeTeamStats, awayTeamStats, topScorers] = await Promise.all([
    fetchSofascoreLineups(sofascoreId, sport),
    fetchSofascoreIncidents(sofascoreId),
    homeTeamId && tournamentId && seasonId
      ? fetchTeamSeasonStats(homeTeamId, tournamentId, seasonId)
      : Promise.resolve(null),
    awayTeamId && tournamentId && seasonId
      ? fetchTeamSeasonStats(awayTeamId, tournamentId, seasonId)
      : Promise.resolve(null),
    tournamentId && seasonId
      ? fetchTournamentTopScorers(tournamentId, seasonId)
      : Promise.resolve([]),
  ]);

  console.info("[SportsPulse/sofascore] fetchSofascoreMatchData done", {
    sofascoreId,
    hasLineups: Boolean(lineups),
    homePlayers: lineups?.home.length ?? 0,
    awayPlayers: lineups?.away.length ?? 0,
    incidents: incidents.length,
  });

  return {
    sofascoreId, lineups, incidents,
    homeTeamId, awayTeamId, tournamentId, seasonId,
    homeTeamStats, awayTeamStats, topScorers,
  };
}
