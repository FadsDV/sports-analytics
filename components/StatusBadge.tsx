import { Game } from "@/lib/types";

type GameStatus = Game["status"];

export default function StatusBadge({
  status,
  liveMinute,
}: {
  status: GameStatus;
  liveMinute?: number;
}) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 live-dot" />
        LIVE {liveMinute != null ? `${liveMinute}'` : ""}
      </span>
    );
  }
  if (status === "finished") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-white/5 text-[#9CA3AF] border border-white/10">
        FT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20">
      Upcoming
    </span>
  );
}
