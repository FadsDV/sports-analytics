/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { EsportsMatch, EsportsTeam } from "@/lib/esports/types";
import CS2StatusBadge from "./CS2StatusBadge";
import { formatKickoff } from "@/lib/utils";

export default function CS2MatchCard({ match }: { match: EsportsMatch }) {
  const { homeTeam, awayTeam, score, status, scheduledAt, numberOfGames, tournament } = match;
  const showScore = status === "live" || status === "completed";

  return (
    <Link
      href={`/sports/cs2/match/${match.id}`}
      className="block bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 hover:border-[#3B82F6]/30 hover:bg-[#111827] transition-all group"
    >
      {/* Header: tournament · Bo */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[9px] text-[#374151] uppercase tracking-wider truncate flex-1">
          {tournament.leagueName ?? tournament.name}
          {tournament.serieName ? ` · ${tournament.serieName}` : ""}
          {" · "}Bo{numberOfGames}
        </span>
        <CS2StatusBadge status={status} />
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-2">
        <TeamSide team={homeTeam} side="left" />

        <div className="text-center shrink-0 min-w-[56px]">
          {showScore ? (
            <div className="text-xl font-black tabular-nums text-white leading-none">
              {score?.home ?? 0}
              <span className="text-[#1e293b] mx-0.5">–</span>
              {score?.away ?? 0}
            </div>
          ) : (
            <div>
              <div className="text-[10px] text-[#374151]">vs</div>
              {scheduledAt && (
                <div className="text-[10px] text-[#3B82F6] mt-0.5 whitespace-nowrap">
                  {formatKickoff(scheduledAt)}
                </div>
              )}
            </div>
          )}
        </div>

        <TeamSide team={awayTeam} side="right" />
      </div>
    </Link>
  );
}

function TeamSide({ team, side }: { team: EsportsTeam | null; side: "left" | "right" }) {
  const isRight = side === "right";
  return (
    <div className={`flex-1 flex items-center gap-2 min-w-0 ${isRight ? "flex-row-reverse" : ""}`}>
      <TeamLogo team={team} />
      <span className={`text-sm font-semibold text-white truncate ${isRight ? "text-right" : ""}`}>
        {team?.name ?? "TBD"}
      </span>
    </div>
  );
}

function TeamLogo({ team }: { team: EsportsTeam | null }) {
  if (team?.imageUrl) {
    return (
      <img
        src={team.imageUrl}
        alt=""
        className="w-7 h-7 object-contain shrink-0"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded bg-[#1e293b] flex items-center justify-center shrink-0">
      <span className="text-[8px] text-[#4B5563] font-bold">
        {team?.acronym?.slice(0, 3) ?? "TBD"}
      </span>
    </div>
  );
}
