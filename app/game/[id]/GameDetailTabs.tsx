/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Game, Team, H2HGame, BoxScore, BoxScoreRow, Insight } from "@/lib/types";
import type { AFLInsight } from "@/lib/sports/afl/insights";
import type { ESPNPlayer, ESPNInjury } from "@/lib/sports/espnPlayers";
import type { SofascoreMatchData, SofascoreIncident, SofascoreMatchStats } from "@/lib/sports/sofascore";
import type { TeamGameStat } from "@/lib/sports/soccer/espnSoccerData";
import type { Scores365MatchData } from "@/lib/sports/soccer/365scoresData";
import type { AFLMatchAnalytics } from "@/lib/sports/afl/analytics";
import type { TeamHistoryGame, VenueFilter } from "@/lib/sports/espn";
import FormPills from "@/components/FormPills";
import SquadList from "@/components/SquadList";
import AFLDashboard from "@/components/afl/AFLDashboard";
import PlayerDrawer from "@/components/afl/PlayerDrawer";
import PlayerAvatar from "@/components/afl/PlayerAvatar";

import type { AFLPlayerAnalyticsResult } from "@/lib/sports/afl/players/types";
import NBAPlayerDrawer from "@/components/nba/NBAPlayerDrawer";
import type { NBAPlayerAnalyticsResult } from "@/lib/sports/nba/players/types";
import AFLKitchen from "@/components/afl/AFLKitchen";
import type { KitchenSlip } from "@/lib/sports/afl/kitchen";

import NBAKitchen from "@/components/nba/NBAKitchen";
import type { NBAKitchenSlip } from "@/lib/sports/nba/kitchen";
import SoccerPlayerList from "@/components/soccer/SoccerPlayerList";
import SoccerPlayerIntel from "@/components/soccer/SoccerPlayerIntel";
import SoccerPlayerDrawer from "@/components/soccer/SoccerPlayerDrawer";
import SoccerMatchInsights from "@/components/soccer/SoccerMatchInsights";
import SoccerKitchen from "@/components/soccer/SoccerKitchen";
import type { SoccerPlayerAnalyticsResult } from "@/lib/sports/soccer/types";
import type { SofascorePlayer, SofascoreGameLog } from "@/lib/sports/sofascore";
import type { SoccerKitchenSlip } from "@/lib/sports/soccer/kitchen";
import { filterSoccerSlipsForBookie, SOCCER_BOOKIES } from "@/lib/sports/soccer/bookies";
import { buildSlipColorMap, type SlipEntry } from "@/lib/sports/slipTracker";

// ─── Sofascore client-side fetch (browser bypasses Vercel IP blocks) ─────────

const SOFA_BASE = "https://api.sofascore.com/api/v1";
const SOFA_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer":         "https://www.sofascore.com/",
  "Origin":          "https://www.sofascore.com",
};

const CITY_ALIASES_CLIENT: [RegExp, string][] = [
  [/\bcologne\b/g, "koln"], [/\bmunich\b/g, "munchen"], [/\bmuenchen\b/g, "munchen"],
  [/\bmoenchengladbach\b/g, "monchengladbach"], [/\bathens\b/g, "athen"],
  [/\brome\b/g, "roma"], [/\bmilan\b/g, "milano"],
];

function sofaNormalize(name: string): string {
  let s = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const [p, r] of CITY_ALIASES_CLIENT) s = s.replace(p, r);
  return s
    .replace(/\bfc\b|\bcf\b|\bafc\b|\bsc\b|\bac\b|\bas\b|\bss\b|\brc\b|\bcd\b|\bud\b|\bsd\b|\bsv\b|\bfsv\b|\bssv\b|\bvfl\b|\bvfb\b|\brb\b|\btsg\b|\bbsc\b|\btsv\b|\bfk\b|\bsk\b|\bif\b|\bbk\b|\bgif\b/g, "")
    .replace(/\b(real|atletico|sporting|united|city|borussia|dynamo|lokomotiv|spartak)\b/g, "")
    .replace(/[^a-z0-9]/g, "").trim();
}

function sofaNamesMatch(a: string, b: string): boolean {
  const na = sofaNormalize(a), nb = sofaNormalize(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const short = na.length < nb.length ? na : nb;
  const long  = na.length < nb.length ? nb : na;
  return short.length >= 5 && long.startsWith(short);
}

async function sofaGet(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SOFA_BASE}${path}`, { headers: SOFA_HEADERS });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function useSofascoreClientFetch(
  isSoccer: boolean,
  serverData: import("@/lib/sports/sofascore").SofascoreMatchData | null,
  game: Game
): import("@/lib/sports/sofascore").SofascoreMatchData | null {
  const [data, setData] = useState<import("@/lib/sports/sofascore").SofascoreMatchData | null>(null);

  useEffect(() => {
    // Run if: no server data at all, OR server has match data but no lineups
    if (!isSoccer || (serverData !== null && serverData?.lineups != null)) return;

    async function run() {
      const kickoff = game.kickoff ?? new Date().toISOString();
      const base = new Date(kickoff);
      const datesToTry = [0, -1, 1].map(off => {
        const d = new Date(base);
        d.setDate(d.getDate() + off);
        return d.toISOString().slice(0, 10);
      });

      let eventId: number | null = null;
      let homeTeamId: number | undefined;
      let awayTeamId: number | undefined;
      let tournamentId: number | undefined;
      let seasonId: number | undefined;

      for (const dateStr of datesToTry) {
        const resp = await sofaGet(`/sport/football/scheduled-events/${dateStr}`);
        if (!resp) continue;
        const events = (resp.events as unknown[]) ?? [];
        for (const e of events) {
          const ev = e as Record<string, unknown>;
          const home = (ev.homeTeam as Record<string, unknown>)?.name as string ?? "";
          const away = (ev.awayTeam as Record<string, unknown>)?.name as string ?? "";
          if (sofaNamesMatch(home, game.homeTeam.name) && sofaNamesMatch(away, game.awayTeam.name)) {
            eventId = ev.id as number;
            homeTeamId = ((ev.homeTeam as Record<string, unknown>)?.id as number) ?? undefined;
            awayTeamId = ((ev.awayTeam as Record<string, unknown>)?.id as number) ?? undefined;
            const tournObj = (ev.tournament as Record<string, unknown>)?.uniqueTournament as Record<string, unknown> | undefined;
            tournamentId = (tournObj?.id as number) ?? undefined;
            seasonId = ((ev.season as Record<string, unknown>)?.id as number) ?? undefined;
            break;
          }
        }
        if (eventId) break;
      }

      if (!eventId) return;

      const [lineupsRaw, incidentsRaw, statsRaw] = await Promise.all([
        sofaGet(`/event/${eventId}/lineups`),
        sofaGet(`/event/${eventId}/incidents`),
        sofaGet(`/event/${eventId}/statistics`),
      ]);

      // Parse lineups
      let lineups: import("@/lib/sports/sofascore").SofascoreLineup | null = null;
      if (lineupsRaw) {
        const parseTeam = (side: unknown): import("@/lib/sports/sofascore").SofascorePlayer[] => {
          const s = side as Record<string, unknown>;
          return ((s?.players as unknown[]) ?? []).map((raw): import("@/lib/sports/sofascore").SofascorePlayer => {
            const p = raw as Record<string, unknown>;
            const player  = (p.player  as Record<string, unknown>) ?? {};
            const statObj = (p.statistics as Record<string, unknown>) ?? {};
            const stats: Record<string, number | null> = {};
            for (const [k, v] of Object.entries(statObj)) stats[k] = typeof v === "number" ? v : null;
            const minsPlayed: number | undefined =
              statObj.minutesPlayed != null ? (statObj.minutesPlayed as number)
              : statObj.secondsPlayed != null ? Math.round((statObj.secondsPlayed as number) / 60)
              : undefined;
            return {
              id:           (player.id as number) ?? 0,
              name:         (player.name as string) ?? "Unknown",
              shortName:    (player.shortName as string) ?? (player.name as string) ?? "Unknown",
              position:     (p.position as string) ?? (player.position as string) ?? "?",
              jerseyNumber: String(p.jerseyNumber ?? p.shirtNumber ?? ""),
              starter:      !(p.substitute as boolean),
              minutesPlayed: minsPlayed,
              rating:       statObj.rating != null ? (statObj.rating as number) : undefined,
              stats,
            };
          });
        };
        lineups = {
          confirmed:     Boolean(lineupsRaw.confirmed),
          homeFormation: (lineupsRaw.home as Record<string, unknown>)?.formation as string | undefined,
          awayFormation: (lineupsRaw.away as Record<string, unknown>)?.formation as string | undefined,
          home: parseTeam(lineupsRaw.home),
          away: parseTeam(lineupsRaw.away),
        };
      }

      // Parse incidents
      const incidents: import("@/lib/sports/sofascore").SofascoreIncident[] = [];
      for (const item of ((incidentsRaw?.incidents as unknown[]) ?? [])) {
        const i = item as Record<string, unknown>;
        const rawType = i.incidentType as string;
        const minute  = (i.time ?? i.minute ?? 0) as number;
        const isHome  = Boolean(i.isHome);
        const getP    = (k: string) => ((i[k] as Record<string, unknown>)?.name as string | undefined);
        if (rawType === "goal") {
          incidents.push({ type: "goal", minute, addedTime: i.addedTime as number | undefined, isHome, playerName: getP("player"), assistName: getP("assist1"), incidentClass: i.incidentClass as string | undefined });
        } else if (rawType === "card") {
          incidents.push({ type: "card", minute, isHome, playerName: getP("player"), incidentClass: i.incidentClass as string | undefined });
        } else if (rawType === "substitution") {
          incidents.push({ type: "substitution", minute, isHome, playerInName: getP("playerIn"), playerOutName: getP("playerOut") });
        } else if (rawType === "varDecision") {
          incidents.push({ type: "var", minute, isHome, description: i.incidentClass as string | undefined });
        }
      }

      // Parse match stats
      const matchStats: import("@/lib/sports/sofascore").SofascoreMatchStats[] = [];
      if (statsRaw && Array.isArray(statsRaw.statistics)) {
        for (const period of statsRaw.statistics as Record<string, unknown>[]) {
          matchStats.push({
            period: String(period.period ?? "ALL"),
            groups: (Array.isArray(period.groups) ? period.groups : []).map((g: Record<string, unknown>) => ({
              groupName: String(g.groupName ?? ""),
              statisticsItems: (Array.isArray(g.statisticsItems) ? g.statisticsItems : []).map((it: Record<string, unknown>) => ({
                name:           String(it.name ?? ""),
                home:           String(it.home ?? "0"),
                away:           String(it.away ?? "0"),
                homeValue:      typeof it.homeValue === "number" ? it.homeValue : parseFloat(String(it.home ?? "0")) || 0,
                awayValue:      typeof it.awayValue === "number" ? it.awayValue : parseFloat(String(it.away ?? "0")) || 0,
                statisticsType: String(it.statisticsType ?? "positive"),
                compareCode:    typeof it.compareCode === "number" ? it.compareCode : 2,
                renderType:     typeof it.renderType  === "number" ? it.renderType  : 1,
              })),
            })),
          });
        }
      }

      // Parse team stats
      const parseTeamStats = (raw: Record<string, unknown> | null): import("@/lib/sports/sofascore").SofascoreTeamStats | null => {
        if (!raw) return null;
        const s = (raw.statistics ?? {}) as Record<string, unknown>;
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
      };

      const [homeTeamStatsRaw, awayTeamStatsRaw] = (homeTeamId && awayTeamId && tournamentId && seasonId)
        ? await Promise.all([
            sofaGet(`/team/${homeTeamId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`),
            sofaGet(`/team/${awayTeamId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`),
          ])
        : [null, null];

      setData({
        sofascoreId:   eventId,
        lineups, incidents,
        homeTeamId, awayTeamId, tournamentId, seasonId,
        homeTeamStats: parseTeamStats(homeTeamStatsRaw),
        awayTeamStats: parseTeamStats(awayTeamStatsRaw),
        matchStats:    matchStats.length > 0 ? matchStats : undefined,
      });
    }

    run();
  }, [isSoccer, serverData, game.homeTeam.name, game.awayTeam.name, game.kickoff]);

  return serverData ?? data;
}

// ─── Browser-side player game fetch (for kitchen) ─────────────────────────────

async function fetchPlayerGamesClient(playerId: number): Promise<import("@/lib/sports/sofascore").SofascoreGameLog[]> {
  const eventsData = await sofaGet(`/player/${playerId}/events/last/0`);
  if (!eventsData) return [];

  const finished = ((eventsData.events as unknown[]) ?? []).filter((e: unknown) => {
    const ev = e as Record<string, unknown>;
    return (ev.status as Record<string, unknown>)?.type === "finished";
  });

  return Promise.all(finished.slice(0, 8).map(async (e): Promise<import("@/lib/sports/sofascore").SofascoreGameLog> => {
    const ev  = e as Record<string, unknown>;
    const eid = ev.id as number;
    const ht  = (ev.homeTeam as Record<string, unknown>) ?? {};
    const at  = (ev.awayTeam as Record<string, unknown>) ?? {};
    const hs  = (ev.homeScore as Record<string, unknown>) ?? {};
    const as_ = (ev.awayScore as Record<string, unknown>) ?? {};

    const sd = await sofaGet(`/event/${eid}/player/${playerId}/statistics`);
    const ps = ((sd?.statistics ?? sd ?? {}) as Record<string, unknown>);
    const n  = (k: string) => (typeof ps[k] === "number" ? ps[k] as number : null);
    const mins: number | null =
      ps.minutesPlayed != null ? (ps.minutesPlayed as number)
      : ps.secondsPlayed != null ? Math.round((ps.secondsPlayed as number) / 60)
      : null;

    return {
      eventId:        eid,
      date:           new Date((ev.startTimestamp as number) * 1000).toISOString().slice(0, 10),
      homeTeam:       (ht.name as string) ?? "",
      awayTeam:       (at.name as string) ?? "",
      homeScore:      (hs.current ?? hs.display ?? 0) as number,
      awayScore:      (as_.current ?? as_.display ?? 0) as number,
      homeTeamId:     (ht.id as number) ?? 0,
      awayTeamId:     (at.id as number) ?? 0,
      playerTeamId:   null,
      goals:          n("goals"),
      assists:        n("goalAssist"),
      rating:         n("rating"),
      minutesPlayed:  mins,
      shots:          n("totalShot") ?? n("shots"),
      shotsOnTarget:  n("onTargetScoringAttempt") ?? n("shotsOnTarget"),
      keyPasses:      n("keyPass") ?? n("keyPasses"),
      passes:         n("totalPass") ?? n("passes"),
      passAccuracy:   null,
      tackles:        n("totalTackle") ?? n("tackles"),
      interceptions:  n("interceptionWon") ?? n("interceptions"),
      yellowCards:    n("yellowCard") ?? n("yellowCards"),
      foulsCommitted: n("fouls") ?? n("foulsCommitted"),
      saves:          n("savedShotsFromInsideTheBox") ?? n("saves"),
      xG:             n("expectedGoals"),
      xA:             n("expectedAssists"),
    };
  }));
}

// ─── Soccer kitchen client hook ───────────────────────────────────────────────

function useSoccerKitchenClient(
  isSoccer:      boolean,
  sofascore:     import("@/lib/sports/sofascore").SofascoreMatchData | null,
  serverSlips:   import("@/lib/sports/soccer/kitchen").SoccerKitchenSlip[] | undefined,
  game:          Game,
  homeHistories: HistoryVariants,
  awayHistories: HistoryVariants,
): import("@/lib/sports/soccer/kitchen").SoccerKitchenSlip[] | undefined {
  const [clientSlips, setClientSlips] = useState<import("@/lib/sports/soccer/kitchen").SoccerKitchenSlip[] | undefined>(undefined);
  const fetchedRef = useRef(false);
  const hasServerSlips = serverSlips?.some(s => s.legs.length > 0) ?? false;

  useEffect(() => {
    if (!isSoccer || hasServerSlips) return;
    if (!sofascore?.lineups) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function run() {
      const lineups = sofascore!.lineups!;
      const pickPlayers = (players: import("@/lib/sports/sofascore").SofascorePlayer[], side: "home" | "away", teamName: string, teamAbbr: string) =>
        players
          .filter(p => p.starter && !["G", "GK", "GL"].includes(p.position.toUpperCase()))
          .slice(0, 6)
          .map(p => ({ sofaId: p.id, name: p.name, shortName: p.shortName, position: p.position, side, teamAbbr, teamName, games: [] as import("@/lib/sports/sofascore").SofascoreGameLog[] }));

      const allPlayers = [
        ...pickPlayers(lineups.home, "home", game.homeTeam.name, game.homeTeam.shortName),
        ...pickPlayers(lineups.away, "away", game.awayTeam.name, game.awayTeam.shortName),
      ];
      if (allPlayers.length === 0) return;

      const gameResults = await Promise.all(allPlayers.map(p => fetchPlayerGamesClient(p.sofaId)));
      gameResults.forEach((games, i) => { allPlayers[i].games = games; });

      try {
        const res = await fetch("/api/soccer/kitchen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            homeAbbr:      game.homeTeam.shortName,
            awayAbbr:      game.awayTeam.shortName,
            homeTeamName:  game.homeTeam.name,
            awayTeamName:  game.awayTeam.name,
            homeHistory:   homeHistories.home,
            awayHistory:   awayHistories.away,
            homeTeamStats: sofascore!.homeTeamStats ?? null,
            awayTeamStats: sofascore!.awayTeamStats ?? null,
            players:       allPlayers,
            weather:       game.weather ? { condition: game.weather.condition, windKph: game.weather.windKph } : null,
          }),
        });
        if (res.ok) setClientSlips(await res.json());
      } catch { /* silent */ }
    }

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSoccer, sofascore?.lineups, hasServerSlips]);

  return hasServerSlips ? serverSlips : clientSlips;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Overview",     kitchenOnly: false, soccerOnly: false },
  { key: "players",  label: "Players",      kitchenOnly: false, soccerOnly: false },
  { key: "stats",    label: "Stats",        kitchenOnly: false, soccerOnly: false },
  { key: "h2h",      label: "H2H",          kitchenOnly: false, soccerOnly: false },
  { key: "kitchen",  label: "🍳 Kitchen",   kitchenOnly: true,  soccerOnly: false },
] as const;

const WEATHER_ICON: Record<string, string> = {
  Clear: "☀️", Cloudy: "☁️", "Partly Cloudy": "⛅", Rain: "🌧️",
  "Rain Showers": "🌧️", Drizzle: "🌦️", Storm: "⛈️", Snow: "❄️",
  "Snow Showers": "❄️", Foggy: "🌫️", Snowy: "❄️",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HistoryVariants {
  all:  TeamHistoryGame[];
  home: TeamHistoryGame[];
  away: TeamHistoryGame[];
}

export interface H2HVariants {
  all:  H2HGame[];
  home: H2HGame[];
  away: H2HGame[];
}

export interface GameDetailTabsProps {
  game:               Game;
  id:                 string;
  homeSquad:          ESPNPlayer[];
  awaySquad:          ESPNPlayer[];
  homeInjuries:       ESPNInjury[];
  awayInjuries:       ESPNInjury[];
  homeHistories:      HistoryVariants;
  awayHistories:      HistoryVariants;
  h2hVariants:        H2HVariants;
  aflAnalytics:       AFLMatchAnalytics | null;
  sofascore:          SofascoreMatchData | null;
  insights:           AFLInsight[];
  isSoccer:           boolean;
  isBasketball:       boolean;
  isAFL:              boolean;
  kitchenSlips?:        KitchenSlip[];
  aflBet365Slips?:      KitchenSlip[];
  aflDabbleSlips?:      KitchenSlip[];
  aflHasRealOdds?:      boolean;
  nbaKitchenSlips?:     NBAKitchenSlip[];
  soccerKitchenSlips?:  SoccerKitchenSlip[];
  homeTeamGameStats?:   TeamGameStat[];
  awayTeamGameStats?:   TeamGameStat[];
  scores365Data?:       Scores365MatchData | null;
  fotmobPlayerMap?:     { [playerName: string]: number };
  homePlayerHistory?:   Map<string, SofascoreGameLog[]>;
  awayPlayerHistory?:   Map<string, SofascoreGameLog[]>;
  initialTab:         string;
  initialH2hFilter:   VenueFilter;
  initialHistoryFilter: VenueFilter;
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl p-4 border border-border">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-text-2 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function H2HPanel({ h2h, homeTeam, awayTeam, compact }: {
  h2h: H2HGame[]; homeTeam: string; awayTeam: string; compact?: boolean;
}) {
  const homeWins = h2h.filter(g => g.winner === homeTeam).length;
  const draws    = h2h.filter(g => g.winner === "Draw").length;
  const awayWins = h2h.length - homeWins - draws;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 text-center">
          <div className="text-2xl font-black text-primary">{homeWins}</div>
          <div className="text-[10px] text-text-2">{homeTeam.split(" ").pop()} Wins</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-2xl font-black text-[#F59E0B]">{draws}</div>
          <div className="text-[10px] text-text-2">Draws</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-2xl font-black text-text-2">{awayWins}</div>
          <div className="text-[10px] text-text-2">{awayTeam.split(" ").pop()} Wins</div>
        </div>
      </div>
      {(compact ? h2h.slice(0, 4) : h2h).map((g, i) => {
        const isHomeWin = g.winner === homeTeam;
        const isAwayWin = g.winner === awayTeam;
        return (
          <Link key={i} href={g.gameId ? `/game/${g.gameId}` : "#"}
            className="flex items-center gap-2 py-1.5 border-b border-border last:border-0 hover:bg-surface2 rounded px-1 text-xs group">
            <span className="text-text-2 w-16 shrink-0">{g.date}</span>
            <span className={`flex-1 truncate text-right ${isHomeWin ? "text-white font-medium" : "text-text-2"}`}>{g.homeTeam}</span>
            <span className="font-bold text-text-1 tabular-nums w-12 text-center shrink-0">{g.score}</span>
            <span className={`flex-1 truncate ${isAwayWin ? "text-white font-medium" : "text-text-2"}`}>{g.awayTeam}</span>
            <span className={`text-[10px] px-1.5 py-px rounded font-bold shrink-0 ${
              isHomeWin ? "bg-primary/20 text-primary" :
              isAwayWin ? "bg-white/10 text-text-2" : "bg-[#F59E0B]/20 text-[#F59E0B]"
            }`}>{isHomeWin ? "H" : isAwayWin ? "A" : "D"}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ComparisonBars({ homeTeam, awayTeam, stats, compact }: {
  homeTeam: Team; awayTeam: Team;
  stats: { home: Record<string, any>; away: Record<string, any> };
  compact?: boolean;
}) {
  const keys = Object.keys(stats.home).slice(0, compact ? 6 : 12);
  return (
    <div className="space-y-3">
      {keys.map(k => {
        const hv = parseFloat(String(stats.home[k] ?? 0)) || 0;
        const av = parseFloat(String(stats.away[k] ?? 0)) || 0;
        const max = Math.max(hv, av, 1);
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-white font-medium tabular-nums w-12">{stats.home[k] ?? "—"}</span>
              <span className="text-text-2 uppercase text-[10px] tracking-wider flex-1 text-center">{k}</span>
              <span className="text-text-2 tabular-nums w-12 text-right">{stats.away[k] ?? "—"}</span>
            </div>
            <div className="flex gap-1 h-[3px]">
              <div className="flex-1 bg-surface2 rounded-full overflow-hidden flex justify-end">
                <div className="h-full bg-primary rounded-full" style={{ width: `${(hv/max)*100}%` }} />
              </div>
              <div className="flex-1 bg-surface2 rounded-full overflow-hidden">
                <div className="h-full bg-text-2/40 rounded-full" style={{ width: `${(av/max)*100}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompactBoxScore({ boxScore, homeTeam, awayTeam }: {
  boxScore: BoxScore; homeTeam: Team; awayTeam: Team;
}) {
  const headers = boxScore.statHeaders.slice(0, 6);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[{ t: homeTeam, rows: boxScore.home }, { t: awayTeam, rows: boxScore.away }].map(({ t, rows }) => (
        <div key={t.name}>
          <div className="flex items-center gap-1.5 mb-2">
            {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
            <span className="text-xs text-text-2">{t.shortName}</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-1 text-text-2">Player</th>
                {headers.map(h => <th key={h} className="text-right py-1 px-1 text-text-2">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1 text-text-1 truncate max-w-[100px]">{r.player}</td>
                  {headers.map(h => (
                    <td key={h} className="py-1 px-1 text-right text-text-2 tabular-nums">
                      {r.stats[h] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ─── Soccer 365Scores Player Stats ───────────────────────────────────────────

function Soccer365PlayerStats({
  homePlayers, awayPlayers, homeTeam, awayTeam,
}: {
  homePlayers: import("@/lib/sports/soccer/365scoresData").Scores365Player[];
  awayPlayers: import("@/lib/sports/soccer/365scoresData").Scores365Player[];
  homeTeam: Team;
  awayTeam: Team;
}) {
  const posOrder: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Forward: 3, Attacker: 3 };
  const sortPlayers = (players: typeof homePlayers) =>
    [...players].sort((a, b) => {
      const pa = posOrder[a.position] ?? 4;
      const pb = posOrder[b.position] ?? 4;
      if (pa !== pb) return pa - pb;
      return (b.starter ? 1 : 0) - (a.starter ? 1 : 0);
    });

  const posBadge = (pos: string) => {
    if (pos === "Goalkeeper") return { label: "GK", color: "text-[#FBBF24]" };
    if (pos === "Defender")   return { label: "DEF", color: "text-[#60A5FA]" };
    if (pos === "Midfielder") return { label: "MID", color: "text-[#34D399]" };
    return { label: "FWD", color: "text-[#F87171]" };
  };

  const ratingColor = (r: number | null) => {
    if (r == null) return "text-text-2";
    if (r >= 7.5)  return "text-[#22C55E]";
    if (r >= 6.5)  return "text-[#F59E0B]";
    return "text-[#EF4444]";
  };

  const sides = [
    { team: homeTeam, players: sortPlayers(homePlayers) },
    { team: awayTeam, players: sortPlayers(awayPlayers) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {sides.map(({ team, players }) => {
        const ratedPlayers = players.filter(p => p.rating != null);
        const avgRating = ratedPlayers.length > 0
          ? ratedPlayers.reduce((s, p) => s + p.rating!, 0) / ratedPlayers.length
          : null;

        return (
          <div key={team.name}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                {team.logoUrl && <img src={team.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                <span className="text-xs font-medium text-text-1">{team.shortName}</span>
              </div>
              {avgRating != null && (
                <span className={`text-xs font-bold ${ratingColor(avgRating)}`}>
                  Avg {avgRating.toFixed(1)}
                </span>
              )}
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-1 text-[9px] text-text-2 uppercase tracking-wide mb-1 px-0.5">
              <span className="w-5 shrink-0" />
              <span className="flex-1">Player</span>
              <span className="w-8 text-center shrink-0">Sh</span>
              <span className="w-8 text-center shrink-0">KP</span>
              <span className="w-8 text-center shrink-0">Tkl</span>
              <span className="w-10 text-right shrink-0">xG</span>
              <span className="w-9 text-right shrink-0">Rtg</span>
            </div>

            <div className="space-y-0">
              {players.slice(0, 14).map((p, i) => {
                const badge = posBadge(p.position);
                return (
                  <div key={i} className={`flex items-center gap-1 py-1.5 border-b border-border/30 last:border-0 ${!p.starter ? "opacity-60" : ""}`}>
                    {/* Jersey */}
                    <span className="text-[9px] font-mono text-text-2 w-4 shrink-0 text-right">{p.jersey}</span>
                    {/* Name + event badges */}
                    <span className="flex-1 min-w-0">
                      <span className="text-text-1 text-[11px] font-medium truncate block leading-tight">
                        {p.shortName || p.name}
                      </span>
                      {/* Inline event badges */}
                      <span className="flex items-center gap-1 mt-0.5">
                        {p.goals > 0 && (
                          <span className="text-[8px] bg-white/10 text-text-1 rounded px-1 font-medium">
                            ⚽ {p.goals > 1 ? `×${p.goals}` : ""}
                          </span>
                        )}
                        {p.assists > 0 && (
                          <span className="text-[8px] bg-primary/10 text-primary rounded px-1 font-medium">
                            🅐 {p.assists > 1 ? `×${p.assists}` : ""}
                          </span>
                        )}
                        {p.yellowCard && <span className="text-[8px]">🟨</span>}
                        {p.redCard   && <span className="text-[8px]">🟥</span>}
                      </span>
                    </span>
                    {/* Shots */}
                    <span className="w-8 text-center text-[10px] text-text-2 shrink-0 tabular-nums">
                      {p.shots > 0 ? p.shots : "—"}
                    </span>
                    {/* Key passes */}
                    <span className="w-8 text-center text-[10px] text-text-2 shrink-0 tabular-nums">
                      {p.keyPasses > 0 ? p.keyPasses : "—"}
                    </span>
                    {/* Tackles */}
                    <span className="w-8 text-center text-[10px] text-text-2 shrink-0 tabular-nums">
                      {p.tackles > 0 ? p.tackles : "—"}
                    </span>
                    {/* xG */}
                    <span className="w-10 text-right text-[10px] shrink-0 tabular-nums">
                      {(p.xG ?? 0) >= 0.05
                        ? <span className="text-[#F59E0B] font-medium">{p.xG!.toFixed(2)}</span>
                        : <span className="text-text-2">—</span>}
                    </span>
                    {/* Rating */}
                    <span className={`w-9 text-right text-[11px] font-black shrink-0 tabular-nums ${ratingColor(p.rating)}`}>
                      {p.rating != null ? p.rating.toFixed(1) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Minutes note for subs */}
            <p className="text-[9px] text-text-2 mt-1.5 text-right">
              Starters + used subs · via 365Scores
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Slip dot indicators ──────────────────────────────────────────────────────

function SlipDots({ entries }: { entries: SlipEntry[] }) {
  if (!entries.length) return null;
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {entries.map(e => (
        <span
          key={e.type}
          className="text-[8px] font-black px-0.5 rounded leading-none"
          style={{ color: e.color, backgroundColor: `${e.color}22`, border: `1px solid ${e.color}44` }}
          title={e.type}
        >
          {e.abbr}
        </span>
      ))}
    </div>
  );
}

function AFLPlayerList({
  rows,
  headers,
  teamId,
  opponent,
  matchContext,
  slipColorMap,
}: {
  rows: BoxScoreRow[];
  headers: string[];
  teamId?: string;
  opponent?: string;
  matchContext?: "home" | "away";
  slipColorMap?: Map<string, SlipEntry[]>;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; position?: string; jersey?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerData, setDrawerData] = useState<AFLPlayerAnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);

  const AFL_STAT_LEGEND: Record<string, string> = {
    D:"Disposals", K:"Kicks", HB:"Handballs", G:"Goals", B:"Behinds",
    T:"Tackles", M:"Marks", HO:"Hitouts", FF:"Free For", FA:"Free Against",
  };

  const showHeaders = headers.slice(0, 7);
  if (!rows.length) return <p className="text-xs text-text-2">No data available.</p>;

  const sortedRows = sortBy
    ? [...rows].sort((a, b) => Number(b.stats[sortBy] ?? 0) - Number(a.stats[sortBy] ?? 0))
    : rows;

  async function handlePlayerClick(row: BoxScoreRow) {
    if (!row.playerId) return;
    
    setSelectedPlayer({ id: row.playerId, name: row.player, position: row.position, jersey: row.jersey });
    setLoading(true);
    setDrawerData(null);
    setError(null);

    try {
      const url = `/api/afl/player/${row.playerId}?homeAway=${matchContext}&opponent=${encodeURIComponent(opponent || "")}&teamId=${encodeURIComponent(teamId || "")}&name=${encodeURIComponent(row.player)}&position=${encodeURIComponent(row.position || "")}&jersey=${encodeURIComponent(row.jersey || "")}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError("Could not load player data.");
        setLoading(false);
        return;
      }
      const data: AFLPlayerAnalyticsResult = await res.json();
      setDrawerData(data);
    } catch {
      setError("Failed to fetch player analytics.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setSelectedPlayer(null);
    setDrawerData(null);
    setError(null);
    setLoading(false);
  }

  return (
    <div className="overflow-x-auto">
      {/* Stat legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 pb-2 border-b border-border">
        {showHeaders.filter(h => AFL_STAT_LEGEND[h]).map(h => (
          <span key={h} className="text-[10px] text-text-2">
            <span className="font-bold text-text-1">{h}</span> {AFL_STAT_LEGEND[h]}
          </span>
        ))}
      </div>
      <table className="w-full text-xs min-w-[360px]">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left py-1.5 pr-2 text-text-2">Player</th>
            {showHeaders.map(h => (
              <th
                key={h}
                className={`text-right py-1.5 px-1 cursor-pointer select-none transition-colors ${
                  sortBy === h ? "text-primary" : "text-text-2 hover:text-text-1"
                }`}
                title={AFL_STAT_LEGEND[h] ?? h}
                onClick={() => setSortBy(prev => prev === h ? null : h)}
              >
                {h}{sortBy === h ? " ↓" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => {
            const slipEntries = slipColorMap?.get(r.player) ?? [];
            return (
            <tr
              key={i}
              className={`border-b border-border last:border-0 hover:bg-surface2 transition-colors ${r.playerId ? "cursor-pointer" : ""}`}
              onClick={() => handlePlayerClick(r)}
            >
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-1.5">
                  <PlayerAvatar
                    src={r.headshot}
                    name={r.player}
                    size={20}
                  />
                  <span className="text-text-1 truncate max-w-[90px] font-medium group-hover:text-primary">{r.player}</span>
                  {slipEntries.length > 0 && <SlipDots entries={slipEntries} />}
                  {r.playerId && <span className="text-[10px] text-primary ml-auto">INTEL</span>}
                </div>
              </td>
              {showHeaders.map(h => {
                const v = r.stats[h];
                const hi = h === "D" && Number(v) >= 25;
                return (
                  <td key={h} className={`py-1.5 px-1 text-right tabular-nums ${hi ? "text-primary font-bold" : "text-text-2"}`}>
                    {v ?? "—"}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>

      {/* Drawer */}
      {selectedPlayer && (
        <>
          {loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-xl bg-bg border-l border-primary/20 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-xs font-bold text-text-2 uppercase tracking-widest">Loading Intel: {selectedPlayer.name}</p>
                </div>
              </div>
            </>
          )}
          {error && !loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60]" onClick={handleClose} />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-xl bg-bg border-l border-primary/20 flex items-center justify-center">
                <div className="text-center px-10">
                  <p className="text-[#EF4444] font-bold mb-4 uppercase tracking-tight">{error}</p>
                  <button onClick={handleClose} className="text-xs font-black text-text-2 hover:text-text-1 underline uppercase tracking-widest">Close</button>
                </div>
              </div>
            </>
          )}
          {drawerData && !loading && (
            <PlayerDrawer data={drawerData} onClose={handleClose} />
          )}
        </>
      )}
    </div>
  );
}

function NBAPlayerList({
  rows,
  headers,
  teamId,
  opponent,
  matchContext,
  slipColorMap,
}: {
  rows:          BoxScoreRow[];
  headers:       string[];
  teamId?:       string;
  opponent?:     string;
  matchContext?: "home" | "away";
  slipColorMap?: Map<string, SlipEntry[]>;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading]               = useState(false);
  const [drawerData, setDrawerData]         = useState<NBAPlayerAnalyticsResult | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [sortBy, setSortBy]                 = useState<string | null>(null);

  const PREFERRED = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FG", "3PT", "+/-"];
  const displayHeaders = PREFERRED.filter(h => headers.includes(h))
    .concat(headers.filter(h => !PREFERRED.includes(h))).slice(0, 10);

  if (!rows.length) return <p className="text-xs text-text-2">No data available.</p>;

  const rawStarters = rows.filter(r => r.starter !== false && rows.some(x => x.starter));
  const rawBench    = rows.filter(r => r.starter === false);
  const hasGroups = rawStarters.length > 0 && rawBench.length > 0;

  function sortGroup(g: BoxScoreRow[]) {
    return sortBy ? [...g].sort((a, b) => Number(b.stats[sortBy] ?? 0) - Number(a.stats[sortBy] ?? 0)) : g;
  }

  const groups = hasGroups
    ? [{ label: "STARTERS", rows: sortGroup(rawStarters) }, { label: "BENCH", rows: sortGroup(rawBench) }]
    : [{ label: "", rows: sortGroup(rows) }];

  async function handlePlayerClick(row: BoxScoreRow) {
    if (!row.playerId || !teamId) return;
    setSelectedPlayer({ id: row.playerId, name: row.player });
    setLoading(true);
    setDrawerData(null);
    setError(null);
    try {
      const url = `/api/nba/player/${row.playerId}?teamId=${encodeURIComponent(teamId)}&homeAway=${matchContext}&opponent=${encodeURIComponent(opponent || "")}&name=${encodeURIComponent(row.player)}&position=${encodeURIComponent(row.position || "")}&headshot=${encodeURIComponent(row.headshot ?? "")}`;
      const res = await fetch(url);
      if (!res.ok) { setError("Could not load player data."); return; }
      setDrawerData(await res.json());
    } catch {
      setError("Failed to fetch player analytics.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setSelectedPlayer(null);
    setDrawerData(null);
    setError(null);
    setLoading(false);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[520px]">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left py-2 pr-2 text-text-2 sticky left-0 bg-surface">Player</th>
            {displayHeaders.map(h => (
              <th
                key={h}
                className={`text-right py-2 px-1.5 whitespace-nowrap font-medium cursor-pointer select-none transition-colors ${
                  sortBy === h ? "text-primary" : "text-text-2 hover:text-text-1"
                }`}
                onClick={() => setSortBy(prev => prev === h ? null : h)}
              >
                {h}{sortBy === h ? " ↓" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ label, rows: groupRows }) => (
            <>
              {label && (
                <tr key={`grp-${label}`}>
                  <td colSpan={displayHeaders.length + 1} className="pt-3 pb-1 px-0">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-text-2">{label}</span>
                  </td>
                </tr>
              )}
              {groupRows.map((r, i) => {
                const slipEntries = slipColorMap?.get(r.player) ?? [];
                return (
                <tr
                  key={`${label}-${i}`}
                  className={`border-b border-border last:border-0 hover:bg-surface2 transition-colors ${r.playerId && teamId ? "cursor-pointer" : ""}`}
                  onClick={() => handlePlayerClick(r)}
                >
                  <td className="py-2 pr-2 sticky left-0 bg-surface">
                    <div className="flex items-center gap-1.5">
                      <PlayerAvatar src={r.headshot} name={r.player} size={22} />
                      <div className="min-w-0">
                        <span className="text-text-1 truncate max-w-[80px] font-medium block text-[11px] leading-tight">{r.player}</span>
                        {r.position && <span className="text-[9px] text-text-2 leading-tight">{r.position}</span>}
                      </div>
                      {slipEntries.length > 0 && <SlipDots entries={slipEntries} />}
                      {r.playerId && teamId && (
                        <span className="text-[9px] text-primary ml-auto shrink-0">INTEL</span>
                      )}
                    </div>
                  </td>
                  {displayHeaders.map(h => {
                    const v  = r.stats[h];
                    const hi = (h === "PTS" && Number(v) >= 25) || (h === "REB" && Number(v) >= 12) || (h === "AST" && Number(v) >= 10);
                    return (
                      <td key={h} className={`py-2 px-1.5 text-right tabular-nums text-[11px] ${
                        hi ? "text-primary font-bold" :
                        h === "+/-" && Number(v) > 0 ? "text-[#22C55E]" :
                        h === "+/-" && Number(v) < 0 ? "text-[#EF4444]" :
                        "text-text-2"
                      }`}>
                        {v == null ? "—" : h === "+/-" && Number(v) > 0 ? `+${v}` : v}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>

      {selectedPlayer && (
        <>
          {loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-[80vw] min-w-[320px] bg-bg border-l border-primary/20 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-xs font-bold text-text-2 uppercase tracking-widest">Loading Intel: {selectedPlayer.name}</p>
                </div>
              </div>
            </>
          )}
          {error && !loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60]" onClick={handleClose} />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-[80vw] min-w-[320px] bg-bg border-l border-primary/20 flex items-center justify-center">
                <div className="text-center px-10">
                  <p className="text-[#EF4444] font-bold mb-4">{error}</p>
                  <button onClick={handleClose} className="text-xs font-black text-text-2 hover:text-text-1 underline uppercase tracking-widest">Close</button>
                </div>
              </div>
            </>
          )}
          {drawerData && !loading && (
            <NBAPlayerDrawer data={drawerData} onClose={handleClose} />
          )}
        </>
      )}
    </div>
  );
}

function SofascoreList({ players, sport }: { players: any[]; sport: string }) {
  const isSoccer = ["soccer","ucl","uel","laliga","bundesliga","aleague","worldcup"].includes(sport);
  const isNBA = sport === "basketball";
  const keys = isSoccer
    ? ["minutesPlayed","goals","goalAssist","totalShot","totalTackle","rating"]
    : ["secondsPlayed","points","rebounds","assists","steals","blocks","rating"];
  const labels: Record<string, string> = {
    minutesPlayed:"MIN",goals:"G",goalAssist:"A",totalShot:"SH",totalTackle:"TKL",rating:"RTG",
    secondsPlayed:"MIN",points:"PTS",rebounds:"REB",assists:"AST",steals:"STL",blocks:"BLK",
  };
  const starters = players.filter(p => p.starter);
  if (!starters.length) return <p className="text-xs text-text-2">No lineup data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[360px]">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left py-1.5 text-text-2">Player</th>
            {keys.map(k => <th key={k} className="text-right py-1.5 px-1 text-text-2">{labels[k]??k}</th>)}
          </tr>
        </thead>
        <tbody>
          {starters.map(p => {
            const mins = isNBA && p.stats.secondsPlayed != null ? Math.round(p.stats.secondsPlayed/60) : p.stats.minutesPlayed;
            return (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface2">
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-text-2 font-mono text-[10px] w-3">{p.jerseyNumber}</span>
                    <span className="text-text-1 truncate max-w-[90px]">{p.shortName}</span>
                    {p.rating != null && (
                      <span className={`text-[9px] px-1 py-px rounded font-bold ${
                        p.rating>=7.5?"text-[#22C55E]":p.rating>=6.5?"text-[#F59E0B]":"text-[#EF4444]"
                      }`}>{p.rating.toFixed(1)}</span>
                    )}
                  </div>
                </td>
                {keys.map(k => {
                  const v = (k==="minutesPlayed"||k==="secondsPlayed") ? mins : p.stats[k];
                  return (
                    <td key={k} className="py-1.5 px-1 text-right text-text-2 tabular-nums">
                      {v!=null ? (k==="fieldGoalPct"?`${Math.round(v as number)}%`:v) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sport overview sections ──────────────────────────────────────────────────

// ─── Match events list (home left / away right, compact rows) ─────────────────

function MatchEventStrip({ incidents, homeTeam, awayTeam, homeCorners, awayCorners }: {
  incidents: SofascoreIncident[];
  homeTeam: string; awayTeam: string;
  homeCorners?: number; awayCorners?: number;
}) {
  const filtered = incidents.filter(
    i => i.type === "goal" || i.type === "card" || i.type === "substitution"
  );
  if (filtered.length === 0 && homeCorners == null) return <p className="text-xs text-text-2">No events recorded.</p>;

  return (
    <div>
      {/* Corner tally — top of section */}
      {(homeCorners != null || awayCorners != null) && (
        <div className="flex items-center justify-between text-xs mb-2 pb-2 border-b border-border">
          <span className="font-semibold tabular-nums text-text-1">{homeCorners ?? 0}</span>
          <span className="text-text-2/60 text-[10px] uppercase tracking-wide flex items-center gap-1">⛳ Corner Kicks</span>
          <span className="font-semibold tabular-nums text-text-1">{awayCorners ?? 0}</span>
        </div>
      )}

      {/* All events — goals, cards, subs as home/away mirrored rows */}
      {filtered.map((inc, idx) => {
        const isHome = inc.isHome;
        const min = `${inc.minute}${inc.addedTime ? `+${inc.addedTime}` : ""}′`;
        let icon = "·"; let cls = "text-text-2"; let label = "";
        if (inc.type === "goal") {
          icon = "⚽"; cls = "text-[#22C55E]";
          label = inc.playerName ?? "?";
          if (inc.assistName) label += ` (${inc.assistName})`;
          if (inc.incidentClass === "penalty") label += " [P]";
          if (inc.incidentClass === "ownGoal") { cls = "text-[#EF4444]"; label += " [OG]"; }
        } else if (inc.type === "card") {
          icon = inc.incidentClass === "yellow" ? "🟨" : "🟥";
          cls  = inc.incidentClass === "yellow" ? "text-[#F59E0B]" : "text-[#EF4444]";
          label = inc.playerName ?? "?";
        } else {
          icon = "↕"; cls = "text-primary/80";
          label = `${inc.playerInName ?? "?"} / ${inc.playerOutName ?? "?"}`;
        }
        return (
          <div key={idx} className={`flex items-center gap-2 py-1.5 border-b border-border last:border-0 text-xs ${isHome ? "" : "flex-row-reverse"}`}>
            <span className="text-text-2 w-7 shrink-0 text-center tabular-nums text-[11px]">{min}</span>
            <span className={`shrink-0 ${cls}`}>{icon}</span>
            <div className={`flex-1 min-w-0 ${isHome ? "text-left" : "text-right"}`}>
              <span className={`font-medium ${inc.type === "substitution" ? "text-text-2" : "text-text-1"}`}>{label}</span>
              <span className="text-text-2/50 ml-1 text-[11px]">· {isHome ? homeTeam : awayTeam}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Soccer stat bar (Sofascore style) ────────────────────────────────────────

function SoccerStatBar({ label, home, away, homeDisplay, awayDisplay }: {
  label: string;
  home: number; away: number;
  homeDisplay?: string; awayDisplay?: string;
}) {
  const total = home + away;
  const homePct = total > 0 ? Math.round((home / total) * 100) : 50;
  const awayPct = 100 - homePct;
  const hLabel = homeDisplay ?? String(home);
  const aLabel = awayDisplay ?? String(away);
  // Highlight the dominant side
  const homeWins = home > away;
  const awayWins = away > home;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className={`font-semibold tabular-nums w-9 ${homeWins ? "text-text-1" : "text-text-2"}`}>{hLabel}</span>
        <span className="text-text-2/70 text-[10px] flex-1 text-center leading-none">{label}</span>
        <span className={`font-semibold tabular-nums w-9 text-right ${awayWins ? "text-text-1" : "text-text-2"}`}>{aLabel}</span>
      </div>
      <div className="flex h-[3px] rounded-full overflow-hidden gap-[1px]">
        <div className="bg-primary rounded-full transition-all" style={{ width: `${homePct}%` }} />
        <div className="bg-indigo-500/50 rounded-full flex-1 transition-all" style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}

// ─── Sofascore-grouped match stats panel ──────────────────────────────────────

function SofascoreMatchStatsPanel({ matchStats, homeTeam, awayTeam }: {
  matchStats: SofascoreMatchStats[];
  homeTeam: { shortName: string; logoUrl?: string };
  awayTeam: { shortName: string; logoUrl?: string };
}) {
  const [period, setPeriod] = useState<string>("ALL");

  const periods = matchStats.map(s => s.period);
  const current = matchStats.find(s => s.period === period) ?? matchStats[0];
  if (!current) return null;

  // Filter out empty groups
  const groups = current.groups.filter(g => g.statisticsItems.length > 0);

  return (
    <div>
      {/* Period tabs + team legend on same row */}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border">
        <div className="flex items-center gap-1.5 text-[11px] text-text-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          {homeTeam.logoUrl && <img src={homeTeam.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
          <span className="font-semibold text-text-1">{homeTeam.shortName}</span>
        </div>
        {periods.length > 1 && (
          <div className="flex gap-1">
            {periods.map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  period === p ? "bg-primary text-white font-bold" : "text-text-2 hover:text-text-1"
                }`}>
                {p === "ALL" ? "All" : p === "1ST" ? "1H" : "2H"}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-text-2">
          <span className="font-semibold text-text-1">{awayTeam.shortName}</span>
          {awayTeam.logoUrl && <img src={awayTeam.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-500/50" />
        </div>
      </div>

      {/* Stat groups */}
      <div className="space-y-3">
        {groups.map(group => (
          <div key={group.groupName}>
            <div className="text-[9px] uppercase tracking-widest text-text-2/60 mb-1.5 font-semibold">{group.groupName}</div>
            <div className="space-y-2">
              {group.statisticsItems.map(item => (
                <SoccerStatBar
                  key={item.name}
                  label={item.name}
                  home={item.homeValue}
                  away={item.awayValue}
                  homeDisplay={item.home}
                  awayDisplay={item.away}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Soccer goal scorers (compact, embedded in events section) ─────────────────

function SoccerGoalInvolvement({ sofascore, homeTeam, awayTeam }: {
  sofascore: SofascoreMatchData;
  homeTeam: { shortName: string };
  awayTeam: { shortName: string };
}) {
  const lineups = sofascore.lineups;
  if (!lineups) return null;

  interface ScoreEntry { name: string; team: string; goals: number; assists: number; rating?: number; }
  const scorers: ScoreEntry[] = [];
  const all = [
    ...lineups.home.map(p => ({ ...p, teamLabel: homeTeam.shortName })),
    ...lineups.away.map(p => ({ ...p, teamLabel: awayTeam.shortName })),
  ];

  for (const p of all) {
    const g = (p.stats.goals as number) ?? 0;
    const a = (p.stats.goalAssist as number) ?? 0;
    if (g > 0 || a > 0) {
      scorers.push({ name: p.shortName, team: p.teamLabel, goals: g, assists: a, rating: p.rating ?? undefined });
    }
  }
  if (scorers.length === 0) return null;
  scorers.sort((a, b) => b.goals - a.goals || b.assists - a.assists);

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-border">
      {scorers.map((s, i) => (
        <div key={i} className="flex items-center gap-1 text-[10px]">
          {s.goals > 0 && <span className="text-[#22C55E] font-bold">⚽{s.goals > 1 ? ` ×${s.goals}` : ""}</span>}
          {s.assists > 0 && <span className="text-[#60A5FA] font-bold">A{s.assists}</span>}
          <span className="text-text-1">{s.name}</span>
          <span className="text-text-2">{s.team}</span>
          {s.rating != null && (
            <span className={`font-black px-1 rounded ${
              s.rating >= 7.5 ? "text-[#22C55E] bg-[#22C55E]/10" :
              s.rating >= 6.5 ? "text-[#F59E0B] bg-[#F59E0B]/10" :
              "text-[#EF4444] bg-[#EF4444]/10"
            }`}>{s.rating.toFixed(1)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SoccerOverview({ game, insights, homeHistory, awayHistory, h2h, weather, homeSquad, awaySquad, sofascore, historyFilter, onHistoryFilterChange, homeTeamGameStats, awayTeamGameStats, scores365Data }: {
  game: Game; insights: Insight[]; weather: any;
  homeHistory: TeamHistoryGame[]; awayHistory: TeamHistoryGame[];
  h2h: H2HGame[]; historyFilter: VenueFilter;
  onHistoryFilterChange: (f: VenueFilter) => void;
  homeSquad: ESPNPlayer[]; awaySquad: ESPNPlayer[];
  sofascore: SofascoreMatchData | null;
  homeTeamGameStats?: TeamGameStat[];
  awayTeamGameStats?: TeamGameStat[];
  scores365Data?: Scores365MatchData | null;
}) {
  const { homeTeam, awayTeam, status } = game;
  const isUpcoming = status === "upcoming";
  const isFinished = status === "finished";
  const isLive     = status === "live";
  const homeInjured = homeTeam.players.filter(p => p.injured);
  const awayInjured = awayTeam.players.filter(p => p.injured);

  // Derive sofascore lineup stats as fallback when no matchStats API data
  const sofaStats = sofascore?.lineups ? (() => {
    const lineups = sofascore.lineups;
    const sum = (players: typeof lineups.home, key: string) =>
      players.filter(p => p.starter).reduce((acc, p) => acc + (Number(p.stats[key]) || 0), 0);
    return {
      home: { shots: sum(lineups.home,"totalShot"), onTarget: sum(lineups.home,"onTargetScoringAttempt"), keyPasses: sum(lineups.home,"keyPass"), tackles: sum(lineups.home,"totalTackle"), interceptions: sum(lineups.home,"interceptionWon") },
      away: { shots: sum(lineups.away,"totalShot"), onTarget: sum(lineups.away,"onTargetScoringAttempt"), keyPasses: sum(lineups.away,"keyPass"), tackles: sum(lineups.away,"totalTackle"), interceptions: sum(lineups.away,"interceptionWon") },
    };
  })() : null;

  return (
    <div className="space-y-4">

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">

          {/* ── LIVE / RESULTED: Events (top of left col) ──────────────────── */}
          {(isFinished || isLive) && sofascore?.incidents && sofascore.incidents.length > 0 && (() => {
            // Extract corner totals from matchStats "ALL" period
            const allPeriod = sofascore.matchStats?.find(s => s.period === "ALL");
            const overviewGroup = allPeriod?.groups.find(g => g.groupName.toLowerCase().includes("overview"));
            const cornerItem = overviewGroup?.statisticsItems.find(s => s.name.toLowerCase().includes("corner"));
            const homeCorners = cornerItem?.homeValue;
            const awayCorners = cornerItem?.awayValue;
            return (
            <Section title="Events">
              <MatchEventStrip
                incidents={sofascore.incidents}
                homeTeam={homeTeam.shortName}
                awayTeam={awayTeam.shortName}
                homeCorners={homeCorners}
                awayCorners={awayCorners}
              />
              {sofascore && (
                <SoccerGoalInvolvement
                  sofascore={sofascore}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                />
              )}
              {/* xG bar from 365Scores */}
              {scores365Data && (scores365Data.homeXG > 0 || scores365Data.awayXG > 0) && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-text-1 w-12 text-left">{scores365Data.homeXG.toFixed(2)}</span>
                    <span className="text-text-2 text-[10px] tracking-widest uppercase">Expected Goals (xG)</span>
                    <span className="font-bold text-text-1 w-12 text-right">{scores365Data.awayXG.toFixed(2)}</span>
                  </div>
                  {(() => {
                    const total = scores365Data.homeXG + scores365Data.awayXG;
                    const hw = total > 0 ? Math.max(10, Math.min(90, Math.round(scores365Data.homeXG / total * 100))) : 50;
                    return (
                      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-primary rounded-l-full" style={{ width: `${hw}%` }} />
                        <div className="bg-[#60A5FA] rounded-r-full" style={{ width: `${100 - hw}%` }} />
                      </div>
                    );
                  })()}
                  {scores365Data.homeBigChances + scores365Data.awayBigChances > 0 && (
                    <div className="flex justify-between text-[10px] text-text-2 mt-2">
                      <span><span className="text-text-1 font-medium">{scores365Data.homeBigChances}</span> big chances</span>
                      <span className="text-text-2 text-[9px] tracking-wide">BIG CHANCES</span>
                      <span><span className="text-text-1 font-medium">{scores365Data.awayBigChances}</span> big chances</span>
                    </div>
                  )}
                </div>
              )}
            </Section>
            );
          })()}

          {/* Probable Lineups — upcoming */}
          {isUpcoming && sofascore?.lineups && (
            <Section title={`Confirmed Lineups${sofascore.lineups.confirmed ? " ✓" : ""}`}>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { t: homeTeam, players: sofascore.lineups.home, squad: homeSquad, formation: sofascore.lineups.homeFormation },
                  { t: awayTeam, players: sofascore.lineups.away, squad: awaySquad, formation: sofascore.lineups.awayFormation },
                ]).map(({ t, players, formation }) => (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-2">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-medium text-text-2">{t.shortName}</span>
                      {formation && <span className="text-[9px] font-black text-primary ml-1">{formation}</span>}
                    </div>
                    {players.filter(p => p.starter).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-xs">
                        <span className="text-text-2 w-4 text-center font-mono text-[10px]">{p.jerseyNumber}</span>
                        <span className="text-text-1 flex-1 truncate">{p.shortName}</span>
                        <span className="text-text-2 text-[9px]">{p.position}</span>
                      </div>
                    ))}
                    {players.filter(p => p.starter).length === 0 && (
                      <p className="text-xs text-text-2">Not announced yet</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Lineups with ratings — live/finished, when 365Scores data available */}
          {(isFinished || isLive) && scores365Data && (scores365Data.homePlayers.length > 0 || scores365Data.awayPlayers.length > 0) && (
            <Section title="Lineups & Ratings">
              {/* Column headers */}
              <div className="grid grid-cols-2 gap-3 mb-1">
                {[
                  { t: homeTeam, players: scores365Data.homePlayers },
                  { t: awayTeam, players: scores365Data.awayPlayers },
                ].map(({ t, players }) => {
                  const starters = players.filter(p => p.starter).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
                  const avgRating = starters.length > 0
                    ? starters.reduce((s, p) => s + (p.rating ?? 0), 0) / starters.filter(p => p.rating != null).length
                    : null;
                  return (
                    <div key={t.name}>
                      <div className="flex items-center gap-1.5 mb-2">
                        {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                        <span className="text-xs font-medium text-text-1">{t.shortName}</span>
                        {avgRating != null && (
                          <span className={`ml-auto text-[10px] font-bold ${
                            avgRating >= 7.0 ? "text-[#22C55E]" : avgRating >= 6.5 ? "text-[#F59E0B]" : "text-[#EF4444]"
                          }`}>avg {avgRating.toFixed(1)}</span>
                        )}
                      </div>
                      {starters.map((p, i) => (
                        <div key={i} className="flex items-center gap-1.5 py-1.5 border-b border-border/40 last:border-0">
                          {/* Jersey */}
                          <span className="text-[9px] font-mono text-text-2 w-4 shrink-0 text-right">{p.jersey}</span>
                          {/* Name */}
                          <span className="text-text-1 text-[11px] font-medium min-w-0 truncate" style={{flex:"1 1 0", overflow:"hidden"}}>{p.shortName || p.name || "—"}</span>
                          {/* Badges */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {p.goals > 0 && <span className="text-[9px]">⚽{p.goals > 1 ? p.goals : ""}</span>}
                            {p.assists > 0 && <span className="text-[9px] text-[#60A5FA]">A{p.assists > 1 ? p.assists : ""}</span>}
                            {p.yellowCard && <span className="text-[9px]">🟨</span>}
                            {p.redCard && <span className="text-[9px]">🟥</span>}
                            {/* xG if meaningful */}
                            {(p.xG ?? 0) >= 0.15 && <span className="text-[8px] text-[#F59E0B] font-mono">xG{(p.xG!).toFixed(2)}</span>}
                          </div>
                          {/* Rating */}
                          {p.rating != null && (
                            <span className={`text-[11px] font-black w-8 text-right shrink-0 ${
                              p.rating >= 7.5 ? "text-[#22C55E]" :
                              p.rating >= 6.5 ? "text-[#F59E0B]" :
                              "text-[#EF4444]"
                            }`}>{p.rating.toFixed(1)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Fallback squad list when no Sofascore lineups */}
          {isUpcoming && !sofascore?.lineups && (homeSquad.length > 0 || awaySquad.length > 0) && (
            <Section title="Probable Squads">
              <div className="grid grid-cols-2 gap-4">
                {[{ t: homeTeam, squad: homeSquad }, { t: awayTeam, squad: awaySquad }].map(({ t, squad }) => (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-2">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-medium text-text-2">{t.shortName}</span>
                    </div>
                    {squad.slice(0, 11).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-xs">
                        <span className="text-text-2 w-5 text-center font-mono">{p.jersey || i+1}</span>
                        <span className="text-text-1 flex-1 truncate">{p.displayName}</span>
                        <span className="text-text-2 text-[10px]">{p.position}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>

        <div className="lg:col-span-3 space-y-4">

          {/* ── LIVE / RESULTED: Match stats (top of right col) ─────────────── */}
          {(isFinished || isLive) && (
            sofascore?.matchStats && sofascore.matchStats.length > 0 ? (
              <Section title="Match Overview">
                <SofascoreMatchStatsPanel
                  matchStats={sofascore.matchStats}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                />
              </Section>
            ) : sofaStats ? (
              <Section title="Match Stats">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[9px] text-text-2 mb-2 pb-1.5 border-b border-border">
                    <div className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                      <span className="font-medium">{homeTeam.shortName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{awayTeam.shortName}</span>
                      <span className="inline-block w-2 h-2 rounded-full bg-indigo-500/50" />
                    </div>
                  </div>
                  <SoccerStatBar label="Total Shots"      home={sofaStats.home.shots}         away={sofaStats.away.shots} />
                  <SoccerStatBar label="Shots on Target"  home={sofaStats.home.onTarget}       away={sofaStats.away.onTarget} />
                  <SoccerStatBar label="Key Passes"       home={sofaStats.home.keyPasses}      away={sofaStats.away.keyPasses} />
                  <SoccerStatBar label="Tackles"          home={sofaStats.home.tackles}        away={sofaStats.away.tackles} />
                  <SoccerStatBar label="Interceptions"    home={sofaStats.home.interceptions}  away={sofaStats.away.interceptions} />
                </div>
              </Section>
            ) : null
          )}

          <Section title="Injuries">
            {homeInjured.length === 0 && awayInjured.length === 0 ? (
              <p className="text-sm text-[#22C55E]">✓ None reported</p>
            ) : (
              <div className="space-y-0.5">
                {[...homeInjured, ...awayInjured].slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0 text-sm">
                    <span className="text-text-1">{p.name}</span>
                    <span className="text-[#F59E0B] shrink-0 text-xs ml-2">{p.position}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Match Intelligence ──────────────────────────────────────────── */}
          {(sofascore?.homeTeamStats || sofascore?.awayTeamStats ||
            (sofascore?.topScorers?.length ?? 0) > 0 ||
            (homeTeamGameStats?.length ?? 0) > 0 ||
            (awayTeamGameStats?.length ?? 0) > 0) && (
            <SoccerMatchInsights
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              homeTeamStats={sofascore?.homeTeamStats}
              awayTeamStats={sofascore?.awayTeamStats}
              topScorers={sofascore?.topScorers ?? []}
              homeHistory={homeHistory}
              awayHistory={awayHistory}
              homeTeamGameStats={homeTeamGameStats}
              awayTeamGameStats={awayTeamGameStats}
            />
          )}

        </div>
      </div>
    </div>
  );
}

// ─── NBA quarter flow ─────────────────────────────────────────────────────────

function NBAQuarterCompact({ game }: { game: Game }) {
  const { lineScores, score, homeTeam, awayTeam, status } = game;
  if (!lineScores || !score) return null;

  const { home: hQ, away: aQ } = lineScores;
  const periods = Math.max(hQ.length, aQ.length, 4);
  const labels = Array.from({ length: periods }, (_, i) => i < 4 ? `Q${i + 1}` : `OT${i - 3}`);

  // Differential per period for sparkline (0 = start, then one point per completed period)
  let hR = 0, aR = 0;
  const diffs: number[] = [0];
  for (let i = 0; i < periods; i++) {
    hR += hQ[i] ?? 0;
    aR += aQ[i] ?? 0;
    diffs.push(hR - aR);
  }

  const maxDiff = Math.max(...diffs.map(Math.abs), 1);
  const W = 380, H = 56, LABEL_H = 14;
  const chartH = H - LABEL_H;
  const xStep = W / Math.max(diffs.length - 1, 1);
  const yMid = chartH / 2;
  const pts = diffs.map((d, i) => ({ x: i * xStep, y: yMid - (d / maxDiff) * (yMid - 5) }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    `M${pts[0].x.toFixed(1)},${yMid} ` +
    pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L${pts[pts.length - 1].x.toFixed(1)},${yMid} Z`;

  const currentDiff = (score.home ?? 0) - (score.away ?? 0);
  const leadTeam = currentDiff > 0 ? homeTeam.shortName : currentDiff < 0 ? awayTeam.shortName : null;
  const leadColor = currentDiff >= 0 ? "#60A5FA" : "#F87171";

  return (
    <div className="bg-surface rounded-xl p-4 border border-border">
      <div className="flex items-start justify-between gap-6">

        {/* Quarter score grid */}
        <div className="shrink-0">
          <div className="flex items-center gap-4 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-2">Quarter by Quarter</span>
            {leadTeam && status !== "upcoming" && (
              <span style={{ color: leadColor }} className="text-[10px] font-bold">
                {leadTeam} {Math.abs(currentDiff) > 0 ? `+${Math.abs(currentDiff)}` : "tied"}
              </span>
            )}
          </div>
          <div className="grid gap-y-1.5 gap-x-3" style={{ gridTemplateColumns: `auto repeat(${periods}, 36px) auto` }}>
            <div />
            {labels.map(l => <div key={l} className="text-center text-[9px] text-text-2 font-medium">{l}</div>)}
            <div className="text-[9px] text-text-2 text-right font-bold">TOT</div>

            <div className="flex items-center gap-1 pr-2">
              {homeTeam.logoUrl && <img src={homeTeam.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
              <span className="text-[10px] text-text-2 font-medium">{homeTeam.shortName}</span>
            </div>
            {labels.map((_, i) => {
              const v = hQ[i] ?? 0;
              const won = v > (aQ[i] ?? 0) && v > 0;
              return <div key={i} className="text-center"><span className={`text-[11px] tabular-nums font-semibold ${won ? "text-text-1" : "text-text-2"}`}>{v || "—"}</span></div>;
            })}
            <div className="text-right"><span className="text-sm font-black text-text-1 tabular-nums">{score.home}</span></div>

            <div className="flex items-center gap-1 pr-2">
              {awayTeam.logoUrl && <img src={awayTeam.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
              <span className="text-[10px] text-text-2 font-medium">{awayTeam.shortName}</span>
            </div>
            {labels.map((_, i) => {
              const v = aQ[i] ?? 0;
              const won = v > (hQ[i] ?? 0) && v > 0;
              return <div key={i} className="text-center"><span className={`text-[11px] tabular-nums font-semibold ${won ? "text-text-1" : "text-text-2"}`}>{v || "—"}</span></div>;
            })}
            <div className="text-right"><span className="text-sm font-black text-text-2 tabular-nums">{score.away}</span></div>
          </div>
        </div>

        {/* Sparkline differential chart */}
        <div className="shrink-0 flex flex-col items-end">
          <div className="text-[9px] text-text-2 mb-1">{homeTeam.shortName} ↑ · {awayTeam.shortName} ↓</div>
          <svg width={W} height={H}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* chart area */}
            <line x1="0" y1={yMid} x2={W} y2={yMid} stroke="white" strokeOpacity={0.12} strokeWidth={1} />
            <path d={areaPath} fill={leadColor} fillOpacity={0.28} />
            <path d={linePath} fill="none" stroke={leadColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
            {/* period dividers + Q labels */}
            {labels.map((label, i) => {
              const x = (i + 1) * xStep;
              const isLast = i === labels.length - 1;
              return (
                <g key={i}>
                  <line x1={x} y1={0} x2={x} y2={chartH} stroke="white" strokeOpacity={0.08} strokeWidth={1} strokeDasharray="2 2" />
                  <text x={x} y={H - 2} textAnchor={isLast ? "end" : "middle"} fill="var(--text-2)" fontSize={9} fontFamily="monospace">{label}</text>
                </g>
              );
            })}
            <text x={0} y={H - 2} textAnchor="start" fill="var(--text-2)" fontSize={9} fontFamily="monospace">Start</text>
          </svg>
        </div>

      </div>
    </div>
  );
}

// ─── NBA analytics helpers ────────────────────────────────────────────────────

function nbaStreak(form: string[], result: string): number {
  let s = 0;
  for (const r of form) { if (r === result) s++; else break; }
  return s;
}

function parseGameScores(history: TeamHistoryGame[]): { teamPts: number; oppPts: number; total: number }[] {
  return history
    .filter(g => g.score && g.result)
    .map(g => {
      const parts = (g.score ?? "").split("-").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (parts.length < 2) return null;
      // Score format: "teamScore-oppScore" (team perspective)
      const [a, b] = parts;
      return { teamPts: a!, oppPts: b!, total: a! + b! };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

function avgNum(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function BasketballOverview({ game, insights, sofascore, homeHistory, awayHistory, homeSquad, awaySquad, homeInjuries, awayInjuries, h2h }: {
  game: Game; insights: Insight[]; sofascore: SofascoreMatchData | null;
  homeHistory: TeamHistoryGame[]; awayHistory: TeamHistoryGame[];
  homeSquad: ESPNPlayer[]; awaySquad: ESPNPlayer[];
  homeInjuries: ESPNInjury[]; awayInjuries: ESPNInjury[];
  h2h: H2HGame[];
}) {
  const { homeTeam, awayTeam } = game;
  const isUpcoming = game.status === "upcoming";
  const homeStarters = homeSquad.slice(0, 5);
  const awayStarters = awaySquad.slice(0, 5);
  const allInjuries = [...homeInjuries, ...awayInjuries];

  // Derived analytics
  const homeWStreak = nbaStreak(homeTeam.form, "W");
  const homeLStreak = nbaStreak(homeTeam.form, "L");
  const awayWStreak = nbaStreak(awayTeam.form, "W");
  const awayLStreak = nbaStreak(awayTeam.form, "L");

  const homeScores = parseGameScores(homeHistory);
  const awayScores = parseGameScores(awayHistory);
  const homeAvgPts = avgNum(homeScores.map(s => s.teamPts));
  const homeAvgOpp = avgNum(homeScores.map(s => s.oppPts));
  const awayAvgPts = avgNum(awayScores.map(s => s.teamPts));
  const awayAvgOpp = avgNum(awayScores.map(s => s.oppPts));

  const homeAtHomeScores = parseGameScores(homeHistory.filter(g => g.homeAway === "home"));
  const awayAwayScores   = parseGameScores(awayHistory.filter(g => g.homeAway === "away"));
  const homeAtHomeWins   = homeHistory.filter(g => g.homeAway === "home" && g.result === "W").length;
  const homeAtHomePlayed = homeHistory.filter(g => g.homeAway === "home").length;
  const awayAwayWins     = awayHistory.filter(g => g.homeAway === "away" && g.result === "W").length;
  const awayAwayPlayed   = awayHistory.filter(g => g.homeAway === "away").length;

  // H2H over/under
  const h2hScores = h2h.map(g => {
    const parts = g.score.split("-").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    return parts.length >= 2 ? (parts[0]! + parts[1]!) : 0;
  }).filter(t => t > 0);
  const h2hAvgTotal  = avgNum(h2hScores);
  const h2hOver220   = h2h.length > 0 ? Math.round((h2hScores.filter(t => t > 220).length / h2h.length) * 100) : null;
  const h2hOver200   = h2h.length > 0 ? Math.round((h2hScores.filter(t => t > 200).length / h2h.length) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Compact quarter grid + sparkline — live / finished */}
      {!isUpcoming && game.lineScores && game.score && <NBAQuarterCompact game={game} />}

      {/* ESPN box score — live / finished */}
      {!isUpcoming && game.boxScore && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Section title={`${homeTeam.shortName} — Box Score`}>
            <NBAPlayerList
              rows={game.boxScore.home}
              headers={game.boxScore.statHeaders}
              teamId={homeTeam.espnId}
              opponent={awayTeam.name}
              matchContext="home"
            />
          </Section>
          <Section title={`${awayTeam.shortName} — Box Score`}>
            <NBAPlayerList
              rows={game.boxScore.away}
              headers={game.boxScore.statHeaders}
              teamId={awayTeam.espnId}
              opponent={homeTeam.name}
              matchContext="away"
            />
          </Section>
        </div>
      )}

      {/* Projected starters — upcoming games */}
      {isUpcoming && (homeStarters.length > 0 || awayStarters.length > 0) && (
        <Section title="Projected Starters">
          <div className="grid grid-cols-2 gap-4">
            {[{ t: homeTeam, squad: homeStarters }, { t: awayTeam, squad: awayStarters }].map(({ t, squad }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs font-medium text-text-2">{t.shortName}</span>
                </div>
                {squad.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0 text-xs">
                    <span className="text-text-2 w-5 text-center font-mono text-[10px]">{p.jersey || i+1}</span>
                    <span className="text-text-1 flex-1 truncate">{p.displayName}</span>
                    <span className="text-text-2 text-[10px]">{p.position}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Main analytics — 5-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">

          {/* Match Intelligence */}
          <Section title="Match Intelligence">
            <div className="grid grid-cols-2 gap-x-6 gap-y-0">
              {([
                { t: homeTeam, history: homeHistory, wStreak: homeWStreak, lStreak: homeLStreak, avgPts: homeAvgPts, avgOpp: homeAvgOpp, homeWins: homeAtHomeWins, homePlayed: homeAtHomePlayed, role: "Home" },
                { t: awayTeam, history: awayHistory, wStreak: awayWStreak, lStreak: awayLStreak, avgPts: awayAvgPts, avgOpp: awayAvgOpp, homeWins: awayAwayWins, homePlayed: awayAwayPlayed, role: "Away" },
              ]).map(({ t, wStreak, lStreak, avgPts, avgOpp, homeWins, homePlayed, role }) => (
                <div key={t.name}>
                  <div className="flex items-center gap-1.5 mb-2">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-semibold text-text-1">{t.shortName}</span>
                    <span className="text-[10px] text-text-2 ml-1">{role}</span>
                    {wStreak >= 3 && (
                      <span className="ml-auto text-[10px] font-bold px-1 py-px rounded bg-[#22C55E]/10 text-[#22C55E]">{wStreak}W</span>
                    )}
                    {lStreak >= 3 && (
                      <span className="ml-auto text-[10px] font-bold px-1 py-px rounded bg-[#EF4444]/10 text-[#EF4444]">{lStreak}L</span>
                    )}
                  </div>
                  <div className="flex gap-1 mb-3">
                    {t.form.map((r, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                        r === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" : r === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                      }`}>{r}</span>
                    ))}
                  </div>
                  {[
                    ["Season", `${t.record.wins}W ${t.record.losses}L`],
                    avgPts > 0 ? ["Avg Scored", `${avgPts} pts`] : null,
                    avgOpp > 0 ? ["Avg Allowed", `${avgOpp} pts`] : null,
                    homePlayed > 0 ? [role === "Home" ? "Home Record" : "Away Record", `${homeWins}W ${homePlayed - homeWins}L`] : null,
                  ].filter((x): x is [string, string] => x !== null).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b border-border last:border-0 text-xs">
                      <span className="text-text-2">{label}</span>
                      <span className="text-text-1 font-medium tabular-nums">{value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Section>

          {/* H2H */}
          {h2h.length > 0 && (
            <Section title="Head-to-Head">
              <H2HPanel h2h={h2h} homeTeam={homeTeam.name} awayTeam={awayTeam.name} compact />
            </Section>
          )}

          {/* Recent Results */}
          {(homeHistory.length > 0 || awayHistory.length > 0) && (
            <Section title="Recent Results">
              <div className="grid grid-cols-2 gap-3">
                {[{ t: homeTeam, h: homeHistory }, { t: awayTeam, h: awayHistory }].map(({ t, h }) => (
                  <div key={t.name}>
                    <div className="text-[10px] uppercase tracking-widest text-text-2 mb-1.5">{t.shortName}</div>
                    {h.slice(0, 6).map(g => (
                      <Link key={g.gameId} href={`/game/${g.gameId}`}
                        className="flex items-center justify-between py-1.5 border-b border-border hover:bg-surface2 px-1 rounded text-xs group">
                        <span className="text-text-2 truncate max-w-[45%]">{g.opponent.split(" ").pop()}</span>
                        <span className={`font-semibold tabular-nums ${g.result === "W" ? "text-[#22C55E]" : g.result === "L" ? "text-[#EF4444]" : "text-[#F59E0B]"}`}>
                          {g.score ?? "—"}
                        </span>
                      </Link>
                    ))}
                    {h.length === 0 && <p className="text-xs text-text-2">No data</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Home / Away Splits */}
          {(homeAtHomePlayed > 0 || awayAwayPlayed > 0) && (
            <Section title="Home / Away Splits">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { t: homeTeam, wins: homeAtHomeWins, played: homeAtHomePlayed, avgPts: avgNum(homeAtHomeScores.map(s => s.teamPts)), avgOpp: avgNum(homeAtHomeScores.map(s => s.oppPts)), label: "Home" },
                  { t: awayTeam, wins: awayAwayWins,   played: awayAwayPlayed,   avgPts: avgNum(awayAwayScores.map(s => s.teamPts)),   avgOpp: avgNum(awayAwayScores.map(s => s.oppPts)),   label: "Away" },
                ]).map(({ t, wins, played, avgPts: ap, avgOpp: ao, label }) => {
                  const pct = played > 0 ? Math.round((wins / played) * 100) : 0;
                  return (
                    <div key={t.name} className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                        <span className="text-[10px] text-text-2">{t.shortName} {label}</span>
                      </div>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-text-2">{wins}W {played - wins}L</span>
                        <span className="text-text-1 tabular-nums font-medium">{pct}%</span>
                      </div>
                      <div className="h-[2px] bg-surface2 rounded-full">
                        <div className={`h-full rounded-full ${pct >= 50 ? "bg-[#22C55E]" : "bg-[#EF4444]"}`} style={{ width: `${pct}%` }} />
                      </div>
                      {ap > 0 && (
                        <div className="text-[10px] text-text-2">
                          avg <span className="text-text-1">{ap}</span> pts scored · <span className="text-text-2">{ao}</span> allowed
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">

          {/* Over/Under Indicators */}
          {h2hAvgTotal > 0 && (
            <Section title="Scoring Indicators">
              <div className="space-y-2">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-text-2">H2H Avg Total</span>
                  <span className="text-white font-bold tabular-nums">{h2hAvgTotal}</span>
                </div>
                {h2hOver220 !== null && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-text-2">Over 220 pts</span>
                      <span className={`font-bold ${h2hOver220 >= 60 ? "text-[#22C55E]" : h2hOver220 >= 40 ? "text-[#F59E0B]" : "text-[#EF4444]"}`}>{h2hOver220}%</span>
                    </div>
                    <div className="h-[2px] bg-surface2 rounded-full">
                      <div className={`h-full rounded-full ${h2hOver220 >= 60 ? "bg-[#22C55E]" : h2hOver220 >= 40 ? "bg-[#F59E0B]" : "bg-[#EF4444]"}`} style={{ width: `${h2hOver220}%` }} />
                    </div>
                  </div>
                )}
                {h2hOver200 !== null && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-text-2">Over 200 pts</span>
                      <span className={`font-bold ${h2hOver200 >= 60 ? "text-[#22C55E]" : h2hOver200 >= 40 ? "bg-[#F59E0B]" : "text-[#EF4444]"}`}>{h2hOver200}%</span>
                    </div>
                    <div className="h-[2px] bg-surface2 rounded-full">
                      <div className={`h-full rounded-full ${h2hOver200 >= 60 ? "bg-[#22C55E]" : h2hOver200 >= 40 ? "bg-[#F59E0B]" : "bg-[#EF4444]"}`} style={{ width: `${h2hOver200}%` }} />
                    </div>
                  </div>
                )}
                {homeAvgPts > 0 && awayAvgPts > 0 && (
                  <div className="pt-2 border-t border-border text-[10px] text-text-2">
                    Projected combined: <span className="text-white font-bold">{Math.round(homeAvgPts + awayAvgPts)}</span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Scoring Comparison */}
          {(homeAvgPts > 0 || awayAvgPts > 0) && (
            <Section title="Scoring Comparison">
              {([
                { key: "Avg Scored", hv: homeAvgPts, av: awayAvgPts },
                { key: "Avg Allowed", hv: homeAvgOpp, av: awayAvgOpp },
              ] as { key: string; hv: number; av: number }[]).filter(row => row.hv > 0 || row.av > 0).map(({ key, hv, av }) => {
                const max = Math.max(hv, av, 1);
                return (
                  <div key={key} className="mb-2 last:mb-0">
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className="text-white font-medium tabular-nums w-8">{hv || "—"}</span>
                      <span className="text-text-2 uppercase text-[9px] tracking-wide flex-1 text-center">{key}</span>
                      <span className="text-text-2 tabular-nums w-8 text-right">{av || "—"}</span>
                    </div>
                    <div className="flex gap-0.5 h-[2px]">
                      <div className="flex-1 bg-surface2 rounded-full overflow-hidden flex justify-end">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(hv / max) * 100}%` }} />
                      </div>
                      <div className="flex-1 bg-surface2 rounded-full overflow-hidden">
                        <div className="h-full bg-text-2/40 rounded-full" style={{ width: `${(av / max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          {/* Season Stats */}
          {game.teamStats && (
            <Section title="Season Stats">
              <ComparisonBars homeTeam={homeTeam} awayTeam={awayTeam} stats={game.teamStats} compact />
            </Section>
          )}

          {/* Injury Report */}
          {allInjuries.length > 0 && (
            <Section title="Injury Report">
              <div className="space-y-3">
                {[{ t: homeTeam, inj: homeInjuries }, { t: awayTeam, inj: awayInjuries }].map(({ t, inj }) => (
                  <div key={t.name}>
                    <div className="text-[10px] text-text-2 uppercase tracking-widest mb-1.5">{t.shortName}</div>
                    {inj.length === 0
                      ? <p className="text-xs text-[#22C55E]">✓ None reported</p>
                      : inj.slice(0, 4).map((p, i) => (
                        <div key={i} className="flex items-center justify-between py-1 border-b border-border last:border-0 text-xs">
                          <span className="text-text-1 truncate">{p.playerName}</span>
                          <span className="text-[#F59E0B] shrink-0 text-[10px] ml-2">{p.status}</span>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Key Insights */}
          {insights.length > 0 && (
            <Section title="Key Insights">
              <ul className="space-y-2">
                {insights.slice(0, 5).map((ins, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="text-primary shrink-0">{ins.icon}</span>
                    <span className="text-text-1 leading-snug">{ins.text}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AFLOverview({ game, insights, boxScore, homeInjuries, awayInjuries, h2h, analytics, homeHistory, awayHistory, historyFilter, onHistoryFilterChange }: {
  game: Game; insights: Insight[]; boxScore?: BoxScore;
  homeHistory: TeamHistoryGame[]; awayHistory: TeamHistoryGame[];
  homeInjuries: ESPNInjury[]; awayInjuries: ESPNInjury[];
  h2h: H2HGame[];
  analytics: AFLMatchAnalytics | null;
  historyFilter: VenueFilter;
  onHistoryFilterChange: (f: VenueFilter) => void;
}) {
  const { homeTeam, awayTeam, weather, status } = game;
  const isUpcoming = status === "upcoming";
  const ha = analytics?.home;
  const aa = analytics?.away;
  const KEY_STATS = ["D","G","T","M","HO"];
  const topHome = boxScore?.home.slice(0, 8) ?? [];
  const topAway = boxScore?.away.slice(0, 8) ?? [];
  const hasBoxScore = topHome.length > 0 || topAway.length > 0;

  return (
    <div className="space-y-4">
      {!isUpcoming && hasBoxScore && (
        <Section title="Disposal Leaders">
          <div className="grid grid-cols-2 gap-4">
            {[{ t: homeTeam, rows: topHome }, { t: awayTeam, rows: topAway }].map(({ t, rows }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs font-medium text-text-2">{t.shortName}</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center py-1.5 border-b border-border last:border-0 text-xs gap-2">
                    <span className="text-text-1 flex-1 truncate">{row.player}</span>
                    <div className="flex items-center gap-2 text-text-2 shrink-0">
                      {KEY_STATS.filter(k => row.stats[k] != null).map(k => (
                        <span key={k} className="tabular-nums">
                          <span className="text-text-2 text-[9px]">{k} </span>
                          <span className={k==="D"&&Number(row.stats[k])>=25?"text-primary font-bold":""}>{row.stats[k]}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        <div className="lg:col-span-3 space-y-4">
          {(ha || aa) && (
            <Section title="Match Intelligence">

              <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                {([{ t: homeTeam, an: ha, role:"Home" }, { t: awayTeam, an: aa, role:"Away" }] as const).map(({ t, an, role }) => {
                  if (!an) return <div key={t.name} />;
                  return (
                    <div key={t.name}>
                      <div className="flex items-center gap-1.5 mb-2">
                        {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                        <span className="text-xs font-semibold text-text-1">{t.shortName}</span>
                        <span className="text-[9px] text-text-2 ml-1">{role}</span>
                        {an.streak.type && an.streak.count >= 2 && (
                          <span className={`ml-auto text-[9px] font-bold px-1 py-px rounded ${an.streak.type==="W"?"bg-[#22C55E]/10 text-[#22C55E]":"bg-[#EF4444]/10 text-[#EF4444]"}`}>
                            {an.streak.count}{an.streak.type}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 mb-3">
                        {an.form.map((r,i) => (
                          <span key={i} className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${r==="W"?"bg-[#22C55E]/20 text-[#22C55E]":r==="L"?"bg-[#EF4444]/20 text-[#EF4444]":"bg-[#F59E0B]/20 text-[#F59E0B]"}`}>{r}</span>
                        ))}
                      </div>
                      {[
                        ["Season",    `${an.record.wins}W ${an.record.losses}L${an.record.draws>0?` ${an.record.draws}D`:""}`],
                        ["Avg Scored",`${an.avgScored} pts`],
                        ["Avg Conceded",`${an.avgConceded} pts`],
                        ...(role==="Home"?[["Home Record",`${an.homeRecord.wins}W ${an.homeRecord.losses}L`]]:
                                          [["Away Record",`${an.awayRecord.wins}W ${an.awayRecord.losses}L`]]),
                        ...(an.venueRecord?[["At Venue",`${an.venueRecord.wins}W ${an.venueRecord.losses}L`]]:[]),
                        ...(an.daysRest!=null?[["Days Rest",`${an.daysRest}d`]]:[]),
                      ].map(([label,value]) => (
                        <div key={label} className="flex items-center justify-between py-1 border-b border-border last:border-0 text-xs">
                          <span className="text-text-2">{label}</span>
                          <span className="text-text-1 font-medium tabular-nums">{value}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {h2h.length > 0 && (
            <Section title="Head-to-Head">
              <div className="flex items-center gap-4 mb-3">
                {(() => {
                  const hw = h2h.filter(g=>g.winner===homeTeam.name).length;
                  const dr = h2h.filter(g=>g.winner==="Draw").length;
                  const aw = h2h.length - hw - dr;
                  return (
                    <>
                      <div className="flex-1 text-center">
                        <div className="text-xl font-black text-primary">{hw}</div>
                        <div className="text-[9px] text-text-2">{homeTeam.shortName}</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-xl font-black text-[#F59E0B]">{dr}</div>
                        <div className="text-[9px] text-text-2">Draws</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-xl font-black text-text-2">{aw}</div>
                        <div className="text-[9px] text-text-2">{awayTeam.shortName}</div>
                      </div>
                    </>
                  );
                })()}
              </div>
              {h2h.slice(0,6).map((g,i) => {
                const isHW = g.winner===homeTeam.name;
                const isAW = g.winner===awayTeam.name;
                return (
                  <Link key={g.gameId||i} href={g.gameId?`/game/${g.gameId}`:"#"}
                    className="flex items-center gap-1.5 py-1.5 border-b border-border last:border-0 hover:bg-surface2 rounded px-0.5 text-xs">
                    <span className="text-text-2 w-16 shrink-0 text-[10px]">{g.date}</span>
                    <span className={`flex-1 truncate text-right text-[10px] ${isHW?"text-white font-medium":"text-text-2"}`}>{g.homeTeam}</span>
                    <span className="font-bold text-text-1 tabular-nums w-12 text-center shrink-0">{g.score}</span>
                    <span className={`flex-1 truncate text-[10px] ${isAW?"text-white font-medium":"text-text-2"}`}>{g.awayTeam}</span>
                    <span className={`text-[9px] px-1 py-px rounded font-bold shrink-0 ${isHW?"bg-primary/20 text-primary":isAW?"bg-white/10 text-text-2":"bg-[#F59E0B]/20 text-[#F59E0B]"}`}>
                      {isHW?"H":isAW?"A":"D"}
                    </span>
                  </Link>
                );
              })}
            </Section>
          )}

          {(ha?.last5.length || aa?.last5.length) ? (
            <Section title="Last 5 Games">
              <div className="grid grid-cols-2 gap-4">
                {([{t:homeTeam,an:ha},{t:awayTeam,an:aa}] as const).map(({t,an})=>{
                  if(!an) return null;
                  return (
                    <div key={t.name}>
                      <div className="flex items-center gap-1.5 mb-2">
                        {t.logoUrl&&<img src={t.logoUrl} alt="" className="w-4 h-4 object-contain"/>}
                        <span className="text-xs font-medium text-text-2">{t.shortName}</span>
                      </div>
                      {an.last5.map((g,i)=>(
                        <Link key={g.gameId||i} href={g.gameId?`/game/${g.gameId}`:"#"}
                          className="flex items-center gap-1.5 py-1.5 border-b border-border last:border-0 hover:bg-surface2 rounded px-0.5 text-xs">
                          <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${g.result==="W"?"bg-[#22C55E]/20 text-[#22C55E]":g.result==="L"?"bg-[#EF4444]/20 text-[#EF4444]":"bg-[#F59E0B]/20 text-[#F59E0B]"}`}>{g.result}</span>
                          <span className="text-text-2 w-7 text-[10px] text-center shrink-0">{g.oppAbbr}</span>
                          <span className="text-text-1 tabular-nums text-[10px] shrink-0">{g.teamScore}–{g.oppScore}</span>
                          <span className={`tabular-nums text-[9px] shrink-0 ${g.margin>0?"text-[#22C55E]":"text-[#EF4444]"}`}>{g.margin>0?`+${g.margin}`:g.margin}</span>
                          <span className="text-text-2 text-[9px] shrink-0">{g.homeAway}</span>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {(ha && aa) && (
            <Section title="Home / Away Splits">
              <div className="grid grid-cols-2 gap-3">
                {([{t:homeTeam,an:ha,role:"Home"},{t:awayTeam,an:aa,role:"Away"}] as const).map(({t,an,role})=>(
                  <div key={t.name} className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      {t.logoUrl&&<img src={t.logoUrl} alt="" className="w-4 h-4 object-contain"/>}
                      <span className="text-[10px] text-text-2">{t.shortName}</span>
                    </div>
                    {[
                      {label:"At Home",rec:an.homeRecord},
                      {label:"Away",rec:an.awayRecord},
                    ].map(({label,rec})=>{
                      const total=rec.wins+rec.losses;
                      const pct=total>0?Math.round((rec.wins/total)*100):0;
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-[10px] mb-0.5">
                            <span className="text-text-2">{label}</span>
                            <span className="text-text-1 tabular-nums">{rec.wins}W {rec.losses}L</span>
                          </div>
                          <div className="h-[2px] bg-surface2 rounded-full">
                            <div className={`h-full rounded-full ${pct>=50?"bg-[#22C55E]":"bg-[#EF4444]"}`} style={{width:`${pct}%`}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {weather && weather.condition !== "Indoor" && (
            <Section title="Weather">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{WEATHER_ICON[weather.condition]??"🌤"}</span>
                <div>
                  <div className={`text-sm font-medium ${weather.windKph>40||["Storm","Rain"].includes(weather.condition)?"text-[#F59E0B]":"text-text-1"}`}>
                    {weather.condition}
                  </div>
                  <div className="text-xs text-text-2">{weather.tempC}°C · {weather.windKph} km/h wind</div>
                </div>
              </div>
            </Section>
          )}

          {(ha?.injuryImpact||aa?.injuryImpact) && (
            <Section title="Team News">
              <div className="grid grid-cols-2 gap-3">
                {([{t:homeTeam,an:ha},{t:awayTeam,an:aa}] as const).map(({t,an})=>{
                  if(!an) return null;
                  const {out,doubtful,suspended}=an.injuryImpact;
                  const hasAny=out.length>0||doubtful.length>0||suspended.length>0;
                  return (
                    <div key={t.name}>
                      <div className="flex items-center gap-1.5 mb-2">
                        {t.logoUrl&&<img src={t.logoUrl} alt="" className="w-4 h-4 object-contain"/>}
                        <span className="text-[10px] font-medium text-text-2">{t.shortName}</span>
                      </div>
                      {!hasAny&&<p className="text-[10px] text-[#22C55E]">✓ None</p>}
                      {out.length>0&&(
                        <div className="mb-1.5">
                          <div className="text-[9px] text-[#EF4444] uppercase tracking-widest mb-0.5">Out</div>
                          {out.map((p,i)=>(
                            <div key={i} className="text-[10px] text-text-1 truncate py-0.5 border-b border-border">
                              {p.playerName}{p.note?<span className="text-text-2 ml-1">·{p.note.slice(0,12)}</span>:null}
                            </div>
                          ))}
                        </div>
                      )}
                      {doubtful.length>0&&(
                        <div>
                          <div className="text-[9px] text-[#F59E0B] uppercase tracking-widest mb-0.5">Doubtful</div>
                          {doubtful.map((p,i)=>(
                            <div key={i} className="text-[10px] text-text-1 truncate py-0.5 border-b border-border">{p.playerName}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {(ha && aa) && (
            <Section title="Team Comparison">
              {([
                {key:"Avg Scored",hv:ha.avgScored,av:aa.avgScored},
                {key:"Avg Conceded",hv:ha.avgConceded,av:aa.avgConceded},
                {key:"Win Margin",hv:ha.avgMarginWin,av:aa.avgMarginWin},
                {key:"Loss Margin",hv:ha.avgMarginLoss,av:aa.avgMarginLoss},
              ] as {key:string;hv:number;av:number}[]).map(({key,hv,av})=>{
                const max=Math.max(hv,av,1);
                return (
                  <div key={key} className="mb-2 last:mb-0">
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className="text-white font-medium tabular-nums w-8">{hv}</span>
                      <span className="text-text-2 uppercase text-[9px] tracking-wide flex-1 text-center">{key}</span>
                      <span className="text-text-2 tabular-nums w-8 text-right">{av}</span>
                    </div>
                    <div className="flex gap-0.5 h-[2px]">
                      <div className="flex-1 bg-surface2 rounded-full overflow-hidden flex justify-end">
                        <div className="h-full bg-primary rounded-full" style={{width:`${(hv/max)*100}%`}}/>
                      </div>
                      <div className="flex-1 bg-surface2 rounded-full overflow-hidden">
                        <div className="h-full bg-text-2/40 rounded-full" style={{width:`${(av/max)*100}%`}}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          {insights.length > 0 && (
            <Section title="Key Insights">
              <ul className="space-y-1.5">
                {insights.slice(0,5).map((ins,i)=>(
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="text-primary shrink-0">{ins.icon}</span>
                    <span className="text-text-1 leading-snug">{ins.text}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* ── Right column: Model Pick ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {analytics?.predictedMargin != null && analytics.predictedMargin !== 0 && game.status === "upcoming" && (
            <div className="bg-surface rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-2">Model Pick</div>
                {/* Info tooltip */}
                <div className="relative group">
                  <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center cursor-default hover:border-primary transition-colors">
                    <span className="text-[9px] font-bold text-text-2 group-hover:text-primary leading-none">?</span>
                  </div>
                  <div className="absolute right-0 top-5 z-50 w-52 bg-surface2 border border-border rounded-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-text-2 mb-2">How it&apos;s calculated</div>
                    {([
                      { label: "Attack vs Defence", pct: "35%", desc: "Avg scored vs opponent's avg conceded" },
                      { label: "Ladder standing",   pct: "30%", desc: "AFL rank + season percentage" },
                      { label: "Recent form",       pct: "25%", desc: "Last 5 games, newer games weighted higher" },
                      { label: "Head-to-head",      pct: "10%", desc: "Last 4 H2H meetings" },
                    ]).map(({ label, pct, desc }) => (
                      <div key={label} className="mb-2 last:mb-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-text-1">{label}</span>
                          <span className="text-[9px] font-bold text-primary">{pct}</span>
                        </div>
                        <p className="text-[9px] text-text-2 leading-snug mt-0.5">{desc}</p>
                      </div>
                    ))}
                    <div className="mt-2 pt-2 border-t border-border text-[9px] text-text-2">
                      +5 pts home ground advantage applied
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-center py-2">
                <div className="text-xs text-primary font-bold mb-1">
                  {analytics.predictedMargin >= 0 ? game.homeTeam.shortName : game.awayTeam.shortName}
                </div>
                <div className="text-3xl font-black text-text-1 tabular-nums">
                  +{Math.abs(analytics.predictedMargin)} pts
                </div>
                <div className="text-[9px] text-text-2 mt-1">ladder · form · attack/defence · H2H</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GenericOverview({ game, insights, homeHistory, awayHistory }: {
  game: Game; insights: Insight[];
  homeHistory: TeamHistoryGame[]; awayHistory: TeamHistoryGame[];
}) {
  const { homeTeam, awayTeam } = game;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Section title="Form">
        <div className="space-y-4">
          {[{ t: homeTeam, role: "Home" }, { t: awayTeam, role: "Away" }].map(({ t, role }) => (
            <div key={t.name}>
              <div className="flex items-center gap-2 mb-2">
                {t.logoUrl && <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain" />}
                <span className="text-sm text-text-1">{t.name}</span>
                <span className="text-xs text-text-2">{role}</span>
              </div>
              <FormPills form={t.form} />
            </div>
          ))}
        </div>
      </Section>
      {insights.length > 0 && (
        <Section title="Insights">
          <ul className="space-y-2">
            {insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-primary shrink-0">{ins.icon}</span>
                <span className="text-text-1">{ins.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function GameDetailTabs({
  game, id, homeSquad, awaySquad, homeInjuries, awayInjuries,
  homeHistories, awayHistories, h2hVariants, aflAnalytics, sofascore: sofascoreProp,
  insights, isSoccer, isBasketball, isAFL,
  kitchenSlips, aflBet365Slips, aflDabbleSlips, aflHasRealOdds, nbaKitchenSlips, soccerKitchenSlips,
  homeTeamGameStats, awayTeamGameStats,
  scores365Data,
  fotmobPlayerMap = {},
  homePlayerHistory,
  awayPlayerHistory,
  initialTab, initialH2hFilter, initialHistoryFilter,
}: GameDetailTabsProps) {
  const hasKitchen = isAFL || isBasketball || (isSoccer && (soccerKitchenSlips?.some(s => s.legs.length > 0) ?? false));
  const VALID_TABS = ["overview","players","stats","h2h", ...(hasKitchen ? ["kitchen"] : [])] as const;
  const [tab, setTab] = useState<"overview"|"players"|"stats"|"h2h"|"kitchen">(
    (VALID_TABS.includes(initialTab as any) ? initialTab : "overview") as "overview"|"players"|"stats"|"h2h"|"kitchen"
  );
  const [h2hFilter, setH2hFilter] = useState<VenueFilter>(initialH2hFilter);
  const [historyFilter, setHistoryFilter] = useState<VenueFilter>(initialHistoryFilter);
  const [soccerPlayer, setSoccerPlayer] = useState<{ player: SofascorePlayer; teamName: string; side: "home" | "away"; espnSrc?: string; fotmobId?: number; espnHistory?: SofascoreGameLog[] } | null>(null);

  // Look up FotMob player ID by name (normalised match)
  const lookupFotmob = (name: string): number | undefined => {
    if (!fotmobPlayerMap || !name) return undefined;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const key = norm(name);
    const direct = fotmobPlayerMap[key];
    if (direct) return direct;
    for (const [k, id] of Object.entries(fotmobPlayerMap)) {
      if (key.length >= 4 && (k.includes(key) || key.includes(k))) return id;
    }
    return undefined;
  };

  // Look up player ESPN game history by name (normalised partial match)
  const lookupEspnHistory = (name: string, side: "home" | "away"): SofascoreGameLog[] | undefined => {
    const map = side === "home" ? homePlayerHistory : awayPlayerHistory;
    if (!map || !name) return undefined;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const key = norm(name);
    const entries = Array.from(map.entries());
    // Direct match
    for (const [k, logs] of entries) {
      if (norm(k) === key) return logs;
    }
    // Partial match (e.g. "Stones" matches "John Stones")
    for (const [k, logs] of entries) {
      const nk = norm(k);
      if (key.length >= 4 && (nk.includes(key) || key.includes(nk))) return logs;
    }
    return undefined;
  };

  // Client-side fetch: browser bypasses Vercel IP blocks (Sofascore allows CORS *)
  const sofascore = useSofascoreClientFetch(isSoccer, sofascoreProp, game);
  const effectiveSoccerKitchenSlips = useSoccerKitchenClient(isSoccer, sofascore, soccerKitchenSlips, game, homeHistories, awayHistories);
  // Re-evaluate kitchen availability once client slips load
  const effectiveHasKitchen = isAFL || isBasketball || (isSoccer && (effectiveSoccerKitchenSlips?.some(s => s.legs.length > 0) ?? false));

  // AFL kitchen player drawer
  const [aflKitchenDrawer, setAflKitchenDrawer] = useState<import("@/lib/sports/afl/players/types").AFLPlayerAnalyticsResult | null>(null);
  const [aflKitchenLoading, setAflKitchenLoading] = useState(false);

  const [soccerKitchenDrawer, setSoccerKitchenDrawer] = useState<SoccerPlayerAnalyticsResult | null>(null);
  const [soccerKitchenLoading, setSoccerKitchenLoading] = useState(false);

  const onSoccerKitchenClick = async (name: string) => {
    const p = [
      ...(sofascore?.lineups?.home ?? []),
      ...(sofascore?.lineups?.away ?? [])
    ].find(x => x.name === name || x.shortName === name);
    if (!p) return;

    setSoccerKitchenLoading(true);
    setSoccerKitchenDrawer(null);

    try {
      // Determine side first, then derive team/opponent IDs from that
      const side        = (sofascore?.lineups?.home ?? []).some(x => x.id === p.id) ? "home" : "away";
      const oppId       = side === "home" ? sofascore?.awayTeamId : sofascore?.homeTeamId;
      const myTeamId    = side === "home" ? sofascore?.homeTeamId : sofascore?.awayTeamId;
      const params      = new URLSearchParams();
      if (oppId)        params.set("opponentTeamId", String(oppId));
      if (myTeamId)     params.set("playerTeamId",   String(myTeamId));
      if (sofascore?.tournamentId) params.set("tournamentId", String(sofascore.tournamentId));

      const res = await fetch(`/api/soccer/player/${p.id}?${params}`);
      if (res.ok) {
        const result = await res.json();
        const teamName = side === "home" ? game.homeTeam.name : game.awayTeam.name;
        const teamAbbr = side === "home" ? game.homeTeam.shortName : game.awayTeam.shortName;
        const opponent = side === "home" ? game.awayTeam.name : game.homeTeam.name;

        // Compute home/away split averages from recent games (now that playerTeamId is set)
        type RG = { playerTeamId: number | null; homeTeamId: number; goals: number | null; assists: number | null; shots: number | null; shotsOnTarget: number | null; rating: number | null };
        const recent: RG[] = result.recentGames ?? [];
        const homeGames = recent.filter((g: RG) => g.playerTeamId !== null && g.playerTeamId === g.homeTeamId);
        const awayGames = recent.filter((g: RG) => g.playerTeamId !== null && g.playerTeamId !== g.homeTeamId);

        const avgOf = (games: RG[], key: keyof RG): number | null => {
          const vals = games.map(g => g[key] as number | null).filter((v): v is number => v !== null);
          return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
        };

        const mkAvg = (games: RG[]): Record<string, number | null> =>
          games.length >= 2
            ? { goals: avgOf(games, "goals"), assists: avgOf(games, "assists"), shots: avgOf(games, "shots"), shotsOnTarget: avgOf(games, "shotsOnTarget"), rating: avgOf(games, "rating") }
            : { goals: null, assists: null, shots: null, shotsOnTarget: null, rating: null };

        const homeAvg = mkAvg(homeGames);
        const awayAvg = mkAvg(awayGames);

        const trends = {
          goals:         recent.map((g: RG) => g.goals         ?? 0),
          shots:         recent.map((g: RG) => g.shots         ?? 0),
          shotsOnTarget: recent.map((g: RG) => g.shotsOnTarget ?? 0),
          rating:        recent.map((g: RG) => g.rating        ?? 0),
        };

        setSoccerKitchenDrawer({
          playerId: p.id,
          playerName: p.name,
          shortName: p.shortName,
          position: p.position,
          jersey: p.jerseyNumber,
          headshot: undefined,  // Sofascore lineup IDs ≠ profile photo IDs — show initials
          teamName, teamAbbr, opponent, side,
          seasonStats:  result.seasonStats,
          recentGames:  result.recentGames,
          vsOpponent: {
            lastMatchup: result.vsOpponent ?? null,
            history:     result.vsHistory  ?? [],
          },
          homeAvg,
          awayAvg,
          trends,
        });
      }
    } finally {
      setSoccerKitchenLoading(false);
    }
  };

  // Bookie tab state for AFL kitchen
  const [bookieTab, setBookieTab] = useState<"generic" | "bet365" | "dabble">("generic");
  // Bookie tab state for Soccer kitchen
  const [soccerBookieTab, setSoccerBookieTab] = useState<"generic" | "bet365" | "dabble">("generic");

  // ── Slip logger: save AFL kitchen to local DB when kitchen tab opens ──────────
  const slipsSaved = useRef(false);
  useEffect(() => {
    if (!isAFL || !kitchenSlips || kitchenSlips.length === 0) return;
    if (slipsSaved.current) return;
    slipsSaved.current = true;

    const gameDate = game.kickoff ? game.kickoff.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const venue    = game.venue ?? undefined;

    // Use pre-computed bookie slips (built from scratch with valid bookie lines)
    const bet365Slips = aflBet365Slips ?? [];
    const dabbleSlips = aflDabbleSlips ?? [];

    const mapLegs = (legs: typeof kitchenSlips[0]["legs"]) => legs.map(l => ({
      player:        l.player,
      teamAbbr:      l.teamAbbr,
      side:          l.side,
      stat:          l.stat,
      statLabel:     l.statLabel,
      threshold:     l.threshold,
      avgStat:       l.avgStat,
      hitRate:       l.hitRate,
      reliability:   l.reliability,
      isOnForm:      l.isOnForm,
      isBounceBack:  l.isBounceBack,
      gamesAnalyzed: l.gamesAnalyzed,
      signalTotal:   l.signalTotal,
      prop:          l.prop,
      edge:          l.edge,
    }));

    const allSlipSets: Array<{ slips: typeof kitchenSlips; bookie: string }> = [
      { slips: kitchenSlips, bookie: "generic" },
      { slips: bet365Slips,  bookie: "bet365"  },
      { slips: dabbleSlips,  bookie: "dabble"  },
    ];

    const payload = {
      game: {
        id:       id,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        venue,
        gameDate,
      },
      slips: allSlipSets.flatMap(({ slips, bookie }) =>
        slips
          .filter(s => s.legs.length > 0)
          .map(s => ({
            slipType: s.type,
            bookie,
            legs: mapLegs(s.legs),
          }))
      ),
    };

    fetch("/api/slips/save", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    }).catch(err => console.warn("[slips] save failed:", err));
  }, [isAFL, kitchenSlips, aflBet365Slips, aflDabbleSlips, id, game]);

  // ── Outcome resolver: auto-check results when a finished AFL game loads ───────
  const outcomesResolved = useRef(false);
  useEffect(() => {
    if (!isAFL || game.status !== "finished") return;
    if (!game.boxScore) return;
    if (outcomesResolved.current) return;
    outcomesResolved.current = true;

    // ESPN AFL boxscore columns: D (disposals direct), G, M, T, HO, K, H (handballs)
    // D is available directly — do NOT compute K + H, ESPN provides the total.
    const allRows = [...(game.boxScore.home ?? []), ...(game.boxScore.away ?? [])];

    const statLines = allRows
      .filter(row => row.player && row.player !== "Unknown")
      .map(row => ({
        player: row.player,
        D:  Number(row.stats["D"]  ?? 0),
        G:  Number(row.stats["G"]  ?? 0),
        M:  Number(row.stats["M"]  ?? 0),
        T:  Number(row.stats["T"]  ?? 0),
        HO: Number(row.stats["HO"] ?? 0),
        K:  Number(row.stats["K"]  ?? 0),
        H:  Number(row.stats["H"]  ?? 0),
      }));

    if (statLines.length === 0) return;

    fetch("/api/slips/outcome", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ gameId: id, statLines }),
    }).catch(err => console.warn("[slips] outcome resolve failed:", err));
  }, [isAFL, game.status, game.boxScore, id]);

  // ── Soccer slip logger: save soccer kitchen to local DB when slips are available ─
  const soccerSlipsSaved = useRef(false);
  useEffect(() => {
    if (!isSoccer || !effectiveSoccerKitchenSlips || effectiveSoccerKitchenSlips.length === 0) return;
    if (soccerSlipsSaved.current) return;
    soccerSlipsSaved.current = true;

    const gameDate = game.kickoff ? game.kickoff.slice(0, 10) : new Date().toISOString().slice(0, 10);

    // Only log player-type legs — team/match legs cannot be resolved from Sofascore lineups
    const mapLegs = (legs: typeof effectiveSoccerKitchenSlips[0]["legs"]) =>
      legs
        .filter(l => l.legType === "player" && l.player)
        .map(l => ({
          player:        l.player!,
          teamAbbr:      l.teamAbbr ?? "",
          side:          l.side ?? "home",
          stat:          l.stat,
          statLabel:     l.statLabel,
          threshold:     l.threshold,
          avgStat:       l.avgStat,
          hitRate:       l.hitRate,
          reliability:   l.reliability,
          isOnForm:      l.isOnForm,
          isBounceBack:  l.isBounceBack,
          gamesAnalyzed: l.gamesAnalyzed,
          signalTotal:   l.signalTotal,
          prop:          l.prop,
          edge:          l.edge,
        }));

    const payload = {
      game: {
        id:       id,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        gameDate,
        sport:    "soccer",
      },
      slips: effectiveSoccerKitchenSlips
        .map(s => ({
          slipType: s.type,
          bookie:   "generic",
          legs:     mapLegs(s.legs),
        }))
        .filter(s => s.legs.length > 0),
    };

    if (payload.slips.length === 0) return;

    fetch("/api/slips/save", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    }).catch(err => console.warn("[slips] soccer save failed:", err));
  }, [isSoccer, effectiveSoccerKitchenSlips, id, game]);

  // ── Soccer outcome resolver: auto-check results when a finished soccer game loads ─
  const soccerOutcomesResolved = useRef(false);
  useEffect(() => {
    if (!isSoccer || game.status !== "finished") return;
    if (!sofascore?.lineups) return;
    if (soccerOutcomesResolved.current) return;
    soccerOutcomesResolved.current = true;

    // Build SoccerStatLine from Sofascore lineup player statistics
    // Sofascore stat keys: goals, goalAssist, onTargetScoringAttempt, totalScoringAttempt, yellowCard
    const allPlayers = [
      ...(sofascore.lineups.home ?? []),
      ...(sofascore.lineups.away ?? []),
    ];

    const statLines = allPlayers
      .filter(p => p.name && p.name !== "Unknown" && p.minutesPlayed != null && (p.minutesPlayed ?? 0) > 0)
      .map(p => ({
        player:        p.name,
        playerId:      p.id,
        goals:         Number(p.stats["goals"]                   ?? 0),
        assists:       Number(p.stats["goalAssist"]              ?? 0),
        shots:         Number(p.stats["totalScoringAttempt"]     ?? 0),
        shotsOnTarget: Number(p.stats["onTargetScoringAttempt"]  ?? 0),
        yellowCards:   Number(p.stats["yellowCard"]              ?? 0),
      }));

    if (statLines.length === 0) return;

    fetch("/api/slips/soccer-outcome", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ gameId: id, statLines }),
    }).catch(err => console.warn("[slips] soccer outcome resolve failed:", err));
  }, [isSoccer, game.status, sofascore?.lineups, id]);

  async function handleKitchenPlayerClick(playerName: string) {
    const homePlayer = homeSquad.find(p => p.displayName === playerName);
    const awayPlayer = awaySquad.find(p => p.displayName === playerName);
    const player = homePlayer ?? awayPlayer;
    if (!player) return;

    const matchContext = homePlayer ? "home" : "away";
    const opponent     = homePlayer ? awayTeam.name : homeTeam.name;
    const teamId       = homePlayer ? (homeTeam.espnId ?? "") : (awayTeam.espnId ?? "");

    setAflKitchenLoading(true);
    setAflKitchenDrawer(null);

    try {
      const url = `/api/afl/player/${player.id}?homeAway=${matchContext}&opponent=${encodeURIComponent(opponent)}&teamId=${encodeURIComponent(teamId)}&name=${encodeURIComponent(playerName)}&position=${encodeURIComponent(player.position)}&jersey=${encodeURIComponent(player.jersey ?? "")}`;
      const res = await fetch(url);
      if (res.ok) setAflKitchenDrawer(await res.json());
    } finally {
      setAflKitchenLoading(false);
    }
  }

  const currentHomeHistory = homeHistories[historyFilter];
  const currentAwayHistory = awayHistories[historyFilter];
  const currentH2H = h2hVariants[h2hFilter];
  const h2hForOverview = h2hVariants.all;

  const { homeTeam, awayTeam, boxScore } = game;
  const sport = game.sport;

  // Build slip color map for player row indicators
  const slipColorMap = (() => {
    const allSlips = [...(kitchenSlips ?? []), ...(nbaKitchenSlips ?? [])];
    return allSlips.length > 0 ? buildSlipColorMap(allSlips) : undefined;
  })();

  return (
    <>
      {/* Tab bar — visually continues the hero card */}
      <div className="bg-surface rounded-b-2xl overflow-hidden mb-4">
        <div className="flex border-t border-white/5">
          {TABS.filter(t => (!t.kitchenOnly || effectiveHasKitchen) && (!t.soccerOnly || isSoccer)).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`flex-1 py-3 text-center text-sm font-medium relative transition-colors ${
                tab === t.key
                  ? "text-text-1 after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:bg-primary after:rounded-full"
                  : "text-text-2 hover:text-text-1"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        isSoccer
          ? <SoccerOverview
              game={game} insights={insights} weather={game.weather}
              homeHistory={currentHomeHistory} awayHistory={currentAwayHistory}
              h2h={h2hForOverview} historyFilter={historyFilter}
              onHistoryFilterChange={setHistoryFilter}
              homeSquad={homeSquad} awaySquad={awaySquad} sofascore={sofascore}
              homeTeamGameStats={homeTeamGameStats}
              awayTeamGameStats={awayTeamGameStats}
              scores365Data={scores365Data}
            />
          : isBasketball
          ? <BasketballOverview
              game={game} insights={insights} sofascore={sofascore}
              homeHistory={currentHomeHistory} awayHistory={currentAwayHistory}
              homeSquad={homeSquad} awaySquad={awaySquad}
              homeInjuries={homeInjuries} awayInjuries={awayInjuries}
              h2h={h2hForOverview}
            />
          : isAFL
          ? <AFLDashboard
              game={game} insights={insights}
              homeHistory={currentHomeHistory} awayHistory={currentAwayHistory}
              homeInjuries={homeInjuries} awayInjuries={awayInjuries}
              h2h={h2hForOverview} analytics={aflAnalytics}
              historyFilter={historyFilter} onHistoryFilterChange={setHistoryFilter}
              slipColorMap={slipColorMap}
            />
          : <GenericOverview
              game={game} insights={insights}
              homeHistory={currentHomeHistory} awayHistory={currentAwayHistory}
            />
      )}

      {/* ── Players ──────────────────────────────────────────────────────── */}
      {tab === "players" && (
        <div className="space-y-4">
          {sofascore?.incidents && sofascore.incidents.length > 0 && isSoccer && (
            <Section title="Events">
              <MatchEventStrip incidents={sofascore.incidents} homeTeam={homeTeam.shortName} awayTeam={awayTeam.shortName} />
            </Section>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={`${homeTeam.shortName} — Players`}>
              {isAFL && boxScore ? (
                <AFLPlayerList
                  rows={boxScore.home}
                  headers={boxScore.statHeaders}
                  teamId={homeTeam.espnId}
                  opponent={awayTeam.name}
                  matchContext="home"
                  slipColorMap={slipColorMap}
                />
              ) : isBasketball && boxScore ? (
                <NBAPlayerList
                  rows={boxScore.home}
                  headers={boxScore.statHeaders}
                  teamId={homeTeam.espnId}
                  opponent={awayTeam.name}
                  matchContext="home"
                  slipColorMap={slipColorMap}
                />
              ) : isBasketball ? (
                <SquadList
                  players={homeSquad}
                  injuries={homeInjuries}
                  sport={game.sport}
                  gameId={game.id}
                  teamId={homeTeam.espnId}
                  opponent={awayTeam.name}
                  matchContext="home"
                />
              ) : isSoccer && sofascore?.lineups ? (
                <SoccerPlayerList
                  players={sofascore.lineups.home}
                  espnSquad={homeSquad}
                  formation={sofascore.lineups.homeFormation}
                  onPlayerClick={(p, espnSrc) => setSoccerPlayer({ player: p, teamName: homeTeam.name, side: "home", espnSrc, fotmobId: lookupFotmob(p.name), espnHistory: lookupEspnHistory(p.name, "home") })}
                />
              ) : isSoccer ? (
                <SquadList
                  players={homeSquad}
                  injuries={homeInjuries}
                  sport={game.sport}
                  gameId={game.id}
                  teamId={homeTeam.espnId}
                  opponent={awayTeam.name}
                  matchContext="home"
                />
              ) : sofascore?.lineups ? (
                <SofascoreList players={sofascore.lineups.home} sport={sport} />
              ) : (
                <SquadList
                  players={homeSquad}
                  injuries={homeInjuries}
                  sport={game.sport}
                  gameId={game.id}
                  teamId={homeTeam.espnId}
                  opponent={awayTeam.name}
                  matchContext="home"
                />
              )}
            </Section>
            <Section title={`${awayTeam.shortName} — Players`}>
              {isAFL && boxScore ? (
                <AFLPlayerList
                  rows={boxScore.away}
                  headers={boxScore.statHeaders}
                  teamId={awayTeam.espnId}
                  opponent={homeTeam.name}
                  matchContext="away"
                  slipColorMap={slipColorMap}
                />
              ) : isBasketball && boxScore ? (
                <NBAPlayerList
                  rows={boxScore.away}
                  headers={boxScore.statHeaders}
                  teamId={awayTeam.espnId}
                  opponent={homeTeam.name}
                  matchContext="away"
                  slipColorMap={slipColorMap}
                />
              ) : isBasketball ? (
                <SquadList
                  players={awaySquad}
                  injuries={awayInjuries}
                  sport={game.sport}
                  gameId={game.id}
                  teamId={awayTeam.espnId}
                  opponent={homeTeam.name}
                  matchContext="away"
                />
              ) : isSoccer && sofascore?.lineups ? (
                <SoccerPlayerList
                  players={sofascore.lineups.away}
                  espnSquad={awaySquad}
                  formation={sofascore.lineups.awayFormation}
                  onPlayerClick={(p, espnSrc) => setSoccerPlayer({ player: p, teamName: awayTeam.name, side: "away", espnSrc, fotmobId: lookupFotmob(p.name), espnHistory: lookupEspnHistory(p.name, "away") })}
                />
              ) : isSoccer ? (
                <SquadList
                  players={awaySquad}
                  injuries={awayInjuries}
                  sport={game.sport}
                  gameId={game.id}
                  teamId={awayTeam.espnId}
                  opponent={homeTeam.name}
                  matchContext="away"
                />
              ) : sofascore?.lineups ? (
                <SofascoreList players={sofascore.lineups.away} sport={sport} />
              ) : (
                <SquadList
                  players={awaySquad}
                  injuries={awayInjuries}
                  sport={game.sport}
                  gameId={game.id}
                  teamId={awayTeam.espnId}
                  opponent={homeTeam.name}
                  matchContext="away"
                />
              )}
            </Section>

          </div>

          {/* ── Player Intel (soccer only) — merged into Players tab ──────── */}
          {isSoccer && (
            sofascore?.lineups
              ? <SoccerPlayerIntel
                  lineups={sofascore.lineups}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  status={game.status}
                />
              : null
          )}
        </div>
      )}

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="space-y-4">
          {game.teamStats ? (
            <Section title="Team Stats">
              <ComparisonBars homeTeam={homeTeam} awayTeam={awayTeam} stats={game.teamStats} />
            </Section>
          ) : null}

          {/* Soccer: show 365Scores player stats when available */}
          {isSoccer && scores365Data &&
            (scores365Data.homePlayers.length > 0 || scores365Data.awayPlayers.length > 0) ? (
            <Section title="Player Stats">
              <Soccer365PlayerStats
                homePlayers={scores365Data.homePlayers}
                awayPlayers={scores365Data.awayPlayers}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
              />
            </Section>
          ) : !isSoccer && boxScore ? (
            <Section title="Box Score">
              <CompactBoxScore boxScore={boxScore} homeTeam={homeTeam} awayTeam={awayTeam} />
            </Section>
          ) : !isSoccer ? (
            <Section title="Box Score">
              <p className="text-sm text-text-2">No data available yet.</p>
            </Section>
          ) : null}
        </div>
      )}

      {/* ── H2H ─────────────────────────────────────────────────────────── */}
      {tab === "h2h" && (
        <Section title="Head-to-Head">
          <div className="flex gap-2 mb-4">
            {(["all","home","away"] as VenueFilter[]).map(f => (
              <button key={f} onClick={() => setH2hFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  h2hFilter === f ? "text-primary bg-primary/10" : "text-text-2 hover:text-text-1"
                }`}>
                {f === "all" ? "All" : f === "home" ? "Home" : "Away"}
              </button>
            ))}
          </div>
          {currentH2H.length > 0
            ? <H2HPanel h2h={currentH2H} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
            : <p className="text-sm text-text-2">No head-to-head data.</p>}
        </Section>
      )}

      {/* ── Kitchen ──────────────────────────────────────────────────────── */}
      {tab === "kitchen" && isAFL && (() => {
        if (!kitchenSlips || !kitchenSlips.some(s => s.legs.length > 0)) {
          return (
            <div className="bg-surface rounded-xl p-8 border border-border text-center">
              <p className="text-sm text-text-2 mb-1">Not enough data to cook slips yet.</p>
              <p className="text-[10px] text-text-2">Requires at least 3 completed games per team.</p>
            </div>
          );
        }

        // Use pre-computed bookie-specific slips (built from scratch with valid bookie lines)
        const bet365Slips = aflBet365Slips ?? [];
        const dabbleSlips = aflDabbleSlips ?? [];

        const activeSlips =
          bookieTab === "bet365" ? bet365Slips :
          bookieTab === "dabble" ? dabbleSlips :
          kitchenSlips;

        return (
          <div className="space-y-3">
            {/* Bookie selector */}
            <div className="flex items-center gap-1 bg-surface rounded-xl p-1 border border-border">
              {([
                { key: "generic", label: "All Markets", color: "text-text-1" },
                { key: "bet365",  label: "Bet365",      color: "text-[#00A651]" },
                { key: "dabble",  label: "Dabble",      color: "text-[#FF6B35]" },
              ] as const).map(b => (
                <button
                  key={b.key}
                  onClick={() => setBookieTab(b.key)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    bookieTab === b.key
                      ? `bg-surface2 ${b.color}`
                      : "text-text-2 hover:text-text-1"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* Bookie context note */}
            {bookieTab === "bet365" && (
              <div className="px-3 py-2 bg-[#00A651]/5 border border-[#00A651]/20 rounded-lg text-[11px] text-[#00A651]">
                Bet365 SGM: Disposals (10+–35+) · Goals (Anytime / 2+ / 3+) · Marks, Tackles, Kicks, Handballs not available
                <span className="ml-2 text-[#00A651]/60">· Prices shown are Sportsbet market references — verify in Bet365 app</span>
              </div>
            )}
            {bookieTab === "dabble" && (
              <div className="px-3 py-2 bg-[#FF6B35]/5 border border-[#FF6B35]/20 rounded-lg text-[11px] text-[#FF6B35]">
                Dabble SGM: Disposals (15+–30+) · Goals (Anytime–5+) · Marks (2+–12+) · Tackles (2+–11+) · Kicks (5+–26+) · Handballs (4+–25+)
                <span className="ml-2 text-[#FF6B35]/60">· Prices shown are Sportsbet market references — verify in Dabble app</span>
              </div>
            )}

            <AFLKitchen
              slips={activeSlips}
              boxScore={boxScore}
              isUpcoming={game.status === "upcoming"}
              onPlayerClick={handleKitchenPlayerClick}
              bookie={bookieTab}
              hasRealOdds={aflHasRealOdds ?? false}
            />
          </div>
        );
      })()}

      {/* AFL kitchen player drawer */}
      {isAFL && (aflKitchenLoading || aflKitchenDrawer) && (
        <>
          <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" onClick={() => { setAflKitchenDrawer(null); setAflKitchenLoading(false); }} />
          {aflKitchenLoading && (
            <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-xl bg-bg border-l border-primary/20 flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-xs font-bold text-text-2 uppercase tracking-widest">Loading Intel…</p>
              </div>
            </div>
          )}
          {aflKitchenDrawer && !aflKitchenLoading && (
            <PlayerDrawer data={aflKitchenDrawer} onClose={() => setAflKitchenDrawer(null)} />
          )}
        </>
      )}
      {tab === "kitchen" && isBasketball && (
        nbaKitchenSlips && nbaKitchenSlips.some(s => s.legs.length > 0)
          ? <NBAKitchen slips={nbaKitchenSlips} boxScore={boxScore} />
          : <div className="bg-surface rounded-xl p-8 border border-border text-center">
              <p className="text-sm text-text-2 mb-1">Not enough data to cook slips yet.</p>
              <p className="text-[10px] text-text-2">Requires at least 3 completed games per team.</p>
            </div>
      )}
      {tab === "kitchen" && isSoccer && (() => {
        const bet365SoccerSlips = effectiveSoccerKitchenSlips
          ? filterSoccerSlipsForBookie(effectiveSoccerKitchenSlips, SOCCER_BOOKIES.bet365)
          : [];
        const dabbleSoccerSlips = effectiveSoccerKitchenSlips
          ? filterSoccerSlipsForBookie(effectiveSoccerKitchenSlips, SOCCER_BOOKIES.dabble)
          : [];
        const activeSoccerSlips =
          soccerBookieTab === "bet365" ? bet365SoccerSlips :
          soccerBookieTab === "dabble" ? dabbleSoccerSlips :
          (effectiveSoccerKitchenSlips ?? []);
        const hasLegs = activeSoccerSlips.some(s => s.legs.length > 0);
        return (
          <>
            {/* Bookie tab selector */}
            {effectiveSoccerKitchenSlips && effectiveSoccerKitchenSlips.some(s => s.legs.length > 0) && (
              <div className="flex items-center gap-2 mb-4 px-1">
                <span className="text-[10px] text-text-2 uppercase tracking-widest font-bold mr-1">Bookie</span>
                {([
                  { key: "generic", label: "All Markets", activeClass: "bg-primary/20 border-primary/40 text-primary" },
                  { key: "bet365",  label: "Bet365",      activeClass: "bg-[#00A651]/20 border-[#00A651]/50 text-[#00A651]" },
                  { key: "dabble",  label: "Dabble",      activeClass: "bg-[#FF6B35]/20 border-[#FF6B35]/50 text-[#FF6B35]" },
                ] as const).map(b => (
                  <button
                    key={b.key}
                    onClick={() => setSoccerBookieTab(b.key)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                      soccerBookieTab === b.key
                        ? b.activeClass
                        : "bg-surface border-border text-text-2 hover:text-text-1"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
                {soccerBookieTab !== "generic" && (
                  <span className="ml-auto text-[9px] text-text-2">
                    SGM: Goals · Assists · SOT · Shots · Cards · Team Goals · Corners
                  </span>
                )}
              </div>
            )}
            {hasLegs
              ? <SoccerKitchen slips={activeSoccerSlips} onPlayerClick={onSoccerKitchenClick} />
              : <div className="bg-surface rounded-xl p-8 border border-border text-center">
                  <p className="text-sm text-text-2 mb-1">
                    {soccerBookieTab !== "generic" ? `No ${soccerBookieTab === "bet365" ? "Bet365" : "Dabble"}-eligible legs found.` : "Not enough data to cook slips yet."}
                  </p>
                  <p className="text-[10px] text-text-2">
                    {soccerBookieTab !== "generic"
                      ? "Tackles, fouls, and saves aren't available on this bookie's SGM."
                      : "Requires lineup data and at least 3 recent games per player."}
                  </p>
                </div>
            }
          </>
        );
      })()}

      {/* ── Overlays ─────────────────────────────────────────────────────── */}
      {isAFL && (aflKitchenLoading || aflKitchenDrawer) && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" onClick={() => { setAflKitchenDrawer(null); setAflKitchenLoading(false); }} />
          {aflKitchenLoading && (
            <div className="relative z-[70] w-full max-w-2xl bg-[#0B0F1A] flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-text-2 uppercase tracking-widest">Cooking Analytics...</span>
              </div>
            </div>
          )}
          {aflKitchenDrawer && !aflKitchenLoading && (
            <PlayerDrawer data={aflKitchenDrawer} onClose={() => setAflKitchenDrawer(null)} />
          )}
        </div>
      )}

      {isSoccer && (soccerKitchenLoading || soccerKitchenDrawer || soccerPlayer) && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" onClick={() => { setSoccerKitchenDrawer(null); setSoccerKitchenLoading(false); setSoccerPlayer(null); }} />
          {soccerKitchenLoading && (
            <div className="relative z-[70] w-full max-w-2xl bg-[#0B0F1A] flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-text-2 uppercase tracking-widest">Cooking Analytics...</span>
              </div>
            </div>
          )}
          
          {(soccerKitchenDrawer || soccerPlayer) && !soccerKitchenLoading && (
            <SoccerPlayerDrawer
              data={soccerKitchenDrawer}
              player={soccerPlayer?.player}
              teamName={soccerPlayer?.teamName}
              espnSrc={soccerPlayer?.espnSrc}
              fotmobId={soccerPlayer?.fotmobId}
              espnHistory={soccerPlayer?.espnHistory}
              tournamentId={sofascore?.tournamentId}
              opponentTeamId={soccerPlayer?.side === "home" ? sofascore?.awayTeamId : sofascore?.homeTeamId}
              onClose={() => { setSoccerKitchenDrawer(null); setSoccerPlayer(null); }}
            />
          )}
        </div>
      )}
    </>
  );
}
