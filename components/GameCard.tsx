/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Game } from "@/lib/types";
import SportBadge from "./SportBadge";
import StatusBadge from "./StatusBadge";
import FormPills from "./FormPills";
import { formatKickoff } from "@/lib/utils";

export default function GameCard({ game }: { game: Game }) {
  const { homeTeam, awayTeam, score, status, liveMinute } = game;

  return (
    <Link
      href={`/game/${game.id}`}
      className="block bg-[#0f172a] border border-[#1e293b] rounded-xl p-3.5 hover:border-[#4361ee]/50 hover:bg-[#111827] transition-all group"
    >
      {/* Top row: badge + venue + status */}
      <div className="flex items-center gap-2 mb-3">
        <SportBadge sport={game.sport} />
        <span className="text-xs text-gray-600 truncate flex-1 hidden sm:block">{game.venue}</span>
        <div className="ml-auto">
          <StatusBadge status={status} liveMinute={liveMinute} />
        </div>
      </div>

      {/* Teams row */}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {homeTeam.logoUrl ? (
              <img src={homeTeam.logoUrl} alt={homeTeam.name} className="w-6 h-6 object-contain shrink-0" />
            ) : (
              <span className="text-base leading-none shrink-0">{homeTeam.logo}</span>
            )}
            <span className="font-semibold text-sm text-white truncate">{homeTeam.name}</span>
          </div>
          {homeTeam.form.length > 0 && <FormPills form={homeTeam.form} />}
        </div>

        {/* Score / time */}
        <div className="px-2 text-center shrink-0 min-w-[72px]">
          {status === "upcoming" ? (
            <div>
              <div className="text-gray-500 text-xs font-medium">vs</div>
              <div className="text-xs text-sky-400 mt-0.5 whitespace-nowrap">{formatKickoff(game.kickoff)}</div>
            </div>
          ) : (
            <div className="text-xl font-bold tracking-tight text-white tabular-nums">
              {score!.home}–{score!.away}
            </div>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 min-w-0 flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-sm text-white truncate">{awayTeam.name}</span>
            {awayTeam.logoUrl ? (
              <img src={awayTeam.logoUrl} alt={awayTeam.name} className="w-6 h-6 object-contain shrink-0" />
            ) : (
              <span className="text-base leading-none shrink-0">{awayTeam.logo}</span>
            )}
          </div>
          {awayTeam.form.length > 0 && <FormPills form={awayTeam.form} />}
        </div>
      </div>
    </Link>
  );
}
