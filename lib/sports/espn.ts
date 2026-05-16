/**
 * ESPN public scoreboard & summary API
 * No API key required — personal use only.
 * Docs: undocumented but stable endpoint used by ESPN's own site.
 */

import { FormResult, Game, Team, Player, BoxScore, H2HGame, ScoringEvent } from "@/lib/types";
import { getAFLFantasyMap, normalizeAFLName } from "./afl/fantasyMapper";
import { getAFLCDNPortraitUrl } from "./afl/champIDImages";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

// Map our sport keys to ESPN URL paths
export const ESPN_PATHS = {
  soccer:     "soccer/eng.1",            // English Premier League
  ucl:        "soccer/uefa.champions",   // UEFA Champions League
  uel:        "soccer/uefa.europa",      // UEFA Europa League
  laliga:     "soccer/esp.1",            // La Liga
  bundesliga: "soccer/ger.1",            // Bundesliga
  aleague:    "soccer/aus.1",            // A-League (Australia)
  basketball: "basketball/nba",
  nfl:        "football/nfl",
  afl:        "australian-football/afl", // AFL
} as const;

type ESPNSport = keyof typeof ESPN_PATHS;
export type VenueFilter = "all" | "home" | "away";

export interface TeamHistoryGame {
  gameId: string;
  date: string;
  venue: string;
  homeAway: "home" | "away";
  opponent: string;
  score: string | null;
  result: "W" | "L" | "D" | null;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Returns YYYYMMDD-YYYYMMDD covering last 5 → next 10 days */
function dateRange(): string {
  const now = new Date();
  const s = new Date(now); s.setDate(now.getDate() - 5);
  const e = new Date(now); e.setDate(now.getDate() + 10);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return `${fmt(s)}-${fmt(e)}`;
}

// ─── Transformers ────────────────────────────────────────────────────────────

function mapStatus(state: string): Game["status"] {
  if (state === "in")   return "live";
  if (state === "post") return "finished";
  return "upcoming";
}

function parseRecord(summary?: string): { wins: number; losses: number; draws?: number } {
  if (!summary) return { wins: 0, losses: 0 };
  const p = summary.split("-").map(Number);
  return { wins: p[0] ?? 0, losses: p[1] ?? 0, ...(p.length >= 3 ? { draws: p[2] } : {}) };
}

function parseForm(form?: string): FormResult[] {
  if (!form) return [];
  return form
    .slice(0, 5)
    .split("")
    .map((c) => (c === "W" ? "W" : c === "L" ? "L" : "D") as FormResult);
}

function parseScore(raw: any): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  // ESPN schedule returns score as object: { value: 1.0, displayValue: '1' }
  if (typeof raw === "object") {
    const v = raw.displayValue ?? raw.value;
    if (v != null) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function gameResult(
  sport: ESPNSport,
  myScore: number,
  oppScore: number
): "W" | "L" | "D" {
  if (myScore > oppScore) return "W";
  if (myScore < oppScore) return "L";
  if (sport === "soccer" || sport === "afl") return "D";
  return "L";
}

function sportEmoji(sport: ESPNSport): string {
  const map: Record<ESPNSport, string> = {
    soccer: "⚽", ucl: "⚽", uel: "⚽", laliga: "⚽",
    bundesliga: "⚽", aleague: "⚽", basketball: "🏀", nfl: "🏈", afl: "🏉",
  };
  return map[sport] ?? "⚽";
}
// ─── Scoreboard (game list) ───────────────────────────────────────────────────

/** Fetches the ESPN scoreboard for a sport and returns raw event objects. */
export async function fetchESPNScoreboard(sport: ESPNSport, revalidate: number = 30): Promise<any[]> {
  const url = `${BASE}/${ESPN_PATHS[sport]}/scoreboard?limit=50&dates=${dateRange()}`;
  try {
    const res = await fetch(url, {
      next: { revalidate },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    console.info("[SportsPulse] fetchESPNScoreboard", { sport, status: res.status, url, revalidate });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events ?? [];
  } catch {
    return [];
  }
}

/** Transforms a raw ESPN scoreboard event into our Game shape (weather/h2h/betRisk added later). */
export function transformESPNEvent(event: any, sport: ESPNSport): Omit<Game, "weather" | "betRisk"> | null {
  const comp = event.competitions?.[0];
  if (!comp) return null;

  const home = comp.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp.competitors?.find((c: any) => c.homeAway === "away");
  if (!home || !away) return null;

  // Schedule-fallback events store status on competitions[0], not on event root
  const state = event.status?.type?.state ?? comp.status?.type?.state ?? "pre";
  const status = mapStatus(state);
  const venue  = comp.venue;
  const city   = [venue?.address?.city, venue?.address?.state || venue?.address?.country]
    .filter(Boolean)
    .join(", ");

  // Records
  const homeAll  = home.records?.find((r: any) => ["overall", "total"].includes(r.name));
  const awayAll  = away.records?.find((r: any) => ["overall", "total"].includes(r.name));
  const homeHomeR = home.records?.find((r: any) => r.name === "home");
  const awayAwayR = away.records?.find((r: any) => r.name === "away");

  // Live minute (soccer/AFL only — ESPN clock shows MM:SS)
  let liveMinute: number | undefined;
  if (status === "live" && sport === "soccer") {
    const period = event.status?.period ?? 1;
    const clock  = event.status?.displayClock ?? "";
    const mins   = parseInt(clock.split(":")[0]) || 0;
    liveMinute   = period === 1 ? mins : 45 + mins;
  } else if (status === "live" && sport === "afl") {
    const period = event.status?.period ?? 1;
    const clock  = event.status?.displayClock ?? "";
    const mins   = parseInt(clock.split(":")[0]) || 0;
    liveMinute   = ((period - 1) * 20) + mins;
  }

  const makeTeam = (c: any, role: "home" | "away"): Team => ({
    name:      c.team.displayName,
    shortName: c.team.abbreviation,
    logo:      sportEmoji(sport),
    logoUrl:   c.team.logo ?? c.team.logos?.[0]?.href,
    espnId:    String(c.team?.id ?? ""),
    form:      parseForm(c.form),
    record:    parseRecord(role === "home" ? homeAll?.summary : awayAll?.summary),
    splits: {
      home: role === "home" ? parseRecord(homeHomeR?.summary) : { wins: 0, losses: 0 },
      away: role === "away" ? parseRecord(awayAwayR?.summary) : { wins: 0, losses: 0 },
    },
    players: [],
  });

  const homeScoreParsed = parseScore(home.score);
  const awayScoreParsed = parseScore(away.score);
  const hasValidScore   = homeScoreParsed != null && awayScoreParsed != null;

  return {
    id:       `${sport}-${event.id}`,
    sport,
    status,
    kickoff:  event.date,
    venue:    venue?.fullName ?? "TBA",
    city:     city || "TBA",
    homeTeam: makeTeam(home, "home"),
    awayTeam: makeTeam(away, "away"),
    score:
      status !== "upcoming" && hasValidScore
        ? { home: homeScoreParsed!, away: awayScoreParsed! }
        : undefined,
    liveMinute,
    h2h: [],
    boxScore: undefined,
  };
}

// ─── Game detail (summary endpoint) ──────────────────────────────────────────

export interface ESPNRosterEntry {
  athleteId: string;
  name: string;
  position: string;
  jersey?: string;
  headshot?: string;
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  stats: Record<string, string | number | null>;
  teamId: string;
  teamName: string;
  homeAway: "home" | "away";
}

export interface ESPNSummary {
  rosters?: ESPNRosterEntry[];
  players?:   Player[];
  injuries?:  Array<{ player: string; position: string; status: string; note: string; teamName: string }>;
  boxScore?:  BoxScore;
  h2h?:       H2HGame[];
  homeTeamId?: string;
  awayTeamId?: string;
  weather?:   { condition: string; tempC: number; windKph: number; humidity: number } | null;
  teamStats?: {
    home: Record<string, string | number | null>;
    away: Record<string, string | number | null>;
  };
  lineScores?: { home: number[]; away: number[] };
  scoringPlays?: import("@/lib/types").ScoringEvent[];
}

export async function fetchESPNSummary(sport: ESPNSport, eventId: string, revalidate: number = 30): Promise<ESPNSummary> {
  const url = `${BASE}/${ESPN_PATHS[sport]}/summary?event=${eventId}`;
  try {
    console.info("[SportsPulse] fetchESPNSummary", { sport, eventId, url, revalidate });
    
    // In Next.js, revalidate: 0 is equivalent to cache: 'no-store'
    const res = await fetch(url, {
      ...(revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } }),
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    
    console.info("[SportsPulse] fetchESPNSummary status", { sport, eventId, status: res.status });
    if (!res.ok) return {};
    const raw = await res.json();
    console.info("[SportsPulse] fetchESPNSummary response", {
      sport,
      eventId,
      hasBoxscore: Boolean(raw?.boxscore),
      playerSections: Array.isArray(raw?.boxscore?.players) ? raw.boxscore.players.length : null,
      teamSections: Array.isArray(raw?.boxscore?.teams) ? raw.boxscore.teams.length : null,
    });
    const fantasyMap = sport === "afl" ? await getAFLFantasyMap() : null;
    return parseSummary(raw, sport, fantasyMap);
  } catch {
    return {};
  }
}


// ─── AFL player stat snapshot from a completed game ──────────────────────────

export interface AFLGamePlayerStats {
  name:    string;
  teamId:  string;
  side:    "home" | "away";
  D: number; G: number; M: number; T: number; HO: number; K: number; H: number;
}

/** Fetches raw player stats from a completed AFL game's box score. Cached 24h. */
export async function fetchAFLBoxScoreForPicks(eventId: string): Promise<AFLGamePlayerStats[]> {
  const url = `${BASE}/${ESPN_PATHS.afl}/summary?event=${eventId}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) return [];
    const raw = await res.json();
    const sections: any[] = raw.boxscore?.players ?? [];
    if (!sections.length) return [];

    const STATS = ["D","G","B","T","M","FF","FA","CP","UP","K","H","HO"] as const;
    const results: AFLGamePlayerStats[] = [];

    sections.slice(0, 2).forEach((section: any, sectionIdx: number) => {
      const side = sectionIdx === 0 ? "home" : "away";
      const teamId = String(section.team?.id ?? "");
      const statGroup = (section.statistics ?? [])[0];
      if (!statGroup) return;
      const labels: string[] = statGroup.labels ?? [];
      const idxMap: Record<string, number> = {};
      STATS.forEach(s => { const i = labels.indexOf(s); if (i >= 0) idxMap[s] = i; });

      (statGroup.athletes ?? []).forEach((a: any) => {
        if (a.active === false) return;
        const name = a.athlete?.displayName;
        if (!name) return;
        const getN = (s: string) => Number(a.stats?.[idxMap[s]] ?? 0) || 0;
        results.push({
          name, teamId, side,
          D: getN("D"), G: getN("G"), M: getN("M"), T: getN("T"),
          HO: getN("HO"), K: getN("K"), H: getN("H"),
        });
      });
    });
    return results;
  } catch {
    return [];
  }
}

export interface NBAGamePlayerStats {
  name:   string;
  teamId: string;
  side:   "home" | "away";
  PTS:    number;
  REB:    number;
  AST:    number;
  FG3M:   number;
  STL:    number;
  BLK:    number;
  /** Minutes played. Parsed from ESPN "MM:SS" format. 0 if not available. */
  MIN:    number;
}

/** Fetches raw player stats from a completed NBA game's box score. Cached 24h. */
export async function fetchNBABoxScoreForPicks(eventId: string): Promise<NBAGamePlayerStats[]> {
  const url = `${BASE}/${ESPN_PATHS.basketball}/summary?event=${eventId}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) return [];
    const raw = await res.json();
    const sections: any[] = raw.boxscore?.players ?? [];
    if (!sections.length) return [];

    const results: NBAGamePlayerStats[] = [];

    sections.slice(0, 2).forEach((section: any, sectionIdx: number) => {
      const side   = sectionIdx === 0 ? "home" : "away";
      const teamId = String(section.team?.id ?? "");
      const statGroups: any[] = section.statistics ?? [];

      for (const group of statGroups) {
        const labels: string[] = group.labels ?? group.names ?? [];
        const idxPTS  = labels.indexOf("PTS");
        const idxREB  = labels.indexOf("REB");
        const idxAST  = labels.indexOf("AST");
        const idx3PT  = labels.indexOf("3PT");
        const idxSTL  = labels.indexOf("STL");
        const idxBLK  = labels.indexOf("BLK");
        const idxMIN  = labels.indexOf("MIN");

        for (const a of group.athletes ?? []) {
          if (a.didNotPlay || a.active === false) continue;
          const name = a.athlete?.displayName;
          if (!name) continue;

          const getN = (idx: number): number => {
            if (idx < 0) return 0;
            const v = a.stats?.[idx];
            if (v == null) return 0;
            // PTS etc. are plain numbers; 3PT comes as "m-a" string
            if (typeof v === "string" && v.includes("-")) {
              return Number(v.split("-")[0]) || 0;
            }
            return Number(v) || 0;
          };

          /** Parse "MM:SS" minutes string → decimal minutes */
          const parseMin = (idx: number): number => {
            if (idx < 0) return 0;
            const v = a.stats?.[idx];
            if (v == null) return 0;
            if (typeof v === "string" && v.includes(":")) {
              const [mm, ss] = v.split(":").map(Number);
              return (mm ?? 0) + (ss ?? 0) / 60;
            }
            return Number(v) || 0;
          };

          // Skip if already added (starters / bench groups overlap)
          if (results.find(r => r.name === name && r.teamId === teamId)) continue;

          results.push({
            name, teamId, side,
            PTS:  getN(idxPTS),
            REB:  getN(idxREB),
            AST:  getN(idxAST),
            FG3M: getN(idx3PT),
            STL:  getN(idxSTL),
            BLK:  getN(idxBLK),
            MIN:  parseMin(idxMIN),
          });
        }
      }
    });
    return results;
  } catch {
    return [];
  }
}

function parseSummary(raw: any, sport: ESPNSport, fantasyMap: Map<string, number> | null = null): ESPNSummary {
  const result: ESPNSummary = {};

  // ── Team IDs (needed for schedule lookups) ────────────────────────
  const comps = raw.header?.competitions?.[0]?.competitors ?? [];
  const homeComp = comps.find((c: any) => c.homeAway === "home");
  const awayComp = comps.find((c: any) => c.homeAway === "away");
  result.homeTeamId = homeComp?.team?.id;
  result.awayTeamId = awayComp?.team?.id;

  // ── Line scores (quarter / period scores — NBA & AFL) ────────────────────
  const parseLinescores = (comp: any): number[] =>
    (comp?.linescores ?? []).map((ls: any) => Number(ls.displayValue ?? ls.value ?? 0));
  const homeLS = parseLinescores(homeComp);
  const awayLS = parseLinescores(awayComp);
  // For AFL, limit to 4 quarters (ESPN may return more for OT)
  if (homeLS.length > 0 && awayLS.length > 0) {
    result.lineScores = { home: homeLS.slice(0, 4), away: awayLS.slice(0, 4) };
  }

  // ── Scoring plays (step-function momentum chart) ─────────────────
  // ESPN AFL uses raw.plays (all scoring events — goals & behinds)
  const rawPlays: any[] = raw.plays ?? raw.scoringPlays ?? [];
  if (rawPlays.length > 0 && homeComp && awayComp) {
    const homeId = homeComp.team?.id;
    result.scoringPlays = rawPlays
      .filter((p: any) => p.period?.number >= 1 && p.period?.number <= 4
        && (p.homeScore != null || p.awayScore != null))
      .map((p: any): ScoringEvent => {
        // ESPN clock for AFL is "MM:SS" elapsed in the quarter (counts up)
        const [mm = "0", ss = "0"] = (p.clock?.displayValue ?? "0:00").split(":");
        const clockSecs = Number(mm) * 60 + Number(ss);
        const teamId    = p.team?.id ?? p.team?.uid?.split(":").pop();
        return {
          quarter:   p.period.number,
          clockSecs,
          homeScore: Number(p.homeScore ?? 0),
          awayScore: Number(p.awayScore ?? 0),
          team:      teamId === homeId ? "home" : "away",
        };
      });
  }

  // ── Injuries ──────────────────────────────────────────────────────
  const rawInjuries = raw.injuries?.injuries ?? raw.gamepackageJSON?.injuries?.injuries ?? [];
  result.injuries = rawInjuries.flatMap((teamObj: any) =>
    (teamObj.injuries ?? []).map((inj: any) => ({
      teamName: teamObj.team?.displayName ?? "",
      player:   inj.athlete?.displayName ?? "Unknown",
      position: inj.athlete?.position?.abbreviation ?? "",
      status:   inj.status ?? "Questionable",
      note:     inj.details?.type ? `${inj.details.type}${inj.details.detail ? " — " + inj.details.detail : ""}` : inj.status ?? "",
    }))
  );

  // ── Weather (outdoor games — NFL/soccer) ─────────────────────────
  const w = raw.gameInfo?.weather ?? raw.gamepackageJSON?.gameInfo?.weather;
  if (w?.displayValue && w.displayValue !== "N/A") {
    const tempF = w.temperature ?? 68;
    result.weather = {
      condition: mapESPNWeather(w.displayValue),
      tempC:     Math.round((tempF - 32) * 5 / 9),
      windKph:   Math.round((w.windSpeed ?? 0) * 1.609),
      humidity:  60,
    };
  }

  // ── Box score ─────────────────────────────────────────────────────
  const bsPlayers = Array.isArray(raw?.boxscore?.players) ? raw.boxscore.players : [];
  if (bsPlayers.length > 0) {
    result.boxScore = parseBoxScore(bsPlayers, sport, fantasyMap);
  } else if (sport === "soccer" && Array.isArray(raw?.rosters) && raw.rosters.length > 0) {
    // ESPN soccer uses rosters instead of boxscore.players
    result.boxScore = parseSoccerRostersBoxScore(raw.rosters);
  } else if (raw?.boxscore) {
    result.boxScore = parseBoxScore(bsPlayers, sport, fantasyMap);
  }

  const bsTeams = raw.boxscore?.teams ?? [];
  if (bsTeams.length >= 2) {
    const parseTeamStats = (t: any): Record<string, string | number | null> =>
      Object.fromEntries(
        (t.statistics ?? []).map((s: any) => [
          s.abbreviation ?? s.name ?? s.displayName ?? "stat",
          s.displayValue ?? s.value ?? null,
        ])
      );
    result.teamStats = {
      home: parseTeamStats(bsTeams[0]),
      away: parseTeamStats(bsTeams[1]),
    };
  }

  // ── Rosters (soccer) ──────────────────────────────────────────────
  if (sport === "soccer" && Array.isArray(raw?.rosters)) {
    result.rosters = raw.rosters.flatMap((r: any): ESPNRosterEntry[] => {
      const homeAway: "home" | "away" = r.homeAway === "home" ? "home" : "away";
      const teamId = String(r.team?.id ?? "");
      const teamName = r.team?.displayName ?? "";
      return (r.roster ?? []).map((p: any): ESPNRosterEntry => {
        const stats: Record<string, string | number | null> = {};
        for (const s of p.stats ?? []) {
          const key = s.abbreviation ?? s.name;
          if (key) stats[key] = s.displayValue ?? s.value ?? null;
        }
        return {
          athleteId: String(p.athlete?.id ?? ""),
          name: p.athlete?.displayName ?? "Unknown",
          position: p.position?.abbreviation ?? p.athlete?.position?.abbreviation ?? "??",
          jersey: p.jersey ?? p.athlete?.jersey,
          headshot: p.athlete?.headshot?.href ?? p.athlete?.headshot?.url,
          starter: Boolean(p.starter),
          subbedIn: Boolean(p.subbedIn),
          subbedOut: Boolean(p.subbedOut),
          stats,
          teamId,
          teamName,
          homeAway,
        };
      });
    });
  }

  return result;
}

function parseSoccerRostersBoxScore(rosters: any[]): BoxScore | undefined {
  const STAT_KEYS = ["G", "A", "SH", "ST", "FC", "YC", "RC", "SV"];
  const home = rosters.find((r: any) => r.homeAway === "home");
  const away = rosters.find((r: any) => r.homeAway === "away");
  if (!home && !away) return undefined;

  const mapRoster = (r: any): BoxScore["home"] =>
    (r?.roster ?? [])
      .filter((p: any) => p.starter || p.subbedIn)
      .map((p: any) => {
        const stats: Record<string, string | number | null> = {};
        for (const s of p.stats ?? []) {
          const key = s.abbreviation ?? s.name;
          if (key && STAT_KEYS.includes(key)) stats[key] = s.displayValue ?? s.value ?? null;
        }
        return { player: p.athlete?.displayName ?? "Unknown", stats };
      });

  return {
    statHeaders: STAT_KEYS,
    home: mapRoster(home),
    away: mapRoster(away),
  };
}

function mapESPNWeather(val: string): string {
  const v = val.toLowerCase();
  if (v.includes("clear") || v.includes("sunny")) return "Clear";
  if (v.includes("cloud") || v.includes("overcast")) return "Cloudy";
  if (v.includes("partly")) return "Partly Cloudy";
  if (v.includes("rain") || v.includes("shower")) return "Rain";
  if (v.includes("snow")) return "Snow";
  if (v.includes("fog"))  return "Foggy";
  if (v.includes("storm") || v.includes("thunder")) return "Storm";
  return "Clear";
}

function parseBoxScore(bsPlayers: any[], sport: ESPNSport, fantasyMap: Map<string, number> | null = null): BoxScore | undefined {
  if (sport === "basketball") {
    return parseBasketballBoxScore(bsPlayers);
  }
  if (sport === "afl") {
    return parseAFLBoxScore(bsPlayers, fantasyMap);
  }

  // Each entry in bsPlayers is { team: {...}, statistics: [{ names: [], athletes: [] }] }
  const teamSections = bsPlayers.slice(0, 2);
  if (teamSections.length < 2) return undefined;

  // Pick the most relevant stat group per sport
  const STAT_PRIORITY: Record<ESPNSport, string[]> = {
    nfl:        ["passing", "rushing", "receiving"],
    basketball: ["", "starters"],
    soccer:     ["", "starters"],
    ucl:        ["", "starters"],
    uel:        ["", "starters"],
    laliga:     ["", "starters"],
    bundesliga: ["", "starters"],
    aleague:    ["", "starters"],
    afl:        [""],
  };

  function extractRows(teamSection: any): { rows: BoxScore["home"]; headers: string[] } {
    const statGroups: any[] = teamSection.statistics ?? [];
    // Find the largest / most relevant group
    const group =
      statGroups.find((g: any) =>
        STAT_PRIORITY[sport].some((p) => (g.name ?? "").toLowerCase().includes(p))
      ) ?? statGroups[0];
    if (!group) return { rows: [], headers: [] };

    const headers: string[] = group.names ?? group.labels ?? [];
    const rows = (group.athletes ?? [])
      .filter((a: any) => !a.didNotPlay && a.active !== false)
      .slice(0, 6) // top 6 players
      .map((a: any) => ({
        player: a.athlete?.displayName ?? "Unknown",
        stats: Object.fromEntries(
          headers.map((h: string, i: number) => [h, a.stats?.[i] ?? null])
        ),
      }));
    return { rows, headers };
  }

  const homeData = extractRows(teamSections[0]);
  const awayData = extractRows(teamSections[1]);

  if (!homeData.rows.length && !awayData.rows.length) return undefined;

  return {
    statHeaders: homeData.headers.length ? homeData.headers : awayData.headers,
    home: homeData.rows,
    away: awayData.rows,
  };
}

function parseBasketballBoxScore(teamSections: any[]): BoxScore | undefined {
  const NBA_STAT_KEYS = ["MIN", "FG", "3PT", "FT", "OREB", "DREB", "REB", "AST", "STL", "BLK", "TO", "PF", "+/-", "PTS"];
  const DISPLAY_HEADERS = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FG", "3PT", "+/-"];
  if (!Array.isArray(teamSections) || teamSections.length === 0) return undefined;

  function extractTeamRows(teamSection: any): BoxScore["home"] {
    const athleteMap = new Map<string, BoxScore["home"][number]>();
    const statGroups: any[] = teamSection.statistics ?? [];

    for (const group of statGroups) {
      const headers: string[] = group.names ?? group.labels ?? [];
      const groupIsStarters =
        (group.name ?? group.displayName ?? "").toLowerCase().includes("starter");

      for (const athleteRow of group.athletes ?? []) {
        if (athleteRow.didNotPlay) continue;
        const athlete = athleteRow.athlete;
        if (!athlete) continue;

        const name: string = athlete.displayName ?? "Unknown";
        const playerId: string | undefined = athlete.id ? String(athlete.id) : undefined;
        const headshot: string | undefined =
          athlete.headshot?.href ??
          athlete.headshot?.url ??
          (playerId ? `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png` : undefined);

        if (!athleteMap.has(name)) {
          athleteMap.set(name, {
            player: name,
            playerId,
            position: athlete.position?.abbreviation ?? undefined,
            jersey: athlete.jersey ?? undefined,
            headshot,
            starter: athleteRow.starter ?? groupIsStarters,
            stats: {},
          });
        }

        const row = athleteMap.get(name)!;
        headers.forEach((h, i) => {
          if (NBA_STAT_KEYS.includes(h) && row.stats[h] == null) {
            row.stats[h] = athleteRow.stats?.[i] ?? null;
          }
        });
      }
    }

    return Array.from(athleteMap.values())
      .filter(r => r.stats.MIN != null || r.stats.PTS != null)
      .sort((a, b) => {
        if (a.starter && !b.starter) return -1;
        if (!a.starter && b.starter) return 1;
        return Number(b.stats.PTS ?? 0) - Number(a.stats.PTS ?? 0);
      });
  }

  const sections = teamSections.slice(0, 2).map(s => extractTeamRows(s));
  const home = sections[0] ?? [];
  const away = sections[1] ?? [];
  if (!home.length && !away.length) return undefined;

  return { statHeaders: DISPLAY_HEADERS, home, away };
}

function parseAFLBoxScore(teamSections: any[], fantasyMap: Map<string, number> | null = null): BoxScore | undefined {
  // ESPN AFL boxscore: statistics[0].labels = ['D','G','B','T','M','FF','FA','CP','UP','K','H','CM','UM','DE','SI','GA','I50','T50','M50','GACC','HO',...]
  // We display the key AFL stats that fans care about
  const KEY_STATS = ["D", "G", "B", "T", "M", "HO", "K", "H"];

  function extractRows(teamSection: any): BoxScore["home"] {
    const statGroup = (teamSection.statistics ?? [])[0];
    if (!statGroup) return [];
    const allLabels: string[] = statGroup.labels ?? [];
    const keyIndices = KEY_STATS.map((k) => allLabels.indexOf(k));
    return (statGroup.athletes ?? [])
      .filter((a: any) => a.active !== false)
      .map((a: any) => {
        const name = a.athlete?.displayName ?? "Unknown";
        const normalized = normalizeAFLName(name);
        const champId = fantasyMap?.get(normalized);
        const headshot = champId
          ? getAFLCDNPortraitUrl(String(champId))
          : a.athlete?.id ? `https://a.espncdn.com/i/headshots/australian-football/players/full/${a.athlete.id}.png` : undefined;

        if (!champId) {
          console.debug(`[SportsPulse] AFL boxscore portrait miss: "${name}" (normalized: "${normalized}")`);
        }

        return {
          player: name,
          playerId: a.athlete?.id ? String(a.athlete.id) : undefined,
          position: a.athlete?.position?.abbreviation || a.athlete?.position?.name,
          jersey: a.athlete?.jersey,
          headshot,
          stats: Object.fromEntries(
            KEY_STATS.map((k, ki) => [k, a.stats?.[keyIndices[ki]] ?? null])
          ),
        };
      })
      .sort((a: any, b: any) => Number(b.stats.D ?? 0) - Number(a.stats.D ?? 0));
  }

  const sections = teamSections.slice(0, 2);
  if (!sections.length) return undefined;
  const home = extractRows(sections[0]);
  const away = extractRows(sections[1] ?? sections[0]);
  if (!home.length && !away.length) return undefined;

  const total = home.length + away.length;
  const matched = [...home, ...away].filter(r => r.headshot && !r.headshot.includes("espncdn")).length;
  console.info(`[SportsPulse] AFL boxscore portrait coverage: ${matched}/${total} (${total ? Math.round(matched / total * 100) : 0}%)`);

  return { statHeaders: KEY_STATS, home, away };
}

// ─── Team schedule → form + H2H ──────────────────────────────────────────────

export async function fetchTeamSchedule(
  sport: ESPNSport,
  teamId: string,
  seasons?: number[]
): Promise<any[]> {
  const currentYear = new Date().getFullYear();
  const isSoccerOrAFL = ["soccer", "ucl", "uel", "laliga", "bundesliga", "aleague", "afl"].includes(sport);
  const yearsToFetch = seasons ?? (
    isSoccerOrAFL
      ? [currentYear, currentYear - 1, currentYear - 2]
      : [currentYear]
  );

  const results = await Promise.all(
    yearsToFetch.map(async (year) => {
      const url = `${BASE}/${ESPN_PATHS[sport]}/teams/${teamId}/schedule?season=${year}`;
      try {
        const res = await fetch(url, {
          next: { revalidate: 3600 },
          headers: { "User-Agent": "SportsPulse/1.0 personal" },
        });
        console.info("[SportsPulse] fetchTeamSchedule", { sport, teamId, year, status: res.status });
        if (!res.ok) return [];
        const data = await res.json();
        return data.events ?? [];
      } catch {
        return [];
      }
    })
  );

  const seen = new Set<string>();
  const all: any[] = [];
  for (const events of results) {
    for (const e of events) {
      const id = String(e.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(e);
    }
  }
  return all.sort((a, b) => (a.date > b.date ? -1 : 1));
}

/** Derives last-5 form and home/away record from team schedule events. */
export function deriveFormFromSchedule(
  events: any[],
  teamId: string,
  sport: ESPNSport = "soccer"
): { form: FormResult[]; homeRec: { wins: number; losses: number; draws: number }; awayRec: { wins: number; losses: number; draws: number } } {
  const finished = events.filter(
    (e) =>
      e.competitions?.[0]?.status?.type?.state === "post" &&
      e.season?.type !== 1 && e.season?.type !== "1" &&
      e.seasonType !== 1 && e.seasonType !== "1"
  );

  const form: FormResult[] = [];
  const homeRec = { wins: 0, losses: 0, draws: 0 };
  const awayRec = { wins: 0, losses: 0, draws: 0 };

  for (const ev of finished) {
    const comp  = ev.competitions[0];
    const me    = comp.competitors.find((c: any) => c.team?.id === teamId);
    const opp   = comp.competitors.find((c: any) => c.team?.id !== teamId);
    if (!me || !opp) continue;

    const isHome = me.homeAway === "home";
    const myScore  = parseScore(me.score);
    const oppScore = parseScore(opp.score);
    if (myScore == null || oppScore == null) continue;

    const result = gameResult(sport, myScore, oppScore);

    if (form.length < 5) form.push(result);

    const rec = isHome ? homeRec : awayRec;
    if (result === "W") rec.wins++;
    else if (result === "L") rec.losses++;
    else rec.draws++;
  }

  return { form, homeRec, awayRec };
}

/** Finds past meetings between two teams from one team's schedule. */
export function findH2HFromSchedule(
  events: any[],
  myTeamName: string,
  opponentId: string,
  options?: { limit?: number; filter?: VenueFilter; sport?: ESPNSport }
): H2HGame[] {
  const limit = options?.limit ?? 5;
  const filter = options?.filter ?? "all";
  const sport = options?.sport;
  const meetings: H2HGame[] = [];

  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const opp = comp.competitors?.find((c: any) => c.team?.id === opponentId);
    if (!opp) continue;

    const status = comp.status?.type?.state;
    if (status !== "post") continue; // only completed games

    // Skip pre-season games
    const seasonType = ev.season?.type ?? ev.seasonType;
    if (seasonType === 1 || seasonType === "1") continue;

    const home = comp.competitors.find((c: any) => c.homeAway === "home");
    const away = comp.competitors.find((c: any) => c.homeAway === "away");
    if (!home || !away) continue;
    const isMyHome = home.team.displayName === myTeamName;
    if (filter === "home" && !isMyHome) continue;
    if (filter === "away" && isMyHome) continue;

    const homeScore = parseScore(home.score);
    const awayScore = parseScore(away.score);
    if (homeScore == null || awayScore == null) continue;

    let winner: string;
    if (homeScore > awayScore)      winner = home.team.displayName;
    else if (awayScore > homeScore) winner = away.team.displayName;
    else                            winner = "Draw";

    meetings.push({
      gameId:   sport ? `${sport}-${String(ev.id ?? "")}` : String(ev.id ?? ""),
      date:     ev.date?.slice(0, 10) ?? "",
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      score:    `${homeScore}-${awayScore}`,
      venue:    comp.venue?.fullName ?? comp.venue?.name ?? "Unknown",
      winner,
    });

    if (meetings.length >= limit) break;
  }

  return meetings;
}

export function deriveTeamHistoryFromSchedule(
  sport: ESPNSport,
  events: any[],
  teamId: string,
  filter: VenueFilter = "all"
): TeamHistoryGame[] {
  const out: TeamHistoryGame[] = [];
  for (const ev of events) {
    // Skip pre-season games (seasonType 1 = preseason)
    const seasonType = ev.season?.type ?? ev.seasonType;
    if (seasonType === 1 || seasonType === "1") continue;
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    // Only include finished games
    if (comp.status?.type?.state !== "post") continue;
    const me = comp.competitors?.find((c: any) => c.team?.id === teamId);
    const opp = comp.competitors?.find((c: any) => c.team?.id !== teamId);
    if (!me || !opp) continue;
    const homeAway = me.homeAway === "home" ? "home" : "away";
    if (filter !== "all" && filter !== homeAway) continue;
    const myScore = parseScore(me.score);
    const oppScore = parseScore(opp.score);
    const result =
      myScore != null && oppScore != null
        ? gameResult(sport, myScore, oppScore)
        : null;
    out.push({
      gameId: `${sport}-${String(ev.id ?? "")}`,
      date: String(ev.date ?? "").slice(0, 10),
      venue: comp.venue?.fullName ?? comp.venue?.name ?? "Unknown",
      homeAway,
      opponent: opp.team?.displayName ?? "Unknown",
      score:
        myScore != null && oppScore != null &&
        Number.isFinite(myScore) && Number.isFinite(oppScore)
          ? `${myScore}-${oppScore}`
          : null,
      result,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}