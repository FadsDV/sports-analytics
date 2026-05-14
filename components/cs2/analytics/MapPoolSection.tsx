import type { MapWinrate } from "@/lib/esports/analytics/types";
import { SectionCard } from "./SectionCard";
import { WinRateBar } from "./WinRateBar";

export function MapPoolSection({ mapWinrates }: { mapWinrates: MapWinrate[] }) {
  if (mapWinrates.length === 0) {
    return (
      <SectionCard label="Map Pool">
        <p className="text-xs text-[#374151]">
          Insufficient map sample — map-level data requires individual match detail endpoints.
        </p>
      </SectionCard>
    );
  }

  const sorted = [...mapWinrates].sort((a, b) => b.winRate - a.winRate);

  return (
    <SectionCard label="Map Pool">
      <div className="space-y-3">
        {sorted.map((m) => {
          const color =
            m.winRate >= 0.6 ? "green" : m.winRate <= 0.4 ? "red" : "blue";
          return (
            <WinRateBar
              key={m.mapName}
              label={m.mapName}
              winRate={m.winRate}
              played={m.totalPlayed}
              color={color}
            />
          );
        })}
      </div>
    </SectionCard>
  );
}
