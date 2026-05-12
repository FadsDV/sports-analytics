import type { CS2Map } from "@/lib/esports/types";

interface CS2MapScoreProps {
  maps:        CS2Map[];
  bestOf:      number;
  homeTeamId?: string;
  awayTeamId?: string;
}

export default function CS2MapScore({ maps, bestOf }: CS2MapScoreProps) {
  if (maps.length === 0) return null;

  return (
    <div>
      <div className="text-[9px] text-[#374151] uppercase tracking-wider mb-1.5">
        Maps · Bo{bestOf}
      </div>
      <div className="flex flex-col gap-0.5">
        {maps.map((map, i) => {
          const homeWon = map.completed && map.homeScore > map.awayScore;
          const awayWon = map.completed && map.awayScore > map.homeScore;
          return (
            <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
              <span className="text-[#374151] w-20 truncate shrink-0">{map.name}</span>
              <div className="flex items-center gap-1 tabular-nums">
                <span className={homeWon ? "text-white font-semibold" : "text-[#4B5563]"}>
                  {map.homeScore}
                </span>
                <span className="text-[#1e293b]">–</span>
                <span className={awayWon ? "text-white font-semibold" : "text-[#4B5563]"}>
                  {map.awayScore}
                </span>
              </div>
              {!map.completed && (
                <span className="text-[#1e293b] text-[8px]">●</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
