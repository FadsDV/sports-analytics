"use client";

import type { AFLPlayerAnalyticsResult, AFLPlayerGame } from "@/lib/sports/afl/players/types";

// ── Shared helpers ────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "-";
  return Number.isInteger(v) ? String(v) : v.toFixed(decimals);
}

function ResultBadge({ result }: { result: "W" | "L" | "D" | null }) {
  if (!result) return <span className="text-[#6B7280]">-</span>;
  const cls =
    result === "W"
      ? "bg-[#22C55E]/20 text-[#22C55E]"
      : result === "L"
      ? "bg-[#EF4444]/20 text-[#EF4444]"
      : "bg-[#F59E0B]/20 text-[#F59E0B]";
  return (
    <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${cls}`}>
      {result}
    </span>
  );
}

function StatChip({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-lg px-3 py-2 min-w-[65px] ${accent ? "bg-[#3B82F6]/10 border border-[#3B82F6]/20" : "bg-white/[0.04]"}`}>
      <span className="text-[9px] text-[#6B7280] uppercase tracking-wider font-semibold">{label}</span>
      <span className={`text-sm font-black tabular-nums ${accent ? "text-[#3B82F6]" : "text-white"}`}>{fmt(value)}</span>
    </div>
  );
}

function GameRow({ game }: { game: AFLPlayerGame }) {
  const score =
    game.teamScore != null && game.oppScore != null
      ? `${game.teamScore}-${game.oppScore}`
      : "-";
  return (
    <tr className="border-b border-white/[0.04] last:border-0 text-[10px] hover:bg-white/[0.02] transition-colors">
      <td className="py-2 pr-2 text-[#6B7280] whitespace-nowrap tabular-nums">{game.date.slice(5)}</td>
      <td className="py-2 pr-2 text-[#9CA3AF] truncate max-w-[80px] font-medium">{game.opponent}</td>
      <td className="py-2 pr-2">
        <div className="flex items-center gap-1.5">
          <ResultBadge result={game.result} />
          <span className="text-[#4B5563] tabular-nums font-mono text-[9px]">{score}</span>
        </div>
      </td>
      <td className="py-2 pr-2 text-white tabular-nums text-center font-bold">{fmt(game.disposals, 0)}</td>
      <td className="py-2 pr-2 text-[#9CA3AF] tabular-nums text-center">{fmt(game.goals, 0)}</td>
      <td className="py-2 pr-2 text-[#9CA3AF] tabular-nums text-center">{fmt(game.tackles, 0)}</td>
      <td className="py-2 pr-2 text-[#6B7280] tabular-nums text-center italic">{game.positionPlayed || "-"}</td>
      <td className="py-2 text-[#3B82F6] tabular-nums text-center font-black">{fmt(game.fantasyScore, 0)}</td>
    </tr>
  );
}

function SplitCard({ label, h, a }: { label: string; h: number; a: number }) {
  const total = h + a || 1;
  return (
    <div className="bg-white/[0.02] rounded-lg p-2.5 border border-white/[0.04]">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest">{label}</span>
        <div className="flex gap-2 text-[10px] font-mono">
          <span className="text-white">{fmt(h)} <span className="text-[#4B5563]">H</span></span>
          <span className="text-[#9CA3AF]">{fmt(a)} <span className="text-[#4B5563]">A</span></span>
        </div>
      </div>
      <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-white/5">
        <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: `${(h / total) * 100}%` }} />
        <div className="h-full bg-[#9CA3AF]/40 rounded-full" style={{ width: `${(a / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  if (values.length === 0) return null;
  const valid = values.filter((v): v is number => v != null);
  const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  const threshold = avg * 0.15;

  return (
    <div className="bg-white/[0.02] rounded-lg p-2 border border-white/[0.04]">
      <div className="text-[9px] text-[#4B5563] uppercase tracking-widest font-bold mb-2">{label} Trend</div>
      <div className="flex items-end gap-1 h-8">
        {values.map((v, i) => {
          let color = "bg-[#1F2937]";
          if (v != null) {
            if (v >= avg + threshold) color = "bg-[#22C55E]";
            else if (v <= avg - threshold) color = "bg-[#EF4444]";
            else color = "bg-[#F59E0B]";
          }
          const height = v != null ? Math.max(20, Math.min(100, (v / (avg * 1.5 || 1)) * 100)) : 10;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm ${color} transition-all duration-300`}
              style={{ height: `${height}%` }}
              title={v != null ? String(Math.round(v)) : "-"}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PlayerProfileContent({ data }: { data: AFLPlayerAnalyticsResult }) {
  const {
    position,
    seasonAvg,
    gamesMissedCount,
    vsOpponent,
    opponent,
    homeAvg,
    awayAvg,
    disposalTrend,
    fantasyTrend,
    fullSeasonGames,
  } = data;

  return (
    <div className="space-y-8">
      {/* Quick Stats Grid */}
      <section className="grid grid-cols-4 gap-3">
        <div className="col-span-1 bg-[#3B82F6]/5 border border-[#3B82F6]/10 rounded-xl p-3 flex flex-col items-center">
          <span className="text-[9px] font-bold text-[#3B82F6] uppercase tracking-widest mb-1">Season</span>
          <span className="text-lg font-black text-white tabular-nums">{seasonAvg.gamesCount}G</span>
          <span className="text-[8px] text-[#4B5563] mt-0.5 uppercase">{gamesMissedCount} MISSED</span>
        </div>
        <StatChip label="Avg Dis" value={seasonAvg.disposals} accent />
        <StatChip label="Avg Goals" value={seasonAvg.goals} accent />
        <StatChip label="Avg Fantasy" value={seasonAvg.fantasyScore} accent />
      </section>

      {/* Last Matchup Spotlight */}
      {vsOpponent.lastMatchup && (
        <section className="bg-[#111827] rounded-xl border border-[#3B82F6]/20 overflow-hidden">
          <div className="bg-[#3B82F6]/10 px-4 py-2 border-b border-[#3B82F6]/20 flex justify-between items-center">
            <span className="text-[10px] font-black text-[#3B82F6] uppercase tracking-widest">
              Last Matchup vs {opponent}
            </span>
            <span className="text-[10px] text-[#6B7280] font-mono">{vsOpponent.lastMatchup.date}</span>
          </div>
          <div className="p-4 flex items-center justify-around bg-gradient-to-br from-transparent to-[#3B82F6]/5">
            <div className="text-center">
              <div className="text-2xl font-black text-white tabular-nums">{vsOpponent.lastMatchup.disposals}</div>
              <div className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest mt-1">Disposals</div>
            </div>
            <div className="w-px h-10 bg-white/5" />
            <div className="text-center">
              <div className="text-2xl font-black text-[#22C55E] tabular-nums">{vsOpponent.lastMatchup.goals}</div>
              <div className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest mt-1">Goals</div>
            </div>
            <div className="w-px h-10 bg-white/5" />
            <div className="text-center">
              <div className="text-2xl font-black text-[#3B82F6] tabular-nums">
                {Math.round(vsOpponent.lastMatchup.fantasyScore || 0)}
              </div>
              <div className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest mt-1">Fantasy</div>
            </div>
            <div className="w-px h-10 bg-white/5" />
            <div className="text-center">
              <div className="text-sm font-bold text-white uppercase">
                {vsOpponent.lastMatchup.positionPlayed || position}
              </div>
              <div className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest mt-1">Played</div>
            </div>
          </div>
        </section>
      )}

      {/* Season Split Performance */}
      <section className="grid grid-cols-2 gap-4">
        <SplitCard label="Disposals" h={homeAvg?.disposals || 0} a={awayAvg?.disposals || 0} />
        <SplitCard label="Fantasy" h={homeAvg?.fantasyScore || 0} a={awayAvg?.fantasyScore || 0} />
      </section>

      {/* Form Trends */}
      <section className="grid grid-cols-2 gap-4">
        <Sparkline values={disposalTrend} label="Disposals" />
        <Sparkline values={fantasyTrend} label="Fantasy" />
      </section>

      {/* Full Season Game Log */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-4 bg-[#3B82F6] rounded-sm" />
            Season Log
          </h3>
          <span className="text-[10px] text-[#4B5563] uppercase font-bold tracking-tight">
            Recent first · current season
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/[0.05] bg-white/[0.01]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] text-[#4B5563] uppercase tracking-widest border-b border-white/[0.08] bg-white/[0.02]">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 pr-2">Opponent</th>
                <th className="py-2.5 pr-2">Result</th>
                <th className="py-2.5 pr-2 text-center">Dis</th>
                <th className="py-2.5 pr-2 text-center">G</th>
                <th className="py-2.5 pr-2 text-center">T</th>
                <th className="py-2.5 pr-2 text-center">Pos</th>
                <th className="py-2.5 pr-3 text-center">Fan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {fullSeasonGames.map((g, i) => (
                <GameRow key={g.gameId ?? i} game={g} />
              ))}
              {fullSeasonGames.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[11px] text-[#4B5563] italic">
                    No games found for this season
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
