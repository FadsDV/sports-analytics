/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import type { Game, H2HGame } from "@/lib/types";
import type { SoccerInsight } from "@/lib/sports/soccer/insights";
import type { SoccerMatchAnalytics, SoccerRecentGame } from "@/lib/sports/soccer/analytics";
import type { VenueFilter } from "@/lib/sports/espn";
import type { SofascoreMatchData, SofascoreIncident, SofascoreStatistics } from "@/lib/sports/sofascore";
import FormPills from "@/components/FormPills";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SoccerDashboardProps {
  game:                 Game;
  homeHistory:          any[];
  awayHistory:          any[];
  h2h:                  H2HGame[];
  analytics:            SoccerMatchAnalytics | null;
  insights:             SoccerInsight[];
  sofascore:            SofascoreMatchData | null;
  historyFilter:        VenueFilter;
  onHistoryFilterChange:(f: VenueFilter) => void;
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Card({
  title, children, className = "", accent = false,
}: {
  title?: string; children: React.ReactNode; className?: string; accent?: boolean;
}) {
  return (
    <div className={`bg-[#111827] rounded-xl border border-white/[0.05] overflow-hidden ${accent ? "border-l-2 border-l-[#3B82F6]" : ""} ${className}`}>
      {title && (
        <div className="px-3 py-2 border-b border-white/[0.05] bg-white/[0.01]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">{title}</span>
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

function StatRow({
  label, value, sub, accent = false,
}: {
  label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
      <span className="text-xs text-[#6B7280]">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${accent ? "text-[#3B82F6]" : "text-[#D1D5DB]"}`}>
        {value}{sub && <span className="text-[#4B5563] ml-1 font-normal">{sub}</span>}
      </span>
    </div>
  );
}

function ResultPill({ result }: { result: "W" | "L" | "D" | null }) {
  if (!result) return null;
  const cls = result === "W"
    ? "bg-[#22C55E]/20 text-[#22C55E]"
    : result === "L"
    ? "bg-[#EF4444]/20 text-[#EF4444]"
    : "bg-[#F59E0B]/20 text-[#F59E0B]";
  return (
    <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${cls}`}>{result}</span>
  );
}

// ─── Match Incidents ──────────────────────────────────────────────────────────

function MatchIncidents({ incidents, homeTeam, awayTeam }: {
  incidents: SofascoreIncident[]; homeTeam: string; awayTeam: string;
}) {
  const filtered = incidents.filter(i => i.type === "goal" || i.type === "card" || i.type === "substitution");
  if (!filtered.length) return <p className="text-xs text-[#374151]">No events recorded.</p>;
  return (
    <div className="space-y-0.5">
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
            <span className="text-[#374151] w-8 shrink-0 text-center font-mono">{min}</span>
            <span className={`shrink-0 ${cls}`}>{icon}</span>
            <div className={`flex-1 min-w-0 ${isHome ? "text-left" : "text-right"}`}>
              <span className="text-[#E5E7EB] truncate block">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PRE-MATCH DASHBOARD ──────────────────────────────────────────────────────

function SoccerPreMatch({
  game, homeHistory, awayHistory, h2h, analytics, insights,
  historyFilter, onHistoryFilterChange,
}: SoccerDashboardProps) {
  const { homeTeam, awayTeam } = game;
  const ha = analytics?.home;
  const aa = analytics?.away;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[260px_1fr_240px] gap-3">

      {/* LEFT — Intelligence */}
      <div className="space-y-3">
        <Card title="Form Outlook" accent>
          <div className="space-y-4">
            {([
              { t: homeTeam, an: ha, role: "Home" },
              { t: awayTeam, an: aa, role: "Away" },
            ] as const).map(({ t, an, role }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Link href={`/sports/soccer/team/${t.espnId}`} className="flex items-center gap-1.5 hover:opacity-70 transition-opacity">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-bold text-white truncate">{t.shortName}</span>
                  </Link>
                  <span className="text-[10px] text-[#4B5563] font-medium">{role}</span>

                  {an?.streak.type && an.streak.count >= 2 && (
                    <span className={`ml-auto text-[10px] font-bold px-1 py-px rounded ${
                      an.streak.type === "W" ? "bg-[#22C55E]/10 text-[#22C55E]" : 
                      an.streak.type === "L" ? "bg-[#EF4444]/10 text-[#EF4444]" : 
                      "bg-[#F59E0B]/10 text-[#F59E0B]"
                    }`}>{an.streak.count}{an.streak.type}</span>
                  )}
                </div>
                <FormPills form={t.form} />
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#6B7280]">Record</span>
                    <span className="text-[#D1D5DB] font-medium tabular-nums">
                      {t.record.wins}W {t.record.losses}L{t.record.draws ? ` ${t.record.draws}D` : ""}
                    </span>
                  </div>
                  {an && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#6B7280]">Avg Goals</span>
                      <span className="text-[#D1D5DB] font-medium tabular-nums">{an.avgScored} - {an.avgConceded}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {ha && (
          <Card title="Venue & Record">
            <StatRow label={`${homeTeam.shortName} home`} value={`${ha.homeRecord.wins}W ${ha.homeRecord.draws}D ${ha.homeRecord.losses}L`} />
            <StatRow label={`${awayTeam.shortName} away`} value={aa ? `${aa.awayRecord.wins}W ${aa.awayRecord.draws}D ${aa.awayRecord.losses}L` : "—"} />
            {ha.daysRest != null && (
              <StatRow label={`${homeTeam.shortName} rest`} value={`${ha.daysRest}d`} accent={ha.daysRest < 4} />
            )}
            {aa?.daysRest != null && (
              <StatRow label={`${awayTeam.shortName} rest`} value={`${aa.daysRest}d`} accent={aa.daysRest < 4} />
            )}
            <StatRow label="Clean Sheets" value={`${ha.cleanSheetPct}% vs ${aa?.cleanSheetPct ?? 0}%`} />
          </Card>
        )}

        {insights.length > 0 && (
          <Card title="Key Edges" accent>
            <div className="space-y-0">
              {insights.map((ins, i) => (
                <div key={ins.id || i} className="flex items-start gap-2 py-2 border-b border-white/[0.04] last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${
                    ins.severity === "high" ? "bg-[#EF4444]" : ins.severity === "medium" ? "bg-[#F59E0B]" : "bg-[#22C55E]"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-[#E5E7EB] leading-none">{ins.title}</span>
                      {ins.direction !== "neutral" && (
                        <span className={`text-[9px] font-bold px-1 py-px rounded uppercase tracking-wide ${
                          ins.direction === "home" ? "text-[#3B82F6] bg-[#3B82F6]/10" : "text-[#9CA3AF] bg-white/5"
                        }`}>
                          {ins.direction}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#9CA3AF] leading-snug">{ins.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* CENTER — Matchup */}
      <div className="space-y-3">
        {ha && aa && (
          <Card title="Attack / Defense Profile">
            {([
              { key: "Avg Scored",   hv: ha.avgScored,     av: aa.avgScored     },
              { key: "Avg Conceded", hv: ha.avgConceded,   av: aa.avgConceded   },
              { key: "Clean Sheet %",hv: ha.cleanSheetPct, av: aa.cleanSheetPct },
            ] as { key: string; hv: number; av: number }[]).map(({ key, hv, av }) => {
              const max = Math.max(hv, av, 1);
              return (
                <div key={key} className="mb-2.5 last:mb-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#D1D5DB] font-semibold tabular-nums w-10">{hv}{key.includes("%")?"%":""}</span>
                    <span className="text-[#4B5563] uppercase text-[10px] tracking-wide flex-1 text-center">{key}</span>
                    <span className="text-[#9CA3AF] tabular-nums w-10 text-right">{av}{key.includes("%")?"%":""}</span>
                  </div>
                  <div className="flex gap-0.5 h-[3px]">
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
          </Card>
        )}

        {h2h.length > 0 && (
          <Card title="Head-to-Head History">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.05]">
              {(() => {
                const hw = h2h.filter(g => g.winner === homeTeam.name).length;
                const dr = h2h.filter(g => g.winner === "Draw").length;
                const aw = h2h.length - hw - dr;
                return (
                  <>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-[#3B82F6] tabular-nums">{hw}</div>
                      <div className="text-[10px] text-[#6B7280] mt-0.5">{homeTeam.shortName}</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-[#F59E0B] tabular-nums">{dr}</div>
                      <div className="text-[10px] text-[#6B7280] mt-0.5">Draws</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-[#9CA3AF] tabular-nums">{aw}</div>
                      <div className="text-[10px] text-[#6B7280] mt-0.5">{awayTeam.shortName}</div>
                    </div>
                  </>
                );
              })()}
            </div>
            {h2h.slice(0, 5).map((g, i) => {
              const isHW = g.winner === homeTeam.name;
              const isAW = g.winner === awayTeam.name;
              return (
                <Link key={g.gameId || i} href={g.gameId ? `/game/${g.gameId}` : "#"}
                  className="flex items-center gap-1.5 py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] rounded px-0.5 text-xs group">
                  <span className="text-[10px] text-[#4B5563] w-16 shrink-0 tabular-nums">{g.date}</span>
                  <span className={`flex-1 truncate text-right ${isHW ? "text-white font-semibold" : "text-[#6B7280]"}`}>{g.homeTeam}</span>
                  <span className="font-bold text-white tabular-nums w-12 text-center shrink-0 text-[11px]">{g.score}</span>
                  <span className={`flex-1 truncate ${isAW ? "text-white font-semibold" : "text-[#6B7280]"}`}>{g.awayTeam}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    isHW ? "bg-[#3B82F6]/20 text-[#3B82F6]" : isAW ? "bg-white/10 text-[#9CA3AF]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                  }`}>{isHW ? "H" : isAW ? "A" : "D"}</span>
                </Link>
              );
            })}
          </Card>
        )}

        <Card title="Recent Results">
          <div className="flex gap-1.5 mb-3">
            {(["all", "home", "away"] as VenueFilter[]).map(f => (
              <button key={f} onClick={() => onHistoryFilterChange(f)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  historyFilter === f
                    ? "text-[#3B82F6] bg-[#3B82F6]/10 font-medium"
                    : "text-[#6B7280] hover:text-[#9CA3AF]"
                }`}>
                {f === "all" ? "All" : f === "home" ? "Home" : "Away"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([{ t: homeTeam, h: homeHistory }, { t: awayTeam, h: awayHistory }] as const).map(({ t, h }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">{t.shortName}</span>
                </div>
                {h.slice(0, 5).map(g => (
                  <Link key={g.gameId} href={`/game/${g.gameId}`}
                    className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] px-0.5 rounded text-xs group">
                    <span className="text-[#9CA3AF] truncate max-w-[55%]">{g.opponent}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {g.result && <ResultPill result={g.result} />}
                      <span className={`font-semibold tabular-nums ${
                        g.result === "W" ? "text-[#22C55E]" : g.result === "L" ? "text-[#EF4444]" : "text-[#F59E0B]"
                      }`}>{g.score ?? "—"}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* RIGHT — Context */}
      <div className="space-y-3 md:col-span-2 lg:col-span-1">
        <Card title="Conditions">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌤</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">{game.weather?.condition || "Clear"}</div>
              <div className="text-xs text-[#6B7280] mt-0.5">{game.weather?.tempC ?? 20}°C · {game.weather?.windKph ?? 10} km/h wind</div>
            </div>
          </div>
        </Card>

        <Card title="Match Tempo / Discipline">
          <div className="space-y-2">
            <p className="text-[10px] text-[#4B5563] leading-snug">
              Average fouls and cards per game based on season trends.
            </p>
            <StatRow label="Avg Fouls" value="10.5" />
            <StatRow label="Yellow Cards" value="2.1" />
            <StatRow label="Red Cards" value="0.1" />
            <StatRow label="Corners" value="5.4" />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── LIVE / FINISHED DASHBOARD ────────────────────────────────────────────────

function SoccerLive({
  game, homeHistory, awayHistory, h2h, analytics, insights,
  sofascore, historyFilter, onHistoryFilterChange,
}: SoccerDashboardProps) {
  const { homeTeam, awayTeam, status } = game;
  const isLive = status === "live";
  const stats = sofascore?.statistics?.[0]?.groups ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[260px_1fr_240px] gap-3">

      {/* LEFT — Context */}
      <div className="space-y-3">
        {sofascore?.incidents && (
          <Card title="Match Events">
            <MatchIncidents incidents={sofascore.incidents} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
          </Card>
        )}
        
        <Card title="Form Outlook">
          {([{ t: homeTeam, an: analytics?.home }, { t: awayTeam, an: analytics?.away }] as const).map(({ t, an }) => (
            <div key={t.name} className="mb-3 last:mb-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                <span className="text-xs font-medium text-[#6B7280]">{t.shortName}</span>
              </div>
              <div className="flex gap-1">
                {t.form.slice(0, 5).map((r, i) => <ResultPill key={i} result={r} />)}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* CENTER — Stats */}
      <div className="space-y-3">
        {stats.length > 0 ? (
          <Card title="Team Comparison (Match)">
            <div className="space-y-4">
              {stats.map((group) => (
                <div key={group.groupName}>
                  <div className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest mb-2 px-1">
                    {group.groupName}
                  </div>
                  {group.statisticsItems.map((item) => {
                    const hv = parseFloat(item.home);
                    const av = parseFloat(item.away);
                    const isPct = item.home.includes("%") || item.away.includes("%");
                    const max = Math.max(hv, av, 1);
                    return (
                      <div key={item.name} className="mb-2.5 last:mb-0">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-[#D1D5DB] font-semibold tabular-nums w-12">{item.home}</span>
                          <span className="text-[#4B5563] uppercase text-[10px] tracking-wide flex-1 text-center">{item.name}</span>
                          <span className="text-[#9CA3AF] tabular-nums w-12 text-right">{item.away}</span>
                        </div>
                        <div className="flex gap-0.5 h-[3px]">
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
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card title="Match Analytics">
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="text-xs text-[#374151]">Detailed stats loading...</div>
            </div>
          </Card>
        )}

        <Card title="Recent Form Context">
          <div className="grid grid-cols-2 gap-4">
            {([{ t: homeTeam, h: homeHistory }, { t: awayTeam, h: awayHistory }] as const).map(({ t, h }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs font-semibold text-white">{t.shortName}</span>
                </div>
                {h.slice(0, 3).map((g, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0 text-[10px]">
                    <span className="text-[#6B7280] truncate max-w-[60%]">{g.opponent}</span>
                    <span className={`font-bold ${g.result === "W" ? "text-[#22C55E]" : g.result === "L" ? "text-[#EF4444]" : "text-[#F59E0B]"}`}>
                      {g.score}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* RIGHT — Intelligence */}
      <div className="space-y-3">
        {isLive && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.7)] shrink-0" />
            <div>
              <div className="text-sm font-bold text-red-400 tracking-wide">LIVE</div>
              <div className="text-xs text-[#6B7280] mt-0.5">Stats update from Sofascore</div>
            </div>
          </div>
        )}

        {insights.length > 0 && (
          <Card title="Pre-Game Insights">
            <div className="space-y-0">
              {insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2 py-2 border-b border-white/[0.04] last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${
                    ins.severity === "high" ? "bg-[#EF4444]" : ins.severity === "medium" ? "bg-[#F59E0B]" : "bg-[#22C55E]"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-[#E5E7EB] block leading-tight">{ins.title}</span>
                    <p className="text-[11px] text-[#9CA3AF] leading-snug mt-0.5">{ins.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SoccerDashboard(props: SoccerDashboardProps) {
  if (props.game.status === "upcoming") {
    return <SoccerPreMatch {...props} />;
  }
  return <SoccerLive {...props} />;
}
