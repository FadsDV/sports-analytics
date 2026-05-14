/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Link from "next/link";
import type { Game, Team, H2HGame, BoxScore, BoxScoreRow, Insight } from "@/lib/types";
import type { AFLInsight } from "@/lib/sports/afl/insights";
import type { ESPNPlayer, ESPNInjury } from "@/lib/sports/espnPlayers";
import type { SofascoreMatchData, SofascoreIncident } from "@/lib/sports/sofascore";
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

function NBAPlayerList({
  rows,
  headers,
  teamId,
  opponent,
  matchContext,
}: {
  rows:          BoxScoreRow[];
  headers:       string[];
  teamId?:       string;
  opponent?:     string;
  matchContext?: "home" | "away";
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading]               = useState(false);
  const [drawerData, setDrawerData]         = useState<NBAPlayerAnalyticsResult | null>(null);
  const [error, setError]                   = useState<string | null>(null);

  const PREFERRED = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FG", "3PT", "+/-"];
  const displayHeaders = PREFERRED.filter(h => headers.includes(h))
    .concat(headers.filter(h => !PREFERRED.includes(h))).slice(0, 10);

  if (!rows.length) return <p className="text-xs text-[#374151]">No data available.</p>;

  const starters = rows.filter(r => r.starter !== false && rows.some(x => x.starter));
  const bench    = rows.filter(r => r.starter === false);
  const hasGroups = starters.length > 0 && bench.length > 0;
  const groups = hasGroups
    ? [{ label: "STARTERS", rows: starters }, { label: "BENCH", rows: bench }]
    : [{ label: "", rows }];

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
            <th className="text-left py-2 pr-2 text-[#374151] sticky left-0 bg-[#111827]">Player</th>
            {displayHeaders.map(h => (
              <th key={h} className="text-right py-2 px-1.5 text-[#374151] whitespace-nowrap font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ label, rows: groupRows }) => (
            <>
              {label && (
                <tr key={`grp-${label}`}>
                  <td colSpan={displayHeaders.length + 1} className="pt-3 pb-1 px-0">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#374151]">{label}</span>
                  </td>
                </tr>
              )}
              {groupRows.map((r, i) => (
                <tr
                  key={`${label}-${i}`}
                  className={`border-b border-white/[0.03] last:border-0 hover:bg-white/[0.03] transition-colors ${r.playerId && teamId ? "cursor-pointer" : ""}`}
                  onClick={() => handlePlayerClick(r)}
                >
                  <td className="py-2 pr-2 sticky left-0 bg-[#111827]">
                    <div className="flex items-center gap-1.5">
                      <PlayerAvatar src={r.headshot} name={r.player} size={22} />
                      <div className="min-w-0">
                        <span className="text-white truncate max-w-[110px] font-medium block text-[11px] leading-tight">{r.player}</span>
                        {r.position && <span className="text-[9px] text-[#374151] leading-tight">{r.position}</span>}
                      </div>
                      {r.playerId && teamId && (
                        <span className="text-[8px] text-[#1e3a5f] ml-1 shrink-0">INTEL</span>
                      )}
                    </div>
                  </td>
                  {displayHeaders.map(h => {
                    const v  = r.stats[h];
                    const hi = (h === "PTS" && Number(v) >= 25) || (h === "REB" && Number(v) >= 12) || (h === "AST" && Number(v) >= 10);
                    return (
                      <td key={h} className={`py-2 px-1.5 text-right tabular-nums text-[11px] ${
                        hi ? "text-[#3B82F6] font-bold" :
                        h === "+/-" && Number(v) > 0 ? "text-[#22C55E]" :
                        h === "+/-" && Number(v) < 0 ? "text-[#EF4444]" :
                        "text-[#9CA3AF]"
                      }`}>
                        {v == null ? "—" : h === "+/-" && Number(v) > 0 ? `+${v}` : v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>

      {selectedPlayer && (
        <>
          {loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-[80vw] min-w-[320px] bg-[#0B0F1A] border-l border-[#3B82F6]/20 flex items-center justify-center">
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
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-[80vw] min-w-[320px] bg-[#0B0F1A] border-l border-[#3B82F6]/20 flex items-center justify-center">
                <div className="text-center px-10">
                  <p className="text-[#EF4444] font-bold mb-4">{error}</p>
                  <button onClick={handleClose} className="text-xs font-black text-[#6B7280] hover:text-white underline uppercase tracking-widest">Close</button>
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

// ─── Sport overview sections ──────────────────────────────────────────────────

function SoccerOverview({ game, insights, homeHistory, awayHistory, h2h, weather, homeSquad, awaySquad, sofascore, historyFilter, onHistoryFilterChange }: {
  game: Game; insights: Insight[]; weather: any;
  homeHistory: TeamHistoryGame[]; awayHistory: TeamHistoryGame[];
  h2h: H2HGame[]; historyFilter: VenueFilter;
  onHistoryFilterChange: (f: VenueFilter) => void;
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
      {isFinished && sofascore?.incidents && sofascore.incidents.length > 0 && (
        <Section title="Match Events">
          <MatchIncidents incidents={sofascore.incidents} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          {isUpcoming && (homeSquad.length > 0 || awaySquad.length > 0) && (
            <Section title="Probable Lineups">
              <div className="grid grid-cols-2 gap-4">
                {[{ t: homeTeam, squad: homeSquad }, { t: awayTeam, squad: awaySquad }].map(({ t, squad }) => {
                  const starters = squad.sort((a, b) => (a.position || "").localeCompare(b.position || "")).slice(0, 11);
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

          {h2h.length > 0 && (
            <Section title="Head-to-Head">
              <H2HPanel h2h={h2h} homeTeam={homeTeam.name} awayTeam={awayTeam.name} compact />
            </Section>
          )}

          <Section title="Recent Results">
            <div className="flex gap-2 mb-3">
              {(["all","home","away"] as VenueFilter[]).map(f => (
                <button key={f} onClick={() => onHistoryFilterChange(f)}
                  className={`text-xs px-2 py-1 rounded transition-all ${
                    historyFilter === f ? "text-[#3B82F6]" : "text-[#374151] hover:text-[#9CA3AF]"
                  }`}>
                  {f === "all" ? "All" : f === "home" ? "Home" : "Away"}
                </button>
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

        <div className="lg:col-span-2 space-y-4">
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

          <Section title="Home / Away">
            {[
              { label: `${homeTeam.shortName} Home`, split: homeTeam.splits.home },
              { label: `${awayTeam.shortName} Away`,  split: awayTeam.splits.away },
            ].map(({ label, split }) => {
              const total = split.wins + split.losses + (split.draws ?? 0);
              const pct   = total > 0 ? Math.round((split.wins/total)*100) : 0;
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
      </div>
    </div>
  );
}

// ─── NBA quarter flow ─────────────────────────────────────────────────────────

function NBAQuarterFlow({ game }: { game: Game }) {
  const { lineScores, score, homeTeam, awayTeam, status } = game;
  if (!lineScores || !score) return null;

  const { home: hQ, away: aQ } = lineScores;
  const periods = Math.max(hQ.length, aQ.length, 4);
  const labels  = Array.from({ length: periods }, (_, i) => i < 4 ? `Q${i+1}` : `OT${i-3}`);

  // Running totals
  let hRunning = 0, aRunning = 0;
  const snapshots = labels.map((_, i) => {
    hRunning += hQ[i] ?? 0;
    aRunning += aQ[i] ?? 0;
    return { h: hRunning, a: aRunning, diff: hRunning - aRunning };
  });

  const maxQ = Math.max(...hQ, ...aQ, 1);
  const biggestLead = Math.max(...snapshots.map(s => Math.abs(s.diff)));
  const leadChanges = snapshots.filter((s, i) => {
    if (i === 0) return false;
    const prev = snapshots[i - 1]!;
    return (prev.diff > 0 && s.diff < 0) || (prev.diff < 0 && s.diff > 0) || (prev.diff !== 0 && s.diff === 0);
  }).length;

  const currentDiff = (score.home ?? 0) - (score.away ?? 0);
  const leadTeam = currentDiff > 0 ? homeTeam.shortName : currentDiff < 0 ? awayTeam.shortName : null;

  return (
    <div className="bg-[#111827] rounded-xl p-4 border border-white/[0.04]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#374151]">Quarter by Quarter</h3>
        <div className="flex items-center gap-4 text-[10px]">
          {leadTeam && status !== "upcoming" && (
            <span className="text-[#3B82F6] font-bold">
              {leadTeam} {Math.abs(currentDiff) > 0 ? `+${Math.abs(currentDiff)}` : "tied"}
            </span>
          )}
          {biggestLead > 0 && <span className="text-[#374151]">Max lead: <span className="text-[#9CA3AF]">{biggestLead}</span></span>}
          {leadChanges > 0 && <span className="text-[#374151]">Lead changes: <span className="text-[#9CA3AF]">{leadChanges}</span></span>}
        </div>
      </div>

      {/* Quarter score grid */}
      <div className="grid mb-4" style={{ gridTemplateColumns: `auto repeat(${periods}, 1fr) auto` }}>
        <div className="text-[9px] text-[#374151] py-1" />
        {labels.map(l => (
          <div key={l} className="text-[9px] text-[#374151] text-center py-1 font-medium uppercase">{l}</div>
        ))}
        <div className="text-[9px] text-[#374151] text-right py-1 font-bold uppercase pr-1">TOT</div>

        {/* Home row */}
        <div className="flex items-center gap-1.5 py-2 pr-2">
          {homeTeam.logoUrl && <img src={homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain" />}
          <span className="text-[11px] text-[#9CA3AF] font-medium">{homeTeam.shortName}</span>
        </div>
        {labels.map((_, i) => {
          const v = hQ[i] ?? 0;
          const isMax = v === Math.max(hQ[i] ?? 0, aQ[i] ?? 0) && v > 0;
          return (
            <div key={i} className="text-center py-2">
              <span className={`text-xs tabular-nums font-semibold ${isMax ? "text-white" : "text-[#6B7280]"}`}>{v || "-"}</span>
            </div>
          );
        })}
        <div className="text-right py-2 pr-1">
          <span className="text-sm font-black text-white tabular-nums">{score.home}</span>
        </div>

        {/* Away row */}
        <div className="flex items-center gap-1.5 py-2 pr-2">
          {awayTeam.logoUrl && <img src={awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain" />}
          <span className="text-[11px] text-[#9CA3AF] font-medium">{awayTeam.shortName}</span>
        </div>
        {labels.map((_, i) => {
          const v = aQ[i] ?? 0;
          const isMax = v === Math.max(hQ[i] ?? 0, aQ[i] ?? 0) && v > 0;
          return (
            <div key={i} className="text-center py-2">
              <span className={`text-xs tabular-nums font-semibold ${isMax ? "text-white" : "text-[#6B7280]"}`}>{v || "-"}</span>
            </div>
          );
        })}
        <div className="text-right py-2 pr-1">
          <span className="text-sm font-black text-[#9CA3AF] tabular-nums">{score.away}</span>
        </div>
      </div>

      {/* Quarter bars */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${periods}, 1fr)` }}>
        {labels.map((l, i) => {
          const hv = hQ[i] ?? 0;
          const av = aQ[i] ?? 0;
          const hPct = Math.round((hv / maxQ) * 100);
          const aPct = Math.round((av / maxQ) * 100);
          const label = l;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-full h-10 flex items-end gap-0.5">
                <div className="flex-1 bg-[#3B82F6]/80 rounded-t" style={{ height: `${Math.max(hPct, 4)}%` }} title={`${homeTeam.shortName}: ${hv}`} />
                <div className="flex-1 bg-[#9CA3AF]/40 rounded-t" style={{ height: `${Math.max(aPct, 4)}%` }} title={`${awayTeam.shortName}: ${av}`} />
              </div>
              <span className="text-[9px] text-[#374151]">{label}</span>
            </div>
          );
        })}
      </div>

      {/* Scoring run momentum */}
      <div className="mt-3 pt-3 border-t border-white/[0.04]">
        <div className="text-[9px] text-[#374151] mb-2 uppercase tracking-widest font-semibold">Score Progression</div>
        <div className="relative h-6 bg-white/[0.03] rounded-full overflow-hidden">
          {snapshots.map((s, i) => {
            const x = ((i + 1) / snapshots.length) * 100;
            const diff = s.diff;
            const barH = Math.min(Math.abs(diff) / (biggestLead || 1) * 100, 100);
            return (
              <div
                key={i}
                className={`absolute bottom-0 w-[2px] rounded-t ${diff > 0 ? "bg-[#3B82F6]" : diff < 0 ? "bg-[#9CA3AF]" : "bg-white/20"}`}
                style={{ left: `${x}%`, height: `${Math.max(barH, 8)}%` }}
                title={`After ${labels[i]}: ${homeTeam.shortName} ${s.h > s.a ? "+" : ""}${s.diff}`}
              />
            );
          })}
          <div className="absolute inset-y-0 w-[1px] bg-white/10 left-1/2" />
        </div>
        <div className="flex justify-between text-[9px] text-[#374151] mt-1">
          <span className="text-[#3B82F6]">{homeTeam.shortName} lead</span>
          <span className="text-[#9CA3AF]">{awayTeam.shortName} lead</span>
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
  const homePlayers = sofascore?.lineups?.home ?? [];
  const awayPlayers = sofascore?.lineups?.away ?? [];
  const hasPerformers = homePlayers.length > 0 || awayPlayers.length > 0;
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
      {/* Quarter flow — live / finished */}
      {!isUpcoming && game.lineScores && <NBAQuarterFlow game={game} />}

      {/* Top performers — finished games */}
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

      {/* Projected starters — upcoming games */}
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
                    <span className="text-xs font-semibold text-white">{t.shortName}</span>
                    <span className="text-[9px] text-[#6B7280] ml-1">{role}</span>
                    {wStreak >= 3 && (
                      <span className="ml-auto text-[9px] font-bold px-1 py-px rounded bg-[#22C55E]/10 text-[#22C55E]">{wStreak}W</span>
                    )}
                    {lStreak >= 3 && (
                      <span className="ml-auto text-[9px] font-bold px-1 py-px rounded bg-[#EF4444]/10 text-[#EF4444]">{lStreak}L</span>
                    )}
                  </div>
                  <div className="flex gap-1 mb-3">
                    {t.form.map((r, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${
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
                    <div key={label} className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0 text-xs">
                      <span className="text-[#4B5563]">{label}</span>
                      <span className="text-[#D1D5DB] font-medium tabular-nums">{value}</span>
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
                    <div className="text-[10px] uppercase tracking-widest text-[#374151] mb-1.5">{t.shortName}</div>
                    {h.slice(0, 6).map(g => (
                      <Link key={g.gameId} href={`/game/${g.gameId}`}
                        className="flex items-center justify-between py-1.5 border-b border-white/[0.04] hover:bg-white/[0.03] px-1 rounded text-xs group">
                        <span className="text-[#9CA3AF] truncate max-w-[45%]">{g.opponent.split(" ").pop()}</span>
                        <span className={`font-semibold tabular-nums ${g.result === "W" ? "text-[#22C55E]" : g.result === "L" ? "text-[#EF4444]" : "text-[#F59E0B]"}`}>
                          {g.score ?? "—"}
                        </span>
                      </Link>
                    ))}
                    {h.length === 0 && <p className="text-xs text-[#374151]">No data</p>}
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
                        <span className="text-[10px] text-[#9CA3AF]">{t.shortName} {label}</span>
                      </div>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-[#4B5563]">{wins}W {played - wins}L</span>
                        <span className="text-[#D1D5DB] tabular-nums font-medium">{pct}%</span>
                      </div>
                      <div className="h-[2px] bg-white/5 rounded-full">
                        <div className={`h-full rounded-full ${pct >= 50 ? "bg-[#22C55E]" : "bg-[#EF4444]"}`} style={{ width: `${pct}%` }} />
                      </div>
                      {ap > 0 && (
                        <div className="text-[10px] text-[#4B5563]">
                          avg <span className="text-white">{ap}</span> pts scored · <span className="text-[#9CA3AF]">{ao}</span> allowed
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
                  <span className="text-[#6B7280]">H2H Avg Total</span>
                  <span className="text-white font-bold tabular-nums">{h2hAvgTotal}</span>
                </div>
                {h2hOver220 !== null && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#4B5563]">Over 220 pts</span>
                      <span className={`font-bold ${h2hOver220 >= 60 ? "text-[#22C55E]" : h2hOver220 >= 40 ? "text-[#F59E0B]" : "text-[#EF4444]"}`}>{h2hOver220}%</span>
                    </div>
                    <div className="h-[2px] bg-white/5 rounded-full">
                      <div className={`h-full rounded-full ${h2hOver220 >= 60 ? "bg-[#22C55E]" : h2hOver220 >= 40 ? "bg-[#F59E0B]" : "bg-[#EF4444]"}`} style={{ width: `${h2hOver220}%` }} />
                    </div>
                  </div>
                )}
                {h2hOver200 !== null && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#4B5563]">Over 200 pts</span>
                      <span className={`font-bold ${h2hOver200 >= 60 ? "text-[#22C55E]" : h2hOver200 >= 40 ? "bg-[#F59E0B]" : "text-[#EF4444]"}`}>{h2hOver200}%</span>
                    </div>
                    <div className="h-[2px] bg-white/5 rounded-full">
                      <div className={`h-full rounded-full ${h2hOver200 >= 60 ? "bg-[#22C55E]" : h2hOver200 >= 40 ? "bg-[#F59E0B]" : "bg-[#EF4444]"}`} style={{ width: `${h2hOver200}%` }} />
                    </div>
                  </div>
                )}
                {homeAvgPts > 0 && awayAvgPts > 0 && (
                  <div className="pt-2 border-t border-white/[0.04] text-[10px] text-[#4B5563]">
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
                      <span className="text-[#374151] uppercase text-[9px] tracking-wide flex-1 text-center">{key}</span>
                      <span className="text-[#9CA3AF] tabular-nums w-8 text-right">{av || "—"}</span>
                    </div>
                    <div className="flex gap-0.5 h-[2px]">
                      <div className="flex-1 bg-white/5 rounded-full overflow-hidden flex justify-end">
                        <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${(hv / max) * 100}%` }} />
                      </div>
                      <div className="flex-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-[#9CA3AF] rounded-full" style={{ width: `${(av / max) * 100}%` }} />
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
                    <div className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-1.5">{t.shortName}</div>
                    {inj.length === 0
                      ? <p className="text-xs text-[#22C55E]">✓ None reported</p>
                      : inj.slice(0, 4).map((p, i) => (
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
  homeHistories, awayHistories, h2hVariants, aflAnalytics, sofascore,
  insights, isSoccer, isBasketball, isAFL,
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
          ? <SoccerOverview
              game={game} insights={insights} weather={game.weather}
              homeHistory={currentHomeHistory} awayHistory={currentAwayHistory}
              h2h={h2hForOverview} historyFilter={historyFilter}
              onHistoryFilterChange={setHistoryFilter}
              homeSquad={homeSquad} awaySquad={awaySquad} sofascore={sofascore}
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
              {isAFL && boxScore ? (
                <AFLPlayerList
                  rows={boxScore.home}
                  headers={boxScore.statHeaders}
                  teamId={homeTeam.espnId}
                  opponent={awayTeam.name}
                  matchContext="home"
                />
              ) : isBasketball && boxScore ? (
                <NBAPlayerList
                  rows={boxScore.home}
                  headers={boxScore.statHeaders}
                  teamId={homeTeam.espnId}
                  opponent={awayTeam.name}
                  matchContext="home"
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
                />
              ) : isBasketball && boxScore ? (
                <NBAPlayerList
                  rows={boxScore.away}
                  headers={boxScore.statHeaders}
                  teamId={awayTeam.espnId}
                  opponent={homeTeam.name}
                  matchContext="away"
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
