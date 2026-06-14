import type { MapWinrate } from "@/lib/esports/analytics/types";

export function MapPoolComparison({
  homeMaps,
  awayMaps,
  homeTeamName,
  awayTeamName,
}: {
  homeMaps: MapWinrate[];
  awayMaps: MapWinrate[];
  homeTeamName: string;
  awayTeamName: string;
}) {
  if (homeMaps.length === 0 && awayMaps.length === 0) {
    return (
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1e293b]">
          <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest">
            Map Pool Comparison
          </span>
        </div>
        <div className="p-4">
          <p className="text-xs text-[#374151]">
            Insufficient map sample — map-level data requires individual match detail endpoints.
          </p>
        </div>
      </div>
    );
  }

  // Union of all maps, sorted alphabetically
  const homeNames = homeMaps.map((m) => m.mapName);
  const awayNames = awayMaps.map((m) => m.mapName);
  const combined = homeNames.concat(awayNames.filter((n) => homeNames.indexOf(n) === -1));
  const allMapNames = combined.slice().sort();

  const sharedMaps = allMapNames.filter(
    (name) => homeNames.indexOf(name) !== -1 && awayNames.indexOf(name) !== -1
  );

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#1e293b]">
        <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest">
          Map Pool Comparison
        </span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-[1fr_72px_72px] gap-2 mb-3 items-center">
          <div />
          <div className="text-[9px] text-[#374151] uppercase tracking-wider text-center truncate">
            {homeTeamName}
          </div>
          <div className="text-[9px] text-[#374151] uppercase tracking-wider text-center truncate">
            {awayTeamName}
          </div>
        </div>

        <div className="space-y-1">
          {allMapNames.map((mapName) => {
            const homeMap = homeMaps.find((m) => m.mapName === mapName);
            const awayMap = awayMaps.find((m) => m.mapName === mapName);
            const isShared = sharedMaps.indexOf(mapName) !== -1;

            return (
              <div
                key={mapName}
                className={`grid grid-cols-[1fr_72px_72px] gap-2 items-center py-1.5 rounded px-1 ${
                  isShared ? "bg-[#3B82F6]/5 border-l-2 border-[#3B82F6]/40" : ""
                }`}
              >
                <span
                  className={`text-xs truncate ${isShared ? "text-white" : "text-[#94a3b8]"}`}
                >
                  {mapName}
                </span>
                <MapCell map={homeMap} />
                <MapCell map={awayMap} />
              </div>
            );
          })}
        </div>

        {sharedMaps.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#1e293b]">
            <span className="text-[10px] text-[#374151]">
              Highlighted = played by both teams ({sharedMaps.length} shared)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function MapCell({ map }: { map: MapWinrate | undefined }) {
  if (!map) {
    return <div className="text-center text-[10px] text-[#374151]">—</div>;
  }
  const pct = Math.round(map.winRate * 100);
  const color =
    pct >= 60 ? "text-emerald-400" : pct <= 40 ? "text-red-400" : "text-[#94a3b8]";
  return (
    <div className="text-center">
      <span className={`text-xs font-medium tabular-nums ${color}`}>{pct}%</span>
      <span className="text-[9px] text-[#374151] ml-0.5">({map.totalPlayed})</span>
    </div>
  );
}
