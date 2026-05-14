/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Game, Team, H2HGame, Insight, ProbCard } from "@/lib/types";
import {
  fetchESPNScoreboard, transformESPNEvent, fetchESPNSummary,
  fetchTeamSchedule, deriveFormFromSchedule, findH2HFromSchedule,
  deriveTeamHistoryFromSchedule, ESPN_PATHS, VenueFilter,
} from "@/lib/sports/espn";
import {
  fetchTeamRoster, fetchTeamInjuries, ESPNPlayer, ESPNInjury,
} from "@/lib/sports/espnPlayers";
import { fetchWeather } from "@/lib/sports/weather";
import { calcBetRisk } from "@/lib/sports/betRisk";
import { formatKickoffFull, formatAFLKickoff } from "@/lib/utils";
import { fetchSofascoreMatchData } from "@/lib/sports/sofascore";
import { computeAFLMatchAnalytics } from "@/lib/sports/afl/analytics";
import { generateAFLInsights, type AFLInsight } from "@/lib/sports/afl/insights";
import LiveScorePanel from "@/components/LiveScorePanel";
import AFLTeamCard from "@/components/afl/AFLTeamCard";
import GameDetailTabs, { HistoryVariants, H2HVariants } from "./GameDetailTabs";

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

  const sofascoreSports = ["soccer","ucl","uel","laliga","bundesliga","aleague","basketball"];
  const needSofascore = sofascoreSports.includes(sport);

  if (game.homeTeam.espnId && game.awayTeam.espnId) {
    const sp = ESPN_PATHS[espnSport];
    const fetches: Promise<any>[] = [
      fetchTeamRoster(sp, game.homeTeam.espnId),
      fetchTeamRoster(sp, game.awayTeam.espnId),
      fetchTeamInjuries(sp, game.homeTeam.espnId),
      fetchTeamInjuries(sp, game.awayTeam.espnId),
      ...(needSofascore ? [fetchSofascoreMatchData(sport, game.homeTeam.name, game.awayTeam.name, game.kickoff)] : []),
    ];
    const res = await Promise.all(fetches);
    [homeSquad, awaySquad, homeInjuries, awayInjuries] = res;
    if (needSofascore) sofascore = res[4] ?? null;
  } else if (needSofascore) {
    sofascore = await fetchSofascoreMatchData(sport, game.homeTeam.name, game.awayTeam.name, game.kickoff);
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
    : generateInsights(game, h2hVariants.all, homeHistories.all, awayHistories.all, isSoccer, false);

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

  return (
    <div className={`${isAFL || isBasketball ? "max-w-7xl" : "max-w-5xl"} px-4 pt-4 pb-10 mx-auto`}>

      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-[#374151] hover:text-[#9CA3AF] mb-4 transition-colors">
        ← Back
      </Link>

      {/* ═══════════════════════════════════════════════════════════
          HERO — no bottom rounding (GameDetailTabs provides that)
      ═══════════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] rounded-t-2xl overflow-hidden">

        {/* League bar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5">
          {league?.logo && <img src={league.logo} alt="" className="w-4 h-4 object-contain opacity-70" />}
          <span className="text-xs text-[#9CA3AF]">{league?.name}</span>
          <span className="text-[#1e293b] mx-1">·</span>
          <span className="text-xs text-[#374151] truncate">{game.venue}</span>
          <div className="ml-auto">
            {status === "live" ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {statusLabel()}
              </span>
            ) : (
              <span className="text-xs text-[#9CA3AF]">{statusLabel()}</span>
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

        {/* AFL analytics ribbon */}
        {isAFL && aflAnalytics && (
          <div className="px-5 pb-4 grid grid-cols-2 gap-2 border-t border-white/[0.04] pt-3">
            <AFLTeamCard team={homeTeam} analytics={aflAnalytics.home} />
            <AFLTeamCard team={awayTeam} analytics={aflAnalytics.away} />
          </div>
        )}
        {/* AFL predicted margin for upcoming */}
        {isAFL && aflAnalytics?.predictedMargin != null && status === "upcoming" && (
          <div className="px-5 pb-3 -mt-1 text-center">
            <span className="text-[10px] text-[#374151]">Predicted: </span>
            <span className="text-[10px] font-semibold text-[#3B82F6]">
              {aflAnalytics.predictedMargin >= 0 ? homeTeam.shortName : awayTeam.shortName}
              {" by ~"}{Math.abs(aflAnalytics.predictedMargin)} pts
            </span>
          </div>
        )}

        {/* Prob cards — soccer only */}
        {isSoccer && probs.length > 0 && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-6 gap-2">
              {probs.map(p => (
                <div key={p.label} className="bg-[#0d1827] rounded-xl px-2 py-3 text-center">
                  <div className={`text-xl font-black tabular-nums ${
                    p.conf === "high" ? "text-[#22C55E]" : p.conf === "medium" ? "text-[#F59E0B]" : "text-[#EF4444]"
                  }`}>{p.value}%</div>
                  <div className="text-[9px] text-[#9CA3AF] mt-0.5 leading-tight">{p.label}</div>
                  <div className="mt-2 h-[2px] bg-white/5 rounded-full overflow-hidden">
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

      {/* Tab bar + content (client component — instant switching, no re-render) */}
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

function TeamHero({ team, role }: { team: Team; role: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-2 text-center min-w-0">
      {team.logoUrl
        ? <img src={team.logoUrl} alt={team.name} className="w-14 h-14 sm:w-20 sm:h-20 object-contain" />
        : <span className="text-5xl">{team.logo}</span>}
      <div>
        <div className="font-bold text-white text-sm sm:text-base leading-tight">{team.name}</div>
        <div className="text-[10px] text-[#374151] mt-0.5">{role}</div>
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

  const game = { ...base, h2h, weather, betRisk, boxScore: summary.boxScore, teamStats: summary.teamStats, lineScores: summary.lineScores } as Game;
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

function generateInsights(game: Game, h2h: H2HGame[], homeHist: any[], awayHist: any[], isSoccer: boolean, isAFL: boolean): AFLInsight[] {
  const out: AFLInsight[] = [];
  const { homeTeam, awayTeam } = game;
  const n = h2h.length;
  let idx = 0;

  const mk = (icon: string, text: string): AFLInsight => ({
    icon, text, id: `gen-${idx++}`,
    category: "h2h", direction: "neutral", severity: "medium", confidence: 60, title: text.split(" ").slice(0, 3).join(" "),
  });

  if (n>=3) {
    const hw = h2h.filter(g=>g.winner===homeTeam.name).length;
    const aw = n-hw-h2h.filter(g=>g.winner==="Draw").length;
    if (hw>aw) out.push(mk("◆", `${homeTeam.shortName} lead ${hw}-${aw} in last ${n} meetings`));
    else if (aw>hw) out.push(mk("◆", `${awayTeam.shortName} lead ${aw}-${hw} in last ${n} meetings`));
    else out.push(mk("◆", `Evenly matched — ${hw} wins each in last ${n} meetings`));
  }

  const homeAtHome = homeHist.filter(g=>g.homeAway==="home"&&g.result);
  const homeHomeW  = homeAtHome.filter(g=>g.result==="W").length;
  if (homeAtHome.length>=3 && homeHomeW>=homeAtHome.length-1)
    out.push(mk("◈", `${homeTeam.shortName} unbeaten in last ${homeAtHome.length} home games`));
  else if (homeAtHome.length>=3 && homeHomeW>=Math.ceil(homeAtHome.length*0.6))
    out.push(mk("◈", `${homeTeam.shortName} win ${homeHomeW} of last ${homeAtHome.length} at home`));

  const awayAway = awayHist.filter(g=>g.homeAway==="away"&&g.result);
  const awayAwayW = awayAway.filter(g=>g.result==="W").length;
  if (awayAway.length>=3 && awayAwayW>=Math.ceil(awayAway.length*0.5))
    out.push(mk("◇", `${awayTeam.shortName} win ${awayAwayW} of last ${awayAway.length} away`));

  if (isSoccer && n>=3) {
    const goals  = h2h.map(g=>{const p=g.score.split("-").map(Number);return(p[0]??0)+(p[1]??0);});
    const over25 = goals.filter(v=>v>2.5).length;
    if (over25>=Math.ceil(n*0.6)) out.push(mk("⚽", `Over 2.5 goals in ${over25} of last ${n} H2H`));
    const btts = h2h.filter(g=>{const p=g.score.split("-").map(Number);return(p[0]??0)>0&&(p[1]??0)>0;}).length;
    if (btts>=Math.ceil(n*0.6)) out.push(mk("⚽", `Both teams scored in ${btts} of last ${n} H2H`));
  }

  const streak = (form: string[], r: string) => { let s=0; for (const x of form){if(x===r)s++;else break;} return s; };
  const hs = streak(homeTeam.form,"W");
  const as_ = streak(awayTeam.form,"W");
  if (hs>=3) out.push(mk("◉", `${homeTeam.shortName} on a ${hs}-match winning streak`));
  if (as_>=3) out.push(mk("◉", `${awayTeam.shortName} on a ${as_}-match winning streak`));

  return out.slice(0,6);
}
