import { BoxScore, Team } from "@/lib/types";

export default function BoxScoreTable({
  boxScore,
  homeTeam,
  awayTeam,
}: {
  boxScore: BoxScore;
  homeTeam: Team;
  awayTeam: Team;
}) {
  const sections = [
    { team: homeTeam, rows: boxScore.home },
    { team: awayTeam, rows: boxScore.away },
  ];

  return (
    <div className="space-y-5">
      {sections.map(({ team, rows }) => (
        <div key={team.name}>
          {/* Team label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base leading-none">{team.logo}</span>
            <span className="text-sm font-semibold text-gray-300">{team.name}</span>
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[340px]">
              <thead>
                <tr className="border-b border-[#1e293b]">
                  <th className="text-left py-1.5 pr-4 pl-1 text-xs font-medium text-gray-500">
                    Player
                  </th>
                  {boxScore.statHeaders.map((h) => (
                    <th
                      key={h}
                      className="text-right py-1.5 px-2 text-xs font-medium text-gray-500 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[#1e293b]/40 last:border-0 hover:bg-[#080e1c]/40 transition-colors"
                  >
                    <td className="py-2 pr-4 pl-1 font-medium text-white whitespace-nowrap">
                      {row.player}
                    </td>
                    {boxScore.statHeaders.map((h) => (
                      <td
                        key={h}
                        className="py-2 px-2 text-right text-gray-300 tabular-nums"
                      >
                        {row.stats[h] ?? "No data available"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
