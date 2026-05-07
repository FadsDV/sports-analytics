"use client";

import type { AFLPlayerAnalyticsResult, AFLPlayerGame, AFLStatLine } from "@/lib/sports/afl/players/types";

interface PlayerDrawerProps {
  data: AFLPlayerAnalyticsResult;
  onClose: () => void;
}

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

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center bg-white/[0.04] rounded-lg px-3 py-2 min-w-[60px]">
      <span className="text-[10px] text-[#6B7280] uppercase tracking-wide">{label}</span>
      <span className="text-sm font-bold text-white tabular-nums">{fmt(value)}</span>
    </div>
  );
}

function GameRow({ game }: { game: AFLPlayerGame }) {
  const score =
    game.teamScore != null && game.oppScore != null
      ? `${game.teamScore}-${game.oppScore}`
      : "-";
  return (
    <tr className="border-b border-white/[0.04] last:border-0 text-[10px]">
      <td className="py-1.5 pr-2 text-[#6B7280] whitespace-nowrap">{game.date.slice(5)}</td>
      <td className="py-1.5 pr-2 text-[#9CA3AF] truncate max-w-[70px]">{game.opponent}</td>
      <td className="py-1.5 pr-2">
        <div className="flex items-center gap-1">
          <ResultBadge result={game.result} />
          <span className="text-[#4B5563] tabular-nums">{score}</span>
        </div>
      </td>
      <td className="py-1.5 pr-1.5 text-white tabular-nums text-center">{fmt(game.disposals, 0)}</td>
      <td className="py-1.5 pr-1.5 text-[#9CA3AF] tabular-nums text-center">{fmt(game.kicks, 0)}</td>
      <td className="py-1.5 pr-1.5 text-[#9CA3AF] tabular-nums text-center">{fmt(game.marks, 0)}</td>
      <td className="py-1.5 pr-1.5 text-[#9CA3AF] tabular-nums text-center">{fmt(game.tackles, 0)}</td>
      <td className="py-1.5 pr-1.5 text-[#9CA3AF] tabular-nums text-center">{fmt(game.goals, 0)}</td>
      <td className="py-1.5 text-[#3B82F6] tabular-nums text-center font-medium">{fmt(game.fantasyScore, 0)}</td>
    </tr>
  );
}

function SplitRow({ label, h, a }: { label: string; h: number; a: number }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0 text-[10px]">
      <span className="text-[#4B5563] w-16">{label}</span>
      <span className="text-white tabular-nums font-medium w-8 text-center">{fmt(h)}</span>
      <span className="text-[#9CA3AF] tabular-nums w-8 text-center">{fmt(a)}</span>
    </div>
  );
}

function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  if (values.length === 0) return null;
  const valid = values.filter((v): v is number => v != null);
  const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  const threshold = avg * 0.15; // 15% band around avg

  return (
    <div>
      <div className="text-[9px] text-[#4B5563] uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-end gap-0.5">
        {values.map((v, i) => {
          let color = "bg-[#374151]";
          if (v != null) {
            if (v >= avg + threshold) color = "bg-[#22C55E]";
            else if (v <= avg - threshold) color = "bg-[#EF4444]";
            else color = "bg-[#F59E0B]";
          }
          return (
            <div
              key={i}
              className={`w-[6px] h-[14px] rounded-sm ${color}`}
              title={v != null ? String(Math.round(v)) : "-"}
            />
          );
        })}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function PlayerDrawer({ data, onClose }: PlayerDrawerProps) {
  const {
    playerName,
    position,
    jersey,
    headshot,
    matchContext,
    opponent,
    seasonAvg,
    last5Context,
    vsOpponent,
    homeAvg,
    awayAvg,
    disposalTrend,
    goalTrend,
    tackleTrend,
    fantasyTrend,
  } = data;

  const contextLabel = matchContext === "home" ? "HOME record" : "AWAY record";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#111827] border-l border-white/[0.06] overflow-y-auto shadow-2xl transition-transform duration-300 translate-x-0">
        {/* Header */}
        <div className="sticky top-0 bg-[#111827] border-b border-white/[0.06] px-4 py-3 flex items-center gap-3 z-10">
          {headshot ? (
            <img
              src={headshot}
              alt={playerName}
              className="w-10 h-10 rounded-full object-cover bg-white/10"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#1F2937] flex items-center justify-center text-sm font-bold text-[#9CA3AF]">
              {initials(playerName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {jersey && (
                <span className="text-[10px] text-[#4B5563] font-mono">#{jersey}</span>
              )}
              <h2 className="text-sm font-bold text-white truncate">{playerName}</h2>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-[#6B7280] bg-white/[0.05] px-1.5 py-px rounded">
                {position}
              </span>
              <span className="text-[10px] text-[#3B82F6] bg-[#3B82F6]/10 px-1.5 py-px rounded uppercase tracking-wide">
                {contextLabel}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#6B7280] hover:text-white transition-colors p-1 rounded"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.354 3.646a.5.5 0 0 1 0 .708L8.707 8l3.647 3.646a.5.5 0 0 1-.708.708L8 8.707l-3.646 3.647a.5.5 0 0 1-.708-.708L7.293 8 3.646 4.354a.5.5 0 0 1 .708-.708L8 7.293l3.646-3.647a.5.5 0 0 1 .708 0z" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 space-y-5">
          {/* Season Averages */}
          <section>
            <h3 className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-2">
              Season Averages ({contextLabel})
            </h3>
            {seasonAvg.gamesCount > 0 ? (
              <div className="flex flex-wrap gap-2">
                <StatChip label="Dis" value={seasonAvg.disposals} />
                <StatChip label="Kicks" value={seasonAvg.kicks} />
                <StatChip label="HBalls" value={seasonAvg.handballs} />
                <StatChip label="Marks" value={seasonAvg.marks} />
                <StatChip label="Tackles" value={seasonAvg.tackles} />
                <StatChip label="Goals" value={seasonAvg.goals} />
                <StatChip label="Fantasy" value={seasonAvg.fantasyScore} />
              </div>
            ) : (
              <p className="text-[11px] text-[#4B5563]">No {matchContext} games found.</p>
            )}
          </section>

          {/* Last 5 Games */}
          {last5Context.length > 0 && (
            <section>
              <h3 className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-2">
                Last 5 {matchContext === "home" ? "Home" : "Away"} Games
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-[#374151] uppercase tracking-wide border-b border-white/[0.06]">
                      <th className="pb-1 pr-2">Date</th>
                      <th className="pb-1 pr-2">Opp</th>
                      <th className="pb-1 pr-2">Result</th>
                      <th className="pb-1 pr-1.5 text-center">Dis</th>
                      <th className="pb-1 pr-1.5 text-center">K</th>
                      <th className="pb-1 pr-1.5 text-center">M</th>
                      <th className="pb-1 pr-1.5 text-center">T</th>
                      <th className="pb-1 pr-1.5 text-center">G</th>
                      <th className="pb-1 text-center">Fan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last5Context.map((g, i) => (
                      <GameRow key={g.gameId ?? i} game={g} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Home/Away Split */}
          {(homeAvg || awayAvg) && (
            <section>
              <h3 className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-2">
                Home / Away Split
              </h3>
              <div className="flex items-center text-[9px] text-[#374151] uppercase tracking-wide mb-1 gap-2">
                <span className="w-16" />
                <span className="w-8 text-center text-white/40">Home</span>
                <span className="w-8 text-center text-[#9CA3AF]/40">Away</span>
              </div>
              {(
                [
                  ["Disposals", homeAvg?.disposals ?? 0, awayAvg?.disposals ?? 0],
                  ["Kicks", homeAvg?.kicks ?? 0, awayAvg?.kicks ?? 0],
                  ["Marks", homeAvg?.marks ?? 0, awayAvg?.marks ?? 0],
                  ["Tackles", homeAvg?.tackles ?? 0, awayAvg?.tackles ?? 0],
                  ["Goals", homeAvg?.goals ?? 0, awayAvg?.goals ?? 0],
                  ["Fantasy", homeAvg?.fantasyScore ?? 0, awayAvg?.fantasyScore ?? 0],
                ] as [string, number, number][]
              ).map(([label, h, a]) => (
                <SplitRow key={label} label={label} h={h} a={a} />
              ))}
            </section>
          )}

          {/* vs Opponent */}
          {vsOpponent.games.length > 0 && (
            <section>
              <h3 className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-2">
                vs {opponent}
              </h3>
              {vsOpponent.avg && (
                <div className="flex gap-2 mb-2">
                  <StatChip label="Dis" value={vsOpponent.avg.disposals} />
                  <StatChip label="Goals" value={vsOpponent.avg.goals} />
                  <StatChip label="Fantasy" value={vsOpponent.avg.fantasyScore} />
                  <div className="flex flex-col items-center bg-white/[0.04] rounded-lg px-3 py-2 min-w-[60px]">
                    <span className="text-[10px] text-[#6B7280] uppercase tracking-wide">Games</span>
                    <span className="text-sm font-bold text-white tabular-nums">
                      {vsOpponent.avg.gamesCount}
                    </span>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] text-[#374151] uppercase tracking-wide border-b border-white/[0.06]">
                      <th className="pb-1 pr-2">Date</th>
                      <th className="pb-1 pr-2">Res</th>
                      <th className="pb-1 pr-1.5 text-center">Dis</th>
                      <th className="pb-1 pr-1.5 text-center">G</th>
                      <th className="pb-1 pr-1.5 text-center">T</th>
                      <th className="pb-1 text-center">Fan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vsOpponent.games.map((g, i) => {
                      const score =
                        g.teamScore != null && g.oppScore != null
                          ? `${g.teamScore}-${g.oppScore}`
                          : "-";
                      return (
                        <tr
                          key={g.gameId ?? i}
                          className="border-b border-white/[0.04] last:border-0 text-[10px]"
                        >
                          <td className="py-1.5 pr-2 text-[#6B7280] whitespace-nowrap">{g.date.slice(5)}</td>
                          <td className="py-1.5 pr-2">
                            <div className="flex items-center gap-1">
                              <ResultBadge result={g.result} />
                              <span className="text-[#4B5563] tabular-nums">{score}</span>
                            </div>
                          </td>
                          <td className="py-1.5 pr-1.5 text-white tabular-nums text-center">{fmt(g.disposals, 0)}</td>
                          <td className="py-1.5 pr-1.5 text-[#9CA3AF] tabular-nums text-center">{fmt(g.goals, 0)}</td>
                          <td className="py-1.5 pr-1.5 text-[#9CA3AF] tabular-nums text-center">{fmt(g.tackles, 0)}</td>
                          <td className="py-1.5 text-[#3B82F6] tabular-nums text-center font-medium">{fmt(g.fantasyScore, 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Trends */}
          {(disposalTrend.length > 0 || fantasyTrend.length > 0) && (
            <section>
              <h3 className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-3">
                Trends (last 10 {matchContext} games)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {disposalTrend.length > 0 && (
                  <Sparkline values={disposalTrend} label="Disposals" />
                )}
                {fantasyTrend.length > 0 && (
                  <Sparkline values={fantasyTrend} label="Fantasy" />
                )}
                {goalTrend.length > 0 && (
                  <Sparkline values={goalTrend} label="Goals" />
                )}
                {tackleTrend.length > 0 && (
                  <Sparkline values={tackleTrend} label="Tackles" />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
