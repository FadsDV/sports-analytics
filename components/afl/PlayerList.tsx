"use client";

import { useState } from "react";
import type { ESPNPlayer } from "@/lib/sports/espnPlayers";
import type { AFLPlayerAnalyticsResult } from "@/lib/sports/afl/players/types";
import PlayerDrawer from "./PlayerDrawer";
import PlayerAvatar from "./PlayerAvatar";
import { aflHeadshotUrl } from "@/lib/aflPlayerImage";

interface PlayerListProps {
  players: ESPNPlayer[];
  teamName: string;
  teamLogo?: string;
  teamEspnId: string;
  matchContext: "home" | "away";
  opponent: string;
}

export default function PlayerList({
  players,
  teamName,
  teamLogo,
  teamEspnId,
  matchContext,
  opponent,
}: PlayerListProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<ESPNPlayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerData, setDrawerData] = useState<AFLPlayerAnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contextLabel = matchContext === "home" ? "HOME record" : "AWAY record";

  async function handlePlayerClick(player: ESPNPlayer) {
    setSelectedPlayer(player);
    setLoading(true);
    setDrawerData(null);
    setError(null);

    try {
      const url = `/api/afl/player/${player.id}?homeAway=${matchContext}&opponent=${encodeURIComponent(opponent)}&teamId=${encodeURIComponent(teamEspnId)}&name=${encodeURIComponent(player.displayName)}&position=${encodeURIComponent(player.position)}&jersey=${encodeURIComponent(player.jersey ?? "")}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError("Could not load player data.");
        setLoading(false);
        return;
      }
      const data: AFLPlayerAnalyticsResult = await res.json();
      setDrawerData(data);
    } catch {
      setError("Failed to fetch player analytics.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setSelectedPlayer(null);
    setDrawerData(null);
    setError(null);
    setLoading(false);
  }

  return (
    <div className="min-w-0">
      {/* Team header */}
      <div className="flex items-center gap-1.5 mb-2">
        {teamLogo && (
          <img src={teamLogo} alt="" className="w-4 h-4 object-contain" />
        )}
        <span className="text-xs font-medium text-[#6B7280] truncate">{teamName}</span>
        <span className="ml-auto text-[10px] text-[#3B82F6] bg-[#3B82F6]/10 px-1.5 py-px rounded uppercase tracking-wide shrink-0">
          {contextLabel}
        </span>
      </div>

      {/* Player rows */}
      {players.map((player, i) => (
        <button
          key={player.id}
          onClick={() => handlePlayerClick(player)}
          className="w-full flex items-center gap-2 py-1.5 border-b border-white/[0.03] last:border-0 text-left hover:bg-white/[0.04] rounded px-1 transition-colors group"
        >
          {/* Jersey */}
          <span className="text-[#4B5563] w-5 text-center font-mono text-xs shrink-0">
            {player.jersey ?? i + 1}
          </span>

          {/* Headshot / initials */}
          <PlayerAvatar
            src={aflHeadshotUrl(player.id)}
            name={player.displayName}
            size={24}
          />

          {/* Name */}
          <span className="text-[#E5E7EB] flex-1 truncate text-xs group-hover:text-white transition-colors">
            {player.displayName}
          </span>

          {/* Position badge */}
          <span className="text-[10px] text-[#4B5563] bg-white/[0.04] px-1 py-px rounded shrink-0">
            {player.position}
          </span>
        </button>
      ))}

      {/* Drawer */}
      {selectedPlayer && (
        <>
          {loading && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 bg-black/60 z-40" />
              {/* Loading panel */}
              <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#111827] border-l border-white/[0.06] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[11px] text-[#6B7280]">
                    Loading {selectedPlayer.displayName}...
                  </p>
                </div>
              </div>
            </>
          )}
          {error && !loading && (
            <>
              <div className="fixed inset-0 bg-black/60 z-40" onClick={handleClose} />
              <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#111827] border-l border-white/[0.06] flex items-center justify-center">
                <div className="text-center px-6">
                  <p className="text-[#EF4444] text-sm mb-3">{error}</p>
                  <button
                    onClick={handleClose}
                    className="text-[11px] text-[#6B7280] hover:text-white transition-colors underline"
                  >
                    Close
                  </button>
                </div>
              </div>
            </>
          )}
          {drawerData && !loading && (
            <PlayerDrawer data={drawerData} onClose={handleClose} />
          )}
        </>
      )}
    </div>
  );
}
