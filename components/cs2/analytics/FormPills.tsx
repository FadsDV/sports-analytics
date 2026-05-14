import type { FormEntry } from "@/lib/esports/analytics/types";

export function FormPills({ entries, limit }: { entries: FormEntry[]; limit?: number }) {
  const shown = limit ? entries.slice(0, limit) : entries;
  return (
    <div className="flex gap-1 flex-wrap">
      {shown.map((e, i) => (
        <span
          key={`${e.matchId}-${i}`}
          title={`${e.result} vs ${e.opponentAcronym} — ${e.tournament}`}
          className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center cursor-default ${
            e.result === "W"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
              : "bg-red-500/15 text-red-400 border border-red-500/25"
          }`}
        >
          {e.result}
        </span>
      ))}
      {shown.length === 0 && (
        <span className="text-[10px] text-[#374151]">No data</span>
      )}
    </div>
  );
}
