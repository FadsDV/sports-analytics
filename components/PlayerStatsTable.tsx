import { Player, Sport } from "@/lib/types";

// Friendly display names for common stat keys
const KEY_LABELS: Record<string, string> = {
  goals:         "Goals",
  assists:        "Assists",
  shots_pg:       "Shots/G",
  rating:         "Rating",
  tackles:        "Tackles",
  interceptions:  "Int.",
  aerials_won:    "Aerials",
  key_passes:     "Key Pass",
  dribbles:       "Dribbles",
  saves_pg:       "Saves/G",
  clean_sheets:   "CS",
  ppg:            "PPG",
  apg:            "APG",
  rpg:            "RPG",
  fg_pct:         "FG%",
  three_pct:      "3P%",
  pass_yds:       "Pass Yds",
  rush_yds:       "Rush Yds",
  tds:            "TDs",
  ints:           "INTs",
  receptions:     "Rec",
  rec_yds:        "Rec Yds",
  targets:        "Targets",
  rush_tds:       "Rush TDs",
  disposals_avg:  "Disp Avg",
  marks:          "Marks",
  hit_outs:       "Hit-Outs",
  rebound50:      "Reb 50",
};

export default function PlayerStatsTable({
  players,
}: {
  players: Player[];
  sport: Sport;
}) {
  // Collect all stat keys across all players
  const allKeys = Array.from(
    new Set(players.flatMap((p) => Object.keys(p.stats)))
  );

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[400px]">
        <thead>
          <tr className="border-b border-[#1e293b]">
            <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 pl-1">
              Player
            </th>
            <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500">Pos</th>
            {allKeys.map((k) => (
              <th
                key={k}
                className="text-right py-2 px-2 text-xs font-medium text-gray-500 whitespace-nowrap"
              >
                {KEY_LABELS[k] ?? k.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr
              key={i}
              className={`border-b border-[#1e293b]/50 last:border-0 ${
                p.injured ? "opacity-50" : ""
              }`}
            >
              <td className="py-2 pr-3 pl-1">
                <span className="font-medium text-white">{p.name}</span>
                {p.injured && (
                  <span className="ml-1.5 text-xs text-yellow-500" title={p.injuryNote ?? "Injured"}>
                    ⚠
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">{p.position}</td>
              {allKeys.map((k) => (
                <td key={k} className="py-2 px-2 text-right text-gray-300 tabular-nums">
                  {p.stats[k] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
