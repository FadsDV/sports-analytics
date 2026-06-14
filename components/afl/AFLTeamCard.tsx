/* eslint-disable @next/next/no-img-element */
import type { AFLTeamAnalytics, AFLRecentGame } from "@/lib/sports/afl/analytics";
import type { Team } from "@/lib/types";

interface AFLTeamCardProps {
  team:      Team;
  analytics: AFLTeamAnalytics;
}

export default function AFLTeamCard({ team, analytics: an }: AFLTeamCardProps) {
  return (
    <div className="bg-surface2 rounded-lg px-3 py-2.5">

      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-2">
        {team.logoUrl && (
          <img src={team.logoUrl} alt="" className="w-4 h-4 object-contain" />
        )}
        <span className="text-xs text-text-1 font-semibold">{team.shortName}</span>
        <span className="ml-auto text-xs text-text-2 tabular-nums">
          {an.record.wins}W {an.record.losses}L
          {an.record.draws > 0 ? ` ${an.record.draws}D` : ""}
        </span>
      </div>

      {/* Form pills */}
      <div className="flex gap-1 mb-2">
        {an.form.map((r, i) => (
          <span
            key={i}
            className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
              r === "W"
                ? "bg-[#22C55E]/20 text-[#22C55E]"
                : r === "L"
                ? "bg-[#EF4444]/20 text-[#EF4444]"
                : "bg-[#F59E0B]/20 text-[#F59E0B]"
            }`}
          >
            {r}
          </span>
        ))}
      </div>

      {/* Stats row: avg score · rest · streak */}
      <div className="flex items-center gap-3 text-xs text-text-2">
        <span>
          <span className="text-text-1">{an.avgScored}</span> avg
        </span>

        {an.daysRest != null && (
          <RestIndicator days={an.daysRest} />
        )}

        {an.streak.type && an.streak.count >= 2 && (
          <span className={an.streak.type === "W" ? "text-[#22C55E]" : "text-[#EF4444]"}>
            {an.streak.count}{an.streak.type}
          </span>
        )}

        {an.venueRecord && an.venueRecord.wins + an.venueRecord.losses >= 2 && (
          <VenueSplit record={an.venueRecord} />
        )}
      </div>

      {/* Form sparkline — last 5 game margins */}
      {an.last5.length >= 3 && <FormSparkline games={an.last5} />}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormSparkline({ games }: { games: AFLRecentGame[] }) {
  const ordered = [...games].reverse();
  const margins = ordered.map(g => g.margin);
  const absMax  = Math.max(...margins.map(Math.abs), 1);
  const MAX_BAR = 28; // max bar height (px) in each direction

  return (
    <div className="mt-2 pt-2 border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-[8px] uppercase tracking-widest text-text-2 opacity-60">Margin — last {games.length}</div>
        <div className="relative group">
          <span className="w-3.5 h-3.5 rounded-full border border-border flex items-center justify-center cursor-default text-[8px] font-bold text-text-2 leading-none hover:border-primary hover:text-primary transition-colors">?</span>
          <div className="absolute right-0 top-4 z-50 w-44 bg-surface2 border border-border rounded-lg p-2 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 text-[9px] text-text-2 leading-snug">
            Each bar = one game. Green = win, red = loss, orange = draw. Taller bar = bigger margin.
          </div>
        </div>
      </div>

      {/* Win/Draw bars — grow upward from midline */}
      <div className="flex gap-1" style={{ height: MAX_BAR + 12 }}>
        {margins.map((m, i) => {
          const isDraw = m === 0;
          const isWin  = m > 0;
          const showTop = isWin || isDraw;
          const barH  = showTop ? Math.max(Math.round((Math.abs(m) / absMax) * MAX_BAR), isDraw ? 4 : 3) : 0;
          const color  = isDraw ? { text: "#F59E0B", bg: "rgba(245,158,11,0.25)", border: "rgba(245,158,11,0.6)" }
                                : { text: "#22C55E", bg: "rgba(34,197,94,0.25)",  border: "rgba(34,197,94,0.6)"  };
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end">
              {showTop && (
                <span className="text-[11px] font-bold tabular-nums leading-none mb-0.5" style={{ color: color.text }}>
                  {isWin ? `+${m}` : "0"}
                </span>
              )}
              {showTop && (
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: isDraw ? 4 : barH, background: color.bg, borderTop: `2px solid ${color.border}` }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Midline */}
      <div className="h-px bg-white/10" />

      {/* Loss bars — grow downward from midline */}
      <div className="flex gap-1" style={{ height: MAX_BAR + 12 }}>
        {margins.map((m, i) => {
          const isLoss = m < 0;
          const barH   = isLoss ? Math.max(Math.round((Math.abs(m) / absMax) * MAX_BAR), 3) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-start">
              {isLoss && (
                <div
                  className="w-full rounded-b-sm"
                  style={{ height: barH, background: "rgba(239,68,68,0.25)", borderBottom: "2px solid rgba(239,68,68,0.6)" }}
                />
              )}
              {isLoss && (
                <span className="text-[11px] font-bold text-[#EF4444] tabular-nums leading-none mt-0.5">
                  {m}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RestIndicator({ days }: { days: number }) {
  const color =
    days <= 6  ? "text-[#EF4444]"
    : days <= 8 ? "text-[#F59E0B]"
    : "text-[#22C55E]";

  return (
    <span>
      <span className={color}>{days}d</span>
      <span className="text-text-2"> rest</span>
    </span>
  );
}

function VenueSplit({ record }: { record: { wins: number; losses: number } }) {
  const total = record.wins + record.losses;
  const pct   = Math.round((record.wins / total) * 100);
  const color = pct >= 60 ? "text-[#22C55E]" : pct >= 40 ? "text-text-2" : "text-[#EF4444]";
  return (
    <span>
      <span className={color}>{record.wins}-{record.losses}</span>
      <span className="text-text-2"> venue</span>
    </span>
  );
}
