import type { RosterStability } from "@/lib/esports/analytics/types";
import { SectionCard } from "./SectionCard";

export function RosterStabilitySection({ stability }: { stability: RosterStability }) {
  const scorePct = Math.round(stability.stabilityScore * 100);
  const scoreColor =
    scorePct >= 80 ? "text-emerald-400" : scorePct >= 55 ? "text-amber-400" : "text-red-400";

  return (
    <SectionCard label="Roster Stability">
      <div className="space-y-4">
        <div className="flex items-start gap-5">
          <div className="text-center shrink-0">
            <div className={`text-2xl font-black ${scoreColor}`}>{scorePct}%</div>
            <div className="text-[9px] text-[#374151] uppercase tracking-wider mt-0.5">
              Continuity
            </div>
          </div>
          <div className="space-y-0.5 text-xs text-[#94a3b8] pt-0.5">
            <div>
              <span className="text-white">{stability.unchanged.length}</span> core ·{" "}
              <span className={stability.added.length > 0 ? "text-amber-400" : "text-[#94a3b8]"}>
                {stability.added.length} new
              </span>{" "}
              ·{" "}
              <span className={stability.removed.length > 0 ? "text-red-400" : "text-[#94a3b8]"}>
                {stability.removed.length} out
              </span>
            </div>
            <div className="text-[10px] text-[#374151]">
              Based on last {stability.sampleSize} matches
            </div>
          </div>
        </div>

        {stability.currentRoster.length > 0 && (
          <div>
            {stability.currentRoster.map((p) => {
              const isNew = stability.added.includes(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 py-2 border-b border-[#0d1827] last:border-0"
                >
                  <div className="w-6 h-6 rounded-full bg-[#1e293b] flex items-center justify-center shrink-0">
                    <span className="text-[9px] text-[#4B5563] font-bold">
                      {p.handle.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-white font-medium flex-1 truncate">{p.handle}</span>
                  <span className="text-[10px] text-[#374151] tabular-nums shrink-0">
                    {p.matchesPlayed}g
                  </span>
                  {isNew ? (
                    <span className="text-[9px] text-amber-400 border border-amber-500/25 rounded px-1 shrink-0">
                      NEW
                    </span>
                  ) : (
                    <span className="text-[9px] text-[#374151] shrink-0">CORE</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {stability.removed.length > 0 && (
          <div className="pt-2 border-t border-[#1e293b]">
            <div className="text-[10px] text-[#374151] uppercase tracking-wider mb-2">
              Not in current squad
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stability.removed.map((id) => (
                <span
                  key={id}
                  className="text-[10px] text-red-400/60 border border-red-500/15 rounded px-1.5 py-0.5"
                >
                  {id.replace(/^[a-z]+\./, "")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
