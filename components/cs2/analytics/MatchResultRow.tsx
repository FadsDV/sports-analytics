import type { FormEntry } from "@/lib/esports/analytics/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function MatchResultRow({ entry }: { entry: FormEntry }) {
  const isWin = entry.result === "W";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#0d1827] last:border-0">
      <span
        className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
          isWin
            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
            : "bg-red-500/15 text-red-400 border border-red-500/25"
        }`}
      >
        {entry.result}
      </span>
      <span className="text-xs text-white font-medium truncate flex-1">{entry.opponentName}</span>
      <span className="text-xs text-[#94a3b8] tabular-nums shrink-0">
        {entry.seriesScore.team}–{entry.seriesScore.opponent}
      </span>
      <span className="hidden sm:block text-[10px] text-[#374151] truncate w-28 text-right shrink-0">
        {entry.tournament}
      </span>
      <span className="text-[10px] text-[#4B5563] w-14 text-right shrink-0">
        {fmtDate(entry.date)}
      </span>
    </div>
  );
}
