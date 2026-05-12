/* eslint-disable @next/next/no-img-element */
import type { EsportsPlayer } from "@/lib/esports/types";

export default function CS2RosterRow({ player }: { player: EsportsPlayer }) {
  const fullName = [player.firstName, player.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#0d1827] last:border-0">
      {player.imageUrl ? (
        <img src={player.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-[#1e293b] flex items-center justify-center shrink-0">
          <span className="text-[10px] text-[#4B5563] font-bold">
            {player.handle.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{player.handle}</div>
        {fullName && (
          <div className="text-[10px] text-[#4B5563] truncate">{fullName}</div>
        )}
      </div>

      <div className="shrink-0 text-right flex flex-col items-end gap-0.5">
        {player.role && (
          <span className="text-[9px] text-[#374151] uppercase tracking-wider">{player.role}</span>
        )}
        {player.nationality && (
          <span className="text-[9px] text-[#4B5563]">{player.nationality}</span>
        )}
      </div>
    </div>
  );
}
