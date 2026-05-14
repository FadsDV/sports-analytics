/* eslint-disable @next/next/no-img-element */
import type { AFLTeamAnalytics, AFLRecentGame } from "@/lib/sports/afl/analytics";
import type { Team } from "@/lib/types";

interface AFLTeamCardProps {
  team:      Team;
  analytics: AFLTeamAnalytics;
}

export default function AFLTeamCard({ team, analytics: an }: AFLTeamCardProps) {
  return (
    <div className="bg-[#0d1827] rounded-lg px-3 py-2.5">

      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-2">
        {team.logoUrl && (
          <img src={team.logoUrl} alt="" className="w-4 h-4 object-contain" />
        )}
        <span className="text-[10px] text-[#9CA3AF] font-medium">{team.shortName}</span>
        <span className="ml-auto text-[10px] text-[#6B7280] tabular-nums">
          {an.record.wins}W {an.record.losses}L
          {an.record.draws > 0 ? ` ${an.record.draws}D` : ""}
        </span>
      </div>

      {/* Form pills */}
      <div className="flex gap-1 mb-2">
        {an.form.map((r, i) => (
          <span
            key={i}
            className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${
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
      <div className="flex items-center gap-3 text-[10px] text-[#4B5563]">
        <span>
          <span className="text-white">{an.avgScored}</span> avg
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
  // Show oldest → newest left to right; use teamScore as the value
  const scores = [...games].reverse().map(g => g.teamScore);
  const margins = [...games].reverse().map(g => g.margin);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(max - min, 1);
  const W = 200, H = 28, pad = 3;
  const xStep = (W - pad * 2) / Math.max(scores.length - 1, 1);
  const pts = scores.map((s, i) => ({
    x: pad + i * xStep,
    y: H - pad - ((s - min) / range) * (H - pad * 2),
    win: margins[i] >= 0,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="mt-2 pt-2 border-t border-white/[0.04]">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
        <path d={line} fill="none" stroke="#3B82F6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5}
            fill={p.win ? "#22C55E" : "#EF4444"}
            stroke="#0d1827" strokeWidth={1}
          />
        ))}
      </svg>
      <div className="flex justify-between text-[8px] text-[#374151] mt-0.5 px-0.5">
        {[...games].reverse().map((g, i) => (
          <span key={i} className={g.margin >= 0 ? "text-[#22C55E]/60" : "text-[#EF4444]/60"}>
            {g.margin >= 0 ? "+" : ""}{g.margin}
          </span>
        ))}
      </div>
    </div>
  );
}

function RestIndicator({ days }: { days: number }) {
  const color =
    days <= 6  ? "text-[#EF4444]"   // short turnaround
    : days <= 8 ? "text-[#F59E0B]"  // normal
    : "text-[#22C55E]";              // well-rested

  return (
    <span>
      <span className={color}>{days}d</span>
      <span className="text-[#4B5563]"> rest</span>
    </span>
  );
}

function VenueSplit({ record }: { record: { wins: number; losses: number } }) {
  const total = record.wins + record.losses;
  const pct   = Math.round((record.wins / total) * 100);
  const color = pct >= 60 ? "text-[#22C55E]" : pct >= 40 ? "text-[#9CA3AF]" : "text-[#EF4444]";
  return (
    <span>
      <span className={color}>{record.wins}-{record.losses}</span>
      <span className="text-[#4B5563]"> venue</span>
    </span>
  );
}
