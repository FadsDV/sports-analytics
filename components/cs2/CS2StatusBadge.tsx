import type { EsportsMatchStatus } from "@/lib/esports/types";

const LABELS: Record<EsportsMatchStatus, string> = {
  not_started: "Upcoming",
  live:        "LIVE",
  paused:      "PAUSED",
  completed:   "FT",
  cancelled:   "Cancelled",
  postponed:   "Postponed",
};

export default function CS2StatusBadge({ status }: { status: EsportsMatchStatus }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        LIVE
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-medium bg-white/5 text-[#4B5563] border border-white/5">
        FT
      </span>
    );
  }
  if (status === "cancelled" || status === "postponed") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
        {LABELS[status]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-medium bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20">
      Upcoming
    </span>
  );
}
