/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Link from "next/link";
import type { Game, Team, H2HGame, BoxScore, BoxScoreRow, Insight } from "@/lib/types";
import type { AFLInsight } from "@/lib/sports/afl/insights";
import type { ESPNPlayer, ESPNInjury } from "@/lib/sports/espnPlayers";
import type { SofascoreMatchData, SofascoreIncident } from "@/lib/sports/sofascore";
import type { AFLMatchAnalytics } from "@/lib/sports/afl/analytics";
import type { SoccerMatchAnalytics } from "@/lib/sports/soccer/analytics";
import type { NBAMatchAnalytics } from "@/lib/sports/nba/analytics";
import type { TeamHistoryGame, VenueFilter } from "@/lib/sports/espn";
import FormPills from "@/components/FormPills";
import SquadList from "@/components/SquadList";
import AFLDashboard from "@/components/afl/AFLDashboard";
import SoccerDashboard from "@/components/soccer/SoccerDashboard";
import NBADashboard from "@/components/nba/NBADashboard";
import NBAPlayerList from "@/components/nba/NBAPlayerList";

import PlayerDrawer from "@/components/afl/PlayerDrawer";
import PlayerAvatar from "@/components/afl/PlayerAvatar";

import type { AFLPlayerAnalyticsResult } from "@/lib/sports/afl/players/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "players",  label: "Players"  },
  { key: "stats",    label: "Stats"    },
  { key: "h2h",      label: "H2H"      },
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
  soccerAnalytics:    SoccerMatchAnalytics | null;
  nbaAnalytics:       NBAMatchAnalytics | null;
  sofascore:          SofascoreMatchData | null;
  insights:           AFLInsight[];
  isSoccer:           boolean;
  isBasketball:       boolean;
  isAFL:              boolean;
  initialTab:         string;
  initialH2hFilter:   VenueFilter;
  initialHistoryFilter: VenueFilter;
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {

  return (
    <div className="bg-[#111827] rounded-xl p-4 border border-white/[0.04]">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#374151] mb-3">{title}</h3>
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

function AFLPlayerList({ 
  rows, 
  headers,
  teamId,
  opponent,
  matchContext
}: { 
  rows: BoxScoreRow[]; 
  headers: string[];
  teamId?: string;
  opponent?: string;
  matchContext?: "home" | "away";
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; position?: string; jersey?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerData, setDrawerData] = useState<AFLPlayerAnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showHeaders = headers.slice(0, 7);
  if (!rows.length) return <p className="text-xs text-[#374151]">No data available.</p>;

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
      <table className="w-full text-xs min-w-[360px]">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left py-1.5 pr-2 text-[#374151]">Player</th>
            {showHeaders.map(h => <th key={h} className="text-right py-1.5 px-1 text-[#374151]">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr 
              key={i} 
              className={`border-b border-white/[0.03] last:border-0 hover:bg-white/[0.03] transition-colors ${r.playerId ? "cursor-pointer" : ""}`}
              onClick={() => handlePlayerClick(r)}
            >
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-1.5">
                  <PlayerAvatar
                    src={r.headshot}
                    name={r.player}
                    size={20}
                  />
                  <span className="text-white truncate max-w-[120px] font-medium group-hover:text-[#3B82F6]">{r.player}</span>
                  {r.playerId && <span className="text-[9px] text-[#374151]">INTEL</span>}
                </div>
              </td>
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

      {/* Drawer */}
      {selectedPlayer && (
        <>
          {loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-xl bg-[#0B0F1A] border-l border-[#3B82F6]/20 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest">Loading Intel: {selectedPlayer.name}</p>
                </div>
              </div>
            </>
          )}
          {error && !loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60]" onClick={handleClose} />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-xl bg-[#0B0F1A] border-l border-[#3B82F6]/20 flex items-center justify-center">
                <div className="text-center px-10">
                  <p className="text-[#EF4444] font-bold mb-4 uppercase tracking-tight">{error}</p>
                  <button onClick={handleClose} className="text-xs font-black text-[#6B7280] hover:text-white underline uppercase tracking-widest">Close</button>
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


function BasketballOverview({ game, insights, sofascore, homeHistory, awayHistory, homeSquad, awaySquad, homeInjuries, awayInjuries, h2h }: {
  game: Game; insights: Insight[]; sofascore: SofascoreMatchData | null;
  homeHistory: TeamHistoryGame[]; awayHistory: TeamHistoryGame[];
  homeSquad: ESPNPlayer[]; awaySquad: ESPNPlayer[];
  homeInjuries: ESPNInjury[]; awayInjuries: ESPNInjury[];
  h2h: H2HGame[];
}) {
  const { homeTeam, awayTeam } = game;
  const isUpcoming = game.status === "upcoming";
  const homePlayers = sofascore?.lineups?.home ?? [];
  const awayPlayers = sofascore?.lineups?.away ?? [];
  const hasPerformers = homePlayers.length > 0 || awayPlayers.length > 0;
  const homeStarters = homeSquad.slice(0, 5);
  const awayStarters = awaySquad.slice(0, 5);
  const allInjuries = [...homeInjuries, ...awayInjuries];

  return (
    <div className="space-y-4">
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

      {isUpcoming && h2h.length > 0 && (
        <Section title="Head-to-Head">
          <H2HPanel h2h={h2h} homeTeam={homeTeam.name} awayTeam={awayTeam.name} compact />
        </Section>
      )}

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

      {game.teamStats && (
        <Section title="Season Stats">
          <ComparisonBars homeTeam={homeTeam} awayTeam={awayTeam} stats={game.teamStats} compact />
        </Section>
      )}
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
                  <span className="text-xs font-medium text-[#6B7280]">{t.shortName}</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center py-1.5 border-b border-white/[0.04] last:border-0 text-xs gap-2">
                    <span className="text-white flex-1 truncate">{row.player}</span>
                    <div className="flex items-center gap-2 text-[#9CA3AF] shrink-0">
                      {KEY_STATS.filter(k => row.stats[k] != null).map(k => (
                        <span key={k} className="tabular-nums">
                          <span className="text-[#374151] text-[9px]">{k} </span>
                          <span className={k==="D"&&Number(row.stats[k])>=25?"text-[#3B82F6] font-bold":""}>{row.stats[k]}</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
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
                        <span className="text-xs font-semibold text-white">{t.shortName}</span>
                        <span className="text-[9px] text-[#6B7280] ml-1">{role}</span>
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
                        <div key={label} className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0 text-xs">
                          <span className="text-[#4B5563]">{label}</span>
                          <span className="text-[#D1D5DB] font-medium tabular-nums">{value}</span>
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
                        <div className="text-xl font-black text-[#3B82F6]">{hw}</div>
                        <div className="text-[9px] text-[#374151]">{homeTeam.shortName}</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-xl font-black text-[#F59E0B]">{dr}</div>
                        <div className="text-[9px] text-[#374151]">Draws</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-xl font-black text-[#9CA3AF]">{aw}</div>
                        <div className="text-[9px] text-[#374151]">{awayTeam.shortName}</div>
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
                    className="flex items-center gap-1.5 py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] rounded px-0.5 text-xs">
                    <span className="text-[#374151] w-16 shrink-0 text-[10px]">{g.date}</span>
                    <span className={`flex-1 truncate text-right text-[10px] ${isHW?"text-white font-medium":"text-[#6B7280]"}`}>{g.homeTeam}</span>
                    <span className="font-bold text-white tabular-nums w-12 text-center shrink-0">{g.score}</span>
                    <span className={`flex-1 truncate text-[10px] ${isAW?"text-white font-medium":"text-[#6B7280]"}`}>{g.awayTeam}</span>
                    <span className={`text-[9px] px-1 py-px rounded font-bold shrink-0 ${isHW?"bg-[#3B82F6]/20 text-[#3B82F6]":isAW?"bg-white/10 text-[#9CA3AF]":"bg-[#F59E0B]/20 text-[#F59E0B]"}`}>
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
                        <span className="text-xs font-medium text-[#6B7280]">{t.shortName}</span>
                      </div>
                      {an.last5.map((g,i)=>(
                        <Link key={g.gameId||i} href={g.gameId?`/game/${g.gameId}`:"#"}
                          className="flex items-center gap-1.5 py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] rounded px-0.5 text-xs">
                          <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${g.result==="W"?"bg-[#22C55E]/20 text-[#22C55E]":g.result==="L"?"bg-[#EF4444]/20 text-[#EF4444]":"bg-[#F59E0B]/20 text-[#F59E0B]"}`}>{g.result}</span>
                          <span className="text-[#9CA3AF] w-7 text-[10px] text-center shrink-0">{g.oppAbbr}</span>
                          <span className="text-[#D1D5DB] tabular-nums text-[10px] shrink-0">{g.teamScore}–{g.oppScore}</span>
                          <span className={`tabular-nums text-[9px] shrink-0 ${g.margin>0?"text-[#22C55E]":"text-[#EF4444]"}`}>{g.margin>0?`+${g.margin}`:g.margin}</span>
                          <span className="text-[#4B5563] text-[9px] shrink-0">{g.homeAway}</span>
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
                      <span className="text-[10px] text-[#9CA3AF]">{t.shortName}</span>
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
                            <span className="text-[#4B5563]">{label}</span>
                            <span className="text-[#D1D5DB] tabular-nums">{rec.wins}W {rec.losses}L</span>
                          </div>
                          <div className="h-[2px] bg-white/5 rounded-full">
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
                  <div className={`text-sm font-medium ${weather.windKph>40||["Storm","Rain"].includes(weather.condition)?"text-[#F59E0B]":"text-white"}`}>
                    {weather.condition}
                  </div>
                  <div className="text-xs text-[#6B7280]">{weather.tempC}°C · {weather.windKph} km/h wind</div>
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
                        <span className="text-[10px] font-medium text-[#9CA3AF]">{t.shortName}</span>
                      </div>
                      {!hasAny&&<p className="text-[10px] text-[#22C55E]">✓ None</p>}
                      {out.length>0&&(
                        <div className="mb-1.5">
                          <div className="text-[9px] text-[#EF4444] uppercase tracking-widest mb-0.5">Out</div>
                          {out.map((p,i)=>(
                            <div key={i} className="text-[10px] text-[#D1D5DB] truncate py-0.5 border-b border-white/[0.03]">
                              {p.playerName}{p.note?<span className="text-[#4B5563] ml-1">·{p.note.slice(0,12)}</span>:null}
                            </div>
                          ))}
                        </div>
                      )}
                      {doubtful.length>0&&(
                        <div>
                          <div className="text-[9px] text-[#F59E0B] uppercase tracking-widest mb-0.5">Doubtful</div>
                          {doubtful.map((p,i)=>(
                            <div key={i} className="text-[10px] text-[#D1D5DB] truncate py-0.5 border-b border-white/[0.03]">{p.playerName}</div>
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
                      <span className="text-[#374151] uppercase text-[9px] tracking-wide flex-1 text-center">{key}</span>
                      <span className="text-[#9CA3AF] tabular-nums w-8 text-right">{av}</span>
                    </div>
                    <div className="flex gap-0.5 h-[2px]">
                      <div className="flex-1 bg-white/5 rounded-full overflow-hidden flex justify-end">
                        <div className="h-full bg-[#3B82F6] rounded-full" style={{width:`${(hv/max)*100}%`}}/>
                      </div>
                      <div className="flex-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-[#9CA3AF] rounded-full" style={{width:`${(av/max)*100}%`}}/>
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
                    <span className="text-[#3B82F6] shrink-0">{ins.icon}</span>
                    <span className="text-[#E5E7EB] leading-snug">{ins.text}</span>
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

// ─── Main export ──────────────────────────────────────────────────────────────

export default function GameDetailTabs({
  game, id, homeSquad, awaySquad, homeInjuries, awayInjuries,
  homeHistories, awayHistories, h2hVariants, aflAnalytics, soccerAnalytics,
  nbaAnalytics, sofascore, insights, isSoccer, isBasketball, isAFL,
  initialTab, initialH2hFilter, initialHistoryFilter,
}: GameDetailTabsProps) {
  const [tab, setTab] = useState<"overview"|"players"|"stats"|"h2h">(
    (["overview","players","stats","h2h"].includes(initialTab) ? initialTab : "overview") as "overview"|"players"|"stats"|"h2h"
  );
  const [h2hFilter, setH2hFilter] = useState<VenueFilter>(initialH2hFilter);
  const [historyFilter, setHistoryFilter] = useState<VenueFilter>(initialHistoryFilter);

  const currentHomeHistory = homeHistories[historyFilter];
  const currentAwayHistory = awayHistories[historyFilter];
  const currentH2H = h2hVariants[h2hFilter];
  const h2hForOverview = h2hVariants.all;

  const { homeTeam, awayTeam, boxScore } = game;
  const sport = game.sport;

  return (
    <>
      {/* Tab bar — visually continues the hero card */}
      <div className="bg-[#111827] rounded-b-2xl overflow-hidden mb-4">
        <div className="flex border-t border-white/5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-center text-sm font-medium relative transition-colors ${
                tab === t.key
                  ? "text-white after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:bg-[#3B82F6] after:rounded-full"
                  : "text-[#9CA3AF] hover:text-white"
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
          ? <SoccerDashboard
              game={game} insights={insights}
              homeHistory={currentHomeHistory} awayHistory={currentAwayHistory}
              h2h={h2hForOverview} historyFilter={historyFilter}
              onHistoryFilterChange={setHistoryFilter}
              analytics={soccerAnalytics} sofascore={sofascore}
            />
          : isBasketball

          ? <NBADashboard
              game={game} insights={insights}
              homeHistory={currentHomeHistory} awayHistory={currentAwayHistory}
              homeInjuries={homeInjuries} awayInjuries={awayInjuries}
              h2h={h2hForOverview} analytics={nbaAnalytics}
              historyFilter={historyFilter} onHistoryFilterChange={setHistoryFilter}
            />
          : isAFL
          ? <AFLDashboard
              game={game} insights={insights}
              homeHistory={currentHomeHistory} awayHistory={currentAwayHistory}
              homeInjuries={homeInjuries} awayInjuries={awayInjuries}
              h2h={h2hForOverview} analytics={aflAnalytics}
              historyFilter={historyFilter} onHistoryFilterChange={setHistoryFilter}
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
            <Section title="Match Events">
              <MatchIncidents incidents={sofascore.incidents} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
            </Section>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title={`${homeTeam.shortName} — Players`}>
              {isBasketball ? (
                <NBAPlayerList
                  players={homeSquad}
                  injuries={homeInjuries}
                  teamName={homeTeam.name}
                  teamLogo={homeTeam.logoUrl}
                  teamEspnId={homeTeam.espnId}
                  matchContext="home"
                  opponent={awayTeam.name}
                />
              ) : isAFL && boxScore ? (
                <AFLPlayerList
                  rows={boxScore.home}
                  headers={boxScore.statHeaders}
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
              {isBasketball ? (
                <NBAPlayerList
                  players={awaySquad}
                  injuries={awayInjuries}
                  teamName={awayTeam.name}
                  teamLogo={awayTeam.logoUrl}
                  teamEspnId={awayTeam.espnId}
                  matchContext="away"
                  opponent={homeTeam.name}
                />
              ) : isAFL && boxScore ? (
                <AFLPlayerList
                  rows={boxScore.away}
                  headers={boxScore.statHeaders}
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
        </div>
      )}

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      {tab === "stats" && (
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

      {/* ── H2H ─────────────────────────────────────────────────────────── */}
      {tab === "h2h" && (
        <Section title="Head-to-Head">
          <div className="flex gap-2 mb-4">
            {(["all","home","away"] as VenueFilter[]).map(f => (
              <button key={f} onClick={() => setH2hFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  h2hFilter === f ? "text-[#3B82F6] bg-[#3B82F6]/10" : "text-[#9CA3AF] hover:text-white"
                }`}>
                {f === "all" ? "All" : f === "home" ? "Home" : "Away"}
              </button>
            ))}
          </div>
          {currentH2H.length > 0
            ? <H2HPanel h2h={currentH2H} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
            : <p className="text-sm text-[#374151]">No head-to-head data.</p>}
        </Section>
      )}
    </>
  );
}
