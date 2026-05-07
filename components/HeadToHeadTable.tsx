import { H2HGame } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default function HeadToHeadTable({
  h2h,
  homeTeam,
  awayTeam,
}: {
  h2h: H2HGame[];
  homeTeam: string;
  awayTeam: string;
}) {
  const homeWins = h2h.filter((g) => g.winner === homeTeam).length;
  const awayWins = h2h.filter((g) => g.winner === awayTeam).length;
  const draws = h2h.filter((g) => g.winner === "Draw").length;

  // Short team names for display
  const homeShort = homeTeam.split(" ").slice(-1)[0];
  const awayShort = awayTeam.split(" ").slice(-1)[0];

  return (
    <div>
      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: homeShort + " Wins", value: homeWins, color: "text-white" },
          { label: "Draws",             value: draws,    color: "text-gray-300" },
          { label: awayShort + " Wins", value: awayWins, color: "text-white" },
        ].map((item) => (
          <div key={item.label} className="text-center bg-[#080e1c] rounded-lg py-2.5 border border-[#1e293b]">
            <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Game rows */}
      <div className="space-y-0">
        {h2h.map((game, i) => {
          const homeWon = game.winner === homeTeam;
          const awayWon = game.winner === awayTeam;
          const isDraw  = game.winner === "Draw";

          return (
            <Link
              key={i}
              href={game.gameId ? `/game/${game.gameId}` : "#"}
              className="flex items-center gap-2 py-2.5 border-b border-[#1e293b]/60 last:border-0 text-sm"
            >
              {/* Date */}
              <span className="text-xs text-gray-600 w-20 shrink-0 tabular-nums">
                {formatDate(game.date)}
              </span>
              <span className="text-[10px] text-gray-600 w-24 shrink-0 truncate">
                {game.venue ?? "Unknown"}
              </span>

              {/* Home team */}
              <span
                className={`flex-1 truncate font-medium text-right ${
                  homeWon ? "text-white" : "text-gray-500"
                }`}
              >
                {game.homeTeam.split(" ").slice(-1)[0]}
              </span>

              {/* Score */}
              <span
                className={`px-2 font-mono text-sm shrink-0 min-w-[56px] text-center ${
                  isDraw ? "text-gray-400" : homeWon ? "text-green-400" : "text-sky-400"
                }`}
              >
                {game.score}
              </span>

              {/* Away team */}
              <span
                className={`flex-1 truncate font-medium ${
                  awayWon ? "text-white" : "text-gray-500"
                }`}
              >
                {game.awayTeam.split(" ").slice(-1)[0]}
              </span>

              {/* Winner badge */}
              <span
                className={`text-xs px-1.5 py-0.5 rounded w-14 text-center shrink-0 ${
                  isDraw
                    ? "bg-gray-700/50 text-gray-400"
                    : homeWon
                    ? "bg-green-900/40 text-green-400"
                    : "bg-sky-900/40 text-sky-400"
                }`}
              >
                {isDraw
                  ? "Draw"
                  : game.winner.split(" ").slice(-1)[0]}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
