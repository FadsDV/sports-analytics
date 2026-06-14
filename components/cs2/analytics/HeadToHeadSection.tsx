import type { HeadToHead, H2HEntry } from "@/lib/esports/analytics/types";
import { SectionCard } from "./SectionCard";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
}

export function HeadToHeadSection({
  h2h,
  homeTeamName,
  awayTeamName,
}: {
  h2h: HeadToHead;
  homeTeamName: string;
  awayTeamName: string;
}) {
  if (h2h.total === 0) {
    return (
      <SectionCard label="Head to Head">
        <p className="text-xs text-[#374151]">No historical meetings in current sample.</p>
      </SectionCard>
    );
  }

  const totalSeries = h2h.teamAWins + h2h.teamBWins;
  const homeBarPct = totalSeries > 0 ? (h2h.teamAWins / totalSeries) * 100 : 50;
  const awayBarPct = 100 - homeBarPct;
  const totalMapWins = h2h.teamAMapWins + h2h.teamBMapWins;

  return (
    <SectionCard label="Head to Head">
      <div className="space-y-4">
        {/* Win bar */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs font-semibold text-white truncate max-w-[45%]">{homeTeamName}</span>
            <span className="text-xs font-semibold text-white truncate max-w-[45%] text-right">{awayTeamName}</span>
          </div>
          <div className="flex gap-0.5 h-5 rounded overflow-hidden">
            <div
              className="bg-[#3B82F6] flex items-center justify-center text-[10px] font-bold text-white transition-all"
              style={{ width: `${homeBarPct}%` }}
            >
              {h2h.teamAWins}
            </div>
            <div
              className="bg-[#1e3a5f] flex items-center justify-center text-[10px] font-bold text-[#60a5fa] transition-all"
              style={{ width: `${awayBarPct}%` }}
            >
              {h2h.teamBWins}
            </div>
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-[#374151]">
            <span>{h2h.teamAWins} wins</span>
            <span>{h2h.total} meetings</span>
            <span>{h2h.teamBWins} wins</span>
          </div>
        </div>

        {/* Map differential */}
        {totalMapWins > 0 && (
          <div className="flex justify-between items-center py-2 border-t border-[#1e293b]">
            <span className="text-sm font-bold text-white">{h2h.teamAMapWins}</span>
            <span className="text-[10px] text-[#374151] uppercase tracking-wider">Map wins</span>
            <span className="text-sm font-bold text-white">{h2h.teamBMapWins}</span>
          </div>
        )}

        {/* Recent meetings */}
        <div className="border-t border-[#1e293b] pt-3">
          <div className="text-[10px] text-[#374151] uppercase tracking-wider mb-2">
            Recent meetings
          </div>
          {h2h.entries.slice(0, 5).map((entry) => (
            <H2HRow
              key={entry.matchId}
              entry={entry}
              teamAId={h2h.teamAId}
            />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function H2HRow({ entry, teamAId }: { entry: H2HEntry; teamAId: string }) {
  const aIsHome = entry.homeTeamId === teamAId;
  const score = aIsHome
    ? `${entry.seriesScore.home}–${entry.seriesScore.away}`
    : `${entry.seriesScore.away}–${entry.seriesScore.home}`;

  const aWon = entry.winnerId === teamAId;
  const resultLabel = entry.winnerId === undefined ? "—" : aWon ? "W" : "L";

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-[#0d1827] last:border-0">
      <span
        className={`text-[9px] font-bold w-4 shrink-0 ${
          resultLabel === "W"
            ? "text-emerald-400"
            : resultLabel === "L"
            ? "text-red-400"
            : "text-[#374151]"
        }`}
      >
        {resultLabel}
      </span>
      <span className="text-[10px] text-[#94a3b8] flex-1 truncate">{entry.tournament}</span>
      <span className="text-xs font-medium text-white tabular-nums shrink-0">{score}</span>
      <span className="text-[10px] text-[#374151] w-16 text-right shrink-0">
        {fmtDate(entry.date)}
      </span>
    </div>
  );
}
