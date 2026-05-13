"use client";

import { useState } from "react";
import type {
  NBAPlayerAnalyticsResult,
  NBAPlayerGame,
  NBAStatLine,
  NBADataContext,
  NBASeasonType,
} from "@/lib/sports/nba/players/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "-";
  return Number.isInteger(v) ? String(v) : v.toFixed(decimals);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${v.toFixed(1)}%`;
}

// ── Shared atoms ──────────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: "W" | "L" | null }) {
  if (!result) return <span className="text-[#6B7280]">-</span>;
  const cls = result === "W"
    ? "bg-[#22C55E]/20 text-[#22C55E]"
    : "bg-[#EF4444]/20 text-[#EF4444]";
  return (
    <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${cls}`}>
      {result}
    </span>
  );
}

const SEASON_TYPE_META: Record<NBASeasonType, { label: string; cls: string }> = {
  regular:   { label: "REG",  cls: "text-[#6B7280] bg-white/[0.04]" },
  playoffs:  { label: "POST", cls: "text-[#F59E0B] bg-[#F59E0B]/10" },
  playin:    { label: "PLY",  cls: "text-[#A78BFA] bg-[#A78BFA]/10" },
  preseason: { label: "PRE",  cls: "text-[#374151] bg-white/[0.02]" },
};

function SeasonTypeBadge({ type }: { type: NBASeasonType | null }) {
  if (!type || type === "regular") return null;
  const meta = SEASON_TYPE_META[type];
  return (
    <span className={`text-[8px] font-black px-1 py-px rounded uppercase tracking-wide shrink-0 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function StatChip({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-xl px-4 py-3 ${
      accent ? "bg-[#3B82F6]/10 border border-[#3B82F6]/20" : "bg-white/[0.04]"
    }`}>
      <span className="text-[9px] text-[#6B7280] uppercase tracking-wider font-semibold mb-0.5">{label}</span>
      <span className={`text-lg font-black tabular-nums ${accent ? "text-[#3B82F6]" : "text-white"}`}>{value}</span>
    </div>
  );
}

function RollingRow({ label, stat }: { label: string; stat: NBAStatLine | null }) {
  if (!stat) return null;
  return (
    <div className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-4 py-2.5 border border-white/[0.04]">
      <span className="text-[9px] font-black text-[#4B5563] uppercase tracking-widest w-7 shrink-0">{label}</span>
      <div className="flex gap-5 flex-1 min-w-0">
        <span className="text-xs text-white font-bold tabular-nums">
          {fmt(stat.ppg)} <span className="text-[#4B5563] font-normal text-[9px]">PTS</span>
        </span>
        <span className="text-xs text-[#9CA3AF] tabular-nums">
          {fmt(stat.rpg)} <span className="text-[#4B5563] font-normal text-[9px]">REB</span>
        </span>
        <span className="text-xs text-[#9CA3AF] tabular-nums">
          {fmt(stat.apg)} <span className="text-[#4B5563] font-normal text-[9px]">AST</span>
        </span>
        <span className="text-xs text-[#6B7280] tabular-nums">
          {fmt(stat.spg)} <span className="text-[#374151] font-normal text-[9px]">STL</span>
        </span>
        <span className="text-xs text-[#6B7280] tabular-nums">
          {fmt(stat.bpg)} <span className="text-[#374151] font-normal text-[9px]">BLK</span>
        </span>
        <span className="text-xs text-[#6B7280] tabular-nums">
          {fmtPct(stat.fgPct)} <span className="text-[#374151] font-normal text-[9px]">FG%</span>
        </span>
        <span className="text-xs text-[#6B7280] tabular-nums">
          {fmtPct(stat.fg3Pct)} <span className="text-[#374151] font-normal text-[9px]">3P%</span>
        </span>
        <span className="text-xs text-[#6B7280] tabular-nums">
          {fmt(stat.mpg)} <span className="text-[#374151] font-normal text-[9px]">MIN</span>
        </span>
      </div>
      <span className="text-[9px] text-[#374151] font-mono shrink-0">{stat.gamesCount}G</span>
    </div>
  );
}

function SplitCard({ label, h, a }: { label: string; h: number; a: number }) {
  const total = h + a || 1;
  return (
    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest">{label}</span>
        <div className="flex gap-4 text-xs font-mono">
          <span className="text-white">{fmt(h)} <span className="text-[#4B5563] text-[9px]">H</span></span>
          <span className="text-[#9CA3AF]">{fmt(a)} <span className="text-[#4B5563] text-[9px]">A</span></span>
        </div>
      </div>
      <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-white/5">
        <div className="h-full bg-[#3B82F6] rounded-full transition-all" style={{ width: `${(h / total) * 100}%` }} />
        <div className="h-full bg-[#9CA3AF]/40 rounded-full transition-all" style={{ width: `${(a / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  if (values.length === 0) return null;
  const valid = values.filter((v): v is number => v != null);
  const avg  = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  const peak = Math.max(...valid, avg * 1.5, 1);
  const threshold = avg * 0.15;
  return (
    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04] h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] text-[#4B5563] uppercase tracking-widest font-bold">{label} Trend</span>
        <span className="text-[9px] text-[#374151] font-mono">avg {fmt(avg)}</span>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {values.map((v, i) => {
          let color = "bg-[#1F2937]";
          if (v != null) {
            if (v >= avg + threshold)      color = "bg-[#22C55E]";
            else if (v <= avg - threshold) color = "bg-[#EF4444]";
            else                           color = "bg-[#F59E0B]";
          }
          const height = v != null ? Math.max(16, Math.min(100, (v / peak) * 100)) : 8;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t ${color} transition-all duration-300`}
              style={{ height: `${height}%` }}
              title={v != null ? String(Math.round(v)) : "-"}
            />
          );
        })}
      </div>
    </div>
  );
}

function DataContextBanner({ ctx, count, seasons }: {
  ctx: NBADataContext; count: number; seasons: number[];
}) {
  if (ctx === "current") return null;
  if (ctx === "historical") {
    return (
      <div className="bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="text-[#F59E0B] text-[10px] shrink-0">◆</span>
        <span className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-wide">Historical data</span>
        {seasons.length > 0 && (
          <span className="text-[9px] text-[#6B7280] font-mono ml-1">
            {seasons.map(s => `${s - 1}-${String(s).slice(2)}`).join(", ")}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="bg-[#3B82F6]/5 border border-[#3B82F6]/15 rounded-lg px-3 py-2 flex items-center gap-2">
      <span className="text-[#3B82F6] text-[10px] shrink-0">◆</span>
      <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wide">
        Limited sample <span className="text-[#3B82F6]">{count}G</span>
      </span>
    </div>
  );
}

// ── Game log ──────────────────────────────────────────────────────────────────

function GameRowGroup({ game, seasonLabel }: { game: NBAPlayerGame; seasonLabel: string | null }) {
  return (
    <>
      {seasonLabel && (
        <tr className="border-b border-white/[0.04]">
          <td colSpan={11} className="py-1.5 px-4 bg-white/[0.015]">
            <span className="text-[9px] font-black text-[#374151] uppercase tracking-widest">{seasonLabel}</span>
          </td>
        </tr>
      )}
      <GameRow game={game} />
    </>
  );
}

function GameRow({ game }: { game: NBAPlayerGame }) {
  const score = game.teamScore != null && game.oppScore != null
    ? `${game.teamScore}–${game.oppScore}` : "—";
  const fg  = game.fgm != null && game.fga  != null ? `${game.fgm}/${game.fga}`  : "—";
  const fg3 = game.fg3m != null && game.fg3a != null ? `${game.fg3m}/${game.fg3a}` : "—";
  const ft  = game.ftm != null && game.fta  != null ? `${game.ftm}/${game.fta}`  : "—";

  return (
    <tr className="border-b border-white/[0.035] last:border-0 text-xs hover:bg-white/[0.025] transition-colors">
      <td className="py-2.5 px-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[#6B7280] tabular-nums font-mono text-[11px]">{game.date.slice(5)}</span>
          <SeasonTypeBadge type={game.seasonType} />
        </div>
      </td>
      <td className="py-2.5 pr-4 text-[#9CA3AF] truncate max-w-[120px] font-medium">{game.opponent}</td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-1.5">
          <ResultBadge result={game.result} />
          <span className="text-[#4B5563] tabular-nums font-mono text-[10px]">{score}</span>
        </div>
      </td>
      <td className="py-2.5 pr-4 text-[#6B7280] tabular-nums text-center">{game.minutes != null ? Math.round(game.minutes) : "—"}</td>
      <td className="py-2.5 pr-4 text-white tabular-nums text-center font-bold text-[13px]">{fmt(game.points, 0)}</td>
      <td className="py-2.5 pr-4 text-[#9CA3AF] tabular-nums text-center">{fmt(game.rebounds, 0)}</td>
      <td className="py-2.5 pr-4 text-[#9CA3AF] tabular-nums text-center">{fmt(game.assists, 0)}</td>
      <td className="py-2.5 pr-4 text-[#6B7280] tabular-nums text-center">{fmt(game.steals, 0)}</td>
      <td className="py-2.5 pr-4 text-[#6B7280] tabular-nums text-center">{fmt(game.blocks, 0)}</td>
      <td className="py-2.5 pr-4 text-[#6B7280] tabular-nums text-center text-[11px]">{fg}</td>
      <td className="py-2.5 px-4 text-[#6B7280] tabular-nums text-center text-[11px]">{fg3}</td>
    </tr>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

type SeasonFilter = "all" | number;

export default function NBAPlayerProfileContent({ data }: { data: NBAPlayerAnalyticsResult }) {
  const {
    seasonAvg, vsOpponent, opponent, homeAvg, awayAvg,
    pointsTrend, fgPctTrend, fullSeasonGames,
    dataContext, currentSeasonCount, seasonsIncluded,
    last5Avg, last10Avg,
  } = data;

  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>("all");

  const noData = seasonAvg.gamesCount === 0;

  const seasonTabs: { key: SeasonFilter; label: string }[] = [
    { key: "all", label: "All" },
    ...seasonsIncluded.map(s => ({
      key: s as SeasonFilter,
      label: `${s - 1}-${String(s).slice(2)}`,
    })),
  ];

  const visibleGames = seasonFilter === "all"
    ? fullSeasonGames
    : fullSeasonGames.filter(g => g.season === seasonFilter);

  return (
    <div className="space-y-6">

      {/* No-data state */}
      {noData && (
        <div className="bg-[#1F2937] rounded-xl p-6 border border-white/[0.06] text-center">
          <p className="text-sm text-[#6B7280]">No game log available yet.</p>
          <p className="text-[11px] text-[#374151] mt-1">
            Stats appear once games are logged for this player.
          </p>
        </div>
      )}

      {/* ── Season averages ─────────────────────────────────────────────── */}
      {!noData && (
        <section className="space-y-3">
          <DataContextBanner ctx={dataContext} count={currentSeasonCount} seasons={seasonsIncluded} />

          {/* All 6 core stats in one row */}
          <div className="grid grid-cols-7 gap-2">
            <div className="bg-[#3B82F6]/5 border border-[#3B82F6]/10 rounded-xl p-3 flex flex-col items-center justify-center">
              <span className="text-[9px] font-bold text-[#3B82F6] uppercase tracking-widest mb-1">
                {dataContext === "historical" ? "Hist." : "Season"}
              </span>
              <span className="text-xl font-black text-white tabular-nums">{seasonAvg.gamesCount}G</span>
            </div>
            <StatChip label="PPG"  value={fmt(seasonAvg.ppg)}    accent />
            <StatChip label="RPG"  value={fmt(seasonAvg.rpg)}    accent />
            <StatChip label="APG"  value={fmt(seasonAvg.apg)}    accent />
            <StatChip label="FG%"  value={fmtPct(seasonAvg.fgPct)} />
            <StatChip label="3PT%" value={fmtPct(seasonAvg.fg3Pct)} />
            <StatChip label="MPG"  value={fmt(seasonAvg.mpg)} />
          </div>

          {/* Rolling averages */}
          {(last5Avg || last10Avg) && (
            <div className="space-y-1.5">
              <RollingRow label="L5"  stat={last5Avg}  />
              <RollingRow label="L10" stat={last10Avg} />
            </div>
          )}
        </section>
      )}

      {/* ── Analytics grid: matchup + splits + sparklines ───────────────── */}
      {!noData && (
        <div className="grid grid-cols-5 gap-4">
          {/* Left: last matchup + home/away splits */}
          <div className="col-span-2 space-y-3">
            {vsOpponent.lastMatchup && (
              <div className="bg-[#111827] rounded-xl border border-[#3B82F6]/20 overflow-hidden">
                <div className="bg-[#3B82F6]/10 px-4 py-2 border-b border-[#3B82F6]/20 flex justify-between items-center">
                  <span className="text-[10px] font-black text-[#3B82F6] uppercase tracking-widest">
                    Last vs {opponent}
                  </span>
                  <span className="text-[10px] text-[#6B7280] font-mono">{vsOpponent.lastMatchup.date}</span>
                </div>
                <div className="px-4 py-3 grid grid-cols-4 gap-2">
                  {[
                    { v: fmt(vsOpponent.lastMatchup.points, 0),   label: "PTS", cls: "text-white" },
                    { v: fmt(vsOpponent.lastMatchup.rebounds, 0), label: "REB", cls: "text-[#22C55E]" },
                    { v: fmt(vsOpponent.lastMatchup.assists, 0),  label: "AST", cls: "text-[#3B82F6]" },
                    {
                      v: vsOpponent.lastMatchup.fgPct != null
                        ? `${vsOpponent.lastMatchup.fgPct.toFixed(1)}%` : "—",
                      label: "FG%", cls: "text-white",
                    },
                  ].map(item => (
                    <div key={item.label} className="text-center">
                      <div className={`text-xl font-black tabular-nums ${item.cls}`}>{item.v}</div>
                      <div className="text-[8px] font-bold text-[#4B5563] uppercase tracking-widest mt-1">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(homeAvg || awayAvg) && (
              <div className="space-y-2">
                <SplitCard label="Points"   h={homeAvg?.ppg || 0} a={awayAvg?.ppg || 0} />
                <SplitCard label="Rebounds" h={homeAvg?.rpg || 0} a={awayAvg?.rpg || 0} />
                <SplitCard label="Assists"  h={homeAvg?.apg || 0} a={awayAvg?.apg || 0} />
              </div>
            )}
          </div>

          {/* Right: sparklines (3 cols) */}
          <div className="col-span-3 grid grid-cols-1 gap-3">
            {pointsTrend.length > 0 && (
              <Sparkline values={pointsTrend} label="Points" />
            )}
            {fgPctTrend.length > 0 && (
              <Sparkline values={fgPctTrend} label="FG%" />
            )}
          </div>
        </div>
      )}

      {/* ── Game log ────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-4 bg-[#3B82F6] rounded-sm" />
            Game Log
          </h3>
          {seasonTabs.length > 1 && (
            <div className="flex items-center gap-1">
              {seasonTabs.map(tab => (
                <button
                  key={String(tab.key)}
                  onClick={() => setSeasonFilter(tab.key)}
                  className={`text-[9px] font-black px-2.5 py-1 rounded uppercase tracking-wider transition-all ${
                    seasonFilter === tab.key
                      ? "bg-[#3B82F6] text-white"
                      : "text-[#4B5563] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/[0.05] bg-white/[0.01]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] text-[#4B5563] uppercase tracking-widest border-b border-white/[0.08] bg-white/[0.02]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 pr-4">Opponent</th>
                <th className="py-3 pr-4">Result</th>
                <th className="py-3 pr-4 text-center">MIN</th>
                <th className="py-3 pr-4 text-center">PTS</th>
                <th className="py-3 pr-4 text-center">REB</th>
                <th className="py-3 pr-4 text-center">AST</th>
                <th className="py-3 pr-4 text-center">STL</th>
                <th className="py-3 pr-4 text-center">BLK</th>
                <th className="py-3 pr-4 text-center">FG</th>
                <th className="py-3 px-4 text-center">3PT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {visibleGames.map((g, i) => {
                const prevSeason = i > 0 ? visibleGames[i - 1].season : null;
                const showLabel  = seasonFilter === "all" && (
                  i === 0 || (prevSeason !== null && g.season !== prevSeason)
                );
                const seasonLabel = `${g.season - 1}-${String(g.season).slice(2)} Season`;
                return (
                  <GameRowGroup
                    key={g.gameId ?? `row-${i}`}
                    game={g}
                    seasonLabel={showLabel ? seasonLabel : null}
                  />
                );
              })}
              {visibleGames.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-xs text-[#4B5563] italic">
                    No games found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {visibleGames.length > 0 && (
          <div className="text-[9px] text-[#374151] text-right mt-2 font-mono">
            {visibleGames.length} game{visibleGames.length !== 1 ? "s" : ""} · ESPN boxscore data
          </div>
        )}
      </section>

    </div>
  );
}
