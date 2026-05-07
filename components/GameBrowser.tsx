/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Game, Sport } from "@/lib/types";
import { formatKickoff } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SportFilter = "all" | "live" | "soccer" | "basketball" | "afl";
type ViewTab = "today" | "upcoming" | "results";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOCCER = new Set<Sport>(["soccer", "ucl", "uel", "laliga", "bundesliga", "aleague"]);

const LEAGUE_NAME: Partial<Record<Sport, string>> = {
  soccer:     "Premier League",
  ucl:        "Champions League",
  uel:        "Europa League",
  laliga:     "La Liga",
  bundesliga: "Bundesliga",
  aleague:    "A-League",
  basketball: "NBA",
  nfl:        "NFL",
  afl:        "AFL",
};

const LEAGUE_LOGO: Partial<Record<Sport, string>> = {
  soccer:     "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  ucl:        "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  uel:        "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png",
  laliga:     "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  bundesliga: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  aleague:    "https://a.espncdn.com/i/leaguelogos/soccer/500/1308.png",
  basketball: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  nfl:        "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  afl:        "https://a.espncdn.com/i/teamlogos/leagues/500/afl.png",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sportGroup(s: Sport): SportFilter {
  return SOCCER.has(s) ? "soccer" : (s as SportFilter);
}

function liveTime(g: Game): string {
  const m = g.liveMinute;
  if (m == null) return "LIVE";
  if (g.sport === "basketball") return `Q${Math.min(4, Math.ceil(m / 12) || 1)}`;
  if (g.sport === "afl")        return `Q${Math.min(4, Math.ceil(m / 20) || 1)} ${m % 20}'`;
  return `${m}'`;
}

function groupBySport(list: Game[]): [Sport, Game[]][] {
  const m = new Map<Sport, Game[]>();
  for (const g of list) {
    const arr = m.get(g.sport) ?? [];
    arr.push(g);
    m.set(g.sport, arr);
  }
  return Array.from(m.entries());
}

function dateLabel(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GameBrowser({
  games,
  initialView = "today",
}: {
  games: Game[];
  initialView?: string;
}) {
  const resolvedView = (["today", "upcoming", "results"].includes(initialView) ? initialView : "today") as ViewTab;
  const [filter, setFilter] = useState<SportFilter>("all");
  const [tab, setTab]       = useState<ViewTab>(resolvedView);

  const live     = useMemo(() => games.filter(g => g.status === "live"),    [games]);
  const upcoming = useMemo(() => games.filter(g => g.status === "upcoming"), [games]);
  const finished = useMemo(() => games.filter(g => g.status === "finished"), [games]);
  const liveCount = live.length;

  // Apply sport filter
  const applyFilter = (list: Game[]) =>
    filter === "all"  ? list :
    filter === "live" ? list.filter(g => g.status === "live") :
    list.filter(g => sportGroup(g.sport) === filter);

  const visibleLive     = applyFilter(live);
  const visibleUpcoming = applyFilter(upcoming);
  const visibleFinished = applyFilter(finished);

  const nowMs      = Date.now();
  const todayUpcoming = visibleUpcoming.filter(g => new Date(g.kickoff).getTime() - nowMs < 86_400_000);
  const todayAll   = [...visibleLive, ...todayUpcoming];

  const availableFilters: { key: SportFilter; label: string }[] = [
    { key: "all",        label: "All" },
    { key: "live",       label: `Live${liveCount > 0 ? ` ${liveCount}` : ""}` },
    { key: "soccer",     label: "Soccer" },
    { key: "basketball", label: "NBA" },
    { key: "afl",        label: "AFL" },
  ].filter(f =>
    f.key === "all" ||
    f.key === "live" ||
    games.some(g => sportGroup(g.sport) === f.key)
  ) as { key: SportFilter; label: string }[];

  // Use multi-column when showing "All" sports
  const useColumns = filter === "all";

  return (
    <div className="flex flex-col h-full">

      {/* ── Live Now banner (only when games are actually live) ──────── */}
      {liveCount > 0 && (filter === "all" || filter === "live") && (
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#6B7280]">Live Now</span>
            <span className="text-[11px] text-[#374151]">({liveCount})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mb-4">
            {live.map(g => <LiveCard key={g.id} game={g} />)}
          </div>
        </div>
      )}

      {/* ── Controls bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        {/* Sport filters */}
        <div className="flex items-center gap-0.5">
          {availableFilters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filter === f.key
                  ? f.key === "live"
                    ? "text-red-400 bg-red-500/10"
                    : "text-white bg-white/10"
                  : "text-[#6B7280] hover:text-[#9CA3AF]"
              }`}
            >
              {f.key === "live" && liveCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
              {f.label}
            </button>
          ))}
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-0.5">
          {(["today", "upcoming", "results"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium transition-all rounded-md ${
                tab === t ? "text-white bg-white/10" : "text-[#6B7280] hover:text-[#9CA3AF]"
              }`}
            >
              {t === "today" ? "Today" : t === "upcoming" ? "Upcoming" : "Results"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto border-t border-white/[0.03]">
        {tab === "today" && (
          todayAll.length > 0
            ? useColumns
              ? <SportsColumns games={todayAll} />
              : <LeagueList groups={groupBySport(todayAll)} />
            : <Empty msg="No games scheduled for today." />
        )}
        {tab === "upcoming" && (
          visibleUpcoming.length > 0
            ? useColumns
              ? <SportsColumns games={visibleUpcoming} />
              : <LeagueList groups={groupBySport(visibleUpcoming)} />
            : <Empty msg="No upcoming games." />
        )}
        {tab === "results" && (
          visibleFinished.length > 0
            ? <ResultsByDate games={visibleFinished} />
            : <Empty msg="No recent results." />
        )}
      </div>
    </div>
  );
}

// ─── Sport Columns (desktop multi-column) ─────────────────────────────────────

function SportsColumns({ games }: { games: Game[] }) {
  const soccerGames = games.filter(g => SOCCER.has(g.sport));
  const nbaGames    = games.filter(g => g.sport === "basketball");
  const aflGames    = games.filter(g => g.sport === "afl");

  const cols = [
    { key: "soccer",  label: "Soccer", logo: LEAGUE_LOGO.soccer!,     games: soccerGames },
    { key: "nba",     label: "NBA",    logo: LEAGUE_LOGO.basketball!,  games: nbaGames },
    { key: "afl",     label: "AFL",    logo: LEAGUE_LOGO.afl!,         games: aflGames },
  ].filter(c => c.games.length > 0);

  if (cols.length < 2) {
    // Only one sport: fallback to full-width stacked
    return <LeagueList groups={groupBySport(games)} />;
  }

  const gridClass = cols.length === 3
    ? "lg:grid-cols-3"
    : "lg:grid-cols-2";

  return (
    <div className={`grid grid-cols-1 ${gridClass} divide-y lg:divide-y-0 lg:divide-x divide-white/[0.04]`}>
      {cols.map(col => (
        <div key={col.key} className="min-w-0">
          {/* Column header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.015]">
            {col.logo && (
              <img src={col.logo} alt="" className="w-4 h-4 object-contain opacity-50" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">
              {col.label}
            </span>
          </div>

          {/* Soccer: sub-grouped by league */}
          {col.key === "soccer"
            ? groupBySport(col.games).map(([sport, gs]) => (
                <div key={sport}>
                  {/* Sub-league header (for non-EPL leagues) */}
                  {sport !== "soccer" && (
                    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-white/[0.01] border-b border-white/[0.03]">
                      {LEAGUE_LOGO[sport] && (
                        <img src={LEAGUE_LOGO[sport]} alt="" className="w-3 h-3 object-contain opacity-40" />
                      )}
                      <span className="text-[9px] font-semibold uppercase tracking-widest text-[#374151]">
                        {LEAGUE_NAME[sport]}
                      </span>
                    </div>
                  )}
                  {gs.map(g => <GameRow key={g.id} game={g} compact />)}
                </div>
              ))
            : col.games.map(g => <GameRow key={g.id} game={g} compact />)
          }
        </div>
      ))}
    </div>
  );
}

// ─── League List (single column fallback / filtered view) ────────────────────

function LeagueList({ groups }: { groups: [Sport, Game[]][] }) {
  return (
    <div>
      {groups.map(([sport, gs]) => (
        <div key={sport} className="border-b border-white/[0.04] last:border-0">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.015]">
            {LEAGUE_LOGO[sport] && (
              <img src={LEAGUE_LOGO[sport]} alt="" className="w-4 h-4 object-contain opacity-50" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">
              {LEAGUE_NAME[sport]}
            </span>
          </div>
          {gs.map(g => <GameRow key={g.id} game={g} />)}
        </div>
      ))}
    </div>
  );
}

// ─── Game Row ─────────────────────────────────────────────────────────────────

function GameRow({ game, compact }: { game: Game; compact?: boolean }) {
  const { homeTeam, awayTeam, status, kickoff, score } = game;
  const isLive  = status === "live";
  const homeWin = score && score.home > score.away;
  const awayWin = score && score.away > score.home;
  const px      = compact ? "px-3" : "px-4";

  return (
    <Link
      href={`/game/${game.id}`}
      className={`flex items-center gap-2 ${px} py-2.5 hover:bg-white/[0.03] transition-colors group border-b border-white/[0.025] last:border-0`}
    >
      {/* Time */}
      <div className="w-9 shrink-0 text-right">
        {isLive ? (
          <span className="text-[10px] font-bold text-red-400">{liveTime(game)}</span>
        ) : (
          <span className="text-[10px] text-[#4B5563]">{formatKickoff(kickoff)}</span>
        )}
      </div>

      {/* Home team */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {homeTeam.logoUrl
          ? <img src={homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0 opacity-90" />
          : <span className="text-[11px] shrink-0">{homeTeam.logo}</span>}
        <span className={`text-[13px] truncate leading-tight ${
          isLive && homeWin ? "text-white font-semibold" :
          isLive ? "text-[#6B7280]" : "text-[#D1D5DB]"
        }`}>{homeTeam.name}</span>
      </div>

      {/* Score */}
      <div className="w-12 text-center shrink-0">
        {score ? (
          <span className={`text-[13px] font-bold tabular-nums ${isLive ? "text-red-400" : "text-white"}`}>
            {score.home}–{score.away}
          </span>
        ) : (
          <span className="text-[11px] text-[#374151]">vs</span>
        )}
      </div>

      {/* Away team */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className={`text-[13px] truncate text-right leading-tight ${
          isLive && awayWin ? "text-white font-semibold" :
          isLive ? "text-[#6B7280]" : "text-[#D1D5DB]"
        }`}>{awayTeam.name}</span>
        {awayTeam.logoUrl
          ? <img src={awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0 opacity-90" />
          : <span className="text-[11px] shrink-0">{awayTeam.logo}</span>}
      </div>

      {/* Form dots (hidden in compact) */}
      {!compact && (
        <div className="hidden sm:flex items-center gap-[3px] shrink-0 ml-1">
          {homeTeam.form.slice(0, 5).map((r, i) => (
            <span key={i} className={`w-[4px] h-[4px] rounded-full ${
              r === "W" ? "bg-[#22C55E]/70" : r === "L" ? "bg-[#EF4444]/70" : "bg-[#F59E0B]/70"
            }`} />
          ))}
        </div>
      )}

      <span className="text-[#1e3a5f] group-hover:text-[#6B7280] text-xs shrink-0 transition-colors">›</span>
    </Link>
  );
}

// ─── Live Card ────────────────────────────────────────────────────────────────

function LiveCard({ game }: { game: Game }) {
  const { homeTeam, awayTeam, score, sport } = game;
  const total = (score?.home ?? 0) + (score?.away ?? 0);
  const pct   = total > 0 ? Math.round(((score?.home ?? 0) / total) * 100) : 50;

  return (
    <Link
      href={`/game/${game.id}`}
      className="bg-[#111827] rounded-xl p-3.5 border border-white/5 hover:border-red-500/20 hover:bg-[#14202e] transition-all block"
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          {LEAGUE_LOGO[sport] && (
            <img src={LEAGUE_LOGO[sport]} alt="" className="w-3 h-3 object-contain opacity-60" />
          )}
          <span className="text-[10px] text-[#6B7280]">{LEAGUE_NAME[sport]}</span>
        </div>
        <span className="text-[10px] font-bold text-red-400 tracking-wide">{liveTime(game)}</span>
      </div>

      <div className="space-y-1.5">
        {[{ team: homeTeam, s: score?.home }, { team: awayTeam, s: score?.away }].map(({ team, s }) => (
          <div key={team.name} className="flex items-center gap-2">
            {team.logoUrl
              ? <img src={team.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
              : <span className="text-base shrink-0">{team.logo}</span>}
            <span className="text-[13px] text-white flex-1 truncate">{team.name}</span>
            <span className="text-lg font-black text-white tabular-nums">{s ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 h-[2px] bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-[#3B82F6]/50 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

// ─── Results (grouped by date) ────────────────────────────────────────────────

function ResultsByDate({ games }: { games: Game[] }) {
  const byDate = new Map<string, Game[]>();
  for (const g of games) {
    const d   = g.kickoff.slice(0, 10);
    const arr = byDate.get(d) ?? [];
    arr.push(g);
    byDate.set(d, arr);
  }
  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => (a < b ? 1 : -1));

  return (
    <div>
      {sorted.map(([date, gs]) => (
        <div key={date} className="border-b border-white/[0.04] last:border-0">
          <div className="px-4 py-2 bg-white/[0.015]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">
              {dateLabel(date)}
            </span>
          </div>
          {gs.map(g => <ResultRow key={g.id} game={g} />)}
        </div>
      ))}
    </div>
  );
}

function ResultRow({ game }: { game: Game }) {
  const { homeTeam, awayTeam, score, sport } = game;
  const homeWon = score && score.home > score.away;
  const awayWon = score && score.away > score.home;

  return (
    <Link
      href={`/game/${game.id}`}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group border-b border-white/[0.025] last:border-0"
    >
      {/* League icon */}
      <div className="w-4 shrink-0">
        {LEAGUE_LOGO[sport] && (
          <img src={LEAGUE_LOGO[sport]} alt="" className="w-4 h-4 object-contain opacity-30" />
        )}
      </div>

      {/* Home */}
      <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${!homeWon ? "opacity-50" : ""}`}>
        {homeTeam.logoUrl
          ? <img src={homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
          : <span className="text-xs">{homeTeam.logo}</span>}
        <span className={`text-[13px] truncate ${homeWon ? "text-white font-medium" : "text-[#6B7280]"}`}>
          {homeTeam.name}
        </span>
      </div>

      {/* Score */}
      <div className="w-14 text-center shrink-0">
        <span className="text-[13px] font-bold text-white tabular-nums">
          {score ? `${score.home}–${score.away}` : "—"}
        </span>
      </div>

      {/* Away */}
      <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-end ${!awayWon ? "opacity-50" : ""}`}>
        <span className={`text-[13px] truncate text-right ${awayWon ? "text-white font-medium" : "text-[#6B7280]"}`}>
          {awayTeam.name}
        </span>
        {awayTeam.logoUrl
          ? <img src={awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
          : <span className="text-xs">{awayTeam.logo}</span>}
      </div>

      <span className="text-[10px] text-[#374151] shrink-0 font-medium">FT</span>
      <span className="text-[#1e3a5f] group-hover:text-[#6B7280] text-xs shrink-0 transition-colors">›</span>
    </Link>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-2xl mb-3 opacity-20">◉</div>
      <div className="text-sm text-[#374151]">{msg}</div>
    </div>
  );
}
