export function WinRateBar({
  label,
  winRate,
  played,
  color = "blue",
}: {
  label: string;
  winRate: number;
  played: number;
  color?: "blue" | "green" | "red";
}) {
  const pct = Math.round(winRate * 100);
  const barColor =
    color === "green"
      ? "bg-emerald-500"
      : color === "red"
      ? "bg-red-500"
      : "bg-[#3B82F6]";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#94a3b8] w-24 truncate shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-white tabular-nums w-10 text-right shrink-0">
        {pct}%
      </span>
      <span className="text-[10px] text-[#374151] tabular-nums w-8 text-right shrink-0">
        {played}g
      </span>
    </div>
  );
}
