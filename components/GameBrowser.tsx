/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Game, Sport } from "@/lib/types";
import { formatKickoff } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

type SportFilter = "all" | "soccer" | "basketball" | "afl";

const SOCCER = new Set<Sport>(["soccer", "ucl", "uel", "laliga", "bundesliga", "aleague"]);

const LEAGUE_NAME: Partial<Record<Sport, string>> = {
  soccer: "Premier League", ucl: "Champions League", uel: "Europa League",
  laliga: "La Liga", bundesliga: "Bundesliga", aleague: "A-League",
  basketball: "NBA", afl: "AFL",
};

const LEAGUE_LOGO: Partial<Record<Sport, string>> = {
  soccer:     "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  ucl:        "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  uel:        "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png",
  laliga:     "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  bundesliga: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  aleague:    "https://a.espncdn.com/i/leaguelogos/soccer/500/1308.png",
  basketball: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  afl:        "https://a.espncdn.com/i/teamlogos/leagues/500/afl.png",
};

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

function uniqueLeagueCount(games: Game[]): number {
  const sports = new Set<string>();
  for (const g of games) {
    sports.add(SOCCER.has(g.sport) ? "soccer" : g.sport);
  }
  return sports.size;
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────

function MiniSparkline({ game }: { game: Game }) {
  const { lineScores, score } = game;

  if (!lineScores || lineScores.home.length === 0) {
    const total = (score?.home ?? 0) + (score?.away ?? 0);
    const pct = total > 0 ? Math.round(((score?.home ?? 0) / total) * 100) : 50;
    return (
      <div className="mt-3 flex items-center gap-1">
        <span className="text-[9px] text-primary/80 font-mono w-5 shrink-0">{pct}%</span>
        <div className="flex-1 h-[3px] bg-border rounded-full overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[9px] text-text-2/60 font-mono w-5 shrink-0 text-right">{100 - pct}%</span>
      </div>
    );
  }

  let hR = 0, aR = 0;
  const pts: { h: number; a: number }[] = [{ h: 0, a: 0 }];
  for (let i = 0; i < lineScores.home.length; i++) {
    hR += lineScores.home[i] ?? 0;
    aR += lineScores.away[i] ?? 0;
    pts.push({ h: hR, a: aR });
  }

  const W = 100, H = 28;
  const xStep = W / Math.max(pts.length - 1, 1);
  const maxVal = Math.max(...pts.map(p => Math.max(p.h, p.a)), 1);
  const toPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${(i * xStep).toFixed(1)},${(H - 2 - ((v / maxVal) * (H - 4))).toFixed(1)}`).join(" ");

  const homePath = toPath(pts.map(p => p.h));
  const awayPath = toPath(pts.map(p => p.a));
  const homeAhead = (score?.home ?? 0) >= (score?.away ?? 0);

  return (
    <div className="mt-3">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
        <path d={homePath} fill="none" stroke={homeAhead ? "#22C55E" : "#9CA3AF"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d={awayPath} fill="none" stroke={homeAhead ? "#9CA3AF" : "#EF4444"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      </svg>
    </div>
  );
}

// ─── Live Card (hero cards in Live Now section) ───────────────────────────────

function LiveCard({ game }: { game: Game }) {
  const { homeTeam, awayTeam, score, sport } = game;
  const homeAhead = (score?.home ?? 0) > (score?.away ?? 0);
  const awayAhead = (score?.away ?? 0) > (score?.home ?? 0);

  return (
    <Link
      href={`/game/${game.id}`}
      className="group relative flex flex-col bg-surface rounded-2xl p-4 border border-border hover:border-primary/40 hover:shadow-live transition-all duration-200 w-[220px] shrink-0 overflow-hidden"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {LEAGUE_LOGO[sport] && (
            <img src={LEAGUE_LOGO[sport]} alt="" className="w-3.5 h-3.5 object-contain opacity-70" />
          )}
          <span className="text-[10px] text-text-2 font-medium">{LEAGUE_NAME[sport]}</span>
        </div>
        <div className="flex items-center gap-1 bg-red-500/10 rounded-full px-1.5 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-[9px] font-bold text-red-400 tracking-wide">{liveTime(game)}</span>
        </div>
      </div>

      <div className="space-y-2.5 flex-1">
        {([
          { team: homeTeam, s: score?.home, ahead: homeAhead },
          { team: awayTeam, s: score?.away, ahead: awayAhead },
        ] as const).map(({ team, s, ahead }) => (
          <div key={team.name} className="flex items-center gap-2.5">
            {team.logoUrl
              ? <img src={team.logoUrl} alt="" className="w-7 h-7 object-contain shrink-0" />
              : <span className="text-xl shrink-0">{team.logo}</span>}
            <span className={`text-sm flex-1 truncate font-medium transition-colors ${ahead ? "text-text-1" : "text-text-2"}`}>
              {team.shortName || team.name}
            </span>
            <span className={`text-xl font-black tabular-nums tracking-tight ${
              ahead ? "text-text-1" : "text-text-2"
            }`}>{s ?? 0}</span>
          </div>
        ))}
      </div>

      <MiniSparkline game={game} />
    </Link>
  );
}

// ─── Upcoming Row (compact table row) ─────────────────────────────────────────

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(kickoff: string) {
  const [label, setLabel] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(kickoff).getTime() - Date.now();
      if (diff <= 0) { setLabel("Starting soon"); setUrgent(true); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setUrgent(diff < 3_600_000); // urgent when < 1h
      if (h > 0) setLabel(`${h}h ${String(m).padStart(2, "0")}m`);
      else        setLabel(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [kickoff]);

  return { label, urgent };
}

// ─── Upcoming Row (used in full Upcoming tab) ─────────────────────────────────

function UpcomingRow({ game }: { game: Game }) {
  const { homeTeam, awayTeam, kickoff, sport } = game;
  const { label, urgent } = useCountdown(kickoff);

  return (
    <Link
      href={`/game/${game.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface2 transition-colors group border-b border-border last:border-0"
    >
      <div className="w-4 shrink-0">
        {LEAGUE_LOGO[sport] && (
          <img src={LEAGUE_LOGO[sport]} alt="" className="w-4 h-4 object-contain opacity-50" />
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {homeTeam.logoUrl
          ? <img src={homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
          : <span className="text-xs">{homeTeam.logo}</span>}
        <span className="text-sm text-text-1 truncate">{homeTeam.name}</span>
      </div>
      <span className="text-xs text-text-2 shrink-0">vs</span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className="text-sm text-text-1 truncate text-right">{awayTeam.name}</span>
        {awayTeam.logoUrl
          ? <img src={awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
          : <span className="text-xs">{awayTeam.logo}</span>}
      </div>
      <span className={`text-xs tabular-nums shrink-0 w-16 text-right font-mono font-medium ${urgent ? "text-primary" : "text-text-2"}`}>
        {label || formatKickoff(kickoff)}
      </span>
    </Link>
  );
}

// ─── Starting Soon: sport-column game card ────────────────────────────────────

function SportGameCard({ game }: { game: Game }) {
  const { homeTeam, awayTeam, kickoff } = game;
  const { label, urgent } = useCountdown(kickoff);

  return (
    <Link
      href={`/game/${game.id}`}
      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface2 transition-colors group border-b border-border last:border-0"
    >
      {/* Teams */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          {homeTeam.logoUrl
            ? <img src={homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
            : <span className="text-xs shrink-0">{homeTeam.logo}</span>}
          <span className="text-xs text-text-1 font-medium truncate">{homeTeam.shortName || homeTeam.name.split(" ").pop()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {awayTeam.logoUrl
            ? <img src={awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
            : <span className="text-xs shrink-0">{awayTeam.logo}</span>}
          <span className="text-xs text-text-2 truncate">{awayTeam.shortName || awayTeam.name.split(" ").pop()}</span>
        </div>
      </div>
      {/* Countdown */}
      <div className="text-right shrink-0">
        <div className={`text-xs font-mono font-bold tabular-nums ${urgent ? "text-primary" : "text-text-2"}`}>
          {label || formatKickoff(kickoff)}
        </div>
        {!urgent && (
          <div className="text-[9px] text-text-2/60 mt-0.5">{formatKickoff(kickoff)}</div>
        )}
      </div>
    </Link>
  );
}

// ─── Starting Soon: sport-grouped columns ─────────────────────────────────────

const SPORT_COLUMNS: { key: SportFilter; label: string; sport: Sport }[] = [
  { key: "afl",        label: "AFL",    sport: "afl"        },
  { key: "basketball", label: "NBA",    sport: "basketball" },
  { key: "soccer",     label: "Soccer", sport: "soccer"     },
];

function nextGameDay(allUpcoming: Game[], col: typeof SPORT_COLUMNS[number]): string | null {
  const matches = allUpcoming
    .filter(g => col.key === "soccer" ? SOCCER.has(g.sport) : g.sport === col.sport)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  if (matches.length === 0) return null;
  return new Date(matches[0].kickoff).toLocaleDateString("en-AU", { weekday: "long" });
}

function StartingSoonColumns({ games, allUpcoming }: { games: Game[]; allUpcoming: Game[] }) {
  const cols = SPORT_COLUMNS.map(col => ({
    ...col,
    games: games.filter(g =>
      col.key === "soccer" ? SOCCER.has(g.sport) : g.sport === col.sport
    ),
    nextDay: null as string | null,
  }));

  // Fill in nextDay for empty columns
  for (const col of cols) {
    if (col.games.length === 0) col.nextDay = nextGameDay(allUpcoming, col);
  }

  const activeCols = cols.filter(c => c.games.length > 0);

  if (activeCols.length === 0 && cols.every(c => c.nextDay === null)) return (
    <div className="px-4 py-6 text-center text-sm text-text-2">No upcoming games scheduled.</div>
  );

  // Single sport with games: full-width flat list + empty placeholders below
  if (activeCols.length === 1 && cols.filter(c => c.nextDay !== null).length === 0) {
    return <>{activeCols[0].games.map(g => <SportGameCard key={g.id} game={g} />)}</>;
  }

  return (
    <div className="grid divide-x divide-border" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
      {cols.map(col => (
        <div key={col.key} className="min-w-0">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-surface2/50">
            {LEAGUE_LOGO[col.sport] && (
              <img src={LEAGUE_LOGO[col.sport]} alt="" className="w-3.5 h-3.5 object-contain opacity-70" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-2">{col.label}</span>
            <span className="ml-auto text-[9px] text-text-2/60">{col.games.length || ""}</span>
          </div>
          {col.games.length > 0
            ? col.games.map(g => <SportGameCard key={g.id} game={g} />)
            : (
              <div className="px-3 py-5 flex flex-col items-center justify-center gap-1 text-center">
                <span className="text-text-2/40 text-xl">—</span>
                <span className="text-xs text-text-2/50">No matches today</span>
                {col.nextDay && (
                  <span className="text-[10px] font-semibold text-primary/70 mt-0.5">Next: {col.nextDay}</span>
                )}
              </div>
            )
          }
        </div>
      ))}
    </div>
  );
}

// ─── Result Row ────────────────────────────────────────────────────────────────

function ResultRow({ game }: { game: Game }) {
  const { homeTeam, awayTeam, score, sport } = game;
  const homeWon = score && score.home > score.away;
  const awayWon = score && score.away > score.home;

  return (
    <Link
      href={`/game/${game.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface2 transition-colors group border-b border-border last:border-0"
    >
      <div className="w-4 shrink-0">
        {LEAGUE_LOGO[sport] && (
          <img src={LEAGUE_LOGO[sport]} alt="" className="w-4 h-4 object-contain opacity-40" />
        )}
      </div>
      <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${!homeWon ? "opacity-50" : ""}`}>
        {homeTeam.logoUrl
          ? <img src={homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
          : <span className="text-xs">{homeTeam.logo}</span>}
        <span className={`text-sm truncate ${homeWon ? "text-text-1 font-semibold" : "text-text-2"}`}>{homeTeam.name}</span>
      </div>
      <div className="w-16 text-center shrink-0">
        <span className="text-sm font-bold text-text-1 tabular-nums">{score ? `${score.home}–${score.away}` : "—"}</span>
        <div className="text-[9px] text-text-2 mt-0.5">FT</div>
      </div>
      <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-end ${!awayWon ? "opacity-50" : ""}`}>
        <span className={`text-sm truncate text-right ${awayWon ? "text-text-1 font-semibold" : "text-text-2"}`}>{awayTeam.name}</span>
        {awayTeam.logoUrl
          ? <img src={awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
          : <span className="text-xs">{awayTeam.logo}</span>}
      </div>
    </Link>
  );
}

// ─── Results grouped by date ───────────────────────────────────────────────────

function ResultsByDate({ games }: { games: Game[] }) {
  const byDate = new Map<string, Game[]>();
  for (const g of games) {
    const d = g.kickoff.slice(0, 10);
    const arr = byDate.get(d) ?? [];
    arr.push(g);
    byDate.set(d, arr);
  }
  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  return (
    <div className="space-y-3 p-4">
      {sorted.map(([date, gs]) => (
        <div key={date} className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-surface2 border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-text-2">
              {new Date(date + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
            </span>
          </div>
          {gs.map(g => <ResultRow key={g.id} game={g} />)}
        </div>
      ))}
    </div>
  );
}

// ─── Stat Summary Card ─────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent }: {
  icon: string; label: string; value: number | string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-2xl border ${accent ? "border-primary/30" : "border-border"} px-4 py-3 flex items-center gap-3 min-w-[130px]`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${
        accent ? "bg-primary/15 text-primary" : "bg-surface2 text-text-2"
      }`}>{icon}</div>
      <div>
        <div className="text-xs text-text-2 font-medium leading-tight">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-xl font-black tabular-nums leading-tight ${accent ? "text-primary" : "text-text-1"}`}>{value}</span>
          {sub && <span className="text-[10px] text-text-2">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── League Row for "Popular Leagues" ─────────────────────────────────────────

function LeagueSummaryRow({ sport, liveCount, upcomingCount }: {
  sport: Sport; liveCount: number; upcomingCount: number;
}) {
  return (
    <Link
      href={`/?sport=${SOCCER.has(sport) ? "soccer" : sport}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface2 transition-colors group border-b border-border last:border-0"
    >
      <div className="w-7 h-7 bg-surface2 rounded-lg flex items-center justify-center shrink-0">
        {LEAGUE_LOGO[sport]
          ? <img src={LEAGUE_LOGO[sport]} alt="" className="w-4 h-4 object-contain" />
          : <span className="text-xs">⚽</span>}
      </div>
      <span className="text-sm text-text-1 font-medium flex-1">{LEAGUE_NAME[sport] ?? sport}</span>
      <div className="flex items-center gap-2">
        {liveCount > 0 && (
          <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 rounded-full px-2 py-0.5">
            {liveCount} live
          </span>
        )}
        {upcomingCount > 0 && (
          <span className="text-[10px] text-text-2 bg-surface2 rounded-full px-2 py-0.5">
            {upcomingCount} upcoming
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GameBrowser({
  games,
  initialView = "today",
}: {
  games: Game[];
  initialView?: string;
}) {
  type ViewTab = "today" | "upcoming" | "results";
  const resolvedView = (["today", "upcoming", "results"].includes(initialView) ? initialView : "today") as ViewTab;
  const [tab, setTab] = useState<ViewTab>(resolvedView);
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");

  const live     = useMemo(() => games.filter(g => g.status === "live"), [games]);
  const upcoming = useMemo(() => games.filter(g => g.status === "upcoming"), [games]);
  const finished = useMemo(() => games.filter(g => g.status === "finished"), [games]);

  const nowMs = Date.now();
  const next24h = upcoming.filter(g => new Date(g.kickoff).getTime() - nowMs < 86_400_000);

  const leagueSummaries = useMemo(() => {
    const sportList: Sport[] = ["afl", "basketball", "soccer", "ucl", "uel", "laliga", "bundesliga", "aleague"];
    return sportList
      .map(s => ({
        sport: s,
        liveCount:     live.filter(g => g.sport === s).length,
        upcomingCount: upcoming.filter(g => g.sport === s).length,
      }))
      .filter(r => r.liveCount + r.upcomingCount > 0);
  }, [live, upcoming]);

  const filterBySport = (list: Game[]) =>
    sportFilter === "all" ? list : list.filter(g => sportGroup(g.sport) === sportFilter);

  const filteredLive     = filterBySport(live);
  const filteredUpcoming = filterBySport(upcoming);
  const filteredFinished = filterBySport(finished);
  const filteredNext24h  = filterBySport(next24h);

  const leagueCount = uniqueLeagueCount([...live, ...upcoming]);
  const hotPropsCount = live.length + next24h.filter(g => g.sport === "afl" || g.sport === "basketball").length;

  const sportFilters = ([
    { key: "all" as SportFilter,        label: "All Sports" },
    { key: "afl" as SportFilter,        label: "AFL" },
    { key: "basketball" as SportFilter, label: "NBA" },
    { key: "soccer" as SportFilter,     label: "Soccer" },
  ] satisfies { key: SportFilter; label: string }[]).filter(
    f => f.key === "all" || games.some(g => sportGroup(g.sport) === f.key)
  );

  return (
    <div className="min-h-full bg-bg">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-text-1 leading-tight">Time to cook a slip 🍛</h2>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1">
            <StatCard icon="📡" label="Live Now" value={live.length} sub="Games" accent={live.length > 0} />
            <StatCard icon="📅" label="Upcoming" value={upcoming.length} sub="Games" />
            <StatCard icon="🏆" label="Leagues" value={leagueCount} sub="Active" />
            <StatCard icon="🔥" label="Hot Props" value={hotPropsCount} sub="Hot right now" />
          </div>
        </div>
      </div>

      {/* ── Tab + Filter bar ──────────────────────────────────────────── */}
      <div className="px-6 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-surface rounded-xl p-1 border border-border">
          {(["today", "upcoming", "results"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                tab === t
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-2 hover:text-text-1"
              }`}
            >
              {t === "today" ? "Today" : t === "upcoming" ? "Upcoming" : "Results"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {sportFilters.map(f => (
            <button
              key={f.key}
              onClick={() => setSportFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${
                sportFilter === f.key
                  ? "bg-surface border-primary/40 text-primary"
                  : "border-transparent text-text-2 hover:text-text-1 hover:bg-surface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "results" ? (
        filteredFinished.length > 0
          ? <ResultsByDate games={filteredFinished} />
          : <Empty msg="No recent results." />
      ) : tab === "upcoming" ? (
        <div className="px-6">
          {filteredUpcoming.length > 0 ? (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              {filteredUpcoming.map(g => <UpcomingRow key={g.id} game={g} />)}
            </div>
          ) : <Empty msg="No upcoming games." />}
        </div>
      ) : (
        <>
          {filteredLive.length > 0 && (
            <section className="px-6 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-black text-text-1 uppercase tracking-wide">Live Now</span>
                  <span className="bg-red-500/15 text-red-400 text-[10px] font-bold rounded-full px-2 py-0.5">
                    {filteredLive.length} Games
                  </span>
                </div>
                <button
                  onClick={() => setTab("results")}
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors flex items-center gap-1"
                >
                  View all live <span>→</span>
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {filteredLive.map(g => <LiveCard key={g.id} game={g} />)}
              </div>
            </section>
          )}

          <div className="px-6 grid grid-cols-1 lg:grid-cols-2 gap-4 pb-6">

            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📅</span>
                  <span className="text-sm font-bold text-text-1">Starting Soon</span>
                  <span className="text-[10px] text-text-2 bg-surface2 rounded-full px-2 py-0.5">Next 24h</span>
                </div>
                <Link href="/?view=upcoming" className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                  View all →
                </Link>
              </div>

              {filteredNext24h.length > 0 ? (
                <StartingSoonColumns games={filteredNext24h} allUpcoming={upcoming} />
              ) : (
                <div className="px-4 py-6 text-center">
                  <div className="text-sm text-text-2">No games in the next 24h.</div>
                </div>
              )}
            </div>

            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏆</span>
                  <span className="text-sm font-bold text-text-1">Popular Leagues Today</span>
                </div>
                <Link href="/leagues" className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                  View all →
                </Link>
              </div>

              {leagueSummaries.length > 0 ? (
                leagueSummaries.map(({ sport, liveCount, upcomingCount }) => (
                  <LeagueSummaryRow key={sport} sport={sport} liveCount={liveCount} upcomingCount={upcomingCount} />
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-text-2">No active leagues today.</div>
              )}
            </div>
          </div>

          {filteredLive.length === 0 && filteredNext24h.length === 0 && (
            <Empty msg="No games scheduled for today." />
          )}
        </>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-12 h-12 bg-surface rounded-2xl border border-border flex items-center justify-center text-xl mb-4 text-text-2">◉</div>
      <div className="text-sm text-text-2 font-medium">{msg}</div>
    </div>
  );
}
