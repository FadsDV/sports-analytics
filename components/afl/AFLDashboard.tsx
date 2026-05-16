/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Link from "next/link";
import type { Game, Team, H2HGame } from "@/lib/types";
import type { AFLInsight } from "@/lib/sports/afl/insights";
import type { ESPNPlayer, ESPNInjury } from "@/lib/sports/espnPlayers";
import type { AFLMatchAnalytics } from "@/lib/sports/afl/analytics";
import type { TeamHistoryGame, VenueFilter } from "@/lib/sports/espn";
import type { SlipEntry } from "@/lib/sports/slipTracker";
import FormPills from "@/components/FormPills";
import PlayerAvatar from "@/components/afl/PlayerAvatar";
import AFLUpcomingOdds from "./AFLUpcomingOdds";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AFLDashboardProps {
  game:                 Game;
  homeInjuries:         ESPNInjury[];
  awayInjuries:         ESPNInjury[];
  homeHistory:          TeamHistoryGame[];
  awayHistory:          TeamHistoryGame[];
  h2h:                  H2HGame[];
  analytics:            AFLMatchAnalytics | null;
  insights:             AFLInsight[];
  historyFilter:        VenueFilter;
  onHistoryFilterChange:(f: VenueFilter) => void;
  slipColorMap?:        Map<string, SlipEntry[]>;
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

// ─── AFL stat legend ──────────────────────────────────────────────────────────

const AFL_STAT_LEGEND: Record<string, string> = {
  D:  "Disposals",
  K:  "Kicks",
  HB: "Handballs",
  G:  "Goals",
  B:  "Behinds",
  T:  "Tackles",
  M:  "Marks",
  HO: "Hitouts",
  FF: "Free Kicks For",
  FA: "Free Kicks Against",
};

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Card({
  title, children, className = "", accent = false,
}: {
  title?: string; children: React.ReactNode; className?: string; accent?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-xl border border-border ${className.includes("overflow-") ? "" : "overflow-hidden"} ${accent ? "border-l-2 border-l-primary" : ""} ${className}`}>
      {title && (
        <div className="px-3 py-2 border-b border-border bg-surface2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-2">{title}</span>
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
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-text-2">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${accent ? "text-primary" : "text-text-1"}`}>
        {value}{sub && <span className="text-text-2 ml-1 font-normal">{sub}</span>}
      </span>
    </div>
  );
}

function Badge({
  children, color = "blue",
}: {
  children: React.ReactNode; color?: "blue"|"green"|"yellow"|"red"|"gray";
}) {
  const cls = {
    blue:   "bg-primary/10 text-primary",
    green:  "bg-[#22C55E]/10 text-[#22C55E]",
    yellow: "bg-[#F59E0B]/10 text-[#F59E0B]",
    red:    "bg-[#EF4444]/10 text-[#EF4444]",
    gray:   "bg-surface2 text-text-2",
  }[color];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>{children}</span>
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

// ─── Derived analytics ─────────────────────────────────────────────────────────

// computeWinProb removed to improve trust and deterministic data presentation.

// ─── WEATHER ICON MAP ─────────────────────────────────────────────────────────

const WEATHER_ICONS: Record<string, string> = {
  Clear:"☀️","Partly Cloudy":"⛅",Cloudy:"☁️",Rain:"🌧️","Rain Showers":"🌧️",
  Drizzle:"🌦️",Storm:"⛈️",Snow:"❄️","Snow Showers":"❄️",Foggy:"🌫️",
};

// ─── PRE-MATCH DASHBOARD ──────────────────────────────────────────────────────

function AFLPreMatch({
  game, homeInjuries, awayInjuries,
  homeHistory, awayHistory, h2h, analytics, insights,
  historyFilter, onHistoryFilterChange,
}: AFLDashboardProps) {
  const { homeTeam, awayTeam, weather } = game;
  const ha   = analytics?.home;
  const aa   = analytics?.away;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[260px_1fr_240px] gap-3">

      {/* ══════════════════════════════════════════
          LEFT — Intelligence
      ══════════════════════════════════════════ */}
      <div className="space-y-3">

        {/* Form Outlook */}
        <Card title="Form Outlook" accent>
          <div className="space-y-4">
            {([
              { t: homeTeam, an: ha, role: "Home" },
              { t: awayTeam, an: aa, role: "Away" },
            ] as const).map(({ t, an, role }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-xs font-bold text-text-1 truncate">{t.shortName}</span>
                  <span className="text-[10px] text-text-2 font-medium">{role}</span>
                  {an?.streak.type && an.streak.count >= 2 && (
                    <span className={`ml-auto text-[10px] font-bold px-1 py-px rounded ${
                      an.streak.type === "W" ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]"
                    }`}>{an.streak.count}{an.streak.type}</span>
                  )}
                </div>
                <FormPills form={t.form} />
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-2">Record</span>
                    <span className="text-text-1 font-medium tabular-nums">
                      {t.record.wins}W {t.record.losses}L{t.record.draws ? ` ${t.record.draws}D` : ""}
                    </span>
                  </div>
                  {an && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-2">Avg Score</span>
                      <span className="text-text-1 font-medium tabular-nums">{an.avgScored} - {an.avgConceded}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Sportsbook Odds */}
        <Card title="Sportsbook Odds">
          <AFLUpcomingOdds
            homeTeamName={homeTeam.name}
            awayTeamName={awayTeam.name}
            kickoff={game.kickoff}
          />
        </Card>

        {/* Venue Intelligence */}
        {ha && (
          <Card title="Venue &amp; Record">
            {ha.venueRecord && (
              <StatRow
                label={`${homeTeam.shortName} at venue`}
                value={`${ha.venueRecord.wins}W ${ha.venueRecord.losses}L`}
                accent
              />
            )}
            <StatRow label={`${homeTeam.shortName} home`} value={`${ha.homeRecord.wins}W ${ha.homeRecord.losses}L`} />
            <StatRow label={`${awayTeam.shortName} away`} value={aa ? `${aa.awayRecord.wins}W ${aa.awayRecord.losses}L` : "—"} />
            {ha.daysRest != null && (
              <StatRow
                label={`${homeTeam.shortName} rest`}
                value={`${ha.daysRest}d`}
                accent={ha.daysRest < 7}
              />
            )}
            {aa?.daysRest != null && (
              <StatRow
                label={`${awayTeam.shortName} rest`}
                value={`${aa.daysRest}d`}
                accent={aa.daysRest < 7}
              />
            )}
          </Card>
        )}

        {/* Key Edges */}
        {insights.length > 0 && (
          <Card title="Key Edges" accent>
            <div className="space-y-0">
              {insights.map((ins, i) => {
                const dot = ins.severity === "high"
                  ? "bg-[#EF4444]"
                  : ins.severity === "medium"
                  ? "bg-[#F59E0B]"
                  : "bg-[#22C55E]";
                const dirCls = ins.direction === "home"
                  ? "text-primary bg-primary/10"
                  : ins.direction === "away"
                  ? "text-text-2 bg-surface2"
                  : "";
                return (
                  <div key={ins.id || i} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-text-1 leading-none">{ins.title}</span>
                        {ins.direction !== "neutral" && (
                          <span className={`text-[10px] font-bold px-1 py-px rounded uppercase tracking-wide ${dirCls}`}>
                            {ins.direction}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-2 leading-snug">{ins.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════
          CENTER — Matchup
      ══════════════════════════════════════════ */}
      <div className="space-y-3">

        {/* Team Comparison bars */}
        {ha && aa && (
          <Card title="Team Comparison">
            {([
              { key: "Avg Scored",   hv: ha.avgScored,     av: aa.avgScored     },
              { key: "Avg Conceded", hv: ha.avgConceded,   av: aa.avgConceded   },
              { key: "Win Margin",   hv: ha.avgMarginWin,  av: aa.avgMarginWin  },
              { key: "Loss Margin",  hv: ha.avgMarginLoss, av: aa.avgMarginLoss },
            ] as { key: string; hv: number; av: number }[]).map(({ key, hv, av }) => {
              const max = Math.max(hv, av, 1);
              return (
                <div key={key} className="mb-2.5 last:mb-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-1 font-semibold tabular-nums w-8">{hv}</span>
                    <span className="text-text-2 uppercase text-[10px] tracking-wide flex-1 text-center">{key}</span>
                    <span className="text-text-2 tabular-nums w-8 text-right">{av}</span>
                  </div>
                  <div className="flex gap-0.5 h-[3px]">
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
          </Card>
        )}

        {/* H2H */}
        {h2h.length > 0 && (
          <Card title="Head-to-Head">
            {/* Win summary */}
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
              {(() => {
                const hw = h2h.filter(g => g.winner === homeTeam.name).length;
                const dr = h2h.filter(g => g.winner === "Draw").length;
                const aw = h2h.length - hw - dr;
                return (
                  <>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-primary tabular-nums">{hw}</div>
                      <div className="text-[10px] text-text-2 mt-0.5">{homeTeam.shortName}</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-[#F59E0B] tabular-nums">{dr}</div>
                      <div className="text-[10px] text-text-2 mt-0.5">Draws</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-text-2 tabular-nums">{aw}</div>
                      <div className="text-[10px] text-text-2 mt-0.5">{awayTeam.shortName}</div>
                    </div>
                  </>
                );
              })()}
            </div>
            {/* Meeting rows */}
            {h2h.slice(0, 5).map((g, i) => {
              const isHW = g.winner === homeTeam.name;
              const isAW = g.winner === awayTeam.name;
              return (
                <Link key={g.gameId || i} href={g.gameId ? `/game/${g.gameId}` : "#"}
                  className="flex items-center gap-1.5 py-1.5 border-b border-border last:border-0 hover:bg-surface2 rounded px-0.5 text-xs group">
                  <span className="text-[10px] text-text-2 w-16 shrink-0 tabular-nums">{g.date}</span>
                  <span className={`flex-1 truncate text-right ${isHW ? "text-white font-semibold" : "text-text-2"}`}>{g.homeTeam}</span>
                  <span className="font-bold text-text-1 tabular-nums w-12 text-center shrink-0 text-[11px]">{g.score}</span>
                  <span className={`flex-1 truncate ${isAW ? "text-white font-semibold" : "text-text-2"}`}>{g.awayTeam}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    isHW ? "bg-primary/20 text-primary" : isAW ? "bg-white/10 text-text-2" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                  }`}>{isHW ? "H" : isAW ? "A" : "D"}</span>
                </Link>
              );
            })}
          </Card>
        )}

        {/* Recent Results */}
        <Card title="Recent Results">
          <div className="flex gap-1.5 mb-3">
            {(["all", "home", "away"] as VenueFilter[]).map(f => (
              <button key={f} onClick={() => onHistoryFilterChange(f)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  historyFilter === f
                    ? "text-primary bg-primary/10 font-medium"
                    : "text-text-2 hover:text-text-2"
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
                  <span className="text-xs font-semibold uppercase tracking-widest text-text-2">{t.shortName}</span>
                </div>
                {h.slice(0, 5).map(g => (
                  <Link key={g.gameId} href={`/game/${g.gameId}`}
                    className="flex items-center justify-between py-1.5 border-b border-border last:border-0 hover:bg-surface2 px-0.5 rounded text-xs group">
                    <span className="text-text-2 truncate max-w-[55%]">{g.opponent}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {g.result && <ResultPill result={g.result} />}
                      <span className={`font-semibold tabular-nums ${
                        g.result === "W" ? "text-[#22C55E]" : g.result === "L" ? "text-[#EF4444]" : "text-[#F59E0B]"
                      }`}>{g.score ?? "—"}</span>
                    </div>
                  </Link>
                ))}
                {h.length === 0 && <p className="text-xs text-text-2">No data</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ══════════════════════════════════════════
          RIGHT — Context
      ══════════════════════════════════════════ */}
      <div className="space-y-3 md:col-span-2 lg:col-span-1">

        {/* Model Pick — upcoming only */}
        {analytics?.predictedMargin != null && analytics.predictedMargin !== 0 && (
          <Card title="Model Pick" className="overflow-visible">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-primary font-bold">
                {analytics.predictedMargin >= 0 ? homeTeam.shortName : awayTeam.shortName}
              </div>
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
              <div className="text-3xl font-black text-text-1 tabular-nums">
                +{Math.abs(analytics.predictedMargin)} pts
              </div>
              <div className="text-[10px] text-text-2 mt-1">ladder · form · attack/defence · H2H</div>
            </div>
          </Card>
        )}

        {/* Weather — hidden at 2xl+ where the page-level sticky panel takes over */}
        {weather && weather.condition !== "Indoor" && (
          <div className="2xl:hidden">
            <Card title="Conditions">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{WEATHER_ICONS[weather.condition] ?? "🌤"}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${
                    weather.windKph > 40 || ["Storm","Rain"].includes(weather.condition) ? "text-[#F59E0B]" : "text-text-1"
                  }`}>{weather.condition}</div>
                  <div className="text-xs text-text-2 mt-0.5">{weather.tempC}°C · {weather.windKph} km/h wind</div>
                </div>
                {weather.windKph > 40 && <Badge color="yellow">Windy</Badge>}
                {["Storm","Rain"].includes(weather.condition) && <Badge color="yellow">Impact</Badge>}
              </div>
              {weather.windKph > 30 && (
                <p className="mt-2.5 text-xs text-[#F59E0B] border-t border-border pt-2.5 leading-snug">
                  ⚠ Strong wind may reduce scoring and favour kicks into wind
                </p>
              )}
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── LIVE / FINISHED DASHBOARD ────────────────────────────────────────────────

function AFLLive({
  game, homeInjuries, awayInjuries,
  homeHistory, awayHistory, h2h, analytics, insights,
  historyFilter, onHistoryFilterChange, slipColorMap,
}: AFLDashboardProps) {
  const { homeTeam, awayTeam, boxScore, weather, status } = game;
  const ha = analytics?.home;
  const aa = analytics?.away;
  const isLive = status === "live";

  const [sortBy, setSortBy] = useState<string | null>(null);

  const KEY_STATS = ["D", "G", "T", "M", "HO"] as const;
  const topHome = boxScore?.home.slice(0, 10) ?? [];
  const topAway = boxScore?.away.slice(0, 10) ?? [];
  const hasBoxScore = topHome.length > 0 || topAway.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[260px_1fr_240px] gap-3">

      {/* ══════════════════════════════════════════
          LEFT — Leaders
      ══════════════════════════════════════════ */}
      <div className="space-y-3">

        {/* Disposal Leaders */}
        {hasBoxScore && (
          <Card title="Disposal Leaders">
            <div className="space-y-3">
              {([{ t: homeTeam, rows: topHome }, { t: awayTeam, rows: topAway }] as const).map(({ t, rows }) => {
                const sorted = [...rows]
                  .sort((a, b) => Number(b.stats["D"] ?? 0) - Number(a.stats["D"] ?? 0))
                  .slice(0, 5);
                return (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-semibold text-text-2">{t.shortName}</span>
                    </div>
                    {sorted.map((row, i) => {
                      const d     = Number(row.stats["D"] ?? 0);
                      const elite = d >= 25;
                      const slipEntries = slipColorMap?.get(row.player) ?? [];
                      return (
                        <div key={i} className="flex items-center py-1.5 border-b border-border last:border-0 gap-2">
                          <span className="text-[10px] text-text-2 tabular-nums w-3 shrink-0 text-center">{i + 1}</span>
                          <PlayerAvatar src={row.headshot} name={row.player} size={22} />
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <span className="text-xs text-text-1 font-medium truncate">{row.player}</span>
                            {slipEntries.length > 0 && <SlipDots entries={slipEntries} />}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {KEY_STATS.filter(k => row.stats[k] != null).slice(0, 3).map(k => (
                              <span key={k} className="text-xs tabular-nums">
                                <span className="text-text-2">{k} </span>
                                <span className={k === "D" && elite ? "text-primary font-bold" : "text-text-2"}>
                                  {row.stats[k]}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Goal Kickers */}
        {hasBoxScore && (
          <Card title="Goal Kickers">
            <div className="space-y-3">
              {([{ t: homeTeam, rows: topHome }, { t: awayTeam, rows: topAway }] as const).map(({ t, rows }) => {
                const scorers = rows
                  .filter(r => Number(r.stats["G"] ?? 0) > 0)
                  .sort((a, b) => Number(b.stats["G"] ?? 0) - Number(a.stats["G"] ?? 0))
                  .slice(0, 4);
                if (scorers.length === 0) return null;
                return (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-semibold text-text-2">{t.shortName}</span>
                    </div>
                    {scorers.map((row, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                        <PlayerAvatar src={row.headshot} name={row.player} size={22} />
                        <span className="text-xs text-text-1 font-medium flex-1 truncate">{row.player}</span>
                        <span className="text-xs font-bold text-[#22C55E] tabular-nums shrink-0">
                          {row.stats["G"]}g {row.stats["B"] ?? 0}b
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Team Averages */}
        {ha && aa && (
          <Card title="Season Averages">
            {([
              { key: "Avg Scored",   hv: ha.avgScored,   av: aa.avgScored   },
              { key: "Avg Conceded", hv: ha.avgConceded, av: aa.avgConceded },
            ] as { key: string; hv: number; av: number }[]).map(({ key, hv, av }) => {
              const max = Math.max(hv, av, 1);
              return (
                <div key={key} className="mb-2.5 last:mb-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-1 font-semibold tabular-nums w-8">{hv}</span>
                    <span className="text-text-2 uppercase text-[10px] tracking-wide flex-1 text-center">{key}</span>
                    <span className="text-text-2 tabular-nums w-8 text-right">{av}</span>
                  </div>
                  <div className="flex gap-0.5 h-[3px]">
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
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════
          CENTER — Match State
      ══════════════════════════════════════════ */}
      <div className="space-y-3">

        {/* Full Box Score */}
        {hasBoxScore && boxScore && (
          <Card title="Player Stats">
            {/* Stat legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-3 pb-2 border-b border-border">
              {boxScore.statHeaders.slice(0, 7).filter(h => AFL_STAT_LEGEND[h]).map(h => (
                <span key={h} className="text-[10px] text-text-2">
                  <span className="font-bold text-text-1">{h}</span> {AFL_STAT_LEGEND[h]}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {([{ t: homeTeam, rows: boxScore.home }, { t: awayTeam, rows: boxScore.away }] as const).map(({ t, rows }) => {
                const showHeaders = boxScore.statHeaders.slice(0, 6);
                const sortedRows = sortBy
                  ? [...rows].sort((a, b) => Number(b.stats[sortBy] ?? 0) - Number(a.stats[sortBy] ?? 0))
                  : rows;
                return (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-2">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-semibold text-text-2">{t.shortName}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[260px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1.5 pr-2 text-text-2 font-medium">Player</th>
                            {showHeaders.map(h => (
                              <th
                                key={h}
                                className={`text-right py-1.5 px-1 font-medium cursor-pointer select-none transition-colors ${
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
                              <tr key={i} className="border-b border-border last:border-0 hover:bg-surface2">
                                <td className="py-1.5 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    <PlayerAvatar src={r.headshot} name={r.player} size={20} />
                                    <span className="text-text-1 truncate max-w-[80px]">{r.player}</span>
                                    {slipEntries.length > 0 && <SlipDots entries={slipEntries} />}
                                  </div>
                                </td>
                                {showHeaders.map(h => {
                                  const v  = r.stats[h];
                                  const hi = h === "D" && Number(v) >= 25;
                                  return (
                                    <td key={h} className={`py-1.5 px-1 text-right tabular-nums ${
                                      hi ? "text-primary font-bold" : "text-text-2"
                                    }`}>
                                      {v ?? "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Match Context */}
        {ha && aa && (
          <Card title="Form Context">
            <div className="grid grid-cols-2 gap-4">
              {([{ t: homeTeam, an: ha, role: "Home" }, { t: awayTeam, an: aa, role: "Away" }] as const).map(({ t, an, role }) => (
                <div key={t.name}>
                  <div className="flex items-center gap-1.5 mb-2">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-semibold text-text-1">{t.shortName}</span>
                    {an.streak.type && an.streak.count >= 2 && (
                      <span className={`ml-auto text-[10px] font-bold px-1 py-px rounded ${
                        an.streak.type === "W" ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]"
                      }`}>{an.streak.count}{an.streak.type}</span>
                    )}
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {an.form.map((r, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                        r === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" : r === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                      }`}>{r}</span>
                    ))}
                  </div>
                  <StatRow label="Season" value={`${an.record.wins}W ${an.record.losses}L`} />
                  <StatRow label="Avg pts" value={`${an.avgScored}`} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Quarter sparkline — only for finished games; live games show it in the hero ribbon */}
        {!isLive && game.lineScores && game.lineScores.home.length > 0 && (
          <AFLQuarterSparkline game={game} />
        )}

      </div>

      {/* ══════════════════════════════════════════
          RIGHT — Intelligence
      ══════════════════════════════════════════ */}
      <div className="space-y-3 md:col-span-2 lg:col-span-1">

        {/* Live pulse indicator */}
        {isLive && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.7)] shrink-0" />
            <div>
              <div className="text-sm font-bold text-red-400 tracking-wide">LIVE</div>
              <div className="text-xs text-text-2 mt-0.5">Stats update every 15s</div>
            </div>
          </div>
        )}

        {/* Weather (compact) — hidden at 2xl+ where the page-level sticky panel takes over */}
        {weather && weather.condition !== "Indoor" && (
          <div className="2xl:hidden">
            <Card title="Conditions">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{WEATHER_ICONS[weather.condition] ?? "🌤"}</span>
                <div>
                  <div className={`text-sm font-semibold ${
                    weather.windKph > 40 || ["Storm","Rain"].includes(weather.condition) ? "text-[#F59E0B]" : "text-text-1"
                  }`}>{weather.condition}</div>
                  <div className="text-xs text-text-2 mt-0.5">{weather.tempC}°C · {weather.windKph} km/h</div>
                </div>
              </div>
            </Card>
          </div>
        )}


        {/* Pre-game context (top insights) */}
        {insights.length > 0 && (
          <Card title="Pre-Game Context">
            <div className="space-y-0">
              {insights.slice(0, 5).map((ins, i) => {
                const dot = ins.severity === "high"
                  ? "bg-[#EF4444]"
                  : ins.severity === "medium"
                  ? "bg-[#F59E0B]"
                  : "bg-[#22C55E]";
                const dirCls = ins.direction === "home"
                  ? "text-primary bg-primary/10"
                  : ins.direction === "away"
                  ? "text-text-2 bg-surface2"
                  : "";
                return (
                  <div key={ins.id || i} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-text-1 leading-none">{ins.title}</span>
                        {ins.direction !== "neutral" && (
                          <span className={`text-[10px] font-bold px-1 py-px rounded uppercase tracking-wide ${dirCls}`}>
                            {ins.direction}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-2 leading-snug">{ins.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Recent Form (compact) */}
        <Card title="Recent Form">
          {([{ t: homeTeam, h: homeHistory }, { t: awayTeam, h: awayHistory }] as const).map(({ t, h }) => (
            <div key={t.name} className="mb-2.5 last:mb-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                <span className="text-xs font-medium text-text-2">{t.shortName}</span>
              </div>
              <div className="flex gap-1">
                {h.slice(0, 5).map((g, i) => <ResultPill key={i} result={g.result} />)}
                {h.length === 0 && <span className="text-xs text-text-2">No data</span>}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─── Quarter Sparkline ────────────────────────────────────────────────────────

export function AFLQuarterSparkline({ game }: { game: AFLDashboardProps["game"] }) {
  const { lineScores, score, homeTeam, awayTeam } = game;
  if (!lineScores || !score) return null;

  const { home: hQ, away: aQ } = lineScores;
  const periods = Math.max(hQ.length, aQ.length, 4);
  const labels = Array.from({ length: periods }, (_, i) => `Q${i + 1}`);

  let hR = 0, aR = 0;
  const diffs: number[] = [0];
  for (let i = 0; i < periods; i++) {
    hR += hQ[i] ?? 0;
    aR += aQ[i] ?? 0;
    diffs.push(hR - aR);
  }

  const maxDiff = Math.max(...diffs.map(Math.abs), 1);
  // SVG only draws the chart lines — labels are HTML so they never get stretched
  const W = 380, chartH = 52;
  const xStep = W / Math.max(diffs.length - 1, 1);
  const yMid  = chartH / 2;
  const pts   = diffs.map((d, i) => ({ x: i * xStep, y: yMid - (d / maxDiff) * (yMid - 5) }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    `M${pts[0].x.toFixed(1)},${yMid} ` +
    pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L${pts[pts.length - 1].x.toFixed(1)},${yMid} Z`;

  const currentDiff = (score.home ?? 0) - (score.away ?? 0);
  const leadColor = currentDiff >= 0 ? "#60A5FA" : "#F87171";
  const leadName  = currentDiff > 0 ? homeTeam.shortName : currentDiff < 0 ? awayTeam.shortName : null;

  return (
    <Card title="Quarter Momentum">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-text-2">{homeTeam.shortName} ↑ · {awayTeam.shortName} ↓</span>
        {leadName && (
          <span style={{ color: leadColor }} className="text-[10px] font-bold">
            {leadName} +{Math.abs(currentDiff)}
          </span>
        )}
      </div>
      {/* Chart — pure shapes, no text, so preserveAspectRatio="none" is safe */}
      <svg width={W} height={chartH} className="w-full" viewBox={`0 0 ${W} ${chartH}`} preserveAspectRatio="none">
        <defs>
          <filter id="afl-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <line x1="0" y1={yMid} x2={W} y2={yMid} stroke="white" strokeOpacity={0.1} strokeWidth={1} />
        <path d={areaPath} fill={leadColor} fillOpacity={0.25} />
        <path d={linePath} fill="none" stroke={leadColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" filter="url(#afl-glow)" />
        {/* Vertical divider lines only — no text */}
        {labels.map((_, i) => {
          const x = (i + 1) * xStep;
          return <line key={i} x1={x} y1={0} x2={x} y2={chartH} stroke="white" strokeOpacity={0.07} strokeWidth={1} strokeDasharray="2 2" />;
        })}
      </svg>
      {/* Axis labels as HTML — immune to SVG horizontal stretching */}
      <div className="flex justify-between text-[9px] font-mono text-text-2 mt-0.5 mb-1">
        <span>Start</span>
        {labels.map(l => <span key={l}>{l}</span>)}
      </div>
      {/* Compact quarter grid */}
      <div className="mt-2 grid gap-y-1" style={{ gridTemplateColumns: `auto repeat(${periods}, 1fr) auto` }}>
        <div />
        {labels.map(l => <div key={l} className="text-center text-[10px] text-text-2">{l}</div>)}
        <div className="text-[10px] text-text-2 text-right">TOT</div>
        <div className="flex items-center gap-1">
          {homeTeam.logoUrl && <img src={homeTeam.logoUrl} alt="" className="w-3 h-3 object-contain" />}
          <span className="text-xs text-text-2">{homeTeam.shortName}</span>
        </div>
        {Array.from({ length: periods }, (_, i) => {
          const v = hQ[i] ?? 0;
          return <div key={i} className="text-center"><span className={`text-xs tabular-nums ${v > (aQ[i] ?? 0) && v > 0 ? "text-white font-bold" : "text-text-2"}`}>{v || "—"}</span></div>;
        })}
        <div className="text-right"><span className="text-sm font-black text-text-1 tabular-nums">{score.home}</span></div>
        <div className="flex items-center gap-1">
          {awayTeam.logoUrl && <img src={awayTeam.logoUrl} alt="" className="w-3 h-3 object-contain" />}
          <span className="text-xs text-text-2">{awayTeam.shortName}</span>
        </div>
        {Array.from({ length: periods }, (_, i) => {
          const v = aQ[i] ?? 0;
          return <div key={i} className="text-center"><span className={`text-[10px] tabular-nums ${v > (hQ[i] ?? 0) && v > 0 ? "text-white font-bold" : "text-text-2"}`}>{v || "—"}</span></div>;
        })}
        <div className="text-right"><span className="text-sm font-black text-text-2 tabular-nums">{score.away}</span></div>
      </div>
    </Card>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function AFLDashboard(props: AFLDashboardProps) {
  if (props.game.status === "upcoming") {
    return <AFLPreMatch {...props} />;
  }
  return <AFLLive {...props} />;
}
