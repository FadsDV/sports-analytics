/**
 * ESPN soccer data adapter — replaces Sofascore for server-side use.
 *
 * ESPN is free, works from Vercel (no IP blocking), and already used for AFL/NBA.
 * Returns data in SofascoreMatchData shape so all existing components work unchanged.
 *
 * Coverage per match:
 *   ✅ Lineups (starters + bench)
 *   ✅ Goals (scoringPlays)
 *   ✅ Yellow/red cards (keyEvents)
 *   ✅ Substitutions (keyEvents)
 *   ✅ Team stats (possession, shots, corners, fouls, etc.)
 *   ✅ Match stats (reshaped to SofascoreMatchStats groups)
 *   ✅ Player recent game history (team schedule traversal)
 *   ❌ Player ratings / xG / xA
 */

import type {
  SofascoreMatchData,
  SofascoreLineup,
  SofascorePlayer,
  SofascoreIncident,
  SofascoreTeamStats,
  SofascoreMatchStats,
  SofascoreGameLog,
} from "@/lib/sports/sofascore";
import { ESPN_PATHS } from "@/lib/sports/espn";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

type SoccerSport = "soccer" | "ucl" | "uel" | "laliga" | "bundesliga" | "aleague" | "worldcup";

async function espnGet(path: string, revalidate = 60): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE}/${path}`, {
      ...(revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } }),
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Score parser — ESPN score can be string "2" or object {value:2} ─────────

function parseScore(s: any): number {
  if (s == null) return 0;
  if (typeof s === "number") return s;
  if (typeof s === "string") return parseInt(s, 10) || 0;
  if (typeof s === "object") return parseInt(String(s.value ?? s.displayValue ?? "0"), 10) || 0;
  return 0;
}

// ─── Parse ESPN rosters into SofascoreLineup ─────────────────────────────────

function parseESPNRosters(raw: Record<string, unknown>): SofascoreLineup | null {
  const rosters = raw.rosters as any[] | undefined;
  if (!rosters || rosters.length < 2) return null;

  const home = rosters.find((r: any) => r.homeAway === "home");
  const away = rosters.find((r: any) => r.homeAway === "away");
  if (!home && !away) return null;

  const parseTeam = (roster: any): SofascorePlayer[] =>
    (roster?.roster ?? []).map((p: any): SofascorePlayer => {
      const stats: Record<string, number | null> = {};
      for (const s of p.stats ?? []) {
        const key = s.abbreviation ?? s.name;
        const val = s.value != null ? Number(s.value) : null;
        if (key) stats[key] = typeof val === "number" && !isNaN(val) ? val : null;
      }
      return {
        id:           parseInt(p.athlete?.id ?? "0", 10) || 0,
        name:         p.athlete?.displayName ?? "Unknown",
        shortName:    p.athlete?.shortName ?? p.athlete?.displayName ?? "Unknown",
        position:     p.position?.abbreviation ?? p.athlete?.position?.abbreviation ?? "?",
        jerseyNumber: String(p.jersey ?? p.athlete?.jersey ?? ""),
        starter:      Boolean(p.starter),
        stats,
      };
    });

  const homeTeam = parseTeam(home);
  const awayTeam = parseTeam(away);
  // Return null when ESPN has roster stubs but no actual players (pre-match)
  if (homeTeam.length === 0 && awayTeam.length === 0) return null;

  return {
    confirmed:    true,
    homeFormation: home?.formation as string | undefined,
    awayFormation: away?.formation as string | undefined,
    home: homeTeam,
    away: awayTeam,
  };
}

// ─── Parse ESPN scoring plays + key events into incidents ─────────────────────

function parseESPNIncidents(raw: Record<string, unknown>): SofascoreIncident[] {
  const incidents: SofascoreIncident[] = [];

  // Goals from scoringPlays
  const plays = (raw.scoringPlays as any[]) ?? [];
  for (const p of plays) {
    const clock  = (p.clock?.displayValue as string) ?? "";
    const minute = parseESPNMinute(clock);
    const homeAway = String(p.team?.homeAway ?? (p.homeAway as string) ?? "");
    const isHome = homeAway === "home" || (p.team?.id != null && p.team.id === (raw as any).__homeTeamId);
    const desc = (p.text ?? p.type?.text ?? "") as string;
    incidents.push({
      type:        "goal",
      minute,
      isHome,
      playerName:  (p.scoringPlay?.athlete?.displayName as string) ?? extractPlayerFromDesc(desc),
      incidentClass: desc.toLowerCase().includes("penalty") ? "penalty" : "regular",
    });
  }

  // Cards and subs from keyEvents
  const keyEvents = (raw.keyEvents as any[]) ?? [];
  for (const ev of keyEvents) {
    const clock  = (ev.clock?.displayValue as string) ?? "";
    const minute = parseESPNMinute(clock);
    const isHome = (ev.team?.homeAway as string) === "home";
    const desc = (ev.text ?? ev.type?.text ?? "") as string;
    const lower = desc.toLowerCase();

    if (lower.includes("yellow card")) {
      incidents.push({
        type: "card", minute, isHome,
        playerName:    extractPlayerFromDesc(desc),
        incidentClass: "yellow",
      });
    } else if (lower.includes("red card")) {
      incidents.push({
        type: "card", minute, isHome,
        playerName:    extractPlayerFromDesc(desc),
        incidentClass: "red",
      });
    } else if (lower.includes("substitution") || ev.type?.id === "substitution") {
      incidents.push({
        type:          "substitution", minute, isHome,
        playerInName:  (ev.participants?.[0]?.athlete?.displayName as string),
        playerOutName: (ev.participants?.[1]?.athlete?.displayName as string),
      });
    }
  }

  return incidents.sort((a, b) => a.minute - b.minute);
}

function parseESPNMinute(clock: string): number {
  if (!clock) return 0;
  const [mm = "0"] = clock.split(":");
  return parseInt(mm, 10) || 0;
}

function extractPlayerFromDesc(desc: string): string | undefined {
  const m = desc.match(/^([A-Z][a-zA-Z\s\-']+?)(?:\s+\(|$)/);
  return m?.[1]?.trim();
}

// ─── Parse ESPN team stats into SofascoreTeamStats ────────────────────────────

function parseESPNTeamStats(
  statsArr: any[]
): SofascoreTeamStats {
  const map: Record<string, number> = {};
  for (const s of statsArr) {
    const key = (s.abbreviation ?? s.name ?? "") as string;
    const val = parseFloat(String(s.value ?? s.displayValue ?? "0")) || 0;
    map[key.toLowerCase()] = val;
  }
  // ESPN stat abbreviation → SofascoreTeamStats field
  return {
    matches:                  0,
    goalsScored:              map["g"] ?? map["goals"] ?? 0,
    goalsConceded:            0,
    shots:                    map["sh"] ?? map["shots"] ?? null,
    shotsOnTarget:            map["st"] ?? map["shotsontarget"] ?? null,
    corners:                  map["ck"] ?? map["cornerkicks"] ?? map["co"] ?? null,
    fouls:                    map["f"] ?? map["fouls"] ?? null,
    yellowCards:              map["yc"] ?? map["yellowcards"] ?? null,
    redCards:                 map["rc"] ?? map["redcards"] ?? null,
    saves:                    map["sv"] ?? map["saves"] ?? null,
    averageBallPossession:    map["poss"] ?? map["possession"] ?? null,
    accuratePassesPercentage: map["passpct"] ?? null,
  };
}

// ─── Parse ESPN team stats into SofascoreMatchStats groups ───────────────────

// Human-readable overrides for ESPN's camelCase/abbreviated stat names
const ESPN_STAT_LABELS: Record<string, string> = {
  foulsCommitted:        "Fouls",
  yellowCards:           "Yellow Cards",
  redCards:              "Red Cards",
  offsides:              "Offsides",
  wonCorners:            "Corners Won",
  saves:                 "Saves",
  possessionPct:         "Possession %",
  totalShots:            "Total Shots",
  shotsOnTarget:         "Shots on Target",
  shotsOffTarget:        "Shots off Target",
  blockedShots:          "Blocked Shots",
  shotPct:               "Shot Accuracy %",
  penaltyKickGoals:      "Penalty Goals",
  penaltyKickShots:      "Penalty Shots",
  accuratePasses:        "Accurate Passes",
  totalPasses:           "Total Passes",
  passPct:               "Pass Accuracy %",
  accurateCrosses:       "Accurate Crosses",
  totalCrosses:          "Total Crosses",
  crossPct:              "Cross Accuracy %",
  totalLongBalls:        "Long Balls",
  accurateLongBalls:     "Accurate Long Balls",
  longballPct:           "Long Ball Accuracy %",
  effectiveTackles:      "Effective Tackles",
  totalTackles:          "Total Tackles",
  tacklePct:             "Tackle Success %",
  interceptions:         "Interceptions",
  effectiveClearance:    "Effective Clearances",
  totalClearance:        "Total Clearances",
  wonGroundDuels:        "Ground Duels Won",
  wonAerialDuels:        "Aerial Duels Won",
  groundDuelPct:         "Ground Duel Win %",
  aerialDuelPct:         "Aerial Duel Win %",
  goalKicks:             "Goal Kicks",
  throwIns:              "Throw-ins",
};

// Convert camelCase or ALL_CAPS stat names to human-readable
function formatStatName(raw: string): string {
  if (ESPN_STAT_LABELS[raw]) return ESPN_STAT_LABELS[raw];
  // camelCase → "Title Case"
  return raw
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function parseESPNMatchStats(
  homeStats: any[],
  awayStats: any[]
): SofascoreMatchStats[] {
  const items = homeStats.map((hs: any) => {
    const as_ = awayStats.find((a: any) => (a.abbreviation ?? a.name) === (hs.abbreviation ?? hs.name));
    const hv = parseFloat(String(hs.value ?? hs.displayValue ?? "0")) || 0;
    const av = parseFloat(String(as_?.value ?? as_?.displayValue ?? "0")) || 0;
    const rawName = String(hs.displayName ?? hs.name ?? hs.abbreviation ?? "");
    return {
      name:           formatStatName(rawName),
      home:           String(hs.displayValue ?? hs.value ?? "0"),
      away:           String(as_?.displayValue ?? as_?.value ?? "0"),
      homeValue:      hv,
      awayValue:      av,
      statisticsType: "positive" as const,
      compareCode:    hv > av ? 1 : hv < av ? 3 : 2,
      renderType:     1,
    };
  }).filter(it => it.name);

  if (items.length === 0) return [];
  return [{ period: "ALL", groups: [{ groupName: "Match Statistics", statisticsItems: items }] }];
}

// ─── Main match data fetch ────────────────────────────────────────────────────

export async function fetchESPNSoccerMatchData(
  sport:     string,
  eventId:   string
): Promise<SofascoreMatchData | null> {
  const path = ESPN_PATHS[sport as SoccerSport];
  if (!path) return null;

  const raw = await espnGet(`${path}/summary?event=${eventId}`, 60);
  if (!raw) return null;

  const lineups   = parseESPNRosters(raw);
  const incidents = parseESPNIncidents(raw);

  const bsTeams = (raw.boxscore as any)?.teams as any[] ?? [];
  let homeTeamStats: SofascoreTeamStats | null = null;
  let awayTeamStats: SofascoreTeamStats | null = null;
  let matchStats: SofascoreMatchStats[] = [];

  if (bsTeams.length >= 2) {
    const homeStatsArr = bsTeams[0]?.statistics ?? [];
    const awayStatsArr = bsTeams[1]?.statistics ?? [];
    homeTeamStats = parseESPNTeamStats(homeStatsArr);
    awayTeamStats = parseESPNTeamStats(awayStatsArr);
    matchStats    = parseESPNMatchStats(homeStatsArr, awayStatsArr);
  }

  // Extract ESPN team IDs for kitchen player history fetching
  const comps  = (raw.header as any)?.competitions?.[0] ?? (raw as any).gameInfo?.competition ?? {};
  const compArr: any[] = (raw as any).boxscore?.teams ?? [];
  const homeTeamId = compArr[0]?.team?.id as string | undefined;
  const awayTeamId = compArr[1]?.team?.id as string | undefined;

  return {
    sofascoreId:   parseInt(eventId, 10) || 0,
    lineups,
    incidents,
    homeTeamStats,
    awayTeamStats,
    matchStats:    matchStats.length > 0 ? matchStats : undefined,
    // Store ESPN IDs in the numeric fields (used for player kitchen fetch)
    homeTeamId:    homeTeamId ? parseInt(homeTeamId, 10) : undefined,
    awayTeamId:    awayTeamId ? parseInt(awayTeamId, 10) : undefined,
  };
}

// ─── Team game history (per-game stats for pre-match intelligence) ───────────

export interface TeamGameStat {
  gameId:        string;
  date:          string;
  isHome:        boolean;
  opponent:      string;
  goalsFor:      number;
  goalsAgainst:  number;
  corners:       number | null;
  shots:         number | null;
  shotsOnTarget: number | null;
  yellowCards:   number | null;
  fouls:         number | null;
  possession:    number | null;
}

export async function fetchESPNSoccerTeamHistory(
  sport:  string,
  teamId: string,
  limit:  number = 10
): Promise<TeamGameStat[]> {
  const path = ESPN_PATHS[sport as SoccerSport];
  if (!path) return [];

  const schedData = await espnGet(`${path}/teams/${teamId}/schedule`, 1800);
  if (!schedData) return [];

  const events: any[] = (schedData.events as any[]) ?? [];
  const completed = events
    .filter((ev: any) => ev.competitions?.[0]?.status?.type?.state === "post")
    .slice(-limit);  // last N completed games

  const results: TeamGameStat[] = [];

  const BATCH = 5;
  for (let i = 0; i < completed.length; i += BATCH) {
    const batch = completed.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (ev: any) => {
      const gameId  = String(ev.id ?? "");
      const date    = String(ev.date ?? "").slice(0, 10);
      const comp    = ev.competitions?.[0];
      if (!gameId || !comp) return null;

      const homeSide = comp.competitors?.find((c: any) => c.homeAway === "home");
      const awaySide = comp.competitors?.find((c: any) => c.homeAway === "away");
      const isHome   = String(homeSide?.team?.id) === teamId;
      const mySide   = isHome ? homeSide : awaySide;
      const oppSide  = isHome ? awaySide : homeSide;



      const opponent = oppSide?.team?.displayName ?? "";

      // Fetch match summary for detailed stats (shared cache with player history — no extra cost)
      const summary = await espnGet(`${path}/summary?event=${gameId}`, 86400);
      let corners: number | null = null;
      let shots: number | null = null;
      let shotsOnTarget: number | null = null;
      let yellowCards: number | null = null;
      let fouls: number | null = null;
      let possession: number | null = null;
      // Goals default to schedule score; boxscore "G" stat overrides if available
      let goalsFor     = parseScore(mySide?.score);
      let goalsAgainst = parseScore(oppSide?.score);

      if (summary) {
        const bsTeams: any[] = (summary.boxscore as any)?.teams ?? [];
        // Find our team's stats array
        const myTeamBs  = bsTeams.find((t: any) => String(t.team?.id) === teamId);
        const oppTeamBs = bsTeams.find((t: any) => String(t.team?.id) !== teamId);
        const statsArr: any[]    = myTeamBs?.statistics  ?? [];
        const oppStatsArr: any[] = oppTeamBs?.statistics ?? [];

        const getStatVal = (arr: any[], abbrevs: string[]): number | null => {
          for (const abbr of abbrevs) {
            const s = arr.find((x: any) =>
              (x.abbreviation ?? x.name ?? "").toLowerCase() === abbr.toLowerCase()
            );
            if (s != null) {
              const v = parseFloat(String(s.value ?? s.displayValue ?? ""));
              if (!isNaN(v)) return v;
            }
          }
          return null;
        };

        // Try to get goals from boxscore (more reliable than schedule score field)
        const bsGoalsFor     = getStatVal(statsArr,    ["G", "goals", "goalsscored"]);
        const bsGoalsAgainst = getStatVal(oppStatsArr, ["G", "goals", "goalsscored"]);
        if (bsGoalsFor     != null) goalsFor     = bsGoalsFor;
        if (bsGoalsAgainst != null) goalsAgainst = bsGoalsAgainst;

        corners       = getStatVal(statsArr, ["CK", "CO", "CornerKicks", "Corners"]);
        shots         = getStatVal(statsArr, ["SH", "Shots"]);
        shotsOnTarget = getStatVal(statsArr, ["ST", "ShotsOnTarget"]);
        yellowCards   = getStatVal(statsArr, ["YC", "YellowCards"]);
        fouls         = getStatVal(statsArr, ["F", "Fouls"]);
        possession    = getStatVal(statsArr, ["POSS", "Possession"]);
      }

      return { gameId, date, isHome, opponent, goalsFor, goalsAgainst, corners, shots, shotsOnTarget, yellowCards, fouls, possession } satisfies TeamGameStat;
    }));

    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  // Most recent first
  return results.reverse();
}

// ─── Player game history via team schedule traversal ─────────────────────────

export async function fetchESPNSoccerPlayerHistory(
  sport:    string,
  teamId:   string,
  limit:    number = 8
): Promise<Map<string, SofascoreGameLog[]>> {
  const path = ESPN_PATHS[sport as SoccerSport];
  if (!path) return new Map();

  // Fetch team schedule
  const schedData = await espnGet(`${path}/teams/${teamId}/schedule`, 1800);
  if (!schedData) return new Map();

  const events: any[] = (schedData.events as any[]) ?? [];
  const completed = events
    .filter((ev: any) => ev.competitions?.[0]?.status?.type?.state === "post")
    .slice(-limit)
    .reverse(); // most recent first

  // Fetch each completed game's summary in batches of 5
  const BATCH = 5;
  const playerHistories = new Map<string, SofascoreGameLog[]>();

  for (let i = 0; i < completed.length; i += BATCH) {
    const batch = completed.slice(i, i + BATCH);
    await Promise.all(batch.map(async (ev: any) => {
      const gameId  = String(ev.id ?? "");
      const date    = String(ev.date ?? "").slice(0, 10);
      const comp    = ev.competitions?.[0];
      if (!gameId || !comp) return;

      const homeSide = comp.competitors?.find((c: any) => c.homeAway === "home");
      const awaySide = comp.competitors?.find((c: any) => c.homeAway === "away");
      const homeTeamName = homeSide?.team?.displayName ?? "";
      const awayTeamName = awaySide?.team?.displayName ?? "";
      const homeScore    = parseScore(homeSide?.score);
      const awayScore    = parseScore(awaySide?.score);
      const homeTeamId_  = parseInt(homeSide?.team?.id ?? "0", 10) || 0;
      const awayTeamId_  = parseInt(awaySide?.team?.id ?? "0", 10) || 0;
      const myTeamId_    = parseInt(teamId, 10) || 0;
      const playerTeamId = myTeamId_ === homeTeamId_ ? homeTeamId_ : myTeamId_ === awayTeamId_ ? awayTeamId_ : null;

      const summary = await espnGet(`${path}/summary?event=${gameId}`, 86400);
      if (!summary) return;

      const rosters: any[] = (summary.rosters as any[]) ?? [];
      const myRoster = rosters.find((r: any) => String(r.team?.id) === teamId);
      if (!myRoster) return;

      for (const p of myRoster.roster ?? []) {
        const name = (p.athlete?.displayName as string) ?? "";
        if (!name) continue;

        const g = (v: string) => {
          const s = (p.stats ?? []).find((x: any) => x.abbreviation === v || x.name === v);
          const n = parseFloat(String(s?.value ?? s?.displayValue ?? ""));
          return isNaN(n) ? null : n;
        };

        const log: SofascoreGameLog = {
          eventId:        parseInt(gameId, 10) || 0,
          date,
          homeTeam:       homeTeamName,
          awayTeam:       awayTeamName,
          homeScore,
          awayScore,
          homeTeamId:     homeTeamId_,
          awayTeamId:     awayTeamId_,
          playerTeamId,
          goals:          g("G"),
          assists:        g("A"),
          rating:         null,
          minutesPlayed:  g("MIN") ?? g("MP"),
          shots:          g("SH"),
          shotsOnTarget:  g("ST"),
          keyPasses:      null,
          passes:         null,
          passAccuracy:   null,
          tackles:        g("TK") ?? g("T"),
          interceptions:  null,
          yellowCards:    g("YC"),
          foulsCommitted: g("FC") ?? g("F"),
          saves:          g("SV"),
          xG:             null,
          xA:             null,
        };

        const existing = playerHistories.get(name) ?? [];
        existing.push(log);
        playerHistories.set(name, existing);
      }
    }));
  }

  return playerHistories;
}
