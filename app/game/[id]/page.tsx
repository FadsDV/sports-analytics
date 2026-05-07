/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Game, Team, H2HGame, BoxScore } from "@/lib/types";
import {
  fetchESPNScoreboard, transformESPNEvent, fetchESPNSummary,
  fetchTeamSchedule, deriveFormFromSchedule, findH2HFromSchedule,
  ESPN_PATHS, VenueFilter,
} from "@/lib/sports/espn";
import {
  fetchTeamRoster, fetchTeamInjuries, ESPNPlayer, ESPNInjury,
} from "@/lib/sports/espnPlayers";
import { fetchHeadToHead, fetchTeamMatchHistory } from "@/lib/sports/history";
import { fetchWeather } from "@/lib/sports/weather";
import { calcBetRisk } from "@/lib/sports/betRisk";
import { formatKickoffFull } from "@/lib/utils";
import FormPills from "@/components/FormPills";
import SquadList from "@/components/SquadList";
import { fetchSofascoreMatchData, SofascoreMatchData, SofascoreIncident } from "@/lib/sports/sofascore";
import { computeAFLMatchAnalytics, AFLMatchAnalytics } from "@/lib/sports/afl/analytics";

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

  // Fetch data
  const espnSport = sport as keyof typeof ESPN_PATHS;
  const game = await buildESPNGame(id, espnSport, sourceId, h2hFilter);
  if (!game) notFound();

  let homeSquad: ESPNPlayer[] = [], awaySquad: ESPNPlayer[] = [];
  let homeInjuries: ESPNInjury[] = [], awayInjuries: ESPNInjury[] = [];
  let homeHistory: Awaited<ReturnType<typeof fetchTeamMatchHistory>> = [];
  let awayHistory: Awaited<ReturnType<typeof fetchTeamMatchHistory>> = [];

  if (game.homeTeam.espnId && game.awayTeam.espnId) {
    const sp = ESPN_PATHS[espnSport];
    const isAFL = sport === "afl";
    [homeSquad, awaySquad, homeInjuries, awayInjuries, homeHistory, awayHistory] = await Promise.all([
      fetchTeamRoster(sp, game.homeTeam.espnId),
      fetchTeamRoster(sp, game.awayTeam.espnId),
      fetchTeamInjuries(sp, game.homeTeam.espnId),
      fetchTeamInjuries(sp, game.awayTeam.espnId),
      fetchTeamMatchHistory(sport, game.homeTeam.espnId, historyFilter),
      fetchTeamMatchHistory(sport, game.awayTeam.espnId, historyFilter),
    ]);
  }

  // Sofascore (soccer + basketball only)
  let sofascore: SofascoreMatchData | null = null;
  const sofascoreSports = ["soccer","ucl","uel","laliga","bundesliga","aleague","basketball"];
  if (sofascoreSports.includes(sport)) {
    sofascore = await fetchSofascoreMatchData(sport, game.homeTeam.name, game.awayTeam.name, game.kickoff);
  }

  const displayH2H = (game.homeTeam.espnId && game.awayTeam.espnId)
    ? await fetchHeadToHead(sport, game.homeTeam.espnId, game.awayTeam.espnId, h2hFilter, 10, game.homeTeam.name)
    : game.h2h;

  const aflAnalytics: AFLMatchAnalytics | null = isAFL
    ? computeAFLMatchAnalytics({
        homeHistory, awayHistory,
        homeInjuries, awayInjuries,
        venue: game.venue,
        kickoff: game.kickoff,
        h2h: displayH2H,
        homeTeamName: game.homeTeam.name,
        awayTeamName: game.awayTeam.name,
      })
    : null;

  const { homeTeam, awayTeam, score, status, liveMinute, weather, boxScore, lineScores } = game;

  const isSoccer     = ["soccer","ucl","uel","laliga","bundesliga","aleague"].includes(sport);
  const isBasketball = sport === "basketball";
  const isAFL        = sport === "afl";

  // Derived analytics
  const probs    = isSoccer ? computeProbs(displayH2H, homeTeam.name) : [];
  const insights = generateInsights(game, displayH2H, homeHistory, awayHistory, isSoccer, isAFL);

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
    return formatKickoffFull(game!.kickoff);
  }

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "players",  label: "Players" },
    { key: "stats",    label: "Stats" },
    { key: "h2h",      label: "H2H" },
  ];

  return (
    <div className="max-w-5xl px-4 pt-4 pb-10 mx-auto">

      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-[#374151] hover:text-[#9CA3AF] mb-4 transition-colors">
        ← Back
      </Link>

      {/* ═══════════════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] rounded-2xl overflow-hidden mb-4">

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
            {status === "upcoming" ? (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#4B5563] mb-2">Pre-Match</div>
                <div className="text-3xl font-bold text-[#1e3a5f]">vs</div>
                <div className="text-xs text-[#3B82F6] mt-2">{formatKickoffFull(game!.kickoff)}</div>
              </div>
            ) : (
              <div>
                <div className="text-5xl sm:text-6xl font-black text-white tabular-nums tracking-tight">
                  {score!.home}<span className="text-[#1e293b] mx-2 font-light">–</span>{score!.away}
                </div>

                {/* Quarter grid (NBA / AFL) */}
                {(isBasketball || isAFL) && lineScores && lineScores.home.length > 0 && (
                  <div className="mt-3 inline-block">
                    <div className="grid gap-x-3 text-[11px] tabular-nums"
                      style={{ gridTemplateColumns: `auto repeat(${lineScores.home.length}, 1fr)` }}>
                      <span />
                      {lineScores.home.map((_, i) => <span key={i} className="text-center text-[#374151]">Q{i+1}</span>)}
                      <span className="text-right text-[#9CA3AF] pr-1">{homeTeam.shortName}</span>
                      {lineScores.home.map((q,i) => <span key={i} className="text-center text-[#E5E7EB]">{q}</span>)}
                      <span className="text-right text-[#9CA3AF] pr-1">{awayTeam.shortName}</span>
                      {lineScores.away.map((q,i) => <span key={i} className="text-center text-[#E5E7EB]">{q}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <TeamHero team={awayTeam} role="Away" />
        </div>

        {/* AFL analytics ribbon */}
        {isAFL && aflAnalytics && (
          <div className="px-5 pb-4 grid grid-cols-2 gap-2 border-t border-white/[0.04] pt-3">
            {([
              { t: homeTeam, an: aflAnalytics.home  },
              { t: awayTeam, an: aflAnalytics.away  },
            ] as const).map(({ t, an }) => (
              <div key={t.name} className="bg-[#0d1827] rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-[10px] text-[#9CA3AF] font-medium">{t.shortName}</span>
                  <span className="ml-auto text-[10px] text-[#6B7280] tabular-nums">
                    {an.record.wins}W {an.record.losses}L{an.record.draws > 0 ? ` ${an.record.draws}D` : ""}
                  </span>
                </div>
                <div className="flex gap-1 mb-2">
                  {an.form.map((r, i) => (
                    <span key={i} className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${
                      r === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" : r === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                    }`}>{r}</span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[#4B5563]">
                  <span><span className="text-white">{an.avgScored}</span> avg</span>
                  {an.daysRest != null && <span><span className="text-[#9CA3AF]">{an.daysRest}d</span> rest</span>}
                  {an.streak.type && an.streak.count >= 2 && (
                    <span className={`${an.streak.type === "W" ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                      {an.streak.count}{an.streak.type}
                    </span>
                  )}
                </div>
              </div>
            ))}
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

        {/* Tab bar */}
        <div className="flex border-t border-white/5">
          {TABS.map(t => (
            <Link
              key={t.key}
              href={`/game/${id}?tab=${t.key}&h2hFilter=${h2hFilter}&historyFilter=${historyFilter}`}
              className={`flex-1 py-3 text-center text-sm font-medium relative transition-colors ${
                activeTab === t.key
                  ? "text-white after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:bg-[#3B82F6] after:rounded-full"
                  : "text-[#9CA3AF] hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          OVERVIEW
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        isSoccer
          ? <SoccerOverview game={game} insights={insights} homeHistory={homeHistory} awayHistory={awayHistory} h2h={displayH2H} historyFilter={historyFilter} id={id} h2hFilter={h2hFilter} weather={weather} homeSquad={homeSquad} awaySquad={awaySquad} sofascore={sofascore} />
          : isBasketball
          ? <BasketballOverview game={game} insights={insights} sofascore={sofascore} homeHistory={homeHistory} awayHistory={awayHistory} homeSquad={homeSquad} awaySquad={awaySquad} homeInjuries={homeInjuries} awayInjuries={awayInjuries} h2h={displayH2H} />
          : isAFL
          ? <AFLOverview game={game} insights={insights} boxScore={boxScore} homeHistory={homeHistory} awayHistory={awayHistory} homeSquad={homeSquad} awaySquad={awaySquad} homeInjuries={homeInjuries} awayInjuries={awayInjuries} h2h={displayH2H} analytics={aflAnalytics} />
          : <GenericOverview game={game} insights={insights} homeHistory={homeHistory} awayHistory={awayHistory} />
      )}

      {/* ═══════════════════════════════════════════════════════════
          PLAYERS
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "players" && (
        <div className="space-y-4">
          {/* Soccer match events */}
          {sofascore?.incidents && sofascore.incidents.length > 0 && isSoccer && (
            <Section title="Match Events">
              <MatchIncidents incidents={sofascore.incidents} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
            </Section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={`${homeTeam.shortName} — Players`}>
              {isAFL && boxScore ? (
                <AFLPlayerList rows={boxScore.home} headers={boxScore.statHeaders} />
              ) : sofascore?.lineups ? (
                <SofascoreList players={sofascore.lineups.home} sport={sport} />
              ) : (
                <SquadList players={homeSquad} injuries={homeInjuries} sport={game.sport} gameId={game.id} />
              )}
            </Section>
            <Section title={`${awayTeam.shortName} — Players`}>
              {isAFL && boxScore ? (
                <AFLPlayerList rows={boxScore.away} headers={boxScore.statHeaders} />
              ) : sofascore?.lineups ? (
                <SofascoreList players={sofascore.lineups.away} sport={sport} />
              ) : (
                <SquadList players={awaySquad} injuries={awayInjuries} sport={game.sport} gameId={game.id} />
              )}
            </Section>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          STATS
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "stats" && (
        <div className="space-y-4">
          {game.teamStats ? (
            <Section title="Team Comparison">
              <ComparisonBars homeTeam={homeTeam} awayTeam={awayTeam} stats={game.teamStats} />
            </Section>
          ) : null}
          {boxScore ? (
            <Section title="Box Score">
              <CompactBoxScore boxScore={boxScore} homeTeam={homeTeam} awayTeam={awayTeam} />
            </Section>
          ) : (
            <Section title="Box Score">
              <p className="text-sm text-[#374151]">No data available yet.</p>
            </Section>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          H2H
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "h2h" && (
        <Section title="Head-to-Head">
          <div className="flex gap-2 mb-4">
            {(["all","home","away"] as VenueFilter[]).map(f => (
              <Link key={f} href={`/game/${id}?tab=h2h&h2hFilter=${f}&historyFilter=${historyFilter}`}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  h2hFilter === f ? "text-[#3B82F6] bg-[#3B82F6]/10" : "text-[#9CA3AF] hover:text-white"
                }`}>
                {f === "all" ? "All" : f === "home" ? "Home" : "Away"}
              </Link>
            ))}
          </div>
          {displayH2H.length > 0
            ? <H2HPanel h2h={displayH2H} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
            : <p className="text-sm text-[#374151]">No head-to-head data.</p>}
        </Section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPORT-SPECIFIC OVERVIEW SECTIONS
// ═══════════════════════════════════════════════════════════

function SoccerOverview({ game, insights, homeHistory, awayHistory, h2h, historyFilter, id, h2hFilter, weather, homeSquad, awaySquad, sofascore }: {
  game: Game; insights: Insight[]; weather: any;
  homeHistory: any[]; awayHistory: any[];
  h2h: H2HGame[]; historyFilter: string; id: string; h2hFilter: string;
  homeSquad: ESPNPlayer[]; awaySquad: ESPNPlayer[];
  sofascore: SofascoreMatchData | null;
}) {
  const { homeTeam, awayTeam, status } = game;
  const isUpcoming = status === "upcoming";
  const isFinished = status === "finished";
  const homeInjured = homeTeam.players.filter(p => p.injured);
  const awayInjured = awayTeam.players.filter(p => p.injured);

  return (
    <div className="space-y-4">

      {/* Finished: match events at top */}
      {isFinished && sofascore?.incidents && sofascore.incidents.length > 0 && (
        <Section title="Match Events">
          <MatchIncidents incidents={sofascore.incidents} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* LEFT (3 cols) */}
      <div className="lg:col-span-3 space-y-4">

        {/* Upcoming: projected lineups */}
        {isUpcoming && (homeSquad.length > 0 || awaySquad.length > 0) && (
          <Section title="Probable Lineups">
            <div className="grid grid-cols-2 gap-4">
              {[{ t: homeTeam, squad: homeSquad }, { t: awayTeam, squad: awaySquad }].map(({ t, squad }) => {
                const starters = squad
                  .sort((a, b) => (a.position || "").localeCompare(b.position || ""))
                  .slice(0, 11);
                return (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-2">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-medium text-[#9CA3AF]">{t.shortName}</span>
                    </div>
                    {starters.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 border-b border-white/[0.04] last:border-0 text-xs">
                        <span className="text-[#374151] w-5 text-center font-mono">{p.jersey || i+1}</span>
                        <span className="text-[#E5E7EB] flex-1 truncate">{p.displayName}</span>
                        <span className="text-[#4B5563] text-[10px]">{p.position}</span>
                      </div>
                    ))}
                    {starters.length === 0 && <p className="text-xs text-[#374151]">Not announced yet</p>}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Form comparison */}
        <Section title="Recent Form">
          <div className="grid grid-cols-2 gap-5">
            {[{ t: homeTeam, role: "Home" }, { t: awayTeam, role: "Away" }].map(({ t, role }) => (
              <div key={t.name}>
                <div className="flex items-center gap-2 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain" />}
                  <span className="text-sm font-medium text-white truncate">{t.name}</span>
                  <span className="text-xs text-[#374151]">{role}</span>
                </div>
                <FormPills form={t.form} />
                <div className="text-xs text-[#374151] mt-1.5">
                  {t.record.wins}W {t.record.losses}L{t.record.draws != null ? ` ${t.record.draws}D` : ""}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* H2H summary */}
        {h2h.length > 0 && (
          <Section title="Head-to-Head">
            <H2HPanel h2h={h2h} homeTeam={homeTeam.name} awayTeam={awayTeam.name} compact />
          </Section>
        )}

        {/* Recent match history */}
        <Section title="Recent Results">
          <div className="flex gap-2 mb-3">
            {(["all","home","away"] as VenueFilter[]).map(f => (
              <Link key={f} href={`/game/${id}?tab=overview&historyFilter=${f}&h2hFilter=${h2hFilter}`}
                className={`text-xs px-2 py-1 rounded transition-all ${
                  historyFilter === f ? "text-[#3B82F6]" : "text-[#374151] hover:text-[#9CA3AF]"
                }`}>
                {f === "all" ? "All" : f === "home" ? "Home" : "Away"}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ t: homeTeam, h: homeHistory }, { t: awayTeam, h: awayHistory }].map(({ t, h }) => (
              <div key={t.name}>
                <div className="text-[10px] uppercase tracking-widest text-[#374151] mb-1.5">{t.shortName}</div>
                {h.slice(0, 6).map(g => (
                  <Link key={g.gameId} href={`/game/${g.gameId}`}
                    className="flex items-center justify-between py-1.5 border-b border-white/[0.04] hover:bg-white/[0.03] px-1 rounded text-xs group">
                    <span className="text-[#9CA3AF] truncate max-w-[45%]">{g.opponent}</span>
                    <span className={`font-semibold ${g.result==="W"?"text-[#22C55E]":g.result==="L"?"text-[#EF4444]":"text-[#F59E0B]"}`}>
                      {g.score ?? "—"}
                    </span>
                  </Link>
                ))}
                {h.length === 0 && <p className="text-xs text-[#374151]">No data</p>}
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* RIGHT (2 cols) */}
      <div className="lg:col-span-2 space-y-4">

        {/* Key Insights */}
        {insights.length > 0 && (
          <Section title="Key Insights">
            <ul className="space-y-2">
              {insights.map((ins, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-[#3B82F6] shrink-0 text-xs mt-0.5">{ins.icon}</span>
                  <span className="text-[#E5E7EB] leading-snug">{ins.text}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Injuries */}
        <Section title="Injuries">
          {homeInjured.length === 0 && awayInjured.length === 0 ? (
            <p className="text-xs text-[#22C55E]">✓ None reported</p>
          ) : (
            <div className="space-y-1">
              {[...homeInjured, ...awayInjured].slice(0, 6).map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0 text-xs">
                  <span className="text-[#E5E7EB]">{p.name}</span>
                  <span className="text-[#F59E0B] shrink-0 text-[10px] ml-2">{p.position}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Splits */}
        <Section title="Home / Away">
          {[
            { label: `${homeTeam.shortName} Home`, split: homeTeam.splits.home },
            { label: `${awayTeam.shortName} Away`,  split: awayTeam.splits.away },
          ].map(({ label, split }) => {
            const total  = split.wins + split.losses + (split.draws ?? 0);
            const pct    = total > 0 ? Math.round((split.wins/total)*100) : 0;
            return (
              <div key={label} className="mb-3 last:mb-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#9CA3AF]">{label}</span>
                  <span className="text-white font-medium">{pct}%</span>
                </div>
                <div className="h-[2px] bg-white/5 rounded-full">
                  <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[10px] text-[#374151] mt-0.5">{split.wins}W {split.losses}L{split.draws ? ` ${split.draws}D` : ""}</div>
              </div>
            );
          })}
        </Section>

        {/* Weather */}
        {weather && weather.condition !== "Indoor" && (
          <Section title="Weather">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xl">{WEATHER_ICON[weather.condition] ?? "🌤"}</span>
              <div>
                <span className={weather.windKph > 40 || ["Storm","Rain"].includes(weather.condition) ? "text-[#F59E0B]" : "text-white"}>
                  {weather.condition}
                </span>
                <div className="text-xs text-[#374151]">{weather.tempC}°C · {weather.windKph}km/h</div>
              </div>
            </div>
          </Section>
        )}
      </div>
      </div>{/* /grid */}
    </div>
  );
}

const WEATHER_ICON: Record<string, string> = {
  Clear: "☀️", Cloudy: "☁️", "Partly Cloudy": "⛅", Rain: "🌧️", Storm: "⛈️", Snowy: "❄️",
};

function BasketballOverview({ game, insights, sofascore, homeHistory, awayHistory, homeSquad, awaySquad, homeInjuries, awayInjuries, h2h }: {
  game: Game; insights: Insight[]; sofascore: SofascoreMatchData | null;
  homeHistory: any[]; awayHistory: any[];
  homeSquad: ESPNPlayer[]; awaySquad: ESPNPlayer[];
  homeInjuries: ESPNInjury[]; awayInjuries: ESPNInjury[];
  h2h: H2HGame[];
}) {
  const { homeTeam, awayTeam } = game;
  const isUpcoming = game.status === "upcoming";

  // Live/finished: top performers from sofascore lineups
  const homePlayers = sofascore?.lineups?.home ?? [];
  const awayPlayers = sofascore?.lineups?.away ?? [];
  const hasPerformers = homePlayers.length > 0 || awayPlayers.length > 0;

  // Upcoming: key players from squad (first 5 by roster order)
  const homeStarters = homeSquad.slice(0, 5);
  const awayStarters = awaySquad.slice(0, 5);

  const allInjuries = [...homeInjuries, ...awayInjuries];

  return (
    <div className="space-y-4">

      {/* Finished/Live: top performers first */}
      {!isUpcoming && hasPerformers && (
        <Section title="Top Performers">
          <div className="grid grid-cols-2 gap-4">
            {[{ t: homeTeam, players: homePlayers }, { t: awayTeam, players: awayPlayers }].map(({ t, players }) => {
              const sorted = [...players].sort((a, b) => (b.stats.points ?? 0) as number - ((a.stats.points ?? 0) as number)).slice(0, 5);
              return (
                <div key={t.name}>
                  <div className="flex items-center gap-1.5 mb-2">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-medium text-[#6B7280]">{t.shortName}</span>
                  </div>
                  {sorted.map(p => (
                    <div key={p.id} className="flex items-center py-1.5 border-b border-white/[0.04] last:border-0 gap-2">
                      <span className="text-[13px] text-white flex-1 truncate">{p.shortName}</span>
                      <span className="text-white font-bold text-xs tabular-nums">{p.stats.points ?? "—"}</span>
                      <span className="text-[#6B7280] text-[10px]">PTS</span>
                      <span className="text-[#9CA3AF] text-xs tabular-nums">{p.stats.rebounds ?? "—"}</span>
                      <span className="text-[#374151] text-[10px]">REB</span>
                      <span className="text-[#9CA3AF] text-xs tabular-nums">{p.stats.assists ?? "—"}</span>
                      <span className="text-[#374151] text-[10px]">AST</span>
                    </div>
                  ))}
                  {sorted.length === 0 && <p className="text-xs text-[#374151]">No data yet</p>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Upcoming: projected starters */}
      {isUpcoming && (homeStarters.length > 0 || awayStarters.length > 0) && (
        <Section title="Projected Starters">
          <div className="grid grid-cols-2 gap-4">
            {[{ t: homeTeam, squad: homeStarters }, { t: awayTeam, squad: awayStarters }].map(({ t, squad }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs font-medium text-[#6B7280]">{t.shortName}</span>
                </div>
                {squad.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0 text-xs">
                    <span className="text-[#374151] w-5 text-center font-mono text-[10px]">{p.jersey || i+1}</span>
                    <span className="text-[#E5E7EB] flex-1 truncate">{p.displayName}</span>
                    <span className="text-[#4B5563] text-[10px]">{p.position}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Form + insights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Section title="Form">
          <div className="space-y-3">
            {[{ t: homeTeam }, { t: awayTeam }].map(({ t }) => (
              <div key={t.name}>
                <div className="flex items-center gap-2 mb-1.5">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs text-[#6B7280]">{t.shortName}</span>
                  <span className="text-[10px] text-[#374151] ml-auto">{t.record.wins}W {t.record.losses}L</span>
                </div>
                <FormPills form={t.form} />
              </div>
            ))}
          </div>
        </Section>

        {insights.length > 0 && (
          <Section title="Key Insights">
            <ul className="space-y-2">
              {insights.slice(0, 4).map((ins, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-[#3B82F6] shrink-0">{ins.icon}</span>
                  <span className="text-[#E5E7EB] leading-snug">{ins.text}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {/* H2H for upcoming */}
      {isUpcoming && h2h.length > 0 && (
        <Section title="Head-to-Head">
          <H2HPanel h2h={h2h} homeTeam={homeTeam.name} awayTeam={awayTeam.name} compact />
        </Section>
      )}

      {/* Injuries */}
      {allInjuries.length > 0 && (
        <Section title="Injury Report">
          <div className="grid grid-cols-2 gap-4">
            {[{ t: homeTeam, inj: homeInjuries }, { t: awayTeam, inj: awayInjuries }].map(({ t, inj }) => (
              <div key={t.name}>
                <div className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-1.5">{t.shortName}</div>
                {inj.length === 0
                  ? <p className="text-xs text-[#22C55E]">✓ None reported</p>
                  : inj.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0 text-xs">
                      <span className="text-[#D1D5DB] truncate">{p.playerName}</span>
                      <span className="text-[#F59E0B] shrink-0 text-[10px] ml-2">{p.status}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Team stats */}
      {game.teamStats && (
        <Section title="Season Stats">
          <ComparisonBars homeTeam={homeTeam} awayTeam={awayTeam} stats={game.teamStats} compact />
        </Section>
      )}
    </div>
  );
}

function AFLOverview({ game, insights, boxScore, homeSquad, awaySquad, h2h, analytics }: {
  game: Game; insights: Insight[]; boxScore?: BoxScore;
  homeHistory: any[]; awayHistory: any[];
  homeSquad: ESPNPlayer[]; awaySquad: ESPNPlayer[];
  homeInjuries: ESPNInjury[]; awayInjuries: ESPNInjury[];
  h2h: H2HGame[];
  analytics: AFLMatchAnalytics | null;
}) {
  const { homeTeam, awayTeam } = game;
  const isUpcoming = game.status === "upcoming";
  const ha = analytics?.home;
  const aa = analytics?.away;
  const h2hS = analytics?.h2h;

  const KEY_STATS = ["D","G","T","M","HO"];
  const topHome = boxScore?.home.slice(0, 8) ?? [];
  const topAway = boxScore?.away.slice(0, 8) ?? [];
  const hasBoxScore = topHome.length > 0 || topAway.length > 0;

  return (
    <div className="space-y-4">

      {/* ── 1. DISPOSAL LEADERS (finished/live) ─────────────────── */}
      {!isUpcoming && hasBoxScore && (
        <Section title="Disposal Leaders">
          <div className="grid grid-cols-2 gap-4">
            {[{ t: homeTeam, rows: topHome }, { t: awayTeam, rows: topAway }].map(({ t, rows }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs font-medium text-[#6B7280]">{t.shortName}</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center py-1.5 border-b border-white/[0.04] last:border-0 text-xs gap-2">
                    <span className="text-white flex-1 truncate">{row.player}</span>
                    <div className="flex items-center gap-2 text-[#9CA3AF] shrink-0">
                      {KEY_STATS.filter(k => row.stats[k] != null).map(k => (
                        <span key={k} className="tabular-nums">
                          <span className="text-[#374151] text-[9px]">{k} </span>
                          <span className={k === "D" && Number(row.stats[k]) >= 25 ? "text-[#3B82F6] font-bold" : ""}>{row.stats[k]}</span>
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

      {/* ── 2. QUICK MATCH INTELLIGENCE ─────────────────────────── */}
      {(ha || aa) && (
        <Section title="Quick Match Intelligence">
          <div className="grid grid-cols-2 gap-4">
            {([{ t: homeTeam, an: ha, role: "Home" }, { t: awayTeam, an: aa, role: "Away" }] as const).map(({ t, an, role }) => {
              if (!an) return null;
              return (
                <div key={t.name}>
                  <div className="flex items-center gap-1.5 mb-3">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain" />}
                    <span className="text-sm font-semibold text-white truncate">{t.shortName}</span>
                    <span className="ml-auto text-[10px] text-[#6B7280]">{role}</span>
                  </div>

                  {/* Form pills */}
                  <div className="flex gap-1 mb-3">
                    {an.form.map((r, i) => (
                      <span key={i} className={`w-6 h-6 rounded text-[9px] font-bold flex items-center justify-center ${
                        r === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" :
                        r === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" :
                                    "bg-[#F59E0B]/20 text-[#F59E0B]"
                      }`}>{r}</span>
                    ))}
                    {an.streak.type && an.streak.count >= 2 && (
                      <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        an.streak.type === "W" ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]"
                      }`}>{an.streak.count}{an.streak.type} streak</span>
                    )}
                  </div>

                  {/* Stat chips */}
                  <div className="space-y-1.5">
                    {[
                      { label: "Season",       value: `${an.record.wins}W ${an.record.losses}L${an.record.draws > 0 ? ` ${an.record.draws}D` : ""}` },
                      { label: "Avg Scored",   value: `${an.avgScored} pts` },
                      { label: "Avg Conceded", value: `${an.avgConceded} pts` },
                      ...(an.homeRecord && role === "Home" ? [{ label: "Home Record", value: `${an.homeRecord.wins}W ${an.homeRecord.losses}L` }] : []),
                      ...(an.awayRecord && role === "Away" ? [{ label: "Away Record", value: `${an.awayRecord.wins}W ${an.awayRecord.losses}L` }] : []),
                      ...(an.venueRecord ? [{ label: "At Venue", value: `${an.venueRecord.wins}W ${an.venueRecord.losses}L` }] : []),
                      ...(an.daysRest != null ? [{ label: "Days Rest", value: `${an.daysRest}d` }] : []),
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <span className="text-[#4B5563]">{label}</span>
                        <span className="text-[#D1D5DB] font-medium tabular-nums">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── 3. PROJECTED SQUAD (upcoming) ───────────────────────── */}
      {isUpcoming && (homeSquad.length > 0 || awaySquad.length > 0) && (
        <Section title="Projected Squad">
          <div className="grid grid-cols-2 gap-4">
            {[{ t: homeTeam, squad: homeSquad.slice(0, 10) }, { t: awayTeam, squad: awaySquad.slice(0, 10) }].map(({ t, squad }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs font-medium text-[#6B7280]">{t.shortName}</span>
                </div>
                {squad.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0 text-xs">
                    <span className="text-[#374151] w-4 text-center font-mono text-[10px]">{p.jersey || i+1}</span>
                    <span className="text-[#E5E7EB] flex-1 truncate">{p.displayName}</span>
                    <span className="text-[#4B5563] text-[10px]">{p.position}</span>
                  </div>
                ))}
                {squad.length === 0 && <p className="text-xs text-[#374151]">Not announced yet</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── 4. TEAM NEWS (INS / OUTS) ───────────────────────────── */}
      {(ha?.injuryImpact || aa?.injuryImpact) && (
        <Section title="Team News — Ins / Outs">
          <div className="grid grid-cols-2 gap-4">
            {([{ t: homeTeam, an: ha }, { t: awayTeam, an: aa }] as const).map(({ t, an }) => {
              if (!an) return null;
              const { out, doubtful, suspended } = an.injuryImpact;
              const hasAny = out.length > 0 || doubtful.length > 0 || suspended.length > 0;
              return (
                <div key={t.name}>
                  <div className="flex items-center gap-1.5 mb-2">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-medium text-[#9CA3AF]">{t.shortName}</span>
                  </div>
                  {!hasAny && <p className="text-xs text-[#22C55E]">✓ None reported</p>}
                  {out.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[9px] uppercase tracking-widest text-[#EF4444] mb-1">Out</div>
                      {out.map((p, i) => (
                        <div key={i} className="flex items-start justify-between py-1 border-b border-white/[0.04] last:border-0 text-xs gap-1">
                          <span className="text-[#D1D5DB] truncate">{p.playerName}</span>
                          <span className="text-[#6B7280] text-[10px] shrink-0 truncate max-w-[45%] text-right">{p.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {doubtful.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[9px] uppercase tracking-widest text-[#F59E0B] mb-1">Doubtful</div>
                      {doubtful.map((p, i) => (
                        <div key={i} className="flex items-start justify-between py-1 border-b border-white/[0.04] last:border-0 text-xs gap-1">
                          <span className="text-[#D1D5DB] truncate">{p.playerName}</span>
                          <span className="text-[#6B7280] text-[10px] shrink-0 truncate max-w-[45%] text-right">{p.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {suspended.length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-[#9CA3AF] mb-1">Suspended</div>
                      {suspended.map((p, i) => (
                        <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0 text-xs">
                          <span className="text-[#D1D5DB] truncate">{p.playerName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── 5. LAST 5 GAMES ─────────────────────────────────────── */}
      {(ha?.last5.length || aa?.last5.length) ? (
        <Section title="Last 5 Games">
          <div className="grid grid-cols-2 gap-4">
            {([{ t: homeTeam, an: ha }, { t: awayTeam, an: aa }] as const).map(({ t, an }) => {
              if (!an) return null;
              return (
                <div key={t.name}>
                  <div className="flex items-center gap-1.5 mb-2">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-medium text-[#6B7280]">{t.shortName}</span>
                  </div>
                  {an.last5.map((g, i) => (
                    <Link key={g.gameId || i} href={g.gameId ? `/game/${g.gameId}` : "#"}
                      className="flex items-center gap-1.5 py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] rounded px-0.5 text-xs group">
                      <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                        g.result === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" :
                        g.result === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" :
                                           "bg-[#F59E0B]/20 text-[#F59E0B]"
                      }`}>{g.result}</span>
                      <span className="text-[#9CA3AF] w-6 text-[10px] text-center shrink-0">{g.oppAbbr}</span>
                      <span className="text-[#D1D5DB] tabular-nums text-[10px] shrink-0">{g.teamScore}–{g.oppScore}</span>
                      <span className={`tabular-nums text-[9px] shrink-0 ${g.margin > 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                        {g.margin > 0 ? `+${g.margin}` : g.margin}
                      </span>
                      <span className="text-[#4B5563] text-[9px] shrink-0">{g.homeAway}</span>
                      <span className="text-[#2d3748] text-[9px] truncate hidden sm:block">{g.venue.split(/[^a-zA-Z]/)[0]}</span>
                    </Link>
                  ))}
                  {an.last5.length === 0 && <p className="text-xs text-[#374151]">No data</p>}
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {/* ── 6. HOME vs AWAY ANALYTICS ───────────────────────────── */}
      {(ha || aa) && (
        <Section title="Home / Away Analytics">
          <div className="space-y-4">
            {([{ t: homeTeam, an: ha, contextRole: "Home" as const }, { t: awayTeam, an: aa, contextRole: "Away" as const }] as const).map(({ t, an, contextRole }) => {
              if (!an) return null;
              return (
                <div key={t.name} className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-1">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs text-[#9CA3AF]">{t.shortName}</span>
                    </div>
                    <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded inline-block w-fit ${
                      contextRole === "Home" ? "bg-[#3B82F6]/10 text-[#3B82F6]" : "bg-[#6B7280]/10 text-[#6B7280]"
                    }`}>{contextRole}</div>
                  </div>
                  <div className="bg-[#0d1827] rounded-lg px-3 py-2 text-center">
                    <div className="text-[9px] text-[#374151] uppercase tracking-widest mb-1">At Home</div>
                    <div className="text-lg font-black text-white tabular-nums">{an.homeRecord.wins}</div>
                    <div className="text-[10px] text-[#6B7280]">{an.homeRecord.wins}W {an.homeRecord.losses}L</div>
                    <div className={`text-[10px] mt-0.5 ${
                      an.homeRecord.wins > an.homeRecord.losses ? "text-[#22C55E]" :
                      an.homeRecord.wins < an.homeRecord.losses ? "text-[#EF4444]" : "text-[#F59E0B]"
                    }`}>
                      {an.homeRecord.wins + an.homeRecord.losses > 0
                        ? `${Math.round((an.homeRecord.wins / (an.homeRecord.wins + an.homeRecord.losses)) * 100)}%`
                        : "—"}
                    </div>
                  </div>
                  <div className="bg-[#0d1827] rounded-lg px-3 py-2 text-center">
                    <div className="text-[9px] text-[#374151] uppercase tracking-widest mb-1">Away</div>
                    <div className="text-lg font-black text-white tabular-nums">{an.awayRecord.wins}</div>
                    <div className="text-[10px] text-[#6B7280]">{an.awayRecord.wins}W {an.awayRecord.losses}L</div>
                    <div className={`text-[10px] mt-0.5 ${
                      an.awayRecord.wins > an.awayRecord.losses ? "text-[#22C55E]" :
                      an.awayRecord.wins < an.awayRecord.losses ? "text-[#EF4444]" : "text-[#F59E0B]"
                    }`}>
                      {an.awayRecord.wins + an.awayRecord.losses > 0
                        ? `${Math.round((an.awayRecord.wins / (an.awayRecord.wins + an.awayRecord.losses)) * 100)}%`
                        : "—"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── 7. H2H ──────────────────────────────────────────────── */}
      {h2hS && h2hS.total > 0 ? (
        <Section title="Head-to-Head">
          {/* Summary bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 text-center">
              <div className="text-2xl font-black text-[#3B82F6]">{h2hS.homeWins}</div>
              <div className="text-[10px] text-[#374151]">{homeTeam.shortName} Wins</div>
            </div>
            <div className="flex-1 text-center">
              <div className="text-2xl font-black text-[#F59E0B]">{h2hS.draws}</div>
              <div className="text-[10px] text-[#374151]">Draws</div>
            </div>
            <div className="flex-1 text-center">
              <div className="text-2xl font-black text-[#9CA3AF]">{h2hS.awayWins}</div>
              <div className="text-[10px] text-[#374151]">{awayTeam.shortName} Wins</div>
            </div>
          </div>
          {/* H2H streak */}
          {h2hS.streak && (
            <div className="mb-3 text-xs">
              <span className="text-[#374151]">Current streak: </span>
              <span className="text-[#3B82F6] font-semibold">{h2hS.streak.team} — {h2hS.streak.count} in a row</span>
            </div>
          )}
          {/* Meetings */}
          {h2hS.meetings.map((m, i) => {
            const isHomeWin = m.winner === homeTeam.name;
            const isAwayWin = m.winner === awayTeam.name;
            return (
              <Link key={m.gameId || i} href={m.gameId ? `/game/${m.gameId}` : "#"}
                className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] rounded px-1 text-xs group">
                <span className="text-[#374151] w-16 shrink-0">{m.date}</span>
                <span className={`flex-1 truncate text-right ${isHomeWin ? "text-white font-medium" : "text-[#9CA3AF]"}`}>{m.home}</span>
                <span className="font-bold text-white tabular-nums w-14 text-center shrink-0">{m.score}</span>
                <span className={`flex-1 truncate ${isAwayWin ? "text-white font-medium" : "text-[#9CA3AF]"}`}>{m.away}</span>
                <span className="text-[#374151] text-[10px] tabular-nums shrink-0">±{m.margin}</span>
              </Link>
            );
          })}
        </Section>
      ) : h2h.length > 0 ? (
        <Section title="Head-to-Head">
          <H2HPanel h2h={h2h} homeTeam={homeTeam.name} awayTeam={awayTeam.name} compact />
        </Section>
      ) : null}

      {/* ── 8. TEAM COMPARISON ──────────────────────────────────── */}
      {(ha && aa) && (
        <Section title="Team Comparison">
          <div className="space-y-3">
            {([
              { key: "Avg Scored",       hv: ha.avgScored,     av: aa.avgScored     },
              { key: "Avg Conceded",     hv: ha.avgConceded,   av: aa.avgConceded   },
              { key: "Avg Win Margin",   hv: ha.avgMarginWin,  av: aa.avgMarginWin  },
              { key: "Avg Loss Margin",  hv: ha.avgMarginLoss, av: aa.avgMarginLoss },
              { key: "Days Rest",        hv: ha.daysRest ?? 0, av: aa.daysRest ?? 0 },
            ] as { key: string; hv: number; av: number }[]).map(({ key, hv, av }) => {
              const max = Math.max(hv, av, 1);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-white font-medium tabular-nums w-10">{hv}</span>
                    <span className="text-[#374151] uppercase text-[10px] tracking-wider flex-1 text-center">{key}</span>
                    <span className="text-[#9CA3AF] tabular-nums w-10 text-right">{av}</span>
                  </div>
                  <div className="flex gap-1 h-[3px]">
                    <div className="flex-1 bg-white/5 rounded-full overflow-hidden flex justify-end">
                      <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${(hv/max)*100}%` }} />
                    </div>
                    <div className="flex-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[#9CA3AF] rounded-full" style={{ width: `${(av/max)*100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Key Insights */}
      {insights.length > 0 && (
        <Section title="Key Insights">
          <ul className="space-y-2">
            {insights.slice(0, 5).map((ins, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <span className="text-[#3B82F6] shrink-0">{ins.icon}</span>
                <span className="text-[#E5E7EB] leading-snug">{ins.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function GenericOverview({ game, insights, homeHistory, awayHistory }: {
  game: Game; insights: Insight[];
  homeHistory: any[]; awayHistory: any[];
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
                <span className="text-sm text-white">{t.name}</span>
                <span className="text-xs text-[#374151]">{role}</span>
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
                <span className="text-[#3B82F6] shrink-0">{ins.icon}</span>
                <span className="text-[#E5E7EB]">{ins.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED UI ATOMS
// ═══════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111827] rounded-xl p-4 border border-white/[0.04]">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#374151] mb-3">{title}</h3>
      {children}
    </div>
  );
}

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

function H2HPanel({ h2h, homeTeam, awayTeam, compact }: {
  h2h: H2HGame[]; homeTeam: string; awayTeam: string; compact?: boolean;
}) {
  const homeWins = h2h.filter(g => g.winner === homeTeam).length;
  const draws    = h2h.filter(g => g.winner === "Draw").length;
  const awayWins = h2h.length - homeWins - draws;
  const n        = h2h.length;

  return (
    <div>
      {/* Win summary */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 text-center">
          <div className="text-2xl font-black text-[#3B82F6]">{homeWins}</div>
          <div className="text-[10px] text-[#374151]">{homeTeam.split(" ").pop()} Wins</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-2xl font-black text-[#F59E0B]">{draws}</div>
          <div className="text-[10px] text-[#374151]">Draws</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-2xl font-black text-[#9CA3AF]">{awayWins}</div>
          <div className="text-[10px] text-[#374151]">{awayTeam.split(" ").pop()} Wins</div>
        </div>
      </div>

      {/* Meetings */}
      {(compact ? h2h.slice(0, 4) : h2h).map((g, i) => {
        const isHomeWin = g.winner === homeTeam;
        const isAwayWin = g.winner === awayTeam;
        return (
          <Link key={i} href={g.gameId ? `/game/${g.gameId}` : "#"}
            className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] rounded px-1 text-xs group">
            <span className="text-[#374151] w-16 shrink-0">{g.date}</span>
            <span className={`flex-1 truncate text-right ${isHomeWin ? "text-white font-medium" : "text-[#9CA3AF]"}`}>{g.homeTeam}</span>
            <span className="font-bold text-white tabular-nums w-12 text-center shrink-0">{g.score}</span>
            <span className={`flex-1 truncate ${isAwayWin ? "text-white font-medium" : "text-[#9CA3AF]"}`}>{g.awayTeam}</span>
            <span className={`text-[10px] px-1.5 py-px rounded font-bold shrink-0 ${
              isHomeWin ? "bg-[#3B82F6]/20 text-[#3B82F6]" :
              isAwayWin ? "bg-white/10 text-[#9CA3AF]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
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
              <span className="text-[#374151] uppercase text-[10px] tracking-wider flex-1 text-center">{k}</span>
              <span className="text-[#9CA3AF] tabular-nums w-12 text-right">{stats.away[k] ?? "—"}</span>
            </div>
            <div className="flex gap-1 h-[3px]">
              <div className="flex-1 bg-white/5 rounded-full overflow-hidden flex justify-end">
                <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${(hv/max)*100}%` }} />
              </div>
              <div className="flex-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-[#9CA3AF] rounded-full" style={{ width: `${(av/max)*100}%` }} />
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
            <span className="text-xs text-[#9CA3AF]">{t.shortName}</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-1 text-[#374151]">Player</th>
                {headers.map(h => <th key={h} className="text-right py-1 px-1 text-[#374151]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((r, i) => (
                <tr key={i} className="border-b border-white/[0.03] last:border-0">
                  <td className="py-1 text-[#E5E7EB] truncate max-w-[100px]">{r.player}</td>
                  {headers.map(h => (
                    <td key={h} className="py-1 px-1 text-right text-[#9CA3AF] tabular-nums">
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

function AFLPlayerList({ rows, headers }: { rows: import("@/lib/types").BoxScoreRow[]; headers: string[] }) {
  const showHeaders = headers.slice(0, 7);
  if (!rows.length) return <p className="text-xs text-[#374151]">No data available.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[360px]">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left py-1.5 pr-2 text-[#374151]">Player</th>
            {showHeaders.map(h => <th key={h} className="text-right py-1.5 px-1 text-[#374151]">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.03]">
              <td className="py-1.5 pr-2 text-white truncate max-w-[120px]">{r.player}</td>
              {showHeaders.map(h => {
                const v = r.stats[h];
                const hi = h === "D" && Number(v) >= 25;
                return (
                  <td key={h} className={`py-1.5 px-1 text-right tabular-nums ${hi ? "text-[#3B82F6] font-bold" : "text-[#9CA3AF]"}`}>
                    {v ?? "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SofascoreList({ players, sport }: { players: any[]; sport: string }) {
  const isSoccer = ["soccer","ucl","uel","laliga","bundesliga","aleague"].includes(sport);
  const isNBA = sport === "basketball";
  const keys = isSoccer
    ? ["minutesPlayed","goals","goalAssist","totalShot","totalTackle","rating"]
    : ["secondsPlayed","points","rebounds","assists","steals","blocks","rating"];
  const labels: Record<string, string> = {
    minutesPlayed:"MIN",goals:"G",goalAssist:"A",totalShot:"SH",totalTackle:"TKL",rating:"RTG",
    secondsPlayed:"MIN",points:"PTS",rebounds:"REB",assists:"AST",steals:"STL",blocks:"BLK",
  };
  const starters = players.filter(p => p.starter);
  if (!starters.length) return <p className="text-xs text-[#374151]">No lineup data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[360px]">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left py-1.5 text-[#374151]">Player</th>
            {keys.map(k => <th key={k} className="text-right py-1.5 px-1 text-[#374151]">{labels[k]??k}</th>)}
          </tr>
        </thead>
        <tbody>
          {starters.map(p => {
            const mins = isNBA && p.stats.secondsPlayed != null ? Math.round(p.stats.secondsPlayed/60) : p.stats.minutesPlayed;
            return (
              <tr key={p.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.03]">
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[#374151] font-mono text-[10px] w-3">{p.jerseyNumber}</span>
                    <span className="text-white truncate max-w-[90px]">{p.shortName}</span>
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
                    <td key={k} className="py-1.5 px-1 text-right text-[#9CA3AF] tabular-nums">
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

function MatchIncidents({ incidents, homeTeam, awayTeam }: {
  incidents: SofascoreIncident[]; homeTeam: string; awayTeam: string;
}) {
  const filtered = incidents.filter(i => i.type === "goal" || i.type === "card" || i.type === "substitution");
  if (!filtered.length) return <p className="text-xs text-[#374151]">No events recorded.</p>;
  return (
    <div>
      {filtered.map((inc, idx) => {
        const isHome = inc.isHome;
        const min = `${inc.minute}${inc.addedTime ? `+${inc.addedTime}` : ""}′`;
        let icon = "·"; let cls = "text-[#374151]"; let label = "";
        if (inc.type === "goal") {
          icon = "⚽"; cls = "text-[#22C55E]";
          label = inc.playerName ?? "?";
          if (inc.assistName) label += ` (${inc.assistName})`;
          if (inc.incidentClass === "penalty") label += " [P]";
          if (inc.incidentClass === "ownGoal") { icon = "⚽"; cls = "text-[#EF4444]"; label += " [OG]"; }
        } else if (inc.type === "card") {
          icon = inc.incidentClass === "yellow" ? "🟨" : "🟥";
          cls  = inc.incidentClass === "yellow" ? "text-[#F59E0B]" : "text-[#EF4444]";
          label = inc.playerName ?? "?";
        } else {
          icon = "↕"; cls = "text-[#3B82F6]";
          label = `${inc.playerInName ?? "?"} ↑ / ${inc.playerOutName ?? "?"} ↓`;
        }
        return (
          <div key={idx} className={`flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0 text-xs ${isHome ? "" : "flex-row-reverse"}`}>
            <span className="text-[#374151] w-8 shrink-0 text-center">{min}</span>
            <span className={`shrink-0 ${cls}`}>{icon}</span>
            <div className={`flex-1 ${isHome ? "text-left" : "text-right"}`}>
              <span className="text-[#E5E7EB]">{label}</span>
              <span className="text-[#374151] ml-1">· {isHome ? homeTeam : awayTeam}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DATA BUILDER
// ═══════════════════════════════════════════════════════════

async function buildESPNGame(id: string, sport: keyof typeof ESPN_PATHS, eventId: string, h2hFilter: VenueFilter): Promise<Game | null> {
  const [events, summary] = await Promise.all([
    fetchESPNScoreboard(sport),
    fetchESPNSummary(sport, eventId),
  ]);

  let raw = events.find((e: any) => e.id === eventId);
  if (!raw && summary.homeTeamId) {
    const sched = await fetchTeamSchedule(sport, summary.homeTeamId);
    raw = sched.find((e: any) => String(e.id) === eventId);
  }
  if (!raw) return null;

  const base = transformESPNEvent(raw, sport);
  if (!base) return null;

  const homeId = summary.homeTeamId;
  const awayId = summary.awayTeamId;
  let h2h = base.h2h;

  if (homeId && awayId) {
    const [hs, as_] = await Promise.all([fetchTeamSchedule(sport, homeId), fetchTeamSchedule(sport, awayId)]);
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
      h2h = findH2HFromSchedule(hs, base.homeTeam.name, awayId, { limit: 10, filter: h2hFilter, sport });
    }
  }

  for (const inj of summary.injuries ?? []) {
    const team = inj.teamName === base.homeTeam.name ? base.homeTeam : inj.teamName === base.awayTeam.name ? base.awayTeam : null;
    if (!team) continue;
    team.players.push({ name: inj.player, position: inj.position, stats: {}, injured: true, injuryNote: `${inj.status} — ${inj.note}` });
  }

  const isIndoor = sport === "basketball";
  const weather  = summary.weather && !isIndoor ? summary.weather : await fetchWeather(base.city, isIndoor);
  const betRisk  = calcBetRisk(base.homeTeam, base.awayTeam, weather, (summary.injuries ?? []).length, h2h.filter(g => g.winner === base.homeTeam.name).length, h2h.length);

  return { ...base, h2h, weather, betRisk, boxScore: summary.boxScore, teamStats: summary.teamStats, lineScores: summary.lineScores } as Game;
}

// ═══════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════

interface ProbCard { label: string; value: number; conf: "high"|"medium"|"low"; }

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

interface Insight { icon: string; text: string; }

function generateInsights(game: Game, h2h: H2HGame[], homeHist: any[], awayHist: any[], isSoccer: boolean, isAFL: boolean): Insight[] {
  const out: Insight[] = [];
  const { homeTeam, awayTeam } = game;
  const n = h2h.length;

  if (n>=3) {
    const hw = h2h.filter(g=>g.winner===homeTeam.name).length;
    const aw = n-hw-h2h.filter(g=>g.winner==="Draw").length;
    if (hw>aw) out.push({ icon:"◆", text:`${homeTeam.shortName} lead ${hw}-${aw} in last ${n} meetings` });
    else if (aw>hw) out.push({ icon:"◆", text:`${awayTeam.shortName} lead ${aw}-${hw} in last ${n} meetings` });
    else out.push({ icon:"◆", text:`Evenly matched — ${hw} wins each in last ${n} meetings` });
  }

  // Home form at home
  const homeAtHome = homeHist.filter(g=>g.homeAway==="home"&&g.result);
  const homeHomeW  = homeAtHome.filter(g=>g.result==="W").length;
  if (homeAtHome.length>=3 && homeHomeW>=homeAtHome.length-1)
    out.push({ icon:"◈", text:`${homeTeam.shortName} unbeaten in last ${homeAtHome.length} home games` });
  else if (homeAtHome.length>=3 && homeHomeW>=Math.ceil(homeAtHome.length*0.6))
    out.push({ icon:"◈", text:`${homeTeam.shortName} win ${homeHomeW} of last ${homeAtHome.length} at home` });

  // Away form
  const awayAway = awayHist.filter(g=>g.homeAway==="away"&&g.result);
  const awayAwayW = awayAway.filter(g=>g.result==="W").length;
  if (awayAway.length>=3 && awayAwayW>=Math.ceil(awayAway.length*0.5))
    out.push({ icon:"◇", text:`${awayTeam.shortName} win ${awayAwayW} of last ${awayAway.length} away` });

  // Goals (soccer)
  if (isSoccer && n>=3) {
    const goals  = h2h.map(g=>{const p=g.score.split("-").map(Number);return(p[0]??0)+(p[1]??0);});
    const over25 = goals.filter(v=>v>2.5).length;
    if (over25>=Math.ceil(n*0.6)) out.push({ icon:"⚽", text:`Over 2.5 goals in ${over25} of last ${n} H2H` });
    const btts = h2h.filter(g=>{const p=g.score.split("-").map(Number);return(p[0]??0)>0&&(p[1]??0)>0;}).length;
    if (btts>=Math.ceil(n*0.6)) out.push({ icon:"⚽", text:`Both teams scored in ${btts} of last ${n} H2H` });
  }

  // Streaks
  const streak = (form: string[], r: string) => { let s=0; for (const x of form){if(x===r)s++;else break;} return s; };
  const hs = streak(homeTeam.form,"W");
  const as_ = streak(awayTeam.form,"W");
  if (hs>=3) out.push({ icon:"◉", text:`${homeTeam.shortName} on a ${hs}-match winning streak` });
  if (as_>=3) out.push({ icon:"◉", text:`${awayTeam.shortName} on a ${as_}-match winning streak` });

  return out.slice(0,6);
}
