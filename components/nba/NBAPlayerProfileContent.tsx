"use client";

import type { NBAPlayerAnalyticsResult, NBAPlayerGame, NBAMonthGroup } from "@/lib/sports/nba/players/types";

// ── Shared helpers ────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, dec = 1): string {
  if (v == null) return "-";
  return Number.isInteger(v) ? String(v) : v.toFixed(dec);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${v.toFixed(1)}%`;
}

function ResultBadge({ result }: { result: "W" | "L" | null }) {
  if (!result) return <span className="text-[#4B5563]">-</span>;
  const cls = result === "W"
    ? "bg-[#22C55E]/20 text-[#22C55E]"
    : "bg-[#EF4444]/20 text-[#EF4444]";
  return (
    <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${cls}`}>
      {result}
    </span>
  );
}

function StatChip({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-xl px-4 py-3 min-w-[72px] ${
      accent ? "bg-[#3B82F6]/10 border border-[#3B82F6]/20" : "bg-white/[0.04]"
    }`}>
      <span className="text-[9px] text-[#6B7280] uppercase tracking-wider font-semibold mb-0.5">{label}</span>
      <span className={`text-base font-black tabular-nums ${accent ? "text-[#3B82F6]" : "text-white"}`}>
        {value}
      </span>
      {sub && <span className="text-[9px] text-[#4B5563] mt-0.5">{sub}</span>}
    </div>
  );
}

function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  const avg       = valid.reduce((a, b) => a + b, 0) / valid.length;
  const threshold = avg * 0.15;
  const last5     = valid.slice(-5);
  const last5Avg  = last5.length > 0 ? last5.reduce((a, b) => a + b, 0) / last5.length : avg;
  const trending  = last5Avg > avg + threshold ? "↑" : last5Avg < avg - threshold ? "↓" : "→";
  const trendColor = last5Avg > avg + threshold ? "text-[#22C55E]" : last5Avg < avg - threshold ? "text-[#EF4444]" : "text-[#F59E0B]";

  return (
    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[9px] text-[#4B5563] uppercase tracking-widest font-bold">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-black ${trendColor}`}>{trending}</span>
          <span className="text-[10px] text-[#6B7280] font-mono">avg {fmt(avg)}</span>
        </div>
      </div>
      <div className="text-[9px] text-[#374151] mb-2">last {valid.length} games</div>
      <div className="flex items-end gap-[3px] h-10">
        {values.map((v, i) => {
          let color = "bg-[#1F2937]";
          if (v != null) {
            if (v >= avg + threshold)      color = "bg-[#22C55E]";
            else if (v <= avg - threshold) color = "bg-[#EF4444]";
            else                           color = "bg-[#F59E0B]";
          }
          const height = v != null
            ? Math.max(12, Math.min(100, (v / (avg * 1.5 || 1)) * 100))
            : 6;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t ${color} transition-all duration-300`}
              style={{ height: `${height}%` }}
              title={v != null ? `${label}: ${fmt(v, 0)}` : "No data"}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/[0.04]">
        <span className="flex items-center gap-1 text-[9px] text-[#4B5563]">
          <span className="w-2 h-2 rounded-sm bg-[#22C55E] inline-block" /> Above avg
        </span>
        <span className="flex items-center gap-1 text-[9px] text-[#4B5563]">
          <span className="w-2 h-2 rounded-sm bg-[#F59E0B] inline-block" /> Near avg
        </span>
        <span className="flex items-center gap-1 text-[9px] text-[#4B5563]">
          <span className="w-2 h-2 rounded-sm bg-[#EF4444] inline-block" /> Below avg
        </span>
      </div>
    </div>
  );
}

function SplitBar({ label, home, away }: { label: string; home: number; away: number }) {
  const total = home + away || 1;
  return (
    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest">{label}</span>
        <div className="flex gap-3 text-[11px] font-mono">
          <span className="text-white">{fmt(home)} <span className="text-[#4B5563]">H</span></span>
          <span className="text-[#9CA3AF]">{fmt(away)} <span className="text-[#4B5563]">A</span></span>
        </div>
      </div>
      <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-white/5">
        <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${(home / total) * 100}%` }} />
        <div className="h-full bg-[#9CA3AF]/40 rounded-full" style={{ width: `${(away / total) * 100}%` }} />
      </div>
    </div>
  );
}

// ── Game log row ──────────────────────────────────────────────────────────────

function GameRow({ game }: { game: NBAPlayerGame }) {
  const score = game.teamScore != null && game.oppScore != null
    ? `${game.teamScore}-${game.oppScore}` : "-";
  const fg  = game.fgm != null && game.fga != null ? `${game.fgm}/${game.fga}` : "-";
  const fg3 = game.fg3m != null && game.fg3a != null ? `${game.fg3m}/${game.fg3a}` : "-";

  return (
    <tr className="border-b border-white/[0.035] last:border-0 hover:bg-white/[0.02] transition-colors group">
      <td className="py-2 px-3 text-[#6B7280] whitespace-nowrap tabular-nums text-[11px]">
        {game.date.slice(5).replace("-", "/")}
      </td>
      <td className="py-2 pr-3 text-[11px] font-medium whitespace-nowrap">
        <span className="text-[#4B5563] mr-0.5">{game.homeAway === "away" ? "@" : "vs"}</span>
        <span className="text-[#9CA3AF]">{game.opponent.split(" ").slice(-1)[0]}</span>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1.5">
          <ResultBadge result={game.result} />
          <span className="text-[#4B5563] tabular-nums font-mono text-[10px]">{score}</span>
        </div>
      </td>
      <td className="py-2 pr-3 text-white tabular-nums text-center font-black text-[12px]">
        {fmt(game.points, 0)}
      </td>
      <td className="py-2 pr-3 text-[#9CA3AF] tabular-nums text-center text-[11px]">
        {fmt(game.rebounds, 0)}
      </td>
      <td className="py-2 pr-3 text-[#9CA3AF] tabular-nums text-center text-[11px]">
        {fmt(game.assists, 0)}
      </td>
      <td className="py-2 pr-3 text-[#6B7280] tabular-nums text-center text-[11px]">
        {fg}
      </td>
      <td className="py-2 pr-3 text-[#6B7280] tabular-nums text-center text-[11px]">
        {fg3}
      </td>
      <td className="py-2 pr-3 text-[#6B7280] tabular-nums text-center text-[11px]">
        {fmt(game.steals, 0)}/{fmt(game.blocks, 0)}
      </td>
      <td className="py-2 px-3 tabular-nums text-center text-[11px]">
        <span className={
          game.plusMinus == null ? "text-[#4B5563]" :
          game.plusMinus > 0 ? "text-[#22C55E] font-bold" :
          game.plusMinus < 0 ? "text-[#EF4444]" : "text-[#6B7280]"
        }>
          {game.plusMinus == null ? "-" : game.plusMinus > 0 ? `+${game.plusMinus}` : String(game.plusMinus)}
        </span>
      </td>
      <td className="py-2 pr-3 text-[#4B5563] tabular-nums text-center text-[10px]">
        {game.minutes?.slice(0, 5) ?? "-"}
      </td>
    </tr>
  );
}

// ── Month group section ────────────────────────────────────────────────────────

const SEASON_TYPE_STYLE: Record<string, string> = {
  playoffs:  "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  playin:    "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/20",
  regular:   "bg-white/[0.03] text-[#6B7280] border-white/[0.06]",
  preseason: "bg-white/[0.02] text-[#374151] border-white/[0.04]",
};

function MonthGroup({ group }: { group: NBAMonthGroup }) {
  const style = SEASON_TYPE_STYLE[group.seasonType ?? "regular"] ?? SEASON_TYPE_STYLE.regular;

  return (
    <div className="mb-5">
      {/* Group header */}
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-t-xl border-b ${style} border`}>
        <span className="text-[10px] font-black uppercase tracking-widest">{group.label}</span>
        <span className="text-[10px] font-mono opacity-60">{group.gamesCount}G</span>
        <div className="ml-auto flex gap-4 text-[10px] font-mono">
          <span className="text-white font-bold">{fmt(group.avgPoints, 1)}</span>
          <span className="text-[#6B7280]">PTS</span>
          <span className="text-[#9CA3AF]">{fmt(group.avgRebounds, 1)}</span>
          <span className="text-[#6B7280]">REB</span>
          <span className="text-[#9CA3AF]">{fmt(group.avgAssists, 1)}</span>
          <span className="text-[#6B7280]">AST</span>
        </div>
      </div>

      {/* Games table */}
      <div className="overflow-x-auto bg-white/[0.01] rounded-b-xl border border-t-0 border-white/[0.05]">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead className="sticky top-0 z-10">
            <tr className="text-[9px] text-[#374151] uppercase tracking-widest border-b border-white/[0.06] bg-[#0d1420]">
              <th className="py-2 px-3 whitespace-nowrap">Date</th>
              <th className="py-2 pr-3 whitespace-nowrap">Opponent</th>
              <th className="py-2 pr-3 whitespace-nowrap">Result</th>
              <th className="py-2 pr-3 text-center">PTS</th>
              <th className="py-2 pr-3 text-center">REB</th>
              <th className="py-2 pr-3 text-center">AST</th>
              <th className="py-2 pr-3 text-center">FG</th>
              <th className="py-2 pr-3 text-center">3PT</th>
              <th className="py-2 pr-3 text-center">S/B</th>
              <th className="py-2 px-3 text-center">+/-</th>
              <th className="py-2 pr-3 text-center">MIN</th>
            </tr>
          </thead>
          <tbody>
            {group.games.map((g, i) => (
              <GameRow key={g.gameId ?? i} game={g} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function NBAPlayerProfileContent({
  data,
}: {
  data: NBAPlayerAnalyticsResult;
}) {
  const { seasonAvg, last5, vsOpponent, opponent, homeAvg, awayAvg,
          pointsTrend, assistsTrend, reboundsTrend, monthGroups, games } = data;

  const totalGames = games.filter(g => g.seasonType !== "preseason").length;

  return (
    <div className="space-y-8">

      {/* ── Season averages ────────────────────────────────────────────────── */}
      <section>
        <div className="text-[9px] text-[#4B5563] uppercase tracking-widest font-bold mb-3">
          {seasonAvg.gamesCount}G this season
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip label="PTS" value={fmt(seasonAvg.points)} accent />
          <StatChip label="REB" value={fmt(seasonAvg.rebounds)} accent />
          <StatChip label="AST" value={fmt(seasonAvg.assists)} accent />
          <StatChip label="STL" value={fmt(seasonAvg.steals)} />
          <StatChip label="BLK" value={fmt(seasonAvg.blocks)} />
          <StatChip label="FG%" value={fmtPct(seasonAvg.fgPct)} />
          <StatChip label="3P%" value={fmtPct(seasonAvg.fg3Pct)} />
          <StatChip label="+/-" value={seasonAvg.plusMinus > 0 ? `+${fmt(seasonAvg.plusMinus)}` : fmt(seasonAvg.plusMinus)} />
          <StatChip label="MIN" value={fmt(seasonAvg.minutes)} />
          <StatChip label="TO" value={fmt(seasonAvg.turnovers)} />
        </div>
      </section>

      {/* ── Last matchup vs opponent ───────────────────────────────────────── */}
      {opponent && vsOpponent.lastMatchup && (
        <section className="bg-[#111827] rounded-xl border border-[#3B82F6]/20 overflow-hidden">
          <div className="bg-[#3B82F6]/10 px-4 py-2 border-b border-[#3B82F6]/20 flex justify-between items-center">
            <span className="text-[10px] font-black text-[#3B82F6] uppercase tracking-widest">
              Last vs {opponent}
            </span>
            <span className="text-[10px] text-[#6B7280] font-mono">{vsOpponent.lastMatchup.date}</span>
          </div>
          <div className="p-4 grid grid-cols-4 gap-4 text-center">
            {[
              { label: "PTS", value: fmt(vsOpponent.lastMatchup.points, 0), color: "text-white" },
              { label: "REB", value: fmt(vsOpponent.lastMatchup.rebounds, 0), color: "text-[#9CA3AF]" },
              { label: "AST", value: fmt(vsOpponent.lastMatchup.assists, 0), color: "text-[#9CA3AF]" },
              { label: "FG",  value: vsOpponent.lastMatchup.fgm != null && vsOpponent.lastMatchup.fga != null
                ? `${vsOpponent.lastMatchup.fgm}/${vsOpponent.lastMatchup.fga}` : "-",
                color: "text-[#6B7280]" },
            ].map(s => (
              <div key={s.label}>
                <div className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          {vsOpponent.games.length > 1 && (
            <div className="px-4 pb-3 text-[10px] text-[#4B5563]">
              {vsOpponent.games.length} career matchups · avg {fmt(vsOpponent.avg?.points)} pts / {fmt(vsOpponent.avg?.rebounds)} reb / {fmt(vsOpponent.avg?.assists)} ast
            </div>
          )}
        </section>
      )}

      {/* ── Home / Away splits ─────────────────────────────────────────────── */}
      {(homeAvg || awayAvg) && (
        <section className="grid grid-cols-3 gap-4">
          <SplitBar label="Points"   home={homeAvg?.points   ?? 0} away={awayAvg?.points   ?? 0} />
          <SplitBar label="Rebounds" home={homeAvg?.rebounds ?? 0} away={awayAvg?.rebounds ?? 0} />
          <SplitBar label="Assists"  home={homeAvg?.assists  ?? 0} away={awayAvg?.assists  ?? 0} />
        </section>
      )}

      {/* ── Form sparklines ────────────────────────────────────────────────── */}
      <section className="grid grid-cols-3 gap-4">
        <Sparkline values={pointsTrend}   label="Points"   />
        <Sparkline values={reboundsTrend} label="Rebounds" />
        <Sparkline values={assistsTrend}  label="Assists"  />
      </section>

      {/* ── Month-grouped game log ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-4 bg-[#3B82F6] rounded-sm" />
            Full Season Log
          </h3>
          <span className="text-[10px] text-[#4B5563] uppercase font-bold tracking-tight">
            {totalGames} games · newest first
          </span>
        </div>

        {/* Scrollable log — max-height keeps it contained without shrinking the drawer */}
        <div className="overflow-y-auto max-h-[60vh] pr-1 custom-scrollbar space-y-0">
          {monthGroups.length > 0
            ? monthGroups.map(group => (
                <MonthGroup key={group.label} group={group} />
              ))
            : (
              <div className="py-10 text-center text-[11px] text-[#4B5563] italic">
                No game data found
              </div>
            )
          }
        </div>
      </section>
    </div>
  );
}
