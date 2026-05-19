/* eslint-disable @next/next/no-img-element */
export const revalidate = 60;

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Game, Team, H2HGame, Insight, ProbCard } from "@/lib/types";
import {
  fetchESPNScoreboard, transformESPNEvent, fetchESPNSummary,
  fetchTeamSchedule, deriveFormFromSchedule, findH2HFromSchedule,
  deriveTeamHistoryFromSchedule, ESPN_PATHS, VenueFilter,
  fetchAFLBoxScoreForPicks, type AFLGamePlayerStats,
  fetchNBABoxScoreForPicks, type NBAGamePlayerStats,
} from "@/lib/sports/espn";
import { computeAFLPlayerPicks, type AFLPlayerPick, type AFLPickStat } from "@/lib/sports/afl/picks";
import { checkLegHit, getLegCurrentValue } from "@/lib/sports/slipTracker";
import { computeAFLKitchen, type KitchenSlip, type AFLGameMeta } from "@/lib/sports/afl/kitchen";
import { computeNBAPlayerPicks, type NBAPlayerPick } from "@/lib/sports/nba/picks";
import { computeNBAKitchen, type NBAKitchenSlip } from "@/lib/sports/nba/kitchen";
import { resolveTeamCanonicalId } from "@/lib/mappings";
import {
  fetchTeamRoster, fetchTeamInjuries, ESPNPlayer, ESPNInjury,
} from "@/lib/sports/espnPlayers";
import { fetchWeather } from "@/lib/sports/weather";
import { calcBetRisk } from "@/lib/sports/betRisk";
import { formatKickoffFull, formatAFLKickoff } from "@/lib/utils";
import { fetchPlayerSeasonStats } from "@/lib/sports/sofascore";
import type { SofascorePlayer, SofascoreGameLog } from "@/lib/sports/sofascore";
import { fetchESPNSoccerMatchData, fetchESPNSoccerPlayerHistory, fetchESPNSoccerTeamHistory, type TeamGameStat } from "@/lib/sports/soccer/espnSoccerData";
import { fetch365ScoresForGame, type Scores365MatchData } from "@/lib/sports/soccer/365scoresData";
import { buildFotMobPlayerMap } from "@/lib/sports/soccer/fotmobData";
import { computeSoccerKitchen, type SoccerKitchenSlip, type SoccerPlayerProfile, type SoccerProp } from "@/lib/sports/soccer/kitchen";
import { getSlipCache, saveSlipCache } from "@/lib/slipCache";
import { computeAFLMatchAnalytics, type LadderEntry } from "@/lib/sports/afl/analytics";
import { generateAFLInsights, type AFLInsight } from "@/lib/sports/afl/insights";
import { fetchAFLStandings } from "@/lib/sports/squiggle";
import LiveScorePanel from "@/components/LiveScorePanel";
import AFLTeamCard from "@/components/afl/AFLTeamCard";
import { AFLQuarterSparkline } from "@/components/afl/AFLDashboard";
import GameDetailTabs, { HistoryVariants, H2HVariants } from "./GameDetailTabs";
import SofaPlayerPhoto from "@/components/soccer/SofaPlayerPhoto";

// ─── AFL Player Prop Odds (server-side, 6h cache) ────────────────────────────

const STAT_TO_MARKET: Partial<Record<AFLPickStat, string>> = {
  D: "player_disposals",
  G: "player_goals",
};

// Returns a map of "PlayerFullName|stat" → { price, line, bookmaker }
async function fetchAFLPlayerProps(
  homeTeam: string,
  awayTeam: string,
): Promise<Map<string, { price: number; line: number; bookmaker: string }>> {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) return new Map();

  try {
    // 1. Get event list to find the matching event ID
    const evRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/aussierules_afl/events?apiKey=${key}`,
      { next: { revalidate: 21_600 } },
    );
    if (!evRes.ok) return new Map();
    const events: { id: string; home_team: string; away_team: string }[] = await evRes.json();

    const homeId = resolveTeamCanonicalId(homeTeam, "afl");
    const awayId  = resolveTeamCanonicalId(awayTeam, "afl");

    const event = events.find(e => {
      const eH = resolveTeamCanonicalId(e.home_team, "afl");
      const eA = resolveTeamCanonicalId(e.away_team, "afl");
      return (eH === homeId && eA === awayId) || (eH === awayId && eA === homeId);
    });
    if (!event) return new Map();

    // 2. Fetch player props for this event
    const propsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/aussierules_afl/events/${event.id}/odds` +
      `?apiKey=${key}&regions=au&markets=player_disposals,player_goals&oddsFormat=decimal`,
      { next: { revalidate: 21_600 } },
    );
    if (!propsRes.ok) return new Map();
    const propsData = await propsRes.json();

    const propMap = new Map<string, { price: number; line: number; bookmaker: string; _pri: number }>();
    // Prefer Sportsbet → PointsBet → others
    const PRIORITY: Record<string, number> = { sportsbet: 0, pointsbetau: 1 };

    for (const bm of propsData.bookmakers ?? []) {
      const pri = PRIORITY[bm.key] ?? 9;
      for (const market of bm.markets ?? []) {
        // Find which stat this market maps to
        const stat = (Object.entries(STAT_TO_MARKET) as [AFLPickStat, string][])
          .find(([, v]) => v === market.key)?.[0];
        if (!stat) continue;

        for (const o of market.outcomes ?? []) {
          if (o.name !== "Over") continue;
          const mapKey = `${o.description}|${stat}`;
          const existing = propMap.get(mapKey);
          if (!existing || pri < existing._pri) {
            propMap.set(mapKey, { price: o.price, line: o.point, bookmaker: bm.title, _pri: pri });
          }
        }
      }
    }
    return propMap as Map<string, { price: number; line: number; bookmaker: string }>;
  } catch {
    return new Map();
  }
}

// ─── NBA Player Prop Odds (server-side, 6h cache) ────────────────────────────

const NBA_STAT_TO_MARKET: Partial<Record<string, string>> = {
  PTS:  "player_points",
  REB:  "player_rebounds",
  AST:  "player_assists",
  FG3M: "player_threes",
};

async function fetchNBAPlayerProps(
  homeTeam: string,
  awayTeam: string,
): Promise<Map<string, { price: number; line: number; bookmaker: string }>> {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) return new Map();

  try {
    const evRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/basketball_nba/events?apiKey=${key}`,
      { next: { revalidate: 21_600 } },
    );
    if (!evRes.ok) return new Map();
    const events: { id: string; home_team: string; away_team: string }[] = await evRes.json();

    // Loose team name matching
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const homeN = norm(homeTeam);
    const awayN = norm(awayTeam);
    const event = events.find(e => {
      const eH = norm(e.home_team);
      const eA = norm(e.away_team);
      return (eH.includes(homeN) || homeN.includes(eH)) &&
             (eA.includes(awayN) || awayN.includes(eA));
    }) ?? events.find(e => {
      const eH = norm(e.home_team);
      const eA = norm(e.away_team);
      return (eH.includes(awayN) || awayN.includes(eH)) &&
             (eA.includes(homeN) || homeN.includes(eA));
    });
    if (!event) return new Map();

    const markets = Object.values(NBA_STAT_TO_MARKET).join(",");
    const propsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${event.id}/odds` +
      `?apiKey=${key}&regions=us,au&markets=${markets}&oddsFormat=decimal`,
      { next: { revalidate: 21_600 } },
    );
    if (!propsRes.ok) return new Map();
    const propsData = await propsRes.json();

    const propMap = new Map<string, { price: number; line: number; bookmaker: string; _pri: number }>();
    const PRIORITY: Record<string, number> = { draftkings: 0, fanduel: 1, betmgm: 2, sportsbet: 3 };

    for (const bm of propsData.bookmakers ?? []) {
      const pri = PRIORITY[bm.key] ?? 9;
      for (const market of bm.markets ?? []) {
        const stat = (Object.entries(NBA_STAT_TO_MARKET) as [string, string][])
          .find(([, v]) => v === market.key)?.[0];
        if (!stat) continue;

        for (const o of market.outcomes ?? []) {
          if (o.name !== "Over") continue;
          const mapKey = `${o.description}|${stat}`;
          const existing = propMap.get(mapKey);
          if (!existing || pri < existing._pri) {
            propMap.set(mapKey, { price: o.price, line: o.point, bookmaker: bm.title, _pri: pri });
          }
        }
      }
    }
    return propMap as Map<string, { price: number; line: number; bookmaker: string }>;
  } catch {
    return new Map();
  }
}

// ─── Soccer Player Prop Odds (server-side, 6h cache) ─────────────────────────

const SOCCER_STAT_TO_MARKET: Partial<Record<string, string>> = {
  goals:          "player_anytime_goalscorer",
  shots:          "player_shots",
  shotsOnTarget:  "player_shots_on_target",
  assists:        "player_assist",
};

async function fetchSoccerPlayerProps(
  homeTeam: string,
  awayTeam: string,
): Promise<Map<string, { price: number; line: number; bookmaker: string }>> {
  const key = process.env.THE_ODDS_API_KEY;
  if (!key) return new Map();

  try {
    const evRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/soccer_epl/events?apiKey=${key}`,
      { next: { revalidate: 21_600 } },
    );
    if (!evRes.ok) return new Map();
    const events: { id: string; home_team: string; away_team: string }[] = await evRes.json();

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const homeN = norm(homeTeam);
    const awayN = norm(awayTeam);
    const event = events.find(e => {
      const eH = norm(e.home_team);
      const eA = norm(e.away_team);
      return (eH.includes(homeN) || homeN.includes(eH)) &&
             (eA.includes(awayN) || awayN.includes(eA));
    });
    if (!event) return new Map();

    const markets = Object.values(SOCCER_STAT_TO_MARKET).join(",");
    const propsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/soccer_epl/events/${event.id}/odds` +
      `?apiKey=${key}&regions=au&markets=${markets}&oddsFormat=decimal`,
      { next: { revalidate: 21_600 } },
    );
    if (!propsRes.ok) return new Map();
    const propsData = await propsRes.json();

    const propMap = new Map<string, { price: number; line: number; bookmaker: string; _pri: number }>();
    const PRIORITY: Record<string, number> = { bet365: 0, sportsbet: 1, pointsbetau: 2 };

    for (const bm of propsData.bookmakers ?? []) {
      const pri = PRIORITY[bm.key] ?? 9;
      for (const market of bm.markets ?? []) {
        const stat = (Object.entries(SOCCER_STAT_TO_MARKET) as [string, string][])
          .find(([, v]) => v === market.key)?.[0];
        if (!stat) continue;

        for (const o of market.outcomes ?? []) {
          // player_anytime_goalscorer has outcome names like player names
          // player_shots has "Over" / "Under" in name and player name in description
          let playerName = "";
          let line = 0.5; // default for goalscorer/assist if not specified

          if (market.key === "player_anytime_goalscorer" || market.key === "player_assist") {
            playerName = o.name;
          } else {
            if (o.name !== "Over") continue;
            playerName = o.description;
            line = o.point ?? 0.5;
          }

          const mapKey = `${playerName}|${stat}`;
          const existing = propMap.get(mapKey);
          if (!existing || pri < existing._pri) {
            propMap.set(mapKey, { price: o.price, line, bookmaker: bm.title, _pri: pri });
          }
        }
      }
    }
    return propMap as Map<string, { price: number; line: number; bookmaker: string }>;
  } catch {
    return new Map();
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GameDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    tab?: "overview" | "players" | "stats" | "h2h";
    h2hFilter?: VenueFilter;
    historyFilter?: VenueFilter;
  };
}) {
  const { id } = params;
  const dash = id.indexOf("-");
  if (dash < 0) notFound();

  const sport    = id.slice(0, dash) as Game["sport"];
  const sourceId = id.slice(dash + 1);
  const activeTab     = searchParams.tab ?? "overview";
  const h2hFilter     = searchParams.h2hFilter ?? "all";
  const historyFilter = searchParams.historyFilter ?? "all";

  const espnSport = sport as keyof typeof ESPN_PATHS;
  const result = await buildESPNGame(id, espnSport, sourceId);
  if (!result) notFound();

  const { game, homeSchedule, awaySchedule } = result;

  const isAFL        = sport === "afl";
  const isSoccer     = ["soccer","ucl","uel","laliga","bundesliga","aleague"].includes(sport);
  const isBasketball = sport === "basketball";

  // Pre-compute all history/H2H filter variants synchronously — no extra network calls
  let homeHistories: HistoryVariants = { all: [], home: [], away: [] };
  let awayHistories: HistoryVariants = { all: [], home: [], away: [] };
  let h2hVariants: H2HVariants = { all: game.h2h, home: [], away: [] };

  if (game.homeTeam.espnId && game.awayTeam.espnId) {
    homeHistories = {
      all:  deriveTeamHistoryFromSchedule(espnSport, homeSchedule, game.homeTeam.espnId, "all"),
      home: deriveTeamHistoryFromSchedule(espnSport, homeSchedule, game.homeTeam.espnId, "home"),
      away: deriveTeamHistoryFromSchedule(espnSport, homeSchedule, game.homeTeam.espnId, "away"),
    };
    awayHistories = {
      all:  deriveTeamHistoryFromSchedule(espnSport, awaySchedule, game.awayTeam.espnId, "all"),
      home: deriveTeamHistoryFromSchedule(espnSport, awaySchedule, game.awayTeam.espnId, "home"),
      away: deriveTeamHistoryFromSchedule(espnSport, awaySchedule, game.awayTeam.espnId, "away"),
    };
    if (homeSchedule.length) {
      h2hVariants = {
        all:  game.h2h, // already computed in buildESPNGame
        home: findH2HFromSchedule(homeSchedule, game.homeTeam.name, game.awayTeam.espnId, { limit: 10, filter: "home", sport: espnSport }),
        away: findH2HFromSchedule(homeSchedule, game.homeTeam.name, game.awayTeam.espnId, { limit: 10, filter: "away", sport: espnSport }),
      };
    }
  }

  // Rosters, injuries, and sofascore fetched in a single Promise.all
  let homeSquad: ESPNPlayer[] = [], awaySquad: ESPNPlayer[] = [];
  let homeInjuries: ESPNInjury[] = [], awayInjuries: ESPNInjury[] = [];
  let sofascore = null;

  if (game.homeTeam.espnId && game.awayTeam.espnId) {
    const sp = ESPN_PATHS[espnSport];
    const res = await Promise.all([
      fetchTeamRoster(sp, game.homeTeam.espnId),
      fetchTeamRoster(sp, game.awayTeam.espnId),
      fetchTeamInjuries(sp, game.homeTeam.espnId),
      fetchTeamInjuries(sp, game.awayTeam.espnId),
    ]);
    [homeSquad, awaySquad, homeInjuries, awayInjuries] = res;
  }
  // Soccer: ESPN (free, no Vercel IP blocks). Basketball: Sofascore.
  if (isSoccer) {
    sofascore = await fetchESPNSoccerMatchData(sport, sourceId);
    // NOTE: Do NOT build fake lineups from the squad.
    // Pre-match lineups come from Sofascore client-side fetch (browser bypasses Vercel IP blocks).
    // The client hook runs when sofascore.lineups is null/undefined.
    // Wrong squad-derived lineups are worse than showing "not announced yet".
  } else if (["basketball"].includes(sport) && game.homeTeam.espnId) {
    const { fetchSofascoreMatchData } = await import("@/lib/sports/sofascore");
    sofascore = await fetchSofascoreMatchData(sport, game.homeTeam.name, game.awayTeam.name, game.kickoff ?? "");
  }

  // Fetch AFL ladder + player pick history in parallel (AFL only)
  let aflLadder: LadderEntry[] = [];
  let aflPlayerPicks: AFLPlayerPick[] = [];
  let aflPropOdds = new Map<string, { price: number; line: number; bookmaker: string }>();
  let aflKitchenSlips: KitchenSlip[] = [];
  if (isAFL) {
    // Extract last 8 completed games with full metadata for intelligence signals.
    // 8 games gives venue/opponent signals enough overlapping data to fire reliably
    // while keeping the boxscore fetch count manageable (all cached 24h).
    const completedHomeGames = homeSchedule
      .filter((e: any) => e.competitions?.[0]?.status?.type?.state === "post")
      .slice(0, 8);
    const completedAwayGames = awaySchedule
      .filter((e: any) => e.competitions?.[0]?.status?.type?.state === "post")
      .slice(0, 8);

    const completedHomeIds = completedHomeGames.map((e: any) => String(e.id));
    const completedAwayIds = completedAwayGames.map((e: any) => String(e.id));

    // Build per-game context (venue + opponent + date) for intelligence signals
    const homeTeamEspnId = String(game.homeTeam.espnId ?? "");
    const awayTeamEspnId = String(game.awayTeam.espnId ?? "");

    const homeGameMeta: AFLGameMeta[] = completedHomeGames.map((e: any) => ({
      venueName:  String(e.competitions?.[0]?.venue?.fullName ?? ""),
      opponentId: String(
        e.competitions?.[0]?.competitors
          ?.find((c: any) => String(c.team?.id) !== homeTeamEspnId)
          ?.team?.id ?? ""
      ),
      gameDate: e.date ?? "",
    }));

    const awayGameMeta: AFLGameMeta[] = completedAwayGames.map((e: any) => ({
      venueName:  String(e.competitions?.[0]?.venue?.fullName ?? ""),
      opponentId: String(
        e.competitions?.[0]?.competitors
          ?.find((c: any) => String(c.team?.id) !== awayTeamEspnId)
          ?.team?.id ?? ""
      ),
      gameDate: e.date ?? "",
    }));

    // Compute rest days: days between most recent completed game and today's kickoff
    const daysBetween = (a: string, b: string): number => {
      const d1 = new Date(a).getTime();
      const d2 = new Date(b).getTime();
      return Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
    };
    const kickoffStr  = game.kickoff ?? new Date().toISOString();
    const lastHomeDate = homeGameMeta.map(m => m.gameDate).filter(Boolean).sort().pop() ?? "";
    const lastAwayDate = awayGameMeta.map(m => m.gameDate).filter(Boolean).sort().pop() ?? "";
    const homeRestDays = lastHomeDate ? daysBetween(lastHomeDate, kickoffStr) : 0;
    const awayRestDays = lastAwayDate ? daysBetween(lastAwayDate, kickoffStr) : 0;

    const [squiggleStandings, propOddsResult, ...rawBoxScores] = await Promise.all([
      fetchAFLStandings(),
      fetchAFLPlayerProps(game.homeTeam.name, game.awayTeam.name),
      ...completedHomeIds.map((id: string) => fetchAFLBoxScoreForPicks(id)),
      ...completedAwayIds.map((id: string) => fetchAFLBoxScoreForPicks(id)),
    ]);
    aflPropOdds = propOddsResult as Map<string, { price: number; line: number; bookmaker: string }>;

    aflLadder = (squiggleStandings as Awaited<ReturnType<typeof fetchAFLStandings>>).map(s => ({
      teamName:   s.name,
      rank:       s.rank,
      pts:        s.pts,
      percentage: s.percentage,
      wins:       s.wins,
      losses:     s.losses,
      played:     s.played,
    }));

    const boxScores = rawBoxScores as AFLGamePlayerStats[][];
    const homeBoxScores = boxScores.slice(0, completedHomeIds.length);
    const awayBoxScores = boxScores.slice(completedHomeIds.length);

    aflPlayerPicks = computeAFLPlayerPicks({
      homeGames:    homeBoxScores,
      awayGames:    awayBoxScores,
      homeTeamId:   homeTeamEspnId,
      awayTeamId:   awayTeamEspnId,
      homeAbbr:     game.homeTeam.shortName,
      awayAbbr:     game.awayTeam.shortName,
      homeInjuries,
      awayInjuries,
    });

    aflKitchenSlips = computeAFLKitchen({
      homeGames:     homeBoxScores,
      awayGames:     awayBoxScores,
      homeTeamId:    homeTeamEspnId,
      awayTeamId:    awayTeamEspnId,
      homeAbbr:      game.homeTeam.shortName,
      awayAbbr:      game.awayTeam.shortName,
      propOdds:      aflPropOdds,
      // ── Intelligence signals ──
      homeGameMeta,
      awayGameMeta,
      currentVenue:  game.venue ?? "",
      weather:       game.weather ? { condition: game.weather.condition, windKph: game.weather.windKph } : null,
      homeRestDays,
      awayRestDays,
      homeInjuries:  homeInjuries.map(i => ({ playerName: i.playerName, status: i.status })),
      awayInjuries:  awayInjuries.map(i => ({ playerName: i.playerName, status: i.status })),
    });
  }

  // Fetch NBA player pick history in parallel (basketball only)
  let nbaPlayerPicks: NBAPlayerPick[] = [];
  let nbaPropOdds = new Map<string, { price: number; line: number; bookmaker: string }>();
  let nbaKitchenSlips: NBAKitchenSlip[] = [];
  if (isBasketball && game.homeTeam.espnId && game.awayTeam.espnId) {
    const completedHomeIds = homeSchedule
      .filter((e: any) => e.competitions?.[0]?.status?.type?.state === "post")
      .slice(0, 5)
      .map((e: any) => String(e.id));
    const completedAwayIds = awaySchedule
      .filter((e: any) => e.competitions?.[0]?.status?.type?.state === "post")
      .slice(0, 5)
      .map((e: any) => String(e.id));

    const [propOddsResult, ...rawBoxScores] = await Promise.all([
      fetchNBAPlayerProps(game.homeTeam.name, game.awayTeam.name),
      ...completedHomeIds.map((id: string) => fetchNBABoxScoreForPicks(id)),
      ...completedAwayIds.map((id: string) => fetchNBABoxScoreForPicks(id)),
    ]);
    nbaPropOdds = propOddsResult as Map<string, { price: number; line: number; bookmaker: string }>;

    const boxScores = rawBoxScores as NBAGamePlayerStats[][];
    const homeBoxScores = boxScores.slice(0, completedHomeIds.length);
    const awayBoxScores = boxScores.slice(completedHomeIds.length);

    nbaPlayerPicks = computeNBAPlayerPicks({
      homeGames:  homeBoxScores,
      awayGames:  awayBoxScores,
      homeTeamId: game.homeTeam.espnId,
      awayTeamId: game.awayTeam.espnId,
      homeAbbr:   game.homeTeam.shortName,
      awayAbbr:   game.awayTeam.shortName,
    });

    nbaKitchenSlips = computeNBAKitchen({
      homeGames:  homeBoxScores,
      awayGames:  awayBoxScores,
      homeTeamId: game.homeTeam.espnId,
      awayTeamId: game.awayTeam.espnId,
      homeAbbr:   game.homeTeam.shortName,
      awayAbbr:   game.awayTeam.shortName,
      propOdds:   nbaPropOdds,
    });
  }

  // 365Scores enrichment: xG, player ratings, shot chart for live/finished soccer
  let scores365Data: Scores365MatchData | null = null;
  // FotMob player ID map: normalised player name → FotMob player ID (for correct photos + stats)
  let fotmobPlayerMap: { [playerName: string]: number } = {};
  if (isSoccer && game.kickoff) {
    const dateStr = game.kickoff.slice(0, 10); // "YYYY-MM-DD"
    const [scores365, fotmobMap] = await Promise.all([
      (game.status === "live" || game.status === "finished")
        ? fetch365ScoresForGame(game.homeTeam.name, game.awayTeam.name, dateStr)
        : Promise.resolve(null),
      buildFotMobPlayerMap(game.homeTeam.name, game.awayTeam.name, dateStr),
    ]);
    scores365Data  = scores365;
    fotmobPlayerMap = fotmobMap ?? {};
  }

  // Soccer kitchen — ESPN player history + compute slips (all server-side, no Sofascore needed)
  let soccerKitchenSlips: SoccerKitchenSlip[] = [];
  let homeTeamGameStats: TeamGameStat[] = [];
  let awayTeamGameStats: TeamGameStat[] = [];
  let homePlayerHistory: Map<string, SofascoreGameLog[]> = new Map();
  let awayPlayerHistory: Map<string, SofascoreGameLog[]> = new Map();
  if (isSoccer && sofascore) {
    const daysBetween = (a: string, b: string): number =>
      Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
    const kickoffStr = game.kickoff ?? new Date().toISOString();

    const lastHomeDate = homeSchedule
      .filter((e: any) => e.competitions?.[0]?.status?.type?.state === "post")
      .map((e: any) => e.date).filter(Boolean).sort().pop() ?? "";
    const lastAwayDate = awaySchedule
      .filter((e: any) => e.competitions?.[0]?.status?.type?.state === "post")
      .map((e: any) => e.date).filter(Boolean).sort().pop() ?? "";
    const homeRestDays = lastHomeDate ? daysBetween(lastHomeDate, kickoffStr) : 0;
    const awayRestDays = lastAwayDate ? daysBetween(lastAwayDate, kickoffStr) : 0;

    const pickPlayers = (players: SofascorePlayer[], side: "home" | "away", teamName: string, teamAbbr: string): SoccerPlayerProfile[] =>
      players
        .filter(p => p.starter && !["G", "GK", "GL"].includes(p.position.toUpperCase()))
        .slice(0, 6)
        .map(p => ({ sofaId: p.id, name: p.name, shortName: p.shortName, position: p.position, side, teamAbbr, teamName, games: [] }));

    const homePlayers = pickPlayers(sofascore.lineups?.home ?? [], "home", game.homeTeam.name, game.homeTeam.shortName);
    const awayPlayers = pickPlayers(sofascore.lineups?.away ?? [], "away", game.awayTeam.name, game.awayTeam.shortName);
    const allKitchenPlayers = [...homePlayers, ...awayPlayers];

    if (allKitchenPlayers.length > 0 && game.homeTeam.espnId && game.awayTeam.espnId) {
      // Fetch player histories from ESPN (works on Vercel — same API as AFL/NBA)
      const [propOdds, homeHistoryMap, awayHistoryMap, homeTGS, awayTGS] = await Promise.all([
        fetchSoccerPlayerProps(game.homeTeam.name, game.awayTeam.name),
        fetchESPNSoccerPlayerHistory(sport, game.homeTeam.espnId),
        fetchESPNSoccerPlayerHistory(sport, game.awayTeam.espnId),
        fetchESPNSoccerTeamHistory(sport, game.homeTeam.espnId),
        fetchESPNSoccerTeamHistory(sport, game.awayTeam.espnId),
      ]);
      homeTeamGameStats = homeTGS;
      awayTeamGameStats = awayTGS;
      homePlayerHistory = homeHistoryMap;
      awayPlayerHistory = awayHistoryMap;

      // Match player names to their history entries
      for (const p of allKitchenPlayers) {
        const map = p.side === "home" ? homeHistoryMap : awayHistoryMap;
        const games = map.get(p.name) ?? map.get(p.shortName) ?? [];
        p.games = games;
      }

      soccerKitchenSlips = computeSoccerKitchen({
        homeAbbr:      game.homeTeam.shortName,
        awayAbbr:      game.awayTeam.shortName,
        homeTeamName:  game.homeTeam.name,
        awayTeamName:  game.awayTeam.name,
        homeHistory:   homeHistories.home,
        awayHistory:   awayHistories.away,
        homeTeamStats: sofascore.homeTeamStats ?? null,
        awayTeamStats: sofascore.awayTeamStats ?? null,
        players:       allKitchenPlayers,
        weather:       game.weather ? { condition: game.weather.condition, windKph: game.weather.windKph } : null,
        homeRestDays,
        awayRestDays,
        propOdds,
      });
    }
  }

  // Freeze kitchen slips once a game goes live — read from KV if cached, else write once
  const isLiveOrFinished = game.status === "live" || game.status === "finished";
  if (isLiveOrFinished) {
    const cached = await getSlipCache(id);
    if (cached) {
      if (cached.afl)    aflKitchenSlips    = cached.afl    as typeof aflKitchenSlips;
      if (cached.soccer) soccerKitchenSlips = cached.soccer as typeof soccerKitchenSlips;
      if (cached.nba)    nbaKitchenSlips    = cached.nba    as typeof nbaKitchenSlips;
    } else {
      await saveSlipCache(id, {
        afl:    aflKitchenSlips.length    > 0 ? aflKitchenSlips    : undefined,
        soccer: soccerKitchenSlips.length > 0 ? soccerKitchenSlips : undefined,
        nba:    nbaKitchenSlips.length    > 0 ? nbaKitchenSlips    : undefined,
      }, game.status);
    }
  }

  const aflAnalytics = isAFL
    ? computeAFLMatchAnalytics({
        homeHistory: homeHistories.all, awayHistory: awayHistories.all,
        homeInjuries, awayInjuries,
        venue: game.venue,
        kickoff: game.kickoff,
        h2h: h2hVariants.all,
        homeTeamName: game.homeTeam.name,
        awayTeamName: game.awayTeam.name,
        ladder: aflLadder,
      })
    : null;

  const { homeTeam, awayTeam, score, status, liveMinute, weather, lineScores } = game;

  const probs    = isSoccer ? computeProbs(h2hVariants.all, homeTeam.name) : [];
  const insights: AFLInsight[] = isAFL && aflAnalytics
    ? generateAFLInsights({
        analytics:     aflAnalytics,
        homeShortName: homeTeam.shortName,
        awayShortName: awayTeam.shortName,
        weather:       game.weather ?? null,
      })
    : generateInsights(game, h2hVariants.all, homeHistories.all, awayHistories.all, isSoccer, false, homeTeamGameStats, awayTeamGameStats, homePlayerHistory, awayPlayerHistory);

  const LEAGUE: Record<string, { name: string; logo: string }> = {
    soccer:     { name: "Premier League",  logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png" },
    ucl:        { name: "Champions League",logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png" },
    uel:        { name: "Europa League",   logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png" },
    laliga:     { name: "La Liga",         logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png" },
    bundesliga: { name: "Bundesliga",      logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png" },
    aleague:    { name: "A-League",        logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/1308.png" },
    basketball: { name: "NBA",             logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png" },
    nfl:        { name: "NFL",             logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" },
    afl:        { name: "AFL",             logo: "https://a.espncdn.com/i/teamlogos/leagues/500/afl.png" },
  };
  const league = LEAGUE[sport];

  function statusLabel() {
    if (status === "finished") return "FT";
    if (status === "live") {
      const m = liveMinute;
      if (!m) return "LIVE";
      if (isBasketball) { const q = Math.min(4, Math.ceil(m/12)||1); return `Q${q}`; }
      if (isAFL)        { const q = Math.min(4, Math.ceil(m/20)||1); return `Q${q} ${m%20}'`; }
      return `${m}'`;
    }
    return isAFL ? formatAFLKickoff(game.kickoff, game.venue) : formatKickoffFull(game.kickoff);
  }

  // ── Basketball: 3-column layout with sticky side panels ──────────────────
  if (isBasketball) {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const seriesGames = h2hVariants.all.filter(g => {
      try { return new Date(g.date) >= cutoff; } catch { return false; }
    });
    const homeSeriesWins = seriesGames.filter(g => g.winner === homeTeam.name).length;
    const awaySeriesWins = seriesGames.filter(g => g.winner === awayTeam.name).length;
    const isSeries = seriesGames.length >= 2;

    const h2hTotals = h2hVariants.all.map(g => {
      const p = g.score.split("-").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      return p.length >= 2 ? p[0]! + p[1]! : 0;
    }).filter(t => t > 0);
    const h2hAvgTotal = h2hTotals.length > 0
      ? Math.round(h2hTotals.reduce((a, b) => a + b, 0) / h2hTotals.length) : 0;
    const h2hOver220 = h2hTotals.length > 0
      ? Math.round(h2hTotals.filter(t => t > 220).length / h2hTotals.length * 100) : null;
    const h2hOver200 = h2hTotals.length > 0
      ? Math.round(h2hTotals.filter(t => t > 200).length / h2hTotals.length * 100) : null;

    const sfHome = (sofascore?.lineups?.home ?? []) as SofascorePlayer[];
    const sfAway = (sofascore?.lineups?.away ?? []) as SofascorePlayer[];
    const byPts  = (arr: SofascorePlayer[]) =>
      [...arr].filter(p => p.starter).sort((a, b) => ((b.stats.points as number) ?? 0) - ((a.stats.points as number) ?? 0)).slice(0, 5);
    const homePerf = byPts(sfHome);
    const awayPerf = byPts(sfAway);
    const hasPerf  = (status === "live" || status === "finished") && (homePerf.length > 0 || awayPerf.length > 0);
    const allInj   = [...homeInjuries, ...awayInjuries];

    return (
      <div className="px-4 pt-4 pb-10">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-text-2 mb-4 transition-colors">
          ← Back
        </Link>

        <div className="flex gap-5 items-start">

          {/* ── Left sticky panel ────────────────────────────────────── */}
          <aside className="hidden 2xl:flex flex-col gap-3 w-[240px] shrink-0 self-start sticky top-4">

            {/* Series tracker */}
            {isSeries && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">
                  {seriesGames.length >= 4 ? "Playoff Series" : "Series"}
                </div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-center flex-1">
                    {homeTeam.logoUrl && <img src={homeTeam.logoUrl} alt="" className="w-8 h-8 object-contain mx-auto mb-1" />}
                    <div className={`text-2xl font-black tabular-nums ${homeSeriesWins >= awaySeriesWins ? "text-primary" : "text-text-2"}`}>{homeSeriesWins}</div>
                    <div className="text-[9px] text-text-2">{homeTeam.shortName}</div>
                  </div>
                  <div className="text-text-2 px-2 text-sm">—</div>
                  <div className="text-center flex-1">
                    {awayTeam.logoUrl && <img src={awayTeam.logoUrl} alt="" className="w-8 h-8 object-contain mx-auto mb-1" />}
                    <div className={`text-2xl font-black tabular-nums ${awaySeriesWins > homeSeriesWins ? "text-primary" : "text-text-2"}`}>{awaySeriesWins}</div>
                    <div className="text-[9px] text-text-2">{awayTeam.shortName}</div>
                  </div>
                </div>
                <div className="text-[9px] text-center font-semibold mb-2.5">
                  {homeSeriesWins === awaySeriesWins
                    ? <span className="text-[#F59E0B]">Tied {homeSeriesWins}-{awaySeriesWins}</span>
                    : homeSeriesWins > awaySeriesWins
                    ? <span className="text-primary">{homeTeam.shortName} lead {homeSeriesWins}-{awaySeriesWins}</span>
                    : <span className="text-primary">{awayTeam.shortName} lead {awaySeriesWins}-{homeSeriesWins}</span>
                  }
                </div>
                <div className="space-y-0.5">
                  {seriesGames.slice(0, 7).map((g, i) => {
                    const isHW = g.winner === homeTeam.name;
                    return (
                      <Link key={i} href={g.gameId ? `/game/${g.gameId}` : "#"}
                        className="flex items-center gap-1 py-1 border-b border-border last:border-0 hover:bg-surface2 rounded px-0.5 text-[10px]">
                        <span className="text-text-2 w-10 shrink-0">{g.date.slice(5)}</span>
                        <span className={`flex-1 truncate ${isHW ? "text-white font-medium" : "text-text-2"}`}>{g.homeTeam.split(" ").pop()}</span>
                        <span className="text-text-2 font-bold w-12 text-center shrink-0 tabular-nums">{g.score}</span>
                        <span className={`flex-1 truncate text-right ${!isHW ? "text-white font-medium" : "text-text-2"}`}>{g.awayTeam.split(" ").pop()}</span>
                        <span className={`w-3 text-[8px] font-bold text-center shrink-0 ${isHW ? "text-primary" : "text-text-2"}`}>{isHW ? "H" : "A"}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Form comparison */}
            <div className="bg-surface rounded-xl p-3 border border-border">
              <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Form</div>
              {([{ t: homeTeam, role: "Home" }, { t: awayTeam, role: "Away" }] as const).map(({ t, role }) => (
                <div key={t.name} className="mb-2.5 last:mb-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-[10px] font-medium text-text-1">{t.shortName}</span>
                    <span className="text-[9px] text-text-2 ml-1">{role}</span>
                    <span className="ml-auto text-[9px] text-text-2 tabular-nums">{t.record.wins}W {t.record.losses}L</span>
                  </div>
                  <div className="flex gap-1">
                    {t.form.slice(0, 5).map((r, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[8px] font-bold flex items-center justify-center ${
                        r === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" : r === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                      }`}>{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>


          </aside>

          {/* ── Center content ───────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="bg-surface rounded-t-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5">
                {league?.logo && <img src={league.logo} alt="" className="w-4 h-4 object-contain opacity-70" />}
                <span className="text-xs text-text-2">{league?.name}</span>
                <span className="text-text-2 mx-1">·</span>
                <span className="text-xs text-text-2 truncate">{game.venue}</span>
                <div className="ml-auto">
                  {status === "live" ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {statusLabel()}
                    </span>
                  ) : (
                    <span className="text-xs text-text-2">{statusLabel()}</span>
                  )}
                </div>
              </div>
              <div className="px-5 py-6 flex items-center gap-4">
                <TeamHero team={homeTeam} role="Home" />
                <div className="flex-1 text-center">
                  <LiveScorePanel
                    gameId={id}
                    initial={{
                      homeScore:    score?.home ?? null,
                      awayScore:    score?.away ?? null,
                      status,
                      period:       liveMinute ? Math.min(4, Math.ceil(liveMinute / 20)) : null,
                      displayClock: null,
                      shortDetail:  null,
                      lineScores:   lineScores ?? null,
                    }}
                    homeShortName={homeTeam.shortName}
                    awayShortName={awayTeam.shortName}
                    isAFL={isAFL}
                    isBasketball={isBasketball}
                    kickoff={game.kickoff}
                    venue={game.venue}
                  />
                </div>
                <TeamHero team={awayTeam} role="Away" />
              </div>
            </div>

            <GameDetailTabs
              game={game}
              id={id}
              homeSquad={homeSquad}
              awaySquad={awaySquad}
              homeInjuries={homeInjuries}
              awayInjuries={awayInjuries}
              homeHistories={homeHistories}
              awayHistories={awayHistories}
              h2hVariants={h2hVariants}
              aflAnalytics={aflAnalytics}
              sofascore={sofascore}
              insights={insights}
              isSoccer={false}
              isBasketball={true}
              isAFL={false}
              nbaKitchenSlips={nbaKitchenSlips}
              initialTab={activeTab}
              initialH2hFilter={h2hFilter as VenueFilter}
              initialHistoryFilter={historyFilter as VenueFilter}
            />
          </div>

          {/* ── Right sticky panel ───────────────────────────────────── */}
          <aside className="hidden 2xl:flex flex-col gap-3 w-[240px] shrink-0 self-start sticky top-4">

            {/* Top performers */}
            {hasPerf && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Top Performers</div>
                {([{ t: homeTeam, players: homePerf }, { t: awayTeam, players: awayPerf }] as const).map(({ t, players }) => (
                  <div key={t.name} className="mb-3 last:mb-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                      <span className="text-[9px] text-text-2">{t.shortName}</span>
                    </div>
                    {players.map(p => {
                      const pts = (p.stats.points as number) ?? 0;
                      const reb = (p.stats.rebounds as number) ?? 0;
                      const ast = (p.stats.assists as number) ?? 0;
                      return (
                        <div key={p.id} className="flex items-center gap-1 py-1 border-b border-border last:border-0">
                          <span className="text-[10px] text-text-1 flex-1 truncate min-w-0">{p.shortName}</span>
                          {p.rating != null && (
                            <span className={`text-[8px] px-1 py-px rounded font-bold shrink-0 ${
                              p.rating >= 7.5 ? "bg-[#22C55E]/20 text-[#22C55E]"
                              : p.rating >= 6.5 ? "bg-[#F59E0B]/20 text-[#F59E0B]"
                              : "bg-[#EF4444]/20 text-[#EF4444]"
                            }`}>{p.rating.toFixed(1)}</span>
                          )}
                          <span className="text-white font-bold text-[10px] tabular-nums shrink-0">{pts}</span>
                          <span className="text-text-2 text-[8px]">P</span>
                          <span className="text-text-2 text-[10px] tabular-nums shrink-0">{reb}</span>
                          <span className="text-text-2 text-[8px]">R</span>
                          <span className="text-text-2 text-[10px] tabular-nums shrink-0">{ast}</span>
                          <span className="text-text-2 text-[8px]">A</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Scoring edge */}
            {h2hAvgTotal > 0 && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Scoring Edge</div>
                <div className="flex justify-between text-xs mb-2.5">
                  <span className="text-text-2">H2H Avg Total</span>
                  <span className="text-white font-bold tabular-nums">{h2hAvgTotal}</span>
                </div>
                {h2hOver220 !== null && (
                  <div className="mb-2">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-text-2">Over 220 pts</span>
                      <span className={`font-bold ${h2hOver220 >= 60 ? "text-[#22C55E]" : h2hOver220 >= 40 ? "text-[#F59E0B]" : "text-[#EF4444]"}`}>{h2hOver220}%</span>
                    </div>
                    <div className="h-[2px] bg-surface2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${h2hOver220 >= 60 ? "bg-[#22C55E]" : h2hOver220 >= 40 ? "bg-[#F59E0B]" : "bg-[#EF4444]"}`} style={{ width: `${h2hOver220}%` }} />
                    </div>
                  </div>
                )}
                {h2hOver200 !== null && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-text-2">Over 200 pts</span>
                      <span className={`font-bold ${h2hOver200 >= 60 ? "text-[#22C55E]" : h2hOver200 >= 40 ? "text-[#F59E0B]" : "text-[#EF4444]"}`}>{h2hOver200}%</span>
                    </div>
                    <div className="h-[2px] bg-surface2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${h2hOver200 >= 60 ? "bg-[#22C55E]" : h2hOver200 >= 40 ? "bg-[#F59E0B]" : "bg-[#EF4444]"}`} style={{ width: `${h2hOver200}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Key insights */}
            {insights.length > 0 && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Key Insights</div>
                <ul className="space-y-1.5">
                  {insights.slice(0, 4).map((ins, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[10px]">
                      <span className="text-primary shrink-0">{ins.icon}</span>
                      <span className="text-text-1 leading-snug">{ins.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Injury report */}
            {allInj.length > 0 && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Injuries</div>
                {([{ t: homeTeam, inj: homeInjuries }, { t: awayTeam, inj: awayInjuries }] as const).map(({ t, inj }) =>
                  inj.length > 0 ? (
                    <div key={t.name} className="mb-2 last:mb-0">
                      <div className="text-[9px] text-text-2 uppercase tracking-widest mb-1">{t.shortName}</div>
                      {inj.slice(0, 3).map((p, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 text-[10px]">
                          <span className="text-text-1 truncate">{p.playerName}</span>
                          <span className={`shrink-0 ml-1 text-[9px] font-medium ${p.status === "Out" ? "text-[#EF4444]" : "text-[#F59E0B]"}`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* NBA Player Picks */}
            {nbaPlayerPicks.length > 0 && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Player Picks</div>
                <div className="space-y-1.5">
                  {nbaPlayerPicks.map((pick, i) => {
                    const confColor =
                      pick.confidence === "high"   ? "text-[#22C55E]" :
                      pick.confidence === "medium" ? "text-[#F59E0B]" : "text-text-2";
                    const pct     = Math.round(pick.hitRate * 100);
                    const prop    = nbaPropOdds.get(`${pick.player}|${pick.stat}`);
                    // Display last name only
                    const lastName = pick.player.trim().split(" ").pop() ?? pick.player;
                    const teamLogo = pick.side === "home" ? homeTeam.logoUrl : awayTeam.logoUrl;
                    return (
                      <div key={i} className="border-b border-border last:border-0 pb-1.5 last:pb-0">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <span className="text-[10px] text-text-1 font-medium leading-tight block truncate">
                              {lastName}
                            </span>
                            <span className="text-[10px] font-bold text-primary">
                              ↑ {pick.threshold}+ {pick.statLabel}
                            </span>
                            {prop && (
                              <span className="block text-[9px] text-text-2 mt-0.5">
                                {prop.bookmaker}{" "}
                                <span className="text-text-1 font-semibold tabular-nums">
                                  {prop.line}+ @ {prop.price.toFixed(2)}
                                </span>
                              </span>
                            )}
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                            <span className={`text-[10px] font-bold tabular-nums ${confColor}`}>{pct}%</span>
                            {teamLogo && (
                              <img src={teamLogo} alt={pick.teamAbbr} className="w-4 h-4 object-contain opacity-80" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 pt-2 border-t border-border text-[8px] text-text-2">
                  Based on last {Math.max(...nbaPlayerPicks.map(p => p.gamesAnalyzed))} games · not betting advice
                </div>
              </div>
            )}

          </aside>

        </div>
      </div>
    );
  }

  // ── AFL: 3-column layout with sticky side panels ──────────────────────────
  if (isAFL) {
    const allInj = [...homeInjuries, ...awayInjuries];
    // Resolve ladder ranks for both teams
    const homeCanonical = resolveTeamCanonicalId(homeTeam.name, "afl");
    const awayCanonical = resolveTeamCanonicalId(awayTeam.name, "afl");
    const homeRank = aflLadder.find(l => resolveTeamCanonicalId(l.teamName, "afl") === homeCanonical)?.rank;
    const awayRank = aflLadder.find(l => resolveTeamCanonicalId(l.teamName, "afl") === awayCanonical)?.rank;
    return (
      <div className="px-4 pt-4 pb-10">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-text-2 mb-4 transition-colors">
          ← Back
        </Link>
        <div className="flex gap-5 items-start">

          {/* ── Left sticky panel ────────────────────────────────────── */}
          <aside className="hidden 2xl:flex flex-col gap-3 w-[220px] shrink-0 self-start sticky top-4">
            {/* Form comparison */}
            <div className="bg-surface rounded-xl p-3 border border-border">
              <div className="text-[10px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Form</div>
              {([
                { t: homeTeam, role: "Home", an: aflAnalytics?.home },
                { t: awayTeam, role: "Away", an: aflAnalytics?.away },
              ] as const).map(({ t, role, an }) => (
                <div key={t.name} className="mb-2.5 last:mb-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-medium text-text-1">{t.shortName}</span>
                    <span className="text-[10px] text-text-2 ml-1">{role}</span>
                    {/* Use analytics record (accurate) — ESPN record is unreliable for AFL */}
                    <span className="ml-auto text-[10px] text-text-2 tabular-nums">
                      {an ? `${an.record.wins}W ${an.record.losses}L${an.record.draws > 0 ? ` ${an.record.draws}D` : ""}` : "—"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {t.form.slice(0, 5).map((r, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${
                        r === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" : r === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                      }`}>{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* AFL analytics summary */}
            {aflAnalytics && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[10px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Season Avg</div>
                {([
                  { t: homeTeam, an: aflAnalytics.home },
                  { t: awayTeam, an: aflAnalytics.away },
                ] as const).map(({ t, an }) => an && (
                  <div key={t.name} className="mb-2.5 last:mb-0">
                    <div className="flex items-center gap-1 mb-1">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                      <span className="text-xs text-text-2">{t.shortName}</span>
                    </div>
                    <div className="flex justify-between text-xs py-0.5">
                      <span className="text-text-2">Scored</span>
                      <span className="text-text-1 font-bold tabular-nums">{an.avgScored}</span>
                    </div>
                    <div className="flex justify-between text-xs py-0.5">
                      <span className="text-text-2">Conceded</span>
                      <span className="text-text-2 tabular-nums">{an.avgConceded}</span>
                    </div>
                    <div className="flex justify-between text-xs py-0.5">
                      <span className="text-text-2">Win margin</span>
                      <span className="text-text-2 tabular-nums">{an.avgMarginWin != null ? Math.round(an.avgMarginWin) : "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* H2H summary */}
            {h2hVariants.all.length > 0 && (() => {
              const h2h = h2hVariants.all;
              const hw = h2h.filter(g => g.winner === homeTeam.name).length;
              const aw = h2h.length - hw;
              return (
                <div className="bg-surface rounded-xl p-3 border border-border">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">H2H</div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-center">
                      {homeTeam.logoUrl && <img src={homeTeam.logoUrl} alt="" className="w-6 h-6 object-contain mx-auto mb-0.5" />}
                      <div className="text-lg font-black text-primary">{hw}</div>
                    </div>
                    <div className="text-text-2 text-xs">vs</div>
                    <div className="text-center">
                      {awayTeam.logoUrl && <img src={awayTeam.logoUrl} alt="" className="w-6 h-6 object-contain mx-auto mb-0.5" />}
                      <div className="text-lg font-black text-text-2">{aw}</div>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {h2h.slice(0, 4).map((g, i) => (
                      <div key={i} className="flex items-center gap-1 text-[9px] py-0.5 border-b border-border last:border-0">
                        <span className="text-text-2 w-12 shrink-0">{g.date.slice(5)}</span>
                        <span className="flex-1 truncate text-text-2">{g.homeTeam.split(" ").pop()} <span className="text-white font-medium">{g.score}</span> {g.awayTeam.split(" ").pop()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </aside>

          {/* ── Center content ───────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="bg-surface rounded-t-2xl overflow-hidden">
              {/* League bar */}
              <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5">
                {league?.logo && <img src={league.logo} alt="" className="w-4 h-4 object-contain opacity-70" />}
                <span className="text-xs text-text-2">{league?.name}</span>
                <span className="text-text-2 mx-1">·</span>
                <span className="text-xs text-text-2 truncate">{game.venue}</span>
                <div className="ml-auto">
                  {status === "live" ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {statusLabel()}
                    </span>
                  ) : (
                    <span className="text-xs text-text-2">{statusLabel()}</span>
                  )}
                </div>
              </div>
              {/* Score */}
              <div className="px-5 py-6 flex items-center gap-4">
                <TeamHero team={homeTeam} role="Home" ladderRank={homeRank} />
                <div className="flex-1 text-center">
                  <LiveScorePanel
                    gameId={id}
                    initial={{
                      homeScore:    score?.home ?? null,
                      awayScore:    score?.away ?? null,
                      status,
                      period:       liveMinute ? Math.min(4, Math.ceil(liveMinute / 20)) : null,
                      displayClock: null,
                      shortDetail:  null,
                      lineScores:   lineScores ?? null,
                    }}
                    homeShortName={homeTeam.shortName}
                    awayShortName={awayTeam.shortName}
                    isAFL={true}
                    isBasketball={false}
                    kickoff={game.kickoff}
                    venue={game.venue}
                  />
                </div>
                <TeamHero team={awayTeam} role="Away" ladderRank={awayRank} />
              </div>
              {/* AFL analytics ribbon — momentum when live, team cards otherwise */}
              {status === "live" && lineScores && lineScores.home.length > 0 ? (
                <div className="px-5 pb-4 border-t border-border pt-3">
                  <AFLQuarterSparkline game={game} />
                </div>
              ) : aflAnalytics ? (
                <div className="px-5 pb-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
                  <AFLTeamCard team={homeTeam} analytics={aflAnalytics.home} />
                  <AFLTeamCard team={awayTeam} analytics={aflAnalytics.away} />
                </div>
              ) : null}
            </div>
            <GameDetailTabs
              game={game} id={id}
              homeSquad={homeSquad} awaySquad={awaySquad}
              homeInjuries={homeInjuries} awayInjuries={awayInjuries}
              homeHistories={homeHistories} awayHistories={awayHistories}
              h2hVariants={h2hVariants} aflAnalytics={aflAnalytics}
              sofascore={sofascore} insights={insights}
              isSoccer={false} isBasketball={false} isAFL={true}
              kitchenSlips={aflKitchenSlips}
              initialTab={activeTab}
              initialH2hFilter={h2hFilter as VenueFilter}
              initialHistoryFilter={historyFilter as VenueFilter}
            />
          </div>

          {/* ── Right sticky panel ───────────────────────────────────── */}
          <aside className="hidden 2xl:flex flex-col gap-3 w-[220px] shrink-0 self-start sticky top-4">

            {/* Weather — top of right panel */}
            {game.weather && game.weather.condition !== "Indoor" && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2">Conditions</div>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{
                    game.weather.condition === "Sunny" ? "☀️" :
                    game.weather.condition === "Partly Cloudy" ? "⛅" :
                    game.weather.condition === "Cloudy" ? "☁️" :
                    game.weather.condition === "Rain" ? "🌧️" :
                    game.weather.condition === "Storm" ? "⛈️" :
                    game.weather.condition === "Snow" ? "❄️" : "🌤️"
                  }</span>
                  <div>
                    <div className={`text-sm font-semibold ${
                      game.weather.windKph > 40 || ["Storm","Rain"].includes(game.weather.condition)
                        ? "text-[#F59E0B]" : "text-text-1"
                    }`}>{game.weather.condition}</div>
                    <div className="text-[10px] text-text-2">{game.weather.tempC}°C · {game.weather.windKph} km/h wind</div>
                  </div>
                </div>
                {game.weather.windKph > 30 && (
                  <div className="mt-2 text-[10px] text-[#F59E0B]">
                    ⚠ High wind — may affect kicking accuracy
                  </div>
                )}
              </div>
            )}


            {/* Key insights */}
            {insights.length > 0 && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[10px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Key Insights</div>
                <ul className="space-y-2">
                  {insights.slice(0, 5).map((ins, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <span className="text-primary shrink-0 mt-px">{ins.icon}</span>
                      <span className="text-text-1 leading-snug">{ins.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Player Picks — reliability-ranked prop suggestions */}
            {aflPlayerPicks.length > 0 && (() => {
              // Detect duplicate last names using the FULL squad roster (not just picks)
              // so Daicos.N shows even when only one Daicos makes the picks threshold
              const squadLastNameCount = new Map<string, number>();
              const homeAbbr = game.homeTeam.shortName;
              const awayAbbr = game.awayTeam.shortName;
              homeSquad.forEach(p => {
                const lastName = p.displayName?.trim().split(" ").pop() ?? "";
                const key = `${lastName}|${homeAbbr}`;
                squadLastNameCount.set(key, (squadLastNameCount.get(key) ?? 0) + 1);
              });
              awaySquad.forEach(p => {
                const lastName = p.displayName?.trim().split(" ").pop() ?? "";
                const key = `${lastName}|${awayAbbr}`;
                squadLastNameCount.set(key, (squadLastNameCount.get(key) ?? 0) + 1);
              });
              function pickDisplayName(p: AFLPlayerPick) {
                const parts = p.player.trim().split(" ");
                const lastName = parts[parts.length - 1];
                const key = `${lastName}|${p.teamAbbr}`;
                if ((squadLastNameCount.get(key) ?? 0) > 1) {
                  const initial = parts[0]?.[0]?.toUpperCase();
                  return initial ? `${lastName}.${initial}` : lastName;
                }
                return lastName;
              }

              return (
                <div className="bg-surface rounded-xl p-3 border border-border">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Player Picks</div>
                  <div className="space-y-1.5">
                    {aflPlayerPicks.map((pick, i) => {
                      const confColor =
                        pick.confidence === "high"   ? "text-[#22C55E]" :
                        pick.confidence === "medium" ? "text-[#F59E0B]" : "text-text-2";
                      const dirColor = pick.direction === "over" ? "text-primary" : "text-text-2";
                      const pct = Math.round(pick.hitRate * 100);
                      const propKey = `${pick.player}|${pick.stat}`;
                      const prop = aflPropOdds.get(propKey);
                      const isHit = game.boxScore ? checkLegHit(
                        { player: pick.player, side: pick.side, stat: pick.stat, threshold: pick.threshold },
                        game.boxScore
                      ) : false;
                      const liveValue = game.boxScore ? getLegCurrentValue(
                        { player: pick.player, side: pick.side, stat: pick.stat },
                        game.boxScore
                      ) : null;
                      return (
                        <div key={i} className={`border-b border-border last:border-0 pb-1.5 last:pb-0 ${isHit ? "bg-[#22C55E]/5 rounded px-1" : ""}`}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {isHit && <span className="text-sm leading-none shrink-0">✅</span>}
                                <span className={`text-[10px] font-medium leading-tight truncate ${isHit ? "text-[#22C55E]" : "text-text-1"}`}>
                                  {pickDisplayName(pick)}
                                </span>
                                {liveValue != null && (
                                  <span className={`text-[10px] font-black tabular-nums shrink-0 ${isHit ? "text-[#22C55E]" : "text-primary"}`}>
                                    {liveValue}/{pick.threshold}
                                  </span>
                                )}
                              </div>
                              <span className={`text-[10px] font-bold ${isHit ? "text-[#22C55E]" : dirColor}`}>
                                {pick.direction === "over" ? "↑" : "↓"} {pick.threshold}+ {pick.statLabel}
                              </span>
                              {pick.isValue && pick.valueNote && (
                                <span className="block text-[9px] text-[#F59E0B] leading-snug mt-0.5">⚡ {pick.valueNote}</span>
                              )}
                              {prop && (
                                <span className="block text-[9px] text-text-2 mt-0.5">
                                  {prop.bookmaker} <span className="text-text-1 font-semibold tabular-nums">{prop.line}+ @ {prop.price.toFixed(2)}</span>
                                </span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className={`text-[10px] font-bold tabular-nums ${confColor}`}>{pct}%</span>
                              <span className="block text-[8px] text-text-2">{pick.teamAbbr}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border text-[8px] text-text-2">
                    Based on last {Math.max(...aflPlayerPicks.map(p => p.gamesAnalyzed))} games · not betting advice
                  </div>
                </div>
              );
            })()}

          </aside>

        </div>
      </div>
    );
  }

  // ── Soccer: 3-column layout with sticky side panels ─────────────────────────
  if (isSoccer) {
    const allInj = [...homeInjuries, ...awayInjuries];
    const sfHome = (sofascore?.lineups?.home ?? []);
    const sfAway = (sofascore?.lineups?.away ?? []);

    // Top performers from Sofascore (rated players)
    const topRated = (arr: typeof sfHome) =>
      [...arr].filter(p => p.starter && p.rating != null)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 4);
    const homeTopRated = topRated(sfHome);
    const awayTopRated = topRated(sfAway);
    const hasPerf = (status === "live" || status === "finished") && (homeTopRated.length > 0 || awayTopRated.length > 0);

    return (
      <div className="px-4 pt-4 pb-10">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-text-2 mb-4 transition-colors">
          ← Back
        </Link>

        <div className="flex gap-5 items-start">

          {/* ── Left sticky panel ────────────────────────────────────── */}
          <aside className="hidden 2xl:flex flex-col gap-3 w-[240px] shrink-0 self-start sticky top-4">

            {/* Form comparison */}
            <div className="bg-surface rounded-xl p-3 border border-border">
              <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Form</div>
              {([{ t: homeTeam, role: "Home" }, { t: awayTeam, role: "Away" }] as const).map(({ t, role }) => {
                // Derive W/L/D from recent form array (ESPN record is often 0 for soccer)
                const recentForm = t.form.slice(0, 5);
                const fW = recentForm.filter(r => r === "W").length;
                const fL = recentForm.filter(r => r === "L").length;
                const fD = recentForm.filter(r => r === "D").length;
                return (
                  <div key={t.name} className="mb-2.5 last:mb-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-[10px] font-medium text-text-1">{t.shortName}</span>
                      <span className="text-[9px] text-text-2 ml-1">{role}</span>
                      <span className="ml-auto text-[9px] text-text-2 tabular-nums">{fW}W {fL}L{fD > 0 ? ` ${fD}D` : ""}</span>
                    </div>
                    <div className="flex gap-1">
                      {recentForm.map((r, i) => (
                        <span key={i} className={`w-5 h-5 rounded text-[8px] font-bold flex items-center justify-center ${
                          r === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" : r === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                        }`}>{r}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* H2H summary */}
            {h2hVariants.all.length > 0 && (() => {
              const h2h = h2hVariants.all;
              const hw  = h2h.filter(g => g.winner === homeTeam.name).length;
              const dr  = h2h.filter(g => g.winner === "Draw").length;
              const aw  = h2h.length - hw - dr;
              const goals = h2h.map(g => {
                const p = g.score.split("-").map(Number);
                return (p[0] ?? 0) + (p[1] ?? 0);
              });
              const avgGoals = goals.length ? (goals.reduce((a, b) => a + b, 0) / goals.length).toFixed(1) : null;
              const over25   = goals.length ? Math.round(goals.filter(v => v > 2.5).length / goals.length * 100) : null;

              return (
                <div className="bg-surface rounded-xl p-3 border border-border">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">H2H</div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-center flex-1">
                      {homeTeam.logoUrl && <img src={homeTeam.logoUrl} alt="" className="w-6 h-6 object-contain mx-auto mb-0.5" />}
                      <div className="text-lg font-black text-primary">{hw}</div>
                    </div>
                    <div className="text-center flex-1">
                      <div className="text-lg font-black text-[#F59E0B]">{dr}</div>
                      <div className="text-[9px] text-text-2">D</div>
                    </div>
                    <div className="text-center flex-1">
                      {awayTeam.logoUrl && <img src={awayTeam.logoUrl} alt="" className="w-6 h-6 object-contain mx-auto mb-0.5" />}
                      <div className="text-lg font-black text-text-2">{aw}</div>
                    </div>
                  </div>
                  {avgGoals && (
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-text-2">Avg goals</span>
                      <span className="text-text-1 font-bold">{avgGoals}</span>
                    </div>
                  )}
                  {over25 !== null && (
                    <div className="flex justify-between text-[10px] mb-2">
                      <span className="text-text-2">Over 2.5</span>
                      <span className={`font-bold ${over25 >= 60 ? "text-[#22C55E]" : over25 >= 40 ? "text-[#F59E0B]" : "text-[#EF4444]"}`}>{over25}%</span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {h2h.slice(0, 5).map((g, i) => {
                      const row = (
                        <div className="flex items-center gap-1 text-[9px] py-1 border-b border-border last:border-0">
                          <span className="text-text-2 w-12 shrink-0">{g.date.slice(5)}</span>
                          <span className="flex-1 truncate text-text-2">{g.homeTeam.split(" ").pop()} <span className="text-white font-medium">{g.score}</span> {g.awayTeam.split(" ").pop()}</span>
                        </div>
                      );
                      return g.gameId ? (
                        <Link key={i} href={`/game/${g.gameId}`} className="block hover:bg-surface2 rounded transition-colors">{row}</Link>
                      ) : (
                        <div key={i}>{row}</div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Key Insights */}
            {insights.length > 0 && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Key Insights</div>
                <ul className="space-y-1.5">
                  {insights.slice(0, 5).map((ins, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[10px]">
                      <span className="text-primary shrink-0">{ins.icon}</span>
                      <span className="text-text-1 leading-snug">{ins.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Home / Away split */}
            <div className="bg-surface rounded-xl p-3 border border-border">
              <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Home / Away</div>
              {[
                { label: `${homeTeam.shortName} Home`, split: homeTeam.splits.home },
                { label: `${awayTeam.shortName} Away`, split: awayTeam.splits.away },
              ].map(({ label, split }) => {
                const total = split.wins + split.losses + (split.draws ?? 0);
                const pct   = total > 0 ? Math.round((split.wins / total) * 100) : 0;
                return (
                  <div key={label} className="mb-2.5 last:mb-0">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-text-2">{label}</span>
                      <span className="text-text-1 font-semibold">{pct}%</span>
                    </div>
                    <div className="h-[3px] bg-surface2 rounded-full">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[9px] text-text-2 mt-0.5">{split.wins}W {split.losses}L{split.draws ? ` ${split.draws}D` : ""}</div>
                  </div>
                );
              })}
            </div>

          </aside>

          {/* ── Center content ───────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="bg-surface rounded-t-2xl overflow-hidden">
              {/* League bar */}
              <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5">
                {league?.logo && <img src={league.logo} alt="" className="w-4 h-4 object-contain opacity-70" />}
                <span className="text-xs text-text-2">{league?.name}</span>
                <span className="text-text-2 mx-1">·</span>
                <span className="text-xs text-text-2 truncate">{game.venue}</span>
                <div className="ml-auto">
                  {status === "live" ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {statusLabel()}
                    </span>
                  ) : (
                    <span className="text-xs text-text-2">{statusLabel()}</span>
                  )}
                </div>
              </div>

              {/* Score */}
              <div className="px-5 py-6 flex items-center gap-4">
                <TeamHero team={homeTeam} role="Home" />
                <div className="flex-1 text-center">
                  <LiveScorePanel
                    gameId={id}
                    initial={{
                      homeScore:    score?.home ?? null,
                      awayScore:    score?.away ?? null,
                      status,
                      period:       null,
                      displayClock: null,
                      shortDetail:  null,
                      lineScores:   lineScores ?? null,
                    }}
                    homeShortName={homeTeam.shortName}
                    awayShortName={awayTeam.shortName}
                    isAFL={false}
                    isBasketball={false}
                    kickoff={game.kickoff}
                    venue={game.venue}
                  />
                </div>
                <TeamHero team={awayTeam} role="Away" />
              </div>

              {/* Prob cards */}
              {probs.length > 0 && (
                <div className="px-5 pb-5 border-t border-border pt-3">
                  <div className="grid grid-cols-6 gap-2">
                    {probs.map(p => (
                      <div key={p.label} className="bg-bg rounded-xl px-2 py-3 text-center">
                        <div className={`text-xl font-black tabular-nums ${
                          p.conf === "high" ? "text-[#22C55E]" : p.conf === "medium" ? "text-[#F59E0B]" : "text-[#EF4444]"
                        }`}>{p.value}%</div>
                        <div className="text-[9px] text-text-2 mt-0.5 leading-tight">{p.label}</div>
                        <div className="mt-2 h-[2px] bg-surface2 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            p.conf === "high" ? "bg-[#22C55E]" : p.conf === "medium" ? "bg-[#F59E0B]" : "bg-[#EF4444]"
                          }`} style={{ width: `${Math.min(100, p.value)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <GameDetailTabs
              game={game}
              id={id}
              homeSquad={homeSquad}
              awaySquad={awaySquad}
              homeInjuries={homeInjuries}
              awayInjuries={awayInjuries}
              homeHistories={homeHistories}
              awayHistories={awayHistories}
              h2hVariants={h2hVariants}
              aflAnalytics={aflAnalytics}
              sofascore={sofascore}
              insights={insights}
              isSoccer={true}
              isBasketball={false}
              isAFL={false}
              soccerKitchenSlips={soccerKitchenSlips}
              homeTeamGameStats={homeTeamGameStats}
              awayTeamGameStats={awayTeamGameStats}
              scores365Data={scores365Data}
              fotmobPlayerMap={fotmobPlayerMap}
              homePlayerHistory={homePlayerHistory}
              awayPlayerHistory={awayPlayerHistory}
              initialTab={activeTab}
              initialH2hFilter={h2hFilter as VenueFilter}
              initialHistoryFilter={historyFilter as VenueFilter}
            />
          </div>

          {/* ── Right sticky panel ───────────────────────────────────── */}
          <aside className="hidden 2xl:flex flex-col gap-3 w-[240px] shrink-0 self-start sticky top-4">

            {/* Top performers — live/finished */}
            {hasPerf && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Top Performers</div>
                {([{ t: homeTeam, players: homeTopRated }, { t: awayTeam, players: awayTopRated }] as const).map(({ t, players }) => (
                  players.length > 0 ? (
                    <div key={t.name} className="mb-3 last:mb-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                        <span className="text-[9px] text-text-2">{t.shortName}</span>
                      </div>
                      {players.map((p, i) => {
                        const goals   = Number(p.stats.goals ?? 0);
                        const assists = Number(p.stats.goalAssist ?? 0);
                        const xg      = typeof p.stats.expectedGoals === "number" ? p.stats.expectedGoals : null;
                        return (
                          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                            {/* Sofascore photo */}
                            <div className="shrink-0">
                              <SofaPlayerPhoto id={p.id} name={p.name} size={28} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-text-1 font-medium truncate">{p.shortName}</span>
                                {goals > 0 && <span className="text-xs shrink-0">⚽</span>}
                                {assists > 0 && <span className="text-xs shrink-0">🎯</span>}
                              </div>
                              {xg != null && xg > 0.1 && (
                                <div className="text-[9px] text-text-2">xG {xg.toFixed(2)}</div>
                              )}
                            </div>
                            {p.rating != null && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-black shrink-0 tabular-nums ${
                                p.rating >= 8.0 ? "bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30" :
                                p.rating >= 7.5 ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20" :
                                p.rating >= 6.5 ? "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" :
                                "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20"
                              }`}>{p.rating.toFixed(1)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null
                ))}
              </div>
            )}

            {/* Injury report */}
            {allInj.length > 0 && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2.5">Injuries</div>
                {([{ t: homeTeam, inj: homeInjuries }, { t: awayTeam, inj: awayInjuries }] as const).map(({ t, inj }) =>
                  inj.length > 0 ? (
                    <div key={t.name} className="mb-2 last:mb-0">
                      <div className="text-[9px] text-text-2 uppercase tracking-widest mb-1">{t.shortName}</div>
                      {inj.slice(0, 4).map((p, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 text-[10px]">
                          <span className="text-text-1 truncate">{p.playerName}</span>
                          <span className={`shrink-0 ml-1 text-[9px] font-medium ${p.status === "Out" ? "text-[#EF4444]" : "text-[#F59E0B]"}`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* Weather */}
            {weather && weather.condition !== "Indoor" && (
              <div className="bg-surface rounded-xl p-3 border border-border">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2">Conditions</div>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{
                    weather.condition === "Sunny" ? "☀️" :
                    weather.condition === "Partly Cloudy" ? "⛅" :
                    weather.condition === "Cloudy" ? "☁️" :
                    weather.condition === "Rain" ? "🌧️" :
                    weather.condition === "Storm" ? "⛈️" : "🌤️"
                  }</span>
                  <div>
                    <div className={`text-sm font-semibold ${
                      weather.windKph > 40 || ["Storm","Rain"].includes(weather.condition) ? "text-[#F59E0B]" : "text-text-1"
                    }`}>{weather.condition}</div>
                    <div className="text-[10px] text-text-2">{weather.tempC}°C · {weather.windKph} km/h</div>
                  </div>
                </div>
              </div>
            )}

          </aside>

        </div>
      </div>
    );
  }

  // Non-basketball / non-AFL / non-soccer: original single-column layout
  return (
    <div className="max-w-5xl px-4 pt-4 pb-10 mx-auto">

      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-text-2 mb-4 transition-colors">
        ← Back
      </Link>

      <div className="bg-surface rounded-t-2xl overflow-hidden">
        {/* League bar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5">
          {league?.logo && <img src={league.logo} alt="" className="w-4 h-4 object-contain opacity-70" />}
          <span className="text-xs text-text-2">{league?.name}</span>
          <span className="text-text-2 mx-1">·</span>
          <span className="text-xs text-text-2 truncate">{game.venue}</span>
          <div className="ml-auto">
            {status === "live" ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {statusLabel()}
              </span>
            ) : (
              <span className="text-xs text-text-2">{statusLabel()}</span>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="px-5 py-6 flex items-center gap-4">
          <TeamHero team={homeTeam} role="Home" />
          <div className="flex-1 text-center">
            <LiveScorePanel
              gameId={id}
              initial={{
                homeScore:    score?.home ?? null,
                awayScore:    score?.away ?? null,
                status,
                period:       liveMinute ? Math.min(4, Math.ceil(liveMinute / 20)) : null,
                displayClock: null,
                shortDetail:  null,
                lineScores:   lineScores ?? null,
              }}
              homeShortName={homeTeam.shortName}
              awayShortName={awayTeam.shortName}
              isAFL={isAFL}
              isBasketball={isBasketball}
              kickoff={game.kickoff}
              venue={game.venue}
            />
          </div>
          <TeamHero team={awayTeam} role="Away" />
        </div>
      </div>

      <GameDetailTabs
        game={game}
        id={id}
        homeSquad={homeSquad}
        awaySquad={awaySquad}
        homeInjuries={homeInjuries}
        awayInjuries={awayInjuries}
        homeHistories={homeHistories}
        awayHistories={awayHistories}
        h2hVariants={h2hVariants}
        aflAnalytics={aflAnalytics}
        sofascore={sofascore}
        insights={insights}
        isSoccer={isSoccer}
        isBasketball={isBasketball}
        isAFL={isAFL}
        initialTab={activeTab}
        initialH2hFilter={h2hFilter as VenueFilter}
        initialHistoryFilter={historyFilter as VenueFilter}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED UI ATOMS
// ═══════════════════════════════════════════════════════════

function TeamHero({ team, role, ladderRank }: { team: Team; role: string; ladderRank?: number }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-2 text-center min-w-0">
      {team.logoUrl
        ? <img src={team.logoUrl} alt={team.name} className="w-14 h-14 sm:w-20 sm:h-20 object-contain" />
        : <span className="text-5xl">{team.logo}</span>}
      <div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-bold text-text-1 text-sm sm:text-base leading-tight">{team.name}</span>
          {ladderRank != null && (
            <span className="text-[9px] font-bold bg-surface2 border border-border rounded px-1.5 py-0.5 text-text-2 tabular-nums shrink-0">
              #{ladderRank}
            </span>
          )}
        </div>
        <div className="text-[10px] text-text-2 mt-0.5">{role}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DATA BUILDER
// ═══════════════════════════════════════════════════════════

async function buildESPNGame(
  id: string,
  sport: keyof typeof ESPN_PATHS,
  eventId: string,
): Promise<{ game: Game; homeSchedule: any[]; awaySchedule: any[] } | null> {
  // 1. Fetch scoreboard first to check status (discovery)
  const events = await fetchESPNScoreboard(sport);
  let raw = events.find((e: any) => e.id === eventId);

  // 2. Determine if we should bypass cache for the summary (box score)
  // We bypass if the game is live or if it's "pre" but kickoff has passed
  const state = raw?.status?.type?.state ?? "pre";
  const isActuallyLive = state === "in" || (state === "pre" && raw?.date && new Date(raw.date) <= new Date());
  
  // 3. Fetch summary with targeted revalidation
  const summary = await fetchESPNSummary(sport, eventId, isActuallyLive ? 0 : 30);

  if (!raw && summary.homeTeamId) {
    const sched = await fetchTeamSchedule(sport, summary.homeTeamId);
    raw = sched.find((e: any) => String(e.id) === eventId);
  }
  if (!raw) return null;

  const base = transformESPNEvent(raw, sport);
  if (!base) return null;

  const homeId = summary.homeTeamId;
  const awayId = summary.awayTeamId;
  let homeSchedule: any[] = [];
  let awaySchedule: any[] = [];
  let h2h = base.h2h;

  if (homeId && awayId) {
    const [hs, as_] = await Promise.all([fetchTeamSchedule(sport, homeId), fetchTeamSchedule(sport, awayId)]);
    homeSchedule = hs;
    awaySchedule = as_;
    if (hs.length) {
      const d = deriveFormFromSchedule(hs, homeId, sport);
      base.homeTeam.form = d.form;
      if (d.homeRec.wins + d.homeRec.losses > 0) base.homeTeam.splits.home = d.homeRec;
    }
    if (as_.length) {
      const d = deriveFormFromSchedule(as_, awayId, sport);
      base.awayTeam.form = d.form;
      if (d.awayRec.wins + d.awayRec.losses > 0) base.awayTeam.splits.away = d.awayRec;
    }
    if (hs.length) {
      h2h = findH2HFromSchedule(hs, base.homeTeam.name, awayId, { limit: 10, filter: "all", sport });
    }
  }

  for (const inj of summary.injuries ?? []) {
    const team = inj.teamName === base.homeTeam.name ? base.homeTeam : inj.teamName === base.awayTeam.name ? base.awayTeam : null;
    if (!team) continue;
    team.players.push({ name: inj.player, position: inj.position, stats: {}, injured: true, injuryNote: `${inj.status} — ${inj.note}` });
  }

  const isIndoor = sport === "basketball";
  const weatherLoc = (base.venue && base.venue !== "TBA") ? base.venue : base.city;
  const weather  = summary.weather && !isIndoor ? summary.weather : await fetchWeather(weatherLoc, isIndoor);
  const betRisk  = calcBetRisk(base.homeTeam, base.awayTeam, weather, (summary.injuries ?? []).length, h2h.filter(g => g.winner === base.homeTeam.name).length, h2h.length);

  const game = { ...base, h2h, weather, betRisk, boxScore: summary.boxScore, teamStats: summary.teamStats, lineScores: summary.lineScores, scoringPlays: summary.scoringPlays } as Game;
  return { game, homeSchedule, awaySchedule };
}

// ═══════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════

function computeProbs(h2h: H2HGame[], homeTeam: string): ProbCard[] {
  const n = h2h.length;
  const hw = h2h.filter(g => g.winner === homeTeam).length;
  const d  = h2h.filter(g => g.winner === "Draw").length;
  const aw = n - hw - d;

  let H = n>0 ? Math.round((hw/n)*100) : 45;
  let D = n>0 ? Math.round((d/n)*100)  : 25;
  let A = n>0 ? Math.round((aw/n)*100) : 30;
  const tot = H+D+A;
  if (tot!==100 && tot>0) { H=Math.round((H/tot)*100); D=Math.round((D/tot)*100); A=100-H-D; }

  let over25=55, btts=60, over15=78;
  if (n>=3) {
    const goals = h2h.map(g => { const p=g.score.split("-").map(Number); return (p[0]??0)+(p[1]??0); });
    const avg   = goals.reduce((a,b)=>a+b,0)/goals.length;
    over25 = Math.min(90,Math.max(30,Math.round(avg>2.5?65:45)));
    btts   = Math.min(85,Math.max(30,Math.round(avg>2?60:45)));
    over15 = Math.min(95,Math.max(55,Math.round(avg>1.5?78:62)));
  }
  const c = (v:number): "high"|"medium"|"low" => v>=60?"high":v>=40?"medium":"low";
  return [
    { label:"Home Win",  value:H,      conf:c(H)     },
    { label:"Draw",      value:D,      conf:c(D)     },
    { label:"Away Win",  value:A,      conf:c(A)     },
    { label:"Over 2.5",  value:over25, conf:c(over25)},
    { label:"BTTS",      value:btts,   conf:c(btts)  },
    { label:"Over 1.5",  value:over15, conf:c(over15)},
  ];
}

function generateInsights(
  game: Game,
  h2h: H2HGame[],
  homeHist: any[],
  awayHist: any[],
  isSoccer: boolean,
  isAFL: boolean,
  homeTeamGameStats: TeamGameStat[] = [],
  awayTeamGameStats: TeamGameStat[] = [],
  homePlayerHistory: Map<string, any[]> = new Map(),
  awayPlayerHistory: Map<string, any[]> = new Map(),
): AFLInsight[] {
  const out: AFLInsight[] = [];
  const { homeTeam, awayTeam } = game;
  const n = h2h.length;
  let idx = 0;

  const mk = (icon: string, text: string): AFLInsight => ({
    icon, text, id: `gen-${idx++}`,
    category: "h2h", direction: "neutral", severity: "medium", confidence: 60, title: text.split(" ").slice(0, 3).join(" "),
  });

  // ── H2H record ────────────────────────────────────────────────────────────
  if (n >= 3) {
    const hw = h2h.filter(g => g.winner === homeTeam.name).length;
    const aw = n - hw - h2h.filter(g => g.winner === "Draw").length;
    if (hw > aw) out.push(mk("◆", `${homeTeam.shortName} lead ${hw}-${aw} in last ${n} meetings`));
    else if (aw > hw) out.push(mk("◆", `${awayTeam.shortName} lead ${aw}-${hw} in last ${n} meetings`));
    else out.push(mk("◆", `Evenly matched — ${hw} wins each in last ${n} meetings`));
  }

  // ── Team form at venue ────────────────────────────────────────────────────
  const homeAtHome = homeHist.filter(g => g.homeAway === "home" && g.result);
  const homeHomeW  = homeAtHome.filter(g => g.result === "W").length;
  if (homeAtHome.length >= 3 && homeHomeW >= homeAtHome.length - 1)
    out.push(mk("◈", `${homeTeam.shortName} unbeaten in last ${homeAtHome.length} home games`));
  else if (homeAtHome.length >= 3 && homeHomeW >= Math.ceil(homeAtHome.length * 0.6))
    out.push(mk("◈", `${homeTeam.shortName} win ${homeHomeW} of last ${homeAtHome.length} at home`));

  const awayAway  = awayHist.filter(g => g.homeAway === "away" && g.result);
  const awayAwayW = awayAway.filter(g => g.result === "W").length;
  if (awayAway.length >= 3 && awayAwayW >= Math.ceil(awayAway.length * 0.5))
    out.push(mk("◇", `${awayTeam.shortName} win ${awayAwayW} of last ${awayAway.length} away`));

  // ── H2H goals ────────────────────────────────────────────────────────────
  if (isSoccer && n >= 3) {
    const goals  = h2h.map(g => { const p = g.score.split("-").map(Number); return (p[0] ?? 0) + (p[1] ?? 0); });
    const over25 = goals.filter(v => v > 2.5).length;
    if (over25 >= Math.ceil(n * 0.6)) out.push(mk("⚽", `Over 2.5 goals in ${over25} of last ${n} H2H`));
    const btts = h2h.filter(g => { const p = g.score.split("-").map(Number); return (p[0] ?? 0) > 0 && (p[1] ?? 0) > 0; }).length;
    if (btts >= Math.ceil(n * 0.6)) out.push(mk("⚽", `Both teams scored in ${btts} of last ${n} H2H`));
  }

  // ── Winning streaks ───────────────────────────────────────────────────────
  const winStreak = (form: string[]) => { let s = 0; for (const x of form) { if (x === "W") s++; else break; } return s; };
  const hs  = winStreak(homeTeam.form);
  const as_ = winStreak(awayTeam.form);
  if (hs  >= 3) out.push(mk("◉", `${homeTeam.shortName} on a ${hs}-match winning streak`));
  if (as_ >= 3) out.push(mk("◉", `${awayTeam.shortName} on a ${as_}-match winning streak`));

  // ── Soccer-specific insights ───────────────────────────────────────────────
  if (isSoccer) {

    // ── 1. Player card & goal streaks (highest punter value) ─────────────────
    // homePlayerHistory = home team players, venue-context = home
    // awayPlayerHistory = away team players, venue-context = away
    const shortName = (n: string) => n.split(" ").pop() ?? n;
    const playerInsights: AFLInsight[] = [];
    const addedPlayers = new Set<string>();

    for (const [histMap, teamShort, venueSide] of [
      [homePlayerHistory, homeTeam.shortName, "home"],
      [awayPlayerHistory, awayTeam.shortName, "away"],
    ] as [Map<string, any[]>, string, "home" | "away"][]) {
      for (const [name, logs] of Array.from(histMap.entries())) {
        if (addedPlayers.size >= 6) break; // cap total player insights

        // Only games where player actually appeared
        const played = logs.filter((g: any) =>
          g.minutesPlayed != null ? g.minutesPlayed > 0
          : (g.goals != null || g.yellowCards != null || g.shots != null)
        );
        if (played.length < 3) continue;

        // Venue-specific games (home team → their home form, away team → their away form)
        const venuePlayed = played.filter((g: any) =>
          venueSide === "home"
            ? g.playerTeamId === g.homeTeamId     // player's team was home
            : g.playerTeamId !== g.homeTeamId     // player's team was away
        );
        const relevant = venuePlayed.length >= 3 ? venuePlayed : played;
        const last5    = relevant.slice(0, 5);
        const pName    = shortName(name);
        const venueTag = venuePlayed.length >= 3 ? ` ${venueSide}` : "";

        // Yellow card frequency: 3 in last 5 (or 2 in last 3) → worth flagging
        const cardsN = last5.filter((g: any) => (g.yellowCards ?? 0) > 0).length;
        if (cardsN >= 2 && cardsN >= Math.ceil(last5.length * 0.5) && !addedPlayers.has(`card-${name}`)) {
          playerInsights.push(mk("🟨", `${pName} (${teamShort}) carded in ${cardsN} of last ${last5.length}${venueTag} games`));
          addedPlayers.add(`card-${name}`);
        }

        // Consecutive goal streak: 2+ in a row
        let goalStreak = 0;
        for (const g of relevant) {
          if ((g.goals ?? 0) > 0) goalStreak++;
          else break;
        }
        if (goalStreak >= 2 && !addedPlayers.has(`goal-${name}`)) {
          playerInsights.push(mk("⚽", `${pName} (${teamShort}) scored in ${goalStreak} consecutive${venueTag} games`));
          addedPlayers.add(`goal-${name}`);
        }

        // Goal involvement (goal or assist) in N of last 5
        const involvN = last5.filter((g: any) => ((g.goals ?? 0) + (g.assists ?? 0)) > 0).length;
        if (involvN >= 3 && goalStreak < 2 && !addedPlayers.has(`inv-${name}`)) {
          playerInsights.push(mk("⚽", `${pName} (${teamShort}) involved in a goal in ${involvN} of last ${last5.length}${venueTag} games`));
          addedPlayers.add(`inv-${name}`);
        }
      }
    }

    // Push card streaks first (highest bet signal), then goal/involvement
    const cardInsights = playerInsights.filter(i => i.icon === "🟨");
    const goalInsights = playerInsights.filter(i => i.icon !== "🟨");
    out.push(...cardInsights.slice(0, 3), ...goalInsights.slice(0, 3));

    // ── 2. Team venue insights (corners, clean sheets, BTTS, goals) ───────────
    const homeGames = homeTeamGameStats.filter(g => g.isHome);
    const awayGames = awayTeamGameStats.filter(g => !g.isHome);

    const avg = (arr: TeamGameStat[], fn: (g: TeamGameStat) => number | null): number | null => {
      const vals = arr.map(fn).filter((v): v is number => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    // Corners
    const homeCorners = avg(homeGames, g => g.corners);
    const awayCorners = avg(awayGames, g => g.corners);
    if (homeCorners != null && homeGames.length >= 3)
      out.push(mk("⛳", `${homeTeam.shortName} average ${homeCorners.toFixed(1)} corners per home game (last ${homeGames.length})`));
    if (awayCorners != null && awayGames.length >= 3)
      out.push(mk("⛳", `${awayTeam.shortName} average ${awayCorners.toFixed(1)} corners per away game (last ${awayGames.length})`));

    // Clean sheets
    const homeCS = homeGames.filter(g => g.goalsAgainst === 0).length;
    if (homeGames.length >= 4 && homeCS >= Math.ceil(homeGames.length * 0.4))
      out.push(mk("🛡", `${homeTeam.shortName} kept ${homeCS} clean sheets in last ${homeGames.length} home games`));
    const awayCS = awayGames.filter(g => g.goalsAgainst === 0).length;
    if (awayGames.length >= 4 && awayCS >= Math.ceil(awayGames.length * 0.4))
      out.push(mk("🛡", `${awayTeam.shortName} kept ${awayCS} clean sheets in last ${awayGames.length} away games`));

    // BTTS
    const homeBTTS = homeGames.filter(g => g.goalsFor > 0 && g.goalsAgainst > 0).length;
    if (homeGames.length >= 4 && homeBTTS >= Math.ceil(homeGames.length * 0.6))
      out.push(mk("⚽", `Both teams scored in ${homeBTTS} of ${homeTeam.shortName}'s last ${homeGames.length} home games`));

    // Away goal drought
    const awayGoalsFor = avg(awayGames, g => g.goalsFor);
    if (awayGoalsFor != null && awayGames.length >= 4 && awayGoalsFor < 1.0)
      out.push(mk("📉", `${awayTeam.shortName} score under 1 goal per away game on average (${awayGoalsFor.toFixed(1)}/game, last ${awayGames.length})`));

    // Yellow cards heavy away
    const awayYC = avg(awayGames, g => g.yellowCards);
    if (awayYC != null && awayGames.length >= 4 && awayYC >= 2.0)
      out.push(mk("🟨", `${awayTeam.shortName} average ${awayYC.toFixed(1)} yellow cards per away game (last ${awayGames.length})`));
  }

  return out.slice(0, 10);
}
